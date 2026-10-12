import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../../../services/apiClient';
import Paged from '../../Common/Paged';

/**
 * Price promotions — the offers that actually change what people pay.
 *
 * Distinct from AdminPromotions, which composes promotional EMAIL. That screen
 * announces an offer; this one creates it. Announcing a discount no screen
 * applies was the gap this fills.
 *
 * Two rules the UI makes visible because the server enforces them anyway:
 *
 *  - A promotion that names providers cannot go live until one approves. The
 *    activate button says so rather than failing on click.
 *  - A percentage promotion must carry a maximum discount. 20% of an unusually
 *    high fee is how "a fifth off" quietly becomes a giveaway, and the field is
 *    required for that type alone.
 */

const DISCOUNT_TYPES = [
  { key: 'percent',      label: 'Percentage off',  hint: 'e.g. 20% off the session fee' },
  { key: 'fixed_amount', label: 'Fixed amount off', hint: 'e.g. GHS 30 off' },
  { key: 'fixed_price',  label: 'Set a flat price', hint: 'e.g. every session becomes GHS 99' },
];

const AUDIENCES = [
  { key: 'everyone',       label: 'Everyone' },
  { key: 'new_clients',    label: 'New therapy clients' },
  { key: 'new_patients',   label: 'New medical patients' },
  { key: 'returning',      label: 'Returning users' },
  { key: 'specific_users', label: 'A specific list' },
];

const SERVICES = [
  { key: 'therapy',        label: 'Therapy' },
  { key: 'psychiatry',     label: 'Psychiatry' },
  { key: 'medical',        label: 'Medical care' },
  { key: 'second_opinion', label: 'Second opinion' },
  { key: 'home_care',      label: 'Home care' },
];

/** Ready-made shapes for the offers a clinic actually runs. */
const PRESETS = [
  {
    key: 'christmas',
    label: 'Christmas',
    emoji: '🎄',
    apply: () => ({
      name: 'Christmas Offer', badgeLabel: 'Christmas', badgeColour: '#b3121f',
      discountType: 'percent', value: 20, maxDiscountAmount: 50,
      audience: 'everyone', ...december(),
    }),
  },
  {
    key: 'new_year',
    label: 'New Year',
    emoji: '🎉',
    apply: () => ({
      name: 'New Year Offer', badgeLabel: 'New Year', badgeColour: '#2f5e40',
      discountType: 'percent', value: 15, maxDiscountAmount: 40,
      audience: 'everyone', ...januaryWindow(),
    }),
  },
  {
    key: 'welcome',
    label: 'New patient welcome',
    emoji: '👋',
    apply: () => ({
      name: 'Welcome Offer', badgeLabel: 'New patient', badgeColour: '#047857',
      discountType: 'fixed_amount', value: 30,
      audience: 'new_patients', newUserWindowDays: 30, ...next(90),
    }),
  },
  {
    key: 'mental_health_day',
    label: 'Mental Health Day',
    emoji: '🧠',
    apply: () => ({
      name: 'World Mental Health Day', badgeLabel: 'Mental Health Day', badgeColour: '#6d28d9',
      discountType: 'percent', value: 25, maxDiscountAmount: 60,
      audience: 'everyone', serviceTypes: ['therapy', 'psychiatry'], ...octoberTenth(),
    }),
  },
];

const toLocal = (d) => {
  // datetime-local wants the user's own clock, not UTC — an offer scheduled
  // for "1 Dec" must not start on 30 Nov for whoever typed it.
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
};
const next = (days) => {
  const now = new Date();
  const end = new Date(now.getTime() + days * 86400000);
  return { startsAt: toLocal(now), endsAt: toLocal(end) };
};
const december = () => {
  const y = new Date().getFullYear();
  return { startsAt: toLocal(new Date(y, 11, 1)), endsAt: toLocal(new Date(y, 11, 31, 23, 59)) };
};
const januaryWindow = () => {
  const y = new Date().getFullYear() + 1;
  return { startsAt: toLocal(new Date(y, 0, 1)), endsAt: toLocal(new Date(y, 0, 15, 23, 59)) };
};
const octoberTenth = () => {
  const y = new Date().getFullYear();
  return { startsAt: toLocal(new Date(y, 9, 5)), endsAt: toLocal(new Date(y, 9, 15, 23, 59)) };
};

