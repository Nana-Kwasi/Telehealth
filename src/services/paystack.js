import { api } from './apiClient';

/**
 * Take a payment for a booking, and only resolve once it is CONFIRMED.
 *
 * Web uses a POPUP rather than a full redirect. A redirect works for the
 * MedPsych sign-up (whose state is cached and survives the round trip), but a
 * booking made inside the dashboard would lose its half-filled form on the way
 * to Paystack and back. The popup keeps the SPA alive.
 *
 * The popup is watched rather than trusted: `window.closed` tells us the user
 * finished with it, and the ANSWER comes from verifying the reference with our
 * server. Cross-origin means we cannot read anything out of the popup itself,
 * which is exactly why verification is the source of truth.
 *
 * Returns `{ ok: true, reference, amount, currency }` on a confirmed payment,
 * or `{ ok: false, reason }` — callers must not create anything unless `ok`.
 */

/**
 * Record a price promotion against a payment that has just been confirmed.
 *
 * Deliberately here rather than in each Payment screen: every path that takes
 * money goes through payForBooking, and patching call sites one at a time is
 * how half of them end up never recording.
 *
 * Never throws. A redemption that fails to record is an accounting gap, not a
 * reason to fail a booking the customer has already paid for — the server
 * recomputes the discount anyway, so nothing here can inflate it.
 */
async function recordPromotionRedemption(reference, metadata) {
  const promotionId = metadata?.promotionId;
  if (!promotionId || !reference) return;
  try {
    await api('/api/v1/promotions/redeem', {
      method: 'POST',
      body: {
        promotionId,
        serviceType: metadata.serviceType || null,
        providerId: metadata.providerId || null,
        baseAmount: metadata.listPrice ?? metadata.baseAmount ?? null,
        reference,
      },
    });
  } catch {
    /* see above — never block a paid booking on bookkeeping */
  }
}

export async function payForBooking({ email, amount, purpose, metadata }) {
  if (!email) return { ok: false, reason: 'No email address for the payment receipt.' };
  if (!amount || Number(amount) <= 0) {
    return { ok: true, reference: null, amount: 0, skipped: true };
  }

  let init;
  try {
    init = await api('/api/v1/payments/initialize', {
      method: 'POST',
      authenticated: false,
      body: { email, amount: Number(amount), purpose, metadata: metadata || {} },
    });
  } catch (e) {
    return { ok: false, reason: e?.message || 'Could not start the payment.' };
  }

  if (!init?.authorizationUrl || !init?.reference) {
    return { ok: false, reason: 'Payment could not be started.' };
  }

  const popup = window.open(init.authorizationUrl, 'nessahub_pay', 'width=480,height=720');
  if (!popup) {
    return { ok: false, reason: 'Your browser blocked the payment window. Allow pop-ups and try again.' };
  }

  // Waiting for `popup.closed` alone is not enough: a user who pays and then
  // leaves the window open, or switches back to this tab without closing it,
  // would sit here forever while the charge has already gone through. So POLL
  // the verify endpoint alongside watching the window, and take whichever
  // arrives first.
  const confirmed = await new Promise((resolve) => {
    const deadline = Date.now() + 15 * 60 * 1000;
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      clearInterval(timer);
      resolve(value);
    };

    const timer = setInterval(async () => {
      if (Date.now() > deadline) return finish(null);

      const res = await api(`/api/v1/payments/verify/${encodeURIComponent(init.reference)}`, {
        authenticated: false,
      }).catch(() => null);

      if (res?.paid) {
        // They have paid; close the window for them rather than leaving it up.
        try { popup.close(); } catch { /* cross-origin, ignore */ }
        return finish(res);
      }

      // Closed without a confirmed payment: re-check a couple of times, since
      // settlement can lag the redirect, then give up.
      if (popup.closed) {
        for (let i = 0; i < 3; i += 1) {
          // eslint-disable-next-line no-await-in-loop
          const late = await api(`/api/v1/payments/verify/${encodeURIComponent(init.reference)}`, {
            authenticated: false,
          }).catch(() => null);
          if (late?.paid) return finish(late);
          // eslint-disable-next-line no-await-in-loop
          await new Promise((r) => setTimeout(r, 1500));
        }
        return finish(null);
      }
    }, 2500);
  });

  if (!confirmed?.paid) {
    return { ok: false, reason: 'Payment was not completed.', reference: init.reference };
  }
  const check = confirmed;

  await recordPromotionRedemption(init.reference, metadata);

  return {
    ok: true,
    reference: init.reference,
    amount: check.amount ?? Number(amount),
    currency: check.currency || init.currency || 'GHS',
  };
}

export default payForBooking;
