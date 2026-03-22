import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../app.js';
import { createTestDatabase } from '../data/test-helpers.js';
import { ProjectService } from '../services/project-service.js';
import { MemberService } from '../services/member-service.js';
import * as schema from '../data/schema.js';

const { db, sqlite } = createTestDatabase();
const app = buildApp({ db, key: Buffer.alloc(32) });

let projectId: string;
let memberId: string;

beforeAll(async () => {
  await app.ready();
  const project = await ProjectService.create(db, { name: 'ImportTest' });
  projectId = project.id;
  const member = await MemberService.create(db, { name: 'Alice Smith' });
  memberId = member.id;
});

afterAll(async () => {
  await app.close();
  sqlite.close();
});

const validCSV = `Name,Date,Description,Project,Score
Alice Smith,2025-12-15,Worked on auth,ImportTest,7
Alice Smith,2025-12-16,API improvements,ImportTest,6
Bob Jones,2025-12-15,Frontend work,ImportTest,5`;

function toBase64(str: string): string {
  return Buffer.from(str, 'utf-8').toString('base64');
}

describe('POST /api/import/parse', () => {
  it('parses a valid CSV file', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/import/parse',
      payload: { fileContent: toBase64(validCSV), filename: 'test.csv' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.fileId).toBeTruthy();
    expect(body.headers).toEqual(['Name', 'Date', 'Description', 'Project', 'Score']);
    expect(body.rowCount).toBe(3);
    expect(body.preview).toHaveLength(3);
    expect(body.preview[0].Name).toBe('Alice Smith');
  });

  it('rejects CSV with headers only', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/import/parse',
      payload: { fileContent: toBase64('Name,Date,Description\n'), filename: 'empty.csv' },
    });

    expect(res.statusCode).toBe(400);
  });
});

