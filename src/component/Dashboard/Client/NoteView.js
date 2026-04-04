import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../../Auth/firebaseConfig';
import { doc, getDoc } from 'firebase/firestore';
import { ArrowLeft } from 'lucide-react';
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
        <h1 className="page-title">{note.title || 'Note'}</h1>
      </div>

      <div className="note-content">
        <div className="note-meta">
          <div className="meta-item">
            <strong>Date:</strong> {getNoteDate()}
          </div>
          {note.category && (
            <div className="meta-item">
              <strong>Category:</strong> {note.category}
            </div>
          )}
        </div>

        {note.content && (
          <div className="note-body">
            <div className="content-text">{note.content}</div>
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
