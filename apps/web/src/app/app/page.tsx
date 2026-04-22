'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import {
  Upload, MessageSquare, CheckSquare, LayoutDashboard,
  FileText, Settings, History, Shield, Clock, Lock,
  CheckCircle2, Sparkles, Send, AlertCircle, X,
  FileCheck, Calendar, ChevronDown, ChevronUp,
  Bot, Search, BarChart3, FileSearch, Brain,
} from 'lucide-react';
import type { EvaluationResult, EvaluationVerdict } from '@/lib/agents/evaluator/types';

interface EvaluationResponse extends EvaluationResult {
  error?: string;
  uploadedAnnexes?: string[];
  requiredAnnexes?: string[];
  totalRulesForAnnexe?: number;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  model?: string;
  confidence?: number;
  agentStep?: string; // which agent produced this
}

interface StructureResult {
  valid: boolean;
  errors: Array<{ dimension: number; message: string; path?: string }>;
}

// Agent pipeline steps shown during analysis
const AGENT_STEPS = [
  { id: 'validator',  icon: FileSearch, label: 'Structure Validator' },
  { id: 'evaluator',  icon: BarChart3,  label: 'RDG Evaluator'      },
  { id: 'analyst',    icon: Brain,      label: 'Pattern Analyst'     },
  { id: 'regalica',   icon: Sparkles,   label: 'Regalica Report'     },
];

