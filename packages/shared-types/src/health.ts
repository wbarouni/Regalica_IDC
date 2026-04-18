/** Health-check response contract — identical across services. */
export interface HealthResponse {
  status: 'ok' | 'degraded' | 'down';
  service: 'regalica-api' | 'regalica-chatbot-node' | 'regalica-chatbot-py';
  version: string;
  uptime: number;
  timestamp: string;
}
