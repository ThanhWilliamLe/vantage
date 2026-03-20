import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, chmodSync } from 'node:fs';

const KEY_LENGTH = 32; // 256 bits

export function generateKeyFile(filePath: string): Buffer {
  const key = randomBytes(KEY_LENGTH);
  writeFileSync(filePath, key);

  // Set restrictive permissions on Unix
  try {
    chmodSync(filePath, 0o600);
  } catch {
    // chmod may not work on Windows — that's acceptable
  }

  return key;
}

export function readKeyFile(filePath: string): Buffer {
  if (!existsSync(filePath)) {
    throw new Error(`Key file not found: ${filePath}`);
  }

  const key = readFileSync(filePath);

  if (key.length !== KEY_LENGTH) {
    throw new Error(`Invalid key file: expected ${KEY_LENGTH} bytes, got ${key.length}`);
  }

  return key;
}

export function ensureKeyFile(filePath: string): { key: Buffer; generated: boolean } {
  if (existsSync(filePath)) {
    return { key: readKeyFile(filePath), generated: false };
  }
  return { key: generateKeyFile(filePath), generated: true };
}
