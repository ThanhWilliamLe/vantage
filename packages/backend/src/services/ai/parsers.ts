/**
 * AI Response Parsers
 *
 * JSON extraction and typed response parsing for all AI use cases.
 * Handles common AI response wrapping (code fences, preamble text, bare JSON).
 */

import { AIError } from '../../errors/ai.js';

// ─── Types ──────────────────────────────────────

export type AICategory = 'bugfix' | 'feature' | 'refactor' | 'config' | 'docs' | 'test' | 'other';
export type AIRiskLevel = 'low' | 'medium' | 'high';
export type FindingSeverity = 'high' | 'medium' | 'low' | 'info';
export type FindingCategory = 'bug' | 'security' | 'quality' | 'performance' | 'style';
export type InsightType = 'trend' | 'workload_shift' | 'consistency' | 'focus_shift';

export interface Tier1Result {
  summary: string;
  category: AICategory;
  riskLevel: AIRiskLevel;
}

export interface Finding {
  severity: FindingSeverity;
  category: FindingCategory;
  description: string;
  file: string;
  line: number | null;
}

export interface Tier2Result {
  findings: Finding[];
}

export interface DailyPrefillResult {
  description: string;
  workloadScore: number;
}

export interface AIInsight {
  type: InsightType;
  description: string;
}

export interface QuarterlySynthesisResult {
  description: string;
  workloadScore: number;
  insights: AIInsight[];
}

// ─── Constants ──────────────────────────────────

const VALID_CATEGORIES: AICategory[] = ['bugfix', 'feature', 'refactor', 'config', 'docs', 'test', 'other'];
const VALID_RISK_LEVELS: AIRiskLevel[] = ['low', 'medium', 'high'];
const VALID_SEVERITIES: FindingSeverity[] = ['high', 'medium', 'low', 'info'];
const VALID_FINDING_CATEGORIES: FindingCategory[] = ['bug', 'security', 'quality', 'performance', 'style'];
const VALID_INSIGHT_TYPES: InsightType[] = ['trend', 'workload_shift', 'consistency', 'focus_shift'];

// ─── JSON Extraction ────────────────────────────

/**
 * Extract a JSON value from raw AI text.
 *
 * Handles:
 * 1. Markdown code fences (```json ... ```)
 * 2. Preamble text before JSON
 * 3. Bare JSON objects/arrays
 * 4. Truncated JSON (best-effort repair)
 * 5. Nested code fences
 */
export function extractJSON(text: string): unknown {
  if (typeof text !== 'string' || text.trim().length === 0) {
    throw new AIError('Empty AI response', 'AI_PARSE_FAILED');
  }

  const trimmed = text.trim();

  // 1. Try markdown code fences (outermost pair)
  const fenceMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) {
    const content = fenceMatch[1].trim();
    try {
      return JSON.parse(content);
    } catch {
      // Fall through to try other strategies on fence content
      return tryParseWithRepair(content);
    }
  }

  // 2. Try to parse the full text directly
  try {
    return JSON.parse(trimmed);
  } catch {
    // Continue to other strategies
  }

  // 3. Try to find a JSON object in the text (preamble before JSON)
  const objMatch = trimmed.match(/(\{[\s\S]*\})/);
  if (objMatch) {
    try {
      return JSON.parse(objMatch[1]);
    } catch {
      return tryParseWithRepair(objMatch[1]);
    }
  }

  // 4. Try to find a JSON array
  const arrMatch = trimmed.match(/(\[[\s\S]*\])/);
  if (arrMatch) {
    try {
      return JSON.parse(arrMatch[1]);
    } catch {
      return tryParseWithRepair(arrMatch[1]);
    }
  }

  // 5. Try to find truncated JSON (starts with { or [ but never closes)
  const truncatedMatch = trimmed.match(/(\{[\s\S]*)/);
  if (truncatedMatch) {
    return tryParseWithRepair(truncatedMatch[1]);
  }
  const truncatedArrMatch = trimmed.match(/(\[[\s\S]*)/);
  if (truncatedArrMatch) {
    return tryParseWithRepair(truncatedArrMatch[1]);
  }

  throw new AIError('No JSON found in AI response', 'AI_PARSE_FAILED', {
    preview: trimmed.substring(0, 200),
  });
}

/**
 * Attempt to repair truncated or malformed JSON.
 * Adds missing closing braces/brackets.
 */
function tryParseWithRepair(text: string): unknown {
  let attempt = text.trim();

  // Try as-is first
  try {
    return JSON.parse(attempt);
  } catch {
    // Continue repair
  }

  // Remove trailing commas before closing braces/brackets
  attempt = attempt.replace(/,\s*$/, '');
  attempt = attempt.replace(/,\s*\}/g, '}');
  attempt = attempt.replace(/,\s*\]/g, ']');

  // Count unmatched braces and brackets
  let braces = 0;
  let brackets = 0;
  let inString = false;
  let escape = false;

  for (const ch of attempt) {
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\' && inString) {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === '{') braces++;
    else if (ch === '}') braces--;
    else if (ch === '[') brackets++;
    else if (ch === ']') brackets--;
  }

  // If we're inside a string, close it
  if (inString) {
    attempt += '"';
  }

  // Remove any trailing partial key-value pair (e.g., `"key": "partial`)
  // by removing everything after the last complete value
  // This is best-effort — we just close the braces

  // Add missing closers
  for (let i = 0; i < brackets; i++) attempt += ']';
  for (let i = 0; i < braces; i++) attempt += '}';

  try {
    return JSON.parse(attempt);
  } catch {
    throw new AIError('Failed to parse AI response as JSON', 'AI_PARSE_FAILED', {
      preview: text.substring(0, 200),
    });
  }
}

