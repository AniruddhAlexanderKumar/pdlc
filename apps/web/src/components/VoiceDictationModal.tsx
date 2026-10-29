import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FolderKanban,
  Layers,
  ListChecks,
  Mic,
  MicOff,
  Package,
  RotateCcw,
  Sparkles,
  Tag,
  Wand2
} from 'lucide-react';
import { XP, type VoiceImportPayload } from '@sv/shared';
import { useImportVoice, useProcessVoice } from '../api/hooks';
import { Burst } from './Celebrate';
import { Button, Card, cx, Modal, ProgressBar, StageBadge } from './ui';
import { useMoney } from '../lib/money';

const DEMO_TRANSCRIPTS = [
  {
    title: 'AeroFlow Silent Desk Fan',
    text: "I want to build an ultra quiet desktop fan for remote workers called AeroFlow. The problem with current desk fans is they are buzzing plastic eyesores that get picked up on microphone calls. Ours is machined from anodized aluminum, runs on a 5V fluid dynamic bearing brushless motor, and connects via USB-C. We want to retail it for $49. For parts we need the fan module, CNC aluminum tube, custom USB-C PWM PCB, silicone vibration dampeners, and a kraft box. Initial tasks: source the brushless fan samples, 3D print a test housing for bench validation, and fix desk resonance buzz at 70% speed."
  },
  {
    title: 'WhisperVent Fume Extractor',
    text: "I'm building an ergonomic desktop solder fume extractor for hardware makers called WhisperVent. Existing extractors are noisy and don't filter toxic VOCs. Mine has dual HEPA and carbon filters with a magnetic snap mount and a flexible gooseneck arm. Looking to sell it for $65. Parts needed: 12V brushless blower fan, dual filter cartridge, heavy duty gooseneck, and molded housing. First sprint: 3D print the enclosure, bench test airflow CFM with anemometer, and order sample filters."
  }
];

