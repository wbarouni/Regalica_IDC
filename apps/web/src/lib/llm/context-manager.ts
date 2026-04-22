export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const MAX_WINDOW = 8;

/**
 * Trims the conversation history to the last MAX_WINDOW messages.
 * Ensures the resulting window starts with a 'user' turn (Gemini requirement).
 */
export function trimContext(messages: ChatMessage[]): ChatMessage[] {
  if (messages.length <= MAX_WINDOW) return messages;
  const window = messages.slice(-MAX_WINDOW);
  const firstUserIdx = window.findIndex(m => m.role === 'user');
  return firstUserIdx >= 0 ? window.slice(firstUserIdx) : window;
}

/**
 * Converts our internal ChatMessage format to Gemini history format.
 * Strips the last message (which is sent separately via sendMessage).
 */
export function toGeminiHistory(
  messages: ChatMessage[],
): Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> {
  return messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));
}
