/**
 * REGALICA AI - Gemini Client
 * Client singleton avec lazy loading et configuration
 */

import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai'

interface GeminiConfig {
  apiKey: string
  model: string
  maxRetries: number
  timeout: number
  temperature: number
  maxOutputTokens: number
}

const DEFAULT_CONFIG: Partial<GeminiConfig> = {
  model: 'gemini-1.5-flash',
  maxRetries: 3,
  timeout: 30000,
  temperature: 0.1,
  maxOutputTokens: 8192,
}

class GeminiClient {
  private static instance: GeminiClient | null = null
  private client: GoogleGenerativeAI | null = null
  private model: GenerativeModel | null = null
  private jsonModel: GenerativeModel | null = null
  private config: GeminiConfig

  private constructor(config: GeminiConfig) {
    this.config = config
  }

  /**
   * Get singleton instance with lazy loading
   */
  static getInstance(): GeminiClient {
    if (!GeminiClient.instance) {
      const apiKey = process.env.GEMINI_API_KEY

      if (!apiKey) {
        throw new Error(
          'GEMINI_API_KEY environment variable is required. ' +
          'Please set it in your .env file or environment variables.'
        )
      }

      GeminiClient.instance = new GeminiClient({
        apiKey,
        model: process.env.GEMINI_MODEL || DEFAULT_CONFIG.model!,
        maxRetries: parseInt(process.env.GEMINI_MAX_RETRIES || '3'),
        timeout: parseInt(process.env.GEMINI_TIMEOUT || '30000'),
        temperature: parseFloat(process.env.GEMINI_TEMPERATURE || '0.1'),
        maxOutputTokens: parseInt(process.env.GEMINI_MAX_TOKENS || '8192'),
      })
    }
    return GeminiClient.instance
  }

  /**
   * Check if Gemini API is available
   */
  static isAvailable(): boolean {
    return !!process.env.GEMINI_API_KEY
  }

  /**
   * Get the GoogleGenerativeAI client
   */
  private getClient(): GoogleGenerativeAI {
    if (!this.client) {
      this.client = new GoogleGenerativeAI(this.config.apiKey)
    }
    return this.client
  }

  /**
   * Get model for text generation
   */
  getModel(): GenerativeModel {
    if (!this.model) {
      this.model = this.getClient().getGenerativeModel({
        model: this.config.model,
        generationConfig: {
          temperature: this.config.temperature,
          maxOutputTokens: this.config.maxOutputTokens,
        },
      })
    }
    return this.model
  }

  /**
   * Get model configured for JSON output
   */
  getJsonModel(): GenerativeModel {
    if (!this.jsonModel) {
      this.jsonModel = this.getClient().getGenerativeModel({
        model: this.config.model,
        generationConfig: {
          temperature: 0.1, // Lower temperature for consistent JSON
          maxOutputTokens: this.config.maxOutputTokens,
          responseMimeType: 'application/json',
        },
      })
    }
    return this.jsonModel
  }

  /**
   * Get current configuration
   */
  getConfig(): Readonly<GeminiConfig> {
    return { ...this.config }
  }

  /**
   * Generate content with the model
   */
  async generateContent(prompt: string, useJson: boolean = false): Promise<string> {
    const model = useJson ? this.getJsonModel() : this.getModel()
    const result = await model.generateContent(prompt)
    return result.response.text()
  }

  /**
   * Reset singleton (for testing)
   */
  static reset(): void {
    if (GeminiClient.instance) {
      GeminiClient.instance.client = null
      GeminiClient.instance.model = null
      GeminiClient.instance.jsonModel = null
      GeminiClient.instance = null
    }
  }
}

/**
 * Safe getter that returns null if not available
 */
export function getGeminiClient(): GeminiClient | null {
  try {
    return GeminiClient.getInstance()
  } catch {
    return null
  }
}

export { GeminiClient }
export type { GeminiConfig }
