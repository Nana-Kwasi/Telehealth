import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../../../services/firestoreShim';
import './Resources.css';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  doc,
  updateDoc,
  serverTimestamp
} from '../../../services/firestoreShim';
import { 
  BookOpen, 
  FileText, 
  Video, 
  Download, 
  Star, 
  Clock, 
  User, 
  Search,
  Grid,
  List,
  Heart,
  Share2,
  Eye,
  Play,
  ClipboardList,
  CheckCircle,
  Send,
  Target,
  AlertCircle
} from 'lucide-react';
import { downloadNotePdf, downloadResourcePdf } from '../../../utils/brandedPdf';
import { hydrateBookContent } from '../../../utils/noteSections';
import ResourceMedia from '../../Common/ResourceMedia';

/** Tags may be an array or a comma-separated string, depending on where saved. */
function toTagList(tags) {
  if (Array.isArray(tags)) return tags.filter(Boolean);
  if (typeof tags === 'string') return tags.split(',').map((t) => t.trim()).filter(Boolean);
  return [];
}

export default function ClientResources() {
  const navigate = useNavigate();
  const [resources, setResources] = useState([]);
  const [worksheets, setWorksheets] = useState([]);
  const [notes, setNotes] = useState([]);
  const [filteredResources, setFilteredResources] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('resources');
  const [viewMode, setViewMode] = useState('grid');
  const [isLoading, setIsLoading] = useState(true);
  const [favorites, setFavorites] = useState([]);
  const [showWorksheetModal, setShowWorksheetModal] = useState(false);
  const [selectedWorksheet, setSelectedWorksheet] = useState(null);
  const [worksheetResponses, setWorksheetResponses] = useState({});
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [selectedNote, setSelectedNote] = useState(null);
  const [showResourceModal, setShowResourceModal] = useState(false);
  const [selectedResource, setSelectedResource] = useState(null);

  const currentUser = auth.currentUser;

  const categories = [
    { id: 'resources', name: 'Resources', icon: BookOpen },
    { id: 'notes', name: 'Notes', icon: FileText },
    { id: 'worksheets', name: 'Worksheets', icon: Download }
  ];


  // Fetch resources function
  const fetchAssignedResources = async () => {
      try {
        if (!currentUser) return;

        const allResources = [];

        // Fetch public resources
        try {
        const publicResourcesQuery = query(
          collection(db, 'resources'),
            where('isPublic', '==', true)
        );
        const publicSnapshot = await getDocs(publicResourcesQuery);
        const publicResources = publicSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          type: 'public'
        }));
        allResources.push(...publicResources);
        } catch (error) {
          console.log('Public resources query failed:', error);
          // Skip public resources if query fails
        }

        // Fetch resources assigned to this client
        const assignedClientId = localStorage.getItem('th.clientId') || currentUser.uid;
        try {
        const assignedResourcesQuery = query(
          collection(db, 'therapistResources')
        );
        const assignedSnapshot = await getDocs(assignedResourcesQuery);
        
        // Filter resources based on target audience
        const assignedResources = assignedSnapshot.docs
          .map(doc => ({ id: doc.id, ...doc.data() }))
          .filter(resource => {
            // Check if resource is assigned to this specific client
            if (resource.assignedClients && resource.assignedClients.includes(assignedClientId)) {
              return true;
            }
            
            // Check target audience filtering
            if (resource.targetAudience === 'all') {
              return true;
            }
            
            if (resource.targetAudience === 'specific' && resource.assignedClients?.includes(assignedClientId)) {
              return true;
            }
            
            // For individual/teen/couples, we need to check client's therapy type
            // This would require fetching client data - for now, we'll include all
            if (['individuals', 'teen', 'couples'].includes(resource.targetAudience)) {
              return true;
            }
            
            return false;
          })
          .map(resource => ({
            ...resource,
            type: 'resource'
          }));
        
        allResources.push(...assignedResources);
        } catch (error) {
          console.log('Assigned resources query failed:', error);
          // Skip assigned resources if query fails
        }

        // Remove duplicates and sort by creation date
        const uniqueResources = allResources.filter((resource, index, self) => 
          index === self.findIndex(r => r.id === resource.id)
        );
        
        uniqueResources.sort((a, b) => {
          const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt);
          const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt);
          return dateB - dateA;
        });

        setResources(uniqueResources);

        // Fetch assigned worksheets
        const worksheetClientId = localStorage.getItem('th.clientId') || currentUser.uid;
        
        let assignedWorksheets = [];
        
        try {
          // First try: Simple query without compound filters
          const simpleWorksheetsQuery = query(
            collection(db, 'worksheets'),
            where('assignedTo', 'array-contains', worksheetClientId)
          );
          const worksheetsSnapshot = await getDocs(simpleWorksheetsQuery);
          
          // Filter client-side for active status and sort by date
          assignedWorksheets = worksheetsSnapshot.docs
            .filter(doc => {
              const data = doc.data();
              // Worksheets are saved as 'assigned' (and 'submitted'/'completed'
              // once worked on). Requiring 'active' — a status nothing ever
              // writes — meant the client saw none of them. Exclude only the
              // states that genuinely shouldn't reach a client.
              const status = String(data.status || 'assigned').toLowerCase();
              return !['template', 'archived', 'deleted'].includes(status);
            })
            .sort((a, b) => {
              const dateA = a.data().dateCreated?.toDate ? a.data().dateCreated.toDate() : new Date(a.data().dateCreated);
              const dateB = b.data().dateCreated?.toDate ? b.data().dateCreated.toDate() : new Date(b.data().dateCreated);
              return dateB - dateA;
            })
            .map(doc => {
              const data = doc.data();
              return {
                id: doc.id,
                ...data,
                type: 'worksheet'
              };
            });
        } catch (error) {
          console.log('Simple query also failed, trying fallback:', error);
          // Fallback: fetch all worksheets and filter client-side
          const allWorksheetsQuery = query(collection(db, 'worksheets'));
          const allWorksheetsSnapshot = await getDocs(allWorksheetsQuery);
          
          assignedWorksheets = allWorksheetsSnapshot.docs
            .filter(doc => {
              const data = doc.data();
              return data.assignedTo && 
                     data.assignedTo.includes(worksheetClientId) && 
                     data.status === 'active';
            })
            .sort((a, b) => {
              const dateA = a.data().dateCreated?.toDate ? a.data().dateCreated.toDate() : new Date(a.data().dateCreated);
              const dateB = b.data().dateCreated?.toDate ? b.data().dateCreated.toDate() : new Date(b.data().dateCreated);
              return dateB - dateA;
            })
            .map(doc => {
              const data = doc.data();
              return {
                id: doc.id,
                ...data,
                type: 'worksheet'
              };
            });
        }
        
        setWorksheets(assignedWorksheets);

        // Fetch notes for this client
        let assignedNotes = [];
        try {
          // Fetch clinical notes assigned to this client
          const clinicalNotesQuery = query(collection(db, 'clinicalNotes'));
          const clinicalNotesSnapshot = await getDocs(clinicalNotesQuery);
          
          const clinicalNotes = clinicalNotesSnapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(note => {
              // Check if note is visible to client and assigned to this client
              return note.visibleToClient && note.clientId === assignedClientId;
            })
            .map(note => ({
              ...note,
              type: 'note',
              noteType: 'clinical'
            }));

          // Fetch therapy books based on target audience
          const therapyBooksQuery = query(collection(db, 'therapyBooks'));
          const therapyBooksSnapshot = await getDocs(therapyBooksQuery);
          
          // No client-side audience filter here any more. It tested
          // `book.targetAudience` and `book.assignedClients`, and a REST book has
          // neither — targetAudience lives inside the `content` JSON and the field
          // is `assignedClientIds` — so every book failed the check and the shelf
          // was always empty. The endpoint already returns exactly what this
          // client may see (shared-with-all + assigned-to-them, drafts excluded).
          const therapyBooks = therapyBooksSnapshot.docs
            .map(doc => ({ ...doc.data(), id: doc.id }))
            .map(book => ({
              ...hydrateBookContent(book),
              type: 'note',
              noteType: 'therapyBook'
            }));

          assignedNotes = [...clinicalNotes, ...therapyBooks];
        } catch (error) {
          console.log('Notes query failed:', error);
        }

        setNotes(assignedNotes);

        // Combine resources, worksheets, and notes
        const allItems = [...uniqueResources, ...assignedWorksheets, ...assignedNotes];
        setFilteredResources(allItems);

        // Load favorites from localStorage
        const savedFavorites = localStorage.getItem('th.resourceFavorites');
        if (savedFavorites) {
          setFavorites(JSON.parse(savedFavorites));
        }

      } catch (error) {
        console.error('Error fetching resources:', error);
      } finally {
        setIsLoading(false);
      }
    };

  // Fetch resources on component mount
  useEffect(() => {
    fetchAssignedResources();
  }, [currentUser]);

  // Filter resources based on search and category
  useEffect(() => {
    let filtered = [...resources, ...worksheets, ...notes];

    // Filter by search term
    if (searchTerm) {
      filtered = filtered.filter(item =>
        item.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.content?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.goal?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.noteContent?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Filter by category
    if (selectedCategory === 'resources') {
      filtered = filtered.filter(item => item.type === 'resource' || item.type === 'assigned' || item.type === 'public');
    } else if (selectedCategory === 'notes') {
      filtered = filtered.filter(item => item.type === 'note');
    } else if (selectedCategory === 'worksheets') {
      filtered = filtered.filter(item => item.type === 'worksheet');
    }

    setFilteredResources(filtered);
  }, [resources, worksheets, notes, searchTerm, selectedCategory]);

  const toggleFavorite = (resourceId) => {
    const newFavorites = favorites.includes(resourceId)
      ? favorites.filter(id => id !== resourceId)
      : [...favorites, resourceId];
    
    setFavorites(newFavorites);
    localStorage.setItem('th.resourceFavorites', JSON.stringify(newFavorites));
  };

  const getResourceIcon = (item) => {
    if (item.type === 'worksheet') {
      return <ClipboardList size={24} />;
    }
    
    if (item.type === 'note') {
      if (item.noteType === 'therapyBook') {
        return <BookOpen size={24} />;
      }
      return <FileText size={24} />;
    }
    
    switch (item.category) {
      case 'articles':
        return <FileText size={24} />;
      case 'exercises':
        return <BookOpen size={24} />;
      case 'videos':
        return <Video size={24} />;
      case 'worksheets':
        return <Download size={24} />;
      default:
        return <BookOpen size={24} />;
    }
  };

  const formatDate = (date) => {
    if (!date) return '';
    const d = date.toDate ? date.toDate() : new Date(date);
    return d.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  const getResourceTypeColor = (item) => {
    if (item.type === 'note') {
      if (item.noteType === 'therapyBook') {
        return 'bg-purple-100 text-purple-800';
      }
      return 'bg-yellow-100 text-yellow-800';
    }
    
    switch (item.type) {
      case 'assigned':
        return 'bg-blue-100 text-blue-800';
      case 'public':
        return 'bg-green-100 text-green-800';
      case 'worksheet':
        return 'bg-purple-100 text-purple-800';
      case 'resource':
        return 'bg-indigo-100 text-indigo-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Handle worksheet view
  const handleWorksheetView = (worksheet) => {
    navigate(`/dashboard/resources/worksheet/${worksheet.id}`);
    
    // Initialize responses for this worksheet
    const clientId = localStorage.getItem('th.clientId') || currentUser.uid;
    const clientResponse = worksheet.clientResponses?.[clientId];
    
    if (clientResponse && clientResponse.responses) {
      // Pre-fill with existing responses (regardless of completion status)
      setWorksheetResponses(clientResponse.responses || {});
    } else {
      // Initialize empty responses
      setWorksheetResponses({});
    }
  };

  // Check if worksheet is completed by current client
  // `clientResponses` is a Firestore-era map the API never returns, so every
  // check against it was undefined: a finished worksheet never showed as
  // complete, and the submit button never locked. The API carries the real state
  // on the worksheet itself — `status` and `latestResponse`.
  const isWorksheetCompleted = (worksheet) => {
    if (!worksheet) return false;
    // `submitted` (a client's answer) and `completed` both mean answered.
    if (['completed', 'submitted'].includes(String(worksheet.status || '').toLowerCase())) return true;
    const clientId = localStorage.getItem('th.clientId') || currentUser.uid;
    const clientResponse = worksheet.clientResponses?.[clientId];
    return clientResponse?.status === 'completed' && !clientResponse?.needsToCompleteNewFields;
  };

  /** Answers the client already submitted, if any. */
  const savedWorksheetResponses = (worksheet) => {
    if (!worksheet) return {};
    if (worksheet.latestResponse) {
      try {
        const parsed = JSON.parse(worksheet.latestResponse);
        if (parsed && typeof parsed === 'object') return parsed;
      } catch { /* not JSON */ }
    }
    const clientId = localStorage.getItem('th.clientId') || currentUser.uid;
    return worksheet.clientResponses?.[clientId]?.responses || {};
  };

  // Check if worksheet has new fields that need completion
  const hasNewFields = (worksheet) => {
    const clientId = localStorage.getItem('th.clientId') || currentUser.uid;
    const clientResponse = worksheet.clientResponses?.[clientId];
    return clientResponse?.needsToCompleteNewFields === true;
  };

  // Check if worksheet has been updated
  const hasUpdates = (worksheet) => {
    return worksheet.hasNewFields === true;
  };

  // Handle response change
  const handleResponseChange = (fieldIndex, value) => {
    setWorksheetResponses(prev => ({
      ...prev,
      [fieldIndex]: value
    }));
  };

  // Submit worksheet responses
  const handleSubmitWorksheet = async () => {
    try {
      const clientId = localStorage.getItem('th.clientId') || currentUser.uid;
      const clientResponse = selectedWorksheet.clientResponses?.[clientId];
      const hasNewFields = clientResponse?.needsToCompleteNewFields === true;
      
      // Merge new responses with existing ones
      const existingResponses = clientResponse?.responses || {};
      const mergedResponses = { ...existingResponses, ...worksheetResponses };
      
      // Determine completion status
      const allFieldsAnswered = selectedWorksheet.fields.every((_, index) => 
        mergedResponses[index] !== undefined && mergedResponses[index] !== ''
      );
      
      // Update the worksheet document with client responses
      const worksheetRef = doc(db, 'worksheets', selectedWorksheet.id);
      await updateDoc(worksheetRef, {
        [`clientResponses.${clientId}`]: {
          responses: mergedResponses,
          submittedAt: serverTimestamp(),
          status: allFieldsAnswered ? 'completed' : 'pending',
          needsToCompleteNewFields: false // Reset this flag after submission
        }
      });
      
      alert(hasNewFields ? 'New fields submitted successfully!' : 'Worksheet submitted successfully!');
      setShowWorksheetModal(false);
      setSelectedWorksheet(null);
      setWorksheetResponses({});
      
      // Refresh worksheets to show updated status
      fetchAssignedResources();
      
    } catch (error) {
      console.error('Error submitting worksheet:', error);
      alert('Error submitting worksheet. Please try again.');
    }
  };

  // Generate PDF for resources
  // PDF export lives in utils/brandedPdf.js. The two builders that used to sit
  // here read note.subjective / note.objective / … as top-level fields, but REST
  // notes keep those inside `structuredData`, so every download came out with
  // headings and no content. The shared builder reads the same sections the
  // on-screen note view does, and applies the NessaHub header/watermark.

  // Handle download
  const handleViewNote = (note) => {
    navigate(`/dashboard/resources/note/${note.id}`);
  };

  const handleDownload = (item) => {
    if (item.type === 'note') {
      downloadNotePdf(item);
    } else if (item.type === 'resource' || item.type === 'assigned' || item.type === 'public') {
      downloadResourcePdf(item);
    }
  };

  if (isLoading) {
    return (
      <div className="resources-loading">
        <div className="loading-spinner"></div>
        <p>Loading resources...</p>
      </div>
    );
  }

  return (
    <div className="client-resources">
      <div className="resources-header">
        <div className="header-content">
          <h1 className="page-title">Resources & Self-Help</h1>
          <p className="subtitle">Tools and materials to support your therapy journey</p>
        </div>
        <div className="header-actions">
          <div className="view-toggle">
            <button 
              className={`view-btn ${viewMode === 'grid' ? 'active' : ''}`}
              onClick={() => setViewMode('grid')}
            >
              <Grid size={20} />
            </button>
            <button 
              className={`view-btn ${viewMode === 'list' ? 'active' : ''}`}
              onClick={() => setViewMode('list')}
            >
              <List size={20} />
            </button>
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="resources-controls">
        <div className="search-bar">
          <Search size={20} />
          <input
            type="text"
            placeholder="Search resources..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        <div className="category-filters">
          {categories.map(category => (
            <button
              key={category.id}
              className={`category-btn ${selectedCategory === category.id ? 'active' : ''}`}
              onClick={() => setSelectedCategory(category.id)}
            >
              <category.icon size={16} />
              {category.name}
            </button>
          ))}
        </div>
      </div>

      {/* Resources Grid/List */}
      {filteredResources.length === 0 ? (
        <div className="no-resources">
          <BookOpen size={48} />
          <h3>No resources found</h3>
          <p>
            {searchTerm || selectedCategory !== 'all' 
              ? 'Try adjusting your search or filters'
              : 'No resources available at the moment'
            }
          </p>
        </div>
      ) : (
        <div className={`resources-container ${viewMode}`}>
          {filteredResources.map((item) => (
            <div key={item.id} className="resource-card">
              <div className="resource-header">
                <div className="resource-icon">
                  {getResourceIcon(item)}
                </div>
                <div className="resource-meta">
                  <div className="resource-type">
                    <span className={`type-badge ${getResourceTypeColor(item)}`}>
                      {item.type === 'worksheet' ? 'Worksheet' : 
                       item.type === 'assigned' ? 'Assigned' : 
                       item.type === 'public' ? 'Public' : 
                       item.type === 'note' ? (item.noteType === 'therapyBook' ? 'Therapy Book' : 'Clinical Note') : 'Resource'}
                    </span>
                    {item.type === 'worksheet' ? (
                      <span className="category-badge">
                        {item.category}
                      </span>
                    ) : item.category && (
                      <span className="category-badge">
                        {item.category}
                      </span>
                    )}
                  </div>
                  <div className="resource-date">
                    <Clock size={14} />
                    {formatDate(item.createdAt || item.dateCreated)}
                  </div>
                </div>
                <div className="resource-actions">
                  <button 
                    className={`action-btn ${favorites.includes(item.id) ? 'favorited' : ''}`}
                    onClick={() => toggleFavorite(item.id)}
                    title={favorites.includes(item.id) ? 'Remove from favorites' : 'Add to favorites'}
                  >
                    <Heart size={16} />
                  </button>
                  <button className="action-btn" title="Share">
                    <Share2 size={16} />
                  </button>
                </div>
              </div>
              
              <div className="resource-content">
                <h3 className="resource-title">
                  {item.type === 'note' && item.noteType === 'therapyBook' 
                    ? item.bookTitle 
                    : item.title || (item.noteType ? `${item.noteType.charAt(0).toUpperCase() + item.noteType.slice(1)} Note` : 'Note')
                  }
                </h3>
                {item.type !== 'note' && (
                  <p className="resource-description">
                    {item.description?.substring(0, 100) + '...'}
                  </p>
                )}
                
                {item.type === 'worksheet' && item.goal && (
                  <div className="worksheet-goal">
                    <strong>Goal:</strong> {item.goal}
                    {(() => {
                      const clientId = localStorage.getItem('th.clientId') || currentUser.uid;
                      const clientResponse = item.clientResponses?.[clientId];
                      const isCompleted = clientResponse?.status === 'completed';
                      return (
                        <>
                          {isCompleted && (
                            <span className="completed-badge" style={{ marginLeft: '0.5rem', background: '#10b981', color: 'white', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: '600' }}>
                              <CheckCircle size={12} style={{ marginRight: '0.25rem', verticalAlign: 'middle' }} />
                              Completed
                            </span>
                          )}
                          {hasUpdates(item) && (
                            <span className="update-indicator">
                              <AlertCircle size={14} />
                              Updated with new fields
                            </span>
                          )}
                        </>
                      );
                    })()}
                  </div>
                )}

                {item.type === 'note' && item.noteType === 'therapyBook' && (
                  <div className="note-meta">
                    {item.author && <div><strong>Author:</strong> {item.author}</div>}
                    {item.targetAudience && <div><strong>Target:</strong> {item.targetAudience}</div>}
                    {item.difficultyLevel && <div><strong>Level:</strong> {item.difficultyLevel}</div>}
                  </div>
                )}

                {item.type === 'note' && item.noteType === 'clinical' && (
                  <div className="note-meta">
                    {item.therapistName && <div><strong>Therapist:</strong> {item.therapistName}</div>}
                    {item.sessionDate && <div><strong>Session Date:</strong> {formatDate(item.sessionDate)}</div>}
                  </div>
                )}
                
                {/* `tags` is saved as a comma-separated string, so calling .map()
                    on it threw "item.tags.map is not a function" and took the whole
                    screen down. Accept either shape. */}
                {toTagList(item.tags).length > 0 && (
                  <div className="resource-tags">
                    {toTagList(item.tags).map((tag, index) => (
                      <span key={index} className="tag">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              
              <div className="resource-footer">
                <div className="resource-stats">
                  {item.type === 'worksheet' ? (
                    <>
                      <span className="stat">
                        <Target size={14} />
                        {item.fields?.length || 0} questions
                      </span>
                      <span className="stat">
                        <CheckCircle size={14} />
                        {item.allowMultipleResponses ? 'Multiple attempts' : 'Single attempt'}
                      </span>
                    </>
                  ) : item.type === 'note' ? (
                    <>
                    <span className="stat">
                      <Clock size={14} />
                        {formatDate(item.createdAt)}
                      </span>
                      {item.noteType === 'therapyBook' && item.difficultyLevel && (
                        <span className="stat">
                          <Star size={14} />
                          {item.difficultyLevel}
                    </span>
                  )}
                      {item.noteType === 'clinical' && item.noteType && (
                    <span className="stat">
                      <Star size={14} />
                          {item.noteType.toUpperCase()}
                    </span>
                      )}
                    </>
                  ) : (
                    <>
                      {item.duration && (
                    <span className="stat">
                      <Clock size={14} />
                          {item.duration}
                    </span>
                  )}
                      {item.difficulty && (
                    <span className="stat">
                      <Star size={14} />
                          {item.difficulty}
                    </span>
                      )}
                    </>
                  )}
                </div>
                
                <div className="resource-buttons">
                  {item.type === 'worksheet' ? (
                    <button 
                      className={`btn-primary ${isWorksheetCompleted(item) ? 'completed' : hasNewFields(item) ? 'updated' : ''}`}
                      onClick={() => handleWorksheetView(item)}
                    >
                      <ClipboardList size={16} />
                      {isWorksheetCompleted(item) 
                        ? 'Completed' 
                        : hasNewFields(item) 
                          ? 'Complete New Fields' 
                          : 'Complete'
                      }
                    </button>
                  ) : item.type === 'note' ? (
                    <>
                      <button 
                        className="btn-secondary" 
                        onClick={() => handleViewNote(item)}
                        data-tooltip="View Note"
                        title="View Note"
                      >
                        <Eye size={16} />
                        <span>View</span>
                      </button>
                      <button 
                        className="btn-primary" 
                        onClick={() => handleDownload(item)}
                        data-tooltip="Download PDF"
                        title="Download PDF"
                      >
                        <Download size={16} />
                        <span>Download PDF</span>
                      </button>
                    </>
                  ) : item.type === 'resource' || item.type === 'assigned' || item.type === 'public' ? (
                    <>
                      {/* Download-only meant an image, audio clip or video could
                          never actually be opened. View shows the attachment. */}
                      <button
                        className="btn-secondary"
                        onClick={() => { setSelectedResource(item); setShowResourceModal(true); }}
                        data-tooltip="Open resource"
                        title="Open resource"
                      >
                        <Eye size={16} />
                        <span>View</span>
                      </button>
                      <button
                        className="btn-primary"
                        onClick={() => handleDownload(item)}
                        data-tooltip="Download PDF"
                        title="Download PDF"
                      >
                        <Download size={16} />
                        <span>Download PDF</span>
                      </button>
                    </>
                  ) : item.category === 'videos' ? (
                    <button 
                      className="btn-primary"
                      data-tooltip="Watch Video"
                      title="Watch Video"
                    >
                      <Play size={16} />
                      <span>Watch</span>
                    </button>
                  ) : (
                    <button 
                      className="btn-primary"
                      data-tooltip="View"
                      title="View"
                    >
                      <Eye size={16} />
                      <span>View</span>
                    </button>
                  )}
                  
                  {item.fileUrl && (
                    <button 
                      className="btn-secondary"
                      data-tooltip="Download File"
                      title="Download File"
                    >
                      <Download size={16} />
                      <span>Download File</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Favorites Section */}
      {favorites.length > 0 && (
        <div className="favorites-section">
          <h2 className="section-title">
            <Heart size={24} />
            Your Favorites
          </h2>
          <div className="favorites-grid">
            {resources
              .filter(resource => favorites.includes(resource.id))
              .slice(0, 6)
              .map((resource) => (
                <div key={resource.id} className="favorite-card">
                  <div className="favorite-icon">
                    {getResourceIcon(resource.category)}
                  </div>
                  <div className="favorite-content">
                    <h4>{resource.title}</h4>
                    <p>{resource.category}</p>
                  </div>
                  <button 
                    className="favorite-remove"
                    onClick={() => toggleFavorite(resource.id)}
                  >
                    <Heart size={16} />
                  </button>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Worksheet Modal */}
      {showWorksheetModal && selectedWorksheet && (
        <div className="modal-overlay" onClick={() => setShowWorksheetModal(false)}>
          <div className="modal-content large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{selectedWorksheet.title}</h2>
              <button 
                className="close-button"
                onClick={() => setShowWorksheetModal(false)}
              >
                ×
              </button>
            </div>
            
            <div className="modal-body">
              <div className="worksheet-view">
                {/* Worksheet Header */}
                <div className="worksheet-header">
                  <div className="worksheet-meta">
                    <div className="meta-item">
                      <Target size={16} />
                      <span>Goal: {selectedWorksheet.goal}</span>
                    </div>
                    <div className="meta-item">
                      <Clock size={16} />
                      <span>{selectedWorksheet.fields?.length || 0} questions</span>
                    </div>
                  </div>
                </div>

                {/* Description */}
                {selectedWorksheet.description && (
                  <div className="worksheet-section">
                    <h3>Instructions</h3>
                    <div className="instructions-box">
                      <p style={{ whiteSpace: 'pre-wrap' }}>{selectedWorksheet.description}</p>
                    </div>
                  </div>
                )}

                {/* Additional Instructions */}
                {selectedWorksheet.instructions && (
                  <div className="worksheet-section">
                    <h3>Additional Instructions</h3>
                    <div className="instructions-box">
                      <p style={{ whiteSpace: 'pre-wrap' }}>{selectedWorksheet.instructions}</p>
                    </div>
                  </div>
                )}

                {/* Fields */}
                {selectedWorksheet.fields && selectedWorksheet.fields.length > 0 && (
                  <div className="worksheet-section">
                    <h3>Questions</h3>
                    <div className="fields-list">
                      {selectedWorksheet.fields.map((field, index) => {
                        const clientId = localStorage.getItem('th.clientId') || currentUser.uid;
                        const clientResponse = selectedWorksheet.clientResponses?.[clientId];
                        const hasExistingResponse = clientResponse?.responses && clientResponse.responses[index] !== undefined;
                        const hasNewFields = clientResponse?.needsToCompleteNewFields === true;
                        const fieldResponse = worksheetResponses[index];
                        
                        // Editability follows the WORKSHEET'S STATUS, not whether an
                        // old answer exists. `clientResponses` is rebuilt from the
                        // last submission, so it survives the therapist reopening the
                        // worksheet — every field stayed read-only and the client
                        // could never answer the updated version.
                        const worksheetLocked = ['completed', 'submitted']
                          .includes(String(selectedWorksheet.status || '').toLowerCase());
                        const isEditable = !worksheetLocked
                          || !hasExistingResponse
                          || (hasNewFields && index >= (Object.keys(clientResponse?.responses || {}).length));
                        const isNewField = hasNewFields && index >= (Object.keys(clientResponse?.responses || {}).length);
                        
                        return (
                          <div key={index} className={`field-item ${!isEditable ? 'completed' : ''} ${isNewField ? 'new-field' : ''}`}>
                            <div className="field-header">
                              <h4>{field.name}</h4>
                              {field.required && <span className="required-badge">Required</span>}
                              {!isEditable && hasExistingResponse && <span className="completed-badge">Completed</span>}
                              {isNewField && <span className="new-field-badge">New Field</span>}
                            </div>
                            
                            {!isEditable && hasExistingResponse && (
                              <div className="field-response">
                                <strong>Your Answer:</strong>
                                <div className="response-value">
                                  {(() => {
                                    // Get the existing response from clientResponse.responses
                                    const existingAnswer = clientResponse.responses[index];
                                    if (existingAnswer !== undefined) {
                                      return Array.isArray(existingAnswer) ? existingAnswer.join(', ') : existingAnswer.toString();
                                    }
                                    return 'No answer provided';
                                  })()}
                                </div>
                              </div>
                            )}

                            {/* Show feedback if available */}
                            {clientResponse?.feedback && (
                              <div className="therapist-feedback">
                                <strong>Therapist Feedback:</strong>
                                <div className="feedback-content">
                                  <div className="feedback-rating">
                                    Rating: {clientResponse.feedback.rating}/10
                                  </div>
                                  <div className="feedback-text">
                                    {clientResponse.feedback.feedback}
                                  </div>
                                  <div className="feedback-date">
                                    {clientResponse.feedback.givenAt?.toDate?.()?.toLocaleDateString()}
                                  </div>
                                </div>
                              </div>
                            )}
                            
                            <div className={`field-input ${!isEditable ? 'disabled' : ''}`}>
                            {field.type === 'text' && (
                              <input
                                type="text"
                                value={(() => {
                                  // For completed fields, show existing answer, otherwise show current input
                                  if (!isEditable && hasExistingResponse) {
                                    const existingAnswer = clientResponse.responses[index];
                                    return existingAnswer !== undefined ? existingAnswer.toString() : '';
                                  }
                                  return worksheetResponses[index] || '';
                                })()}
                                onChange={(e) => handleResponseChange(index, e.target.value)}
                                placeholder="Enter your answer..."
                                disabled={!isEditable}
                              />
                            )}
                            
                            {field.type === 'textarea' && (
                              <textarea
                                value={(() => {
                                  if (!isEditable && hasExistingResponse) {
                                    const existingAnswer = clientResponse.responses[index];
                                    return existingAnswer !== undefined ? existingAnswer.toString() : '';
                                  }
                                  return worksheetResponses[index] || '';
                                })()}
                                onChange={(e) => handleResponseChange(index, e.target.value)}
                                placeholder="Enter your detailed answer..."
                                rows={4}
                                disabled={!isEditable}
                              />
                            )}
                            
                            {field.type === 'number' && (
                              <input
                                type="number"
                                value={(() => {
                                  if (!isEditable && hasExistingResponse) {
                                    const existingAnswer = clientResponse.responses[index];
                                    return existingAnswer !== undefined ? existingAnswer.toString() : '';
                                  }
                                  return worksheetResponses[index] || '';
                                })()}
                                onChange={(e) => handleResponseChange(index, e.target.value)}
                                placeholder="Enter a number..."
                                disabled={!isEditable}
                              />
                            )}
                            
                            {field.type === 'date' && (
                              <input
                                type="date"
                                value={(() => {
                                  if (!isEditable && hasExistingResponse) {
                                    const existingAnswer = clientResponse.responses[index];
                                    return existingAnswer !== undefined ? existingAnswer.toString() : '';
                                  }
                                  return worksheetResponses[index] || '';
                                })()}
                                onChange={(e) => handleResponseChange(index, e.target.value)}
                                disabled={!isEditable}
                              />
                            )}
                            
                            {field.type === 'select' && (
                              <select
                                value={(() => {
                                  if (!isEditable && hasExistingResponse) {
                                    const existingAnswer = clientResponse.responses[index];
                                    return existingAnswer !== undefined ? existingAnswer.toString() : '';
                                  }
                                  return worksheetResponses[index] || '';
                                })()}
                                onChange={(e) => handleResponseChange(index, e.target.value)}
                                disabled={!isEditable}
                              >
                                <option value="">Select an option...</option>
                                {field.options && field.options.map((option, optIndex) => (
                                  <option key={optIndex} value={option}>{option}</option>
                                ))}
                              </select>
                            )}
                            
                            {field.type === 'radio' && (
                              <div className="radio-group">
                                {field.options && field.options.map((option, optIndex) => (
                                  <label key={optIndex} className="radio-option">
                                    <input
                                      type="radio"
                                      name={`field_${index}`}
                                      value={option}
                                      checked={(() => {
                                        if (!isEditable && hasExistingResponse) {
                                          const existingAnswer = clientResponse.responses[index];
                                          return existingAnswer === option;
                                        }
                                        return worksheetResponses[index] === option;
                                      })()}
                                      onChange={(e) => handleResponseChange(index, e.target.value)}
                                      disabled={!isEditable}
                                    />
                                    <span>{option}</span>
                                  </label>
                                ))}
                              </div>
                            )}
                            
                            {field.type === 'checkbox' && (
                              <label className="checkbox-option">
                                <input
                                  type="checkbox"
                                  checked={(() => {
                                    if (!isEditable && hasExistingResponse) {
                                      const existingAnswer = clientResponse.responses[index];
                                      return existingAnswer === true;
                                    }
                                    return worksheetResponses[index] || false;
                                  })()}
                                  onChange={(e) => handleResponseChange(index, e.target.checked)}
                                  disabled={!isEditable}
                                />
                                <span>I agree</span>
                              </label>
                            )}
                            
                            {field.type === 'rating' && (
                              <div className="rating-group">
                                <div className="rating-scale">
                                  <span>1</span>
                                  {[1,2,3,4,5,6,7,8,9,10].map(num => (
                                    <label key={num} className="rating-option">
                                      <input
                                        type="radio"
                                        name={`rating_${index}`}
                                        value={num}
                                        checked={(() => {
                                          if (!isEditable && hasExistingResponse) {
                                            const existingAnswer = clientResponse.responses[index];
                                            return existingAnswer === num;
                                          }
                                          return worksheetResponses[index] === num;
                                        })()}
                                        onChange={(e) => handleResponseChange(index, parseInt(e.target.value))}
                                        disabled={!isEditable}
                                      />
                                      <span className="rating-dot">{num}</span>
                                    </label>
                                  ))}
                                  <span>10</span>
                                </div>
                              </div>
                            )}
                            
                            {field.type === 'multiple-choice' && (
                              <div className="multiple-choice-group">
                                {field.options && field.options.map((option, optIndex) => (
                                  <label key={optIndex} className="checkbox-option">
                                    <input
                                      type="checkbox"
                                      checked={(worksheetResponses[index] || []).includes(option)}
                                      onChange={(e) => {
                                        const currentValues = worksheetResponses[index] || [];
                                        const newValues = e.target.checked
                                          ? [...currentValues, option]
                                          : currentValues.filter(v => v !== option);
                                        handleResponseChange(index, newValues);
                                      }}
                                      disabled={!isEditable}
                                    />
                                    <span>{option}</span>
                                  </label>
                                ))}
                              </div>
                            )}
                          </div>
    </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="modal-footer">
              <button 
                className="btn-secondary"
                onClick={() => setShowWorksheetModal(false)}
              >
                {(() => {
                  const clientId = localStorage.getItem('th.clientId') || currentUser.uid;
                  const clientResponse = selectedWorksheet.clientResponses?.[clientId];
                  return clientResponse?.status === 'completed' ? 'Close' : 'Cancel';
                })()}
              </button>
              {(() => {
                const clientId = localStorage.getItem('th.clientId') || currentUser.uid;
                const clientResponse = selectedWorksheet.clientResponses?.[clientId];
                const hasNewFields = clientResponse?.needsToCompleteNewFields === true;
                // A completed worksheet is read-only until the therapist edits it
                // (which reopens it server-side); anything else is answerable.
                const locked = isWorksheetCompleted(selectedWorksheet) && !hasNewFields;

                if (!locked) {
                  return (
                    <button 
                      className="btn-primary"
                      onClick={handleSubmitWorksheet}
                    >
                      <Send size={16} />
                      {hasNewFields ? 'Submit New Fields' : 'Submit Worksheet'}
                    </button>
                  );
                }
                return null;
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Note View Modal */}
      {/* Resource viewer — renders the attachment itself (image, audio player,
          video, file download or link) rather than only offering a PDF. */}
      {showResourceModal && selectedResource && (
        <div className="modal-overlay" onClick={() => setShowResourceModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{selectedResource.title || 'Resource'}</h2>
              <button className="close-btn" onClick={() => setShowResourceModal(false)}>×</button>
            </div>
            <div className="modal-body">
              {selectedResource.description && (
                <p className="resource-description">{selectedResource.description}</p>
              )}

              <ResourceMedia resource={selectedResource} />

              {selectedResource.content && (
                <p className="resource-content-text">{selectedResource.content}</p>
              )}

              <button className="btn-primary" onClick={() => handleDownload(selectedResource)}>
                <Download size={16} />
                <span>Download PDF</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {showNoteModal && selectedNote && (
        <div className="modal-overlay" onClick={() => setShowNoteModal(false)}>
          <div className="modal-content large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>
                {selectedNote.noteType === 'therapyBook' 
                  ? selectedNote.bookTitle 
                  : `${selectedNote.noteType?.charAt(0).toUpperCase() + selectedNote.noteType?.slice(1)} Note`
                }
              </h2>
              <button 
                className="close-button"
                onClick={() => setShowNoteModal(false)}
              >
                ×
              </button>
            </div>
            
            <div className="modal-body">
              <div className="note-view">
                {/* Note Header */}
                <div className="note-header">
                  <div className="note-meta">
                    {selectedNote.author && (
                      <div className="meta-item">
                        <User size={16} />
                        <span>Author: {selectedNote.author}</span>
                      </div>
                    )}
                    <div className="meta-item">
                      <Clock size={16} />
                      <span>Created: {selectedNote.createdAt?.toDate?.()?.toLocaleDateString()}</span>
                    </div>
                    {selectedNote.targetAudience && (
                      <div className="meta-item">
                        <Target size={16} />
                        <span>Target: {selectedNote.targetAudience}</span>
                      </div>
                    )}
                    {selectedNote.difficultyLevel && (
                      <div className="meta-item">
                        <Star size={16} />
                        <span>Level: {selectedNote.difficultyLevel}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Therapy Book Content */}
                {selectedNote.noteType === 'therapyBook' && (
                  <>
                    {/* Description */}
                    {selectedNote.description && (
                      <div className="note-section">
                        <h3>Description</h3>
                        <div className="note-content">
                          <p style={{ whiteSpace: 'pre-wrap' }}>{selectedNote.description}</p>
                        </div>
                      </div>
                    )}

                    {/* Table of Contents */}
                    {selectedNote.tableOfContents && (
                      <div className="note-section">
                        <h3>Table of Contents</h3>
                        <div className="note-content">
                          <p style={{ whiteSpace: 'pre-wrap' }}>{selectedNote.tableOfContents}</p>
                        </div>
                      </div>
                    )}

                    {/* Chapters */}
                    {selectedNote.chapters && (
                      <div className="note-section">
                        <h3>Chapters</h3>
                        <div className="note-content">
                          <p style={{ whiteSpace: 'pre-wrap' }}>{selectedNote.chapters}</p>
                        </div>
                      </div>
                    )}

                    {/* Key Topics */}
                    {selectedNote.keyTopics && (
                      <div className="note-section">
                        <h3>Key Topics</h3>
                        <div className="note-content">
                          <p style={{ whiteSpace: 'pre-wrap' }}>{selectedNote.keyTopics}</p>
                        </div>
                      </div>
                    )}

                    {/* Exercises */}
                    {selectedNote.exercises && (
                      <div className="note-section">
                        <h3>Exercises & Activities</h3>
                        <div className="note-content">
                          <p style={{ whiteSpace: 'pre-wrap' }}>{selectedNote.exercises}</p>
                        </div>
                      </div>
                    )}

                    {/* Resources */}
                    {selectedNote.resources && (
                      <div className="note-section">
                        <h3>Additional Resources</h3>
                        <div className="note-content">
                          <p style={{ whiteSpace: 'pre-wrap' }}>{selectedNote.resources}</p>
                        </div>
                      </div>
                    )}

                    {/* Bibliography */}
                    {selectedNote.bibliography && (
                      <div className="note-section">
                        <h3>Bibliography & References</h3>
                        <div className="note-content">
                          <p style={{ whiteSpace: 'pre-wrap' }}>{selectedNote.bibliography}</p>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* Clinical Note Content */}
                {selectedNote.noteType !== 'therapyBook' && (
                  <>
                    {/* Note Content */}
                    {selectedNote.noteContent && (
                      <div className="note-section">
                        <h3>Note Content</h3>
                        <div className="note-content">
                          <p style={{ whiteSpace: 'pre-wrap' }}>{selectedNote.noteContent}</p>
                        </div>
                      </div>
                    )}

                    {/* Session Date */}
                    {selectedNote.sessionDate && (
                      <div className="note-section">
                        <h3>Session Date</h3>
                        <div className="note-content">
                          <p>{selectedNote.sessionDate?.toDate?.()?.toLocaleDateString()}</p>
                        </div>
                      </div>
                    )}

                    {/* Therapist Name */}
                    {selectedNote.therapistName && (
                      <div className="note-section">
                        <h3>Therapist</h3>
                        <div className="note-content">
                          <p>{selectedNote.therapistName}</p>
                        </div>
                      </div>
                    )}

                    {/* Note Fields */}
                    {['subjective', 'objective', 'assessment', 'plan', 'interventions', 'clientResponse', 'moodRating', 'riskAssessment', 'nextSteps'].map(field => {
                      if (selectedNote[field]) {
                        return (
                          <div key={field} className="note-section">
                            <h3>{field.charAt(0).toUpperCase() + field.slice(1)}</h3>
                            <div className="note-content">
                              <p style={{ whiteSpace: 'pre-wrap' }}>{selectedNote[field]}</p>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    })}

                    {/* Signature */}
                    {selectedNote.signature && (
                      <div className="note-section">
                        <h3>Digital Signature</h3>
                        <div className="note-content">
                          <p>{selectedNote.signature}</p>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="modal-footer">
              <button 
                className="btn-secondary"
                onClick={() => setShowNoteModal(false)}
              >
                Close
              </button>
              <button 
                className="btn-primary"
                onClick={() => handleDownload(selectedNote)}
              >
                <Download size={16} />
                Download PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
