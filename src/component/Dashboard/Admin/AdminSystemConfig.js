import React, { useState, useEffect } from 'react';
import { db } from '../../Auth/firebaseConfig';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { SUPPORTED_COUNTRIES, getFlags } from '../../../utils/featureFlags';

const FEATURE_META = {
  pharmacyOnboarding:  { label: 'Pharmacy Onboarding', desc: 'Allow pharmacies to be onboarded in this country' },
  prescriptionRouting: { label: 'Prescription Routing', desc: 'Route prescriptions to pharmacies automatically' },
  pharmacyFulfillment: { label: 'Pharmacy Fulfillment', desc: 'Enable full pharmacy fulfillment workflow' },
};

export default function AdminSystemConfig() {
  const [overrides, setOverrides] = useState({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeCountry, setActiveCountry] = useState('GH');

  useEffect(() => { loadOverrides(); }, []);

  const loadOverrides = async () => {
    try {
      const snap = await getDoc(doc(db, 'systemConfig', 'featureFlags'));
      if (snap.exists()) setOverrides(snap.data().overrides || {});
    } catch (e) {
      console.error('SystemConfig load error:', e);
    }
  };

  const getEffectiveFlag = (country, feature) => {
    const override = overrides?.[country]?.[feature];
    if (override !== undefined) return override;
    return getFlags(country)[feature] || false;
  };

  const toggleFlag = (country, feature, val) => {
    setOverrides(prev => ({
      ...prev,
      [country]: { ...(prev[country] || {}), [feature]: val },
    }));
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'systemConfig', 'featureFlags'), {
        overrides,
        updatedAt: serverTimestamp(),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      alert('Failed to save configuration. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <h1 className="admin-page-title">System Configuration</h1>
        <p className="admin-page-sub">Control feature availability per country. Changes take effect immediately.</p>
      </div>

      {/* Country selector */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {SUPPORTED_COUNTRIES.map(c => (
          <button key={c.code}
            className={`btn ${activeCountry === c.code ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setActiveCountry(c.code)}>
            {c.label} ({c.code})
          </button>
        ))}
      </div>

      <div className="admin-table-card" style={{ padding: '1.25rem', maxWidth: 600, marginBottom: '1.5rem' }}>
        <h3 style={{ margin: '0 0 1rem', fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>
          Feature Flags — {SUPPORTED_COUNTRIES.find(c => c.code === activeCountry)?.label}
        </h3>

        {Object.entries(FEATURE_META).map(([key, meta]) => {
          const isOn = getEffectiveFlag(activeCountry, key);
          return (
            <div key={key} className="toggle-row">
              <div className="toggle-info">
                <span className="toggle-label">{meta.label}</span>
                <span className="toggle-desc">{meta.desc}</span>
              </div>
              <label className="toggle-switch">
                <input type="checkbox" checked={isOn} onChange={e => toggleFlag(activeCountry, key, e.target.checked)} />
                <span className="toggle-slider" />
              </label>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : '💾 Save Configuration'}
        </button>
        {saved && <span style={{ color: '#16a34a', fontSize: '0.875rem', fontWeight: 600 }}>✓ Saved successfully</span>}
      </div>

      {/* Reference table */}
      <div className="admin-table-card" style={{ marginTop: '2rem' }}>
        <div className="admin-table-header">
          <p className="admin-table-title">All Country Flags (Reference)</p>
        </div>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Country</th>
              {Object.values(FEATURE_META).map(m => <th key={m.label}>{m.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {SUPPORTED_COUNTRIES.map(c => (
              <tr key={c.code}>
                <td style={{ fontWeight: 600 }}>{c.label} ({c.code})</td>
                {Object.keys(FEATURE_META).map(key => (
                  <td key={key}>
                    <span className={`badge ${getEffectiveFlag(c.code, key) ? 'badge-green' : 'badge-red'}`}>
                      {getEffectiveFlag(c.code, key) ? 'Enabled' : 'Disabled'}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
