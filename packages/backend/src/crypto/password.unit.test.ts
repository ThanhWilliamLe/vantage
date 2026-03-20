import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from './password.js';

describe('hashPassword / verifyPassword', () => {
  it('hash then verify returns true', async () => {
    const password = 'correct-horse-battery-staple';
    const hash = await hashPassword(password);
    const result = await verifyPassword(password, hash);
    expect(result).toBe(true);
  });

  it('wrong password returns false', async () => {
    const hash = await hashPassword('real-password');
    const result = await verifyPassword('wrong-password', hash);
    expect(result).toBe(false);
  });

  it('different passwords produce different hashes', async () => {
    const hash1 = await hashPassword('password-one');
    const hash2 = await hashPassword('password-two');
    expect(hash1).not.toBe(hash2);
  });

  it('same password produces different hashes (random salt)', async () => {
    const password = 'same-password';
    const hash1 = await hashPassword(password);
    const hash2 = await hashPassword(password);
    expect(hash1).not.toBe(hash2);

    // Both still verify correctly
    expect(await verifyPassword(password, hash1)).toBe(true);
    expect(await verifyPassword(password, hash2)).toBe(true);
  });
});
