import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { isWorktree, getMainGitDir } from './git-reader.js';

describe('git worktree detection', () => {
  let mainRepoPath: string;
  let worktreePath: string;

  beforeAll(() => {
    // Create a main repo
    mainRepoPath = mkdtempSync(join(tmpdir(), 'vantage-worktree-main-'));
    execSync('git init', { cwd: mainRepoPath, stdio: 'pipe' });
    execSync('git checkout -b main', { cwd: mainRepoPath, stdio: 'pipe' });
    writeFileSync(join(mainRepoPath, 'README.md'), '# Test');
    execSync('git add . && git commit -m "init"', {
      cwd: mainRepoPath,
      stdio: 'pipe',
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'Test',
        GIT_AUTHOR_EMAIL: 'test@test.com',
        GIT_COMMITTER_NAME: 'Test',
        GIT_COMMITTER_EMAIL: 'test@test.com',
      },
    });

    // Create a worktree — execSync is safe here since all values are hardcoded test fixtures
    worktreePath = mkdtempSync(join(tmpdir(), 'vantage-worktree-wt-'));
    rmSync(worktreePath, { recursive: true }); // git worktree add needs non-existent dir
    execSync(`git worktree add "${worktreePath}" -b feature-test`, {
      cwd: mainRepoPath,
      stdio: 'pipe',
    });
  });

  afterAll(() => {
    try {
      execSync(`git worktree remove "${worktreePath}" --force`, {
        cwd: mainRepoPath,
        stdio: 'pipe',
      });
    } catch {
      /* ignore */
    }
    rmSync(mainRepoPath, { recursive: true, force: true });
  });

  test('normal repo is not a worktree', async () => {
    expect(await isWorktree(mainRepoPath)).toBe(false);
  });

  test('worktree is detected as worktree', async () => {
    expect(await isWorktree(worktreePath)).toBe(true);
  });

  test('non-git directory is not a worktree', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'vantage-not-git-'));
    expect(await isWorktree(tmpDir)).toBe(false);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test('getMainGitDir returns null for normal repo', async () => {
    expect(await getMainGitDir(mainRepoPath)).toBe(null);
  });

  test('getMainGitDir resolves worktree to main .git', async () => {
    const mainGitDir = await getMainGitDir(worktreePath);
    expect(mainGitDir).not.toBeNull();
    // Should contain the main repo's .git path
    expect(mainGitDir).toContain('.git');
  });
});
