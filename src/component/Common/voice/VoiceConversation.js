import React, { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Mic, MicOff, X } from 'lucide-react';
import AudioIo from './audioIo';
import { speak, transcribe } from './speechApi';
import { classifyTurn, pickBackchannel, ALL_BACKCHANNELS } from './voiceTurn';
import { chooseAck, pickPhrase, isSmallTalk, ALL_PHRASES, DIDNT_CATCH, NO_CONNECTION, THINKING, STILL_THINKING } from './voiceAcks';
import VoiceOrb from './VoiceOrb';
import { pickOrbTheme } from './orbThemes';

/**
 * Hands-free conversation with the assistant — the web port of the Bankai care VoiceDock.
 *
 * Voice is a transport around the chat, never a second assistant: what the person says is
 * transcribed, screened on the server, and handed to the host (`onUtterance`), which sends it
 * through its normal typed path. The host forwards that reply's stream back here (onTurnStart /
 * onDelta / onDone / onError), and it is spoken sentence by sentence as it is written, so the
 * first words are heard while the rest is still being generated.
 *
 * Nothing is ever agreed to by voice. A booking the assistant proposes still needs the Confirm
 * button on screen; the acknowledgements here are chosen never to sound like consent.
 *
 * Turn-taking, as on the phone app:
 *   - speech is detected on the device against the room's own level; nothing is uploaded until
 *     someone speaks, and the capture starts 1.5 s before that so the first syllable is kept
 *   - while they talk, what was said so far is transcribed at each short pause, so at the end
 *     of the turn the words are usually already known
 *   - at a pause the words decide: a finished question is answered, "If I take it with food,"
 *     gets "Mm-hmm" and more listening, "um…" gets "Take your time"
 *   - talking over the reply stops it; the text on screen stops where the voice did
 */

const SPEECH_MIN_DB = -35;
const SPEECH_OVER_FLOOR_DB = 15;
const SPEECH_START_MS = 300;
const END_SILENCE_MS = 700;
const MAX_TURN_MS = 30000;
const METER_MS = 100;
const PRE_ROLL_MS = 1500;
const BARGE_PRE_ROLL_MS = 1500;
const SPEC_PAUSE_MS = 250;
const LIVE_CAPTION_MS = 2000;
const SPEC_MIN_SPEECH_MS = 800;
const HOLD_SILENCE_MS = 2500;
const MAX_HOLDS = 2;
const HESITATION_GIVE_UP_MS = 9000;
const CHARS_PER_SECOND = 15;

// Talking over the reply. A browser's echo canceller leaves more of the assistant's own voice
// in the microphone than the phone's voice processor does, so the bar is higher and the echo
// level is learnt continuously while it speaks rather than only from quiet moments.
const BARGE_MIN_DB = -38;
const BARGE_OVER_ECHO_DB = 18;
const BARGE_START_MS = 400;
const BARGE_GRACE_MS = 600;

const FIRST_CHUNK_MIN = 1;
const CHUNK_MIN = 80;
const SPOKEN_LIMIT = 650;
const REST_ON_SCREEN = "I've put the rest on your screen.";
const SENTENCE_END = /[.!?](?=\s|$)|\n/g;

const QUIET_ROOM_DB = -60;
const dbToLevel = (db) => Math.max(0, Math.min(1, (db + 55) / 45));

// The room's level is carried between turns: re-learning it from the first reading of each turn
// made the person's own voice "the room" whenever listening resumed while they were talking.
const roomFloor = { db: null };
const freshVad = () => ({
  floor: roomFloor.db ?? QUIET_ROOM_DB,
  speechMs: 0, heard: false, heardAt: 0, lastSpeechAt: 0, startedAt: Date.now(),
});

