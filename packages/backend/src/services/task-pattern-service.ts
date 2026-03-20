import { eq } from 'drizzle-orm';
import { ulid } from 'ulid';
import * as schema from '../data/schema.js';
import { NotFoundError, ValidationError } from '../errors/index.js';
import type { DrizzleDB } from '../data/db.js';

export interface DetectedTask {
  taskId: string;
  url: string;
}

export const TaskPatternService = {
  async create(
    db: DrizzleDB,
    input: { projectId: string; regex: string; urlTemplate: string },
  ) {
    // Verify project exists
    const proj = await db
      .select()
      .from(schema.project)
      .where(eq(schema.project.id, input.projectId))
      .get();
    if (!proj) {
      throw new NotFoundError('Project', input.projectId);
    }

    // Validate regex syntax and safety
    if (input.regex.length > 200) {
      throw new ValidationError('Regex pattern too long (max 200 chars)', { field: 'regex' });
    }
    try {
      new RegExp(input.regex);
    } catch {
      throw new ValidationError(
        'Invalid regex pattern',
        { field: 'regex', received: input.regex },
      );
    }

    const now = new Date().toISOString();
    const id = ulid();

    const row = {
      id,
      projectId: input.projectId,
      regex: input.regex,
      urlTemplate: input.urlTemplate,
      createdAt: now,
    };

    await db.insert(schema.taskPattern).values(row);
    return row;
  },

  async list(db: DrizzleDB, projectId: string) {
    return db
      .select()
      .from(schema.taskPattern)
      .where(eq(schema.taskPattern.projectId, projectId))
      .all();
  },

  async delete(db: DrizzleDB, id: string) {
    const existing = await db
      .select()
      .from(schema.taskPattern)
      .where(eq(schema.taskPattern.id, id))
      .get();
    if (!existing) {
      throw new NotFoundError('TaskPattern', id);
    }

    await db.delete(schema.taskPattern).where(eq(schema.taskPattern.id, id));
  },

  detectTaskIds(
    text: string,
    patterns: Array<{ regex: string; urlTemplate: string }>,
  ): DetectedTask[] {
    const results: DetectedTask[] = [];
    const seen = new Set<string>();

    for (const pattern of patterns) {
      try {
        const re = new RegExp(pattern.regex, 'g');
        let match: RegExpExecArray | null;

        while ((match = re.exec(text)) !== null) {
          const taskId = match[1] ?? match[0];
          const key = `${pattern.urlTemplate}:${taskId}`;

          if (!seen.has(key)) {
            seen.add(key);
            const url = pattern.urlTemplate.replace('{id}', taskId);
            results.push({ taskId, url });
          }
        }
      } catch {
        // Skip invalid regex patterns at runtime
      }
    }

    return results;
  },
};
