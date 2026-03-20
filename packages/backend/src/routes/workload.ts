import { FastifyInstance } from 'fastify';
import { sql, and, gte, lte } from 'drizzle-orm';
import * as schema from '../data/schema.js';
import { ValidationError } from '../errors/index.js';

export async function workloadRoutes(app: FastifyInstance) {
  // GET /api/workload — commit-volume by member and project
  app.get('/api/workload', async (request) => {
    const query = request.query as {
      startDate?: string;
      endDate?: string;
    };

    if (!query.startDate || !query.endDate) {
      throw new ValidationError('startDate and endDate are required', {
        field: 'startDate,endDate',
      });
    }

    const conditions = [
      gte(schema.codeChange.authoredAt, query.startDate),
      lte(schema.codeChange.authoredAt, query.endDate),
    ];

    // Aggregate by member — include authorName for unresolved members
    const byMember = await app.db
      .select({
        memberId: schema.codeChange.authorMemberId,
        authorName: sql<string | null>`min(${schema.codeChange.authorName})`,
        commitCount: sql<number>`count(*)`,
        linesAdded: sql<number>`sum(${schema.codeChange.linesAdded})`,
        linesDeleted: sql<number>`sum(${schema.codeChange.linesDeleted})`,
        filesChanged: sql<number>`sum(${schema.codeChange.filesChanged})`,
      })
      .from(schema.codeChange)
      .where(and(...conditions))
      .groupBy(schema.codeChange.authorMemberId)
      .all();

    // Aggregate by project
    const byProject = await app.db
      .select({
        projectId: schema.codeChange.projectId,
        commitCount: sql<number>`count(*)`,
        linesAdded: sql<number>`sum(${schema.codeChange.linesAdded})`,
        linesDeleted: sql<number>`sum(${schema.codeChange.linesDeleted})`,
        filesChanged: sql<number>`sum(${schema.codeChange.filesChanged})`,
      })
      .from(schema.codeChange)
      .where(and(...conditions))
      .groupBy(schema.codeChange.projectId)
      .all();

    return {
      startDate: query.startDate,
      endDate: query.endDate,
      byMember,
      byProject,
    };
  });
}
