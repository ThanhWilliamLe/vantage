import type { FastifyInstance } from 'fastify';
import { BackupService } from '../services/backup-service.js';
import type { BackupExport } from '../services/backup-service.js';

export async function backupRoutes(app: FastifyInstance) {
  // POST /api/backup/export — generate and download a full backup
  app.post('/api/backup/export', async (_request, reply) => {
    const backup = await BackupService.exportAll(app.db);
    const dateStr = new Date().toISOString().split('T')[0];

    return reply
      .header('Content-Disposition', `attachment; filename="vantage-backup-${dateStr}.json"`)
      .header('Content-Type', 'application/json')
      .send(backup);
  });

  // POST /api/backup/validate — validate a backup before restoring
  app.post('/api/backup/validate', async (request) => {
    const { backup, mode } = request.body as { backup: unknown; mode: 'replace' | 'merge' };

    if (!mode || (mode !== 'replace' && mode !== 'merge')) {
      return {
        compatible: false,
        requiresMigration: false,
        entityCounts: {},
        errors: ['mode must be "replace" or "merge"'],
      };
    }

    return BackupService.validate(backup, mode, app.db);
  });

  // POST /api/backup/restore — restore from a backup
  app.post('/api/backup/restore', async (request) => {
    const { backup, mode } = request.body as { backup: BackupExport; mode: 'replace' | 'merge' };

    if (!mode || (mode !== 'replace' && mode !== 'merge')) {
      return {
        mode: mode ?? 'unknown',
        inserted: 0,
        skipped: 0,
        errors: ['mode must be "replace" or "merge"'],
      };
    }

    // Validate first
    const validation = BackupService.validate(backup, mode, app.db);
    if (!validation.compatible) {
      return {
        mode,
        inserted: 0,
        skipped: 0,
        errors: ['Validation failed: ' + validation.errors.join('; ')],
      };
    }

    return await BackupService.restore(backup, mode, app.db);
  });

  // POST /api/backup/delete-all — delete all user data (keeps app_config)
  app.post('/api/backup/delete-all', async (request, reply) => {
    const body = request.body as { confirm?: string } | undefined;
    if (!body || body.confirm !== 'DELETE ALL') {
      return reply.status(400).send({
        error: {
          code: 'CONFIRMATION_REQUIRED',
          message: 'Body must include { "confirm": "DELETE ALL" }',
        },
      });
    }
    await BackupService.deleteAll(app.db);
    return reply.status(204).send();
  });
}
