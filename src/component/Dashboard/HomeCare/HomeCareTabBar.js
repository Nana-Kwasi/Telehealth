import React from 'react';

export default function HomeCareTabBar({ tabs, active, onChange }) {
  return (
    <div className="hcn-tab-bar" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={active === t.id}
          className={`hcn-tab ${active === t.id ? 'active' : ''} ${t.urgent ? 'urgent' : ''}`}
          onClick={() => onChange(t.id)}
        >
          {t.label}
          {t.count > 0 ? <span className="hcn-tab-badge">{t.count > 99 ? '99+' : t.count}</span> : null}
        </button>
      ))}
    </div>
  );
}
