import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../../Auth/firebaseConfig';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { ArrowLeft, User, Mail, Calendar, MapPin } from 'lucide-react';
import './ClientDetails.css';

export default function ClientDetails() {
  const { clientId } = useParams();
  const navigate = useNavigate();
  const [client, setClient] = useState(null);
  const [clientTherapyNotes, setClientTherapyNotes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchClientData = async () => {
      try {
        const clientDoc = await getDoc(doc(db, 'clients', clientId));
        if (clientDoc.exists()) {
          const clientData = { id: clientDoc.id, ...clientDoc.data() };
          setClient(clientData);

          const notesQuery = query(
            collection(db, 'therapyNotes'),
            where('clientId', '==', clientId)
          );
          const notesSnapshot = await getDocs(notesQuery);
          const notes = notesSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
          setClientTherapyNotes(notes);
        }
      } catch (error) {
        console.error('Error fetching client data:', error);
      } finally {
        setLoading(false);
      }
    };

    if (clientId) {
      fetchClientData();
    }
  }, [clientId]);

  if (loading) {
    return (
      <div className="page-container">
        <div className="loading-state">Loading client details...</div>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="page-container">
        <div className="error-state">Client not found</div>
        <button onClick={() => navigate('/dashboard/clients')} className="btn-primary">
          Back to Clients
        </button>
      </div>
    );
  }

  return (
    <div className="page-container client-details-page">
      <div className="page-header">
        <button onClick={() => navigate('/dashboard/clients')} className="back-button">
          <ArrowLeft size={20} />
          Back to Clients
        </button>
        <h1 className="page-title">Client Information</h1>
      </div>

      <div className="client-details-content">
        <div className="details-grid">
          <div className="details-section">
            <h3 className="section-title">
              <User size={20} />
              Personal Information
            </h3>
            <div className="data-item">
              <strong>Name:</strong>
              <span className="data-value">{client.clientName || client.displayName || 'N/A'}</span>
            </div>
            <div className="data-item">
              <strong>Email:</strong>
              <span className="data-value">{client.clientEmail || 'N/A'}</span>
            </div>
            <div className="data-item">
              <strong>Age:</strong>
              <span className="data-badge age">{client.age || 'N/A'}</span>
            </div>
            <div className="data-item">
              <strong>Gender:</strong>
              <span className="data-badge gender">
                {client.gender ? (client.gender === 'man' ? 'Male' : client.gender === 'woman' ? 'Female' : 'Person') : 'N/A'}
              </span>
            </div>
            <div className="data-item">
              <strong>Country:</strong>
              <span className="data-badge country">{client.country || 'N/A'}</span>
            </div>
            <div className="data-item">
              <strong>Employment:</strong>
              <span className="data-badge employment">{client.employment || 'N/A'}</span>
            </div>
            <div className="data-item">
              <strong>Relationship Status:</strong>
              <span className="data-badge relationship">{client.relationshipStatus || 'N/A'}</span>
            </div>
          </div>

          <div className="details-section">
            <h3 className="section-title">
              <Calendar size={20} />
              Therapy Information
            </h3>
            <div className="data-item">
              <strong>Therapy Type:</strong>
              <span className="data-badge therapy">{client.therapyType || 'N/A'}</span>
            </div>
            <div className="data-item">
              <strong>Session Frequency:</strong>
              <span className="data-badge frequency">{client.sessionFrequency || 'N/A'}</span>
            </div>
            <div className="data-item">
              <strong>Session Structure:</strong>
              <span className="data-badge structure">{client.sessionStructure || 'N/A'}</span>
            </div>
            <div className="data-item">
              <strong>Therapist Style:</strong>
              <span className="data-badge style">{client.therapistStyle || 'N/A'}</span>
            </div>
            <div className="data-item">
              <strong>Assigned Therapist:</strong>
              <span className="data-badge therapist">{client.assignedTherapist?.name || 'Not Assigned'}</span>
            </div>
          </div>

          <div className="details-section">
            <h3 className="section-title">
              <MapPin size={20} />
              Health & Wellness
            </h3>
            <div className="data-item">
              <strong>Physical Health:</strong>
              <span className={`data-badge health ${client.physicalHealth?.toLowerCase()}`}>
                {client.physicalHealth || 'N/A'}
              </span>
            </div>
            <div className="data-item">
              <strong>Mental Health:</strong>
              <span className="data-badge mental">
                {client.depression || client.anxiety ? `${client.depression || 'N/A'} / ${client.anxiety || 'N/A'}` : 'N/A'}
              </span>
            </div>
            <div className="data-item">
              <strong>Sleep Quality:</strong>
              <span className={`data-badge sleep ${client.sleep?.toLowerCase()}`}>
                {client.sleep || 'N/A'}
              </span>
            </div>
            <div className="data-item">
              <strong>Exercise:</strong>
              <span className="data-badge exercise">{client.exercise || 'N/A'}</span>
            </div>
            <div className="data-item">
              <strong>Eating Habits:</strong>
              <span className={`data-badge eating ${client.eatingHabits?.toLowerCase()}`}>
                {client.eatingHabits || 'N/A'}
              </span>
            </div>
          </div>
        </div>

        {clientTherapyNotes.length > 0 && (
          <div className="therapy-progress-section">
            <h3 className="section-title">Therapy Progress & Notes</h3>
            <div className="progress-summary">
              <div className="progress-card">
                <div className="progress-icon">📊</div>
                <div className="progress-info">
                  <h4>Total Sessions</h4>
                  <span className="progress-number">{clientTherapyNotes.length}</span>
                </div>
              </div>
              <div className="progress-card">
                <div className="progress-icon">📈</div>
                <div className="progress-info">
                  <h4>Avg. Mood Rating</h4>
                  <span className="progress-number">
                    {clientTherapyNotes.length > 0
                      ? (clientTherapyNotes.reduce((sum, note) => sum + (note.moodRating || 5), 0) / clientTherapyNotes.length).toFixed(1)
                      : 'N/A'
                    }
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
