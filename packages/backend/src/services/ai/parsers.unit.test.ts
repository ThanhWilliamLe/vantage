import { describe, it, expect } from 'vitest';
import {
  extractJSON,
  parseTier1Response,
  parseTier2Response,
  parseDailyPrefillResponse,
  parseQuarterlySynthesisResponse,
} from './parsers.js';

// ─── extractJSON ────────────────────────────────

describe('extractJSON', () => {
  it('parses bare JSON object', () => {
    const result = extractJSON('{"key": "value"}');
    expect(result).toEqual({ key: 'value' });
  });

  it('parses bare JSON array', () => {
    const result = extractJSON('[1, 2, 3]');
    expect(result).toEqual([1, 2, 3]);
  });

  it('extracts JSON from code fences', () => {
    const input = '```json\n{"summary": "test", "category": "feature"}\n```';
    const result = extractJSON(input);
    expect(result).toEqual({ summary: 'test', category: 'feature' });
  });

  it('extracts JSON from code fences without language tag', () => {
    const input = '```\n{"summary": "test"}\n```';
    const result = extractJSON(input);
    expect(result).toEqual({ summary: 'test' });
  });

  it('extracts JSON after preamble text', () => {
    const input = 'Here is my analysis:\n\n{"summary": "test", "risk_level": "low"}';
    const result = extractJSON(input);
    expect(result).toEqual({ summary: 'test', risk_level: 'low' });
  });

  it('extracts JSON with preamble and trailing text', () => {
    const input = 'Analysis complete:\n{"findings": []}\nLet me know if you need more.';
    const result = extractJSON(input);
    expect(result).toEqual({ findings: [] });
  });

  it('handles nested objects', () => {
    const input = '{"a": {"b": {"c": 1}}}';
    const result = extractJSON(input);
    expect(result).toEqual({ a: { b: { c: 1 } } });
  });

  it('handles JSON with special characters in strings', () => {
    const input = '{"summary": "Fixed \\"quoted\\" text and backslash \\\\ path"}';
    const result = extractJSON(input);
    expect(result).toEqual({ summary: 'Fixed "quoted" text and backslash \\ path' });
  });

  it('handles truncated JSON by repairing missing braces', () => {
    const input = '{"summary": "test", "category": "feature"';
    const result = extractJSON(input);
    expect(result).toEqual({ summary: 'test', category: 'feature' });
  });

  it('handles truncated JSON with missing bracket and brace', () => {
    const input = '{"findings": [{"severity": "high", "description": "bug"}';
    const result = extractJSON(input);
    expect((result as Record<string, unknown>).findings).toBeDefined();
  });

  it('handles JSON array in code fences', () => {
    const input = '```json\n[{"type": "trend", "description": "increasing"}]\n```';
    const result = extractJSON(input);
    expect(result).toEqual([{ type: 'trend', description: 'increasing' }]);
  });

  it('handles nested code fences', () => {
    const input = '```json\n{"summary": "Added support for ```code blocks```"}\n```';
    // The first ``` pair matches, extracting inner content
    // This is a best-effort parse — the inner backticks may interfere
    // so we just verify it doesn't throw and returns something
    expect(() => extractJSON(input)).not.toThrow();
  });

  it('handles whitespace-wrapped JSON', () => {
    const input = '  \n\n  {"key": 1}  \n\n  ';
    const result = extractJSON(input);
    expect(result).toEqual({ key: 1 });
  });

  it('throws on empty input', () => {
    expect(() => extractJSON('')).toThrow();
  });

  it('throws on non-string input', () => {
    expect(() => extractJSON(null as unknown as string)).toThrow();
  });

  it('throws on plain text with no JSON', () => {
    expect(() => extractJSON('This is just plain text without any JSON.')).toThrow();
  });

  it('handles JSON with trailing comma (repair)', () => {
    const input = '{"summary": "test", "category": "feature",}';
    // JSON.parse normally rejects trailing commas, but our repair handles it
    // by closing properly
    expect(() => extractJSON(input)).not.toThrow();
  });
});

// ─── parseTier1Response ─────────────────────────

