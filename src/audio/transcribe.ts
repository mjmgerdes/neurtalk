// On-device transcription: Whisper (tiny.en) running in the browser via
// transformers.js. The model is fetched once (~40MB) and cached by the
// browser; audio never leaves the device. Gemma then does the semantic
// parsing of the transcript — Whisper is only ears.

let asrPromise: Promise<(audio: Float32Array, opts: object) => Promise<{ text: string }>> | null =
  null;

async function getAsr(onProgress?: (msg: string) => void) {
  if (!asrPromise) {
    asrPromise = import("@xenova/transformers").then(async ({ pipeline, env }) => {
      env.allowLocalModels = false;
      const p = await pipeline("automatic-speech-recognition", "Xenova/whisper-tiny.en", {
        quantized: true,
        progress_callback: (d: { status?: string; progress?: number; file?: string }) => {
          if (d.status === "progress" && d.progress !== undefined)
            onProgress?.(`Downloading speech model… ${Math.round(d.progress)}%`);
        },
      });
      return p as unknown as (audio: Float32Array, opts: object) => Promise<{ text: string }>;
    });
  }
  return asrPromise;
}

async function toMono16k(blob: Blob): Promise<Float32Array> {
  const buf = await blob.arrayBuffer();
  const ac = new AudioContext();
  const decoded = await ac.decodeAudioData(buf);
  ac.close();
  const off = new OfflineAudioContext(1, Math.ceil(decoded.duration * 16000), 16000);
  const src = off.createBufferSource();
  src.buffer = decoded;
  src.connect(off.destination);
  src.start();
  const rendered = await off.startRendering();
  return rendered.getChannelData(0);
}

export async function transcribeBlob(
  blob: Blob,
  onProgress?: (msg: string) => void
): Promise<string> {
  onProgress?.("Preparing audio…");
  const audio = await toMono16k(blob);
  const asr = await getAsr(onProgress);
  onProgress?.("Transcribing on-device…");
  const out = await asr(audio, { chunk_length_s: 30, stride_length_s: 5 });
  return out.text.trim();
}
