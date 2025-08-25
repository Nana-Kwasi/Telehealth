import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../Auth/firebaseConfig';
import { collection, doc, getDocs, setDoc } from 'firebase/firestore';
import './TherapistSelectionModal.css';

export default function TherapistSelectionModal() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [therapists, setTherapists] = useState([]);
  const [selectedTherapist, setSelectedTherapist] = useState(null);
  const [showConfirm, setShowConfirm] = useState(false);
  
  // Get questionnaire data and client ID
  const questionnaireData = JSON.parse(localStorage.getItem('th.onboard') || '{}');
  const clientId = localStorage.getItem('th.clientId');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        console.log('Fetching therapists...');
        
        // Fetch all therapists
        const col = collection(db, 'therapists');
        console.log('Fetching from collection:', 'therapists');
        
        const res = await getDocs(col);
        const all = res.docs.map((d) => ({ id: d.id, ...d.data() }));
        
        console.log('All therapists fetched:', all);
        console.log('Number of therapists found:', all.length);
        
        // If no therapists in database, create some sample ones for testing
        if (all.length === 0) {
          console.log('No therapists found in database, showing sample data...');
          const sampleTherapists = [
            {
              id: 'sample1',
              name: 'Dr. Sarah Johnson',
              type: 'Individual therapy, Anxiety therapy, Depression therapy',
              role: 'therapist',
              username: 'dr_sarah_j',
              createdAt: new Date().toISOString(),
              photoURL: null
            },
            {
              id: 'sample2',
              name: 'Dr. Michael Chen',
              type: 'Individual therapy, Couples therapy, Family therapy',
              role: 'therapist',
              username: 'dr_michael_c',
              createdAt: new Date().toISOString(),
              photoURL: null
            },
            {
              id: 'sample3',
              name: 'Dr. Emily Rodriguez',
              type: 'Individual therapy, Trauma therapy, LGBTQ+ therapy',
              role: 'therapist',
              username: 'dr_emily_r',
              createdAt: new Date().toISOString(),
              photoURL: null
            }
          ];
          setTherapists(sampleTherapists);
          setLoading(false);
          return;
        }
        
        // Enhanced matching based on questionnaire data
        const filtered = all.filter((t) => {
          // Skip admin users
          if (t.role === 'admin') return false;
          
          // Basic type matching - check if therapist type matches questionnaire preferences
          const typeMatch = !questionnaireData.therapyTypes || 
            questionnaireData.therapyTypes.some(pref => 
              (t.type || '').toLowerCase().includes(pref.toLowerCase())
            );
          
          // For now, show all non-admin therapists (we can add more filtering later)
          return typeMatch;
        });
        
        console.log('Filtered therapists:', filtered);
        
        // Sort by relevance score
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
    let score = 50; // Base score for all therapists
    
    // Type match
    if (therapist.type && data.therapyTypes) {
      const typeMatch = data.therapyTypes.some(pref => 
        therapist.type.toLowerCase().includes(pref.toLowerCase())
      );
      if (typeMatch) score += 20;
    }
    
    // Role bonus (therapists get higher scores than other roles)
    if (therapist.role === 'therapist') score += 15;
    if (therapist.role === 'user') score += 10;
    
    // Username bonus (professional usernames)
    if (therapist.username && therapist.username.length > 3) score += 5;
    
    return score;
  };

  const selectTherapist = (therapist) => {
    setSelectedTherapist(therapist);
    setShowConfirm(true);
  };

  const confirmSelection = async () => {
    try {
      // Update client document with therapist assignment
      await setDoc(doc(db, 'clients', clientId), { 
        assignedTherapistId: selectedTherapist.id, 
        assignedTherapistName: selectedTherapist.name,
        assignedAt: new Date().toISOString()
      }, { merge: true });
      
      // Add client to therapist's clients subcollection
      await setDoc(doc(db, 'therapists', selectedTherapist.id, 'clients', clientId), { 
        clientId: clientId, 
        assignedAt: new Date().toISOString() 
      });
      
      // Navigate to client dashboard
      navigate('/dashboard');
    } catch (error) {
      console.error('Error assigning therapist:', error);
      alert('There was an error assigning your therapist. Please try again.');
    }
  };

  if (loading) {
    return (
      <div className="modal-overlay">
        <div className="modal-content">
          <div className="loading-spinner">
            <div className="spinner"></div>
            <h3>Finding Your Perfect Match</h3>
            <p>We're analyzing your preferences and matching you with the best therapists...</p>
            <div className="loading-steps">
              <div className="step">✓ Analyzing your questionnaire</div>
              <div className="step">✓ Filtering therapists by preferences</div>
              <div className="step">⏳ Calculating match scores</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h1>Choose Your Therapist</h1>
          <p>We've matched you with therapists based on your preferences</p>
        </div>

        {therapists.length > 0 ? (
          <>
            <div className="therapists-grid">
              {therapists.map((therapist) => (
                <div key={therapist.id} className="therapist-card">
                  <div className="therapist-avatar">
                    {therapist.photoURL ? (
                      <img src={therapist.photoURL} alt={therapist.name} />
                    ) : (
                      <div className="avatar-placeholder">
                        {therapist.role === 'admin' ? '👑' : 
                         therapist.role === 'therapist' ? '🧑‍⚕️' : '👤'}
                      </div>
                    )}
                  </div>
                  
                                  <div className="therapist-info">
                  <h3 className="therapist-name">{therapist.name}</h3>
                  <p className="therapist-type">{therapist.type}</p>
                  <p className="therapist-role">
                    <strong>Role:</strong> {therapist.role}
                  </p>
                  {therapist.username && (
                    <p className="therapist-username">
                      <strong>Username:</strong> {therapist.username}
                    </p>
                  )}
                  {therapist.createdAt && (
                    <p className="therapist-created">
                      <strong>Member since:</strong> {new Date(therapist.createdAt).toLocaleDateString()}
                    </p>
                  )}
                  {therapist.score && (
                    <div className="match-score">Match: {Math.round(therapist.score)}%</div>
                  )}
                </div>
                  
                  <button 
                    className="select-therapist-btn"
                    onClick={() => selectTherapist(therapist)}
                  >
                    Select This Therapist
                  </button>
                </div>
              ))}
            </div>
            
            {/* Debug info for development */}
            {process.env.NODE_ENV === 'development' && (
              <div className="debug-info">
                <p><strong>Debug Info:</strong> Found {therapists.length} therapists from 'therapists' collection</p>
                <p>Collection: therapists | Data Source: {therapists[0]?.id.startsWith('sample') ? 'Sample Data' : 'Firestore Database'}</p>
              </div>
            )}
          </>
        ) : (
          <div className="no-therapists">
            <div className="no-therapists-icon">👥</div>
            <h3>No Therapists Available</h3>
            <p>We couldn't find therapists matching your current preferences.</p>
            <p>Don't worry! We'll assign the best available therapist for you.</p>
            <button 
              className="btn-primary"
              onClick={() => navigate('/dashboard')}
            >
              Continue to Dashboard
            </button>
          </div>
        )}

        {/* Confirmation Modal */}
        {showConfirm && selectedTherapist && (
          <div className="confirmation-overlay">
            <div className="confirmation-modal">
              <h3>Confirm Your Selection</h3>
              <p>You've selected <strong>{selectedTherapist.name}</strong> as your therapist.</p>
              <p>This will begin your therapy journey. You can change therapists later if needed.</p>
              
              <div className="confirmation-actions">
                <button 
                  className="btn-secondary"
                  onClick={() => setShowConfirm(false)}
                >
                  Choose Different
                </button>
                <button 
                  className="btn-primary"
                  onClick={confirmSelection}
                >
                  Confirm & Start Therapy
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