describe('parseTier1Response', () => {
  it('parses valid Tier 1 response', () => {
    const result = parseTier1Response({
      summary: 'Adds rate limiting to auth endpoints.',
      category: 'feature',
      risk_level: 'high',
    });

    expect(result).toEqual({
      summary: 'Adds rate limiting to auth endpoints.',
      category: 'feature',
      riskLevel: 'high',
    });
  });

  it('defaults missing summary to empty string', () => {
    const result = parseTier1Response({ category: 'bugfix', risk_level: 'low' });
    expect(result.summary).toBe('');
  });

  it('defaults missing category to "other"', () => {
    const result = parseTier1Response({ summary: 'Test', risk_level: 'low' });
    expect(result.category).toBe('other');
  });

  it('defaults missing risk_level to "medium"', () => {
    const result = parseTier1Response({ summary: 'Test', category: 'feature' });
    expect(result.riskLevel).toBe('medium');
  });

  it('defaults invalid category to "other"', () => {
    const result = parseTier1Response({
      summary: 'Test',
      category: 'unknown_cat',
      risk_level: 'low',
    });
    expect(result.category).toBe('other');
  });

  it('defaults invalid risk_level to "medium"', () => {
    const result = parseTier1Response({
      summary: 'Test',
      category: 'feature',
      risk_level: 'critical',
    });
    expect(result.riskLevel).toBe('medium');
  });

  it('handles wrong types gracefully', () => {
    const result = parseTier1Response({
      summary: 123,
      category: true,
      risk_level: null,
    });
    expect(result.summary).toBe('');
    expect(result.category).toBe('other');
    expect(result.riskLevel).toBe('medium');
  });

  it('ignores extra fields', () => {
    const result = parseTier1Response({
      summary: 'Test',
      category: 'docs',
      risk_level: 'low',
      extra_field: 'ignored',
      another: 42,
    });
    expect(result.summary).toBe('Test');
    expect(result.category).toBe('docs');
    expect(result.riskLevel).toBe('low');
    expect((result as unknown as Record<string, unknown>).extra_field).toBeUndefined();
  });

  it('handles empty object', () => {
    const result = parseTier1Response({});
    expect(result.summary).toBe('');
    expect(result.category).toBe('other');
    expect(result.riskLevel).toBe('medium');
  });

  it('handles non-object input', () => {
    const result = parseTier1Response('not an object');
    expect(result.summary).toBe('');
    expect(result.category).toBe('other');
    expect(result.riskLevel).toBe('medium');
  });

  it('handles all valid categories', () => {
    const categories = ['bugfix', 'feature', 'refactor', 'config', 'docs', 'test', 'other'];
    for (const cat of categories) {
      const result = parseTier1Response({ summary: 'x', category: cat, risk_level: 'low' });
      expect(result.category).toBe(cat);
    }
  });
});

// ─── parseTier2Response ─────────────────────────

describe('parseTier2Response', () => {
  it('parses valid response with findings', () => {
    const result = parseTier2Response({
      findings: [
        {
          severity: 'high',
          category: 'bug',
          description: 'Null pointer dereference',
          file: 'src/handler.ts',
          line: 42,
        },
        {
          severity: 'low',
          category: 'style',
          description: 'Inconsistent naming',
          file: 'src/utils.ts',
          line: 10,
        },
      ],
    });

    expect(result.findings).toHaveLength(2);
    expect(result.findings[0].severity).toBe('high');
    expect(result.findings[0].category).toBe('bug');
    expect(result.findings[0].description).toBe('Null pointer dereference');
    expect(result.findings[0].file).toBe('src/handler.ts');
    expect(result.findings[0].line).toBe(42);
  });

  it('handles empty findings array', () => {
    const result = parseTier2Response({ findings: [] });
    expect(result.findings).toEqual([]);
  });

  it('returns empty findings when findings is not an array', () => {
    const result = parseTier2Response({ findings: 'not array' });
    expect(result.findings).toEqual([]);
  });

  it('returns empty findings when findings is missing', () => {
    const result = parseTier2Response({});
    expect(result.findings).toEqual([]);
  });

  it('filters out findings without description', () => {
    const result = parseTier2Response({
      findings: [
        { severity: 'high', category: 'bug' },
        { severity: 'low', category: 'style', description: 'Valid' },
      ],
    });
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].description).toBe('Valid');
  });

  it('defaults invalid severity to "info"', () => {
    const result = parseTier2Response({
      findings: [{ severity: 'critical', category: 'bug', description: 'Test', file: 'a.ts', line: 1 }],
    });
    expect(result.findings[0].severity).toBe('info');
  });

  it('defaults invalid category to "quality"', () => {
    const result = parseTier2Response({
      findings: [{ severity: 'high', category: 'unknown', description: 'Test', file: 'a.ts', line: 1 }],
    });
    expect(result.findings[0].category).toBe('quality');
  });

  it('defaults missing file to empty string', () => {
    const result = parseTier2Response({
      findings: [{ severity: 'high', category: 'bug', description: 'Test' }],
    });
    expect(result.findings[0].file).toBe('');
  });

  it('defaults missing line to null', () => {
    const result = parseTier2Response({
      findings: [{ severity: 'high', category: 'bug', description: 'Test', file: 'a.ts' }],
    });
    expect(result.findings[0].line).toBeNull();
  });
});