const VoiceConversation = forwardRef(function VoiceConversation(
  { onUtterance, onEscalation, onClose, onVoiceText, accent = '#1d4ed8', title = 'Voice' },
  ref,
) {
  const [phase, setPhase] = useState('warming');
  const [caption, setCaption] = useState('Getting ready…');
  const [heard, setHeard] = useState('');
  // A different orb design for each conversation.
  const [orbVariant] = useState(pickOrbTheme);
  const phaseRef = useRef('warming');
  const levelRef = useRef(0);
  const io = useRef(null);

  const vad = useRef(freshVad());
  const barge = useRef({ echo: null, speechMs: 0, since: 0 });

  const replyBuf = useRef('');
  const spokenChars = useRef(0);
  const capped = useRef(false);
  const replyDone = useRef(false);
  const ignoreReply = useRef(false);
  const clips = useRef([]);           // [{ text, audio: Promise<{buffer, marks}|null>, reply, keep }]
  const playing = useRef(false);
  const spec = useRef(null);          // { takenAt, promise, turn }
  const lastSnapAt = useRef(0);
  const heardSoFar = useRef('');
  const turnSeq = useRef(0);
  const ackAudio = useRef({});
  const lastAck = useRef(null);
  const alive = useRef(true);
  const deciding = useRef(false);
  const lastBackchannel = useRef(null);
  const asideUntil = useRef(0);

  // Spoken waiting: while the answer is being worked out and nothing is being said, say so —
  // a silent pause sounds like it has stopped. At most two phrases a turn (see voiceAcks).
  const WAIT_FIRST_MS = 2500;
  const WAIT_AGAIN_MS = 7000;
  const waitSaid = useRef(0);
  const waitTimer = useRef(null);
  const lastWait = useRef(null);
  const waitCheckRef = useRef(() => {});

  const go = (p) => {
    phaseRef.current = p;
    setPhase(p);
    clearTimeout(waitTimer.current);
    if (p === 'thinking' && waitSaid.current < 2) {
      waitTimer.current = setTimeout(() => waitCheckRef.current(),
        waitSaid.current === 0 ? WAIT_FIRST_MS : WAIT_AGAIN_MS);
    }
  };

  // ── Listening ─────────────────────────────────────────────────────────────────────────

  const startListening = useCallback(() => {
    if (!alive.current || !io.current) return;
    io.current.cancelCapture();
    vad.current = freshVad();
    spec.current = null;
    heardSoFar.current = '';
    setHeard('');
    turnSeq.current += 1;
    levelRef.current = 0;
    setCaption('Listening…');
    go('listening');
  }, []);

  const snapshot = (now) => {
    lastSnapAt.current = now;
    const turn = turnSeq.current;
    const wav = io.current?.snapshotCapture();
    if (!wav) return;
    const promise = transcribe(wav, { snapshot: true })
      // A failed request is not "nothing was said": marked so the turn retries, and if the
      // network really is down, says so rather than "I didn't catch that".
      .catch((e) => ({ failed: true, text: '', confidence: null, status: e?.status }))
      .then((result) => {
        if (!result?.failed && result?.text && turn === turnSeq.current && spec.current?.promise === promise) {
          heardSoFar.current = result.text;
          if (phaseRef.current === 'listening') setHeard(result.text);
        }
        return result;
      });
    spec.current = { takenAt: now, promise, turn };
  };

  // A pre-synthesised phrase, ahead of anything queued after it.
  const speakPhrase = (phrase) => {
    const audio = ackAudio.current[phrase];
    if (!audio) {
      setCaption(phrase);
      return false;
    }
    clips.current.unshift({ text: phrase, audio, keep: true });
    playNext();
    return true;
  };

  const resetReply = () => {
    waitSaid.current = 0;
    replyBuf.current = '';
    spokenChars.current = 0;
    capped.current = false;
    replyDone.current = false;
    ignoreReply.current = false;
    clips.current = [];
  };

  const finishTurn = useCallback(async (decided) => {
    if (phaseRef.current !== 'listening') return;
    go('transcribing');
    const v = vad.current;
    // A snapshot taken after the last moment of speech already covers the whole turn.
    const ready = decided && !decided.retry
      ? { promise: Promise.resolve(decided) }
      : !decided && spec.current && spec.current.takenAt >= v.lastSpeechAt ? spec.current : null;
    const wav = io.current?.endCapture();
    if (!v.heard || !wav) {
      startListening();
      return;
    }
    resetReply();
    setHeard(heardSoFar.current || '…');

    let result = null;
    try {
      // A transcription taken after the last moment of speech already covers the whole turn
      // (and was screened like any other); only without one is the turn uploaded again.
      const early = ready ? await ready.promise : null;
      result = early && !early.failed ? early : await transcribe(wav);
    } catch (e) {
      if (e?.status === 401) {
        setCaption('Your session has expired. Sign in again to keep talking.');
        go('error');
        return;
      }
      if (e?.status === 429) {
        setCaption(e.message);
        go('error');
        return;
      }
      replyDone.current = true;
      if (!speakPhrase(NO_CONNECTION)) setTimeout(startListening, 1500);
      return;
    }
    if (!alive.current) return;

    if (result.escalated && result.safetyText) {
      // A spoken crisis: the safety response is shown and said, and the words go no further.
      setHeard('');
      onEscalation?.(result.safetyText);
      replyDone.current = true;
      clips.current.push({ text: result.safetyText, audio: fetchClip(result.safetyText) });
      playNext();
      return;
    }

    const text = (result.text || '').trim();
    if (!text) {
      replyDone.current = true;
      if (!speakPhrase(DIDNT_CATCH)) setTimeout(startListening, 1500);
      return;
    }
    setHeard(text);
    const ack = chooseAck(text, lastAck.current);
    if (ack) {
      lastAck.current = ack;
      waitSaid.current = 1;   // the acknowledgement already says it is working on it
      speakPhrase(ack);
    }
    // "Hi" or "thanks" is answered at once; a waiting phrase over it would be absurd.
    if (isSmallTalk(text)) waitSaid.current = 2;
    if (phaseRef.current === 'transcribing') go('thinking');
    onUtterance?.(text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onUtterance, onEscalation, startListening]);

  // "Mm-hmm." while still listening. Not queued with the reply: the person is mid-turn.
  const playAside = async (phrase) => {
    // Only if it is ready now: a late "mm-hmm" would land on the person's next words.
    const clip = await within(ackAudio.current[phrase], 200);
    if (!clip?.buffer || !alive.current || phaseRef.current !== 'listening') return;
    try {
      const { seconds } = io.current.play(clip.buffer);
      // Its own echo must not count as the person resuming.
      asideUntil.current = Date.now() + (seconds || 0.8) * 1000 + 150;
    } catch { /* a missed "mm-hmm" costs nothing */ }
  };

  // At a pause: finished, or only a breath? Decided from the words heard so far.
  const decideTurn = async () => {
    if (deciding.current) return;
    deciding.current = true;
    const v = vad.current;
    try {
      if (!spec.current || spec.current.takenAt < v.lastSpeechAt) snapshot(Date.now());
      const s = spec.current;
      if (!s) { finishTurn(); return; }
      const result = await s.promise;
      if (phaseRef.current !== 'listening' || s.turn !== turnSeq.current) return;
      if (v.lastSpeechAt > s.takenAt) return; // they carried on talking
      if (!result || result.failed) { finishTurn({ retry: true }); return; }

      const kind = classifyTurn(result.text, result.confidence);
      const now = Date.now();
      if (kind === 'complete' || kind === 'unclear' || now - v.heardAt >= MAX_TURN_MS) {
        finishTurn(result);
        return;
      }
      if (kind === 'hesitation') {
        if (now - v.lastSpeechAt >= HESITATION_GIVE_UP_MS) { startListening(); return; }
        if (!v.holds) {
          const phrase = pickBackchannel('hesitation', lastBackchannel.current);
          lastBackchannel.current = phrase;
          playAside(phrase);
        }
        v.holds = (v.holds || 0) + 1;
        v.endSilence = HOLD_SILENCE_MS;
        return;
      }
      if ((v.holds || 0) >= MAX_HOLDS) { finishTurn(result); return; }
      if (!v.holds) {
        const phrase = pickBackchannel('incomplete', lastBackchannel.current);
        lastBackchannel.current = phrase;
        playAside(phrase);
      }
      v.holds = (v.holds || 0) + 1;
      v.endSilence = HOLD_SILENCE_MS;
    } finally {
      deciding.current = false;
    }
  };

  const onMeter = (db) => {
    if (phaseRef.current === 'warming') startListening();
    if (phaseRef.current === 'speaking' || (phaseRef.current === 'thinking' && playing.current)) {
      levelRef.current = dbToLevel(db);
      if (phaseRef.current === 'speaking') detectBargeIn(db);
      return;
    }
    if (phaseRef.current !== 'listening') {
      levelRef.current *= 0.8;
      return;
    }
    const v = vad.current;
    const now = Date.now();
    levelRef.current = dbToLevel(db);
    // The room's own level, learnt only from moments that are not themselves loud.
    if (db < SPEECH_MIN_DB) {
      v.floor = db < v.floor ? db : v.floor + (db - v.floor) * 0.02;
      roomFloor.db = v.floor;
    }
    const isSpeech = db > SPEECH_MIN_DB && db > v.floor + SPEECH_OVER_FLOOR_DB && !(asideUntil.current > now);
    if (isSpeech) {
      v.speechMs += METER_MS;
      v.lastSpeechAt = now;
      v.endSilence = END_SILENCE_MS;
      if (v.speechMs >= SPEECH_START_MS && !v.heard) {
        v.heard = true;
        v.heardAt = now;
        io.current.beginCapture(PRE_ROLL_MS);
      }
    } else if (!v.heard) {
      // Evidence decays: a door bang now and a cough later must not add up to speech.
      v.speechMs = Math.max(0, v.speechMs - METER_MS / 2);
    }
    if (!v.heard) return;
    const quietFor = now - v.lastSpeechAt;
    if (quietFor >= (v.endSilence || END_SILENCE_MS) || now - v.heardAt >= MAX_TURN_MS) {
      decideTurn();
      return;
    }
    if (now - v.heardAt >= SPEC_MIN_SPEECH_MS) {
      const paused = now - v.lastSpeechAt >= SPEC_PAUSE_MS;
      const uncovered = !spec.current || spec.current.takenAt < v.lastSpeechAt;
      const captionDue = now - Math.max(lastSnapAt.current, v.heardAt) >= LIVE_CAPTION_MS;
      if ((paused && uncovered) || captionDue) snapshot(now);
    }
  };

  const detectBargeIn = (db) => {
    if (deviceSpeaking.current) return;   // its own voice is not cancelled: tap to interrupt
    const b = barge.current;
    const now = Date.now();
    if (b.echo === null) b.echo = roomFloor.db ?? QUIET_ROOM_DB;
    // The first moments of a clip only teach the echo level; the person rarely cuts in that fast.
    if (now - b.since < BARGE_GRACE_MS) {
      b.echo = Math.max(b.echo, db - 3);
      return;
    }
    const loud = db > BARGE_MIN_DB && db > b.echo + BARGE_OVER_ECHO_DB;
    if (loud) {
      b.speechMs += METER_MS;
      if (b.speechMs >= BARGE_START_MS) interrupt({ byVoice: true });
    } else {
      b.speechMs = Math.max(0, b.speechMs - METER_MS / 2);
      // Follows the echo both ways, slowly, so a loud passage of the reply raises the bar.
      b.echo += (db - b.echo) * 0.05;
    }
  };

  // Still thinking, nothing playing and no part of the answer queued yet: say a waiting phrase.
  waitCheckRef.current = () => {
    if (!alive.current || phaseRef.current !== 'thinking' || playing.current) return;
    if (clips.current.length || spokenChars.current > 0 || replyDone.current || ignoreReply.current) return;
    const phrase = pickPhrase(waitSaid.current === 0 ? THINKING : STILL_THINKING, lastWait.current);
    waitSaid.current += 1;
    lastWait.current = phrase;
    if (!speakPhrase(phrase)) go('thinking'); // not synthesised: keep the next check scheduled
  };

  const onMeterRef = useRef(onMeter);
  onMeterRef.current = onMeter;

  // ── Speaking ──────────────────────────────────────────────────────────────────────────

  const fetchClip = (text) => speak(text)
    .then(async ({ bytes, marks }) => ({ buffer: await io.current.decode(bytes), marks }))
    .catch(() => null);

  // How long to wait for the natural voice before the device's own voice says it instead.
  // A short phrase must be instant; a sentence of the answer can wait a little longer.
  const PHRASE_WAIT_MS = 350;
  const SENTENCE_WAIT_MS = 4500;
  const within = (promise, ms) => Promise.race([promise, new Promise((r) => setTimeout(() => r(null), ms))]);

  /**
   * The device's own voice (the browser's speech synthesis). Used when the natural voice is not
   * ready in time — the speech provider can be busy — so the answer is always spoken, never
   * left as text alone. It plays outside the echo canceller's reference, so talking over it is
   * not detected; tapping the orb still interrupts.
   */
  const deviceSpeaking = useRef(false);
  const deviceVoice = useRef(null);
  const sayOnDevice = (text) => {
    const synth = window.speechSynthesis;
    if (!synth || !window.SpeechSynthesisUtterance) return null;
    if (!deviceVoice.current) {
      const voices = synth.getVoices();
      deviceVoice.current = voices.find((v) => /en[-_](GB|US)/i.test(v.lang) && /female|samantha|google uk|karen|serena/i.test(v.name))
        || voices.find((v) => /^en/i.test(v.lang)) || null;
    }
    const u = new window.SpeechSynthesisUtterance(text);
    if (deviceVoice.current) u.voice = deviceVoice.current;
    u.rate = 1.02;
    const ended = new Promise((resolve) => { u.onend = resolve; u.onerror = resolve; });
    deviceSpeaking.current = true;
    synth.cancel();
    synth.speak(u);
    return { ms: (text.length / CHARS_PER_SECOND) * 1000, ended: ended.then(() => { deviceSpeaking.current = false; }) };
  };
  const stopDeviceVoice = () => {
    deviceSpeaking.current = false;
    try { window.speechSynthesis?.cancel(); } catch { /* nothing playing */ }
  };

  const afterSpeaking = () => {
    if (!alive.current || ignoreReply.current) return;
    if (replyDone.current && clips.current.length === 0) {
      onVoiceText?.({ type: 'all' });
      setTimeout(startListening, 150);
    } else if (!replyDone.current && phaseRef.current === 'speaking') {
      go('thinking');
    }
  };

  const playNext = async () => {
    if (playing.current || !alive.current) return;
    const next = clips.current.shift();
    if (!next) { afterSpeaking(); return; }
    playing.current = true;
    if (phaseRef.current === 'speaking') go('thinking');
    const clip = await within(next.audio, next.keep ? PHRASE_WAIT_MS : SENTENCE_WAIT_MS);
    if (!alive.current || ignoreReply.current) { playing.current = false; return; }
    if (!clip?.buffer) {
      // The natural voice is not ready (or failed): say it with the device's voice instead.
      const said = sayOnDevice(next.text.trim());
      if (!said) {
        if (next.reply) onVoiceText?.({ type: 'chunk', text: next.text, ms: 0 });
        playing.current = false;
        playNext();
        return;
      }
      if (phaseRef.current !== 'speaking') go('speaking');
      if (next.reply) onVoiceText?.({ type: 'chunk', text: next.text, ms: said.ms });
      await said.ended;
      if (ignoreReply.current) return;
      playing.current = false;
      playNext();
      return;
    }
    if (phaseRef.current !== 'speaking') {
      barge.current = { echo: null, speechMs: 0, since: Date.now() };
      go('speaking');
    } else {
      barge.current.since = Date.now();
    }
    const { seconds, ended } = io.current.play(clip.buffer);
    if (next.reply) {
      // Marks are offsets into the trimmed text; the screen counts from the untrimmed chunk.
      const lead = next.text.length - next.text.trimStart().length;
      onVoiceText?.({
        type: 'chunk',
        text: next.text,
        ms: seconds ? seconds * 1000 : (next.text.length / CHARS_PER_SECOND) * 1000,
        marks: (clip.marks || []).map(([off, sec]) => [off + lead, sec * 1000]),
      });
    }
    await ended;
    if (ignoreReply.current) return;
    playing.current = false;
    playNext();
  };

  const enqueue = (text, { reply = false } = {}) => {
    if (!text.trim()) return;
    clips.current.push({ text: reply ? text : text.trim(), audio: fetchClip(text.trim()), reply });
    playNext();
  };

  // Complete sentences off the front of the buffer, queued for speech.
  const drain = (final) => {
    if (capped.current) return;
    const buf = replyBuf.current;
    let cut = -1;
    SENTENCE_END.lastIndex = 0;
    let m;
    const min = spokenChars.current === 0 ? FIRST_CHUNK_MIN : CHUNK_MIN;
    while ((m = SENTENCE_END.exec(buf))) {
      cut = m.index + 1;
      if (cut >= min) break;
    }
    if (final) cut = buf.length;
    if (cut <= 0 || (!final && cut < min)) return;
    const chunk = buf.slice(0, cut);
    replyBuf.current = buf.slice(cut);
    if (spokenChars.current + chunk.length > SPOKEN_LIMIT && spokenChars.current > 0) {
      capped.current = true;
      enqueue(REST_ON_SCREEN);
      return;
    }
    spokenChars.current += chunk.length;
    enqueue(chunk, { reply: true });
    if (!final && replyBuf.current) drain(false);
  };

  const interrupt = ({ byVoice = false } = {}) => {
    onVoiceText?.({ type: 'stop' });
    ignoreReply.current = true;
    clips.current = [];
    playing.current = false;
    io.current?.stopPlayback();
    stopDeviceVoice();
    if (byVoice && io.current) {
      // Already talking: their turn starts now, from just before they began.
      turnSeq.current += 1;
      spec.current = null;
      heardSoFar.current = '';
      setHeard('');
      io.current.beginCapture(BARGE_PRE_ROLL_MS);
      const now = Date.now();
      vad.current = { ...freshVad(), heard: true, heardAt: now, lastSpeechAt: now, speechMs: SPEECH_START_MS };
      setCaption('Listening…');
      go('listening');
      return;
    }
    startListening();
  };

  useImperativeHandle(ref, () => ({
    // A turn the microphone did not start (a suggestion tapped, a message typed): speak it too.
    onTurnStart() {
      if (!['listening', 'warming', 'muted', 'error'].includes(phaseRef.current)) return;
      io.current?.cancelCapture();
      resetReply();
      turnSeq.current += 1;
      setHeard('');
      go('thinking');
    },
    onDelta(chunk) {
      if (ignoreReply.current || phaseRef.current === 'listening') return;
      replyBuf.current += chunk;
      drain(false);
    },
    onDone() {
      if (ignoreReply.current) return;
      replyDone.current = true;
      drain(true);
      if (!playing.current && clips.current.length === 0) afterSpeaking();
    },
    onError(message) {
      if (ignoreReply.current) return;
      replyDone.current = true;
      clips.current = [];
      onVoiceText?.({ type: 'all' });
      setCaption(message || 'Something went wrong. Say that again?');
      setTimeout(startListening, 1500);
    },
  }));

  // ── Lifecycle ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    alive.current = true;
    const audio = new AudioIo({ onLevel: (db) => onMeterRef.current(db) });
    io.current = audio;
    (async () => {
      try {
        await audio.start();
      } catch (e) {
        setCaption(e?.name === 'NotAllowedError'
          ? 'Allow microphone access for this site to talk to the assistant.'
          : 'This browser could not start the microphone.');
        go('error');
        return;
      }
      if (!alive.current) return;
      // Every acknowledgement synthesised up front, ONE AT A TIME: sending them all together
      // made the speech provider answer "busy" to everything, the reply included. The server
      // keeps them, so after the first session these come back at once. Until a phrase is
      // ready, the device's voice says it.
      let chain = Promise.resolve();
      for (const phrase of [...ALL_PHRASES, ...ALL_BACKCHANNELS]) {
        chain = chain.then(() => (alive.current ? fetchClip(phrase) : null));
        ackAudio.current[phrase] = chain;
      }
    })();
    return () => {
      onVoiceText?.({ type: 'all' });
      alive.current = false;
      clearTimeout(waitTimer.current);
      ignoreReply.current = true;
      clips.current = [];
      stopDeviceVoice();
      audio.stop();
      io.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Space bar: interrupt, or "I've finished" — the keyboard equivalent of tapping the orb.
  const onOrb = () => {
    if (phaseRef.current === 'speaking') interrupt();
    else if (phaseRef.current === 'listening') { if (vad.current.heard) finishTurn(); }
    else if (phaseRef.current === 'error' || phaseRef.current === 'muted') startListening();
  };
  const onOrbRef = useRef(onOrb);
  onOrbRef.current = onOrb;
  useEffect(() => {
    const onKey = (e) => {
      if (e.code !== 'Space' || /input|textarea|select/i.test(e.target?.tagName || '')) return;
      e.preventDefault();
      onOrbRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const toggleMute = () => {
    if (phaseRef.current === 'muted') { startListening(); return; }
    if (phaseRef.current === 'listening') {
      io.current?.cancelCapture();
      setCaption('Muted');
      go('muted');
    }
  };

  const orbState = phase === 'speaking' ? 'speaking'
    : phase === 'thinking' || phase === 'transcribing' || phase === 'warming' ? 'thinking'
      : phase === 'muted' || phase === 'error' ? 'muted'
        : 'listening';

  const statusLine = phase === 'warming' ? 'Getting ready…'
    : phase === 'listening' ? (heard || 'Listening…')
      : phase === 'transcribing' || phase === 'thinking' ? (heard ? `“${heard}”` : 'Thinking…')
        : phase === 'speaking' ? ''
          : phase === 'muted' ? 'Muted'
            : caption;

  const hint = phase === 'speaking' ? 'Start talking, or tap the orb, to interrupt'
    : phase === 'listening' ? "Speak naturally — I'll answer when you pause"
      : phase === 'thinking' || phase === 'transcribing' ? 'Thinking…'
        : phase === 'muted' ? 'Tap the orb to talk'
          : '';

  return (
    <div style={S.dock} role="region" aria-label={`${title} voice conversation`}>
      <VoiceOrb state={orbState} levelRef={levelRef} onPress={onOrb} variant={orbVariant} />
      <div style={S.status} aria-live="polite">{statusLine}</div>
      <div style={S.hint}>{hint}</div>
      <div style={S.controls}>
        <button type="button" onClick={toggleMute}
          style={{ ...S.ctrl, ...(phase === 'muted' ? { background: accent, color: '#fff' } : { color: accent }) }}
          aria-pressed={phase === 'muted'} aria-label={phase === 'muted' ? 'Unmute' : 'Mute'}>
          {phase === 'muted' ? <MicOff size={16} /> : <Mic size={16} />}
          {phase === 'muted' ? 'Unmute' : 'Mute'}
        </button>
        <button type="button" onClick={onClose} style={{ ...S.ctrl, ...S.end }} aria-label="End voice conversation">
          <X size={16} /> End
        </button>
      </div>
    </div>
  );
});

// Memoised: the chat re-renders on every streamed token, and none of that concerns the dock.
export default memo(VoiceConversation);

/**
 * In voice mode, the reply's text follows the voice: what is on screen is what has been said.
 *
 * Returns `onVoiceText` for the dock and `visible(text)`, which cuts the reply being spoken to
 * the part already heard. Re-renders its host about 20 times a second while a sentence plays.
 */
export function useVoiceReveal(active) {
  const sched = useRef({ base: 0, len: 0, ms: 0, start: 0, marks: null, all: true, stopped: false, at: 0 });
  const [, setTick] = useState(0);
  const timer = useRef(null);

  const allowed = useCallback(() => {
    const v = sched.current;
    if (v.all) return Infinity;
    if (v.stopped) return v.base;
    // Safety net, only once the voice has begun: if it then goes quiet for a long time after the
    // sentence it was saying (synthesis stuck), stop holding the words back. It used to count
    // from the question, so any answer the model took more than 8 s to start was shown as text
    // before a word of it was spoken. Before the first sentence nothing is shown: a sentence
    // that fails to synthesise is reported at once, and done or error releases everything.
    if (v.len > 0 && Date.now() - (v.start + v.ms) > 12000) return Infinity;
    const elapsed = Date.now() - v.start;
    const marks = v.marks;
    if (marks && marks.length > 1) {
      let shown = 0;
      for (let i = 0; i < marks.length; i += 1) {
        const [off, at] = marks[i];
        if (elapsed >= at) { shown = off; continue; }
        const [prevOff, prevAt] = i > 0 ? marks[i - 1] : [0, 0];
        const span = Math.max(1, at - prevAt);
        shown = prevOff + Math.floor((off - prevOff) * Math.max(0, (elapsed - prevAt) / span));
        break;
      }
      if (elapsed >= marks[marks.length - 1][1]) shown = v.len;
      return v.base + Math.min(v.len, shown);
    }
    const frac = v.ms > 0 ? Math.min(1, elapsed / v.ms) : 1;
    return v.base + Math.floor(v.len * frac);
  }, []);

  const ensureTimer = () => {
    if (timer.current) return;
    timer.current = setInterval(() => {
      setTick((n) => n + 1);
      const v = sched.current;
      if (v.all || v.stopped || Date.now() - v.start > v.ms + 500) {
        clearInterval(timer.current);
        timer.current = null;
      }
    }, 50);
  };

  /** A new reply is starting: hold its text until its voice arrives. */
  const beginReply = useCallback(() => {
    sched.current = { base: 0, len: 0, ms: 0, start: Date.now(), marks: null, all: !active, stopped: false, at: Date.now() };
  }, [active]);

  const onVoiceText = useCallback((e) => {
    const v = sched.current;
    if (e.type === 'chunk') {
      sched.current = { ...v, base: v.base + v.len, len: e.text.length, ms: e.ms || 0,
        marks: e.marks && e.marks.length ? e.marks : null, start: Date.now(), at: Date.now() };
      ensureTimer();
    } else if (e.type === 'all') {
      sched.current = { ...v, all: true };
      setTick((n) => n + 1);
    } else if (e.type === 'stop') {
      const shown = allowed();
      sched.current = { ...v, stopped: true, all: false, base: Number.isFinite(shown) ? shown : v.base + v.len, len: 0 };
      setTick((n) => n + 1);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed]);

  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);
  useEffect(() => { if (!active) sched.current = { ...sched.current, all: true }; }, [active]);

  const visible = useCallback((text) => {
    const n = allowed();
    return Number.isFinite(n) ? String(text || '').slice(0, n) : text;
  }, [allowed]);

  /** How much of the reply had been heard when it was cut off; null if not cut off. */
  const stoppedAt = () => (sched.current.stopped ? sched.current.base : null);

  return { onVoiceText, visible, beginReply, stoppedAt };
}

const S = {
  dock: { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0.6rem 0.75rem 0.4rem',
    borderTop: '1px solid #e2e8f0', background: '#fff' },
  status: { marginTop: 4, minHeight: 40, maxWidth: 420, fontSize: '0.95rem', lineHeight: 1.35,
    color: '#0f172a', textAlign: 'center', overflow: 'hidden', display: '-webkit-box',
    WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' },
  hint: { fontSize: '0.74rem', color: '#5b6170', minHeight: 16, marginTop: 2, textAlign: 'center' },
  controls: { display: 'flex', gap: 10, marginTop: 10 },
  ctrl: { display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 40, padding: '0 1.1rem',
    borderRadius: 999, border: 'none', background: 'rgba(29,78,216,0.08)', fontWeight: 700,
    fontSize: '0.86rem', cursor: 'pointer', fontFamily: 'inherit' },
  end: { background: '#dc2626', color: '#fff' },
};
