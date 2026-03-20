/**
 * CLI-based AI Provider
 *
 * Spawns a subprocess (e.g., `claude -p`), writes prompt to stdin,
 * reads response from stdout. Platform-aware process termination.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { platform } from 'node:os';
import { AIError } from '../../errors/ai.js';
import type { AIProviderInterface } from './ai-provider.js';

export interface CLIProviderConfig {
  command: string;        // e.g., "claude" or "/usr/local/bin/claude"
  args?: string[];        // e.g., ["-p"] or ["--model", "claude-3"]
}

const DEFAULT_TIMEOUT = 30_000;

/**
 * Kill a process tree. On Windows, uses taskkill /F /T.
 * On Unix, sends SIGTERM then SIGKILL after 5s.
 */
function killProcess(proc: ChildProcess): void {
  if (!proc.pid) return;

  if (platform() === 'win32') {
    try {
      // Force-kill process tree on Windows
      spawn('taskkill', ['/F', '/T', '/PID', String(proc.pid)], {
        stdio: 'ignore',
      });
    } catch {
      // Best-effort
      proc.kill('SIGKILL');
    }
  } else {
    proc.kill('SIGTERM');
    // Force kill after 5 seconds if still alive
    setTimeout(() => {
      try {
        proc.kill('SIGKILL');
      } catch {
        // Process already exited
      }
    }, 5_000);
  }
}

export class CLIProvider implements AIProviderInterface {
  private config: CLIProviderConfig;

  constructor(config: CLIProviderConfig) {
    this.config = config;
  }

  async generate(prompt: string, options?: { maxTokens?: number; timeout?: number }): Promise<string> {
    const timeout = options?.timeout ?? DEFAULT_TIMEOUT;

    return new Promise<string>((resolve, reject) => {
      let proc: ChildProcess;

      try {
        proc = spawn(this.config.command, this.config.args ?? [], {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: { ...process.env },
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes('ENOENT')) {
          return reject(new AIError(
            `AI CLI command not found: ${this.config.command}`,
            'AI_PROVIDER_UNAVAILABLE',
            { command: this.config.command },
          ));
        }
        return reject(new AIError(
          `Failed to spawn AI CLI: ${message}`,
          'AI_PROVIDER_UNAVAILABLE',
          { command: this.config.command },
        ));
      }

      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];
      let settled = false;

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          killProcess(proc);
          reject(new AIError(
            `AI CLI timed out after ${timeout}ms`,
            'AI_TIMEOUT',
            { command: this.config.command, timeout },
          ));
        }
      }, timeout);

      proc.stdout!.on('data', (chunk: Buffer) => {
        stdoutChunks.push(chunk);
      });

      proc.stderr!.on('data', (chunk: Buffer) => {
        stderrChunks.push(chunk);
      });

      proc.on('error', (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);

        const message = err.message;
        if (message.includes('ENOENT')) {
          reject(new AIError(
            `AI CLI command not found: ${this.config.command}`,
            'AI_PROVIDER_UNAVAILABLE',
            { command: this.config.command },
          ));
        } else {
          reject(new AIError(
            `AI CLI process error: ${message}`,
            'AI_PROVIDER_UNAVAILABLE',
            { command: this.config.command },
          ));
        }
      });

      proc.on('close', (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);

        const stdout = Buffer.concat(stdoutChunks).toString('utf-8');
        const stderr = Buffer.concat(stderrChunks).toString('utf-8');

        if (code !== 0) {
          reject(new AIError(
            `AI CLI exited with code ${code}: ${stderr || 'no error output'}`,
            'AI_PROVIDER_UNAVAILABLE',
            { command: this.config.command, exitCode: code, stderr },
          ));
          return;
        }

        if (!stdout.trim()) {
          reject(new AIError(
            'AI CLI returned empty response',
            'AI_PARSE_FAILED',
            { command: this.config.command },
          ));
          return;
        }

        resolve(stdout.trim());
      });

      // Write prompt to stdin and close
      proc.stdin!.write(prompt, 'utf-8');
      proc.stdin!.end();
    });
  }

  async isAvailable(): Promise<boolean> {
    return Boolean(this.config.command);
  }
}