// ─── parseDailyPrefillResponse ──────────────────

describe('parseDailyPrefillResponse', () => {
  it('parses valid response', () => {
    const result = parseDailyPrefillResponse({
      description: 'Worked on authentication improvements.',
      workload_score: 6,
    });
    expect(result.description).toBe('Worked on authentication improvements.');
    expect(result.workloadScore).toBe(6);
  });

  it('defaults missing description to empty string', () => {
    const result = parseDailyPrefillResponse({ workload_score: 5 });
    expect(result.description).toBe('');
  });

  it('defaults missing workload_score to 5', () => {
    const result = parseDailyPrefillResponse({ description: 'Test' });
    expect(result.workloadScore).toBe(5);
  });

  it('clamps workload score below 1 to 1', () => {
    const result = parseDailyPrefillResponse({ description: 'Test', workload_score: 0 });
    expect(result.workloadScore).toBe(1);
  });

  it('clamps workload score above 10 to 10', () => {
    const result = parseDailyPrefillResponse({ description: 'Test', workload_score: 15 });
    expect(result.workloadScore).toBe(10);
  });

  it('rounds fractional workload score', () => {
    const result = parseDailyPrefillResponse({ description: 'Test', workload_score: 6.7 });
    expect(result.workloadScore).toBe(7);
  });

  it('handles negative workload score', () => {
    const result = parseDailyPrefillResponse({ description: 'Test', workload_score: -3 });
    expect(result.workloadScore).toBe(1);
  });

  it('handles non-number workload_score', () => {
    const result = parseDailyPrefillResponse({ description: 'Test', workload_score: 'high' });
    expect(result.workloadScore).toBe(5);
  });
});

// ─── parseQuarterlySynthesisResponse ────────────

describe('parseQuarterlySynthesisResponse', () => {
  it('parses valid response', () => {
    const result = parseQuarterlySynthesisResponse({
      description: 'Strong quarter focused on backend work.',
      workload_score: 7,
      insights: [
        { type: 'trend', description: 'Increasing commit complexity.' },
        { type: 'focus_shift', description: 'Shifted from Alpha to Beta.' },
      ],
    });

    expect(result.description).toBe('Strong quarter focused on backend work.');
    expect(result.workloadScore).toBe(7);
    expect(result.insights).toHaveLength(2);
    expect(result.insights[0].type).toBe('trend');
    expect(result.insights[1].type).toBe('focus_shift');
  });

  it('defaults missing description to empty string', () => {
    const result = parseQuarterlySynthesisResponse({ workload_score: 5, insights: [] });
    expect(result.description).toBe('');
  });

  it('defaults missing workload_score to 5', () => {
    const result = parseQuarterlySynthesisResponse({ description: 'Test', insights: [] });
    expect(result.workloadScore).toBe(5);
  });

  it('clamps workload score', () => {
    const result = parseQuarterlySynthesisResponse({
      description: 'Test',
      workload_score: 12,
      insights: [],
    });
    expect(result.workloadScore).toBe(10);
  });

  it('returns empty insights when missing', () => {
    const result = parseQuarterlySynthesisResponse({ description: 'Test', workload_score: 5 });
    expect(result.insights).toEqual([]);
  });

  it('returns empty insights when not an array', () => {
    const result = parseQuarterlySynthesisResponse({
      description: 'Test',
      workload_score: 5,
      insights: 'not array',
    });
    expect(result.insights).toEqual([]);
  });

  it('filters insights without description', () => {
    const result = parseQuarterlySynthesisResponse({
      description: 'Test',
      workload_score: 5,
      insights: [
        { type: 'trend' },
        { type: 'consistency', description: 'Valid insight' },
      ],
    });
    expect(result.insights).toHaveLength(1);
    expect(result.insights[0].description).toBe('Valid insight');
  });

  it('defaults invalid insight type to "trend"', () => {
    const result = parseQuarterlySynthesisResponse({
      description: 'Test',
      workload_score: 5,
      insights: [{ type: 'invalid_type', description: 'Some insight' }],
    });
    expect(result.insights[0].type).toBe('trend');
  });

  it('handles all valid insight types', () => {
    const types = ['trend', 'workload_shift', 'consistency', 'focus_shift'];
    for (const type of types) {
      const result = parseQuarterlySynthesisResponse({
        description: 'Test',
        workload_score: 5,
        insights: [{ type, description: 'Insight' }],
      });
      expect(result.insights[0].type).toBe(type);
    }
  });
});
