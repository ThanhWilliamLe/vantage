import { eq, and, desc, asc, gte, lte, ne, sql } from 'drizzle-orm';
import * as schema from '../data/schema.js';
import { isValidTransition } from '@twle/vantage-shared';
import type { ReviewStatus } from '@twle/vantage-shared';
import { NotFoundError, ValidationError } from '../errors/index.js';
import type { DrizzleDB } from '../data/db.js';

interface PendingQueueFilters {
  projectId?: string;
  memberId?: string;
  riskLevel?: string;
  limit?: number;
  offset?: number;
}

interface HistoryFilters {
  projectId?: string;
  memberId?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

interface BatchActionInput {
  ids: string[];
  action: 'review' | 'flag' | 'defer';
  notes?: string;
  flagReason?: string;
}

export const ReviewService = {
  async getPendingQueue(db: DrizzleDB, filters?: PendingQueueFilters) {
    const limit = Math.min(filters?.limit || 50, 200);
    const offset = filters?.offset || 0;

    const conditions = [eq(schema.codeChange.status, 'pending')];

    if (filters?.projectId) {
      conditions.push(eq(schema.codeChange.projectId, filters.projectId));
    }
    if (filters?.memberId) {
      conditions.push(eq(schema.codeChange.authorMemberId, filters.memberId));
    }
    if (filters?.riskLevel) {
      conditions.push(eq(schema.codeChange.aiRiskLevel, filters.riskLevel));
    }

    const whereClause = and(...conditions);

    const items = await db
      .select()
      .from(schema.codeChange)
      .where(whereClause)
      .orderBy(asc(schema.codeChange.authoredAt))
      .limit(limit)
      .offset(offset)
      .all();

    const countResult = await db
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
  },

  async getById(db: DrizzleDB, id: string) {
    const change = await db
      .select()
      .from(schema.codeChange)
      .where(eq(schema.codeChange.id, id))
      .get();

    if (!change) {
      throw new NotFoundError('CodeChange', id);
    }

    // Attach resolution hint if flagged
    let resolutionHint = false;
    if (change.status === 'flagged' || change.status === 'communicated') {
      resolutionHint = await ReviewService.getResolutionHint(db, change);
    }

    return { ...change, resolutionHint };
  },

  async review(db: DrizzleDB, id: string, notes?: string) {
    const change = await getCodeChangeOrThrow(db, id);
    validateTransition(change.status as ReviewStatus, 'reviewed');

    const now = new Date().toISOString();
    const updates: Record<string, unknown> = {
      status: 'reviewed',
      reviewedAt: now,
      updatedAt: now,
    };
    if (notes !== undefined) {
      updates.reviewNotes = notes;
    }

    await db.update(schema.codeChange).set(updates).where(eq(schema.codeChange.id, id));

    return { ...change, ...updates };
  },

  async flag(db: DrizzleDB, id: string, reason: string) {
    const change = await getCodeChangeOrThrow(db, id);
    validateTransition(change.status as ReviewStatus, 'flagged');

    if (!reason || reason.trim().length === 0) {
      throw new ValidationError('Flag reason is required', {
        field: 'reason',
      });
    }

    const now = new Date().toISOString();
    const updates = {
      status: 'flagged',
      flaggedAt: now,
      flagReason: reason,
      updatedAt: now,
    };

    await db.update(schema.codeChange).set(updates).where(eq(schema.codeChange.id, id));

    return { ...change, ...updates };
  },

  async defer(db: DrizzleDB, id: string) {
    const change = await getCodeChangeOrThrow(db, id);

    // Defer keeps the status as pending, so we only require status to be 'pending'
    if (change.status !== 'pending') {
      throw new ValidationError(
        `Cannot defer item with status '${change.status}'; only pending items can be deferred`,
        { field: 'status', expected: 'pending', received: change.status },
      );
    }

    const now = new Date().toISOString();
    const updates = {
      deferredAt: now,
      deferCount: change.deferCount + 1,
      updatedAt: now,
    };

    await db.update(schema.codeChange).set(updates).where(eq(schema.codeChange.id, id));

    return { ...change, ...updates };
  },

  async communicate(db: DrizzleDB, id: string) {
    const change = await getCodeChangeOrThrow(db, id);
    validateTransition(change.status as ReviewStatus, 'communicated');

    const now = new Date().toISOString();
    const updates = {
      status: 'communicated',
      communicatedAt: now,
      updatedAt: now,
    };

    await db.update(schema.codeChange).set(updates).where(eq(schema.codeChange.id, id));

    return { ...change, ...updates };
  },

  async resolve(db: DrizzleDB, id: string) {
    const change = await getCodeChangeOrThrow(db, id);
    validateTransition(change.status as ReviewStatus, 'resolved');

    const now = new Date().toISOString();
    const updates = {
      status: 'resolved',
      resolvedAt: now,
      updatedAt: now,
    };

    await db.update(schema.codeChange).set(updates).where(eq(schema.codeChange.id, id));

    return { ...change, ...updates };
  },

  async unflagReview(db: DrizzleDB, id: string, notes?: string) {
    const change = await getCodeChangeOrThrow(db, id);
    validateTransition(change.status as ReviewStatus, 'reviewed');

    const now = new Date().toISOString();
    const updates: Record<string, unknown> = {
      status: 'reviewed',
      reviewedAt: now,
      updatedAt: now,
    };
    if (notes !== undefined) {
      updates.reviewNotes = notes;
    }

    await db.update(schema.codeChange).set(updates).where(eq(schema.codeChange.id, id));

    return { ...change, ...updates };
  },

  async batchAction(db: DrizzleDB, input: BatchActionInput) {
    const { ids, action, notes, flagReason } = input;

    if (!ids || ids.length === 0) {
      throw new ValidationError('At least one ID is required for batch action', {
        field: 'ids',
      });
    }

    if (action === 'flag' && (!flagReason || flagReason.trim().length === 0)) {
      throw new ValidationError('Flag reason is required for batch flag action', {
        field: 'flagReason',
      });
    }

    // Phase 1: Validate ALL items first
    const changes: Array<typeof schema.codeChange.$inferSelect> = [];
    for (const id of ids) {
      const change = await db
        .select()
        .from(schema.codeChange)
        .where(eq(schema.codeChange.id, id))
        .get();

      if (!change) {
        throw new NotFoundError('CodeChange', id);
      }

      // Validate the transition for this item
      if (action === 'review') {
        validateTransition(change.status as ReviewStatus, 'reviewed');
      } else if (action === 'flag') {
        validateTransition(change.status as ReviewStatus, 'flagged');
      } else if (action === 'defer') {
        if (change.status !== 'pending') {
          throw new ValidationError(
            `Cannot defer item '${id}' with status '${change.status}'; only pending items can be deferred`,
            { field: 'status', expected: 'pending', received: change.status },
          );
        }
      }

      changes.push(change);
    }

    // Phase 2: Apply all within a single SQLite transaction
    const now = new Date().toISOString();
    const results: Array<Record<string, unknown>> = [];

    const transaction = db.$client.transaction(() => {
      for (let i = 0; i < changes.length; i++) {
        const change = changes[i];

        if (action === 'review') {
          const updates: Record<string, unknown> = {
            status: 'reviewed',
            reviewed_at: now,
            updated_at: now,
          };
          if (notes !== undefined) {
            updates.review_notes = notes;
          }
          db.$client
            .prepare(
              `UPDATE code_change SET status = ?, reviewed_at = ?, updated_at = ?${notes !== undefined ? ', review_notes = ?' : ''} WHERE id = ?`,
            )
            .run(...['reviewed', now, now, ...(notes !== undefined ? [notes] : []), change.id]);
          results.push({
            ...change,
            status: 'reviewed',
            reviewedAt: now,
            updatedAt: now,
            ...(notes !== undefined ? { reviewNotes: notes } : {}),
          });
        } else if (action === 'flag') {
          db.$client
            .prepare(
              'UPDATE code_change SET status = ?, flagged_at = ?, flag_reason = ?, updated_at = ? WHERE id = ?',
            )
            .run('flagged', now, flagReason!, now, change.id);
          results.push({
            ...change,
            status: 'flagged',
            flaggedAt: now,
            flagReason: flagReason!,
            updatedAt: now,
          });
        } else if (action === 'defer') {
          db.$client
            .prepare(
              'UPDATE code_change SET deferred_at = ?, defer_count = defer_count + 1, updated_at = ? WHERE id = ?',
            )
            .run(now, now, change.id);
          results.push({
            ...change,
            deferredAt: now,
            deferCount: change.deferCount + 1,
            updatedAt: now,
          });
        }
      }
    });

    transaction();

    return results;
  },

  async aggregateReview(db: DrizzleDB, ids: string[], notes?: string) {
    if (!ids || ids.length === 0) {
      throw new ValidationError('At least one ID is required', { field: 'ids' });
    }

    // Validate all items exist and are pending
    const changes: Array<typeof schema.codeChange.$inferSelect> = [];
    for (const id of ids) {
      const change = await db
        .select()
        .from(schema.codeChange)
        .where(eq(schema.codeChange.id, id))
        .get();
      if (!change) throw new NotFoundError('CodeChange', id);
      if (change.status !== 'pending') {
        throw new ValidationError(
          `Cannot aggregate-review item '${id}' with status '${change.status}'; only pending items`,
          { field: 'status', expected: 'pending', received: change.status },
        );
      }
      changes.push(change);
    }

    const now = new Date().toISOString();
    const aggregateNotes = notes
      ? `[Aggregated review of ${ids.length} commits] ${notes}`
      : `[Aggregated review of ${ids.length} commits]`;

    // Mark all as reviewed in a transaction
    const transaction = db.$client.transaction(() => {
      for (const change of changes) {
        db.$client
          .prepare(
            'UPDATE code_change SET status = ?, reviewed_at = ?, review_notes = ?, updated_at = ? WHERE id = ?',
          )
          .run('reviewed', now, aggregateNotes, now, change.id);
      }
    });
    transaction();

    return {
      reviewedCount: changes.length,
      reviewedIds: ids,
      notes: aggregateNotes,
      reviewedAt: now,
    };
  },

  async clearReview(db: DrizzleDB, id: string) {
    const change = await getCodeChangeOrThrow(db, id);
    if (
      change.status !== 'reviewed' &&
      change.status !== 'flagged' &&
      change.status !== 'communicated' &&
      change.status !== 'resolved'
    ) {
      throw new ValidationError('Can only clear review on non-pending items', { field: 'status' });
    }

    const now = new Date().toISOString();
    const updates = {
      status: 'pending',
      reviewedAt: null,
      flaggedAt: null,
      flagReason: null,
      communicatedAt: null,
      resolvedAt: null,
      deferredAt: null,
      updatedAt: now,
      // Keep reviewNotes as draft
    };

    await db.update(schema.codeChange).set(updates).where(eq(schema.codeChange.id, id));
    return { ...change, ...updates };
  },

  async getHistory(db: DrizzleDB, filters?: HistoryFilters) {
    const limit = Math.min(filters?.limit || 50, 200);
    const offset = filters?.offset || 0;

    // History shows non-pending items
    const conditions = [ne(schema.codeChange.status, 'pending')];

    if (filters?.projectId) {
      conditions.push(eq(schema.codeChange.projectId, filters.projectId));
    }
    if (filters?.memberId) {
      conditions.push(eq(schema.codeChange.authorMemberId, filters.memberId));
    }
    if (filters?.status) {
      conditions.push(eq(schema.codeChange.status, filters.status));
    }
    if (filters?.startDate) {
      conditions.push(gte(schema.codeChange.authoredAt, filters.startDate));
    }
    if (filters?.endDate) {
      conditions.push(lte(schema.codeChange.authoredAt, filters.endDate));
    }

    const whereClause = and(...conditions);

    const items = await db
      .select()
      .from(schema.codeChange)
      .where(whereClause)
      .orderBy(desc(schema.codeChange.authoredAt))
      .limit(limit)
      .offset(offset)
      .all();

    const countResult = await db
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
  },

  async getResolutionHint(
    db: DrizzleDB,
    codeChange: {
      id: string;
      projectId: string;
      branch: string | null;
      flaggedAt: string | null;
    },
  ): Promise<boolean> {
    if (!codeChange.branch || !codeChange.flaggedAt) {
      return false;
    }

    const newerCommit = await db
      .select({ id: schema.codeChange.id })
      .from(schema.codeChange)
      .where(
        and(
          eq(schema.codeChange.projectId, codeChange.projectId),
          eq(schema.codeChange.branch, codeChange.branch),
          gte(schema.codeChange.authoredAt, codeChange.flaggedAt),
          ne(schema.codeChange.id, codeChange.id),
        ),
      )
      .limit(1)
      .get();

    return !!newerCommit;
  },
};

async function getCodeChangeOrThrow(db: DrizzleDB, id: string) {
  const change = await db
    .select()
    .from(schema.codeChange)
    .where(eq(schema.codeChange.id, id))
    .get();

  if (!change) {
    throw new NotFoundError('CodeChange', id);
  }

  return change;
}

function validateTransition(from: ReviewStatus, to: ReviewStatus) {
  if (!isValidTransition(from, to)) {
    throw new ValidationError(`Invalid status transition from '${from}' to '${to}'`, {
      field: 'status',
      expected: `valid transition from '${from}'`,
      received: to,
    });
  }
}
