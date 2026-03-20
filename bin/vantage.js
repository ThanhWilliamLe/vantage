#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { execSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// 1. Check Node.js version
const [major] = process.versions.node.split('.').map(Number);
if (major < 20) {
  console.error(`Vantage requires Node.js >= 20. Current version: ${process.version}`);
  process.exit(1);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

// 2. Build frontend if dist/ doesn't exist
const frontendDist = resolve(root, 'packages/frontend/dist');
if (!existsSync(frontendDist)) {
  console.log('Frontend not built yet. Building...');
  execSync('pnpm --filter @twle/vantage-frontend build', {
    cwd: root,
    stdio: 'inherit',
  });
}

// 3. Start the backend server (uses tsx to run TypeScript directly)
const server = spawn('pnpm', ['--filter', '@twle/vantage-backend', 'dev'], {
  cwd: root,
  stdio: 'inherit',
  shell: true,
});

server.on('close', (code) => process.exit(code ?? 0));
