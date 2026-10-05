import { API_BASE, refreshAccessToken } from './apiClient';

/**
 * Consume the AI SSE stream in the browser.
 *
 * EventSource cannot be used: it only issues GET requests, and this endpoint is
 * a POST carrying the message and history. fetch with a readable body works in
 * every browser this app targets, so the frames are parsed manually.
 *
 * Callback names mirror the server's event names exactly, so adding an event on
 * the backend cannot silently do nothing here.
 */
export async function streamAssist({ body, onChunk, onEscalation, onRefusal, onRetract, onDone, onError }) {
  const controller = new AbortController();

  const open = (token) => fetch(`${API_BASE}/api/v1/ai/assist/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
    signal: controller.signal,
  });

  try {
    let res = await open(sessionStorage.getItem('nessa.token'));

    // Retry once through the refresh, exactly as api() does. Without this the
    // stream was the ONLY request in the app that could not survive an expired
    // access token: the page around it kept working, so the failure looked
    // like the assistant being down rather than the session needing a refresh.
    if (res.status === 401) {
      const fresh = await refreshAccessToken();
      if (fresh) res = await open(fresh);
    }

    if (!res.ok || !res.body) {
      // Read whatever the server did say before falling back to the generic
      // line. "Could not be reached" was being shown for every failure —
      // including ones the server had explained — so a fixable problem and a
      // genuine outage looked identical.
      let detail = '';
      try {
        const text = await res.text();
        if (text) {
          try { detail = JSON.parse(text)?.error || JSON.parse(text)?.message || ''; }
          catch { detail = text.slice(0, 200); }
        }
      } catch { /* body already consumed or empty */ }

      onError?.(new Error(
        res.status === 401 ? 'Your session expired. Please sign in again.'
          : detail || `The assistant could not be reached (server returned ${res.status}).`,
      ));
      return () => {};
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let settled = false;
    const finish = (fn, arg) => { if (!settled) { settled = true; fn?.(arg); } };

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Only take complete frames; a partial tail waits for the next read.
      let split;
      while ((split = buffer.indexOf('\n\n')) >= 0) {
        const frame = buffer.slice(0, split);
        buffer = buffer.slice(split + 2);

        let event = 'message';
        let data = '';
        for (const line of frame.split('\n')) {
          if (line.startsWith('event:')) event = line.slice(6).trim();
          else if (line.startsWith('data:')) data += line.slice(5).trim();
        }
        if (!data) continue;

        let payload;
        try { payload = JSON.parse(data); } catch { continue; }

        if (event === 'chunk') onChunk?.(payload.text || '');
        // The server now reports a real reason rather than dying silently.
        else if (event === 'error') finish(onError, new Error(payload.text || 'The assistant could not be reached.'));
        else if (event === 'escalation') finish(onEscalation, payload);
        else if (event === 'refusal') finish(onRefusal, payload);
        else if (event === 'retract') finish(onRetract, payload);
        else if (event === 'done') finish(onDone, payload);
      }
    }
    if (!settled) finish(onDone, {});
  } catch (e) {
    if (e?.name !== 'AbortError') {
      // A genuine network-level failure — the server was not spoken to at all.
      // Named as such, so it is distinguishable from a server that answered.
      onError?.(new Error(
        'Could not connect to the assistant. Check that you are online and try again.',
      ));
    }
  }

  return () => controller.abort();
}
