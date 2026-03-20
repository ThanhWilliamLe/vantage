import { describe, it, expect } from 'vitest';
import {
  buildTier1Prompt,
  buildTier2Prompt,
  buildDailyPrefillPrompt,
  buildQuarterlySynthesisPrompt,
} from './prompts.js';
import type { DailyEntry, QuarterlyEntry } from './prompts.js';

// ─── buildTier1Prompt ──────────────────────────

describe('buildTier1Prompt', () => {
  it('includes title and diff', () => {
    const result = buildTier1Prompt('Fix bug', null, '+ line added');
    expect(result).toContain('Fix bug');
    expect(result).toContain('+ line added');
    expect(result).toContain('JSON');
  });

  it('includes body when provided', () => {
    const result = buildTier1Prompt('Fix bug', 'Detailed body text', '+ line');
    expect(result).toContain('Detailed body text');
  });

  it('omits body when null', () => {
    const result = buildTier1Prompt('Fix bug', null, '+ line');
    expect(result).not.toContain('null');
  });

  it('truncates large diffs', () => {
    const largeDiff = 'x'.repeat(60 * 1024);
    const result = buildTier1Prompt('Big change', null, largeDiff);
    expect(result.length).toBeLessThan(largeDiff.length);
    expect(result).toContain('truncated');
  });
});

// ─── buildTier2Prompt ──────────────────────────

describe('buildTier2Prompt', () => {
  it('includes title, diff, and system prompt', () => {
    const result = buildTier2Prompt('Feature X', null, '+ new code', []);
    expect(result).toContain('Feature X');
    expect(result).toContain('+ new code');
  });

  it('includes body when provided', () => {
    const result = buildTier2Prompt('Feature X', 'Body text', '+ diff', []);
    expect(result).toContain('Body text');
  });

  it('includes context files when provided', () => {
    const result = buildTier2Prompt('Fix', null, '+ diff', [
      'file1.ts content',
      'file2.ts content',
    ]);
    expect(result).toContain('Project Context');
    expect(result).toContain('file1.ts content');
    expect(result).toContain('file2.ts content');
  });

  it('omits context section when no files', () => {
    const result = buildTier2Prompt('Fix', null, '+ diff', []);
    expect(result).not.toContain('Project Context');
  });

  it('truncates large diffs at 100KB limit', () => {
    const largeDiff = 'x'.repeat(120 * 1024);
    const result = buildTier2Prompt('Big', null, largeDiff, []);
    expect(result).toContain('truncated');
  });
});

// ─── buildDailyPrefillPrompt ───────────────────

describe('buildDailyPrefillPrompt', () => {
  const entry: DailyEntry = {
    projectName: 'Alpha',
    title: 'Add login feature',
    aiCategory: 'feature',
    aiSummary: 'Added OAuth-based login.',
    reviewNotes: 'LGTM',
    linesAdded: 120,
    linesDeleted: 5,
  };

  it('includes entry data in prompt', () => {
    const result = buildDailyPrefillPrompt([entry]);
    expect(result).toContain('Add login feature');
    expect(result).toContain('Alpha');
    expect(result).toContain('feature');
    expect(result).toContain('Added OAuth-based login.');
    expect(result).toContain('LGTM');
    expect(result).toContain('+120');
    expect(result).toContain('-5');
    expect(result).toContain('1 changes');
  });

  it('handles multiple entries', () => {
    const entry2: DailyEntry = {
      projectName: 'Beta',
      title: 'Fix typo',
      aiCategory: 'docs',
      aiSummary: 'Fixed a typo.',
      reviewNotes: null,
      linesAdded: 1,
      linesDeleted: 1,
    };
    const result = buildDailyPrefillPrompt([entry, entry2]);
    expect(result).toContain('2 changes');
    expect(result).toContain('Alpha');
    expect(result).toContain('Beta');
  });

  it('defaults null category to uncategorized', () => {
    const e: DailyEntry = { ...entry, aiCategory: null };
    const result = buildDailyPrefillPrompt([e]);
    expect(result).toContain('uncategorized');
  });

  it('defaults null summary', () => {
    const e: DailyEntry = { ...entry, aiSummary: null };
    const result = buildDailyPrefillPrompt([e]);
    expect(result).toContain('No AI summary available');
  });

  it('defaults null review notes to None', () => {
    const e: DailyEntry = { ...entry, reviewNotes: null };
    const result = buildDailyPrefillPrompt([e]);
    expect(result).toContain('Review notes: None');
  });
});

// ─── buildQuarterlySynthesisPrompt ─────────────

describe('buildQuarterlySynthesisPrompt', () => {
  const entry: QuarterlyEntry = {
    date: '2026-01-15',
    projectNames: ['Alpha', 'Beta'],
    description: 'Worked on auth module. Reviewed 5 PRs.',
    workloadScore: 7,
    notes: 'Good day.',
  };

  it('includes entry data', () => {
    const result = buildQuarterlySynthesisPrompt([entry]);
    expect(result).toContain('2026-01-15');
    expect(result).toContain('Alpha, Beta');
    expect(result).toContain('Worked on auth module');
    expect(result).toContain('Workload: 7');
    expect(result).toContain('Good day.');
    expect(result).toContain('1 entries');
  });

  it('handles null workload score', () => {
    const e: QuarterlyEntry = { ...entry, workloadScore: null };
    const result = buildQuarterlySynthesisPrompt([e]);
    expect(result).toContain('Workload: not set');
  });

  it('handles null notes', () => {
    const e: QuarterlyEntry = { ...entry, notes: null };
    const result = buildQuarterlySynthesisPrompt([e]);
    expect(result).toContain('Notes: None');
  });

  it('summarizes when input exceeds 30KB limit', () => {
    // Create enough entries to exceed 30KB
    const bigEntries: QuarterlyEntry[] = Array.from({ length: 200 }, (_, i) => ({
      date: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`,
      projectNames: ['Alpha', 'Beta', 'Gamma'],
      description: 'A '.repeat(100) + `Entry ${i}`,
      workloadScore: 5,
      notes: 'Some notes about the work done today.',
    }));
    const result = buildQuarterlySynthesisPrompt(bigEntries);
    expect(result).toContain('summarized');
  });

  it('truncates when even summarized form exceeds 30KB', () => {
    // Create entries with very long descriptions so even summarized form is huge
    const hugeEntries: QuarterlyEntry[] = Array.from({ length: 500 }, (_, i) => ({
      date: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`,
      projectNames: ['Alpha'],
      description: 'X'.repeat(200) + `. Entry ${i} with more text.`,
      workloadScore: 5,
      notes: null,
    }));
    const result = buildQuarterlySynthesisPrompt(hugeEntries);
    expect(result).toContain('truncated');
  });
});
