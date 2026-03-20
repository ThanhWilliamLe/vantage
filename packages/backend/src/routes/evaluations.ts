import { FastifyInstance } from 'fastify';
import { eq, and, gte, lte } from 'drizzle-orm';
import * as schema from '../data/schema.js';
import { EvaluationService } from '../services/evaluation-service.js';
import { ExportService } from '../services/export-service.js';
import { AIProviderService } from '../services/ai-provider-service.js';
import { decrypt } from '../crypto/index.js';
import { APIProvider } from '../integrations/ai/api-provider.js';
import { CLIProvider } from '../integrations/ai/cli-provider.js';
import {
  extractJSON,
  parseDailyPrefillResponse,
  parseQuarterlySynthesisResponse,
} from '../services/ai/parsers.js';
import { buildDailyPrefillPrompt, buildQuarterlySynthesisPrompt } from '../services/ai/prompts.js';
import type { AIProviderInterface } from '../integrations/ai/ai-provider.js';
import type { DailyEntry, QuarterlyEntry } from '../services/ai/prompts.js';

async function getProvider(app: FastifyInstance): Promise<AIProviderInterface | null> {
  const config = await AIProviderService.getActive(app.db);
  if (!config) return null;
  if (config.type === 'api' && config.endpointUrl && config.apiKeyEncrypted && config.model) {
    const apiKey = decrypt(config.apiKeyEncrypted, app.encryptionKey);
    return new APIProvider({
      endpointUrl: config.endpointUrl,
      apiKey,
      model: config.model,
      preset: (config.preset as 'openai' | 'anthropic') || 'openai',
    });
  }
  if (config.type === 'cli' && config.cliCommand) {
    return new CLIProvider({
      command: config.cliCommand,
      args: config.cliIoMethod === 'stdin' ? ['-p'] : [],
    });
  }
  return null;
}

