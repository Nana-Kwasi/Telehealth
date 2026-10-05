import React, { useState, useEffect } from 'react';
import { Save, Plus, Trash2, Clock } from 'lucide-react';
import { db } from '../../../services/firestoreShim';
import { doc, getDoc, updateDoc, collection, query, where, getDocs, addDoc, deleteDoc, serverTimestamp } from '../../../services/firestoreShim';
import useAddressAutofill from '../../../hooks/useAddressAutofill';
import { refreshSession } from '../../Auth/authService';
import { resolveFileUrl } from '../../../utils/fileUrl';

// Map a doctor record (session profile and/or the full /doctors/{id} document,
// whose metadataJson-preserved fields are expanded by the shim) to the form shape.
function mapDoctorToForm(src = {}) {
  return {
    name: src.name || src.fullName || src.displayName || '',
    specialization: src.specialization || src.speciality || '',
    bio: src.bio || src.about || '',
    experience: src.experience ?? src.yearsExperience ?? '',
    consultationFee: src.consultationFee ?? src.fee ?? '',
    phone: src.phone || '',
    location: typeof src.location === 'string' ? src.location : (src.location?.address || ''),
    consultationTypes: src.consultationTypes || { video: true, chat: false, inPerson: false },
    languages: Array.isArray(src.languages) ? src.languages.join(', ') : (src.languages || ''),
    photoURL: src.photoURL || src.photoUrl || src.avatarUrl || '',
    country: src.country || src.locationMeta?.country || '',
    city: src.city || src.locationMeta?.city || '',
    area: src.area || src.locationMeta?.area || '',
    region: src.region || src.locationMeta?.region || '',
    street: src.street || src.locationMeta?.street || '',
    ghanaDigitalAddress: src.ghanaDigitalAddress || '',
    latitude: src.latitude ?? src.locationMeta?.latitude ?? null,
    longitude: src.longitude ?? src.locationMeta?.longitude ?? null,
  };
}

