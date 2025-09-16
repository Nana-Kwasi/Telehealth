import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, 
  Search, 
  Filter, 
  FileText, 
  Mic, 
  MicOff, 
  Save, 
  Edit, 
  Eye, 
  Download, 
  Upload,
  Clock,
  User,
  Calendar,
  CheckCircle,
  AlertCircle,
  FileSignature,
  History,
  Users,
  Settings
} from 'lucide-react';
import { auth, db } from '../../Auth/firebaseConfig';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  limit, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  getDocs,
  serverTimestamp 
} from 'firebase/firestore';
import './Notes.css';

export default function TherapistNotes() {
  const [notes, setNotes] = useState([]);
  const [clients, setClients] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedNote, setSelectedNote] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingText, setRecordingText] = useState('');
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [audioChunks, setAudioChunks] = useState([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState('soap');
  const [showClientSelection, setShowClientSelection] = useState(false);
  const [selectedClients, setSelectedClients] = useState([]);
  const [allClients, setAllClients] = useState([]);
  const [noteForm, setNoteForm] = useState({
    clientId: '',
    sessionDate: new Date().toISOString().split('T')[0],
    noteType: 'soap',
    subjective: '',
    objective: '',
    assessment: '',
    plan: '',
    interventions: '',
    clientResponse: '',
    moodRating: '',
    riskAssessment: '',
    nextSteps: '',
    signature: '',
    isDraft: true,
    visibleToClient: false,
    // Therapy Book fields
    bookTitle: '',
    author: '',
    description: '',
    coverImage: '',
    tableOfContents: '',
    chapters: '',
    targetAudience: 'all',
    difficultyLevel: 'beginner',
    estimatedReadingTime: '',
    keyTopics: '',
    exercises: '',
    resources: '',
    bibliography: '',
    shareWithAllClients: false,
    selectedClients: []
  });

  const currentUser = auth.currentUser;
  const fileInputRef = useRef(null);

  // Fetch notes and clients
  useEffect(() => {
    if (!currentUser) return;

    // Fetch clinical notes (simplified query to avoid index requirements)
    const notesQuery = query(
      collection(db, 'clinicalNotes'),
      where('therapistId', '==', currentUser.uid)
    );

    const notesUnsub = onSnapshot(notesQuery, (snap) => {
      const notesData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
        .sort((a, b) => {
          const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt);
          const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt);
          return dateB - dateA;
        });
      setNotes(prevNotes => [...notesData, ...prevNotes.filter(note => note.noteType === 'therapyBook')]);
    }, (error) => {
      console.error('Error fetching clinical notes:', error);
      // Fallback: try to fetch without ordering
      try {
        const fallbackQuery = query(collection(db, 'clinicalNotes'));
        onSnapshot(fallbackQuery, (snap) => {
          const notesData = snap.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(note => note.therapistId === currentUser.uid)
            .sort((a, b) => {
              const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt);
              const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt);
              return dateB - dateA;
            });
          setNotes(prevNotes => [...notesData, ...prevNotes.filter(note => note.noteType === 'therapyBook')]);
        });
      } catch (fallbackError) {
        console.error('Fallback query also failed:', fallbackError);
      }
    });

    // Fetch therapy books (simplified query to avoid index requirements)
    const booksQuery = query(
      collection(db, 'therapyBooks'),
      where('therapistId', '==', currentUser.uid)
    );

    const booksUnsub = onSnapshot(booksQuery, (snap) => {
      const booksData = snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        noteType: 'therapyBook'
      }))
        .sort((a, b) => {
          const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt);
          const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt);
          return dateB - dateA;
        });
      setNotes(prevNotes => [...prevNotes.filter(note => note.noteType !== 'therapyBook'), ...booksData]);
    }, (error) => {
      console.error('Error fetching therapy books:', error);
      // Fallback: try to fetch without ordering
      try {
        const fallbackQuery = query(collection(db, 'therapyBooks'));
        onSnapshot(fallbackQuery, (snap) => {
          const booksData = snap.docs
            .map(doc => ({
              id: doc.id,
              ...doc.data(),
              noteType: 'therapyBook'
            }))
            .filter(book => book.therapistId === currentUser.uid)
            .sort((a, b) => {
              const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt);
              const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt);
              return dateB - dateA;
            });
          setNotes(prevNotes => [...prevNotes.filter(note => note.noteType !== 'therapyBook'), ...booksData]);
        });
      } catch (fallbackError) {
        console.error('Fallback query also failed:', fallbackError);
      }
    });

    // Fetch clients
    const clientsQuery = query(
      collection(db, 'therapists', currentUser.uid, 'clients')
    );

    const clientsUnsub = onSnapshot(clientsQuery, async (snap) => {
      const clientIds = snap.docs.map(doc => doc.data().clientId);
      const clientPromises = clientIds.map(async (clientId) => {
        const clientDoc = await getDocs(query(collection(db, 'clients'), where('__name__', '==', clientId)));
        if (!clientDoc.empty) {
          return { id: clientId, ...clientDoc.docs[0].data() };
        }
        return null;
      });
      const clientData = await Promise.all(clientPromises);
      setClients(clientData.filter(Boolean));
    });

    // Fetch all clients for admin users (for client selection)
    const allClientsQuery = query(collection(db, 'clients'));
    const allClientsUnsub = onSnapshot(allClientsQuery, (snap) => {
      const allClientsData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAllClients(allClientsData);
    });

    return () => {
      notesUnsub();
      booksUnsub();
      clientsUnsub();
      allClientsUnsub();
    };
  }, [currentUser]);

  // Voice recording functionality
  const startRecording = async () => {
    alert('Voice-to-text recording feature is not yet implemented. This feature will be available in a future update.');
  };

  const stopRecording = () => {
    // Placeholder function
  };

  // Note templates
  const templates = {
    soap: {
      name: 'SOAP Note',
      fields: ['subjective', 'objective', 'assessment', 'plan']
    },
    progress: {
      name: 'Progress Note',
      fields: ['interventions', 'clientResponse', 'moodRating', 'nextSteps']
    },
    risk: {
      name: 'Risk Assessment',
      fields: ['riskAssessment', 'safetyPlan', 'interventions', 'followUp']
    },
    discharge: {
      name: 'Discharge Summary',
      fields: ['treatmentSummary', 'goalsAchieved', 'recommendations', 'followUp']
    },
    therapyBook: {
      name: 'Therapy Book',
      fields: ['bookTitle', 'author', 'description', 'coverImage', 'tableOfContents', 'chapters', 'targetAudience', 'difficultyLevel', 'estimatedReadingTime', 'keyTopics', 'exercises', 'resources', 'bibliography']
    }
  };

  const handleCreateNote = async () => {
    try {
      // Get the template for the selected note type
      const template = templates[noteForm.noteType];
      
      // Create base note data with only relevant fields
      const noteData = {
        therapistId: currentUser.uid,
        therapistName: currentUser.displayName || 'Therapist',
        noteType: noteForm.noteType,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        version: 1
      };

      // Add template-specific fields
      if (template && template.fields) {
        template.fields.forEach(field => {
          if (noteForm[field] !== undefined) {
            noteData[field] = noteForm[field];
          }
        });
      }

      // Add common fields based on note type
      if (noteForm.noteType !== 'therapyBook') {
        noteData.clientId = noteForm.clientId;
        noteData.sessionDate = noteForm.sessionDate;
        noteData.signature = noteForm.signature;
        noteData.visibleToClient = noteForm.visibleToClient;
      } else {
        // Therapy book specific fields
        noteData.bookTitle = noteForm.bookTitle;
        noteData.author = noteForm.author;
        noteData.description = noteForm.description;
        noteData.coverImage = noteForm.coverImage;
        noteData.targetAudience = noteForm.targetAudience;
        noteData.difficultyLevel = noteForm.difficultyLevel;
        noteData.estimatedReadingTime = noteForm.estimatedReadingTime;
        noteData.tableOfContents = noteForm.tableOfContents;
        noteData.chapters = noteForm.chapters;
        noteData.keyTopics = noteForm.keyTopics;
        noteData.exercises = noteForm.exercises;
        noteData.resources = noteForm.resources;
        noteData.bibliography = noteForm.bibliography;
        
        // Add selected clients if target audience is specific
        if (noteForm.targetAudience === 'specific') {
          noteData.assignedClients = selectedClients.map(client => client.id);
        }
      }

      // Determine collection based on note type
      let collectionName = 'clinicalNotes';
      
      if (noteForm.noteType === 'therapyBook') {
        collectionName = 'therapyBooks';
      } else {
        // For regular notes, ensure client visibility is handled
        if (noteForm.visibleToClient && noteForm.clientId) {
          // Also save a copy to notes collection for client access
          const clientNoteData = {
            therapistId: currentUser.uid,
            therapistName: currentUser.displayName || 'Therapist',
            clientId: noteForm.clientId,
            clientName: clients.find(c => c.id === noteForm.clientId)?.name || 'Client',
            noteType: noteForm.noteType,
            title: noteForm.noteType.charAt(0).toUpperCase() + noteForm.noteType.slice(1) + ' Note',
            noteContent: Object.keys(template?.fields || {}).reduce((content, field) => {
              if (noteForm[field]) {
                content += `${field.charAt(0).toUpperCase() + field.slice(1)}: ${noteForm[field]}\n\n`;
              }
              return content;
            }, ''),
            sessionDate: noteForm.sessionDate,
            createdAt: serverTimestamp()
          };
          
          await addDoc(collection(db, 'notes'), clientNoteData);
        }
      }

      await addDoc(collection(db, collectionName), noteData);
      setShowCreateModal(false);
      resetForm();
    } catch (error) {
      console.error('Error creating note:', error);
      alert('Error creating note. Please try again.');
    }
  };

  const handleUpdateNote = async () => {
    try {
      const noteData = {
        ...noteForm,
        updatedAt: serverTimestamp(),
        version: (selectedNote?.version || 1) + 1
      };

      await updateDoc(doc(db, 'clinicalNotes', selectedNote.id), noteData);
      setShowEditModal(false);
      setSelectedNote(null);
      resetForm();
    } catch (error) {
      console.error('Error updating note:', error);
      alert('Error updating note. Please try again.');
    }
  };

  const handleDeleteNote = async (noteId) => {
    if (window.confirm('Are you sure you want to delete this note?')) {
      try {
        await deleteDoc(doc(db, 'clinicalNotes', noteId));
      } catch (error) {
        console.error('Error deleting note:', error);
        alert('Error deleting note. Please try again.');
      }
    }
  };

  const resetForm = () => {
    setNoteForm({
      clientId: '',
      sessionDate: new Date().toISOString().split('T')[0],
      noteType: 'soap',
      subjective: '',
      objective: '',
      assessment: '',
      plan: '',
      interventions: '',
      clientResponse: '',
      moodRating: '',
      riskAssessment: '',
      nextSteps: '',
      signature: '',
      isDraft: true,
      visibleToClient: false,
      // Therapy Book fields
      bookTitle: '',
      author: '',
      description: '',
      coverImage: '',
      tableOfContents: '',
      chapters: '',
      targetAudience: 'all',
      difficultyLevel: 'beginner',
      estimatedReadingTime: '',
      keyTopics: '',
      exercises: '',
      resources: '',
      bibliography: '',
      shareWithAllClients: false,
      selectedClients: []
    });
    setSelectedClients([]);
  };

  const openEditModal = (note) => {
    setSelectedNote(note);
    setNoteForm({
      clientId: note.clientId || '',
      sessionDate: note.sessionDate || '',
      noteType: note.noteType || 'soap',
      subjective: note.subjective || '',
      objective: note.objective || '',
      assessment: note.assessment || '',
      plan: note.plan || '',
      interventions: note.interventions || '',
      clientResponse: note.clientResponse || '',
      moodRating: note.moodRating || '',
      riskAssessment: note.riskAssessment || '',
      nextSteps: note.nextSteps || '',
      signature: note.signature || '',
      isDraft: note.isDraft || false
    });
    setShowEditModal(true);
  };

  const filteredNotes = notes.filter(note => {
    const matchesSearch = note.clientName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         note.subjective?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         note.objective?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filterType === 'all' || note.noteType === filterType;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="notes-dashboard">
      <div className="notes-header">
        <div className="header-content">
          <h1 className="page-title">Clinical Notes & Documentation</h1>
          <p className="subtitle">Create, manage, and track clinical notes with templates and voice-to-text</p>
        </div>
        <div className="header-actions">
          <button 
            className="btn-secondary"
            onClick={() => setShowTemplates(!showTemplates)}
          >
            <Settings size={16} />
            Templates
          </button>
          <button 
            className="btn-primary"
            onClick={() => setShowCreateModal(true)}
          >
            <Plus size={16} />
            New Note
          </button>
        </div>
      </div>

      {/* Template Library */}
      {showTemplates && (
        <div className="templates-section">
          <h3>Note Templates</h3>
          <div className="templates-grid">
            {Object.entries(templates).map(([key, template]) => (
              <div key={key} className="template-card">
                <h4>{template.name}</h4>
                <p>Fields: {template.fields.join(', ')}</p>
                <button 
                  className="btn-primary small"
                  onClick={() => {
                    setNoteForm(prev => ({ ...prev, noteType: key }));
                    setShowTemplates(false);
                    setShowCreateModal(true);
                  }}
                >
                  Use Template
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search and Filters */}
      <div className="notes-controls">
        <div className="search-section">
          <div className="search-input">
            <Search size={20} />
            <input
              type="text"
              placeholder="Search notes by client name or content..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
        <div className="filter-section">
          <Filter size={16} />
                                <select
                        value={filterType}
                        onChange={(e) => setFilterType(e.target.value)}
                      >
                        <option value="all">All Notes</option>
                        <option value="soap">SOAP Notes</option>
                        <option value="progress">Progress Notes</option>
                        <option value="risk">Risk Assessments</option>
                        <option value="discharge">Discharge Summaries</option>
                        <option value="therapyBook">Therapy Books</option>
                      </select>
        </div>
        </div>
        
      {/* Notes List */}
        <div className="notes-list">
        {filteredNotes.map((note) => (
          <div key={note.id} className="note-card">
            <div className="note-header">
              <div className="note-info">
                <h3 className="note-title">
                  {note.clientName || 'Unknown Client'} - {templates[note.noteType]?.name || 'Note'}
                </h3>
                <div className="note-meta">
                  <span className="note-date">
                    <Calendar size={14} />
                    {new Date(note.sessionDate).toLocaleDateString()}
                  </span>
                  <span className="note-status">
                    {note.isDraft ? (
                      <AlertCircle size={14} className="draft" />
                    ) : (
                      <CheckCircle size={14} className="completed" />
                    )}
                    {note.isDraft ? 'Draft' : 'Completed'}
                  </span>
                </div>
              </div>
              <div className="note-actions">
                <button 
                  className="btn-icon"
                  onClick={() => openEditModal(note)}
                  title="Edit Note"
                >
                  <Edit size={16} />
                </button>
                <button 
                  className="btn-icon"
                  onClick={() => {
                    setSelectedNote(note);
                    // Open view modal
                  }}
                  title="View Note"
                >
                  <Eye size={16} />
                </button>
                <button 
                  className="btn-icon danger"
                  onClick={() => handleDeleteNote(note.id)}
                  title="Delete Note"
                >
                  <FileText size={16} />
                </button>
              </div>
            </div>
                                    <div className="note-preview">
                          {note.noteType === 'therapyBook' ? (
                            <>
                              {note.bookTitle && (
                                <div className="preview-section">
                                  <strong>Book Title:</strong> {note.bookTitle}
                                </div>
                              )}
                              {note.author && (
                                <div className="preview-section">
                                  <strong>Author:</strong> {note.author}
                                </div>
                              )}
                              {note.description && (
                                <div className="preview-section">
                                  <strong>Description:</strong> {note.description.substring(0, 150)}...
                                </div>
                              )}
                              {note.targetAudience && (
                                <div className="preview-section">
                                  <strong>Target Audience:</strong> {note.targetAudience}
                                </div>
                              )}
                            </>
                          ) : (
                            <>
                              {note.subjective && (
                                <div className="preview-section">
                                  <strong>Subjective:</strong> {note.subjective.substring(0, 100)}...
                                </div>
                              )}
                              {note.objective && (
                                <div className="preview-section">
                                  <strong>Objective:</strong> {note.objective.substring(0, 100)}...
                                </div>
                              )}
                              {note.assessment && (
                                <div className="preview-section">
                                  <strong>Assessment:</strong> {note.assessment.substring(0, 100)}...
                                </div>
                              )}
                            </>
                          )}
                        </div>
          </div>
        ))}
      </div>

      {/* Create/Edit Note Modal */}
      {(showCreateModal || showEditModal) && (
        <div className="modal-overlay" onClick={() => {
          setShowCreateModal(false);
          setShowEditModal(false);
          setSelectedNote(null);
          resetForm();
        }}>
          <div className="modal-content large" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
              <h2>
                {showCreateModal 
                  ? `Create New ${templates[noteForm.noteType]?.name || 'Note'}` 
                  : `Edit ${templates[noteForm.noteType]?.name || 'Note'}`}
              </h2>
              <button
                className="close-button"
                onClick={() => {
                  setShowCreateModal(false);
                  setShowEditModal(false);
                  setSelectedNote(null);
                  resetForm();
                }}
              >
                ×
              </button>
            </div>
            
            <div className="modal-body">
              {/* Note Form */}
              <div className="note-form">
                <div className="form-row">
                  <div className="form-group">
                    <label>Note Type</label>
                    <select
                      value={noteForm.noteType}
                      onChange={(e) => setNoteForm(prev => ({ ...prev, noteType: e.target.value }))}
                    >
                      {Object.entries(templates).map(([key, template]) => (
                        <option key={key} value={key}>{template.name}</option>
                      ))}
                    </select>
                  </div>
                  {noteForm.noteType !== 'therapyBook' && (
                    <>
                      <div className="form-group">
                        <label>Client</label>
                        <select
                          value={noteForm.clientId}
                          onChange={(e) => setNoteForm(prev => ({ ...prev, clientId: e.target.value }))}
                        >
                          <option value="">Select Client</option>
                          {clients.map(client => (
                            <option key={client.id} value={client.id}>
                              {client.name || client.email}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="form-group">
                        <label>Session Date</label>
                        <input
                          type="date"
                          value={noteForm.sessionDate}
                          onChange={(e) => setNoteForm(prev => ({ ...prev, sessionDate: e.target.value }))}
                        />
                      </div>
                    </>
                  )}
                </div>


                            {/* Dynamic Form Fields Based on Template - Only for regular notes */}
            {noteForm.noteType !== 'therapyBook' && templates[noteForm.noteType]?.fields.map(field => (
              <div key={field} className="form-group">
                <label>{field.charAt(0).toUpperCase() + field.slice(1)}</label>
                <textarea
                  value={noteForm[field] || ''}
                  onChange={(e) => setNoteForm(prev => ({ ...prev, [field]: e.target.value }))}
                  placeholder={`Enter ${field} information...`}
                  rows={4}
                />
              </div>
            ))}

                {/* Digital Signature */}
                <div className="form-group">
                  <label>Digital Signature</label>
                  <input
                    type="text"
                    value={noteForm.signature}
                    onChange={(e) => setNoteForm(prev => ({ ...prev, signature: e.target.value }))}
                    placeholder="Enter your digital signature"
                  />
                </div>

                {/* Client Visibility (for regular notes) */}
                {noteForm.noteType !== 'therapyBook' && (
                  <div className="form-group checkbox-group">
                    <label>
                      <input
                        type="checkbox"
                        checked={noteForm.visibleToClient}
                        onChange={(e) => setNoteForm(prev => ({ ...prev, visibleToClient: e.target.checked }))}
                      />
                      Make visible to client
                    </label>
                  </div>
                )}

                {/* Therapy Book specific fields */}
                {noteForm.noteType === 'therapyBook' && (
                  <>
                    <div className="form-group">
                      <label>Book Title</label>
                      <input
                        type="text"
                        value={noteForm.bookTitle}
                        onChange={(e) => setNoteForm(prev => ({ ...prev, bookTitle: e.target.value }))}
                        placeholder="Enter the book title"
                      />
                    </div>

                    <div className="form-group">
                      <label>Author</label>
                      <input
                        type="text"
                        value={noteForm.author}
                        onChange={(e) => setNoteForm(prev => ({ ...prev, author: e.target.value }))}
                        placeholder="Enter author name"
                      />
                    </div>

                    <div className="form-group">
                      <label>Book Description</label>
                      <textarea
                        value={noteForm.description}
                        onChange={(e) => setNoteForm(prev => ({ ...prev, description: e.target.value }))}
                        placeholder="Describe what this book is about and who it's for"
                        rows={3}
                      />
                    </div>

                    <div className="form-group">
                      <label>Cover Image</label>
                      <div className="file-upload-section">
                        <input
                          type="file"
                          ref={fileInputRef}
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files[0];
                            if (file) {
                              setNoteForm(prev => ({ ...prev, coverImage: file.name }));
                            }
                          }}
                          style={{ display: 'none' }}
                        />
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          <Upload size={16} />
                          Choose Cover Image
                        </button>
                        {noteForm.coverImage && (
                          <span className="file-selected">
                            Selected: {noteForm.coverImage}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="form-row">
                      <div className="form-group">
                        <label>Target Audience</label>
                        <select
                          value={noteForm.targetAudience}
                          onChange={(e) => setNoteForm(prev => ({ ...prev, targetAudience: e.target.value }))}
                        >
                          <option value="all">All Clients</option>
                          <option value="individuals">Individuals</option>
                          <option value="teen">Teen</option>
                          <option value="couples">Couples</option>
                          <option value="specific">Specific Clients</option>
                        </select>
                      </div>
                      <div className="form-group">
                        <label>Difficulty Level</label>
                        <select
                          value={noteForm.difficultyLevel}
                          onChange={(e) => setNoteForm(prev => ({ ...prev, difficultyLevel: e.target.value }))}
                        >
                          <option value="beginner">Beginner</option>
                          <option value="intermediate">Intermediate</option>
                          <option value="advanced">Advanced</option>
                        </select>
                      </div>
                      <div className="form-group">
                        <label>Estimated Reading Time</label>
                        <input
                          type="text"
                          value={noteForm.estimatedReadingTime}
                          onChange={(e) => setNoteForm(prev => ({ ...prev, estimatedReadingTime: e.target.value }))}
                          placeholder="e.g., 2-3 hours, 1 week"
                        />
                      </div>
                    </div>

                    {/* Client Selection for Specific Clients */}
                    {noteForm.targetAudience === 'specific' && (
                      <div className="form-group">
                        <label>Selected Clients</label>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => setShowClientSelection(true)}
                        >
                          <Users size={16} />
                          Choose Clients ({selectedClients.length} selected)
                        </button>
                        {selectedClients.length > 0 && (
                          <div className="selected-clients">
                            <h4>Selected Clients:</h4>
                            <div className="client-list">
                              {selectedClients.map(client => (
                                <div key={client.id} className="client-item">
                                  <span>{client.name || client.email}</span>
                                  <button
                                    type="button"
                                    onClick={() => setSelectedClients(prev => prev.filter(c => c.id !== client.id))}
                                    className="remove-client-btn"
                                  >
                                    ×
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="form-group">
                      <label>Table of Contents</label>
                      <textarea
                        value={noteForm.tableOfContents}
                        onChange={(e) => setNoteForm(prev => ({ ...prev, tableOfContents: e.target.value }))}
                        placeholder="List all chapters and sections (e.g., Chapter 1: Understanding Anxiety, Chapter 2: Coping Strategies...)"
                        rows={4}
                      />
                    </div>

                    <div className="form-group">
                      <label>Chapters Content</label>
                      <textarea
                        value={noteForm.chapters}
                        onChange={(e) => setNoteForm(prev => ({ ...prev, chapters: e.target.value }))}
                        placeholder="Write the main content of your book chapters here. You can structure this as you prefer - by chapters, sections, or topics."
                        rows={8}
                      />
                    </div>

                    <div className="form-group">
                      <label>Key Topics Covered</label>
                      <textarea
                        value={noteForm.keyTopics}
                        onChange={(e) => setNoteForm(prev => ({ ...prev, keyTopics: e.target.value }))}
                        placeholder="List the main topics, concepts, and themes covered in this book"
                        rows={3}
                      />
                    </div>

                    <div className="form-group">
                      <label>Exercises & Activities</label>
                      <textarea
                        value={noteForm.exercises}
                        onChange={(e) => setNoteForm(prev => ({ ...prev, exercises: e.target.value }))}
                        placeholder="Include any exercises, worksheets, or activities for clients to practice"
                        rows={4}
                      />
                    </div>

                    <div className="form-group">
                      <label>Additional Resources</label>
                      <textarea
                        value={noteForm.resources}
                        onChange={(e) => setNoteForm(prev => ({ ...prev, resources: e.target.value }))}
                        placeholder="List any additional resources, websites, apps, or tools that complement this book"
                        rows={3}
                      />
                    </div>

                    <div className="form-group">
                      <label>Bibliography & References</label>
                      <textarea
                        value={noteForm.bibliography}
                        onChange={(e) => setNoteForm(prev => ({ ...prev, bibliography: e.target.value }))}
                        placeholder="List any references, citations, or sources used in creating this book"
                        rows={3}
                      />
                    </div>

                  </>
                )}

              </div>
            </div>

            <div className="modal-footer">
              <button 
                className="btn-secondary"
                onClick={() => {
                  setShowCreateModal(false);
                  setShowEditModal(false);
                  setSelectedNote(null);
                  resetForm();
                }}
              >
                Cancel
              </button>
                            <button
                className="btn-primary"
                onClick={showCreateModal ? handleCreateNote : handleUpdateNote}
              >
                <Save size={16} />
                {showCreateModal 
                  ? `Create ${templates[noteForm.noteType]?.name || 'Note'}` 
                  : `Update ${templates[noteForm.noteType]?.name || 'Note'}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Client Selection Modal */}
      {showClientSelection && (
        <div className="modal-overlay" onClick={() => setShowClientSelection(false)}>
          <div className="modal-content large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Select Clients</h2>
              <button 
                className="close-button"
                onClick={() => setShowClientSelection(false)}
              >
                ×
              </button>
            </div>
            
            <div className="modal-body">
              <div className="client-selection">
                <div className="search-section">
                  <Search size={20} />
                  <input
                    type="text"
                    placeholder="Search clients..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                
                {/* Assigned Clients Section */}
                <div className="client-group">
                  <h3>My Assigned Clients</h3>
                  <div className="clients-list">
                    {clients
                      .filter(client => 
                        client.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        client.email?.toLowerCase().includes(searchQuery.toLowerCase())
                      )
                      .map(client => (
                        <div key={client.id} className="client-item assigned">
                          <label>
                            <input
                              type="checkbox"
                              checked={selectedClients.some(c => c.id === client.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedClients(prev => [...prev, client]);
                                } else {
                                  setSelectedClients(prev => prev.filter(c => c.id !== client.id));
                                }
                              }}
                            />
                            <div className="client-info">
                              <span className="client-name">{client.name || client.email}</span>
                              {client.email && <span className="client-email">{client.email}</span>}
                              <span className="client-badge">Assigned</span>
                            </div>
                          </label>
                        </div>
                      ))}
                    {clients.filter(client => 
                      client.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                      client.email?.toLowerCase().includes(searchQuery.toLowerCase())
                    ).length === 0 && (
                      <div className="no-clients">No assigned clients found</div>
                    )}
                  </div>
                </div>

                {/* Other Clients Section */}
                <div className="client-group">
                  <h3>Other Clients</h3>
                  <div className="clients-list">
                    {allClients
                      .filter(client => 
                        !clients.some(assignedClient => assignedClient.id === client.id) &&
                        (client.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         client.email?.toLowerCase().includes(searchQuery.toLowerCase()))
                      )
                      .map(client => (
                        <div key={client.id} className="client-item other">
                          <label>
                            <input
                              type="checkbox"
                              checked={selectedClients.some(c => c.id === client.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedClients(prev => [...prev, client]);
                                } else {
                                  setSelectedClients(prev => prev.filter(c => c.id !== client.id));
                                }
                              }}
                            />
                            <div className="client-info">
                              <span className="client-name">{client.name || client.email}</span>
                              {client.email && <span className="client-email">{client.email}</span>}
                              <span className="client-badge other">Not Assigned</span>
                            </div>
                          </label>
                        </div>
                      ))}
                    {allClients.filter(client => 
                      !clients.some(assignedClient => assignedClient.id === client.id) &&
                      (client.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                       client.email?.toLowerCase().includes(searchQuery.toLowerCase()))
                    ).length === 0 && (
                      <div className="no-clients">No other clients found</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
            
            <div className="modal-footer">
              <button 
                className="btn-secondary"
                onClick={() => setShowClientSelection(false)}
              >
                Cancel
              </button>
              <button 
                className="btn-primary"
                onClick={() => setShowClientSelection(false)}
              >
                Save Selection ({selectedClients.length} selected)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


