import { describe, it, expect } from 'vitest';
import { validateGitInstallation } from './git-check.js';
import { GitError } from '../errors/index.js';

describe('validateGitInstallation', () => {
  it('succeeds when git is installed and returns version string', () => {
    const version = validateGitInstallation();
    expect(version).toMatch(/^git version/);
  });

  it('GitError has correct code and message when constructed for git-not-installed', () => {
    // Test the error class directly since we can't easily mock execFileSync in ESM
    const error = new GitError(
      'Git is not installed or not available in PATH. Please install git: https://git-scm.com/downloads',
      'GIT_NOT_INSTALLED',
    );
    expect(error).toBeInstanceOf(GitError);
    expect(error.code).toBe('GIT_NOT_INSTALLED');
    expect(error.statusCode).toBe(502);
    expect(error.message).toContain('https://git-scm.com/downloads');
  });
});
