import { buildApp } from './app.js';
import { createDatabase, runMigrations, checkDatabaseIntegrity } from './data/db.js';
import { ensureKeyFile } from './crypto/index.js';
import { validateGitInstallation } from './utils/git-check.js';
import { getDataDir } from './utils/data-dir.js';
import { mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import Fastify from 'fastify';

const PORT = parseInt(process.env.VANTAGE_PORT || '24020', 10);
const HOST = '127.0.0.1';

async function main() {
  // Use a temporary logger for bootstrap phase
  const bootstrapLogger = Fastify({
    logger: {
      level: 'info',
      transport: {
        target: 'pino-pretty',
        options: { translateTime: 'HH:MM:ss Z', ignore: 'pid,hostname' },
      },
    },
  });

  try {
    // 1. Create data directory
    const dataDir = getDataDir();
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
      bootstrapLogger.log.info(`Created data directory: ${dataDir}`);
    }

    // Create logs directory
    const logsDir = join(dataDir, 'logs');
    if (!existsSync(logsDir)) {
      mkdirSync(logsDir, { recursive: true });
    }

    // 2. Open database and run integrity check
    const dbPath = join(dataDir, 'vantage.db');

    // Pre-migration backup if database exists
    if (existsSync(dbPath)) {
      const backupPath = `${dbPath}.bak`;
      copyFileSync(dbPath, backupPath);
      bootstrapLogger.log.info('Pre-migration backup created');
    }

    const { db, sqlite } = createDatabase(dbPath);

    if (!checkDatabaseIntegrity(sqlite)) {
      bootstrapLogger.log.error('Database integrity check failed. Please restore from backup.');
      process.exit(1);
    }

    // 3. Read keyfile (generate if missing)
    const keyfilePath = join(dataDir, 'keyfile');
    const { key, generated } = ensureKeyFile(keyfilePath);
    if (generated) {
      bootstrapLogger.log.warn(
        'New encryption key generated. Previously encrypted tokens are now invalid.',
      );
    }

    // 4. Run migrations
    runMigrations(sqlite);
    bootstrapLogger.log.info('Database migrations applied');

    // 5. Validate git installation
    validateGitInstallation();
    bootstrapLogger.log.info('Git installation validated');

    // 6. Build app with db and key
    const app = buildApp({ db, key });

    // 7. Start server
    await app.listen({ port: PORT, host: HOST });
    app.log.info(`Vantage server running at http://${HOST}:${PORT}`);

    // Graceful shutdown handler
    async function shutdown(signal: string) {
      app.log.info(`Received ${signal}, shutting down gracefully...`);

      // Stop AI processing queue
      const { AIService } = await import('./services/ai/ai-service.js');
      AIService.cleanup();

      // Kill any active CLI child processes
      const { killAllActiveProcesses } = await import('./integrations/ai/cli-provider.js');
      killAllActiveProcesses();

      // Close Fastify server (stops accepting new connections)
      await app.close();

      // Close database
      sqlite.close();

      app.log.info('Shutdown complete');
      process.exit(0);
    }

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (err) {
    bootstrapLogger.log.error(err, 'Failed to start server');
    process.exit(1);
  }
}

main();
