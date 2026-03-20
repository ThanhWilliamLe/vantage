/**
 * API-based AI Provider
 *
 * HTTP provider supporting OpenAI-compatible and Anthropic-compatible endpoints.
 * Uses AbortController for timeouts and exponential backoff for transient errors.
 */

import { AIError } from '../../errors/ai.js';
import type { AIProviderInterface } from './ai-provider.js';

export interface APIProviderConfig {
  endpointUrl: string;
  apiKey: string;
  model: string;
  preset: 'openai' | 'anthropic';
}

const DEFAULT_TIMEOUT = 30_000;
const MAX_RETRIES = 2; // up to 3 total attempts
const RETRY_DELAYS = [1_000, 3_000]; // delays before 2nd and 3rd attempts

function mapHttpError(status: number, body: string): AIError {
  if (status === 401 || status === 403) {
    return new AIError(
      `AI provider authentication failed (HTTP ${status})`,
      'AI_AUTH_FAILED',
      { status, body },
    );
  }
  if (status === 429) {
    return new AIError(
      `AI provider rate limited (HTTP ${status})`,
      'AI_RATE_LIMITED',
      { status, body },
    );
  }
  if (status === 413 || (body && body.includes('context_length_exceeded'))) {
    return new AIError(
      `Prompt too large for AI provider (HTTP ${status})`,
      'AI_CONTEXT_TOO_LARGE',
      { status, body },
    );
  }
  if (status >= 500) {
    return new AIError(
      `AI provider server error (HTTP ${status})`,
      'AI_PROVIDER_UNAVAILABLE',
      { status, body },
    );
  }
  return new AIError(
    `AI provider request failed (HTTP ${status})`,
    'AI_UNKNOWN',
    { status, body },
  );
}

function isRetryable(error: AIError): boolean {
  return (
    error.code === 'AI_PROVIDER_UNAVAILABLE' ||
    error.code === 'AI_TIMEOUT' ||
    error.code === 'AI_RATE_LIMITED'
  );
}

function buildRequestBody(
  prompt: string,
  config: APIProviderConfig,
  maxTokens?: number,
): { body: string; headers: Record<string, string> } {
  if (config.preset === 'anthropic') {
    return {
      body: JSON.stringify({
        model: config.model,
        max_tokens: maxTokens ?? 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
      },
    };
  }

  // OpenAI-compatible (default)
  return {
    body: JSON.stringify({
      model: config.model,
      max_tokens: maxTokens ?? 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
  };
}

function extractResponseText(responseBody: unknown, preset: 'openai' | 'anthropic'): string {
  const data = responseBody as Record<string, unknown>;

  if (preset === 'anthropic') {
    const content = data.content;
    if (Array.isArray(content) && content.length > 0) {
      const first = content[0] as Record<string, unknown>;
      if (typeof first.text === 'string') return first.text;
    }
    throw new AIError('Unexpected Anthropic response format', 'AI_PARSE_FAILED', { responseBody });
  }

  // OpenAI-compatible
  const choices = data.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const message = (choices[0] as Record<string, unknown>).message as Record<string, unknown> | undefined;
    if (message && typeof message.content === 'string') return message.content;
  }
  throw new AIError('Unexpected OpenAI response format', 'AI_PARSE_FAILED', { responseBody });
}

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class APIProvider implements AIProviderInterface {
  private config: APIProviderConfig;

  constructor(config: APIProviderConfig) {
    this.config = config;
  }

  async generate(prompt: string, options?: { maxTokens?: number; timeout?: number }): Promise<string> {
    const timeout = options?.timeout ?? DEFAULT_TIMEOUT;
    let lastError: AIError | undefined;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0 && lastError && isRetryable(lastError)) {
        await delay(RETRY_DELAYS[attempt - 1] ?? 3_000);
      } else if (attempt > 0 && lastError) {
        // Not retryable — throw immediately
        throw lastError;
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      try {
        const { body, headers } = buildRequestBody(prompt, this.config, options?.maxTokens);
        const response = await fetch(this.config.endpointUrl, {
          method: 'POST',
          headers,
          body,
          signal: controller.signal,
        });

        clearTimeout(timer);

        if (!response.ok) {
          const responseBody = await response.text().catch(() => '');
          lastError = mapHttpError(response.status, responseBody);
          if (!isRetryable(lastError)) throw lastError;
          continue;
        }

        const responseData = await response.json();
        return extractResponseText(responseData, this.config.preset);
      } catch (err) {
        clearTimeout(timer);

        if (err instanceof AIError) {
          lastError = err;
          if (!isRetryable(lastError)) throw lastError;
          continue;
        }

        if (err instanceof Error) {
          if (err.name === 'AbortError') {
            lastError = new AIError(
              `AI provider request timed out after ${timeout}ms`,
              'AI_TIMEOUT',
              { timeout },
            );
            continue;
          }
          // Network errors (ECONNREFUSED, DNS failure, etc.)
          lastError = new AIError(
            `AI provider connection failed: ${err.message}`,
            'AI_PROVIDER_UNAVAILABLE',
            { message: err.message },
          );
          continue;
        }

        throw new AIError(
          `AI provider request failed: ${String(err)}`,
          'AI_UNKNOWN',
        );
      }
    }

    // Exhausted retries
    throw lastError ?? new AIError('AI provider request failed after retries', 'AI_UNKNOWN');
  }

  async isAvailable(): Promise<boolean> {
    // Check that endpoint and API key are configured
    return Boolean(this.config.endpointUrl && this.config.apiKey && this.config.model);
  }
}