const BLANK = {
  name: '', description: '', code: '',
  discountType: 'percent', value: '', maxDiscountAmount: '',
  minFinalAmount: '', minPurchaseAmount: '',
  serviceTypes: [], audience: 'everyone', newUserWindowDays: 30,
  usageLimitTotal: '', usageLimitPerUser: '',
  providerIds: [], badgeLabel: '', badgeColour: '#b3121f',
  stackable: false, priority: 0,
  ...next(30),
};

const money = (n) => `GHS ${Number(n || 0).toFixed(2)}`;

export default function AdminPricePromotions() {
  const [promotions, setPromotions] = useState([]);
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [detail, setDetail] = useState(null);
  const [form, setForm] = useState(BLANK);

  const load = async () => {
    setLoading(true); setError('');
    try {
      const [list, therapists, doctors] = await Promise.all([
        api('/api/v1/promotions'),
        api('/api/v1/admin/users?type=therapists&limit=200').catch(() => []),
        api('/api/v1/admin/users?type=doctors&limit=200').catch(() => []),
      ]);
      setPromotions(Array.isArray(list) ? list : []);
      setProviders([...(therapists || []), ...(doctors || [])]);
    } catch (e) {
      setError(e?.message || 'Could not load promotions.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const toggleIn = (key, id) => setForm((f) => ({
    ...f,
    [key]: f[key].includes(id) ? f[key].filter((x) => x !== id) : [...f[key], id],
  }));

  const applyPreset = (preset) => {
    setForm((f) => ({ ...BLANK, ...f, ...preset.apply() }));
    setCreating(true);
    setEditingId(null);
  };

  /**
   * Live preview.
   *
   * Deliberately labelled "illustration". The authoritative number comes from
   * the server at quote time; this is arithmetic in a form, and the moment it
   * is presented as the real answer somebody will trust it over the endpoint.
   */
  const preview = useMemo(() => {
    const base = 200;
    const v = Number(form.value) || 0;
    let d = 0;
    if (form.discountType === 'percent') d = (base * v) / 100;
    else if (form.discountType === 'fixed_amount') d = v;
    else if (form.discountType === 'fixed_price') d = Math.max(0, base - v);
    const cap = Number(form.maxDiscountAmount);
    if (Number.isFinite(cap) && cap > 0 && d > cap) d = cap;
    const floor = Number(form.minFinalAmount) || 0;
    let finalAmount = base - d;
    if (finalAmount < floor) { finalAmount = floor; d = base - floor; }
    return { base, discount: Math.max(0, d), finalAmount: Math.max(0, finalAmount) };
  }, [form.value, form.discountType, form.maxDiscountAmount, form.minFinalAmount]);

  const submit = async () => {
    setBusy(true); setError(''); setMessage('');
    try {
      const body = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        code: form.code.trim() || null,
        discountType: form.discountType,
        value: Number(form.value),
        maxDiscountAmount: form.maxDiscountAmount === '' ? null : Number(form.maxDiscountAmount),
        minFinalAmount: form.minFinalAmount === '' ? 0 : Number(form.minFinalAmount),
        minPurchaseAmount: form.minPurchaseAmount === '' ? 0 : Number(form.minPurchaseAmount),
        serviceTypes: form.serviceTypes,
        audience: form.audience,
        newUserWindowDays: Number(form.newUserWindowDays) || 30,
        startsAt: new Date(form.startsAt).toISOString(),
        endsAt: new Date(form.endsAt).toISOString(),
        usageLimitTotal: form.usageLimitTotal === '' ? null : Number(form.usageLimitTotal),
        usageLimitPerUser: form.usageLimitPerUser === '' ? null : Number(form.usageLimitPerUser),
        providerIds: form.providerIds,
        badgeLabel: form.badgeLabel.trim() || null,
        badgeColour: form.badgeColour || null,
        stackable: form.stackable,
        priority: Number(form.priority) || 0,
      };
      if (editingId) {
        await api(`/api/v1/promotions/${editingId}`, { method: 'PATCH', body });
        setMessage('Promotion updated.');
      } else {
        const res = await api('/api/v1/promotions', { method: 'POST', body });
        setMessage(res?.requiresConsent
          ? 'Saved as a draft. The providers you named must approve it before it can go live.'
          : 'Saved as a draft. Activate it when you are ready.');
      }
      setCreating(false); setEditingId(null); setForm(BLANK);
      await load();
    } catch (e) {
      setError(e?.message || 'Could not save.');
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (id, status) => {
    setBusy(true); setError(''); setMessage('');
    try {
      await api(`/api/v1/promotions/${id}/status`, { method: 'POST', body: { status } });
      setMessage(status === 'active' ? 'Promotion is live.'
        : status === 'paused' ? 'Promotion paused. Prices are back to normal.'
        : 'Promotion archived.');
      await load();
    } catch (e) {
      setError(e?.message || 'Could not change the status.');
    } finally {
      setBusy(false);
    }
  };

  const openDetail = async (id) => {
    try { setDetail(await api(`/api/v1/promotions/${id}`)); }
    catch (e) { setError(e?.message || 'Could not open that promotion.'); }
  };

  const beginEdit = (p) => {
    setForm({
      ...BLANK,
      name: p.name || '',
      description: p.description || '',
      code: p.code || '',
      discountType: p.discount_type || 'percent',
      value: p.value ?? '',
      maxDiscountAmount: p.max_discount_amount ?? '',
      minFinalAmount: p.min_final_amount ?? '',
      minPurchaseAmount: p.min_purchase_amount ?? '',
      serviceTypes: p.service_types ? String(p.service_types).split(',') : [],
      audience: p.audience || 'everyone',
      newUserWindowDays: p.new_user_window_days ?? 30,
      usageLimitTotal: p.usage_limit_total ?? '',
      usageLimitPerUser: p.usage_limit_per_user ?? '',
      badgeLabel: p.badge_label || '',
      badgeColour: p.badge_colour || '#b3121f',
      stackable: !!p.stackable,
      priority: p.priority ?? 0,
      startsAt: p.starts_at ? toLocal(new Date(p.starts_at)) : BLANK.startsAt,
      endsAt: p.ends_at ? toLocal(new Date(p.ends_at)) : BLANK.endsAt,
    });
    setEditingId(p.id);
    setCreating(true);
  };

  const valid = form.name.trim() && form.value !== '' && form.startsAt && form.endsAt
    && new Date(form.endsAt) > new Date(form.startsAt)
    && (form.discountType !== 'percent'
        || (Number(form.maxDiscountAmount) > 0 && Number(form.value) <= 70));

  if (loading) return <div style={S.loading}>Loading promotions…</div>;

  return (
    <div style={S.page}>
      <div style={S.header}>
        <div>
          <h1 style={S.h1}>Price promotions</h1>
          <p style={S.lead}>
            Offers that change what people actually pay. Every booking screen on web
            and mobile reads these, and a promotion stops applying the moment it ends —
            no one has to switch it off.
          </p>
        </div>
        {!creating ? (
          <button style={S.primary} onClick={() => { setForm(BLANK); setEditingId(null); setCreating(true); }}>
            New promotion
          </button>
        ) : null}
      </div>

      {error ? <div style={S.error}>{error}</div> : null}
      {message ? <div style={S.ok}>{message}</div> : null}

      {!creating ? (
        <div style={S.presetRow}>
          <span style={S.presetLabel}>Quick start:</span>
          {PRESETS.map((p) => (
            <button key={p.key} style={S.preset} onClick={() => applyPreset(p)}>
              <span aria-hidden="true">{p.emoji}</span> {p.label}
            </button>
          ))}
        </div>
      ) : null}

      {creating ? (
        <div style={S.card}>
          <h2 style={S.h2}>{editingId ? 'Edit promotion' : 'New promotion'}</h2>

          <div style={S.grid2}>
            <Field label="Name" hint="Shown to patients on the price row">
              <input style={S.input} value={form.name} onChange={(e) => set('name', e.target.value)}
                placeholder="Christmas Offer" />
            </Field>
            <Field label="Badge text" hint="On the little coloured tag. Defaults to the % off.">
              <input style={S.input} value={form.badgeLabel} onChange={(e) => set('badgeLabel', e.target.value)}
                placeholder="Christmas" />
            </Field>
          </div>

          <Field label="Description">
            <input style={S.input} value={form.description} onChange={(e) => set('description', e.target.value)}
              placeholder="Festive season offer on all therapy sessions" />
          </Field>

          <div style={S.grid3}>
            <Field label="Discount type">
              <select style={S.input} value={form.discountType}
                onChange={(e) => set('discountType', e.target.value)}>
                {DISCOUNT_TYPES.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
              </select>
              <span style={S.hint}>{DISCOUNT_TYPES.find((d) => d.key === form.discountType)?.hint}</span>
            </Field>
            <Field label={form.discountType === 'percent' ? 'Percentage (max 70)' : 'Amount (GHS)'}>
              <input style={S.input} type="number" min="0" value={form.value}
                onChange={(e) => set('value', e.target.value)} />
            </Field>
            <Field
              label={`Max discount (GHS)${form.discountType === 'percent' ? ' — required' : ''}`}
              hint="The ceiling on any one booking."
            >
              <input
                style={{
                  ...S.input,
                  ...(form.discountType === 'percent' && !(Number(form.maxDiscountAmount) > 0)
                    ? S.inputWarn : null),
                }}
                type="number" min="0" value={form.maxDiscountAmount}
                onChange={(e) => set('maxDiscountAmount', e.target.value)}
                placeholder={form.discountType === 'percent' ? 'Required' : 'Optional'} />
            </Field>
          </div>

          <div style={S.grid3}>
            <Field label="Never sell below (GHS)" hint="A hard floor after the discount.">
              <input style={S.input} type="number" min="0" value={form.minFinalAmount}
                onChange={(e) => set('minFinalAmount', e.target.value)} placeholder="0" />
            </Field>
            <Field label="Minimum fee to qualify (GHS)">
              <input style={S.input} type="number" min="0" value={form.minPurchaseAmount}
                onChange={(e) => set('minPurchaseAmount', e.target.value)} placeholder="0" />
            </Field>
            <Field label="Promo code" hint="Leave blank for a public offer.">
              <input style={S.input} value={form.code} onChange={(e) => set('code', e.target.value)}
                placeholder="XMAS25" />
            </Field>
          </div>

          <Field label="Applies to" hint="Leave all unticked to cover every service.">
            <div style={S.chips}>
              {SERVICES.map((s) => (
                <button key={s.key} type="button"
                  style={form.serviceTypes.includes(s.key) ? S.chipOn : S.chip}
                  onClick={() => toggleIn('serviceTypes', s.key)}>
                  {s.label}
                </button>
              ))}
            </div>
          </Field>

          <div style={S.grid2}>
            <Field label="Who gets it">
              <select style={S.input} value={form.audience} onChange={(e) => set('audience', e.target.value)}>
                {AUDIENCES.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
              </select>
            </Field>
            {form.audience === 'new_clients' || form.audience === 'new_patients' ? (
              <Field label="Counts as 'new' for (days)"
                     hint="Measured from the day they registered.">
                <input style={S.input} type="number" min="1" value={form.newUserWindowDays}
                  onChange={(e) => set('newUserWindowDays', e.target.value)} />
              </Field>
            ) : <div />}
          </div>

          <div style={S.grid2}>
            <Field label="Starts">
              <input style={S.input} type="datetime-local" value={form.startsAt}
                onChange={(e) => set('startsAt', e.target.value)} />
            </Field>
            <Field label="Ends" hint="Required. Prices revert automatically at this moment.">
              <input style={S.input} type="datetime-local" value={form.endsAt}
                onChange={(e) => set('endsAt', e.target.value)} />
            </Field>
          </div>

          <div style={S.grid3}>
            <Field label="Total redemptions" hint="Blank for unlimited.">
              <input style={S.input} type="number" min="1" value={form.usageLimitTotal}
                onChange={(e) => set('usageLimitTotal', e.target.value)} placeholder="Unlimited" />
            </Field>
            <Field label="Per person" hint="Blank for unlimited.">
              <input style={S.input} type="number" min="1" value={form.usageLimitPerUser}
                onChange={(e) => set('usageLimitPerUser', e.target.value)} placeholder="Unlimited" />
            </Field>
            <Field label="Badge colour">
              <input style={{ ...S.input, height: 40, padding: 4 }} type="color" value={form.badgeColour}
                onChange={(e) => set('badgeColour', e.target.value)} />
            </Field>
          </div>

          {!editingId ? (
            <Field
              label="Name specific providers"
              hint="Leave empty to discount every provider. Naming anyone means the promotion cannot go live until they approve it — it changes what they are paid."
            >
              <div style={S.providerBox}>
                {providers.length === 0 ? <span style={S.hint}>No providers loaded.</span> : null}
                <Paged items={providers}>{(providers) => providers.map((p) => (
                  <label key={p.id} style={S.providerRow}>
                    <input type="checkbox" checked={form.providerIds.includes(p.id)}
                      onChange={() => toggleIn('providerIds', p.id)} />
                    <span>{p.name || p.email}</span>
                    <span style={S.roleTag}>{p.role}</span>
                  </label>
                ))}</Paged>
              </div>
            </Field>
          ) : null}

          <div style={S.preview}>
            <span style={S.previewLabel}>Illustration on a {money(preview.base)} fee</span>
            <span style={S.previewWas}>{money(preview.base)}</span>
            <span style={S.previewNow}>{money(preview.finalAmount)}</span>
            <span style={{ ...S.previewBadge, background: form.badgeColour || '#b3121f' }}>
              {form.badgeLabel || (form.discountType === 'percent' ? `-${form.value || 0}%` : 'Offer')}
            </span>
            <span style={S.previewNote}>
              The real figure always comes from the server at booking time.
            </span>
          </div>

          {form.discountType === 'percent' && !(Number(form.maxDiscountAmount) > 0) ? (
            <div style={S.warn}>
              A percentage promotion needs a maximum discount. Without one, the same
              20% takes GHS 20 off a GHS 100 fee and GHS 200 off a GHS 1,000 one.
            </div>
          ) : null}
          {form.discountType === 'percent' && Number(form.value) > 70 ? (
            <div style={S.warn}>The most a percentage promotion may take off is 70%.</div>
          ) : null}

          <div style={S.actions}>
            <button style={valid && !busy ? S.primary : S.primaryOff}
              disabled={!valid || busy} onClick={submit}>
              {busy ? 'Saving…' : editingId ? 'Save changes' : 'Save as draft'}
            </button>
            <button style={S.ghost}
              onClick={() => { setCreating(false); setEditingId(null); setForm(BLANK); }}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <div style={S.card}>
        <h2 style={S.h2}>All promotions</h2>
        {promotions.length === 0 ? (
          <p style={S.empty}>Nothing yet. Create one, or start from a template above.</p>
        ) : (
          <div style={S.table}>
            <Paged items={promotions}>{(promotions) => promotions.map((p) => {
              const expired = p.expired;
              const live = p.live;
              const waiting = p.requires_consent && Number(p.approved_count) === 0;
              return (
                <div key={p.id} style={S.row}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={S.rowTop}>
                      <span style={S.rowName}>{p.name}</span>
                      {p.badge_label ? (
                        <span style={{ ...S.tinyBadge, background: p.badge_colour || '#b3121f' }}>
                          {p.badge_label}
                        </span>
                      ) : null}
                      <span style={live ? S.pillLive : expired ? S.pillExpired : S.pillDraft}>
                        {live ? 'Live' : expired ? 'Ended' : p.status}
                      </span>
                      {waiting ? <span style={S.pillWait}>Awaiting provider consent</span> : null}
                    </div>
                    <div style={S.rowMeta}>
                      {p.discount_type === 'percent' ? `${Number(p.value)}% off`
                        : p.discount_type === 'fixed_amount' ? `${money(p.value)} off`
                        : `Flat ${money(p.value)}`}
                      {p.max_discount_amount ? ` · max ${money(p.max_discount_amount)}` : ''}
                      {' · '}{p.service_types || 'all services'}
                      {' · '}{(AUDIENCES.find((a) => a.key === p.audience) || {}).label || p.audience}
                    </div>
                    <div style={S.rowMeta}>
                      {new Date(p.starts_at).toLocaleDateString()} → {new Date(p.ends_at).toLocaleDateString()}
                      {' · used '}{p.times_used || 0}{p.usage_limit_total ? ` of ${p.usage_limit_total}` : ''}
                      {' · given away '}{money(p.total_given)}
                      {p.requires_consent ? ` · ${p.approved_count}/${p.provider_count} providers approved` : ''}
                    </div>
                  </div>
                  <div style={S.rowActions}>
                    <button style={S.small} onClick={() => openDetail(p.id)}>Details</button>
                    {!expired ? <button style={S.small} onClick={() => beginEdit(p)}>Edit</button> : null}
                    {live ? (
                      <button style={S.smallWarn} onClick={() => setStatus(p.id, 'paused')} disabled={busy}>
                        Pause
                      </button>
                    ) : !expired && p.status !== 'archived' ? (
                      <button style={S.smallGo} onClick={() => setStatus(p.id, 'active')} disabled={busy}>
                        Activate
                      </button>
                    ) : null}
                    {p.status !== 'archived' ? (
                      <button style={S.small} onClick={() => setStatus(p.id, 'archived')} disabled={busy}>
                        Archive
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}</Paged>
          </div>
        )}
      </div>

      {detail ? (
        <div style={S.overlay} onClick={() => setDetail(null)}>
          <div style={S.modal} onClick={(e) => e.stopPropagation()}>
            <h2 style={S.h2}>{detail.name}</h2>
            <p style={S.lead}>{detail.description}</p>

            <h3 style={S.h3}>Providers</h3>
            {(detail.providers || []).length === 0 ? (
              <p style={S.empty}>Applies to every provider — nobody was named.</p>
            ) : (
              (detail.providers || []).map((v) => (
                <div key={v.id} style={S.detailRow}>
                  <span>{v.provider_name || v.provider_email}</span>
                  <span style={v.status === 'approved' ? S.pillLive
                    : v.status === 'declined' ? S.pillExpired : S.pillWait}>
                    {v.status}
                  </span>
                </div>
              ))
            )}

            <h3 style={S.h3}>Recent redemptions</h3>
            {(detail.redemptions || []).length === 0 ? (
              <p style={S.empty}>Nobody has used this yet.</p>
            ) : (
              (detail.redemptions || []).slice(0, 15).map((r) => (
                <div key={r.id} style={S.detailRow}>
                  <span>{r.user_name || 'A user'}</span>
                  <span style={S.hint}>
                    {money(r.base_amount)} → {money(r.final_amount)}
                    {' · '}{new Date(r.created_at).toLocaleDateString()}
                  </span>
                </div>
              ))
            )}

            <button style={S.ghost} onClick={() => setDetail(null)}>Close</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <label style={S.field}>
      <span style={S.label}>{label}</span>
      {children}
      {hint ? <span style={S.hint}>{hint}</span> : null}
    </label>
  );
}

/* Colours are literals and measured against their own background — this screen
   renders inside the admin shell, which does not define the zencare tokens. */
const S = {
  page: { padding: '1.75rem 2rem 2.5rem' },
  loading: { padding: '2rem', color: '#545a6b' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', marginBottom: '1.25rem' },
  h1: { margin: 0, fontSize: '1.4rem', fontWeight: 800, color: '#0f1424' },
  h2: { margin: '0 0 1rem', fontSize: '1.05rem', fontWeight: 800, color: '#0f1424' },
  h3: { margin: '1.2rem 0 0.5rem', fontSize: '0.85rem', fontWeight: 800, color: '#0f1424', textTransform: 'uppercase', letterSpacing: '0.05em' },
  lead: { margin: '0.3rem 0 0', fontSize: '0.86rem', lineHeight: 1.55, color: '#545a6b', maxWidth: 640 },
  card: { background: '#fff', border: '1px solid #e4e7ee', borderRadius: 16, padding: '1.25rem', marginBottom: '1.25rem' },

  presetRow: { display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.25rem' },
  presetLabel: { fontSize: '0.8rem', fontWeight: 700, color: '#545a6b' },
  preset: { padding: '0.45rem 0.8rem', borderRadius: 999, border: '1.5px solid #d8dce6', background: '#fff', color: '#2b3142', fontSize: '0.82rem', fontWeight: 650, cursor: 'pointer' },

  grid2: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.9rem' },
  grid3: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '0.9rem' },
  field: { display: 'flex', flexDirection: 'column', gap: '0.3rem', marginBottom: '0.9rem' },
  label: { fontSize: '0.78rem', fontWeight: 700, color: '#2b3142' },
  hint: { fontSize: '0.72rem', lineHeight: 1.45, color: '#6b7283' },
  input: { padding: '0.6rem 0.7rem', borderRadius: 10, border: '1.5px solid #d8dce6', fontSize: '0.88rem', fontFamily: 'inherit', color: '#0f1424', background: '#fff', boxSizing: 'border-box', width: '100%' },
  inputWarn: { borderColor: '#d97706', background: '#fffbeb' },

  chips: { display: 'flex', gap: '0.45rem', flexWrap: 'wrap' },
  chip: { padding: '0.4rem 0.75rem', borderRadius: 999, border: '1.5px solid #d8dce6', background: '#fff', color: '#4a5163', fontSize: '0.8rem', fontWeight: 650, cursor: 'pointer' },
  chipOn: { padding: '0.4rem 0.75rem', borderRadius: 999, border: '1.5px solid #2f5e40', background: '#eff4ff', color: '#1a3ea8', fontSize: '0.8rem', fontWeight: 750, cursor: 'pointer' },

  providerBox: { maxHeight: 190, overflowY: 'auto', border: '1.5px solid #d8dce6', borderRadius: 10, padding: '0.5rem' },
  providerRow: { display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.3rem 0.2rem', fontSize: '0.84rem', color: '#2b3142', cursor: 'pointer' },
  roleTag: { marginLeft: 'auto', fontSize: '0.68rem', fontWeight: 700, color: '#6b7283' },

  preview: { display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', padding: '0.85rem 1rem', borderRadius: 12, background: '#f7f9fc', border: '1px solid #e4e7ee', marginBottom: '0.9rem' },
  previewLabel: { fontSize: '0.75rem', fontWeight: 700, color: '#545a6b' },
  previewWas: { fontSize: '0.85rem', color: '#8a90a0', textDecoration: 'line-through' },
  previewNow: { fontSize: '1.1rem', fontWeight: 800, color: '#0f1424' },
  previewBadge: { padding: '0.15rem 0.45rem', borderRadius: 6, fontSize: '0.68rem', fontWeight: 800, color: '#fff' },
  previewNote: { width: '100%', fontSize: '0.7rem', color: '#6b7283' },

  warn: { padding: '0.7rem 0.85rem', borderRadius: 10, background: '#fffbeb', border: '1px solid #fde68a', color: '#8a4b09', fontSize: '0.8rem', lineHeight: 1.5, marginBottom: '0.8rem' },
  error: { padding: '0.75rem 0.9rem', borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', fontSize: '0.85rem', marginBottom: '1rem' },
  ok: { padding: '0.75rem 0.9rem', borderRadius: 10, background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', fontSize: '0.85rem', marginBottom: '1rem' },
  empty: { fontSize: '0.85rem', color: '#6b7283', margin: 0 },

  actions: { display: 'flex', gap: '0.6rem', marginTop: '0.4rem' },
  primary: { padding: '0.65rem 1.2rem', borderRadius: 10, border: 'none', background: '#2f5e40', color: '#fff', fontSize: '0.88rem', fontWeight: 700, cursor: 'pointer' },
  primaryOff: { padding: '0.65rem 1.2rem', borderRadius: 10, border: 'none', background: '#2f5e40', color: '#fff', fontSize: '0.88rem', fontWeight: 700, opacity: 0.4, cursor: 'not-allowed' },
  ghost: { padding: '0.65rem 1.2rem', borderRadius: 10, border: '1.5px solid #d8dce6', background: '#fff', color: '#2b3142', fontSize: '0.88rem', fontWeight: 700, cursor: 'pointer' },

  table: { display: 'flex', flexDirection: 'column', gap: '0.6rem' },
  row: { display: 'flex', alignItems: 'flex-start', gap: '1rem', padding: '0.9rem', borderRadius: 12, border: '1px solid #e4e7ee', flexWrap: 'wrap' },
  rowTop: { display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap', marginBottom: '0.3rem' },
  rowName: { fontSize: '0.95rem', fontWeight: 750, color: '#0f1424' },
  rowMeta: { fontSize: '0.76rem', color: '#6b7283', lineHeight: 1.55 },
  rowActions: { display: 'flex', gap: '0.4rem', flexWrap: 'wrap' },
  small: { padding: '0.35rem 0.7rem', borderRadius: 8, border: '1.5px solid #d8dce6', background: '#fff', color: '#2b3142', fontSize: '0.78rem', fontWeight: 650, cursor: 'pointer' },
  smallGo: { padding: '0.35rem 0.7rem', borderRadius: 8, border: 'none', background: '#166534', color: '#fff', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' },
  smallWarn: { padding: '0.35rem 0.7rem', borderRadius: 8, border: 'none', background: '#8a4b09', color: '#fff', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' },

  tinyBadge: { padding: '0.1rem 0.4rem', borderRadius: 5, fontSize: '0.64rem', fontWeight: 800, color: '#fff' },
  pillLive: { padding: '0.12rem 0.5rem', borderRadius: 999, background: '#dcfce7', color: '#14532d', fontSize: '0.68rem', fontWeight: 800 },
  pillExpired: { padding: '0.12rem 0.5rem', borderRadius: 999, background: '#f1f3f8', color: '#454b5c', fontSize: '0.68rem', fontWeight: 800 },
  pillDraft: { padding: '0.12rem 0.5rem', borderRadius: 999, background: '#e8f1fb', color: '#12507f', fontSize: '0.68rem', fontWeight: 800 },
  pillWait: { padding: '0.12rem 0.5rem', borderRadius: 999, background: '#fffbeb', color: '#8a4b09', fontSize: '0.68rem', fontWeight: 800 },

  overlay: { position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(16,22,48,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.25rem' },
  modal: { background: '#fff', borderRadius: 18, padding: '1.5rem', width: '100%', maxWidth: 560, maxHeight: '85vh', overflowY: 'auto' },
  detailRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', padding: '0.45rem 0', borderBottom: '1px solid #f1f3f8', fontSize: '0.84rem', color: '#2b3142' },
};
