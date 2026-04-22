import { GoogleGenerativeAI, type GenerativeModel, type StartChatParams } from '@google/generative-ai';
import { CircuitBreaker } from './circuit-breaker';
import { logger } from '@/lib/logger';

interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffFactor: number;
}

const DEFAULT_RETRY: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 1_000,
  maxDelayMs: 10_000,
  backoffFactor: 2,
};

const geminiCircuitBreaker = new CircuitBreaker('gemini', 5, 60_000);

async function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY,
  correlationId?: string,
): Promise<T> {
  let lastError: Error = new Error('Unknown error');
  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < config.maxAttempts) {
        const delay = Math.min(
          config.baseDelayMs * Math.pow(config.backoffFactor, attempt - 1),
          config.maxDelayMs,
        );
        logger.warn('Gemini call failed, retrying', {
          correlationId,
          attempt,
          nextDelayMs: delay,
          error: lastError.message,
        });
        await new Promise(res => setTimeout(res, delay));
      }
    }
  }
  logger.error('Gemini call exhausted retries', {
    correlationId,
    maxAttempts: config.maxAttempts,
    error: lastError.message,
  });
  throw lastError;
}

export interface GeminiChatMessage {
  role: 'user' | 'model';
  parts: Array<{ text: string }>;
}

export interface GeminiChatResponse {
  text: string;
  modelId: string;
}

export async function sendGeminiMessage(params: {
  modelId: string;
  systemInstruction: string;
  history: GeminiChatMessage[];
  message: string;
  correlationId?: string;
}): Promise<GeminiChatResponse> {
  const apiKey = process.env.GEMINI_API_KEY ?? '';
  const genai = new GoogleGenerativeAI(apiKey);
  const model: GenerativeModel = genai.getGenerativeModel({
    model: params.modelId,
    systemInstruction: params.systemInstruction,
  });

  const chatParams: StartChatParams = { history: params.history };

  return geminiCircuitBreaker.call(() =>
    withRetry(async () => {
      const chat = model.startChat(chatParams);
      const result = await chat.sendMessage(params.message);
      const text = result.response.text();
      logger.info('Gemini response received', {
        correlationId: params.correlationId,
        model: params.modelId,
        responseLength: text.length,
      });
      return { text, modelId: params.modelId };
    }, DEFAULT_RETRY, params.correlationId),
  );
}
