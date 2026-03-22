import { describe, it, expect } from 'vitest';
import { weekBucketToMonday } from './workload-chart-service.js';

describe('weekBucketToMonday', () => {
  it('returns correct Monday for a regular week', () => {
    // 2026-03-09 is a Monday (week 10 per %W)
    const result = weekBucketToMonday('2026-W10');
    expect(result).toBe('2026-03-09');
  });

  it('returns correct Monday for week 11', () => {
    const result = weekBucketToMonday('2026-W11');
    expect(result).toBe('2026-03-16');
  });

  it('returns Jan 1 for week 0 (may not be a Monday)', () => {
    // 2026 starts on Thursday. Week 0 covers Jan 1-4.
    const result = weekBucketToMonday('2026-W00');
    expect(result).toBe('2026-01-01');
  });

  it('returns correct Monday for week 1', () => {
    // 2026: Jan 1 is Thursday. First Monday is Jan 5.
    const result = weekBucketToMonday('2026-W01');
    expect(result).toBe('2026-01-05');
  });

  it('returns correct Monday for year starting on Monday', () => {
    // 2024: Jan 1 is Monday. Week 01 starts Jan 1.
    const result = weekBucketToMonday('2024-W01');
    expect(result).toBe('2024-01-01');
  });

  it('returns valid ISO date format', () => {
    const result = weekBucketToMonday('2026-W10');
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('handles year boundary weeks', () => {
    // Week 52 of 2026: last full week
    const result = weekBucketToMonday('2026-W52');
    expect(result).toMatch(/^2026-12-/);
  });

  it('handles year starting on Saturday (2028)', () => {
    // 2028: Jan 1 is Saturday. Week 0 = Jan 1-2 (Sat-Sun).
    // weekBucketToMonday returns Jan 1 (not a Monday) for week 0 — documented behavior.
    const result = weekBucketToMonday('2028-W00');
    expect(result).toBe('2028-01-01');
  });

  it('handles year starting on Sunday (2023)', () => {
    // 2023: Jan 1 is Sunday. First Monday is Jan 2. Week 1 starts Jan 2.
    const result = weekBucketToMonday('2023-W01');
    expect(result).toBe('2023-01-02');
  });
});
