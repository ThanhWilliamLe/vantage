import type { FastifyInstance } from 'fastify';
import { eq, and, isNull } from 'drizzle-orm';
import * as schema from '../data/schema.js';
import { IdentityGuessService } from '../services/identity-guess-service.js';
import { MemberService } from '../services/member-service.js';
import { ValidationError } from '../errors/index.js';

const VALID_PLATFORMS = ['github', 'gitlab', 'email', 'bitbucket', 'gitea'];

export async function identitySuggestionRoutes(app: FastifyInstance) {
  app.get('/api/members/identity-suggestions', async () => {
    return IdentityGuessService.getSuggestions(app.db);
  });

  app.post('/api/members/identity-suggestions/accept', async (request) => {
    const { authorRaw, memberId, platform } = request.body as {
      authorRaw: string;
      memberId: string;
      platform: string;
    };

    if (!authorRaw || !memberId) {
      throw new ValidationError('authorRaw and memberId are required');
    }

    const resolvedPlatform = platform && VALID_PLATFORMS.includes(platform) ? platform : 'email';

    // Create the identity mapping
    await MemberService.addIdentity(app.db, memberId, {
      platform: resolvedPlatform,
      value: authorRaw,
    });

    // Re-resolve all code changes with this authorRaw
    await app.db
      .update(schema.codeChange)
      .set({ authorMemberId: memberId, updatedAt: new Date().toISOString() })
      .where(
        and(eq(schema.codeChange.authorRaw, authorRaw), isNull(schema.codeChange.authorMemberId)),
      );

    // Return updated suggestions
    return IdentityGuessService.getSuggestions(app.db);
  });
}
