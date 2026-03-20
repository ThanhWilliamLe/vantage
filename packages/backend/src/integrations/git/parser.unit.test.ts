import { describe, it, expect } from 'vitest';
import { parseCommitLogOutput } from './parser.js';

const RS = '\x1e'; // Record Separator
const FS = '\x1f'; // Field Separator

/**
 * Build realistic git log output matching the actual format:
 *   <fields1>\x1e\n\n<numstat1>\n<fields2>\x1e\n\n<numstat2>\n
 *
 * The numstat for a commit appears AFTER the \x1e for that commit.
 */
function buildLogOutput(
  commits: Array<{
    hash: string;
    email: string;
    name: string;
    date: string;
    subject: string;
    body: string;
    numstat?: string;
  }>,
): string {
  let output = '';
  for (let i = 0; i < commits.length; i++) {
    const c = commits[i];
    const fields = [c.hash, c.email, c.name, c.date, c.subject, c.body].join(FS);
    output += fields + RS;
    if (c.numstat) {
      output += '\n\n' + c.numstat + '\n';
    }
  }
  return output;
}

describe('parseCommitLogOutput', () => {
  it('parses a single commit with numstat', () => {
    const output = buildLogOutput([
      {
        hash: 'a'.repeat(40),
        email: 'alice@example.com',
        name: 'Alice',
        date: '2026-03-19T10:00:00+00:00',
        subject: 'Add feature X',
        body: 'Detailed description of feature X',
        numstat: '10\t2\tsrc/feature.ts\n3\t1\tsrc/utils.ts',
      },
    ]);

    const commits = parseCommitLogOutput(output);
    expect(commits).toHaveLength(1);
    expect(commits[0].hash).toBe('a'.repeat(40));
    expect(commits[0].authorEmail).toBe('alice@example.com');
    expect(commits[0].authorName).toBe('Alice');
    expect(commits[0].authorDate).toBe('2026-03-19T10:00:00+00:00');
    expect(commits[0].subject).toBe('Add feature X');
    expect(commits[0].body).toBe('Detailed description of feature X');
    expect(commits[0].linesAdded).toBe(13);
    expect(commits[0].linesDeleted).toBe(3);
    expect(commits[0].filesChanged).toBe(2);
  });

  it('parses multiple commits with numstat', () => {
    const output = buildLogOutput([
      {
        hash: 'a'.repeat(40),
        email: 'alice@example.com',
        name: 'Alice',
        date: '2026-03-19T10:00:00+00:00',
        subject: 'Second commit',
        body: '',
        numstat: '2\t3\tsrc/main.ts',
      },
      {
        hash: 'b'.repeat(40),
        email: 'bob@example.com',
        name: 'Bob',
        date: '2026-03-18T09:00:00+00:00',
        subject: 'First commit',
        body: 'Some body',
        numstat: '5\t0\tREADME.md',
      },
    ]);

    const commits = parseCommitLogOutput(output);

    expect(commits).toHaveLength(2);
    expect(commits[0].hash).toBe('a'.repeat(40));
    expect(commits[0].subject).toBe('Second commit');
    expect(commits[0].linesAdded).toBe(2);
    expect(commits[0].linesDeleted).toBe(3);
    expect(commits[1].hash).toBe('b'.repeat(40));
    expect(commits[1].subject).toBe('First commit');
    expect(commits[1].linesAdded).toBe(5);
    expect(commits[1].linesDeleted).toBe(0);
  });

  it('handles commit with no body', () => {
    const output = buildLogOutput([
      {
        hash: 'c'.repeat(40),
        email: 'charlie@example.com',
        name: 'Charlie',
        date: '2026-03-19T12:00:00+00:00',
        subject: 'Quick fix',
        body: '',
      },
    ]);

    const commits = parseCommitLogOutput(output);
    expect(commits).toHaveLength(1);
    expect(commits[0].body).toBe('');
    expect(commits[0].linesAdded).toBe(0);
    expect(commits[0].linesDeleted).toBe(0);
    expect(commits[0].filesChanged).toBe(0);
  });

  it('handles empty output', () => {
    expect(parseCommitLogOutput('')).toEqual([]);
    expect(parseCommitLogOutput('  ')).toEqual([]);
    expect(parseCommitLogOutput('\n')).toEqual([]);
  });

  it('skips malformed records with too few fields', () => {
    // Build a raw string with a malformed record followed by a valid one
    const malformed = ['abc', 'email@test.com', 'Name'].join(FS) + RS;
    const valid = buildLogOutput([
      {
        hash: 'd'.repeat(40),
        email: 'dave@example.com',
        name: 'Dave',
        date: '2026-03-19T14:00:00+00:00',
        subject: 'Valid commit',
        body: '',
      },
    ]);

    const output = malformed + valid;
    const commits = parseCommitLogOutput(output);

    // Should skip the malformed record and parse the valid one
    expect(commits).toHaveLength(1);
    expect(commits[0].hash).toBe('d'.repeat(40));
  });

  it('skips records with invalid hash', () => {
    const output = buildLogOutput([
      {
        hash: 'not-a-valid-hash',
        email: 'test@example.com',
        name: 'Test',
        date: '2026-03-19T10:00:00+00:00',
        subject: 'Bad hash commit',
        body: '',
      },
    ]);

    const commits = parseCommitLogOutput(output);
    expect(commits).toHaveLength(0);
  });

  it('handles binary files in numstat (dash for lines)', () => {
    const output = buildLogOutput([
      {
        hash: 'e'.repeat(40),
        email: 'eve@example.com',
        name: 'Eve',
        date: '2026-03-19T15:00:00+00:00',
        subject: 'Add image',
        body: '',
        numstat: '-\t-\tassets/logo.png\n5\t0\tsrc/index.ts',
      },
    ]);

    const commits = parseCommitLogOutput(output);
    expect(commits).toHaveLength(1);
    // Binary file lines are 0, but file IS counted
    expect(commits[0].linesAdded).toBe(5);
    expect(commits[0].linesDeleted).toBe(0);
    // Both files count (binary + text)
    expect(commits[0].filesChanged).toBe(2);
  });

  it('handles merge commits (no numstat)', () => {
    const output = buildLogOutput([
      {
        hash: 'f'.repeat(40),
        email: 'frank@example.com',
        name: 'Frank',
        date: '2026-03-19T16:00:00+00:00',
        subject: "Merge branch 'feature' into main",
        body: '',
      },
    ]);

    const commits = parseCommitLogOutput(output);
    expect(commits).toHaveLength(1);
    expect(commits[0].subject).toBe("Merge branch 'feature' into main");
    expect(commits[0].linesAdded).toBe(0);
    expect(commits[0].linesDeleted).toBe(0);
    expect(commits[0].filesChanged).toBe(0);
  });

  it('handles multiline body', () => {
    const output = buildLogOutput([
      {
        hash: 'a1b2c3d4'.repeat(5),
        email: 'dev@example.com',
        name: 'Dev',
        date: '2026-03-19T17:00:00+00:00',
        subject: 'Major refactor',
        body: 'This is the first line of the body.\n\nThis is the second paragraph.\n\n- bullet point 1\n- bullet point 2',
      },
    ]);

    const commits = parseCommitLogOutput(output);
    expect(commits).toHaveLength(1);
    expect(commits[0].body).toContain('first line of the body');
    expect(commits[0].body).toContain('bullet point 2');
  });

  it('handles commit with body containing special characters', () => {
    const output = buildLogOutput([
      {
        hash: 'ab'.repeat(20),
        email: 'dev@example.com',
        name: 'Dev',
        date: '2026-03-19T18:00:00+00:00',
        subject: 'Fix encoding issue',
        body: 'Fixed handling of <html> tags & "quotes" in output',
      },
    ]);

    const commits = parseCommitLogOutput(output);
    expect(commits).toHaveLength(1);
    expect(commits[0].body).toContain('<html>');
    expect(commits[0].body).toContain('&');
    expect(commits[0].body).toContain('"quotes"');
  });

  it('sets branch to null by default (resolved separately)', () => {
    const output = buildLogOutput([
      {
        hash: 'a'.repeat(40),
        email: 'alice@example.com',
        name: 'Alice',
        date: '2026-03-19T10:00:00+00:00',
        subject: 'Some commit',
        body: '',
        numstat: '1\t0\tfile.ts',
      },
    ]);

    const commits = parseCommitLogOutput(output);
    expect(commits).toHaveLength(1);
    expect(commits[0].branch).toBeNull();
  });

  it('correctly associates numstat with the right commit in multi-commit output', () => {
    // This is the critical test: verify that numstat goes to the right commit
    const output = buildLogOutput([
      {
        hash: 'a'.repeat(40),
        email: 'alice@example.com',
        name: 'Alice',
        date: '2026-03-19T10:00:00+00:00',
        subject: 'Commit A',
        body: '',
        numstat: '10\t5\tfileA.ts',
      },
      {
        hash: 'b'.repeat(40),
        email: 'bob@example.com',
        name: 'Bob',
        date: '2026-03-18T10:00:00+00:00',
        subject: 'Commit B',
        body: '',
        numstat: '20\t0\tfileB.ts\n3\t1\tfileB2.ts',
      },
      {
        hash: 'c'.repeat(40),
        email: 'charlie@example.com',
        name: 'Charlie',
        date: '2026-03-17T10:00:00+00:00',
        subject: 'Commit C',
        body: '',
        numstat: '1\t1\tfileC.ts',
      },
    ]);

    const commits = parseCommitLogOutput(output);
    expect(commits).toHaveLength(3);

    // Commit A: 10 added, 5 deleted, 1 file
    expect(commits[0].subject).toBe('Commit A');
    expect(commits[0].linesAdded).toBe(10);
    expect(commits[0].linesDeleted).toBe(5);
    expect(commits[0].filesChanged).toBe(1);

    // Commit B: 23 added, 1 deleted, 2 files
    expect(commits[1].subject).toBe('Commit B');
    expect(commits[1].linesAdded).toBe(23);
    expect(commits[1].linesDeleted).toBe(1);
    expect(commits[1].filesChanged).toBe(2);

    // Commit C: 1 added, 1 deleted, 1 file
    expect(commits[2].subject).toBe('Commit C');
    expect(commits[2].linesAdded).toBe(1);
    expect(commits[2].linesDeleted).toBe(1);
    expect(commits[2].filesChanged).toBe(1);
  });
});
