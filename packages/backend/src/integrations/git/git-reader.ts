import { stat, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import simpleGit from 'simple-git';
import { GitError } from '../../errors/git.js';
import { parseCommitLogOutput } from './parser.js';
import type { RawCommit, DiffStats } from './types.js';

/**
 * Check if a repository path is a git worktree (as opposed to a normal repo).
 * Worktrees have a `.git` file (not directory) containing a gitdir pointer.
 */
export async function isWorktree(repoPath: string): Promise<boolean> {
  try {
    const gitPath = join(repoPath, '.git');
    const s = await stat(gitPath);
    return s.isFile(); // file = worktree, directory = normal repo
  } catch {
    return false;
  }
}

/**
 * If the path is a worktree, resolve the main repo's .git directory.
 * Otherwise returns null.
 */
export async function getMainGitDir(repoPath: string): Promise<string | null> {
  try {
    const gitPath = join(repoPath, '.git');
    const s = await stat(gitPath);
    if (!s.isFile()) return null;

    const content = await readFile(gitPath, 'utf-8');
    const match = content.match(/^gitdir:\s*(.+)$/m);
    if (!match) return null;

    // The gitdir points to .git/worktrees/<name>, resolve to main .git
    const worktreeGitDir = match[1].trim();
    // Navigate up from .git/worktrees/<name> to .git
    const parts = worktreeGitDir.replace(/\\/g, '/').split('/');
    const worktreesIdx = parts.lastIndexOf('worktrees');
    if (worktreesIdx >= 1) {
      return parts.slice(0, worktreesIdx).join('/');
    }
    return worktreeGitDir;
  } catch {
    return null;
  }
}

const EMPTY_TREE_SHA = '4b825dc642cb6eb9a060e54bf899d15363d7c354';
const MAX_DIFF_SIZE = 512_000; // 500 KB

const LOG_FORMAT = '%H%x1f%ae%x1f%an%x1f%aI%x1f%s%x1f%b%x1e';

function createGit(repoPath: string) {
  return simpleGit({
    baseDir: repoPath,
    binary: 'git',
    maxConcurrentProcesses: 4,
    trimmed: false,
    timeout: {
      block: 30_000,
    },
  });
}

function mapError(err: unknown, repoPath: string): GitError {
  const message = err instanceof Error ? err.message : String(err);
  const cause = err instanceof Error ? err : undefined;

  if (message.includes('ENOENT') || message.includes('spawn git')) {
    return new GitError(
      'Git is not installed or not found in PATH',
      'GIT_NOT_INSTALLED',
      { repoPath },
      cause,
    );
  }

  if (message.includes('does not exist') || message.includes('no such file or directory')) {
    return new GitError(
      `Repository path not found: ${repoPath}`,
      'GIT_REPO_NOT_FOUND',
      { repoPath },
      cause,
    );
  }

  if (message.includes('not a git repository')) {
    return new GitError(
      `Path is not a git repository: ${repoPath}`,
      'GIT_NOT_A_REPO',
      { repoPath },
      cause,
    );
  }

  if (message.includes('Permission denied') || message.includes('EACCES')) {
    return new GitError(
      `Permission denied accessing repository: ${repoPath}`,
      'GIT_PERMISSION_DENIED',
      { repoPath },
      cause,
    );
  }

  if (message.includes('unknown revision') || message.includes('bad object')) {
    return new GitError(`Invalid commit hash or revision`, 'GIT_INVALID_HASH', { repoPath }, cause);
  }

  if (message.includes('timeout') || message.includes('timed out')) {
    return new GitError(`Git operation timed out`, 'GIT_TIMEOUT', { repoPath }, cause);
  }

  if (message.includes('corrupt') || message.includes('bad signature')) {
    return new GitError(
      `Repository appears to be corrupt: ${repoPath}`,
      'GIT_CORRUPT_REPO',
      { repoPath },
      cause,
    );
  }

  return new GitError(`Git operation failed: ${message}`, 'GIT_UNKNOWN', { repoPath }, cause);
}

export const GitReader = {
  async validateRepository(repoPath: string): Promise<boolean> {
    try {
      const git = createGit(repoPath);
      return await git.checkIsRepo();
    } catch (err) {
      throw mapError(err, repoPath);
    }
  },

  async getBranches(repoPath: string): Promise<string[]> {
    try {
      const git = createGit(repoPath);
      const result = await git.branch(['-a']);
      return result.all;
    } catch (err) {
      // Empty repo with no commits — return empty array
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('does not have any commits')) {
        return [];
      }
      throw mapError(err, repoPath);
    }
  },

  async getAllCommits(repoPath: string): Promise<RawCommit[]> {
    try {
      const git = createGit(repoPath);
      const output = await git.raw(['log', '--all', `--format=${LOG_FORMAT}`, '--numstat']);
      return parseCommitLogOutput(output);
    } catch (err) {
      // Empty repo with no commits — return empty array
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('does not have any commits') || message.includes('unknown revision')) {
        return [];
      }
      throw mapError(err, repoPath);
    }
  },

  async getNewCommits(repoPath: string, afterDate: string): Promise<RawCommit[]> {
    try {
      const git = createGit(repoPath);
      const output = await git.raw([
        'log',
        '--all',
        `--after=${afterDate}`,
        `--format=${LOG_FORMAT}`,
        '--numstat',
      ]);
      return parseCommitLogOutput(output);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('does not have any commits') || message.includes('unknown revision')) {
        return [];
      }
      throw mapError(err, repoPath);
    }
  },

  async getDiff(repoPath: string, commitHash: string): Promise<string> {
    try {
      const git = createGit(repoPath);
      try {
        return await git.diff([`${commitHash}^..${commitHash}`]);
      } catch (innerErr) {
        // If the commit has no parent (root commit), diff against empty tree
        const msg = innerErr instanceof Error ? innerErr.message : String(innerErr);
        if (msg.includes('unknown revision') || msg.includes('bad revision')) {
          return await git.diff([`${EMPTY_TREE_SHA}..${commitHash}`]);
        }
        throw innerErr;
      }
    } catch (err) {
      throw mapError(err, repoPath);
    }
  },

  async getDiffForAPI(
    repoPath: string,
    commitHash: string,
  ): Promise<{ diff: string; truncated: boolean }> {
    const fullDiff = await GitReader.getDiff(repoPath, commitHash);
    if (fullDiff.length > MAX_DIFF_SIZE) {
      return { diff: fullDiff.substring(0, MAX_DIFF_SIZE), truncated: true };
    }
    return { diff: fullDiff, truncated: false };
  },

  async getDiffStats(repoPath: string, commitHash: string): Promise<DiffStats> {
    try {
      const git = createGit(repoPath);
      try {
        const summary = await git.diffSummary([`${commitHash}^..${commitHash}`]);
        return {
          linesAdded: summary.insertions,
          linesDeleted: summary.deletions,
          filesChanged: summary.changed,
        };
      } catch (innerErr) {
        const msg = innerErr instanceof Error ? innerErr.message : String(innerErr);
        if (msg.includes('unknown revision') || msg.includes('bad revision')) {
          const summary = await git.diffSummary([`${EMPTY_TREE_SHA}..${commitHash}`]);
          return {
            linesAdded: summary.insertions,
            linesDeleted: summary.deletions,
            filesChanged: summary.changed,
          };
        }
        throw innerErr;
      }
    } catch (err) {
      throw mapError(err, repoPath);
    }
  },

  async getBranchesForCommits(repoPath: string, hashes: string[]): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    if (hashes.length === 0) return result;

    try {
      const git = createGit(repoPath);
      // Use git name-rev to resolve branch names for multiple hashes at once.
      // name-rev maps a commit to the nearest named ref (branch/tag).
      const output = await git.raw(['name-rev', '--name-only', '--refs=refs/heads/*', ...hashes]);

      const lines = output.trim().split('\n');
      for (let i = 0; i < hashes.length && i < lines.length; i++) {
        const branchRaw = lines[i].trim();
        // name-rev returns "undefined" if no branch contains the commit,
        // or "branchName~N" for commits N behind the tip.
        if (branchRaw && branchRaw !== 'undefined') {
          // Strip ~N suffix to get the base branch name
          const branch = branchRaw.replace(/[~^]\d+$/, '');
          result.set(hashes[i], branch);
        }
      }
    } catch (err) {
      // Non-fatal: branch resolution is best-effort
      const message = err instanceof Error ? err.message : String(err);
      if (!message.includes('does not have any commits')) {
        console.warn(`[git-reader] Branch resolution failed for ${repoPath}: ${message}`);
      }
    }

    return result;
  },

  async getFileContent(repoPath: string, commitHash: string, filePath: string): Promise<string> {
    try {
      const git = createGit(repoPath);
      return await git.show([`${commitHash}:${filePath}`]);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // File doesn't exist at this commit — return empty string
      if (
        message.includes('does not exist') ||
        (message.includes('path') && message.includes('exist'))
      ) {
        return '';
      }
      throw mapError(err, repoPath);
    }
  },
};
