import React, { useEffect, useMemo, useState } from 'react';

/**
 * Shows a long list 15 at a time, with a pager underneath.
 *
 *   <Paged items={rows}>{(rows) => rows.map(r => <Row key={r.id} … />)}</Paged>
 *
 * Inside a <tbody>, pass `table` so the pager is a full-width row. Lists of 15
 * or fewer render exactly as before (no pager). When the list changes (a
 * filter, a search) the page is kept in range, and goes back to the first page
 * when the list shrinks below it.
 */
export const PAGE_SIZE = 15;

export default function Paged({ items, pageSize = PAGE_SIZE, table = false, colSpan = 100, children }) {
  const list = useMemo(() => (Array.isArray(items) ? items : []), [items]);
  const pages = Math.max(1, Math.ceil(list.length / pageSize));
  const [page, setPage] = useState(1);
  useEffect(() => { if (page > pages) setPage(1); }, [pages, page]);
  const current = Math.min(page, pages);
  const slice = list.length > pageSize ? list.slice((current - 1) * pageSize, current * pageSize) : list;
  const body = typeof children === 'function' ? children(slice) : null;
  if (list.length <= pageSize) return <>{body}</>;
  const pager = <Pager page={current} pages={pages} total={list.length} pageSize={pageSize} onPage={setPage} />;
  if (table) {
    return (
      <>
        {body}
        <tr className="paged-row"><td colSpan={colSpan} style={{ padding: 0, border: 'none', background: 'transparent' }}>{pager}</td></tr>
      </>
    );
  }
  return <>{body}{pager}</>;
}

/** 1 … 4 5 [6] 7 8 … 20 */
function numbers(page, pages) {
  const out = [];
  const add = (n) => { if (!out.includes(n)) out.push(n); };
  add(1);
  for (let n = Math.max(2, page - 1); n <= Math.min(pages - 1, page + 1); n += 1) add(n);
  add(pages);
  const withGaps = [];
  out.sort((a, b) => a - b).forEach((n, i) => { if (i && n - out[i - 1] > 1) withGaps.push('…' + n); withGaps.push(n); });
  return withGaps;
}

export function Pager({ page, pages, total, pageSize = PAGE_SIZE, onPage }) {
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const go = (n) => onPage(Math.max(1, Math.min(pages, n)));
  return (
    <nav aria-label="Pages" style={S.bar}>
      <span style={S.count}>{from}–{to} of {total}</span>
      <div style={S.btns}>
        <button type="button" style={S.btn} disabled={page === 1} onClick={() => go(page - 1)} aria-label="Previous page">‹ Prev</button>
        {numbers(page, pages).map((n) => (typeof n === 'string'
          ? <span key={n} style={S.gap}>…</span>
          : <button key={n} type="button" onClick={() => go(n)} aria-current={n === page ? 'page' : undefined}
              style={{ ...S.btn, ...(n === page ? S.on : null) }}>{n}</button>))}
        <button type="button" style={S.btn} disabled={page === pages} onClick={() => go(page + 1)} aria-label="Next page">Next ›</button>
      </div>
    </nav>
  );
}

const S = {
  bar: { gridColumn: '1 / -1', flexBasis: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', padding: '0.7rem 0.25rem 0.2rem', width: '100%', boxSizing: 'border-box' },
  count: { fontSize: '0.78rem', color: '#64748b', fontWeight: 600 },
  btns: { display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  btn: { minWidth: 34, height: 32, padding: '0 0.6rem', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#0f172a', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' },
  on: { background: '#0f172a', color: '#fff', borderColor: '#0f172a' },
  gap: { padding: '0 0.25rem', color: '#94a3b8' },
};
