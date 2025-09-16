import React, { useState, useEffect } from 'react';
import { auth, db } from '../../Auth/firebaseConfig';
import './Support.css';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  addDoc,
  orderBy, 
  limit,
  doc,
  getDoc,
  serverTimestamp
} from 'firebase/firestore';
import { 
  Star, 
  MessageSquare, 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  User, 
  Send,
  FileText,
  HelpCircle,
  ThumbsUp,
  ThumbsDown,
  Calendar,
  Upload,
  X,
  Plus,
  Search,
  Eye,
  Flag
} from 'lucide-react';

export default function ClientSupport() {
  const [clientData, setClientData] = useState(null);
  const [therapistData, setTherapistData] = useState(null);
  const [recentSessions, setRecentSessions] = useState([]);
  const [supportTickets, setSupportTickets] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Rating states
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [selectedSession, setSelectedSession] = useState(null);
  const [rating, setRating] = useState(0);
  const [ratingComment, setRatingComment] = useState('');
  const [ratingTherapist, setRatingTherapist] = useState(0);
  const [ratingSystem, setRatingSystem] = useState(0);
  
  // Issue reporting states
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [issueForm, setIssueForm] = useState({
    title: '',
    description: '',
    severity: 'medium',
    relatedSession: '',
    attachments: [],
    consentToShare: false
  });
  
  // FAQ states
  const [showFAQ, setShowFAQ] = useState(false);
  const [faqSearch, setFaqSearch] = useState('');
  
  // Incident tracking states
  const [incidents, setIncidents] = useState([]);
  const [incidentSearch, setIncidentSearch] = useState('');
  const [searchedIncident, setSearchedIncident] = useState(null);
  const [showIncidentDetails, setShowIncidentDetails] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  const currentUser = auth.currentUser;

  const severityOptions = [
    { value: 'low', label: 'Low - Minor issue', color: 'bg-green-100 text-green-800' },
    { value: 'medium', label: 'Medium - Moderate issue', color: 'bg-yellow-100 text-yellow-800' },
    { value: 'high', label: 'High - Major issue', color: 'bg-orange-100 text-orange-800' },
    { value: 'critical', label: 'Critical - Urgent issue', color: 'bg-red-100 text-red-800' }
  ];

  const faqItems = [
    {
      id: 1,
      question: "How do I schedule a session?",
      answer: "Go to the Schedule tab and click 'Book Session'. Select your preferred date and time, then submit your request. Your therapist will confirm the session."
    },
    {
      id: 2,
      question: "What if I need to cancel a session?",
      answer: "You can cancel a session up to 24 hours before the scheduled time. Go to your Schedule, find the session, and click 'Cancel'. For urgent cancellations, contact support."
    },
    {
      id: 3,
      question: "How do I access my therapy resources?",
      answer: "All resources assigned by your therapist are available in the Resources tab. You can search, filter, and favorite resources for easy access."
    },
    {
      id: 4,
      question: "What if I have technical issues during a video call?",
      answer: "Try refreshing your browser first. If the issue persists, check your internet connection and ensure your camera/microphone permissions are enabled. Contact support if problems continue."
    },
    {
      id: 5,
      question: "How do I update my payment information?",
      answer: "Go to the Billing tab and click 'Update Payment' in the Payment Methods section. You can add, edit, or remove payment methods there."
    },
    {
      id: 6,
      question: "Can I message my therapist outside of sessions?",
      answer: "Yes, you can send messages to your therapist through the Messages tab. They will respond during their available hours."
    }
  ];

  useEffect(() => {
    if (!currentUser) return;

    const fetchSupportData = async () => {
      try {
        setIsLoading(true);
        
        // Get client ID
        const clientId = localStorage.getItem('th.clientId') || currentUser.uid;
        
        // Fetch client profile
        const clientDoc = await getDoc(doc(db, 'clients', clientId));
        if (clientDoc.exists()) {
          const clientProfile = clientDoc.data();
          setClientData({ id: clientDoc.id, ...clientProfile });
          
          // Fetch assigned therapist
          if (clientProfile.assignedTherapistId) {
            const therapistDoc = await getDoc(doc(db, 'therapists', clientProfile.assignedTherapistId));
            if (therapistDoc.exists()) {
              setTherapistData({ id: therapistDoc.id, ...therapistDoc.data() });
            }
          }
        }

        // Fetch recent sessions for rating - simplified query to avoid index requirements
        try {
        const sessionsQuery = query(
          collection(db, 'scheduledCalls'),
            where('clientId', '==', clientId)
        );
        const sessionsSnapshot = await getDocs(sessionsQuery);
          const allSessions = sessionsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
          
          // Filter and sort client-side to avoid Firestore index requirement
          const completedSessions = allSessions.filter(session => session.status === 'completed');
          completedSessions.sort((a, b) => {
            const dateA = a.scheduledTime?.toDate ? a.scheduledTime.toDate() : new Date(a.scheduledTime || 0);
            const dateB = b.scheduledTime?.toDate ? b.scheduledTime.toDate() : new Date(b.scheduledTime || 0);
            return dateB - dateA; // Descending order
          });
          
          setRecentSessions(completedSessions.slice(0, 10)); // Limit to 10 client-side
        } catch (sessionError) {
          console.error('Error fetching sessions:', sessionError);
          // Fallback: fetch all sessions and filter client-side
          try {
            const allSessionsQuery = query(collection(db, 'scheduledCalls'));
            const allSessionsSnapshot = await getDocs(allSessionsQuery);
            const allSessions = allSessionsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
            
            const clientSessions = allSessions.filter(session => 
              session.clientId === clientId && session.status === 'completed'
            );
            clientSessions.sort((a, b) => {
              const dateA = a.scheduledTime?.toDate ? a.scheduledTime.toDate() : new Date(a.scheduledTime || 0);
              const dateB = b.scheduledTime?.toDate ? b.scheduledTime.toDate() : new Date(b.scheduledTime || 0);
              return dateB - dateA;
            });
            
            setRecentSessions(clientSessions.slice(0, 10));
          } catch (fallbackError) {
            console.error('Fallback sessions fetch failed:', fallbackError);
            setRecentSessions([]);
          }
        }

        // Fetch support tickets - simplified query to avoid index requirements
        try {
        const ticketsQuery = query(
          collection(db, 'supportTickets'),
            where('clientId', '==', clientId)
        );
        const ticketsSnapshot = await getDocs(ticketsQuery);
        const tickets = ticketsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
          
          // Sort client-side and limit to 10
          tickets.sort((a, b) => {
            const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
            const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
            return dateB - dateA; // Descending order
          });
          
          setSupportTickets(tickets.slice(0, 10)); // Limit to 10 client-side
        } catch (ticketError) {
          console.error('Error fetching support tickets:', ticketError);
          // Fallback: fetch all support tickets and filter client-side
          try {
            const allTicketsQuery = query(collection(db, 'supportTickets'));
            const allTicketsSnapshot = await getDocs(allTicketsQuery);
            const allTickets = allTicketsSnapshot.docs.map(doc => ({
              id: doc.id,
              ...doc.data()
            }));
            
            const clientTickets = allTickets.filter(ticket => ticket.clientId === clientId);
            clientTickets.sort((a, b) => {
              const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
              const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
              return dateB - dateA;
            });
            
            setSupportTickets(clientTickets.slice(0, 10));
          } catch (fallbackError) {
            console.error('Fallback tickets fetch failed:', fallbackError);
            setSupportTickets([]);
          }
        }

        // Fetch incident reports - simplified query to avoid index requirements
        try {
          const incidentsQuery = query(
            collection(db, 'therapistReports'),
            where('clientId', '==', clientId)
          );
          const incidentsSnapshot = await getDocs(incidentsQuery);
          const incidentsData = incidentsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
          
          // Sort client-side to avoid Firestore index requirement
          incidentsData.sort((a, b) => {
            const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
            const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
            return dateB - dateA; // Descending order
          });
          
          setIncidents(incidentsData);
        } catch (incidentError) {
          console.error('Error fetching incidents:', incidentError);
          // Fallback: fetch all therapist reports and filter client-side
          try {
            const allIncidentsQuery = query(collection(db, 'therapistReports'));
            const allIncidentsSnapshot = await getDocs(allIncidentsQuery);
            const allIncidents = allIncidentsSnapshot.docs.map(doc => ({
              id: doc.id,
              ...doc.data()
            }));
            
            const clientIncidents = allIncidents.filter(incident => incident.clientId === clientId);
            clientIncidents.sort((a, b) => {
              const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
              const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
              return dateB - dateA;
            });
            
            setIncidents(clientIncidents);
          } catch (fallbackError) {
            console.error('Fallback incident fetch failed:', fallbackError);
            setIncidents([]);
          }
        }

      } catch (error) {
        console.error('Error fetching support data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSupportData();
  }, [currentUser]);

  const handleRatingSubmit = async (e) => {
    e.preventDefault();
    if (!selectedSession || rating === 0) return;

    try {
      await addDoc(collection(db, 'sessionRatings'), {
        sessionId: selectedSession.id,
        clientId: currentUser.uid,
        therapistId: selectedSession.therapistId,
        sessionRating: rating,
        therapistRating: ratingTherapist,
        systemRating: ratingSystem,
        comment: ratingComment,
        createdAt: serverTimestamp()
      });

      alert('Thank you for your feedback!');
      setShowRatingModal(false);
      setRating(0);
      setRatingComment('');
      setRatingTherapist(0);
      setRatingSystem(0);
      setSelectedSession(null);

    } catch (error) {
      console.error('Error submitting rating:', error);
      alert('Failed to submit rating. Please try again.');
    }
  };

  const handleIssueSubmit = async (e) => {
    e.preventDefault();
    if (!issueForm.title || !issueForm.description) return;

    try {
      await addDoc(collection(db, 'supportTickets'), {
        clientId: currentUser.uid,
        title: issueForm.title,
        description: issueForm.description,
        severity: issueForm.severity,
        relatedSession: issueForm.relatedSession || null,
        attachments: issueForm.attachments,
        consentToShare: issueForm.consentToShare,
        status: 'open',
        createdAt: serverTimestamp()
      });

      alert('Support ticket created successfully! We will get back to you soon.');
      setShowIssueModal(false);
      setIssueForm({
        title: '',
        description: '',
        severity: 'medium',
        relatedSession: '',
        attachments: [],
        consentToShare: false
      });

    } catch (error) {
      console.error('Error creating support ticket:', error);
      alert('Failed to create support ticket. Please try again.');
    }
  };

  const formatSessionDate = (scheduledTime) => {
    const date = scheduledTime?.toDate ? scheduledTime.toDate() : new Date(scheduledTime);
    return date.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  const getTicketStatusColor = (status) => {
    switch (status) {
      case 'open':
        return 'bg-blue-100 text-blue-800';
      case 'in_progress':
        return 'bg-yellow-100 text-yellow-800';
      case 'resolved':
        return 'bg-green-100 text-green-800';
      case 'closed':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const filteredFAQ = faqItems.filter(item =>
    item.question.toLowerCase().includes(faqSearch.toLowerCase()) ||
    item.answer.toLowerCase().includes(faqSearch.toLowerCase())
  );

  // Handle incident search
  const handleIncidentSearch = async (e) => {
    e.preventDefault();
    if (!incidentSearch.trim()) {
      alert('Please enter an incident ID to search.');
      return;
    }

    setIsSearching(true);
    try {
      const searchId = incidentSearch.trim();
      const foundIncident = incidents.find(incident => 
        incident.incidentId === searchId
      );
      
      if (foundIncident) {
        setSearchedIncident(foundIncident);
        setShowIncidentDetails(true);
        setIncidentSearch(''); // Clear search input
      } else {
        alert(`Incident ID "${searchId}" not found. Please check your incident ID and try again.`);
      }
    } catch (error) {
      console.error('Error searching incident:', error);
      alert('Error searching incident. Please try again.');
    } finally {
      setIsSearching(false);
    }
  };

  // Get incident status color
  const getIncidentStatusColor = (status) => {
    switch (status) {
      case 'submitted':
        return 'bg-blue-100 text-blue-800';
      case 'seen':
        return 'bg-yellow-100 text-yellow-800';
      case 'processing':
        return 'bg-orange-100 text-orange-800';
      case 'completed':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Format incident date
  const formatIncidentDate = (timestamp) => {
    if (!timestamp) return 'Unknown date';
    const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (isLoading) {
    return (
      <div className="support-loading">
        <div className="loading-spinner"></div>
        <p>Loading support information...</p>
      </div>
    );
  }

  return (
    <div className="client-support">
      <div className="support-header">
        <h1 className="page-title">Feedback & Support</h1>
        <p className="subtitle">Rate your sessions and get help when you need it</p>
      </div>

      {/* Quick Actions */}
      <div className="support-actions">
        <div className="action-card" onClick={() => setShowRatingModal(true)}>
          <div className="action-icon">
            <Star size={32} />
          </div>
          <h3>Rate Session</h3>
          <p>Share your experience with your therapist</p>
        </div>
        
        <div className="action-card" onClick={() => setShowIssueModal(true)}>
          <div className="action-icon">
            <AlertTriangle size={32} />
          </div>
          <h3>Report Issue</h3>
          <p>Get help with technical problems</p>
        </div>
        
        <div className="action-card" onClick={() => setShowFAQ(true)}>
          <div className="action-icon">
            <HelpCircle size={32} />
          </div>
          <h3>FAQ</h3>
          <p>Find answers to common questions</p>
        </div>
      </div>

      {/* Recent Sessions for Rating */}
      {recentSessions.length > 0 && (
        <div className="recent-sessions">
          <h2 className="section-title">Recent Sessions</h2>
          <div className="sessions-grid">
            {recentSessions.slice(0, 3).map((session) => (
              <div key={session.id} className="session-card">
                <div className="session-info">
                  <h4>Session with {session.therapistName}</h4>
                  <p>{formatSessionDate(session.scheduledTime)}</p>
                  <p className="session-duration">{session.duration} minutes</p>
                </div>
                <button 
                  className="btn-primary"
                  onClick={() => {
                    setSelectedSession(session);
                    setShowRatingModal(true);
                  }}
                >
                  <Star size={16} />
                  Rate Session
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Incident Tracking */}
      <div className="incident-tracking">
        <h2 className="section-title">Incident Tracking</h2>
        
        {/* Incident Search */}
        <div className="incident-search-section">
          <form onSubmit={handleIncidentSearch} className="incident-search-form">
            <div className="search-input-group">
            
              <input
                type="text"
                placeholder="Enter your incident ID to track status..."
                value={incidentSearch}
                onChange={(e) => setIncidentSearch(e.target.value)}
                className="incident-search-input"
              />
              <button 
                type="submit" 
                className="btn-primary"
                disabled={isSearching || !incidentSearch.trim()}
              >
                {isSearching ? 'Searching...' : 'Search'}
              </button>
            </div>
          </form>
        </div>

        {/* Incidents Table */}
        {incidents.length > 0 && (
          <div className="incidents-table-section">
            <h3 className="subsection-title">Your Incident Reports</h3>
            <div className="incidents-table">
              <div className="table-header">
                <div className="table-cell">Incident ID</div>
                <div className="table-cell">Type</div>
                <div className="table-cell">Status</div>
                <div className="table-cell">Severity</div>
                <div className="table-cell">Date Created</div>
                <div className="table-cell">Actions</div>
              </div>
              {incidents.map((incident) => (
                <div key={incident.id} className="table-row">
                  <div className="table-cell">
                    <span className="incident-id">{incident.incidentId}</span>
                  </div>
                  <div className="table-cell">
                    <span className="incident-type">
                      {incident.incidentType?.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </span>
                  </div>
                  <div className="table-cell">
                    <span className={`incident-status ${getIncidentStatusColor(incident.status)}`}>
                      {incident.status?.charAt(0).toUpperCase() + incident.status?.slice(1)}
                    </span>
                  </div>
                  <div className="table-cell">
                    <span className={`severity-badge ${getIncidentStatusColor(incident.severity)}`}>
                      {incident.severity?.charAt(0).toUpperCase() + incident.severity?.slice(1)}
                    </span>
                  </div>
                  <div className="table-cell">
                    <span className="incident-date">
                      {formatIncidentDate(incident.createdAt)}
                    </span>
                  </div>
                  <div className="table-cell">
                    <button 
                      className="btn-secondary btn-sm"
                      onClick={() => {
                        setSearchedIncident(incident);
                        setShowIncidentDetails(true);
                      }}
                    >
                      <Eye size={16} />
                      View Details
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* No Incidents Message */}
        {incidents.length === 0 && (
          <div className="no-incidents">
            <Flag size={48} className="no-incidents-icon" />
            <h3>No Incident Reports</h3>
            <p>You haven't submitted any incident reports yet.</p>
          </div>
        )}
      </div>

      {/* Support Tickets */}
      {supportTickets.length > 0 && (
        <div className="support-tickets">
          <h2 className="section-title">Your Support Tickets</h2>
          <div className="tickets-list">
            {supportTickets.map((ticket) => (
              <div key={ticket.id} className="ticket-card">
                <div className="ticket-header">
                  <h4>{ticket.title}</h4>
                  <span className={`ticket-status ${getTicketStatusColor(ticket.status)}`}>
                    {ticket.status}
                  </span>
                </div>
                <p className="ticket-description">{ticket.description}</p>
                <div className="ticket-meta">
                  <span className="ticket-severity">
                    <AlertTriangle size={14} />
                    {ticket.severity}
                  </span>
                  <span className="ticket-date">
                    <Calendar size={14} />
                    {ticket.createdAt?.toDate ? 
                      ticket.createdAt.toDate().toLocaleDateString() : 
                      'Unknown date'
                    }
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Rating Modal */}
      {showRatingModal && (
        <div className="modal-overlay" onClick={() => setShowRatingModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Rate Your Session</h3>
              <button 
                className="close-btn"
                onClick={() => setShowRatingModal(false)}
              >
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleRatingSubmit}>
              {selectedSession && (
                <div className="session-info">
                  <h4>Session with {selectedSession.therapistName}</h4>
                  <p>{formatSessionDate(selectedSession.scheduledTime)}</p>
                </div>
              )}
              
              <div className="rating-section">
                <label>Overall Session Rating *</label>
                <div className="star-rating">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      className={`star ${star <= rating ? 'active' : ''}`}
                      onClick={() => setRating(star)}
                    >
                      <Star size={24} />
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="rating-section">
                <label>Therapist Rating</label>
                <div className="star-rating">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      className={`star ${star <= ratingTherapist ? 'active' : ''}`}
                      onClick={() => setRatingTherapist(star)}
                    >
                      <Star size={20} />
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="rating-section">
                <label>System/Platform Rating</label>
                <div className="star-rating">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      className={`star ${star <= ratingSystem ? 'active' : ''}`}
                      onClick={() => setRatingSystem(star)}
                    >
                      <Star size={20} />
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="form-group">
                <label>Comments (Optional)</label>
                <textarea
                  value={ratingComment}
                  onChange={(e) => setRatingComment(e.target.value)}
                  placeholder="Share your thoughts about the session..."
                  rows={4}
                />
              </div>
              
              <div className="form-actions">
                <button type="submit" className="btn-primary" disabled={rating === 0}>
                  <Send size={16} />
                  Submit Rating
                </button>
                <button 
                  type="button" 
                  className="btn-secondary"
                  onClick={() => setShowRatingModal(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Issue Reporting Modal */}
      {showIssueModal && (
        <div className="modal-overlay" onClick={() => setShowIssueModal(false)}>
          <div className="modal large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Report an Issue</h3>
              <button 
                className="close-btn"
                onClick={() => setShowIssueModal(false)}
              >
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleIssueSubmit}>
              <div className="form-group">
                <label>Issue Title *</label>
                <input
                  type="text"
                  value={issueForm.title}
                  onChange={(e) => setIssueForm({...issueForm, title: e.target.value})}
                  placeholder="Brief description of the issue"
                  required
                />
              </div>
              
              <div className="form-group">
                <label>Description *</label>
                <textarea
                  value={issueForm.description}
                  onChange={(e) => setIssueForm({...issueForm, description: e.target.value})}
                  placeholder="Please provide detailed information about the issue..."
                  rows={6}
                  required
                />
              </div>
              
              <div className="form-row">
                <div className="form-group">
                  <label>Severity Level</label>
                  <select
                    value={issueForm.severity}
                    onChange={(e) => setIssueForm({...issueForm, severity: e.target.value})}
                  >
                    {severityOptions.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                
                <div className="form-group">
                  <label>Related Session (Optional)</label>
                  <select
                    value={issueForm.relatedSession}
                    onChange={(e) => setIssueForm({...issueForm, relatedSession: e.target.value})}
                  >
                    <option value="">Select a session</option>
                    {recentSessions.map(session => (
                      <option key={session.id} value={session.id}>
                        {formatSessionDate(session.scheduledTime)} - {session.therapistName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              
              <div className="form-group">
                <label>Attachments (Optional)</label>
                <div className="file-upload">
                  <input
                    type="file"
                    multiple
                    accept="image/*,.pdf,.doc,.docx"
                    onChange={(e) => {
                      const files = Array.from(e.target.files);
                      setIssueForm({...issueForm, attachments: [...issueForm.attachments, ...files]});
                    }}
                  />
                  <div className="upload-area">
                    <Upload size={24} />
                    <p>Click to upload files or drag and drop</p>
                    <small>Images, PDFs, and documents supported</small>
                  </div>
                </div>
                {issueForm.attachments.length > 0 && (
                  <div className="attachments-list">
                    {issueForm.attachments.map((file, index) => (
                      <div key={index} className="attachment-item">
                        <FileText size={16} />
                        <span>{file.name}</span>
                        <button 
                          type="button"
                          onClick={() => {
                            const newAttachments = issueForm.attachments.filter((_, i) => i !== index);
                            setIssueForm({...issueForm, attachments: newAttachments});
                          }}
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              <div className="checkbox-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={issueForm.consentToShare}
                    onChange={(e) => setIssueForm({...issueForm, consentToShare: e.target.checked})}
                  />
                  <span>I consent to share this information with my therapist and admin for resolution purposes</span>
                </label>
              </div>
              
              <div className="form-actions">
                <button type="submit" className="btn-primary">
                  <Send size={16} />
                  Submit Issue
                </button>
                <button 
                  type="button" 
                  className="btn-secondary"
                  onClick={() => setShowIssueModal(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* FAQ Modal */}
      {showFAQ && (
        <div className="modal-overlay" onClick={() => setShowFAQ(false)}>
          <div className="modal large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Frequently Asked Questions</h3>
              <button 
                className="close-btn"
                onClick={() => setShowFAQ(false)}
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="faq-search">
              <input
                type="text"
                placeholder="Search FAQs..."
                value={faqSearch}
                onChange={(e) => setFaqSearch(e.target.value)}
              />
            </div>
            
            <div className="faq-list">
              {filteredFAQ.map((item) => (
                <div key={item.id} className="faq-item">
                  <h4>{item.question}</h4>
                  <p>{item.answer}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Incident Details Modal */}
      {showIncidentDetails && searchedIncident && (
        <div className="modal-overlay" onClick={() => setShowIncidentDetails(false)}>
          <div className="modal large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Incident Details</h3>
              <button 
                className="close-btn"
                onClick={() => setShowIncidentDetails(false)}
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="incident-details">
              <div className="incident-header">
                <div className="incident-id-section">
                  <h4>Incident ID: {searchedIncident.incidentId}</h4>
                  <span className={`incident-status ${getIncidentStatusColor(searchedIncident.status)}`}>
                    {searchedIncident.status?.charAt(0).toUpperCase() + searchedIncident.status?.slice(1)}
                  </span>
                </div>
                <div className="incident-meta">
                  <span className="incident-date">
                    <Calendar size={16} />
                    {formatIncidentDate(searchedIncident.createdAt)}
                  </span>
                  <span className={`severity-badge ${getIncidentStatusColor(searchedIncident.severity)}`}>
                    <AlertTriangle size={16} />
                    {searchedIncident.severity?.charAt(0).toUpperCase() + searchedIncident.severity?.slice(1)}
                  </span>
                </div>
              </div>

              <div className="incident-content">
                <div className="incident-section">
                  <h5>Incident Type</h5>
                  <p>{searchedIncident.incidentType?.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}</p>
                </div>

                <div className="incident-section">
                  <h5>Description</h5>
                  <p>{searchedIncident.description}</p>
                </div>

                {searchedIncident.additionalDetails && (
                  <div className="incident-section">
                    <h5>Additional Details</h5>
                    <p>{searchedIncident.additionalDetails}</p>
                  </div>
                )}

                <div className="incident-section">
                  <h5>Reported Against</h5>
                  <p>{searchedIncident.assignedTherapistName}</p>
                </div>

                <div className="incident-section">
                  <h5>Status Timeline</h5>
                  <div className="status-timeline">
                    <div className={`timeline-item ${searchedIncident.status === 'submitted' ? 'active' : 'completed'}`}>
                      <div className="timeline-dot"></div>
                      <div className="timeline-content">
                        <h6>Submitted</h6>
                        <p>Your report has been submitted and is awaiting review</p>
                      </div>
                    </div>
                    <div className={`timeline-item ${searchedIncident.status === 'seen' ? 'active' : searchedIncident.status === 'processing' || searchedIncident.status === 'completed' ? 'completed' : ''}`}>
                      <div className="timeline-dot"></div>
                      <div className="timeline-content">
                        <h6>Seen</h6>
                        <p>Admin has reviewed your report</p>
                      </div>
                    </div>
                    <div className={`timeline-item ${searchedIncident.status === 'processing' ? 'active' : searchedIncident.status === 'completed' ? 'completed' : ''}`}>
                      <div className="timeline-dot"></div>
                      <div className="timeline-content">
                        <h6>Processing</h6>
                        <p>Your report is being investigated</p>
                      </div>
                    </div>
                    <div className={`timeline-item ${searchedIncident.status === 'completed' ? 'active' : ''}`}>
                      <div className="timeline-dot"></div>
                      <div className="timeline-content">
                        <h6>Completed</h6>
                        <p>Investigation completed and action taken</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="modal-actions">
                <button 
                  className="btn-secondary"
                  onClick={() => setShowIncidentDetails(false)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
