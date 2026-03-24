import { eq, isNull } from 'drizzle-orm';
import * as schema from '../data/schema.js';
import type { DrizzleDB } from '../data/db.js';
import type { IdentitySuggestion } from '@twle/vantage-shared';

export const IdentityGuessService = {
  async getSuggestions(db: DrizzleDB): Promise<IdentitySuggestion[]> {
    // 1. Get all unresolved authors (authorMemberId IS NULL), grouped by authorRaw
    // 2. Get all active members with their identities
    // 3. For each unresolved author, run heuristics against all members
    // 4. Return best suggestion per author (highest confidence)

    const unresolvedChanges = await db
      .select({
        authorRaw: schema.codeChange.authorRaw,
        authorName: schema.codeChange.authorName,
      })
      .from(schema.codeChange)
      .where(isNull(schema.codeChange.authorMemberId))
      .all();

    // Deduplicate by authorRaw
    const unresolvedMap = new Map<string, string | null>();
    for (const c of unresolvedChanges) {
      if (!unresolvedMap.has(c.authorRaw)) {
        unresolvedMap.set(c.authorRaw, c.authorName);
      }
    }

    if (unresolvedMap.size === 0) return [];

    const members = await db
      .select()
      .from(schema.member)
      .where(eq(schema.member.status, 'active'))
      .all();
    const identities = await db.select().from(schema.memberIdentity).all();

    // Build member -> identities map
    const memberIdentities = new Map<string, Array<{ platform: string; value: string }>>();
    for (const id of identities) {
      if (!memberIdentities.has(id.memberId)) memberIdentities.set(id.memberId, []);
      memberIdentities.get(id.memberId)!.push({ platform: id.platform, value: id.value });
    }

    // Load dismissed suggestions
    const dismissals = await db.select().from(schema.identitySuggestionDismissal).all();
    const dismissedSet = new Set(dismissals.map((d) => `${d.authorRaw}::${d.suggestedMemberId}`));

    const suggestions: IdentitySuggestion[] = [];

    for (const [authorRaw, authorName] of unresolvedMap) {
      const candidates: IdentitySuggestion[] = [];

      for (const member of members) {
        const mIds = memberIdentities.get(member.id) || [];
        const suggestion = scoreMember(authorRaw, authorName, member, mIds);
        if (suggestion && !dismissedSet.has(`${authorRaw}::${member.id}`)) {
          candidates.push(suggestion);
        }
      }

      // Sort by confidence (high first) and take top 3
      candidates.sort((a, b) => confidenceRank(b.confidence) - confidenceRank(a.confidence));
      suggestions.push(...candidates.slice(0, 3));
    }

    return suggestions;
  },
};

function confidenceRank(c: 'high' | 'medium' | 'low'): number {
  return c === 'high' ? 3 : c === 'medium' ? 2 : 1;
}

export function scoreMember(
  authorRaw: string,
  authorName: string | null,
  member: { id: string; name: string; aliases?: string | null },
  identities: Array<{ platform: string; value: string }>,
): IdentitySuggestion | null {
  const rawLower = authorRaw.toLowerCase();
  const nameLower = (authorName || '').toLowerCase();
  const memberLower = member.name.toLowerCase();
  const memberParts = memberLower.split(/\s+/);

  // Heuristic 1: Email domain match
  if (rawLower.includes('@')) {
    const [, rawDomain] = rawLower.split('@');
    for (const id of identities) {
      if (id.value.includes('@')) {
        const [, idDomain] = id.value.toLowerCase().split('@');
        if (rawDomain && idDomain && rawDomain === idDomain) {
          // Same domain -- check name similarity too for medium confidence
          if (nameLower && memberLower && namesMatch(nameLower, memberLower)) {
            return makeSuggestion(
              authorRaw,
              authorName,
              member,
              'high',
              `Same email domain (${rawDomain}) and name match`,
            );
          }
          return makeSuggestion(
            authorRaw,
            authorName,
            member,
            'medium',
            `Same email domain: ${rawDomain}`,
          );
        }
      }
    }
  }

  // Heuristic 2: Name similarity (git author name vs member name)
  if (nameLower && memberLower) {
    if (nameLower === memberLower) {
      return makeSuggestion(authorRaw, authorName, member, 'high', 'Exact name match');
    }
    if (namesMatch(nameLower, memberLower)) {
      return makeSuggestion(authorRaw, authorName, member, 'medium', 'Name similarity match');
    }
  }

  // Heuristic 2b: Alias match
  if (member.aliases) {
    const aliasList = member.aliases
      .split(',')
      .map((a) => a.trim().toLowerCase())
      .filter(Boolean);
    for (const alias of aliasList) {
      if (nameLower && (nameLower === alias || namesMatch(nameLower, alias))) {
        return makeSuggestion(authorRaw, authorName, member, 'medium', `Alias match: "${alias}"`);
      }
      if (rawLower.includes('@')) {
        const localPart = rawLower.split('@')[0].replace(/[._-]/g, ' ');
        if (alias.length >= 3 && localPart.includes(alias)) {
          return makeSuggestion(
            authorRaw,
            authorName,
            member,
            'low',
            `Email contains alias "${alias}"`,
          );
        }
      }
    }
  }

  // Heuristic 3: Email local part matches member name
  if (rawLower.includes('@')) {
    const localPart = rawLower.split('@')[0].replace(/[._-]/g, ' ');
    for (const part of memberParts) {
      if (part.length >= 3 && localPart.includes(part)) {
        return makeSuggestion(
          authorRaw,
          authorName,
          member,
          'low',
          `Email local part contains "${part}"`,
        );
      }
    }
  }

  // Heuristic 4: Cross-platform username correlation
  for (const id of identities) {
    const idLower = id.value.toLowerCase().replace(/[._-]/g, '');
    const rawNorm = rawLower.replace(/[._@-]/g, '').split('@')[0] || rawLower;
    if (idLower.length >= 3 && rawNorm.length >= 3) {
      const prefix = rawNorm.substring(0, Math.min(rawNorm.length, 5));
      if (idLower.startsWith(prefix)) {
        return makeSuggestion(
          authorRaw,
          authorName,
          member,
          'low',
          `Username prefix match with ${id.platform} identity`,
        );
      }
    }
  }

  return null;
}

export function namesMatch(a: string, b: string): boolean {
  const partsA = a.split(/\s+/);
  const partsB = b.split(/\s+/);
  // Check if all parts of shorter name are substrings of longer name
  const shorter = partsA.length <= partsB.length ? partsA : partsB;
  const longer = partsA.length > partsB.length ? partsA : partsB;
  return shorter.every((p) => longer.some((l) => l.includes(p) || p.includes(l)));
}

function makeSuggestion(
  authorRaw: string,
  authorName: string | null,
  member: { id: string; name: string },
  confidence: 'high' | 'medium' | 'low',
  reason: string,
): IdentitySuggestion {
  return {
    authorRaw,
    authorName,
    suggestedMemberId: member.id,
    suggestedMemberName: member.name,
    confidence,
    reason,
  };
}
