#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { execFileSync, fork } from 'node:child_process';
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

const backendDist = resolve(root, 'packages/backend/dist/server.js');
const frontendDist = resolve(root, 'packages/frontend/dist');

// 2. Build if not already compiled
if (!existsSync(backendDist) || !existsSync(frontendDist)) {
  console.log('Building Vantage...');
  execFileSync('pnpm', ['-r', 'build'], {
    cwd: root,
    stdio: 'inherit',
  });
}

// 3. Start the compiled backend server
const server = fork(backendDist, {
  cwd: root,
  stdio: 'inherit',
});

server.on('close', (code) => process.exit(code ?? 0));
