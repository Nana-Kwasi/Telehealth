/**
 * The browser's microphone and speaker for voice mode — the web counterpart of the iOS VoiceIo
 * module in the Bankai app.
 *
 * The microphone runs for the whole voice session with the browser's echo cancellation on, and
 * a rolling buffer keeps the last moments of sound. Nothing is kept or uploaded until speech
 * starts; then the capture begins from `preRollMs` BEFORE that moment, so the first syllable —
 * spoken before the level crossed the threshold — is not lost.
 *
 * Captures are encoded as 16 kHz mono WAV: what the recogniser works at, a tenth the size of the
 * raw 48 kHz stream, and with no codec for the server to guess.
 */

const OUT_RATE = 16000;
const METER_MS = 100;
const RING_SECONDS = 2;

const WORKLET = `
class Tap extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) this.port.postMessage(ch.slice(0));
    return true;
  }
}
registerProcessor('nessa-tap', Tap);
`;

export default class AudioIo {
  constructor({ onLevel } = {}) {
    this.onLevel = onLevel;
    this.ctx = null;
    this.stream = null;
    this.rate = 48000;
    this.ring = null;        // Float32Array ring of the last RING_SECONDS
    this.ringPos = 0;
    this.ringFull = false;
    this.capture = null;     // array of Float32Array chunks while capturing
    this.meterSum = 0;
    this.meterN = 0;
    this.meterTarget = 4800;
    this.source = null;      // playing AudioBufferSourceNode
    this.playEnd = null;
  }

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
    });
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx();
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    this.rate = this.ctx.sampleRate;
    this.ring = new Float32Array(Math.ceil(this.rate * RING_SECONDS));
    this.meterTarget = Math.round((this.rate * METER_MS) / 1000);
    const mic = this.ctx.createMediaStreamSource(this.stream);
    const onFrame = (f) => this.frame(f);

    if (this.ctx.audioWorklet && window.AudioWorkletNode) {
      const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));
      try {
        await this.ctx.audioWorklet.addModule(url);
        this.node = new window.AudioWorkletNode(this.ctx, 'nessa-tap');
        this.node.port.onmessage = (e) => onFrame(e.data);
      } finally {
        URL.revokeObjectURL(url);
      }
    } else {
      // Older Safari: the deprecated processor still works everywhere.
      this.node = this.ctx.createScriptProcessor(2048, 1, 1);
      this.node.onaudioprocess = (e) => onFrame(new Float32Array(e.inputBuffer.getChannelData(0)));
    }
    // Into a muted gain so the graph runs without playing the microphone back.
    this.sink = this.ctx.createGain();
    this.sink.gain.value = 0;
    mic.connect(this.node);
    this.node.connect(this.sink);
    this.sink.connect(this.ctx.destination);
    this.mic = mic;
  }

  frame(f) {
    const ring = this.ring;
    for (let i = 0; i < f.length; i += 1) {
      ring[this.ringPos] = f[i];
      this.ringPos += 1;
      if (this.ringPos === ring.length) { this.ringPos = 0; this.ringFull = true; }
      this.meterSum += f[i] * f[i];
    }
    this.meterN += f.length;
    if (this.capture) this.capture.push(f);
    if (this.meterN >= this.meterTarget) {
      const rms = Math.sqrt(this.meterSum / this.meterN);
      this.meterSum = 0;
      this.meterN = 0;
      this.onLevel?.(rms > 0 ? 20 * Math.log10(rms) : -100);
    }
  }

  /** Start keeping sound, from `preRollMs` ago. */
  beginCapture(preRollMs) {
    const want = Math.min(this.ring.length, Math.round((this.rate * preRollMs) / 1000));
    const have = this.ringFull ? this.ring.length : this.ringPos;
    const n = Math.min(want, have);
    const pre = new Float32Array(n);
    for (let i = 0; i < n; i += 1) {
      const j = (this.ringPos - n + i + this.ring.length) % this.ring.length;
      pre[i] = this.ring[j];
    }
    this.capture = [pre];
  }

  /** Everything captured so far, as WAV, without stopping. */
  snapshotCapture() {
    return this.capture ? encodeWav(this.capture, this.rate) : null;
  }

  endCapture() {
    const out = this.snapshotCapture();
    this.capture = null;
    return out;
  }

  cancelCapture() {
    this.capture = null;
  }

  get capturing() {
    return !!this.capture;
  }

  async decode(bytes) {
    // decodeAudioData detaches its input; give it a copy so a cached phrase can be decoded again.
    return this.ctx.decodeAudioData(bytes.slice(0));
  }

  /**
   * Play one decoded clip. Resolves `{ started, ended }`: `started` once sound begins (with the
   * clip's length in seconds), `ended` when it finishes — never, if stopped first.
   */
  play(buffer) {
    this.stopPlayback();
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.ctx.destination);
    const ended = new Promise((resolve) => {
      src.onended = () => { if (this.source === src) { this.source = null; resolve(); } };
    });
    this.source = src;
    src.start();
    return { seconds: buffer.duration, ended };
  }

  stopPlayback() {
    const s = this.source;
    this.source = null;
    if (s) { try { s.onended = null; s.stop(); } catch { /* already stopped */ } }
  }

  async stop() {
    this.stopPlayback();
    this.capture = null;
    try { this.node?.disconnect(); this.mic?.disconnect(); this.sink?.disconnect(); } catch { /* gone */ }
    this.stream?.getTracks().forEach((t) => t.stop());
    try { await this.ctx?.close(); } catch { /* closed */ }
    this.ctx = null;
  }
}

/** Float32 chunks at `rate` → 16 kHz 16-bit mono WAV Blob. */
function encodeWav(chunks, rate) {
  let total = 0;
  for (const c of chunks) total += c.length;
  const ratio = rate / OUT_RATE;
  const outLen = Math.floor(total / ratio);
  const pcm = new Int16Array(outLen);
  // Average each output sample's span of input samples: a cheap low-pass that keeps
  // the decimation from folding high frequencies into the speech band.
  let ci = 0;
  let co = 0;
  let acc = 0;
  let accN = 0;
  let nextEdge = ratio;
  let pos = 0;
  let o = 0;
  while (o < outLen && ci < chunks.length) {
    const c = chunks[ci];
    acc += c[co];
    accN += 1;
    pos += 1;
    co += 1;
    if (co >= c.length) { ci += 1; co = 0; }
    if (pos >= nextEdge) {
      const v = Math.max(-1, Math.min(1, acc / accN));
      pcm[o] = v < 0 ? v * 0x8000 : v * 0x7fff;
      o += 1;
      acc = 0;
      accN = 0;
      nextEdge += ratio;
    }
  }
  const header = new ArrayBuffer(44);
  const v = new DataView(header);
  const str = (off, s) => { for (let i = 0; i < s.length; i += 1) v.setUint8(off + i, s.charCodeAt(i)); };
  str(0, 'RIFF');
  v.setUint32(4, 36 + pcm.byteLength, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, OUT_RATE, true);
  v.setUint32(28, OUT_RATE * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, pcm.byteLength, true);
  return new Blob([header, pcm.buffer], { type: 'audio/wav' });
}
