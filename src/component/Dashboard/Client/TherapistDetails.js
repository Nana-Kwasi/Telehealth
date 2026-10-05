import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../../../services/firestoreShim';
import { doc, getDoc } from '../../../services/firestoreShim';
import { ArrowLeft, User, Mail, Phone, MapPin, Award, Star, Languages, BookOpen } from 'lucide-react';
import './TherapistDetails.css';
import { resolveFileUrl } from '../../../utils/fileUrl';

export default function TherapistDetails() {
  const { therapistId } = useParams();
  const navigate = useNavigate();
  const [therapist, setTherapist] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTherapist = async () => {
      try {
        const therapistDoc = await getDoc(doc(db, 'therapists', therapistId));
        if (therapistDoc.exists()) {
          setTherapist({ id: therapistDoc.id, ...therapistDoc.data() });
        }
      } catch (error) {
        console.error('Error fetching therapist:', error);
      } finally {
        setLoading(false);
      }
    };

    if (therapistId) {
      fetchTherapist();
    }
  }, [therapistId]);

  if (loading) {
    return (
      <div className="page-container">
        <div className="loading-state">Loading therapist details...</div>
      </div>
    );
  }

  if (!therapist) {
    return (
      <div className="page-container">
        <div className="error-state">Therapist not found</div>
        <button onClick={() => navigate('/dashboard/video')} className="btn-primary">
          Back to Schedule
        </button>
      </div>
    );
  }

  return (
    <div className="page-container therapist-details-page">
      <div className="page-header">
        <button onClick={() => navigate('/dashboard/video')} className="back-button">
          <ArrowLeft size={20} />
          Back to Schedule
        </button>
        <h1 className="page-title">Therapist Details</h1>
      </div>

      <div className="therapist-details-content">
        <div className="therapist-photo-section">
          {therapist.photoURL ? (
            <img 
              src={resolveFileUrl(therapist.photoURL)} 
              alt={therapist.name}
              className="therapist-photo"
            />
          ) : (
            <div className="therapist-photo-placeholder">
              <User size={64} />
            </div>
          )}
          <h2>{therapist.name}</h2>
          <p className="therapist-role">{therapist.type || 'Therapist'}</p>
        </div>

        <div className="therapist-info-grid">
          <div className="info-item">
            <Mail size={20} />
            <span>{therapist.email}</span>
          </div>
          
          {therapist.phone && (
            <div className="info-item">
              <Phone size={20} />
              <span>{therapist.phone}</span>
            </div>
          )}

          {therapist.practiceAddress && (
            <div className="info-item">
              <MapPin size={20} />
              <span>{therapist.practiceAddress}</span>
            </div>
          )}

          <div className="info-item">
            <Award size={20} />
            <span>{therapist.yearsExperience ? `${therapist.yearsExperience} years experience` : 'Experienced Professional'}</span>
          </div>

          {therapist.specialties && (
            <div className="info-item">
              <Star size={20} />
              <span>{Array.isArray(therapist.specialties) ? therapist.specialties.join(', ') : therapist.specialties}</span>
            </div>
          )}

          {therapist.languagesSpoken && (
            <div className="info-item">
              <Languages size={20} />
              <span>{Array.isArray(therapist.languagesSpoken) ? therapist.languagesSpoken.join(', ') : therapist.languagesSpoken}</span>
            </div>
          )}

          {therapist.licenseNumber && (
            <div className="info-item">
              <BookOpen size={20} />
              <span>License: {therapist.licenseNumber}</span>
            </div>
          )}
        </div>

        {therapist.bio && (
          <div className="therapist-bio">
            <h3>About</h3>
            <p>{therapist.bio}</p>
          </div>
        )}

        {therapist.education && (
          <div className="therapist-section">
            <h3>Education</h3>
            <p>{therapist.education}</p>
          </div>
        )}

        {therapist.therapyApproaches && (
          <div className="therapist-section">
            <h3>Therapy Approaches</h3>
            <div className="approaches-list">
              {Array.isArray(therapist.therapyApproaches) 
                ? therapist.therapyApproaches.map((approach, idx) => (
                    <span key={idx} className="approach-tag">{approach}</span>
                  ))
                : <p>{therapist.therapyApproaches}</p>
              }
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
