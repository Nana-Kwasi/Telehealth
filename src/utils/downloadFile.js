// ─── downloadFile ────────────────────────────────────────────────────────────
// Force a real download for an attachment.
//
// The obvious approach — <a href={url} download="name"> — silently does nothing
// here: browsers ignore the `download` attribute on CROSS-ORIGIN urls, and the
// app (localhost:3001) and the file server (…:8085) are different origins. The
// click just navigated, so it looked like the button was dead.
//
// Fetching the bytes and handing the browser a same-origin blob: URL restores the
// intended behaviour and keeps the original filename.

export async function downloadFile(url, fileName = 'attachment') {
  if (!url) return false;
  try {
    const res = await fetch(url, { credentials: 'omit' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();

    // Give the browser a moment to start the download before revoking.
    setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
    return true;
  } catch (err) {
    // CORS or network failure — fall back to opening it, which at least lets the
    // user save it manually rather than leaving a dead button.
    console.warn('[downloadFile] falling back to open:', err?.message);
    window.open(url, '_blank', 'noopener');
    return false;
  }
}