export default function WorkspacePage() {
  const [files, setFiles] = useState<File[]>([]);
  const [reportDate, setReportDate] = useState('');
  const [evaluation, setEvaluation] = useState<EvaluationResponse | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  const [expandedRule, setExpandedRule] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([{
    role: 'assistant',
    content: 'Bonjour. Je suis Regalica, votre assistante conformite BCT.\n\nDeposez un ou plusieurs fichiers XML BCT dans la zone de gauche. J\'analyserai les regles RDG applicables a votre annexe, detecterai les ecarts, et vous demanderai les fichiers complementaires si des controles inter-annexes sont requis.',
    timestamp: new Date().toISOString(),
    model: 'regalica-orchestrator',
    confidence: 1.0,
  }]);
  const [input, setInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const analyzeCalledRef = useRef(false);

  function scrollChat() {
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 80);
  }

  function addMsg(content: string, opts?: { agentStep?: string; model?: string; confidence?: number }) {
    setMessages(prev => [...prev, {
      role: 'assistant', content,
      timestamp: new Date().toISOString(),
      model: opts?.model ?? 'regalica-orchestrator',
      confidence: opts?.confidence ?? 0.99,
      agentStep: opts?.agentStep,
    }]);
    scrollChat();
  }

  // Acknowledge new file immediately when dropped
  useEffect(() => {
    if (files.length === 0) { analyzeCalledRef.current = false; return; }
    if (analyzeCalledRef.current) return;
    const names = files.map(f => f.name).join(', ');
    addMsg(
      `Fichier(s) recu(s) : ${names}\n\nCliquez sur « Analyser avec Regalica » pour lancer l\'evaluation des regles RDG de cette annexe.`,
      { agentStep: 'regalica' },
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files.length]);

  const runAnalysis = useCallback(async () => {
    if (files.length === 0 || isAnalyzing) return;
    setIsAnalyzing(true);
    analyzeCalledRef.current = true;
    setEvaluation(null);
    setExpandedRule(null);

    try {
      // Step 1 — Structure Validator
      setActiveAgent('validator');
      addMsg('Lancement de l\'analyse...\n\n[Agent 1/4] Structure Validator — verification des 7 dimensions BCT en cours.', { agentStep: 'validator' });

      const validateForm = new FormData();
      for (const f of files) validateForm.append('file', f);
      const vRes = await fetch('/api/validate', { method: 'POST', body: validateForm });
      const vData = await vRes.json() as StructureResult;

      if (!vData.valid) {
        addMsg(
          `[Structure Validator] ${vData.errors.length} erreur(s) detectee(s) :\n${vData.errors.map(e => `  • Dimension ${e.dimension}: ${e.message}`).join('\n')}\n\nCorrigez le fichier XML avant de relancer l\'analyse.`,
          { agentStep: 'validator', confidence: 0.99 },
        );
        setIsAnalyzing(false); setActiveAgent(null);
        return;
      }

      addMsg('[Structure Validator] Structure valide — 7 dimensions BCT conformes.', { agentStep: 'validator' });

      // Step 2 — RDG Evaluator
      setActiveAgent('evaluator');
      addMsg('[Agent 2/4] RDG Evaluator — application des regles sur l\'annexe en cours...', { agentStep: 'evaluator' });

      const evalForm = new FormData();
      for (const f of files) evalForm.append('file', f);
      const eRes = await fetch('/api/evaluate', { method: 'POST', body: evalForm });
      const eData = await eRes.json() as EvaluationResponse;

      if (eData.error) {
        addMsg(`[RDG Evaluator] Erreur : ${eData.error}`, { agentStep: 'evaluator' });
        setIsAnalyzing(false); setActiveAgent(null);
        return;
      }

      setEvaluation(eData);

      const annexeLabel = eData.uploadedAnnexes?.join(', ') ?? '?';
      addMsg(
        `[RDG Evaluator] ${eData.totalRulesForAnnexe ?? eData.pass + eData.fail + eData.skip} regles evaluees pour l\'annexe ${annexeLabel}.\n  PASS: ${eData.pass}  |  FAIL: ${eData.fail}  |  SKIP: ${eData.skip}`,
        { agentStep: 'evaluator' },
      );

      // Step 3 — Pattern Analyst
      setActiveAgent('analyst');
      addMsg('[Agent 3/4] Pattern Analyst — analyse des ecarts...', { agentStep: 'analyst' });

      const fails = eData.verdicts?.filter(v => v.status === 'FAIL') ?? [];
      if (fails.length > 0) {
        addMsg(
          `[Pattern Analyst] ${fails.length} ecart(s) detecte(s) :\n${fails.slice(0, 10).map(v => `  • Regle ${v.numRegle} (op: ${v.operRegle}) — LHS=${v.lhs} vs RHS=${v.rhs} | ecart=${v.gap}`).join('\n')}${fails.length > 10 ? `\n  ...et ${fails.length - 10} autres.` : ''}`,
          { agentStep: 'analyst' },
        );
      } else {
        addMsg('[Pattern Analyst] Aucun ecart detecte. Toutes les regles de cette annexe sont conformes.', { agentStep: 'analyst' });
      }

      // Step 4 — Regalica final report + inter-annexe request
      setActiveAgent('regalica');
      const required = eData.requiredAnnexes ?? [];
      const conformityPct = eData.pass + eData.fail > 0
        ? Math.round((eData.pass / (eData.pass + eData.fail)) * 100)
        : 100;

      let finalMsg = `[Rapport Regalica] Annexe ${annexeLabel} — Taux de conformite : ${conformityPct}%\n\n`;
      finalMsg += `Regles evaluees : ${eData.totalRulesForAnnexe ?? '?'}\n`;
      finalMsg += `PASS : ${eData.pass} | FAIL : ${eData.fail} | SKIP : ${eData.skip}`;

      if (required.length > 0) {
        finalMsg += `\n\n[Inter-annexes] Pour completer les controles croise(s), je necessite les fichiers des annexes suivantes :\n`;
        finalMsg += required.map(a => `  • Annexe ${a}`).join('\n');
        finalMsg += `\n\nDeposez ces fichiers XML dans la zone upload pour que j\'execute les regles inter-annexes correspondantes.`;
      }

      if (fails.length > 0) {
        finalMsg += `\n\nCliquez sur une ligne FAIL dans le tableau pour analyser l\'ecart en detail.`;
      }

      addMsg(finalMsg, { agentStep: 'regalica', confidence: 0.97 });

    } finally {
      setIsAnalyzing(false);
      setActiveAgent(null);
    }
  }, [files, isAnalyzing]);

  function handleFileDrop(e: React.DragEvent) {
    e.preventDefault();
    const dropped = Array.from(e.dataTransfer.files).filter(f => f.name.match(/\.xml$/i));
    if (dropped.length > 0) {
      analyzeCalledRef.current = false;
      setEvaluation(null);
      setFiles(prev => { const names = new Set(prev.map(f => f.name)); return [...prev, ...dropped.filter(f => !names.has(f.name))]; });
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []).filter(f => f.name.match(/\.xml$/i));
    if (selected.length > 0) {
      analyzeCalledRef.current = false;
      setEvaluation(null);
      setFiles(prev => { const names = new Set(prev.map(f => f.name)); return [...prev, ...selected.filter(f => !names.has(f.name))]; });
    }
    e.target.value = '';
  }

  function removeFile(name: string) {
    analyzeCalledRef.current = false;
    setFiles(prev => prev.filter(f => f.name !== name));
    setEvaluation(null);
  }

  async function handleSend() {
    if (!input.trim() || isChatLoading) return;
    const userMsg: ChatMessage = { role: 'user', content: input.trim(), timestamp: new Date().toISOString() };
    const next = [...messages, userMsg];
    setMessages(next); setInput(''); setIsChatLoading(true);
    scrollChat();
    try {
      const res = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: next.map(m => ({ role: m.role, content: m.content })),
          context: {
            fileName: files.map(f => f.name).join(', '),
            reportDate,
            uploadedAnnexes: evaluation?.uploadedAnnexes,
            requiredAnnexes: evaluation?.requiredAnnexes,
            verdicts: evaluation?.verdicts?.filter(v => v.status === 'FAIL').slice(0, 20),
          },
        }),
      });
      const data = await res.json() as { message: string; model: string; confidence: number; timestamp: string };
      setMessages(prev => [...prev, { role: 'assistant', content: data.message, timestamp: data.timestamp, model: data.model, confidence: data.confidence }]);
    } catch {
      addMsg('Erreur de connexion avec le service IA.');
    } finally {
      setIsChatLoading(false);
      scrollChat();
    }
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: 'var(--bg-page)' }}>
      <TopBar />
      <CommandBar />
      <main className="flex flex-1 overflow-hidden">

        {/* LEFT — Upload + agent pipeline */}
        <section className="w-72 shrink-0 flex flex-col border-r overflow-y-auto" style={{ borderColor: 'var(--glass-border-lo)' }}>
          <div className="p-4 border-b" style={{ borderColor: 'var(--glass-border-lo)' }}>
            <h2 style={{ color: 'var(--mono-graphite)', fontSize: 'var(--text-sm)', fontWeight: 'var(--font-semibold)' }}>Depot XML BCT</h2>
          </div>
          <div className="flex flex-col gap-4 p-4">

            {/* Date */}
            <div className="flex flex-col gap-1.5">
              <label className="flex items-center gap-1.5" style={{ color: 'var(--mono-slate)', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)' }}>
                <Calendar size={12} /> Date du rapport
              </label>
              <input type="date" value={reportDate} onChange={e => setReportDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border outline-none"
                style={{ fontSize: 'var(--text-sm)', color: 'var(--mono-graphite)', background: 'var(--mono-white)', borderColor: 'var(--mono-silver)' }} />
            </div>

            {/* Dropzone */}
            <div onDrop={handleFileDrop} onDragOver={e => e.preventDefault()} onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center justify-center gap-3 p-4 rounded-xl border-2 border-dashed cursor-pointer transition-colors"
              style={{ borderColor: files.length > 0 ? 'var(--brand-violet)' : 'var(--mono-silver)', background: files.length > 0 ? 'var(--brand-violet-bg)' : 'var(--mono-pearl)' }}>
              {files.length > 0 ? (
                <>
                  <FileCheck size={20} style={{ color: 'var(--brand-violet)' }} />
                  <div className="w-full flex flex-col gap-1">
                    {files.map(f => (
                      <div key={f.name} className="flex items-center justify-between gap-2 px-2 py-1 rounded-lg" style={{ background: 'rgba(91,79,228,0.08)' }}>
                        <span style={{ color: 'var(--brand-violet)', fontSize: '11px', fontWeight: 'var(--font-medium)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '150px' }}>{f.name}</span>
                        <button onClick={e => { e.stopPropagation(); removeFile(f.name); }} style={{ color: 'var(--mono-steel)', flexShrink: 0 }}><X size={12} /></button>
                      </div>
                    ))}
                  </div>
                  <p style={{ color: 'var(--mono-steel)', fontSize: '11px' }}>+ Ajouter d'autres annexes</p>
                </>
              ) : (
                <>
                  <Upload size={24} style={{ color: 'var(--mono-steel)' }} />
                  <div className="text-center">
                    <p style={{ color: 'var(--mono-slate)', fontSize: 'var(--text-sm)', fontWeight: 'var(--font-medium)' }}>Deposer les XML BCT</p>
                    <p style={{ color: 'var(--mono-steel)', fontSize: 'var(--text-xs)', marginTop: '4px' }}>Une ou plusieurs annexes</p>
                  </div>
                </>
              )}
              <input ref={fileInputRef} type="file" accept=".xml,.XML" multiple className="hidden" onChange={handleFileSelect} />
            </div>

            {/* CTA — Analyser avec Regalica */}
            <button onClick={() => void runAnalysis()} disabled={files.length === 0 || isAnalyzing}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl disabled:opacity-40 transition-all"
              style={{ background: 'var(--brand-violet)', color: 'white', fontSize: 'var(--text-sm)', fontWeight: 'var(--font-semibold)', boxShadow: files.length > 0 && !isAnalyzing ? '0 4px 16px rgba(91,79,228,0.35)' : 'none' }}>
              {isAnalyzing
                ? <><span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" /> Analyse en cours...</>
                : <><Sparkles size={16} /> Analyser avec Regalica</>
              }
            </button>

            {/* Agent pipeline */}
            <div className="flex flex-col gap-2 pt-1">
              <p style={{ color: 'var(--mono-steel)', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', letterSpacing: 'var(--tracking-uppercase)', textTransform: 'uppercase' }}>Pipeline agents</p>
              {AGENT_STEPS.map(step => {
                const isActive = activeAgent === step.id;
                const isDone = !isAnalyzing && evaluation !== null && AGENT_STEPS.findIndex(s => s.id === activeAgent) > AGENT_STEPS.findIndex(s => s.id === step.id);
                return (
                  <div key={step.id} className="flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all"
                    style={{ background: isActive ? 'var(--brand-violet-bg)' : 'transparent', border: `1px solid ${isActive ? 'rgba(91,79,228,0.25)' : 'transparent'}` }}>
                    <step.icon size={14} style={{ color: isActive ? 'var(--brand-violet)' : isDone ? 'var(--functional-pass)' : 'var(--mono-steel)', flexShrink: 0 }} />
                    <span style={{ color: isActive ? 'var(--brand-violet)' : isDone ? 'var(--functional-pass)' : 'var(--mono-steel)', fontSize: 'var(--text-xs)', fontWeight: isActive ? 'var(--font-medium)' : 'var(--font-regular)' }}>
                      {step.label}
                    </span>
                    {isActive && <span className="ml-auto w-3 h-3 rounded-full border-2 border-t-transparent animate-spin shrink-0" style={{ borderColor: 'var(--brand-violet)', borderTopColor: 'transparent' }} />}
                    {!isActive && !isAnalyzing && evaluation && <CheckCircle2 size={12} style={{ color: 'var(--functional-pass)', marginLeft: 'auto', flexShrink: 0 }} />}
                  </div>
                );
              })}
            </div>

            {/* Score summary */}
            {evaluation && (
              <div className="rounded-xl p-3 flex flex-col gap-2" style={{ background: 'var(--mono-pearl)', border: '1px solid var(--glass-border-lo)' }}>
                <div className="flex justify-between items-center">
                  <span style={{ color: 'var(--mono-slate)', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)' }}>
                    Annexe {evaluation.uploadedAnnexes?.join(', ')}
                  </span>
                  <span style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', color: evaluation.fail === 0 ? 'var(--functional-pass)' : 'var(--functional-fail)' }}>
                    {evaluation.pass + evaluation.fail > 0 ? Math.round((evaluation.pass / (evaluation.pass + evaluation.fail)) * 100) : 100}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: 'var(--functional-pass)', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)' }}>PASS {evaluation.pass}</span>
                  <span style={{ color: 'var(--functional-fail)', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)' }}>FAIL {evaluation.fail}</span>
                  <span style={{ color: 'var(--mono-steel)', fontSize: 'var(--text-xs)' }}>SKIP {evaluation.skip}</span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--mono-silver)' }}>
                  <div className="h-full rounded-full transition-all" style={{
                    width: `${evaluation.pass + evaluation.fail > 0 ? Math.round((evaluation.pass / (evaluation.pass + evaluation.fail)) * 100) : 100}%`,
                    background: evaluation.fail === 0 ? 'var(--functional-pass)' : 'var(--functional-fail)',
                  }} />
                </div>
                {(evaluation.requiredAnnexes?.length ?? 0) > 0 && (
                  <div className="flex items-start gap-1.5 pt-1">
                    <AlertCircle size={12} style={{ color: 'var(--functional-skipped)', marginTop: '1px', flexShrink: 0 }} />
                    <p style={{ color: 'var(--functional-skipped)', fontSize: '11px' }}>
                      Inter-annexes requis : {evaluation.requiredAnnexes?.join(', ')}
                    </p>
                  </div>
                )}
                <p style={{ color: 'var(--mono-steel)', fontSize: '11px' }}>{evaluation.durationMs}ms · {evaluation.totalRulesForAnnexe} regles</p>
              </div>
            )}
          </div>
        </section>

        {/* CENTER — Regalica Chat + Report */}
        <section className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <div className="p-4 border-b shrink-0 flex items-center gap-3" style={{ borderColor: 'var(--glass-border-lo)', background: 'var(--glass-chrome)', backdropFilter: 'blur(12px)' }}>
            <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{ background: 'var(--brand-violet)' }}>
              <Sparkles size={14} color="white" />
            </div>
            <div>
              <h2 style={{ color: 'var(--mono-graphite)', fontSize: 'var(--text-sm)', fontWeight: 'var(--font-semibold)' }}>Regalica</h2>
              <p style={{ color: 'var(--mono-steel)', fontSize: '11px' }}>Assistante conformite BCT · Orchestratrice IA</p>
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <span className="px-2 py-0.5 rounded-full" style={{ background: 'var(--brand-violet-bg)', color: 'var(--brand-violet)', fontSize: '11px', fontWeight: 'var(--font-medium)' }}>
                {AGENT_STEPS.length} agents
              </span>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
            {messages.map((msg, i) => (
              msg.role === 'assistant' ? (
                <div key={i} className="flex gap-3 max-w-3xl">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ background: 'var(--brand-violet)' }}>
                    {msg.agentStep === 'validator' ? <FileSearch size={12} color="white" /> :
                     msg.agentStep === 'evaluator' ? <BarChart3 size={12} color="white" /> :
                     msg.agentStep === 'analyst' ? <Brain size={12} color="white" /> :
                     <Sparkles size={12} color="white" />}
                  </div>
                  <div className="flex flex-col gap-1.5 flex-1">
                    {msg.agentStep && (
                      <span style={{ color: 'var(--brand-violet)', fontSize: '11px', fontWeight: 'var(--font-medium)' }}>
                        {AGENT_STEPS.find(s => s.id === msg.agentStep)?.label ?? 'Regalica'}
                      </span>
                    )}
                    <div className="px-4 py-3 rounded-2xl rounded-tl-sm" style={{
                      background: 'var(--glass-regular)', backdropFilter: 'blur(8px)',
                      border: '1px solid var(--glass-border-lo)', color: 'var(--mono-slate)',
                      fontSize: 'var(--text-sm)', lineHeight: '1.6', whiteSpace: 'pre-wrap',
                    }}>{msg.content}</div>
                    <div className="flex items-center gap-2 px-1">
                      <span suppressHydrationWarning style={{ color: 'var(--mono-steel)', fontSize: '11px' }}>
                        {new Date(msg.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {msg.model && <span style={{ color: 'var(--brand-violet)', fontSize: '11px' }}>· {msg.model}</span>}
                      {msg.confidence && <span style={{ color: 'var(--functional-pass)', fontSize: '11px' }}>· {(msg.confidence * 100).toFixed(0)}%</span>}
                    </div>
                  </div>
                </div>
              ) : (
                <div key={i} className="flex justify-end">
                  <div className="px-4 py-3 rounded-2xl rounded-tr-sm max-w-lg" style={{
                    background: 'var(--brand-violet)', color: 'white',
                    fontSize: 'var(--text-sm)', lineHeight: '1.6',
                  }}>{msg.content}</div>
                </div>
              )
            ))}
            {isChatLoading && (
              <div className="flex gap-3">
                <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{ background: 'var(--brand-violet)' }}>
                  <Sparkles size={12} color="white" />
                </div>
                <div className="px-4 py-3 rounded-2xl rounded-tl-sm flex items-center gap-1.5" style={{ background: 'var(--glass-regular)', border: '1px solid var(--glass-border-lo)' }}>
                  {[0, 1, 2].map(d => (
                    <span key={d} className="w-2 h-2 rounded-full animate-bounce" style={{ background: 'var(--brand-violet)', animationDelay: `${d * 150}ms` }} />
                  ))}
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Chat input */}
          <div className="p-4 border-t" style={{ borderColor: 'var(--glass-border-lo)' }}>
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl" style={{ background: 'var(--glass-thick)', backdropFilter: 'blur(16px)', border: '1px solid var(--glass-border-lo)' }}>
              <input type="text" value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSend(); } }}
                placeholder="Posez une question a Regalica sur les ecarts ou les regles..."
                className="flex-1 bg-transparent outline-none"
                style={{ color: 'var(--mono-slate)', fontSize: 'var(--text-sm)' }} />
              <button onClick={() => void handleSend()} disabled={!input.trim() || isChatLoading}
                className="flex items-center justify-center w-8 h-8 rounded-lg disabled:opacity-40 transition-all"
                style={{ background: 'var(--brand-violet)', color: 'white' }}>
                <Send size={14} />
              </button>
            </div>
          </div>
        </section>

        {/* RIGHT — Verdict Table */}
        <section className="w-[480px] shrink-0 flex flex-col border-l" style={{ borderColor: 'var(--glass-border-lo)' }}>
          <div className="p-4 border-b shrink-0" style={{ borderColor: 'var(--glass-border-lo)' }}>
            <h2 style={{ color: 'var(--mono-graphite)', fontSize: 'var(--text-sm)', fontWeight: 'var(--font-semibold)' }}>
              Rapport de validation RDG
              {evaluation && (
                <span style={{ color: 'var(--mono-steel)', fontWeight: 'var(--font-regular)', marginLeft: '8px', fontSize: 'var(--text-xs)' }}>
                  {evaluation.pass + evaluation.fail + evaluation.skip} regles · annexe {evaluation.uploadedAnnexes?.join(', ')}
                </span>
              )}
            </h2>
          </div>

          {!evaluation ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8">
              <Bot size={40} style={{ color: 'var(--mono-silver)' }} />
              <p style={{ color: 'var(--mono-steel)', fontSize: 'var(--text-sm)', textAlign: 'center' }}>
                Le rapport apparaitra ici apres l'analyse par Regalica.
              </p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              <table className="w-full border-collapse" style={{ fontSize: 'var(--text-xs)' }}>
                <thead className="sticky top-0 z-10" style={{ background: 'var(--glass-chrome)', backdropFilter: 'blur(12px)' }}>
                  <tr>
                    {['Regle', 'Op', 'Attendu (RHS)', 'Obtenu (LHS)', 'Ecart', 'Statut'].map(h => (
                      <th key={h} className="text-left px-3 py-2 border-b" style={{ color: 'var(--mono-steel)', fontWeight: 'var(--font-medium)', borderColor: 'var(--glass-border-lo)', whiteSpace: 'nowrap' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {evaluation.verdicts.map((v, i) => (
                    <VerdictRow key={i} verdict={v}
                      expanded={expandedRule === v.ruleId}
                      onToggle={() => setExpandedRule(expandedRule === v.ruleId ? null : v.ruleId)}
                      onAnalyze={() => {
                        setInput(`Analyse la regle ${v.numRegle} de l'annexe ${v.annexeCode} : LHS=${v.lhs}, RHS=${v.rhs}, ecart=${v.gap}. Quelles sont les causes probables et que dois-je verifier ?`);
                        scrollChat();
                      }}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

      </main>
    </div>
  );
}

function VerdictRow({ verdict, expanded, onToggle, onAnalyze }: {
  verdict: EvaluationVerdict; expanded: boolean; onToggle: () => void; onAnalyze: () => void;
}) {
  const isFail = verdict.status === 'FAIL';
  const isPass = verdict.status === 'PASS';
  const statusColor = isPass ? 'var(--functional-pass)' : isFail ? 'var(--functional-fail)' : 'var(--mono-steel)';

  return (
    <>
      <tr className="border-b hover:bg-black/[0.02] cursor-pointer"
        style={{ borderColor: 'var(--glass-border-lo)', background: isFail ? 'rgba(255,59,48,0.04)' : 'transparent' }}
        onClick={onToggle}>
        <td className="px-3 py-2 font-mono" style={{ color: 'var(--mono-graphite)', fontWeight: isFail ? 'var(--font-medium)' : 'var(--font-regular)' }}>{verdict.numRegle}</td>
        <td className="px-3 py-2 font-mono" style={{ color: 'var(--brand-navy)' }}>{verdict.operRegle}</td>
        <td className="px-3 py-2 font-mono" style={{ color: 'var(--mono-slate)', maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {verdict.rhs ?? '—'}
        </td>
        <td className="px-3 py-2 font-mono" style={{ color: isFail ? 'var(--functional-fail)' : 'var(--mono-slate)', maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {verdict.lhs ?? '—'}
        </td>
        <td className="px-3 py-2 font-mono" style={{ color: 'var(--functional-fail)', fontWeight: isFail ? 'var(--font-medium)' : 'var(--font-regular)' }}>
          {verdict.gap ?? '—'}
        </td>
        <td className="px-3 py-2">
          <div className="flex items-center justify-between gap-1">
            <span className="px-1.5 py-0.5 rounded-full font-medium" style={{
              background: isPass ? 'var(--functional-pass-bg)' : isFail ? 'var(--functional-fail-bg)' : 'var(--mono-pearl)',
              color: statusColor, fontSize: '10px',
            }}>
              {isPass ? 'PASS' : isFail ? 'FAIL' : 'SKIP'}
            </span>
            {expanded ? <ChevronUp size={11} style={{ color: 'var(--mono-steel)' }} /> : <ChevronDown size={11} style={{ color: 'var(--mono-steel)' }} />}
          </div>
        </td>
      </tr>
      {expanded && (
        <tr style={{ background: isFail ? 'rgba(255,59,48,0.03)' : 'rgba(0,0,0,0.015)' }}>
          <td colSpan={6} className="px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                {verdict.skipReason && <p style={{ color: 'var(--mono-slate)', fontSize: '11px' }}>Raison : {verdict.skipReason}</p>}
                {verdict.gap && <p style={{ color: 'var(--functional-fail)', fontSize: '11px', fontWeight: 'var(--font-medium)' }}>
                  LHS ({verdict.lhs}) {verdict.operRegle} RHS ({verdict.rhs}) → ecart = {verdict.gap}
                </p>}
                <p style={{ color: 'var(--mono-steel)', fontSize: '10px' }}>{verdict.ruleId}</p>
              </div>
              {isFail && (
                <button onClick={onAnalyze} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg shrink-0" style={{
                  background: 'var(--brand-violet-bg)', color: 'var(--brand-violet)', fontSize: '11px', fontWeight: 'var(--font-medium)',
                }}>
                  <Sparkles size={10} /> Analyser
                </button>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function TopBar() {
  return (
    <header className="flex items-center justify-between px-6 shrink-0 border-b" style={{ height: 'var(--topbar-height)', background: 'var(--glass-chrome)', backdropFilter: 'blur(20px)', borderColor: 'var(--glass-border-lo)' }}>
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-8 h-8 rounded-full" style={{ background: 'var(--brand-violet)' }}>
          <Sparkles size={16} color="white" />
        </div>
        <span style={{ color: 'var(--mono-graphite)', fontWeight: 'var(--font-semibold)', fontSize: 'var(--text-lg)' }}>Regalica IDC</span>
      </div>
      <div className="hidden md:flex items-center gap-4">
        {[{ icon: Shield, label: 'Zero Hallucination' }, { icon: CheckCircle2, label: 'Citations obligatoires' }, { icon: Clock, label: 'Audit 10 ans' }, { icon: Lock, label: 'RLS multi-tenant' }].map(({ icon: Icon, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <Icon size={13} style={{ color: 'var(--brand-violet)' }} />
            <span style={{ color: 'var(--mono-steel)', fontSize: '11px', letterSpacing: 'var(--tracking-uppercase)', textTransform: 'uppercase' as const }}>{label}</span>
          </div>
        ))}
      </div>
      <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ color: 'var(--mono-slate)', fontSize: 'var(--text-sm)' }}>
        <Settings size={16} /><span>Parametres</span>
      </button>
    </header>
  );
}

function CommandBar() {
  const modules = [
    { icon: Upload, label: 'Deposer XML' }, { icon: CheckSquare, label: 'Validation', active: true },
    { icon: MessageSquare, label: 'Regalica' }, { icon: FileText, label: 'Rapports' },
    { icon: History, label: 'Historique' }, { icon: LayoutDashboard, label: 'Tableau de bord' },
    { icon: Search, label: 'Recherche' },
  ];
  return (
    <nav className="flex items-center gap-1 px-4 shrink-0 border-b" style={{ height: 'var(--commandbar-height)', background: 'var(--glass-chrome)', backdropFilter: 'blur(20px)', borderColor: 'var(--glass-border-lo)' }}>
      {modules.map(({ icon: Icon, label, active }) => (
        <button key={label} className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ fontSize: 'var(--text-sm)', color: active ? 'var(--brand-violet)' : 'var(--mono-slate)', background: active ? 'var(--brand-violet-bg)' : 'transparent', fontWeight: active ? 'var(--font-medium)' : 'var(--font-regular)' }}>
          <Icon size={15} /><span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </nav>
  );
}