export function VoiceDictationModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const { symbol, fmt } = useMoney();
  const processVoice = useProcessVoice();
  const importVoice = useImportVoice();

  const [step, setStep] = useState<'dictate' | 'preview'>('dictate');
  const [transcript, setTranscript] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recognitionSupported, setRecognitionSupported] = useState(true);
  const [micError, setMicError] = useState<string | null>(null);
  const [payloadDraft, setPayloadDraft] = useState<VoiceImportPayload | null>(null);
  const [providerUsed, setProviderUsed] = useState<string>('qwen');
  const [expandedIssue, setExpandedIssue] = useState<number | null>(0);
  const [celebrate, setCelebrate] = useState(false);

  const recognitionRef = useRef<any>(null);
  const timerRef = useRef<any>(null);

  // Setup Web Speech Recognition
  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setRecognitionSupported(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event: any) => {
        let full = '';
        for (let i = 0; i < event.results.length; ++i) {
          full += event.results[i][0].transcript + ' ';
        }
        setTranscript(full.trim());
      };

      recognition.onerror = (event: any) => {
        if (event.error !== 'no-speech') {
          setMicError(`Microphone error: ${event.error}`);
          setIsRecording(false);
        }
      };

      recognition.onend = () => {
        setIsRecording(false);
      };

      recognitionRef.current = recognition;
    } catch {
      setRecognitionSupported(false);
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const toggleRecording = () => {
    setMicError(null);
    if (isRecording) {
      if (recognitionRef.current) recognitionRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    } else {
      if (!recognitionRef.current) {
        setMicError('Speech recognition is not supported in this browser. You can type or paste your thoughts below.');
        return;
      }
      try {
        recognitionRef.current.start();
        setIsRecording(true);
        setRecordingSeconds(0);
        timerRef.current = setInterval(() => {
          setRecordingSeconds((s) => s + 1);
        }, 1000);
      } catch (err: any) {
        setMicError(err?.message || 'Failed to start microphone');
      }
    }
  };

  const handleProcess = () => {
    if (!transcript.trim()) return;
    if (isRecording) toggleRecording();

    processVoice.mutate(transcript.trim(), {
      onSuccess: (res) => {
        setPayloadDraft(res.data);
        setProviderUsed(res.provider);
        setStep('preview');
      }
    });
  };

  const handleImport = () => {
    if (!payloadDraft) return;
    importVoice.mutate(payloadDraft, {
      onSuccess: (res) => {
        setCelebrate(true);
        setTimeout(() => {
          onClose();
          navigate(`/projects`);
        }, 900);
      }
    });
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <>
      <Modal
        title={step === 'dictate' ? 'Hands-Free Voice AI · Product Ideation' : 'Review & Import to Workspace'}
        subtitle={
          step === 'dictate'
            ? 'Speak freely about your idea. Server Qwen will distill facts, answer discovery questionnaires, and build your starter Jira board.'
            : `Synthesized by ${providerUsed === 'llama-cpp' ? 'llama.cpp (Qwen 30B A3B)' : providerUsed === 'qwen' ? 'Ollama (Qwen 2.5)' : 'server intelligence engine'}. Check your beginner board and confirm.`
        }
        onClose={onClose}
        size="lg"
        footer={
          step === 'dictate' ? (
            <>
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button
                onClick={handleProcess}
                disabled={!transcript.trim() || processVoice.isPending}
                loading={processVoice.isPending}
                icon={<Sparkles className="h-4 w-4" />}
              >
                Synthesize with Server Qwen
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" icon={<RotateCcw className="h-4 w-4" />} onClick={() => setStep('dictate')}>
                Back to Dictation
              </Button>
              <Button
                onClick={handleImport}
                loading={importVoice.isPending}
                icon={<CheckCircle2 className="h-4 w-4" />}
              >
                Confirm & Launch Workspace · +{XP.productCreated} XP
              </Button>
            </>
          )
        }
      >
        {step === 'dictate' ? (
          <div className="space-y-5">
            {/* Mic Controls */}
            <div className="flex flex-col items-center justify-center rounded-2xl border border-zinc-200 bg-zinc-50/50 p-6 text-center dark:border-zinc-800 dark:bg-zinc-900/40">
              <button
                type="button"
                onClick={toggleRecording}
                className={cx(
                  'relative flex h-20 w-20 items-center justify-center rounded-full transition-all duration-300 shadow-md',
                  isRecording
                    ? 'bg-rose-600 text-white shadow-rose-500/40 animate-pulse ring-4 ring-rose-500/20'
                    : 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-indigo-500/30 hover:scale-105'
                )}
                aria-label={isRecording ? 'Stop recording' : 'Start speaking'}
              >
                {isRecording ? <MicOff className="h-8 w-8" /> : <Mic className="h-8 w-8" />}
              </button>

              <div className="mt-3">
                <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                  {isRecording ? `Listening… ${formatTime(recordingSeconds)}` : 'Click to start speaking hands-free'}
                </p>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {isRecording
                    ? 'Talk about the problem, who it is for, key materials, target price, and next steps.'
                    : recognitionSupported
                    ? 'Microphone ready. Speaks directly into the transcript.'
                    : 'Browser speech recognition unavailable. You can type or paste below.'}
                </p>
              </div>

              {micError && (
                <div className="mt-3 flex items-center gap-1.5 text-xs text-rose-600 dark:text-rose-400">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{micError}</span>
                </div>
              )}
            </div>

            {/* Live Transcript / Brain Dump Textarea */}
            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs font-medium text-zinc-500">
                <span>Spoken Transcript / Brain Dump</span>
                {transcript && (
                  <button type="button" onClick={() => setTranscript('')} className="hover:text-zinc-800 dark:hover:text-zinc-200">
                    Clear text
                  </button>
                )}
              </div>
              <textarea
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                rows={4}
                placeholder="Talk into your microphone or paste your rambling thoughts here… (e.g. 'I want to build a low noise desktop fan for remote workers with brushless motor and CNC aluminum tube for $49...')"
                className="w-full rounded-xl border border-zinc-200 bg-white p-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-800 dark:bg-zinc-900"
              />
            </div>

            {/* Quick Demo Fillers */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">Quick Test Scenarios (1-Click Demo)</p>
              <div className="flex flex-wrap gap-2">
                {DEMO_TRANSCRIPTS.map((demo) => (
                  <button
                    key={demo.title}
                    type="button"
                    onClick={() => setTranscript(demo.text)}
                    className="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:border-indigo-300 hover:bg-indigo-50/30 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-indigo-700"
                  >
                    <Wand2 className="h-3.5 w-3.5 text-indigo-500" />
                    <span>{demo.title}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          payloadDraft && (
            <div className="space-y-6">
              {/* Product Header Card */}
              <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4 dark:border-indigo-900/40 dark:bg-indigo-950/20">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-zinc-900 dark:text-white">{payloadDraft.product.name}</h3>
                      <StageBadge stage={payloadDraft.product.stage} />
                    </div>
                    <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">{payloadDraft.product.description}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="text-xs text-zinc-400 uppercase font-semibold">Target Price</span>
                    <p className="text-lg font-bold text-indigo-600 dark:text-indigo-400">
                      {payloadDraft.product.target_price ? fmt(payloadDraft.product.target_price) : 'Not specified'}
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-4 border-t border-indigo-100/60 pt-2 text-xs text-zinc-500 dark:border-indigo-900/40">
                  <span>Category: <strong>{payloadDraft.product.category}</strong></span>
                  <span>Est. Labour: <strong>{fmt(payloadDraft.product.labour)}</strong></span>
                  <span>Est. Packaging: <strong>{fmt(payloadDraft.product.packaging)}</strong></span>
                  <span>Est. Overhead: <strong>{fmt(payloadDraft.product.overhead)}</strong></span>
                </div>
              </div>

              {/* Discovery Questionnaire Auto-Bypass */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                      Discovery Questions Auto-Answered ({payloadDraft.answers.length})
                    </h4>
                  </div>
                  <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                    Bypassed Form · XP Ready
                  </span>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {payloadDraft.answers.map((ans) => (
                    <div key={ans.question_key} className="rounded-lg border border-zinc-200 bg-white p-2.5 text-xs dark:border-zinc-800 dark:bg-zinc-900">
                      <p className="font-semibold text-zinc-400">{ans.question_key}</p>
                      <p className="mt-1 text-zinc-700 dark:text-zinc-200 line-clamp-2">{String(ans.value)}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Bill of Materials (BOM) */}
              {payloadDraft.materials.length > 0 && (
                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <Layers className="h-4 w-4 text-indigo-500" />
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                      Extracted Bill of Materials ({payloadDraft.materials.length})
                    </h4>
                  </div>
                  <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-zinc-50 text-zinc-500 dark:bg-zinc-800/60">
                        <tr>
                          <th className="px-3 py-2">Component</th>
                          <th className="px-3 py-2">Category</th>
                          <th className="px-3 py-2">Qty</th>
                          <th className="px-3 py-2">Unit Price</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                        {payloadDraft.materials.map((m, idx) => (
                          <tr key={idx} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30">
                            <td className="px-3 py-2 font-medium">{m.name}</td>
                            <td className="px-3 py-2 text-zinc-500">{m.category}</td>
                            <td className="px-3 py-2">{m.quantity} {m.unit}</td>
                            <td className="px-3 py-2 font-semibold">{fmt(m.unit_price)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* "Jira for Beginners" Issue Board */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FolderKanban className="h-4 w-4 text-indigo-500" />
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                      Jira for Beginners Starter Board ({payloadDraft.issues.length} items)
                    </h4>
                  </div>
                  <span className="rounded-md bg-zinc-100 px-2 py-0.5 font-mono text-[11px] font-bold text-indigo-600 dark:bg-zinc-800 dark:text-indigo-400">
                    KEY: {payloadDraft.project.project_key}
                  </span>
                </div>

                <div className="space-y-2">
                  {payloadDraft.issues.map((issue, idx) => {
                    const isExpanded = expandedIssue === idx;
                    return (
                      <div
                        key={idx}
                        className="rounded-lg border border-zinc-200 bg-white p-3 transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900"
                      >
                        <div
                          className="flex cursor-pointer items-start justify-between gap-2"
                          onClick={() => setExpandedIssue(isExpanded ? null : idx)}
                        >
                          <div className="flex items-start gap-2">
                            <span
                              className={cx(
                                'rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider',
                                issue.type === 'Story'
                                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                  : issue.type === 'Bug'
                                  ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                                  : 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
                              )}
                            >
                              {issue.type}
                            </span>
                            <div>
                              <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">{issue.summary}</p>
                              {issue.milestone_tag && (
                                <span className="mt-0.5 inline-block text-[11px] text-zinc-400">
                                  Milestone: {issue.milestone_tag}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span
                              className={cx(
                                'rounded px-1.5 py-0.5 text-[10px] font-semibold',
                                issue.priority === 'Critical'
                                  ? 'bg-rose-500/10 text-rose-600'
                                  : issue.priority === 'High'
                                  ? 'bg-amber-500/10 text-amber-600'
                                  : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                              )}
                            >
                              {issue.priority}
                            </span>
                            {isExpanded ? <ChevronUp className="h-4 w-4 text-zinc-400" /> : <ChevronDown className="h-4 w-4 text-zinc-400" />}
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="mt-3 border-t border-zinc-100 pt-2.5 text-xs text-zinc-600 dark:border-zinc-800 dark:text-zinc-300">
                            <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">
                              {issue.description}
                            </pre>
                            {issue.labels.length > 0 && (
                              <div className="mt-2.5 flex flex-wrap gap-1">
                                {issue.labels.map((l) => (
                                  <span key={l} className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] text-zinc-500 dark:bg-zinc-800">
                                    #{l}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )
        )}
      </Modal>
      {celebrate && <Burst />}
    </>
  );
}
