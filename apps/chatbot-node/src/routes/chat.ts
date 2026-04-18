import axios, { AxiosError } from 'axios';
import { Router } from 'express';
import { z } from 'zod';

import { config } from '../config';

const chatRequestSchema = z.object({
  tenantId: z.string().uuid(),
  conversationId: z.string().uuid().optional(),
  message: z.string().min(1).max(8000),
});

export const chatRouter = Router();

// POST /chat — stub relay to chatbot-py. Full persistence to DB in Phase 4.
chatRouter.post('/', async (req, res, next) => {
  const parsed = chatRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'bad_request', details: parsed.error.format() });
    return;
  }

  try {
    const response = await axios.post(
      `${config.chatbotPyUrl}/chat`,
      parsed.data,
      { timeout: 30_000 },
    );
    res.json(response.data);
  } catch (err) {
    if (err instanceof AxiosError) {
      res.status(502).json({ error: 'upstream_unavailable', detail: err.message });
      return;
    }
    next(err);
  }
});
