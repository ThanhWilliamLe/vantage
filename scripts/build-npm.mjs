#!/usr/bin/env node

/**
 * Build a flat, publishable npm package from the monorepo.
 *
 * 1. Compile all workspace packages (shared → backend → frontend)
 * 2. Bundle backend + shared into a single JS file via esbuild
 * 3. Copy frontend dist/ and bin/ into npm-dist/
 * 4. Write a clean package.json for publishing
 *
 * Output: npm-dist/ — ready for `npm publish`
 */

import { execSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const out = resolve(root, 'npm-dist');

// Clean previous build
if (existsSync(out)) {
  try {
    rmSync(out, { recursive: true, force: true });
  } catch {
    // Windows: directory may be locked — remove contents instead
    for (const entry of ['bin', 'packages', 'package.json', 'README.md', 'LICENSE', 'NOTICE', 'node_modules']) {
      const p = resolve(out, entry);
      if (existsSync(p)) rmSync(p, { recursive: true, force: true });
    }
  }
}

// 1. Compile all workspace packages
console.log('Building workspace packages...');
execSync('pnpm -r build', { cwd: root, stdio: 'inherit' });

// 2. Bundle backend + shared into a single file
console.log('Bundling backend with esbuild...');
await build({
  entryPoints: [resolve(root, 'packages/backend/dist/server.js')],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outfile: resolve(out, 'packages/backend/dist/server.js'),
  external: [
    'better-sqlite3',
    'pino',
    'pino-pretty',
    'pino-abstract-transport',
    'thread-stream',
  ],
  banner: {
    js: [
      '// Vantage v1.0.0 — bundled for npm distribution',
      'import { createRequire } from "node:module";',
      'const require = createRequire(import.meta.url);',
    ].join('\n'),
  },
  sourcemap: true,
  minify: false, // keep readable for debugging
});

// 3. Copy frontend dist
console.log('Copying frontend dist...');
cpSync(
  resolve(root, 'packages/frontend/dist'),
  resolve(out, 'packages/frontend/dist'),
  { recursive: true }
);

// 4. Copy bin
console.log('Copying CLI entry point...');
mkdirSync(resolve(out, 'bin'), { recursive: true });
writeFileSync(
  resolve(out, 'bin/vantage.js'),
  `#!/usr/bin/env node

import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const [major] = process.versions.node.split('.').map(Number);
if (major < 20) {
  console.error(\`Vantage requires Node.js >= 20. Current version: \${process.version}\`);
  process.exit(1);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const server = fork(resolve(__dirname, '../packages/backend/dist/server.js'), {
  cwd: resolve(__dirname, '..'),
  stdio: 'inherit',
});

server.on('close', (code) => process.exit(code ?? 0));
`
);

// 5. Copy README and LICENSE
for (const file of ['README.md', 'LICENSE', 'NOTICE']) {
  const src = resolve(root, file);
  if (existsSync(src)) {
    cpSync(src, resolve(out, file));
  }
}

// 6. Write clean package.json
console.log('Writing package.json...');
writeFileSync(
  resolve(out, 'package.json'),
  JSON.stringify(
    {
      name: '@twle/vantage',
      version: '1.0.1',
      description:
        'Local-first code review and team evaluation tool for dev leads',
      type: 'module',
      bin: { vantage: 'bin/vantage.js' },
      author: 'Thanh Le <thanhletien.william@gmail.com>',
      contributors: [
        'Thanh Le <thanhletien.william@gmail.com>',
        'Claude (Anthropic) <noreply@anthropic.com>',
      ],
      license: 'Apache-2.0',
      repository: {
        type: 'git',
        url: 'git+https://github.com/ThanhWilliamLe/vantage.git',
      },
      homepage: 'https://github.com/ThanhWilliamLe/vantage',
      keywords: [
        'code-review',
        'dev-lead',
        'team-evaluation',
        'git',
        'local-first',
        'ai-summaries',
      ],
      engines: { node: '>=20.0.0' },
      dependencies: {
        'better-sqlite3': '^11.0.0',
        pino: '^9.0.0',
        'pino-pretty': '^11.0.0',
      },
    },
    null,
    2
  )
);

console.log('\nDone! Publishable package at: npm-dist/');
console.log('To publish:');
console.log('  cd npm-dist');
console.log('  npm publish --access public');
