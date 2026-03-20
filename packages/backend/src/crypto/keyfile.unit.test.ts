import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { generateKeyFile, readKeyFile, ensureKeyFile } from './keyfile.js';

describe('keyfile management', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'vantage-keyfile-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('generateKeyFile', () => {
    it('creates a file containing exactly 32 bytes', () => {
      const filePath = join(tempDir, 'test.key');
      const key = generateKeyFile(filePath);

      expect(key).toBeInstanceOf(Buffer);
      expect(key.length).toBe(32);

      // File on disk should also be 32 bytes
      const readBack = readKeyFile(filePath);
      expect(readBack.length).toBe(32);
      expect(readBack.equals(key)).toBe(true);
    });
  });

  describe('readKeyFile', () => {
    it('reads back the correct key', () => {
      const filePath = join(tempDir, 'test.key');
      const originalKey = generateKeyFile(filePath);
      const readBack = readKeyFile(filePath);

      expect(readBack.equals(originalKey)).toBe(true);
    });

    it('throws when the file does not exist', () => {
      const missingPath = join(tempDir, 'nonexistent.key');

      expect(() => readKeyFile(missingPath)).toThrow(/Key file not found/);
    });

    it('throws when file has wrong size (too short)', () => {
      const filePath = join(tempDir, 'short.key');
      writeFileSync(filePath, Buffer.alloc(16)); // 16 bytes, not 32

      expect(() => readKeyFile(filePath)).toThrow(
        /Invalid key file: expected 32 bytes, got 16/,
      );
    });

    it('throws when file has wrong size (too long)', () => {
      const filePath = join(tempDir, 'long.key');
      writeFileSync(filePath, Buffer.alloc(64)); // 64 bytes, not 32

      expect(() => readKeyFile(filePath)).toThrow(
        /Invalid key file: expected 32 bytes, got 64/,
      );
    });
  });

  describe('ensureKeyFile', () => {
    it('generates a new key when file is missing', () => {
      const filePath = join(tempDir, 'new.key');
      const result = ensureKeyFile(filePath);

      expect(result.generated).toBe(true);
      expect(result.key).toBeInstanceOf(Buffer);
      expect(result.key.length).toBe(32);
    });

    it('reads existing key when file already exists', () => {
      const filePath = join(tempDir, 'existing.key');
      const originalKey = generateKeyFile(filePath);
      const result = ensureKeyFile(filePath);

      expect(result.generated).toBe(false);
      expect(result.key.equals(originalKey)).toBe(true);
    });

    it('returns same key on repeated calls', () => {
      const filePath = join(tempDir, 'stable.key');
      const first = ensureKeyFile(filePath);
      const second = ensureKeyFile(filePath);

      expect(first.generated).toBe(true);
      expect(second.generated).toBe(false);
      expect(first.key.equals(second.key)).toBe(true);
    });
  });
});
