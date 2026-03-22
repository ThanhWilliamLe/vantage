import { describe, it, expect } from 'vitest';
import { scoreMember, namesMatch } from './identity-guess-service.js';

describe('namesMatch', () => {
  it('matches identical names', () => {
    expect(namesMatch('alice johnson', 'alice johnson')).toBe(true);
  });

  it('matches when one name is a subset of the other', () => {
    expect(namesMatch('alice', 'alice johnson')).toBe(true);
  });

  it('does not match completely different names', () => {
    expect(namesMatch('alice', 'bob')).toBe(false);
  });

  it('matches partial name parts (substring)', () => {
    expect(namesMatch('alex', 'alexander')).toBe(true);
  });
});

describe('scoreMember', () => {
  const member = { id: 'mem-1', name: 'Alice Johnson' };

  describe('Heuristic 1: Email domain match', () => {
    it('returns high confidence when same domain and name match', () => {
      const identities = [{ platform: 'email', value: 'alice@acme.com' }];
      const result = scoreMember('unknown@acme.com', 'Alice Johnson', member, identities);
      expect(result).not.toBeNull();
      expect(result!.confidence).toBe('high');
      expect(result!.reason).toContain('acme.com');
      expect(result!.reason).toContain('name match');
    });

    it('returns medium confidence when same domain but no name match', () => {
      const identities = [{ platform: 'email', value: 'alice@acme.com' }];
      const result = scoreMember('unknown@acme.com', null, member, identities);
      expect(result).not.toBeNull();
      expect(result!.confidence).toBe('medium');
      expect(result!.reason).toContain('acme.com');
    });

    it('returns null when domains differ', () => {
      const identities = [{ platform: 'email', value: 'alice@acme.com' }];
      const result = scoreMember('unknown@other.com', null, member, identities);
      expect(result).toBeNull();
    });
  });

  describe('Heuristic 2: Name similarity', () => {
    it('returns high confidence for exact name match', () => {
      const result = scoreMember('someuser', 'Alice Johnson', member, []);
      expect(result).not.toBeNull();
      expect(result!.confidence).toBe('high');
      expect(result!.reason).toBe('Exact name match');
    });

    it('returns medium confidence for partial name match', () => {
      const result = scoreMember('someuser', 'Alice J', member, []);
      expect(result).not.toBeNull();
      expect(result!.confidence).toBe('medium');
      expect(result!.reason).toBe('Name similarity match');
    });

    it('returns null when names do not match at all', () => {
      const result = scoreMember('someuser', 'Bob Smith', member, []);
      expect(result).toBeNull();
    });
  });

  describe('Heuristic 3: Email local part matches member name', () => {
    it('returns low confidence when email local part contains member name part', () => {
      const result = scoreMember('alice.something@example.com', null, member, []);
      expect(result).not.toBeNull();
      expect(result!.confidence).toBe('low');
      expect(result!.reason).toContain('alice');
    });

    it('skips short name parts (< 3 chars)', () => {
      const shortMember = { id: 'mem-2', name: 'Al Bo' };
      const result = scoreMember('al.something@example.com', null, shortMember, []);
      expect(result).toBeNull();
    });
  });

  describe('Heuristic 4: Cross-platform username correlation', () => {
    it('returns low confidence when username prefix matches identity', () => {
      const identities = [{ platform: 'github', value: 'alice-dev' }];
      const result = scoreMember(
        'alice_code',
        null,
        { id: 'mem-1', name: 'Someone Else' },
        identities,
      );
      expect(result).not.toBeNull();
      expect(result!.confidence).toBe('low');
      expect(result!.reason).toContain('github');
    });

    it('returns null when usernames do not share a prefix', () => {
      const identities = [{ platform: 'github', value: 'bob-dev' }];
      const result = scoreMember(
        'alice_code',
        null,
        { id: 'mem-1', name: 'Someone Else' },
        identities,
      );
      expect(result).toBeNull();
    });
  });

  describe('No match', () => {
    it('returns null when nothing matches', () => {
      const result = scoreMember('randomuser', null, { id: 'mem-3', name: 'Xyz Abc' }, []);
      expect(result).toBeNull();
    });
  });

  describe('Suggestion fields', () => {
    it('populates all fields correctly', () => {
      const result = scoreMember('someuser', 'Alice Johnson', member, []);
      expect(result).toEqual({
        authorRaw: 'someuser',
        authorName: 'Alice Johnson',
        suggestedMemberId: 'mem-1',
        suggestedMemberName: 'Alice Johnson',
        confidence: 'high',
        reason: 'Exact name match',
      });
    });
  });
});
