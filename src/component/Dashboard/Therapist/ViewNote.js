import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../../Auth/firebaseConfig';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { ArrowLeft, Edit } from 'lucide-react';
import './ViewNote.css';

const templates = {
  therapyBook: { name: 'Therapy Book' },
  soap: { name: 'SOAP Note' },
  dap: { name: 'DAP Note' },
  progress: { name: 'Progress Note' }
};

export default function ViewNote() {
  const { noteId } = useParams();
  const navigate = useNavigate();
  const [note, setNote] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchNote = async () => {
      try {
        // Try multiple collections where notes might be stored
        const collections = ['therapyNotes', 'notes', 'therapyBooks'];
        
        for (const collectionName of collections) {
          try {
            const noteDoc = await getDoc(doc(db, collectionName, noteId));
            if (noteDoc.exists()) {
              setNote({ id: noteDoc.id, ...noteDoc.data() });
              return;
            }
          } catch (err) {
            console.log(`Note not found in ${collectionName}, trying next...`);
          }
        }
        
        // If not found in any collection, try subcollections
        // Check if it's a client subcollection note
        const clientsSnapshot = await getDocs(collection(db, 'clients'));
        for (const clientDoc of clientsSnapshot.docs) {
          try {
            const noteDoc = await getDoc(doc(db, 'clients', clientDoc.id, 'therapyNotes', noteId));
            if (noteDoc.exists()) {
              setNote({ id: noteDoc.id, ...noteDoc.data() });
              return;
            }
          } catch (err) {
            // Continue searching
          }
        }
      } catch (error) {
        console.error('Error fetching note:', error);
      } finally {
        setLoading(false);
      }
    };

    if (noteId) {
      fetchNote();
    }
  }, [noteId]);

  if (loading) {
    return (
      <div className="page-container">
        <div className="loading-state">Loading note...</div>
      </div>
    );
  }

  if (!note) {
    return (
      <div className="page-container">
        <div className="error-state">Note not found</div>
        <button onClick={() => navigate('/dashboard/notes')} className="btn-primary">
          Back to Notes
        </button>
      </div>
    );
  }

  const getNoteTitle = () => {
    if (note.noteType === 'therapyBook' && note.targetAudience === 'all') {
      return templates[note.noteType]?.name || 'Therapy Book';
    }
    if (note.clientNames && note.clientNames.length > 1) {
      return `${note.clientNames.join(', ')} - ${templates[note.noteType]?.name || 'Note'}`;
    }
    return `${note.clientName || 'Unknown Client'} - ${templates[note.noteType]?.name || 'Note'}`;
  };

  const getNoteDate = () => {
    if (note.sessionDate) {
      return new Date(note.sessionDate).toLocaleDateString();
    }
    if (note.createdAt?.toDate) {
      return note.createdAt.toDate().toLocaleDateString();
    }
    return new Date(note.createdAt).toLocaleDateString();
  };

  return (
    <div className="page-container view-note-page">
      <div className="page-header">
        <button onClick={() => navigate('/dashboard/notes')} className="back-button">
          <ArrowLeft size={20} />
          Back to Notes
        </button>
        <div className="header-actions">
          <h1 className="page-title">{getNoteTitle()}</h1>
          <button 
            onClick={() => navigate(`/dashboard/notes/edit/${noteId}`)}
            className="btn-primary"
          >
            <Edit size={16} />
            Edit Note
          </button>
        </div>
      </div>

      <div className="note-content">
        <div className="note-meta">
          <div className="meta-item">
            <strong>Date:</strong> {getNoteDate()}
          </div>
          <div className="meta-item">
            <strong>Status:</strong> 
            <span className={`status-badge ${note.isDraft ? 'draft' : 'completed'}`}>
              {note.isDraft ? 'Draft' : 'Completed'}
            </span>
          </div>
          <div className="meta-item">
            <strong>Therapist:</strong> {note.therapistName}
          </div>
        </div>

        {note.noteType === 'therapyBook' ? (
          <div className="therapy-book-content">
            {note.bookTitle && (
              <div className="content-section">
                <h3>Book Title</h3>
                <p>{note.bookTitle}</p>
              </div>
            )}
            {note.author && (
              <div className="content-section">
                <h3>Author</h3>
                <p>{note.author}</p>
              </div>
            )}
            {note.description && (
              <div className="content-section">
                <h3>Description</h3>
                <p>{note.description}</p>
              </div>
            )}
            {note.targetAudience && (
              <div className="content-section">
                <h3>Target Audience</h3>
                <p>{note.targetAudience}</p>
              </div>
            )}
            {note.chapters && (
              <div className="content-section">
                <h3>Chapters</h3>
                <div className="content-text">{note.chapters}</div>
              </div>
            )}
            {note.keyTopics && (
              <div className="content-section">
                <h3>Key Topics</h3>
                <div className="content-text">{note.keyTopics}</div>
              </div>
            )}
          </div>
        ) : (
          <div className="clinical-note-content">
            {note.subjective && (
              <div className="content-section">
                <h3>Subjective</h3>
                <div className="content-text">{note.subjective}</div>
              </div>
            )}
            {note.objective && (
              <div className="content-section">
                <h3>Objective</h3>
                <div className="content-text">{note.objective}</div>
              </div>
            )}
            {note.assessment && (
              <div className="content-section">
                <h3>Assessment</h3>
                <div className="content-text">{note.assessment}</div>
              </div>
            )}
            {note.plan && (
              <div className="content-section">
                <h3>Plan</h3>
                <div className="content-text">{note.plan}</div>
              </div>
            )}
            {note.interventions && (
              <div className="content-section">
                <h3>Interventions</h3>
                <div className="content-text">{note.interventions}</div>
              </div>
            )}
            {note.clientResponse && (
              <div className="content-section">
                <h3>Client Response</h3>
                <div className="content-text">{note.clientResponse}</div>
              </div>
            )}
          </div>
        )}

        {note.signature && (
          <div className="signature-section">
            <strong>Digital Signature:</strong> {note.signature}
          </div>
        )}
      </div>
    </div>
  );
}