// ─── Response Parsers ───────────────────────────

export function parseTier1Response(raw: unknown): Tier1Result {
  const parsed = asRecord(raw);

  const summary = typeof parsed.summary === 'string' ? parsed.summary : '';
  const category = VALID_CATEGORIES.includes(parsed.category as AICategory)
    ? (parsed.category as AICategory)
    : 'other';
  const riskLevel = VALID_RISK_LEVELS.includes(parsed.risk_level as AIRiskLevel)
    ? (parsed.risk_level as AIRiskLevel)
    : 'medium';

  return { summary, category, riskLevel };
}

export function parseTier2Response(raw: unknown): Tier2Result {
  const parsed = asRecord(raw);

  if (!Array.isArray(parsed.findings)) {
    return { findings: [] };
  }

  const findings: Finding[] = parsed.findings
    .filter((f: unknown) => {
      const item = f as Record<string, unknown>;
      return item && typeof item.description === 'string';
    })
    .map((f: unknown) => {
      const item = f as Record<string, unknown>;
      return {
        severity: VALID_SEVERITIES.includes(item.severity as FindingSeverity)
          ? (item.severity as FindingSeverity)
          : 'info',
        category: VALID_FINDING_CATEGORIES.includes(item.category as FindingCategory)
          ? (item.category as FindingCategory)
          : 'quality',
        description: item.description as string,
        file: typeof item.file === 'string' ? item.file : '',
        line: typeof item.line === 'number' ? item.line : null,
      };
    });

  return { findings };
}

export function parseDailyPrefillResponse(raw: unknown): DailyPrefillResult {
  const parsed = asRecord(raw);

  const description = typeof parsed.description === 'string' ? parsed.description : '';
  let workloadScore = typeof parsed.workload_score === 'number' ? parsed.workload_score : 5;
  workloadScore = Math.max(1, Math.min(10, Math.round(workloadScore)));

  return { description, workloadScore };
}

export function parseQuarterlySynthesisResponse(raw: unknown): QuarterlySynthesisResult {
  const parsed = asRecord(raw);

  const description = typeof parsed.description === 'string' ? parsed.description : '';
  let workloadScore = typeof parsed.workload_score === 'number' ? parsed.workload_score : 5;
  workloadScore = Math.max(1, Math.min(10, Math.round(workloadScore)));

  const insights: AIInsight[] = Array.isArray(parsed.insights)
    ? parsed.insights
        .filter((i: unknown) => {
          const item = i as Record<string, unknown>;
          return item && typeof item.description === 'string';
        })
        .map((i: unknown) => {
          const item = i as Record<string, unknown>;
          return {
            type: VALID_INSIGHT_TYPES.includes(item.type as InsightType)
              ? (item.type as InsightType)
              : 'trend',
            description: item.description as string,
          };
        })
    : [];

  return { description, workloadScore, insights };
}

// ─── Helpers ────────────────────────────────────

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}
