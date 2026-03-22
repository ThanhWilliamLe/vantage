import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ulid } from 'ulid';
import { eq, and, isNull } from 'drizzle-orm';
import { createTestDatabase } from '../data/test-helpers.js';
import { IdentityGuessService } from './identity-guess-service.js';
import { ProjectService } from './project-service.js';
import { MemberService } from './member-service.js';
import * as schema from '../data/schema.js';

const { db, sqlite } = createTestDatabase();

let projectId: string;
let repoId: string;
let memberAlice: string;
let memberBob: string;

beforeAll(async () => {
  const project = await ProjectService.create(db, { name: 'Test Project' });
  projectId = project.id;

  repoId = ulid();
  const now = new Date().toISOString();
  await db.insert(schema.repository).values({
    id: repoId,
    projectId,
    type: 'local',
    localPath: '/tmp/fake-identity-repo',
    createdAt: now,
  });

  // Create members
  const alice = await MemberService.create(db, { name: 'Alice Johnson' });
  memberAlice = alice.id;
  const bob = await MemberService.create(db, { name: 'Bob Smith' });
  memberBob = bob.id;

  // Add identities
  await MemberService.addIdentity(db, memberAlice, { platform: 'email', value: 'alice@acme.com' });
  await MemberService.addIdentity(db, memberBob, { platform: 'github', value: 'bobsmith' });

  // Seed code changes with null authorMemberId (unresolved)
  const seedChanges = [
    {
      id: ulid(),
      projectId,
      repoId,
      type: 'commit',
      platformId: ulid(),
      title: 'fix: something',
      authorMemberId: null,
      authorRaw: 'unknown@acme.com',
      authorName: 'Alice J',
      authoredAt: now,
      fetchedAt: now,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: ulid(),
      projectId,
      repoId,
      type: 'commit',
      platformId: ulid(),
      title: 'feat: another thing',
      authorMemberId: null,
      authorRaw: 'bobsm',
      authorName: null,
      authoredAt: now,
      fetchedAt: now,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: ulid(),
      projectId,
      repoId,
      type: 'commit',
      platformId: ulid(),
      title: 'chore: cleanup',
      authorMemberId: null,
      authorRaw: 'totally-unknown@nowhere.net',
      authorName: 'Nobody Known',
      authoredAt: now,
      fetchedAt: now,
      createdAt: now,
      updatedAt: now,
    },
    // Resolved change (should NOT appear in suggestions)
    {
      id: ulid(),
      projectId,
      repoId,
      type: 'commit',
      platformId: ulid(),
      title: 'docs: update readme',
      authorMemberId: memberAlice,
      authorRaw: 'alice@acme.com',
      authorName: 'Alice Johnson',
      authoredAt: now,
      fetchedAt: now,
      createdAt: now,
      updatedAt: now,
    },
  ];

  for (const change of seedChanges) {
    await db.insert(schema.codeChange).values(change);
  }
});

afterAll(() => {
  sqlite.close();
});

describe('IdentityGuessService.getSuggestions', () => {
  it('returns suggestions for unresolved authors', async () => {
    const suggestions = await IdentityGuessService.getSuggestions(db);
    expect(suggestions.length).toBeGreaterThanOrEqual(1);
  });

  it('suggests Alice for unknown@acme.com (same email domain + name match)', async () => {
    const suggestions = await IdentityGuessService.getSuggestions(db);
    const aliceSuggestion = suggestions.find((s) => s.authorRaw === 'unknown@acme.com');
    expect(aliceSuggestion).toBeDefined();
    expect(aliceSuggestion!.suggestedMemberId).toBe(memberAlice);
    expect(aliceSuggestion!.confidence).toBe('high');
  });

  it('suggests Bob for bobsm (username prefix match)', async () => {
    const suggestions = await IdentityGuessService.getSuggestions(db);
    const bobSuggestion = suggestions.find((s) => s.authorRaw === 'bobsm');
    expect(bobSuggestion).toBeDefined();
    expect(bobSuggestion!.suggestedMemberId).toBe(memberBob);
    expect(bobSuggestion!.confidence).toBe('low');
  });

  it('does not suggest for totally unknown authors', async () => {
    const suggestions = await IdentityGuessService.getSuggestions(db);
    const unknown = suggestions.find((s) => s.authorRaw === 'totally-unknown@nowhere.net');
    expect(unknown).toBeUndefined();
  });

  it('does not include already-resolved authors', async () => {
    const suggestions = await IdentityGuessService.getSuggestions(db);
    // alice@acme.com has a resolved code change, but also an unresolved one
    // The resolved code change should not cause alice@acme.com to be excluded
    // since there are also unresolved changes with that authorRaw
    // Actually in our seed data, unknown@acme.com is the unresolved one, not alice@acme.com
    const resolved = suggestions.find(
      (s) => s.authorRaw === 'alice@acme.com' && s.suggestedMemberId === memberAlice,
    );
    // alice@acme.com has a resolved change, it should NOT appear (the resolved one has authorMemberId set)
    // But there's no unresolved change with authorRaw='alice@acme.com', so it won't appear
    expect(resolved).toBeUndefined();
  });
});

describe('Accept suggestion flow', () => {
  it('creates identity and updates code changes when accepted', async () => {
    // Accept the suggestion for unknown@acme.com -> Alice
    await MemberService.addIdentity(db, memberAlice, {
      platform: 'email',
      value: 'unknown@acme.com',
    });

    await db
      .update(schema.codeChange)
      .set({ authorMemberId: memberAlice, updatedAt: new Date().toISOString() })
      .where(
        and(
          eq(schema.codeChange.authorRaw, 'unknown@acme.com'),
          isNull(schema.codeChange.authorMemberId),
        ),
      );

    // Verify the code change is now resolved
    const changes = await db
      .select()
      .from(schema.codeChange)
      .where(eq(schema.codeChange.authorRaw, 'unknown@acme.com'))
      .all();

    for (const change of changes) {
      expect(change.authorMemberId).toBe(memberAlice);
    }

    // Verify suggestions no longer include unknown@acme.com
    const suggestions = await IdentityGuessService.getSuggestions(db);
    const gone = suggestions.find((s) => s.authorRaw === 'unknown@acme.com');
    expect(gone).toBeUndefined();
  });
});
