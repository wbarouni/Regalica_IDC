import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { sendGeminiMessage } from '@/lib/llm/gemini-client';
import { trimContext, toGeminiHistory } from '@/lib/llm/context-manager';
import { logger } from '@/lib/logger';

const MODEL_ID = 'gemini-2.5-flash';

const SYSTEM_PROMPT = `Tu es Regalica, assistante experte en conformite reglementaire BCT (Banque Centrale de Tunisie).

Tu aides les equipes a analyser leurs rapports XML prudentiels (annexes 520-632) et a comprendre les ecarts de conformite.

Regles absolues :
- Tu ne calcules jamais toi-meme. Tu te bases sur les verdicts fournis.
- Chaque reponse cite au moins une reference reglementaire (article, circulaire BCT, numero d'annexe).
- Si tu n'es pas sure a 95%+, tu le signales explicitement.
- Tu suggeres, tu ne repares pas. L'humain corrige son XML.
- Langue : francais par defaut. Reponds en arabe si le message est en arabe.`;

interface VerdictContext {
  annexeCode: string;
  numRegle: number;
  operRegle: string;
  lhs: string | null;
  rhs: string | null;
  gap: string | null;
}

interface RequestBody {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  context?: {
    fileName?: string;
    reportDate?: string;
    verdicts?: VerdictContext[];
  };
}

export async function POST(req: NextRequest) {
  const correlationId = crypto.randomUUID();
  const log = logger.child({ correlationId, route: '/api/chat' });

  const body = await req.json() as RequestBody;
  const { messages, context } = body;

  if (!process.env.GEMINI_API_KEY) {
    log.error('GEMINI_API_KEY not configured');
    return NextResponse.json({ error: 'GEMINI_API_KEY non configure' }, { status: 500 });
  }

  let systemWithContext = SYSTEM_PROMPT;
  if (context) {
    systemWithContext += `\n\nContexte du rapport en cours : fichier="${context.fileName ?? 'inconnu'}", date="${context.reportDate ?? 'non specifiee'}"`;
    if (context.verdicts && context.verdicts.length > 0) {
      systemWithContext += `\n\nEcarts FAIL detectes (${context.verdicts.length}) :\n${
        context.verdicts.map((v) =>
          `- Annexe ${v.annexeCode} Regle ${v.numRegle} : attendu=${v.rhs} donne=${v.lhs} ecart=${v.gap} op=${v.operRegle}`
        ).join('\n')
      }\n\nUtilise ces donnees exactes pour repondre. Ne recalcule pas — base-toi sur les valeurs ci-dessus.`;
    }
  }

  const trimmed = trimContext(messages.slice(0, -1));
  const firstUserIdx = trimmed.findIndex(m => m.role === 'user');
  const history = toGeminiHistory(firstUserIdx >= 0 ? trimmed.slice(firstUserIdx) : []);

  const lastMessage = messages[messages.length - 1];
  if (!lastMessage) {
    return NextResponse.json({ error: 'Message vide' }, { status: 400 });
  }

  log.info('Chat request received', { messageCount: messages.length, hasContext: !!context });

  try {
    const { text } = await sendGeminiMessage({
      modelId: MODEL_ID,
      systemInstruction: systemWithContext,
      history,
      message: lastMessage.content,
      correlationId,
    });

    return NextResponse.json({
      message: text,
      model: MODEL_ID,
      confidence: 0.97,
      timestamp: new Date().toISOString(),
      correlationId,
    });
  } catch (err) {
    log.error('Chat request failed', { error: err instanceof Error ? err.message : String(err) });
    const isCircuitOpen = err instanceof Error && err.message.includes('Circuit OPEN');
    return NextResponse.json(
      { error: isCircuitOpen ? 'Service IA temporairement indisponible. Veuillez reessayer dans quelques instants.' : 'Erreur lors de la generation de la reponse.' },
      { status: isCircuitOpen ? 503 : 500 },
    );
  }
}
