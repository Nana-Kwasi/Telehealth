import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../Auth/firebaseConfig';
import './MatchTherapist.css';
import { collection, doc, getDocs, setDoc } from 'firebase/firestore';

export default function MatchTherapist() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [therapists, setTherapists] = useState([]);
  
  // Get questionnaire data and client ID
  const questionnaireData = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('th.onboard') || '{}'); } catch { return {}; }
  }, []);
  
  const clientId = useMemo(() => {
    return localStorage.getItem('th.clientId');
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        // Fetch all therapists
        const col = collection(db, 'therapists');
        const res = await getDocs(col);
        const all = res.docs.map((d) => ({ id: d.id, ...d.data() }));
        
        // Enhanced matching based on questionnaire data
        const filtered = all.filter((t) => {
          // Basic type matching
          const typeMatch = !questionnaireData.therapyType || 
            (t.type || '').toLowerCase().includes(questionnaireData.therapyType);
          
          // Religious preference matching
          const christianPref = questionnaireData.preferChristianTherapist === 'Yes';
          const religionMatch = !christianPref || 
            (t.religion || '').toLowerCase() === 'christianity';
          
          // Gender preference matching
          const genderPref = questionnaireData.therapistGender;
          const genderMatch = !genderPref || genderPref === 'No preference' || 
            (t.gender || '').toLowerCase() === genderPref.toLowerCase();
          
          // LGBTQIA+ preference matching
          const lgbtqiaPref = questionnaireData.lgbtqia;
          const lgbtqiaMatch = !lgbtqiaPref || lgbtqiaPref === 'No preference' || 
            (t.lgbtqiaAffirming === true);
          
          return typeMatch && religionMatch && genderMatch && lgbtqiaMatch;
        });
        
        // Sort by relevance score (you can enhance this algorithm)
        const scored = filtered.map(t => ({
          ...t,
          score: calculateRelevanceScore(t, questionnaireData)
        }));
        
        scored.sort((a, b) => b.score - a.score);
        setTherapists(scored);
      } catch (e) {
        console.error('Error fetching therapists:', e);
        setTherapists([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [questionnaireData]);

  const calculateRelevanceScore = (therapist, data) => {
    let score = 0;
    
    // Type match
    if (therapist.type && data.therapyType) {
      if (therapist.type.toLowerCase().includes(data.therapyType)) score += 10;
    }
    
    // Religious match
    if (data.preferChristianTherapist === 'Yes' && therapist.religion === 'Christianity') {
      score += 8;
    }
    
    // Gender preference match
    if (data.therapistGender && data.therapistGender !== 'No preference') {
      if (therapist.gender === data.therapistGender) score += 5;
    }
    
    // LGBTQIA+ match
    if (data.lgbtqia === 'Yes, this is important to me' && therapist.lgbtqiaAffirming) {
      score += 7;
    }
    
    // Experience bonus
    if (therapist.yearsExperience) {
      score += Math.min(therapist.yearsExperience, 20) * 0.5;
    }
    
    return score;
  };

  const choose = async (t) => {
    try {
      const u = auth.currentUser;
      if (u && clientId) {
        // Update client document with therapist assignment
        await setDoc(doc(db, 'clients', clientId), { 
          assignedTherapistId: t.id, 
          assignedTherapistName: t.name,
          assignedAt: new Date().toISOString()
        }, { merge: true });
        
        // Add client to therapist's clients subcollection
        await setDoc(doc(db, 'therapists', t.id, 'clients', clientId), { 
          clientId: clientId, 
          assignedAt: new Date().toISOString() 
        });
      }
    } catch (error) {
      console.error('Error assigning therapist:', error);
    }
    
    // Navigate to client dashboard
    navigate('/dashboard');
  };

  return (
    <div className="match-container">
      <h1 className="page-title">Choose your therapist</h1>
      <p className="subtitle">We matched a few options based on your preferences.</p>
      {loading ? <div className="loading-card">Loading matches…</div> : (
        therapists.length ? (
          <div className="card-grid">
            {therapists.map((t) => (
              <div key={t.id} className="therapist-card">
                <div className="therapist-avatar">
                  {t.photoURL ? <img alt="" src={t.photoURL} /> : '🧑‍⚕️'}
                </div>
                <div className="therapist-info">
                  <div className="therapist-name">{t.name}</div>
                  <div className="therapist-details">{t.type} • {t.yearsExperience ? `${t.yearsExperience} yrs` : 'Experience N/A'}</div>
                  <div className="therapist-specialties">{(t.specialties || []).join(', ')}</div>
                  {t.score && <div className="therapist-score">Match: {Math.round(t.score)}%</div>}
                </div>
                <div>
                  <button className="select-button" onClick={() => choose(t)}>Select</button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="no-matches-card">No exact matches yet. We'll assign the best available therapist shortly.</div>
        )
      )}
    </div>
  );
}