describe('POST /api/import/validate', () => {
  it('validates mappings and finds member matches', async () => {
    // First parse
    const parseRes = await app.inject({
      method: 'POST',
      url: '/api/import/parse',
      payload: { fileContent: toBase64(validCSV), filename: 'test.csv' },
    });
    const { fileId } = JSON.parse(parseRes.payload);

    // Then validate
    const res = await app.inject({
      method: 'POST',
      url: '/api/import/validate',
      payload: {
        fileId,
        mapping: {
          memberName: 'Name',
          date: 'Date',
          description: 'Description',
          projectName: 'Project',
          workloadScore: 'Score',
        },
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.totalRows).toBe(3);
    expect(body.dateErrors).toHaveLength(0);

    // Alice Smith should match the seeded member
    const aliceMatch = body.memberMatches.find(
      (m: { csvName: string }) => m.csvName === 'Alice Smith',
    );
    expect(aliceMatch?.matchedMemberId).toBe(memberId);

    // Bob Jones should not match
    const bobMatch = body.memberMatches.find((m: { csvName: string }) => m.csvName === 'Bob Jones');
    expect(bobMatch?.matchedMemberId).toBeNull();

    // ImportTest should match the seeded project
    const projMatch = body.projectMatches.find(
      (p: { csvName: string }) => p.csvName === 'ImportTest',
    );
    expect(projMatch?.matchedProjectId).toBe(projectId);
  });

  it('detects invalid dates', async () => {
    const badCSV = `Name,Date,Description\nAlice Smith,not-a-date,test`;
    const parseRes = await app.inject({
      method: 'POST',
      url: '/api/import/parse',
      payload: { fileContent: toBase64(badCSV), filename: 'bad.csv' },
    });
    const { fileId } = JSON.parse(parseRes.payload);

    const res = await app.inject({
      method: 'POST',
      url: '/api/import/validate',
      payload: {
        fileId,
        mapping: { memberName: 'Name', date: 'Date', description: 'Description' },
      },
    });

    const body = JSON.parse(res.payload);
    expect(body.dateErrors).toHaveLength(1);
    expect(body.dateErrors[0].row).toBe(1);
    expect(body.dateErrors[0].value).toBe('not-a-date');
  });
});

describe('POST /api/import/execute', () => {
  it('imports entries with matched members', async () => {
    const csv = `Name,Date,Description,Score\nAlice Smith,2025-11-01,Sprint work,8`;

    const parseRes = await app.inject({
      method: 'POST',
      url: '/api/import/parse',
      payload: { fileContent: toBase64(csv), filename: 'exec.csv' },
    });
    const { fileId } = JSON.parse(parseRes.payload);

    const res = await app.inject({
      method: 'POST',
      url: '/api/import/execute',
      payload: {
        fileId,
        mapping: {
          memberName: 'Name',
          date: 'Date',
          description: 'Description',
          workloadScore: 'Score',
        },
        memberResolutions: { 'Alice Smith': memberId },
        projectResolutions: {},
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.imported).toBe(1);
    expect(body.skipped).toBe(0);

    // Verify the entry was created with source = 'imported'
    const entries = db
      .select()
      .from(schema.evaluationEntry)
      .where(schema.evaluationEntry.source ? undefined : undefined)
      .all();

    const imported = entries.find((e) => e.date === '2025-11-01' && e.memberId === memberId);
    expect(imported).toBeTruthy();
    expect(imported!.source).toBe('imported');
    expect(imported!.workloadScore).toBe(8);
  });

  it('creates new members when resolution is create', async () => {
    const csv = `Name,Date,Description\nNew Person,2025-10-01,Onboarding`;

    const parseRes = await app.inject({
      method: 'POST',
      url: '/api/import/parse',
      payload: { fileContent: toBase64(csv), filename: 'create.csv' },
    });
    const { fileId } = JSON.parse(parseRes.payload);

    const res = await app.inject({
      method: 'POST',
      url: '/api/import/execute',
      payload: {
        fileId,
        mapping: { memberName: 'Name', date: 'Date', description: 'Description' },
        memberResolutions: { 'New Person': 'create:New Person' },
        projectResolutions: {},
      },
    });

    const body = JSON.parse(res.payload);
    expect(body.imported).toBe(1);
    expect(body.newMembers).toBe(1);

    // Verify member was created
    const newMember = db
      .select()
      .from(schema.member)
      .all()
      .find((m) => m.name === 'New Person');
    expect(newMember).toBeTruthy();
  });

  it('skips duplicate entries', async () => {
    // Import same entry twice — second should be skipped
    const csv = `Name,Date,Description\nAlice Smith,2025-11-01,Sprint work`;

    const parseRes = await app.inject({
      method: 'POST',
      url: '/api/import/parse',
      payload: { fileContent: toBase64(csv), filename: 'dupe.csv' },
    });
    const { fileId } = JSON.parse(parseRes.payload);

    const res = await app.inject({
      method: 'POST',
      url: '/api/import/execute',
      payload: {
        fileId,
        mapping: { memberName: 'Name', date: 'Date', description: 'Description' },
        memberResolutions: { 'Alice Smith': memberId },
        projectResolutions: {},
      },
    });

    const body = JSON.parse(res.payload);
    expect(body.imported).toBe(0);
    expect(body.skipped).toBe(1);
  });

  it('skips rows where member resolution is skip', async () => {
    const csv = `Name,Date,Description\nUnknown,2025-09-01,test`;

    const parseRes = await app.inject({
      method: 'POST',
      url: '/api/import/parse',
      payload: { fileContent: toBase64(csv), filename: 'skip.csv' },
    });
    const { fileId } = JSON.parse(parseRes.payload);

    const res = await app.inject({
      method: 'POST',
      url: '/api/import/execute',
      payload: {
        fileId,
        mapping: { memberName: 'Name', date: 'Date', description: 'Description' },
        memberResolutions: { Unknown: 'skip' },
        projectResolutions: {},
      },
    });

    const body = JSON.parse(res.payload);
    expect(body.imported).toBe(0);
    expect(body.skipped).toBe(1);
  });
});