export async function evaluationRoutes(app: FastifyInstance) {
  // GET /api/evaluations/daily-prefill — AI pre-fill for daily check-ups
  // Must be registered before the parameterized :id route
  app.get('/api/evaluations/daily-prefill', async (request) => {
    const query = request.query as { date?: string; memberId?: string };
    if (!query.date || !query.memberId) {
      return { description: '', workloadScore: null };
    }

    const provider = await getProvider(app);
    if (!provider) {
      return { description: '', workloadScore: null };
    }

    // Get today's code changes for this member
    const dayStart = `${query.date}T00:00:00.000Z`;
    const dayEnd = `${query.date}T23:59:59.999Z`;
    const changes = await app.db
      .select({
        title: schema.codeChange.title,
        aiCategory: schema.codeChange.aiCategory,
        aiSummary: schema.codeChange.aiSummary,
        reviewNotes: schema.codeChange.reviewNotes,
        linesAdded: schema.codeChange.linesAdded,
        linesDeleted: schema.codeChange.linesDeleted,
        projectId: schema.codeChange.projectId,
      })
      .from(schema.codeChange)
      .where(
        and(
          eq(schema.codeChange.authorMemberId, query.memberId),
          gte(schema.codeChange.authoredAt, dayStart),
          lte(schema.codeChange.authoredAt, dayEnd),
        ),
      )
      .all();

    if (changes.length === 0) {
      return { description: '', workloadScore: null };
    }

    // Resolve project names
    const projects = await app.db.select().from(schema.project).all();
    const projectMap = new Map(projects.map((p) => [p.id, p.name]));

    const entries: DailyEntry[] = changes.map((c) => ({
      projectName: projectMap.get(c.projectId) ?? 'Unknown',
      title: c.title,
      aiCategory: c.aiCategory,
      aiSummary: c.aiSummary,
      reviewNotes: c.reviewNotes,
      linesAdded: c.linesAdded,
      linesDeleted: c.linesDeleted,
    }));

    try {
      const prompt = buildDailyPrefillPrompt(entries);
      const raw = await provider.generate(prompt);
      const json = extractJSON(raw);
      return parseDailyPrefillResponse(json);
    } catch {
      return { description: '', workloadScore: null };
    }
  });

  // GET /api/evaluations/quarterly-synthesis — AI synthesis for quarterly evaluations
  app.get('/api/evaluations/quarterly-synthesis', async (request) => {
    const query = request.query as { quarter?: string; memberId?: string };
    if (!query.quarter || !query.memberId) {
      return { description: '', workloadScore: null, insights: [] };
    }

    const provider = await getProvider(app);
    if (!provider) {
      return { description: '', workloadScore: null, insights: [] };
    }

    const data = await EvaluationService.getQuarterlyData(app.db, query.quarter, [query.memberId]);

    if (data.dailyEntries.length === 0) {
      return { description: '', workloadScore: null, insights: [] };
    }

    // Resolve project names for each entry
    const projects = await app.db.select().from(schema.project).all();
    const projectMap = new Map(projects.map((p) => [p.id, p.name]));

    const entries: QuarterlyEntry[] = data.dailyEntries.map((e) => ({
      date: e.date ?? '',
      projectNames: (Array.isArray(e.projectIds) ? e.projectIds : []).map(
        (pid: string) => projectMap.get(pid) ?? 'Unknown',
      ),
      description: e.description ?? '',
      workloadScore: e.workloadScore as number | null,
      notes: e.notes ?? null,
    }));

    try {
      const prompt = buildQuarterlySynthesisPrompt(entries);
      const raw = await provider.generate(prompt);
      const json = extractJSON(raw);
      return parseQuarterlySynthesisResponse(json);
    } catch {
      return { description: '', workloadScore: null, insights: [] };
    }
  });

  // GET /api/evaluations/export — CSV download
  app.get('/api/evaluations/export', async (request, reply) => {
    const query = request.query as {
      memberId?: string;
      type?: string;
      startDate?: string;
      endDate?: string;
    };

    const csv = await ExportService.exportEvaluations(app.db, {
      memberId: query.memberId,
      type: query.type,
      startDate: query.startDate,
      endDate: query.endDate,
    });

    reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', 'attachment; filename="evaluations.csv"')
      .send(csv);
  });

  // POST /api/evaluations — create daily or quarterly
  app.post('/api/evaluations', async (request) => {
    const body = request.body as {
      type: string;
      memberId: string;
      date?: string;
      quarter?: string;
      projectIds: string[];
      description?: string;
      workloadScore?: number;
      notes?: string;
      aiInsights?: unknown;
    };

    if (body.type === 'quarterly') {
      const result = await EvaluationService.createQuarterly(app.db, {
        memberId: body.memberId,
        quarter: body.quarter!,
        projectIds: body.projectIds,
        description: body.description,
        workloadScore: body.workloadScore,
        notes: body.notes,
        aiInsights: body.aiInsights,
      });
      return result;
    }

    // Default: daily
    const result = await EvaluationService.createDaily(app.db, {
      memberId: body.memberId,
      date: body.date!,
      projectIds: body.projectIds,
      description: body.description,
      workloadScore: body.workloadScore,
      notes: body.notes,
    });
    return result;
  });

  // GET /api/evaluations — list with filters
  app.get('/api/evaluations', async (request) => {
    const query = request.query as {
      memberId?: string;
      type?: string;
      startDate?: string;
      endDate?: string;
      limit?: string;
      offset?: string;
    };

    const result = await EvaluationService.listDaily(app.db, {
      memberId: query.memberId,
      type: query.type,
      startDate: query.startDate,
      endDate: query.endDate,
      limit: query.limit ? parseInt(query.limit, 10) : undefined,
      offset: query.offset ? parseInt(query.offset, 10) : undefined,
    });

    return result;
  });

  // GET /api/evaluations/:id — get by ID
  app.get('/api/evaluations/:id', async (request) => {
    const { id } = request.params as { id: string };
    const result = await EvaluationService.getById(app.db, id);
    return result;
  });

  // PUT /api/evaluations/:id — update
  app.put('/api/evaluations/:id', async (request) => {
    const { id } = request.params as { id: string };
    const body = request.body as {
      description?: string;
      workloadScore?: number;
      notes?: string;
      projectIds?: string[];
      aiInsights?: unknown;
    };

    const result = await EvaluationService.updateDaily(app.db, id, body);
    return result;
  });

  // DELETE /api/evaluations/:id — delete
  app.delete('/api/evaluations/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    await EvaluationService.deleteDaily(app.db, id);
    reply.status(204).send();
  });
}
