import type { RawCommit } from './types.js';

const RECORD_SEP = '\x1e';
const FIELD_SEP = '\x1f';
const EXPECTED_FIELD_COUNT = 6;

/**
 * Parse git log output produced with the format:
 *   --format='%H%x1f%ae%x1f%an%x1f%aI%x1f%s%x1f%b%x1e' --numstat
 *
 * The actual output structure is:
 *   <fields1>\x1e\n\n<numstat1>\n<fields2>\x1e\n\n<numstat2>\n
 *
 * When split by \x1e, numstat for commit N appears at the START of segment N+1.
 * The parser handles this by collecting segments and associating numstat with the
 * preceding commit's format fields.
 */
export function parseCommitLogOutput(output: string): RawCommit[] {
  if (!output || !output.trim()) {
    return [];
  }

  // Split by record separator
  const segments = output.split(RECORD_SEP);

  // Each segment (except possibly the last empty one) contains:
  // - Segment 0: format fields of commit 1
  // - Segment 1: numstat of commit 1 + format fields of commit 2
  // - Segment 2: numstat of commit 2 + format fields of commit 3
  // - ...
  // - Last segment: numstat of last commit (possibly just whitespace)

  // First, extract format-field blocks and their associated numstat.
  // We iterate the segments and pair each format block with the numstat
  // that follows in the next segment.
  const formatBlocks: string[] = [];
  const numstatBlocks: string[] = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];

    if (i === 0) {
      // First segment contains only format fields (no preceding numstat)
      formatBlocks.push(seg);
    } else {
      // This segment starts with numstat for the PREVIOUS commit,
      // then has format fields for THIS commit (if any).
      // The format fields start at the first 40-hex-char hash.
      // eslint-disable-next-line no-control-regex
      const hashMatch = seg.match(/(?:^|\n)([0-9a-f]{40})\x1f/i);

      if (hashMatch && hashMatch.index !== undefined) {
        // Everything before the hash is numstat for the previous commit
        const numstatPart = seg.substring(0, hashMatch.index);
        numstatBlocks.push(numstatPart);

        // Everything from the hash onward is format fields for this commit
        const formatPart = seg.substring(hashMatch.index);
        formatBlocks.push(formatPart);
      } else {
        // No hash found — this is the numstat for the last commit
        numstatBlocks.push(seg);
      }
    }
  }

  // Now pair each format block with its numstat block
  const commits: RawCommit[] = [];

  for (let i = 0; i < formatBlocks.length; i++) {
    const formatText = formatBlocks[i].trim();
    if (!formatText) continue;

    const numstatText = i < numstatBlocks.length ? numstatBlocks[i] : '';
    const parsed = parseOneCommit(formatText, numstatText);
    if (parsed) {
      commits.push(parsed);
    }
  }

  return commits;
}

function parseOneCommit(formatText: string, numstatText: string): RawCommit | null {
  const parts = formatText.split(FIELD_SEP);

  if (parts.length < EXPECTED_FIELD_COUNT) {
    console.warn(
      `[git-parser] Skipping malformed commit record: expected ${EXPECTED_FIELD_COUNT} fields, got ${parts.length}`,
    );
    return null;
  }

  const hash = parts[0].trim();
  const authorEmail = parts[1].trim();
  const authorName = parts[2].trim();
  const authorDate = parts[3].trim();
  const subject = parts[4].trim();
  const body = parts.slice(5).join(FIELD_SEP).trim();

  // Validate hash
  if (!/^[0-9a-f]{40}$/i.test(hash)) {
    console.warn(`[git-parser] Skipping record with invalid hash: "${hash.substring(0, 20)}..."`);
    return null;
  }

  // Parse numstat
  const { linesAdded, linesDeleted, filesChanged } = parseNumstat(numstatText);

  return {
    hash,
    authorEmail,
    authorName,
    authorDate,
    subject,
    body,
    linesAdded,
    linesDeleted,
    filesChanged,
    branch: null,
  };
}

function parseNumstat(text: string): {
  linesAdded: number;
  linesDeleted: number;
  filesChanged: number;
} {
  let linesAdded = 0;
  let linesDeleted = 0;
  let filesChanged = 0;

  if (!text || !text.trim()) {
    return { linesAdded, linesDeleted, filesChanged };
  }

  const lines = text.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Numstat format: <added>\t<deleted>\t<filepath>
    if (!isNumstatLine(trimmed)) continue;

    const tabParts = trimmed.split('\t');
    if (tabParts.length < 3) continue;

    const [added, deleted] = tabParts;

    filesChanged++;

    // Binary files show '-' for both added and deleted — count file but skip lines
    if (added === '-') continue;

    const addedNum = parseInt(added, 10);
    const deletedNum = parseInt(deleted, 10);

    if (!isNaN(addedNum)) linesAdded += addedNum;
    if (!isNaN(deletedNum)) linesDeleted += deletedNum;
  }

  return { linesAdded, linesDeleted, filesChanged };
}

function isNumstatLine(line: string): boolean {
  // Numstat format: <added>\t<deleted>\t<filepath>
  // or: -\t-\t<filepath> for binary files
  return /^(\d+|-)\t(\d+|-)\t.+/.test(line);
}
