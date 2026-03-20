import { FastifyInstance } from 'fastify';
import { eq, and, desc, sql } from 'drizzle-orm';
import * as schema from '../data/schema.js';
import { NotFoundError } from '../errors/index.js';
import { GitReader } from '../integrations/git/git-reader.js';
import { TaskPatternService } from '../services/task-pattern-service.js';

export async function codeChangeRoutes(app: FastifyInstance) {
  // POST /api/code-changes/re-resolve — re-resolve authorMemberId for all code changes using current identity mappings
  app.post('/api/code-changes/re-resolve', async () => {
    const { MemberService } = await import('../services/member-service.js');
    const allChanges = await app.db
      .select({ id: schema.codeChange.id, authorRaw: schema.codeChange.authorRaw })
      .from(schema.codeChange)
      .all();

    let updated = 0;
    for (const change of allChanges) {
      if (!change.authorRaw) continue;
      const member = await MemberService.resolveAuthor(app.db, 'git', change.authorRaw);
      const memberId = member ? member.id : null;
      await app.db
        .update(schema.codeChange)
        .set({ authorMemberId: memberId })
        .where(eq(schema.codeChange.id, change.id));
      if (memberId) updated++;
    }

    return { total: allChanges.length, resolved: updated };
  });
  // GET /api/code-changes — list with filters
  app.get('/api/code-changes', async (request) => {
    const query = request.query as {
      projectId?: string;
      memberId?: string;
      status?: string;
      riskLevel?: string;
      limit?: string;
      offset?: string;
    };

    const limit = Math.min(parseInt(query.limit || '50', 10) || 50, 200);
    const offset = parseInt(query.offset || '0', 10) || 0;

    const conditions = [];
    if (query.projectId) {
      conditions.push(eq(schema.codeChange.projectId, query.projectId));
    }
    if (query.memberId) {
      conditions.push(eq(schema.codeChange.authorMemberId, query.memberId));
    }
    if (query.status) {
      conditions.push(eq(schema.codeChange.status, query.status));
    }
    if (query.riskLevel) {
      conditions.push(eq(schema.codeChange.aiRiskLevel, query.riskLevel));
    }

    const whereClause = conditions.length > 0
      ? and(...conditions)
      : undefined;

    const items = await app.db
      .select()
      .from(schema.codeChange)
      .where(whereClause)
      .orderBy(desc(schema.codeChange.authoredAt))
      .limit(limit)
      .offset(offset)
      .all();

    // Get total count for pagination
    const countResult = await app.db
      .select({ count: sql<number>`count(*)` })
      .from(schema.codeChange)
      .where(whereClause)
      .get();

    return {
      items,
      total: countResult?.count ?? 0,
      limit,
      offset,
    };
  });

  // GET /api/code-changes/:id — detail with task ID detection
  app.get('/api/code-changes/:id', async (request) => {
    const { id } = request.params as { id: string };

    const change = await app.db
      .select()
      .from(schema.codeChange)
      .where(eq(schema.codeChange.id, id))
      .get();

    if (!change) {
      throw new NotFoundError('CodeChange', id);
    }

    // Detect task IDs from title + body
    const patterns = await app.db
      .select()
      .from(schema.taskPattern)
      .where(eq(schema.taskPattern.projectId, change.projectId))
      .all();

    const searchText = [change.title, change.body].filter(Boolean).join(' ');
    const taskIds = TaskPatternService.detectTaskIds(searchText, patterns);

    return { ...change, taskIds };
  });

  // GET /api/code-changes/:id/diff — diff content
  app.get('/api/code-changes/:id/diff', async (request) => {
    const { id } = request.params as { id: string };

    const change = await app.db
      .select()
      .from(schema.codeChange)
      .where(eq(schema.codeChange.id, id))
      .get();

    if (!change) {
      throw new NotFoundError('CodeChange', id);
    }

    // Look up the repo to get the local path
    const repo = await app.db
      .select()
      .from(schema.repository)
      .where(eq(schema.repository.id, change.repoId))
      .get();

    if (!repo || !repo.localPath) {
      throw new NotFoundError('Repository', change.repoId);
    }

    const result = await GitReader.getDiffForAPI(repo.localPath, change.platformId);
    return result;
  });
}
