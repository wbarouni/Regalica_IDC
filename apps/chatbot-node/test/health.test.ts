import request from 'supertest';
import { createApp } from '../src/app';

describe('GET /health', () => {
  const app = createApp();

  it('returns 200 with service status payload', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'ok',
      service: 'regalica-chatbot-node',
    });
    expect(typeof res.body.uptime).toBe('number');
    expect(typeof res.body.timestamp).toBe('string');
  });
});
