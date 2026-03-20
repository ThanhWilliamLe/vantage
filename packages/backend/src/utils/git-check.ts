import { execFileSync } from 'node:child_process';
import { GitError } from '../errors/index.js';

export function validateGitInstallation(): string {
  try {
    const output = execFileSync('git', ['--version'], {
      encoding: 'utf8',
      timeout: 5000,
    }).trim();
    return output;
  } catch {
    throw new GitError(
      'Git is not installed or not available in PATH. Please install git: https://git-scm.com/downloads',
      'GIT_NOT_INSTALLED',
    );
  }
}
