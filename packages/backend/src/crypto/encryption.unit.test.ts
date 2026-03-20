import { describe, it, expect } from 'vitest';
import { randomBytes } from 'node:crypto';
import { encrypt, decrypt } from './encryption.js';

function makeKey(): Buffer {
  return randomBytes(32);
}

describe('encrypt / decrypt', () => {
  const key = makeKey();

  describe('round-trip', () => {
    const cases: Array<[string, string]> = [
      ['empty string', ''],
      ['short string', 'hello'],
      ['long string', 'a'.repeat(10_000)],
      ['unicode', '\u{1F680} rocket \u00E9\u00E8\u00EA \u4F60\u597D \u0410\u0411\u0412'],
      ['JSON payload', JSON.stringify({ users: [{ id: 1, name: 'Alice' }], ok: true })],
    ];

    it.each(cases)('round-trips %s', (_label, plaintext) => {
      const ciphertext = encrypt(plaintext, key);
      const result = decrypt(ciphertext, key);
      expect(result).toBe(plaintext);
    });
  });

  describe('wrong key', () => {
    it('throws a graceful error instead of crashing', () => {
      const ciphertext = encrypt('secret data', key);
      const wrongKey = randomBytes(32);

      expect(() => decrypt(ciphertext, wrongKey)).toThrow(
        'Decryption failed: invalid key or corrupted data',
      );
    });
  });

  describe('malformed ciphertext', () => {
    it('throws when parts are missing (only 2 segments)', () => {
      expect(() => decrypt('aaa:bbb', key)).toThrow(
        'Invalid encrypted data format: expected iv:authTag:ciphertext',
      );
    });

    it('throws when parts are missing (only 1 segment)', () => {
      expect(() => decrypt('aaa', key)).toThrow(
        'Invalid encrypted data format: expected iv:authTag:ciphertext',
      );
    });

    it('throws when parts are missing (4 segments)', () => {
      expect(() => decrypt('a:b:c:d', key)).toThrow(
        'Invalid encrypted data format: expected iv:authTag:ciphertext',
      );
    });

    it('throws when IV has wrong length', () => {
      // Valid base64 but wrong IV length (4 bytes instead of 12)
      const badIV = Buffer.from([1, 2, 3, 4]).toString('base64');
      const authTag = randomBytes(16).toString('base64');
      const ciphertext = randomBytes(10).toString('base64');

      expect(() => decrypt(`${badIV}:${authTag}:${ciphertext}`, key)).toThrow(
        /Invalid IV length: expected 12, got 4/,
      );
    });

    it('throws when auth tag has wrong length', () => {
      const iv = randomBytes(12).toString('base64');
      const badAuthTag = Buffer.from([1, 2, 3]).toString('base64');
      const ciphertext = randomBytes(10).toString('base64');

      expect(() => decrypt(`${iv}:${badAuthTag}:${ciphertext}`, key)).toThrow(
        /Invalid auth tag length: expected 16, got 3/,
      );
    });

    it('throws when ciphertext is empty string', () => {
      expect(() => decrypt('', key)).toThrow(
        'Invalid encrypted data format: expected iv:authTag:ciphertext',
      );
    });
  });

  describe('random IV', () => {
    it('same plaintext encrypts to different ciphertext each time', () => {
      const plaintext = 'identical content';
      const c1 = encrypt(plaintext, key);
      const c2 = encrypt(plaintext, key);
      const c3 = encrypt(plaintext, key);

      expect(c1).not.toBe(c2);
      expect(c2).not.toBe(c3);
      expect(c1).not.toBe(c3);

      // All decrypt back to original
      expect(decrypt(c1, key)).toBe(plaintext);
      expect(decrypt(c2, key)).toBe(plaintext);
      expect(decrypt(c3, key)).toBe(plaintext);
    });
  });
});
