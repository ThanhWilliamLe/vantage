import type { FastifyInstance } from 'fastify';
import { ImportService } from '../services/import-service.js';
import type { ColumnMapping } from '../services/import-service.js';

export async function importRoutes(app: FastifyInstance) {
  // POST /api/import/parse — accept CSV file as base64-encoded JSON body
  app.post('/api/import/parse', async (request) => {
    const { fileContent, filename } = request.body as {
      fileContent: string;
      filename: string;
    };

    if (!fileContent || !filename) {
      return { error: 'fileContent and filename are required' };
    }

    const buffer = Buffer.from(fileContent, 'base64');
    return ImportService.parseCSV(buffer, filename);
  });

  // POST /api/import/validate — validate mapped columns against DB
  app.post('/api/import/validate', async (request) => {
    const { fileId, mapping } = request.body as {
      fileId: string;
      mapping: ColumnMapping;
    };

    if (!fileId || !mapping) {
      return { error: 'fileId and mapping are required' };
    }

    return ImportService.validate(fileId, mapping, app.db);
  });

  // POST /api/import/execute — run the import
  app.post('/api/import/execute', async (request) => {
    const { fileId, mapping, memberResolutions, projectResolutions } = request.body as {
      fileId: string;
      mapping: ColumnMapping;
      memberResolutions: Record<string, string>;
      projectResolutions: Record<string, string>;
    };

    if (!fileId || !mapping || !memberResolutions) {
      return { error: 'fileId, mapping, and memberResolutions are required' };
    }

    return await ImportService.execute(
      fileId,
      mapping,
      memberResolutions,
      projectResolutions ?? {},
      app.db,
    );
  });
}
