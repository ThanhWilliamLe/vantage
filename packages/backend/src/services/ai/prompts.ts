/**
 * AI Prompt Assembly
 *
 * Builds prompts for all four AI use cases:
 * - Tier 1: summary, category, risk level
 * - Tier 2: deep analysis with findings
 * - Daily pre-fill: check-up descriptions and workload scores
 * - Quarterly synthesis: period summaries and insights
 */

const DIFF_LIMIT = 50 * 1024;           // 50 KB for Tier 1 / daily
const TIER2_DIFF_LIMIT = 100 * 1024;    // 100 KB for Tier 2
const QUARTERLY_INPUT_LIMIT = 30 * 1024; // 30 KB for quarterly synthesis

// ─── System Prompts ─────────────────────────────

const TIER1_SYSTEM = `You are a code review assistant for a development team lead. Analyze the given code change and provide three things:

1. SUMMARY: A concise 1-2 sentence description of what changed and why. Focus on the intent, not the mechanics. Write for a technical audience.

2. CATEGORY: Classify the change into exactly one category:
   - "bugfix" — fixes a bug, error, or incorrect behavior
   - "feature" — adds new functionality or capability
   - "refactor" — restructures code without changing external behavior
   - "config" — build configuration, CI/CD, environment, dependency changes
   - "docs" — documentation updates (README, comments, docstrings)
   - "test" — test additions, modifications, or test infrastructure
   - "other" — does not fit the above categories

3. RISK LEVEL: Assess the risk this change introduces:
   - "low" — documentation, tests, minor config, small isolated refactors, typo fixes
   - "medium" — new features in non-critical paths, moderate refactors, dependency updates
   - "high" — security-related changes, database schema changes, core business logic, authentication/authorization, large rewrites, changes touching many files (>20)

Respond with ONLY a JSON object in this exact format:
{"summary": "...", "category": "...", "risk_level": "..."}

Do not include any text outside the JSON object.`;

const TIER2_SYSTEM = `You are a senior code reviewer performing a thorough analysis of a code change. Examine the diff carefully and identify issues across these dimensions:

1. BUGS — Logic errors, off-by-one errors, null/undefined risks, race conditions, incorrect assumptions
2. SECURITY — Injection vulnerabilities, authentication/authorization gaps, data exposure, insecure defaults
3. QUALITY — Code smells, duplicated logic, poor naming, missing error handling, unclear intent
4. PERFORMANCE — Unnecessary computations, N+1 queries, missing indexes, memory leaks, large allocations in loops
5. STYLE — Inconsistencies with surrounding code, convention violations

For each issue found, provide:
- severity: "high" (likely to cause a bug or security issue), "medium" (should be fixed but not critical), "low" (minor improvement), "info" (observation, not necessarily an issue)
- category: "bug", "security", "quality", "performance", or "style"
- description: Clear explanation of the issue and suggested fix
- file: The file path where the issue occurs
- line: The line number (from the diff) where the issue is located

Use the provided project context files to understand the codebase conventions and architecture.

Respond with ONLY a JSON object:
{"findings": [{"severity": "...", "category": "...", "description": "...", "file": "...", "line": N}, ...]}

If no issues are found, respond with: {"findings": []}
Do not fabricate issues. Only report what you can substantiate from the diff.`;

const DAILY_SYSTEM = `You are helping a development team lead write a daily check-up note for a team member. Based on the day's code activity, produce:

1. DESCRIPTION: A factual 2-4 sentence summary of what the member worked on today. Focus on accomplishments and areas of work, not implementation details. Group related changes together. Write in third person.

2. WORKLOAD_SCORE: A suggested workload score from 1 to 10:
   - 1-2: Very light day (1-2 trivial changes)
   - 3-4: Light day (a few small changes or one moderate change)
   - 5-6: Normal day (several meaningful changes across areas)
   - 7-8: Heavy day (many changes, large features, or complex work)
   - 9-10: Extremely heavy (major releases, critical fixes, or extraordinary volume)

Base the score on volume (number and size of changes), complexity (categories and variety), and scope (number of projects touched).

Respond with ONLY a JSON object:
{"description": "...", "workload_score": N}

The team lead will edit your draft. Be accurate and concise — do not embellish.`;

