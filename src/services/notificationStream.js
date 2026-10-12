// ─── notificationStream ──────────────────────────────────────────────────────
// Live notification delivery over Server-Sent Events.
//
// The browser's EventSource cannot send an Authorization header, and the stream
// endpoint requires a bearer token. Putting the token in the query string would
// leak it into proxy logs and browser history, so the stream is read with fetch
// + a ReadableStream reader instead. Same protocol, headers allowed.
//
// The connection is self-healing: any drop (sleep, network change, server
// restart) reconnects with a backoff, and the caller is told so it can refetch
// whatever it missed while disconnected.

import { API_BASE, getStoredToken } from './apiClient';

const MIN_RETRY_MS = 2000;
const MAX_RETRY_MS = 30000;

/**
 * Subscribe to a realtime topic.
 *
 * @param {string} topic     e.g. "notifications:target:<uuid>"
 * @param {(event:object)=>void} onEvent   parsed JSON frame
 * @param {()=>void} [onReconnect]         fired after a reconnect, to resync
 * @returns {() => void} unsubscribe
 */
export function subscribeToTopic(topic, onEvent, onReconnect) {
  if (!topic) return () => {};

  let stopped = false;
  let controller = null;
  let retry = MIN_RETRY_MS;
  let everConnected = false;

  const connect = async () => {
    if (stopped) return;
    const token = getStoredToken();
    if (!token) {
      // Not signed in yet — try again shortly rather than failing for good.
      scheduleRetry();
      return;
    }

    controller = new AbortController();
    try {
      const res = await fetch(
        `${API_BASE}/api/v1/realtime/stream?topic=${encodeURIComponent(topic)}`,
        {
          headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
          signal: controller.signal,
        },
      );
      // Refused (403) or malformed (400): the server's topic policy will not change
      // its answer on retry, so stop instead of reconnecting forever.
      if (res.status === 403 || res.status === 400) { stopped = true; return; }
      if (!res.ok || !res.body) throw new Error(`stream ${res.status}`);

      // Connected. Reset the backoff and let the caller resync anything that
      // happened while we were away.
      if (everConnected && typeof onReconnect === 'function') onReconnect();
      everConnected = true;
      retry = MIN_RETRY_MS;

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      // SSE frames are separated by a blank line; a chunk can split one in half,
      // so whatever trails the last separator is kept for the next read.
      for (;;) {
        const { value, done } = await reader.read();
        if (done || stopped) break;
        buffer += decoder.decode(value, { stream: true });

        let sep;
        while ((sep = buffer.indexOf('\n\n')) !== -1) {
          const frame = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          emit(frame, onEvent);
        }
      }
    } catch (err) {
      // Aborts are our own doing; everything else is a genuine drop.
      if (!stopped && err?.name !== 'AbortError') { /* fall through to retry */ }
    }
    if (!stopped) scheduleRetry();
  };

  const scheduleRetry = () => {
    const wait = retry;
    retry = Math.min(retry * 2, MAX_RETRY_MS);
    setTimeout(connect, wait);
  };

  connect();

  return () => {
    stopped = true;
    try { controller?.abort(); } catch { /* already gone */ }
  };
}

/** Pull the data: lines out of one SSE frame and hand over the parsed JSON. */
function emit(frame, onEvent) {
  const data = frame
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
    .join('\n');
  if (!data) return;
  try {
    onEvent(JSON.parse(data));
  } catch {
    // A heartbeat or a non-JSON frame — nothing to do with it.
  }
}