export default function DoctorSettings({ profile }) {
  const [activeTab, setActiveTab] = useState('profile');
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const { detectAddress, loading: locating, message: locationMsg } = useAddressAutofill();

  // Profile state
  const [profileForm, setProfileForm] = useState({
    name: '', specialization: '', bio: '', experience: '',
    consultationFee: '', phone: '', location: '',
    consultationTypes: { video: true, chat: false, inPerson: false },
    languages: '', photoURL: '',
    country: '', city: '', area: '', region: '', street: '', ghanaDigitalAddress: '', latitude: null, longitude: null,
  });

  // Availability state
  const [availability, setAvailability] = useState([]);
  const [newSlot, setNewSlot] = useState({ date: '', startTime: '09:00', endTime: '17:00' });
  const [loadingSlots, setLoadingSlots] = useState(true);

  useEffect(() => {
    if (!profile?.id) return;
    // Seed immediately from the session profile so the form is never blank, then
    // hydrate from the full doctor document — resolve-role only surfaces a handful
    // of fields (name/specialization/phone/location/bio), while experience, fee,
    // consultation types, languages and photo live in the doctor's metadataJson and
    // only come back from GET /doctors/{id}.
    setProfileForm(prev => ({ ...prev, ...mapDoctorToForm(profile) }));
    loadAvailability();
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'doctors', profile.id));
        if (snap.exists()) {
          const full = snap.data();
          setProfileForm(prev => ({ ...prev, ...mapDoctorToForm({ ...profile, ...full }) }));
        }
      } catch (error) {
        console.error('Error loading doctor profile:', error);
      }
    })();
  }, [profile]);

  const loadAvailability = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const q = query(
        collection(db, 'doctorAvailability'),
        where('doctorId', '==', profile.id),
        where('date', '>=', today)
      );
      const snap = await getDocs(q);
      const slots = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      slots.sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.startTime || '').localeCompare(b.startTime || ''));
      setAvailability(slots);
    } catch (error) {
      console.error('Error loading availability:', error);
    } finally {
      setLoadingSlots(false);
    }
  };

  const showSuccess = (msg) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  const handleProfileSave = async () => {
    setSaving(true);
    try {
      const data = {
        name: profileForm.name.trim(),
        specialization: profileForm.specialization.trim(),
        bio: profileForm.bio.trim(),
        experience: profileForm.experience ? Number(profileForm.experience) : 0,
        consultationFee: profileForm.consultationFee ? Number(profileForm.consultationFee) : 0,
        phone: profileForm.phone.trim(),
        location: profileForm.location.trim(),
        country: profileForm.country || null,
        city: profileForm.city || null,
        area: profileForm.area || null,
        region: profileForm.region || null,
        street: profileForm.street || null,
        ghanaDigitalAddress: profileForm.ghanaDigitalAddress || null,
        latitude: Number.isFinite(Number(profileForm.latitude)) ? Number(profileForm.latitude) : null,
        longitude: Number.isFinite(Number(profileForm.longitude)) ? Number(profileForm.longitude) : null,
        locationMeta: {
          country: profileForm.country || null,
          city: profileForm.city || null,
          area: profileForm.area || null,
          region: profileForm.region || null,
          street: profileForm.street || null,
          latitude: Number.isFinite(Number(profileForm.latitude)) ? Number(profileForm.latitude) : null,
          longitude: Number.isFinite(Number(profileForm.longitude)) ? Number(profileForm.longitude) : null,
        },
        consultationTypes: profileForm.consultationTypes,
        languages: profileForm.languages.split(',').map(l => l.trim()).filter(Boolean),
        photoURL: profileForm.photoURL.trim(),
        updatedAt: serverTimestamp(),
      };
      await updateDoc(doc(db, 'doctors', profile.id), data);
      // Re-resolve the session so the sidebar/dashboard reflect the change now.
      refreshSession();
      showSuccess('Profile updated successfully!');
    } catch (error) {
      console.error('Error saving profile:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleAddSlot = async () => {
    if (!newSlot.date || !newSlot.startTime || !newSlot.endTime) return;
    try {
      // Generate time slots in 30-min intervals
      const slots = [];
      let current = newSlot.startTime;
      while (current < newSlot.endTime) {
        slots.push(current);
        const [h, m] = current.split(':').map(Number);
        const next = new Date(2000, 0, 1, h, m + 30);
        current = `${String(next.getHours()).padStart(2, '0')}:${String(next.getMinutes()).padStart(2, '0')}`;
      }

      await addDoc(collection(db, 'doctorAvailability'), {
        doctorId: profile.id,
        doctorName: profile.name || 'Doctor',
        date: newSlot.date,
        startTime: newSlot.startTime,
        endTime: newSlot.endTime,
        slots,
        booked: [],
        createdAt: serverTimestamp(),
      });

      setNewSlot({ date: '', startTime: '09:00', endTime: '17:00' });
      loadAvailability();
      showSuccess('Availability slot added!');
    } catch (error) {
      console.error('Error adding slot:', error);
    }
  };

  const handleDeleteSlot = async (slotId) => {
    try {
      await deleteDoc(doc(db, 'doctorAvailability', slotId));
      setAvailability(prev => prev.filter(s => s.id !== slotId));
    } catch (error) {
      console.error('Error deleting slot:', error);
    }
  };

  const handleCheckbox = (key) => {
    setProfileForm(prev => ({
      ...prev,
      consultationTypes: { ...prev.consultationTypes, [key]: !prev.consultationTypes[key] },
    }));
  };

  const tabs = [
    { key: 'profile', label: 'Profile' },
    { key: 'availability', label: 'Availability' },
  ];

  return (
    <div className="doctor-page">
      <div className="doctor-page-header">
        <h1>Settings</h1>
        <p>Manage your profile and availability</p>
      </div>

      {successMsg && (
        <div style={{
          background: '#dcfce7', color: '#166534', padding: '0.75rem 1rem',
          borderRadius: 8, marginBottom: '1rem', fontSize: '0.875rem', fontWeight: 500,
        }}>
          {successMsg}
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
        {tabs.map(t => (
          <button
            key={t.key}
            className={`doctor-btn ${activeTab === t.key ? 'doctor-btn-primary' : 'doctor-btn-outline'}`}
            onClick={() => setActiveTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'profile' && (
        <div className="doctor-card">
          <h3>Doctor Profile</h3>

          {/* Profile photo preview + URL input */}
          <div className="doctor-form-group" style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem' }}>
            <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#e8f1fb', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #bfdbfe' }}>
              {profileForm.photoURL ? (
                <img src={resolveFileUrl(profileForm.photoURL)} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none'; }} />
              ) : (
                <span style={{ fontSize: '1.75rem', fontWeight: 700, color: '#1e6bb8' }}>{(profileForm.name || 'D')[0].toUpperCase()}</span>
              )}
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '0.4rem' }}>Profile Photo URL</label>
              <input className="doctor-form-input" placeholder="https://example.com/your-photo.jpg"
                value={profileForm.photoURL}
                onChange={e => setProfileForm(prev => ({ ...prev, photoURL: e.target.value }))} />
              <p style={{ margin: '0.3rem 0 0', fontSize: '0.72rem', color: '#94a3b8' }}>Paste a direct image URL. This photo will appear on your profile and on patient dashboards.</p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="doctor-form-group">
              <label>Full Name</label>
              <input className="doctor-form-input" value={profileForm.name}
                onChange={e => setProfileForm(prev => ({ ...prev, name: e.target.value }))} />
            </div>
            <div className="doctor-form-group">
              <label>Specialization</label>
              <input className="doctor-form-input" placeholder="e.g., General Practice, Cardiology"
                value={profileForm.specialization}
                onChange={e => setProfileForm(prev => ({ ...prev, specialization: e.target.value }))} />
            </div>
            <div className="doctor-form-group">
              <label>Years of Experience</label>
              <input className="doctor-form-input" type="number" min="0" value={profileForm.experience}
                onChange={e => setProfileForm(prev => ({ ...prev, experience: e.target.value }))} />
            </div>
            <div className="doctor-form-group">
              <label>Consultation Fee ($)</label>
              <input className="doctor-form-input" type="number" min="0" value={profileForm.consultationFee}
                onChange={e => setProfileForm(prev => ({ ...prev, consultationFee: e.target.value }))} />
            </div>
            <div className="doctor-form-group">
              <label>Phone</label>
              <input className="doctor-form-input" placeholder="+1 (555) 000-0000" value={profileForm.phone}
                onChange={e => setProfileForm(prev => ({ ...prev, phone: e.target.value }))} />
            </div>
            <div className="doctor-form-group">
              <label>Location</label>
              <input className="doctor-form-input" placeholder="City, State" value={profileForm.location}
                onChange={e => setProfileForm(prev => ({ ...prev, location: e.target.value }))} />
              <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => detectAddress((loc) => {
                    setProfileForm(prev => ({
                      ...prev,
                      location: loc.address || [loc.city, loc.country].filter(Boolean).join(', '),
                      country: loc.countryCode || prev.country,
                      city: loc.city || prev.city,
                      area: loc.area || prev.area,
                      region: loc.region || prev.region,
                      street: loc.street || prev.street,
                      latitude: loc.latitude ?? prev.latitude,
                      longitude: loc.longitude ?? prev.longitude,
                    }));
                  })}
                >
                  {locating ? 'Detecting…' : 'Use current location'}
                </button>
                {locationMsg ? <span style={{ fontSize: '0.74rem', color: '#64748b' }}>{locationMsg}</span> : null}
              </div>
            </div>
            <div className="doctor-form-group">
              <label>City</label>
              <input className="doctor-form-input" placeholder="e.g. Accra" value={profileForm.city || ''}
                onChange={e => setProfileForm(prev => ({ ...prev, city: e.target.value }))} />
            </div>
            <div className="doctor-form-group">
              <label>Area / Locality</label>
              <input className="doctor-form-input" placeholder="e.g. East Legon" value={profileForm.area || ''}
                onChange={e => setProfileForm(prev => ({ ...prev, area: e.target.value }))} />
            </div>
            <div className="doctor-form-group">
              <label>Region / State</label>
              <input className="doctor-form-input" placeholder="e.g. Greater Accra" value={profileForm.region || ''}
                onChange={e => setProfileForm(prev => ({ ...prev, region: e.target.value }))} />
            </div>
            <div className="doctor-form-group">
              <label>Street</label>
              <input className="doctor-form-input" placeholder="e.g. Liberation Road" value={profileForm.street || ''}
                onChange={e => setProfileForm(prev => ({ ...prev, street: e.target.value }))} />
            </div>
            <div className="doctor-form-group">
              <label>Ghana Digital Address (optional)</label>
              <input className="doctor-form-input" placeholder="e.g. GA-123-4567" value={profileForm.ghanaDigitalAddress || ''}
                onChange={e => setProfileForm(prev => ({ ...prev, ghanaDigitalAddress: e.target.value }))} />
            </div>
            <div className="doctor-form-group">
              <label>Languages (comma-separated)</label>
              <input className="doctor-form-input" placeholder="English, Spanish" value={profileForm.languages}
                onChange={e => setProfileForm(prev => ({ ...prev, languages: e.target.value }))} />
            </div>
          </div>

          <div className="doctor-form-group">
            <label>Bio</label>
            <textarea className="doctor-form-textarea" rows={4} placeholder="Tell patients about yourself..."
              value={profileForm.bio}
              onChange={e => setProfileForm(prev => ({ ...prev, bio: e.target.value }))} />
          </div>

          <div className="doctor-form-group">
            <label>Consultation Types</label>
            <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.5rem' }}>
              {[['video', 'Video Call'], ['chat', 'Chat'], ['inPerson', 'In-Person']].map(([key, label]) => (
                <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.875rem', cursor: 'pointer' }}>
                  <input type="checkbox" checked={profileForm.consultationTypes[key] || false} onChange={() => handleCheckbox(key)} />
                  {label}
                </label>
              ))}
            </div>
          </div>

          <button className="doctor-btn doctor-btn-primary" onClick={handleProfileSave} disabled={saving}>
            <Save size={16} /> {saving ? 'Saving...' : 'Save Profile'}
          </button>
        </div>
      )}

      {activeTab === 'availability' && (
        <>
          <div className="doctor-card">
            <h3>Add Availability</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '1rem', alignItems: 'end' }}>
              <div className="doctor-form-group" style={{ marginBottom: 0 }}>
                <label>Date</label>
                <input className="doctor-form-input" type="date" value={newSlot.date}
                  min={new Date().toISOString().split('T')[0]}
                  onChange={e => setNewSlot(prev => ({ ...prev, date: e.target.value }))} />
              </div>
              <div className="doctor-form-group" style={{ marginBottom: 0 }}>
                <label>Start Time</label>
                <input className="doctor-form-input" type="time" value={newSlot.startTime}
                  onChange={e => setNewSlot(prev => ({ ...prev, startTime: e.target.value }))} />
              </div>
              <div className="doctor-form-group" style={{ marginBottom: 0 }}>
                <label>End Time</label>
                <input className="doctor-form-input" type="time" value={newSlot.endTime}
                  onChange={e => setNewSlot(prev => ({ ...prev, endTime: e.target.value }))} />
              </div>
              <button className="doctor-btn doctor-btn-primary" onClick={handleAddSlot}
                disabled={!newSlot.date} style={{ height: 'fit-content' }}>
                <Plus size={16} /> Add
              </button>
            </div>
          </div>

          <div className="doctor-card">
            <h3>Upcoming Availability ({availability.length})</h3>
            {loadingSlots ? (
              <p style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem' }}>Loading...</p>
            ) : availability.length === 0 ? (
              <div className="doctor-empty-state">
                <Clock size={40} />
                <h3>No availability slots</h3>
                <p>Add your available times so patients can book appointments.</p>
              </div>
            ) : (
              <table className="doctor-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Time Range</th>
                    <th>Slots</th>
                    <th>Booked</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {availability.map(slot => (
                    <tr key={slot.id}>
                      <td style={{ fontWeight: 500 }}>
                        {slot.date ? new Date(slot.date + 'T00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '—'}
                      </td>
                      <td>{slot.startTime} — {slot.endTime}</td>
                      <td>{slot.slots?.length || 0}</td>
                      <td>
                        <span className={`doctor-badge ${(slot.booked?.length || 0) > 0 ? 'badge-pending' : 'badge-confirmed'}`}>
                          {slot.booked?.length || 0} booked
                        </span>
                      </td>
                      <td>
                        <button className="doctor-btn doctor-btn-sm doctor-btn-danger" onClick={() => handleDeleteSlot(slot.id)}>
                          <Trash2 size={12} /> Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
