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
  Square,
  Tag,
  Wand2
} from 'lucide-react';
import { XP, type VoiceImportPayload } from '@sv/shared';
import { useImportVoice, useProcessVoice, useProcessVoiceAudio, useSession } from '../api/hooks';
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
  const me = useSession();
  const { symbol, fmt } = useMoney();
  const processVoice = useProcessVoice();
  const processVoiceAudio = useProcessVoiceAudio();
  const importVoice = useImportVoice();

  const [step, setStep] = useState<'record' | 'preview'>('record');
  const [transcript, setTranscript] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [micError, setMicError] = useState<string | null>(null);
  const [payloadDraft, setPayloadDraft] = useState<VoiceImportPayload | null>(null);
  const [providerUsed, setProviderUsed] = useState<string>('server');
  const [serverTranscript, setServerTranscript] = useState<string>('');
  const [expandedIssue, setExpandedIssue] = useState<number | null>(0);

  // Retry-safe import state. A submitted draft is kept only in this tab so an
  // uncertain response can be retried with the same idempotency key after a
  // reload. Storage is never treated as authority.
  const [requestId, setRequestId] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const recoveryKey = `sv-voice-pending:${me.user.id}:${me.workspace.id}`;

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null);

  // Restore a submitted-but-unconfirmed import for this user/workspace only.
  useEffect(() => {
    setPayloadDraft(null); setRequestId(null); setPendingImport(false); setStep('record'); setRecoveryError(null);
    try {
      const saved = sessionStorage.getItem(recoveryKey);
      if (!saved) return;
      const item = JSON.parse(saved) as {
        requestId: string;
        draft: VoiceImportPayload;
        provider: string;
        transcript?: string;
      };
      if (!item.requestId || !item.draft) return;
      setRequestId(item.requestId);
      setPayloadDraft(item.draft);
      setProviderUsed(item.provider ?? 'server');
      setServerTranscript(item.transcript ?? '');
      setPendingImport(true);
      setStep('preview');
    } catch {
      setRecoveryError('Could not restore a pending import. Check existing records before creating another.');
    }
  }, [recoveryKey]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  const startRecording = async () => {
    setMicError(null);
    setAudioBlob(null);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    audioChunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']
        .find((type) => MediaRecorder.isTypeSupported(type)) || '';

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const recordedBlob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        setAudioBlob(recordedBlob);
        setAudioUrl(URL.createObjectURL(recordedBlob));
        stream.getTracks().forEach((track) => track.stop());
      };

      recorder.start(250); // Slice every 250ms
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordingSeconds(0);

      timerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      setMicError(err?.message || 'Microphone access denied or not available');
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  const handleProcessAudioOnServer = (blobToProcess?: Blob) => {
    const targetBlob = blobToProcess || audioBlob;
    if (!targetBlob) return;

    if (isRecording) {
      stopRecording();
    }

    setMicError(null);
    processVoiceAudio.mutate(targetBlob, {
      onSuccess: (res) => {
        setPayloadDraft(res.data);
        setRequestId(crypto.randomUUID());
        setProviderUsed(res.provider);
        setServerTranscript(res.transcript || '');
        setStep('preview');
      },
      onError: (err: any) => {
        setMicError(err?.message || 'Failed to process audio on server');
      }
    });
  };

  const handleProcessText = (customText?: string) => {
    const target = (customText || transcript).trim();
    if (!target) return;

    setMicError(null);
    processVoice.mutate(target, {
      onSuccess: (res) => {
        setPayloadDraft(res.data);
        setRequestId(crypto.randomUUID());
        setProviderUsed(res.provider);
        setServerTranscript(target);
        setStep('preview');
      },
      onError: (err: any) => {
        setMicError(err?.message || 'Failed to process transcript with server LLM');
      }
    });
  };

  const handleImport = () => {
    if (!payloadDraft || !requestId) return;
    try {
      sessionStorage.setItem(recoveryKey, JSON.stringify({ requestId, draft: payloadDraft, provider: providerUsed, transcript: serverTranscript }));
      setPendingImport(true); setRecoveryError(null);
    } catch {
      setRecoveryError('Cannot save a retry key in this tab. Enable session storage before importing to prevent duplicate work.');
      return;
    }
    importVoice.mutate({ requestId, draft: payloadDraft }, {
      onSuccess: () => {
        try { sessionStorage.removeItem(recoveryKey); } catch { /* A retry remains safe if removal fails. */ }
        setPendingImport(false);
        setTimeout(() => {
          onClose();
          navigate('/projects');
        }, 900);
      }
    });
  };

  const resetToDictation = () => {
    if (pendingImport && !window.confirm('This import may already have completed. Check existing records before starting over. Discard the saved retry key?')) return;
    try { sessionStorage.removeItem(recoveryKey); } catch { setRecoveryError('Could not clear the saved retry key.'); return; }
    setPendingImport(false);
    setStep('record');
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const isServerProcessing = processVoiceAudio.isPending || processVoice.isPending;

  return (
    <>
      <Modal
        title={step === 'record' ? 'Hands-Free Voice AI (Server STT & LLM)' : 'Review & Import to Workspace'}
        subtitle={
          step === 'record'
            ? 'Record raw audio hands-free. Audio is streamed to the server where Whisper STT transcribes it and Qwen builds your beginner Jira board. Avoid sensitive information; the draft needs review before import.'
            : `Synthesized entirely on server via ${providerUsed}. AI can make mistakes; review every detail before confirming.`
        }
        onClose={onClose}
        size="lg"
        footer={
          step === 'record' ? (
            <>
              <Button variant="secondary" onClick={onClose} disabled={isServerProcessing}>
                Cancel
              </Button>
              {audioBlob ? (
                <Button
                  onClick={() => handleProcessAudioOnServer()}
                  disabled={isServerProcessing}
                  loading={processVoiceAudio.isPending}
                  icon={<Sparkles className="h-4 w-4" />}
                >
                  Process Audio on Server
                </Button>
              ) : (
                <Button
                  onClick={() => handleProcessText()}
                  disabled={!transcript.trim() || isServerProcessing}
                  loading={processVoice.isPending}
                  icon={<Sparkles className="h-4 w-4" />}
                >
                  Synthesize Text on Server
                </Button>
              )}
            </>
          ) : (
            <>
              <Button variant="secondary" disabled={importVoice.isPending} icon={<RotateCcw className="h-4 w-4" />} onClick={resetToDictation}>
                Back to Dictation
              </Button>
              <Button
                onClick={handleImport}
                loading={importVoice.isPending}
                disabled={me.workspace.role === 'member' || importVoice.isPending || importVoice.isSuccess}
                icon={<CheckCircle2 className="h-4 w-4" />}
              >
                Confirm & Launch Workspace · +{XP.productCreated} XP
              </Button>
            </>
          )
        }
      >
        {step === 'record' ? (
          <div className="space-y-5">
            {/* Server-Side Recording Card */}
            <div className="flex flex-col items-center justify-center rounded-2xl border border-zinc-200 bg-zinc-50/50 p-6 text-center dark:border-zinc-800 dark:bg-zinc-900/40">
              <button
                type="button"
                onClick={isRecording ? stopRecording : startRecording}
                disabled={isServerProcessing}
                className={cx(
                  'relative flex h-20 w-20 items-center justify-center rounded-full transition-all duration-300 shadow-md',
                  isRecording
                    ? 'bg-rose-600 text-white shadow-rose-500/40 animate-pulse ring-4 ring-rose-500/20'
                    : 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-indigo-500/30 hover:scale-105'
                )}
                aria-label={isRecording ? 'Stop recording audio' : 'Start recording audio'}
              >
                {isRecording ? <Square className="h-7 w-7" /> : <Mic className="h-8 w-8" />}
              </button>

              <div className="mt-3">
                <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                  {isRecording
                    ? `Recording Audio… ${formatTime(recordingSeconds)}`
                    : audioBlob
                    ? `Recorded Audio Ready (${formatTime(recordingSeconds)})`
                    : 'Click to Record Hands-Free Audio'}
                </p>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {isRecording
                    ? 'Speak freely about the problem, materials, price, and first tasks. Raw audio will be transcribed by Whisper on the server.'
                    : audioBlob
                    ? 'Audio recorded. Click below to upload and transcribe on server, or record again.'
                    : 'Audio is recorded directly from your microphone and processed on your server (zero browser speech-to-text).'}
                </p>
              </div>

              {/* Audio playback preview if recorded */}
              {audioUrl && !isRecording && (
                <div className="mt-4 flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-2 dark:border-zinc-800 dark:bg-zinc-900">
                  <audio src={audioUrl} controls className="h-8 max-w-xs" />
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<RotateCcw className="h-3.5 w-3.5" />}
                    onClick={startRecording}
                  >
                    Re-record
                  </Button>
                </div>
              )}

              {/* Status message while server processes */}
              {isServerProcessing && (
                <div className="mt-4 flex items-center gap-2 rounded-xl bg-indigo-500/10 px-3.5 py-2 text-xs font-medium text-indigo-700 dark:text-indigo-300">
                  <span className="h-2 w-2 animate-ping rounded-full bg-indigo-500" />
                  <span>
                    {processVoiceAudio.isPending
                      ? 'Streaming audio to server → Transcribing with Whisper STT → Synthesizing with Qwen…'
                      : 'Synthesizing product roadmap with server Qwen…'}
                  </span>
                </div>
              )}

              {micError && (
                <div className="mt-3 flex items-start gap-1.5 rounded-lg bg-rose-50 p-2.5 text-left text-xs text-rose-700 dark:bg-rose-950/40 dark:text-rose-400">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <p className="font-semibold">Notice</p>
                    <p>{micError}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Manual Notes / Fallback Text Input */}
            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs font-medium text-zinc-500">
                <span>Or Type / Paste Notes Directly (Processed by Server Qwen)</span>
                {transcript && (
                  <button type="button" onClick={() => setTranscript('')} className="hover:text-zinc-800 dark:hover:text-zinc-200">
                    Clear text
                  </button>
                )}
              </div>
              <textarea
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                rows={3}
                placeholder="Prefer typing? Paste notes here (e.g. 'I want to build a low noise desktop fan for remote workers with brushless motor for $49...')"
                className="w-full rounded-xl border border-zinc-200 bg-white p-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-800 dark:bg-zinc-900"
              />
            </div>

            {/* 1-Click Quick Scenarios */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">1-Click Test Scenarios (Instant Demo)</p>
              <div className="flex flex-wrap gap-2">
                {DEMO_TRANSCRIPTS.map((demo) => (
                  <button
                    key={demo.title}
                    type="button"
                    onClick={() => {
                      setTranscript(demo.text);
                      handleProcessText(demo.text);
                    }}
                    className="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:border-indigo-300 hover:bg-indigo-50/30 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-indigo-700"
                  >
                    <Wand2 className="h-3.5 w-3.5 text-indigo-500" />
                    <span>Run {demo.title}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          payloadDraft && (
            <div className="space-y-6">
              {recoveryError && <p role="alert" className="text-sm text-rose-700">{recoveryError}</p>}
              {pendingImport && (
                <p role="status" className="rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                  A previous import from this tab may not have completed. Confirm again to retry it safely with the same request key.
                </p>
              )}
              {me.workspace.role === 'member' && (
                <p role="alert" className="text-sm text-rose-700">Only workspace owners and admins can create the project required for this import.</p>
              )}

              {/* Server Whisper Transcript Box */}
              {serverTranscript && (
                <div className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-3 text-xs dark:border-zinc-800 dark:bg-zinc-900/50">
                  <div className="mb-1 flex items-center justify-between text-zinc-500">
                    <span className="font-semibold uppercase tracking-wider text-[10px]">
                      Server Transcript (Whisper STT)
                    </span>
                    <span className="rounded bg-indigo-500/10 px-1.5 py-0.5 text-[10px] font-medium text-indigo-600 dark:text-indigo-400">
                      Processed on Server
                    </span>
                  </div>
                  <p className="text-zinc-700 dark:text-zinc-300 italic">“{serverTranscript}”</p>
                </div>
              )}

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
    </>
  );
}
