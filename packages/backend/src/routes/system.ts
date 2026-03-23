import type { FastifyInstance } from 'fastify';
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { getDataDir } from '../utils/data-dir.js';

let lastOpenedAt = 0;
const COOLDOWN_MS = 3000;

export async function systemRoutes(app: FastifyInstance) {
  // POST /api/system/open-data-dir — open the data directory in the OS file manager
  app.post('/api/system/open-data-dir', async (_request, reply) => {
    const now = Date.now();
    if (now - lastOpenedAt < COOLDOWN_MS) {
      return reply.status(429).send({ error: 'Please wait before opening again' });
    }
    lastOpenedAt = now;

    const dataDir = getDataDir();
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }
    const platform = process.platform;

    let cmd: string;
    if (platform === 'win32') {
      cmd = 'explorer';
    } else if (platform === 'darwin') {
      cmd = 'open';
    } else {
      cmd = 'xdg-open';
    }

    try {
      await new Promise<void>((resolve, reject) => {
        execFile(cmd, [dataDir], (err) => {
          // explorer.exe returns exit code 1 even on success on Windows
          if (err && platform !== 'win32') {
            reject(err);
          } else {
            resolve();
          }
        });
      });
    } catch {
      return reply.status(500).send({ error: 'Failed to open file manager' });
    }

    return { ok: true };
  });

  // GET /api/system/data-dir — return the data directory path
  app.get('/api/system/data-dir', async () => {
    return { path: getDataDir() };
  });
}
