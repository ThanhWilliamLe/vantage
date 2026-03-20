/**
 * AI Provider Interface
 *
 * Contract for AI text generation providers (API-based or CLI-based).
 * Prompt construction and response parsing are provider-agnostic.
 */

export interface AIProviderInterface {
  /**
   * Generate a text response from the given prompt.
   * @param prompt - The user prompt text
   * @param options - Optional generation parameters
   * @returns The raw text response from the AI provider
   */
  generate(prompt: string, options?: {
    maxTokens?: number;
    timeout?: number;
  }): Promise<string>;

  /**
   * Check whether the provider is available and configured.
   * @returns true if the provider can accept requests
   */
  isAvailable(): Promise<boolean>;
}