const QUARTERLY_SYSTEM = `You are helping a development team lead write a quarterly performance evaluation for a team member. Based on accumulated daily check-ups and activity data, produce:

1. DESCRIPTION: A 3-5 sentence synthesis of the member's quarter. Cover major themes, notable contributions, and overall trajectory. Write in third person. Be balanced — acknowledge both strengths and areas where contribution was lighter.

2. WORKLOAD_SCORE: An overall workload score for the quarter (1-10). This is the average effective load, not the peak. Consider consistency across the period.

3. INSIGHTS: 2-5 non-obvious observations about patterns in the data. Each insight has a type and description:
   - "trend" — activity volume or complexity changed over the quarter (increasing, decreasing, stable)
   - "workload_shift" — significant change in workload between early and late quarter
   - "consistency" — patterns in regularity of contributions (steady vs. bursty)
   - "focus_shift" — the member's focus areas changed (different projects, different types of work)

Only include insights you can substantiate from the data. Do not speculate.

Respond with ONLY a JSON object:
{"description": "...", "workload_score": N, "insights": [{"type": "...", "description": "..."}, ...]}`;

// ─── Prompt Builders ────────────────────────────

function truncate(text: string, limit: number): string {
  if (text.length <= limit) return text;
  return text.substring(0, limit) + '\n\n[... truncated at ' + Math.round(limit / 1024) + ' KB]';
}

export function buildTier1Prompt(title: string, body: string | null, diff: string): string {
  const truncatedDiff = truncate(diff, DIFF_LIMIT);

  return `${TIER1_SYSTEM}

Commit: ${title}

${body ? body + '\n' : ''}
Diff:
${truncatedDiff}`;
}

export function buildTier2Prompt(
  title: string,
  body: string | null,
  diff: string,
  contextFiles: string[],
): string {
  const truncatedDiff = truncate(diff, TIER2_DIFF_LIMIT);

  let prompt = `${TIER2_SYSTEM}

## Code Change

Commit: ${title}

${body ? body + '\n' : ''}
## Diff

${truncatedDiff}`;

  if (contextFiles.length > 0) {
    prompt += '\n\n## Project Context\n';
    for (const file of contextFiles) {
      prompt += '\n' + file + '\n';
    }
  }

  return prompt;
}

export interface DailyEntry {
  projectName: string;
  title: string;
  aiCategory: string | null;
  aiSummary: string | null;
  reviewNotes: string | null;
  linesAdded: number;
  linesDeleted: number;
}

export function buildDailyPrefillPrompt(entries: DailyEntry[]): string {
  const lines = entries.map((e) => {
    const cat = e.aiCategory || 'uncategorized';
    const summary = e.aiSummary || 'No AI summary available';
    const notes = e.reviewNotes || 'None';
    return `- [${cat}] ${e.title} (${e.projectName})\n  Summary: ${summary}\n  Review notes: ${notes}\n  Size: +${e.linesAdded} -${e.linesDeleted}`;
  });

  return `${DAILY_SYSTEM}

Today's activity (${entries.length} changes):

${lines.join('\n')}`;
}

export interface QuarterlyEntry {
  date: string;
  projectNames: string[];
  description: string;
  workloadScore: number | null;
  notes: string | null;
}

export function buildQuarterlySynthesisPrompt(entries: QuarterlyEntry[]): string {
  let entryLines = entries.map((e) => {
    return `---\nDate: ${e.date}\nProjects: ${e.projectNames.join(', ')}\nDescription: ${e.description}\nWorkload: ${e.workloadScore ?? 'not set'}\nNotes: ${e.notes || 'None'}`;
  });

  let assembled = `${QUARTERLY_SYSTEM}

Daily check-ups (${entries.length} entries):

${entryLines.join('\n')}`;

  // If too long, summarize older entries
  if (assembled.length > QUARTERLY_INPUT_LIMIT) {
    entryLines = entries.map((e) => {
      const firstSentence = e.description.split('. ')[0];
      return `${e.date} | Workload: ${e.workloadScore ?? '?'} | ${firstSentence}`;
    });

    assembled = `${QUARTERLY_SYSTEM}

Daily check-ups (${entries.length} entries, summarized):

${entryLines.join('\n')}`;

    // Final truncation if still over
    if (assembled.length > QUARTERLY_INPUT_LIMIT) {
      assembled = truncate(assembled, QUARTERLY_INPUT_LIMIT);
    }
  }

  return assembled;
}
