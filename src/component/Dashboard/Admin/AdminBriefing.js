import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles, RefreshCw, TrendingUp, HeartPulse, ClipboardList, ShieldCheck, MessageSquare, ArrowRight,
  CheckCircle2, Eye, AlertTriangle,
} from 'lucide-react';
import { api } from '../../../services/apiClient';

/**
 * AI briefing for the super admin: a headline, then one card per area
 * (growth, care, operations, security, engagement) rated good / watch / act,
 * and suggested next steps that open the right screen.
 *
 * The server answers at once — with the last briefing, or plain-number
 * summaries while the AI one is written in the background — so this shows
 * something immediately and swaps in the AI version when it lands.
 */
const AREA_ICONS = {
  growth: TrendingUp, care: HeartPulse, operations: ClipboardList, security: ShieldCheck, engagement: MessageSquare,
};
const TONES = {
  good:  { label: 'Healthy', Icon: CheckCircle2 },
  watch: { label: 'Keep an eye', Icon: Eye },
  act:   { label: 'Needs you', Icon: AlertTriangle },
};

function ago(iso) {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (!Number.isFinite(m)) return '';
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  return `${Math.round(m / 60)} h ago`;
}

export default function AdminBriefing({ days = 30 }) {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const polls = useRef(0);
  const [tab, setTab] = useState(0);
  const timer = useRef(null);

  const load = useCallback(async (refresh = false) => {
    clearTimeout(timer.current);
    setError('');
    try {
      const d = await api(`/api/v1/admin/insights?days=${days}${refresh ? '&refresh=true' : ''}`);
      setData(d);
      // While the AI briefing is being written, check back a few times.
      if (d?.pending && polls.current < 12) {
        polls.current += 1;
        timer.current = setTimeout(() => load(false), 10000);
      }
    } catch (e) {
      setError(e?.message || 'The briefing could not be loaded.');
    }
  }, [days]);

  useEffect(() => {
    polls.current = 0;
    load(false);
    return () => clearTimeout(timer.current);
  }, [load]);

  const sections = Array.isArray(data?.sections) ? data.sections : [];
  const actions = Array.isArray(data?.actions) ? data.actions.filter((a) => a?.label) : [];
  const ai = data?.source === 'ai';

  return (
    <section className="br">
      <header className="br-head">
        <span className="br-mark"><Sparkles size={18} /></span>
        <div className="br-title">
          <h2>AI briefing</h2>
          <p>
            {ai ? 'Written by NessaHub AI from live platform figures' : 'Quick summary from live figures'}
            {data?.generatedAt ? ` · ${ago(data.generatedAt)}` : ''}
            {data?.pending ? ' · writing a fresh AI briefing…' : ''}
          </p>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => { polls.current = 0; load(true); }}
          disabled={data?.pending}>
          <RefreshCw size={14} className={data?.pending ? 'ov-spin' : ''} /> {data?.pending ? 'Writing…' : 'Refresh'}
        </button>
      </header>

      {error ? <div className="admin-alert admin-alert-danger">{error}</div> : null}

      {!data && !error ? (
        <div className="br-skel" />
      ) : null}

      {data ? (
        <>
          {data.headline ? <p className="br-headline">{data.headline}</p> : null}
          {sections.length ? (() => {
            const cur = sections[Math.min(tab, sections.length - 1)] || {};
            const tone = TONES[cur.tone] || TONES.watch;
            const CurIcon = AREA_ICONS[cur.key] || Sparkles;
            return (
              <div className="br-panel">
                <div className="br-tabs" role="tablist" aria-label="Briefing areas">
                  {sections.map((sec, i) => {
                    const Icon = AREA_ICONS[sec.key] || Sparkles;
                    return (
                      <button key={`${sec.key}-${i}`} type="button" role="tab" aria-selected={i === tab}
                        className={`br-tab tone-${sec.tone || 'watch'} ${i === tab ? 'on' : ''}`} onClick={() => setTab(i)}>
                        <Icon size={15} />
                        <span>{sec.title}</span>
                        <i className="br-dot" aria-label={(TONES[sec.tone] || TONES.watch).label} />
                      </button>
                    );
                  })}
                </div>
                <div className={`br-body tone-${cur.tone || 'watch'}`} role="tabpanel">
                  <div className="br-body-head">
                    <span className="br-body-icon"><CurIcon size={20} /></span>
                    <div>
                      <h3>{cur.title}</h3>
                      <span className="br-tone"><tone.Icon size={12} /> {tone.label}</span>
                    </div>
                  </div>
                  {Array.isArray(cur.metrics) && cur.metrics.length ? (
                    <div className="br-metrics">
                      {cur.metrics.slice(0, 4).map((m, j) => {
                        const ch = String(m.change || '');
                        const dir = ch.startsWith('+') ? 'up' : ch.startsWith('-') ? 'down' : 'flat';
                        return (
                          <div key={j} className="br-metric">
                            <span className="br-metric-label">{m.label}</span>
                            <strong>{m.value}</strong>
                            {ch ? <span className={`br-metric-change ${dir}`}>{ch}</span> : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                  <p className="br-summary">{cur.summary}</p>
                  {Array.isArray(cur.points) && cur.points.length ? (
                    <ul className="br-points">
                      {cur.points.slice(0, 6).map((pt, j) => <li key={j}>{pt}</li>)}
                    </ul>
                  ) : null}
                  {cur.recommendation ? (
                    <div className="br-reco">
                      <ArrowRight size={16} />
                      <div><span>Recommended</span><p>{cur.recommendation}</p></div>
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })() : null}
          {actions.length ? (
            <div className="br-actions">
              <span>Suggested next steps</span>
              {actions.slice(0, 4).map((a, i) => (
                <button key={i} type="button" onClick={() => navigate(String(a.path || '/dashboard').startsWith('/dashboard') ? a.path : '/dashboard')}>
                  {a.label} <ArrowRight size={14} />
                </button>
              ))}
            </div>
          ) : null}
          <p className="br-foot">AI summaries can be wrong — check the figures on this page before acting.</p>
        </>
      ) : null}
    </section>
  );
}
