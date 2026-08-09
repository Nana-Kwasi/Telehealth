import React, { useEffect, useState } from 'react';
import { useHomeCareNurse } from './HomeCareNurseContext';
import {
  updateNurseProfile, fetchNurseProfile, getCurrentLocationMobile, updateNurseLocation,
} from '../../../services/homeCareService';
import { parseCoords } from '../../../utils/homeCareGeo';
import { isNurseProfileComplete } from '../../../utils/homeCareProfileComplete';
import NursePhotoPicker from './NursePhotoPicker';
import './HomeCareNurseDashboard.css';

// Languages may arrive as an array, a JSON string ('["English"]'), a plain
// comma-separated string, or null. Always render a comma-separated display
// string — calling .join() on a non-array (e.g. a string) throws.
function toLangDisplay(value) {
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'string' && value.trim()) {
    const t = value.trim();
    if (t.startsWith('[')) {
      try { const a = JSON.parse(t); if (Array.isArray(a)) return a.join(', '); } catch { /* fall through */ }
    }
    return t;
  }
  return 'English';
}

export default function HomeCareNurseManageProfile({ embedded = false }) {
  const { profile, nurse, setNurse } = useHomeCareNurse();
  const [bio, setBio] = useState(nurse?.bio || '');
  const [specialty, setSpecialty] = useState(nurse?.specialty || '');
  const [languages, setLanguages] = useState(toLangDisplay(nurse?.languages));
  const [yearsExperience, setYearsExperience] = useState(String(nurse?.yearsExperience ?? ''));
  const [phone, setPhone] = useState(nurse?.phone || '');
  const [licenseNumber, setLicenseNumber] = useState(nurse?.licenseNumber || '');
  const [feesDaily, setFeesDaily] = useState(String(nurse?.fees?.daily ?? ''));
  const [feesWeekly, setFeesWeekly] = useState(String(nurse?.fees?.weekly ?? ''));
  const [feesMonthly, setFeesMonthly] = useState(String(nurse?.fees?.monthly ?? ''));
  const [feesYearly, setFeesYearly] = useState(String(nurse?.fees?.yearly ?? ''));
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');
  const [locMsg, setLocMsg] = useState('');
  const hasLocation = parseCoords(nurse);

  useEffect(() => {
    if (!nurse) return;
    setBio(nurse.bio || '');
    setSpecialty(nurse.specialty || '');
    setLanguages(toLangDisplay(nurse.languages));
    setYearsExperience(String(nurse.yearsExperience ?? ''));
    setPhone(nurse.phone || '');
    setLicenseNumber(nurse.licenseNumber || '');
    setFeesDaily(String(nurse.fees?.daily ?? ''));
    setFeesWeekly(String(nurse.fees?.weekly ?? ''));
    setFeesMonthly(String(nurse.fees?.monthly ?? ''));
    setFeesYearly(String(nurse.fees?.yearly ?? ''));
  }, [nurse?.id, nurse?.bio, nurse?.specialty, nurse?.languages, nurse?.yearsExperience, nurse?.phone, nurse?.licenseNumber, nurse?.fees]);

  const save = async (ev) => {
    ev.preventDefault();
    setSaving(true);
    setSavedMsg('');
    try {
      const patch = {
        bio: bio.trim(),
        specialty: specialty.trim(),
        languages: languages.split(',').map((s) => s.trim()).filter(Boolean),
        yearsExperience: Number(yearsExperience) || 0,
        phone: phone.trim(),
        licenseNumber: licenseNumber.trim(),
        fees: {
          daily: Number(feesDaily) || 0,
          weekly: Number(feesWeekly) || 0,
          monthly: Number(feesMonthly) || 0,
          yearly: Number(feesYearly) || 0,
        },
      };
      const merged = { ...nurse, ...patch };
      patch.profileComplete = isNurseProfileComplete(merged);
      await updateNurseProfile(profile.id, patch);
      const fresh = await fetchNurseProfile(profile.id);
      if (fresh) setNurse(fresh);
      setSavedMsg(patch.profileComplete ? 'Profile complete.' : 'Saved — finish missing fields (including service location in the sidebar).');
    } finally {
      setSaving(false);
    }
  };

  const body = (
    <>
      <div className="hcn-card hcn-profile-photo-card">
        <NursePhotoPicker nurse={nurse} size={88} />
        <p className="hcn-card-meta" style={{ margin: '0.75rem 0 0' }}>Tap your photo to upload or replace it</p>
        <p className="hcn-card-meta" style={{ color: hasLocation ? '#047857' : '#b45309' }}>
          {hasLocation
            ? 'Service location saved on your nurse profile (sidebar location or dashboard GPS).'
            : 'No service location yet — use the sidebar location control or open Dashboard.'}
        </p>
        <button
          type="button"
          className="hcn-btn hcn-btn-outline"
          style={{ marginTop: '0.5rem' }}
          onClick={async () => {
            setLocMsg('');
            const loc = await getCurrentLocationMobile();
            if (!loc) {
              setLocMsg('Could not detect location. Use the sidebar location form.');
              return;
            }
            await updateNurseLocation(profile.id, loc);
            const fresh = await fetchNurseProfile(profile.id);
            if (fresh) setNurse(fresh);
            setLocMsg('Location updated.');
          }}
        >
          Update service location (GPS)
        </button>
        {locMsg ? <p className="hcn-card-meta">{locMsg}</p> : null}
      </div>
      <form className="hcn-card hcn-form" onSubmit={save}>
        <label>Bio</label>
        <textarea rows={4} value={bio} onChange={(e) => setBio(e.target.value)} />
        <label>Specialty</label>
        <input value={specialty} onChange={(e) => setSpecialty(e.target.value)} />
        <label>Years of experience</label>
        <input type="number" min="0" value={yearsExperience} onChange={(e) => setYearsExperience(e.target.value)} />
        <label>Phone</label>
        <input value={phone} onChange={(e) => setPhone(e.target.value)} />
        <label>License number</label>
        <input value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} />
        <label>Languages (comma-separated)</label>
        <input value={languages} onChange={(e) => setLanguages(e.target.value)} />
        <label>Fees (GHS) — daily / weekly / monthly / yearly</label>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <input placeholder="Daily" value={feesDaily} onChange={(e) => setFeesDaily(e.target.value)} />
          <input placeholder="Weekly" value={feesWeekly} onChange={(e) => setFeesWeekly(e.target.value)} />
          <input placeholder="Monthly" value={feesMonthly} onChange={(e) => setFeesMonthly(e.target.value)} />
          <input placeholder="Yearly" value={feesYearly} onChange={(e) => setFeesYearly(e.target.value)} />
        </div>
        {savedMsg ? <p className="hcn-card-meta" style={{ color: '#047857' }}>{savedMsg}</p> : null}
        <button type="submit" className="hcn-btn" disabled={saving}>{saving ? 'Saving…' : 'Save profile'}</button>
      </form>
    </>
  );

  if (embedded) return body;

  return (
    <div className="hcn-page">
      <header className="hcn-page-header">
        <h1>My profile</h1>
        <p>Photo, experience, fees & contact</p>
      </header>
      {body}
    </div>
  );
}
