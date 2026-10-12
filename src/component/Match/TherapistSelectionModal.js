import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../../services/firestoreShim';
import { collection, doc, getDocs, setDoc } from '../../services/firestoreShim';
import './TherapistSelectionModal.css';
import { resolveFileUrl } from '../../utils/fileUrl';
import Paged from '../Common/Paged';

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
    // Only fetch once when component mounts
    let isMounted = true;
    
    (async () => {
      if (!isMounted) return;
      
      setLoading(true);
      
      // Add timeout to prevent infinite loading
      const timeoutId = setTimeout(() => {
        if (isMounted) {
          console.log('Timeout reached, forcing loading to false');
          setLoading(false);
        }
      }, 10000); // 10 seconds timeout
      
      try {
        console.log('Fetching therapists... (ONCE)');
        console.log('Questionnaire data:', questionnaireData);
        console.log('Client ID:', clientId);
        
        // Fetch all therapists
        const col = collection(db, 'therapists');
        console.log('Fetching from collection:', 'therapists');
        
        const res = await getDocs(col);
        const all = res.docs.map((d) => ({ id: d.id, ...d.data() }));
        
        if (!isMounted) return;
        
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
        

        
        // Show all therapists (including admin therapists)
        const filtered = all;
        
        console.log('All therapists (including admin):', filtered);
        
        // Use all therapists
        let therapistsToShow = filtered;
        
        console.log('Final therapists to show:', therapistsToShow);
        
        // Sort by relevance score
        const scored = therapistsToShow.map(t => ({
          ...t,
          score: calculateRelevanceScore(t, questionnaireData)
        }));
        
        scored.sort((a, b) => b.score - a.score);
        setTherapists(scored);
        
        // Ensure loading is set to false
        setLoading(false);
        clearTimeout(timeoutId);
      } catch (e) {
        console.error('Error fetching therapists:', e);
        setTherapists([]);
        setLoading(false);
        clearTimeout(timeoutId);
      }
    })();
    
    // Cleanup function to prevent multiple calls
    return () => {
      isMounted = false;
    };
  }, []); // Empty dependency array - only run once

  const calculateRelevanceScore = (therapist, data) => {
    let score = 50; // Base score for all therapists
    
    // Role bonus (admin therapists get highest scores, then regular therapists)
    if (therapist.role === 'admin') score += 25; // Admin therapists get bonus
    else if (therapist.role === 'therapist') score += 15;
    else if (therapist.role === 'user') score += 10;
    
    // Username bonus (professional usernames)
    if (therapist.username && therapist.username.length > 5) score += 5;
    
    // Type bonus if available
    if (therapist.type && therapist.type.length > 10) score += 10;
    
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
              <Paged items={therapists}>{(therapists) => therapists.map((therapist) => (
                <div key={therapist.id} className="therapist-card">
                  <div className="therapist-avatar">
                    {therapist.photoURL ? (
                      <img src={resolveFileUrl(therapist.photoURL)} alt={therapist.name} />
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
                  </div>
                  
                  <button 
                    className="select-therapist-btn"
                    onClick={() => selectTherapist(therapist)}
                  >
                    Select This Therapist
                  </button>
                </div>
              ))}</Paged>
            </div>
            

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
