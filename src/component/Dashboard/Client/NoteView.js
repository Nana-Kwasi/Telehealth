import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../../../services/firestoreShim';
import { doc, getDoc } from '../../../services/firestoreShim';
import { ArrowLeft } from 'lucide-react';
import { getNoteSections, noteTypeLabel } from '../../../utils/noteSections';
import './NoteView.css';

export default function NoteView() {
  const { noteId } = useParams();
  const navigate = useNavigate();
  const [note, setNote] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchNote = async () => {
      try {
        const noteDoc = await getDoc(doc(db, 'clientNotes', noteId));
        if (noteDoc.exists()) {
          setNote({ id: noteDoc.id, ...noteDoc.data() });
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
        <button onClick={() => navigate('/dashboard/resources')} className="btn-primary">
          Back to Resources
        </button>
      </div>
    );
  }

  const sections = getNoteSections(note);

  const getNoteDate = () => {
    if (note.createdAt?.toDate) {
      return note.createdAt.toDate().toLocaleDateString();
    }
    return new Date(note.createdAt).toLocaleDateString();
  };

  return (
    <div className="page-container note-view-page">
      <div className="page-header">
        <button onClick={() => navigate('/dashboard/resources')} className="back-button">
          <ArrowLeft size={20} />
          Back to Resources
        </button>
        <h1 className="page-title">{note.title || noteTypeLabel(note)}</h1>
      </div>

      <div className="note-content">
        <div className="note-meta">
          <div className="meta-item">
            <strong>Date:</strong> {getNoteDate()}
          </div>
          <div className="meta-item">
            <strong>Type:</strong> {noteTypeLabel(note)}
          </div>
          {note.therapistName && (
            <div className="meta-item">
              <strong>Therapist:</strong> {note.therapistName}
            </div>
          )}
          {note.category && (
            <div className="meta-item">
              <strong>Category:</strong> {note.category}
            </div>
          )}
        </div>

        {/* The real content lives in structuredData, not `content` — rendering
            only `content` left this page blank for every SOAP note. */}
        {sections.length > 0 ? (
          <div className="note-body">
            {sections.map((s) => (
              <section key={s.key} className="note-section">
                <h3 className="note-section-label">{s.label}</h3>
                <p className="content-text">{s.value}</p>
              </section>
            ))}
          </div>
        ) : (
          <div className="note-body">
            <p className="content-text note-empty">This note has no content yet.</p>
          </div>
        )}

        {note.attachments && note.attachments.length > 0 && (
          <div className="note-attachments">
            <h3>Attachments</h3>
            <div className="attachments-list">
              {note.attachments.map((attachment, index) => (
                <a 
                  key={index} 
                  href={attachment.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="attachment-link"
                >
                  {attachment.name || `Attachment ${index + 1}`}
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
