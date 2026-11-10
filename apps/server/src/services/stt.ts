import { config } from '../config.js';
import { logger } from '../lib/logger.js';

export interface SttResult {
  text: string;
  provider: string;
}

/**
 * Transcribes audio on the server using a local Whisper STT engine
 * (e.g. whisper.cpp server, faster-whisper-server, or local OpenAI-compatible STT).
 */
export async function transcribeAudioOnServer(audioBuffer: Buffer, mimeType = 'audio/webm'): Promise<SttResult> {
  if (!audioBuffer || audioBuffer.length === 0) {
    throw new Error('Audio payload is empty');
  }

  const cleanMime = mimeType.split(';')[0].trim() || 'audio/webm';
  const ext = cleanMime.includes('wav')
    ? 'wav'
    : cleanMime.includes('ogg')
      ? 'ogg'
      : cleanMime.includes('mp4')
        ? 'mp4'
        : 'webm';

  // Endpoints to probe in priority order
  const whisperUrl = config.WHISPER_URL.replace(/\/+$/, '');
  const baseHost = whisperUrl.replace(/\/v1\/audio\/transcriptions$/, '');
  const candidateEndpoints = [
    whisperUrl,
    `${baseHost}/inference`, // whisper.cpp server endpoint
    `${config.aiBaseUrl.replace(/\/+$/, '')}/audio/transcriptions`,
    `${config.LLAMA_CPP_URL.replace(/\/+$/, '')}/v1/audio/transcriptions`
  ].filter((url, idx, arr) => arr.indexOf(url) === idx);

  let lastError = '';

  for (const endpoint of candidateEndpoints) {
    try {
      logger.info({ endpoint, bytes: audioBuffer.length, mimeType: cleanMime }, 'Sending audio to server STT');
      const controller = new AbortController();
      // Allow up to 60s for CPU Whisper processing
      const timeoutId = setTimeout(() => controller.abort(), 60_000);

      const formData = new FormData();
      const blob = new Blob([new Uint8Array(audioBuffer)], { type: cleanMime });
      formData.append('file', blob, `recording.${ext}`);
      formData.append('model', config.WHISPER_MODEL || 'whisper-1');
      formData.append('response_format', 'json');

      const res = await fetch(endpoint, {
        method: 'POST',
        body: formData,
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const json = (await res.json()) as { text?: string };
        if (json.text && json.text.trim()) {
          logger.info({ endpoint, textLen: json.text.length }, 'Server Whisper transcription completed');
          return { text: json.text.trim(), provider: 'server-whisper' };
        }
      } else {
        const errText = await res.text().catch(() => '');
        lastError = `Endpoint ${endpoint} returned status ${res.status}: ${errText.slice(0, 100)}`;
        logger.warn({ endpoint, status: res.status, errText: errText.slice(0, 200) }, 'Server STT returned non-OK');
      }
    } catch (err: any) {
      lastError = err?.message || 'Connection failed';
      logger.debug({ endpoint, err: err?.message }, 'Server STT probe failed');
    }
  }

  throw new Error(
    `Server audio transcription failed: Could not connect to local Whisper STT at ${config.WHISPER_URL}. ` +
    `Ensure your Whisper server (e.g. whisper.cpp server or faster-whisper-server) is running on port 8081, or configure WHISPER_URL in your .env. ` +
    `(Details: ${lastError || 'Connection refused'})`
  );
}
