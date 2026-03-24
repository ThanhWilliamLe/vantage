import { FastifyInstance } from 'fastify';
import { eq, and, desc, sql } from 'drizzle-orm';
import * as schema from '../data/schema.js';
import { NotFoundError, ValidationError } from '../errors/index.js';
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
  // GET /api/code-changes/unmapped-authors?platform=email — distinct unmapped author identities
  app.get('/api/code-changes/unmapped-authors', async (request) => {
    const { platform } = request.query as { platform?: string };

    let query: string;
    if (platform === 'email') {
      // Return distinct author emails (authorRaw contains @) that are not mapped to any member
      query = `
        SELECT author_raw AS value, COUNT(*) AS commit_count
        FROM code_change
        WHERE author_member_id IS NULL AND author_raw LIKE '%@%'
        GROUP BY author_raw
        ORDER BY commit_count DESC
        LIMIT 100
      `;
    } else {
      // Return distinct authorRaw values not mapped
      query = `
        SELECT author_raw AS value, COUNT(*) AS commit_count
        FROM code_change
        WHERE author_member_id IS NULL
        GROUP BY author_raw
        ORDER BY commit_count DESC
        LIMIT 100
      `;
    }

    const rows = app.db.$client.prepare(query).all() as Array<{
      value: string;
      commit_count: number;
    }>;
    return rows.map((r) => ({ value: r.value, commitCount: r.commit_count }));
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

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

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

  // GET /api/code-changes/aggregate-diff?ids=id1,id2,id3
  app.get('/api/code-changes/aggregate-diff', async (request) => {
    const { ids: idsParam } = request.query as { ids?: string };
    if (!idsParam) {
      throw new ValidationError('ids query parameter is required');
    }

    const ids = idsParam.split(',').filter(Boolean);
    if (ids.length === 0) {
      throw new ValidationError('At least one ID is required');
    }
    if (ids.length > 50) {
      throw new ValidationError('Maximum 50 IDs allowed per aggregate diff request');
    }

    const diffs: string[] = [];
    let truncated = false;
    let totalSize = 0;
    const MAX_SIZE = 500000;

    for (const id of ids) {
      if (totalSize >= MAX_SIZE) {
        truncated = true;
        break;
      }

      const change = await app.db
        .select()
        .from(schema.codeChange)
        .where(eq(schema.codeChange.id, id))
        .get();

      if (!change) continue;

      // Validate platformId is a safe git ref (hex hash)
      if (!/^[0-9a-f]{7,40}$/i.test(change.platformId)) continue;

      const repo = await app.db
        .select()
        .from(schema.repository)
        .where(eq(schema.repository.id, change.repoId))
        .get();

      if (!repo?.localPath) continue;

      try {
        const { default: simpleGit } = await import('simple-git');
        const git = simpleGit(repo.localPath);
        const diff = await git.diff([`${change.platformId}^..${change.platformId}`]);
        if (diff) {
          const entry = `# Commit: ${change.title}\n# Author: ${change.authorName || change.authorRaw}\n${diff}`;
          diffs.push(entry);
          totalSize += entry.length;
        }
      } catch {
        // Skip commits with diff errors
      }
    }

    const combined = diffs.join('\n');

    return {
      diff: truncated ? combined.substring(0, MAX_SIZE) : combined,
      truncated,
      commitCount: ids.length,
    };
  });
}
