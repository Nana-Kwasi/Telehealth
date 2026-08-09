import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../../../services/firestoreShim';
import { 
  collection, 
  query, 
  getDocs, 
  updateDoc, 
  doc,
  orderBy,
  where
} from '../../../services/firestoreShim';
import { 
  Flag, 
  Eye, 
  Clock, 
  CheckCircle, 
  AlertTriangle,
  Search,
  Filter,
  Calendar,
  User,
  MessageSquare,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import './Reports.css';

export default function TherapistReports() {
  const navigate = useNavigate();
  const [reports, setReports] = useState([]);
  const [filteredReports, setFilteredReports] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [selectedReport, setSelectedReport] = useState(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [expandedReports, setExpandedReports] = useState(new Set());

  const currentUser = auth.currentUser;

  const statusOptions = [
    { value: 'all', label: 'All Status', color: 'bg-gray-100 text-gray-800' },
    { value: 'submitted', label: 'Submitted', color: 'bg-blue-100 text-blue-800' },
    { value: 'seen', label: 'Seen', color: 'bg-yellow-100 text-yellow-800' },
    { value: 'processing', label: 'Processing', color: 'bg-orange-100 text-orange-800' },
    { value: 'completed', label: 'Completed', color: 'bg-green-100 text-green-800' }
  ];

  const severityOptions = [
    { value: 'all', label: 'All Severity', color: 'bg-gray-100 text-gray-800' },
    { value: 'low', label: 'Low', color: 'bg-green-100 text-green-800' },
    { value: 'medium', label: 'Medium', color: 'bg-yellow-100 text-yellow-800' },
    { value: 'high', label: 'High', color: 'bg-orange-100 text-orange-800' },
    { value: 'critical', label: 'Critical', color: 'bg-red-100 text-red-800' }
  ];

  useEffect(() => {
    fetchReports();
  }, []);

  useEffect(() => {
    filterReports();
  }, [reports, searchTerm, statusFilter, severityFilter]);

  const fetchReports = async () => {
    try {
      setIsLoading(true);
      
      // Fetch all therapist reports
      const reportsQuery = query(collection(db, 'therapistReports'));
      const reportsSnapshot = await getDocs(reportsQuery);
      const reportsData = reportsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      // Sort by creation date (newest first)
      reportsData.sort((a, b) => {
        const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
        const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
        return dateB - dateA;
      });
      
      setReports(reportsData);
    } catch (error) {
      console.error('Error fetching reports:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const filterReports = () => {
    let filtered = reports;

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(report => 
        report.incidentId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        report.clientName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        report.assignedTherapistName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        report.incidentType?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        report.description?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(report => report.status === statusFilter);
    }

    // Severity filter
    if (severityFilter !== 'all') {
      filtered = filtered.filter(report => report.severity === severityFilter);
    }

    setFilteredReports(filtered);
  };

  const handleStatusUpdate = async (reportId, newStatus) => {
    try {
      setIsUpdating(true);
      
      await updateDoc(doc(db, 'therapistReports', reportId), {
        status: newStatus,
        updatedAt: new Date(),
        updatedBy: currentUser.uid
      });

      // Update local state
      setReports(prevReports => 
        prevReports.map(report => 
          report.id === reportId 
            ? { ...report, status: newStatus, updatedAt: new Date() }
            : report
        )
      );

      alert(`Report status updated to ${newStatus.charAt(0).toUpperCase() + newStatus.slice(1)}`);
    } catch (error) {
      console.error('Error updating report status:', error);
      alert('Error updating report status. Please try again.');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleViewReport = (report) => {
    navigate(`/dashboard/reports/${report.id}`);
  };

  const toggleReportExpansion = (reportId) => {
    setExpandedReports(prev => {
      const newSet = new Set(prev);
      if (newSet.has(reportId)) {
        newSet.delete(reportId);
      } else {
        newSet.add(reportId);
      }
      return newSet;
    });
  };

  const getStatusColor = (status) => {
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

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'low':
        return 'bg-green-100 text-green-800';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800';
      case 'high':
        return 'bg-orange-100 text-orange-800';
      case 'critical':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDate = (timestamp) => {
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

  const getStatusIcon = (status) => {
    switch (status) {
      case 'submitted':
        return <Flag size={16} />;
      case 'seen':
        return <Eye size={16} />;
      case 'processing':
        return <Clock size={16} />;
      case 'completed':
        return <CheckCircle size={16} />;
      default:
        return <AlertTriangle size={16} />;
    }
  };

  if (isLoading) {
    return (
      <div className="reports-loading">
        <div className="loading-spinner"></div>
        <p>Loading reports...</p>
      </div>
    );
  }

  return (
    <div className="therapist-reports">
      <div className="reports-header">
        <h1 className="page-title">Incident Reports</h1>
        <p className="subtitle">Manage and update client incident reports</p>
      </div>

      {/* Filters */}
      <div className="reports-filters">
        <div className="search-section">
          <div className="search-input-group">
            <Search size={20} className="search-icon" />
            <input
              type="text"
              placeholder="Search reports by ID, client, therapist, or description..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
          </div>
        </div>

        <div className="filter-section">
          <div className="filter-group">
            <label>Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="filter-select"
            >
              {statusOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label>Severity</label>
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="filter-select"
            >
              {severityOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Reports List */}
      <div className="reports-list">
        {filteredReports.length === 0 ? (
          <div className="no-reports">
            <Flag size={48} className="no-reports-icon" />
            <h3>No Reports Found</h3>
            <p>No incident reports match your current filters.</p>
          </div>
        ) : (
          filteredReports.map((report) => (
            <div key={report.id} className="report-card">
              <div className="report-header">
                <div className="report-id-section">
                  <h3>Report #{report.incidentId}</h3>
                  <div className="report-badges">
                    <span className={`status-badge ${getStatusColor(report.status)}`}>
                      {getStatusIcon(report.status)}
                      {report.status?.charAt(0).toUpperCase() + report.status?.slice(1)}
                    </span>
                    <span className={`severity-badge ${getSeverityColor(report.severity)}`}>
                      <AlertTriangle size={14} />
                      {report.severity?.charAt(0).toUpperCase() + report.severity?.slice(1)}
                    </span>
                  </div>
                </div>
                <div className="report-actions">
                  <button
                    className="btn-secondary btn-sm"
                    onClick={() => handleViewReport(report)}
                  >
                    <Eye size={16} />
                    View Details
                  </button>
                  <button
                    className="btn-primary btn-sm"
                    onClick={() => toggleReportExpansion(report.id)}
                  >
                    {expandedReports.has(report.id) ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    {expandedReports.has(report.id) ? 'Collapse' : 'Expand'}
                  </button>
                </div>
              </div>

              <div className="report-info">
                <div className="info-row">
                  <div className="info-item">
                    <User size={16} />
                    <span><strong>Client:</strong> {report.clientName}</span>
                  </div>
                  <div className="info-item">
                    <User size={16} />
                    <span><strong>Therapist:</strong> {report.assignedTherapistName}</span>
                  </div>
                  <div className="info-item">
                    <Calendar size={16} />
                    <span><strong>Date:</strong> {formatDate(report.createdAt)}</span>
                  </div>
                </div>

                <div className="info-row">
                  <div className="info-item">
                    <Flag size={16} />
                    <span><strong>Type:</strong> {report.incidentType?.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}</span>
                  </div>
                </div>
              </div>

              {expandedReports.has(report.id) && (
                <div className="report-expanded">
                  <div className="expanded-section">
                    <h4>Description</h4>
                    <p>{report.description}</p>
                  </div>

                  {report.additionalDetails && (
                    <div className="expanded-section">
                      <h4>Additional Details</h4>
                      <p>{report.additionalDetails}</p>
                    </div>
                  )}

                  <div className="status-update-section">
                    <h4>Update Status</h4>
                    <div className="status-buttons">
                      {statusOptions.slice(1).map(option => (
                        <button
                          key={option.value}
                          className={`status-btn ${report.status === option.value ? 'active' : ''}`}
                          onClick={() => handleStatusUpdate(report.id, option.value)}
                          disabled={isUpdating || report.status === option.value}
                        >
                          {getStatusIcon(option.value)}
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Report Details Modal */}
      {showReportModal && selectedReport && (
        <div className="modal-overlay" onClick={() => setShowReportModal(false)}>
          <div className="modal large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Report Details - #{selectedReport.incidentId}</h3>
              <button 
                className="close-btn"
                onClick={() => setShowReportModal(false)}
              >
                ×
              </button>
            </div>
            
            <div className="report-details">
              <div className="details-header">
                <div className="details-badges">
                  <span className={`status-badge ${getStatusColor(selectedReport.status)}`}>
                    {getStatusIcon(selectedReport.status)}
                    {selectedReport.status?.charAt(0).toUpperCase() + selectedReport.status?.slice(1)}
                  </span>
                  <span className={`severity-badge ${getSeverityColor(selectedReport.severity)}`}>
                    <AlertTriangle size={16} />
                    {selectedReport.severity?.charAt(0).toUpperCase() + selectedReport.severity?.slice(1)}
                  </span>
                </div>
                <div className="details-meta">
                  <span><strong>Created:</strong> {formatDate(selectedReport.createdAt)}</span>
                  {selectedReport.updatedAt && (
                    <span><strong>Updated:</strong> {formatDate(selectedReport.updatedAt)}</span>
                  )}
                </div>
              </div>

              <div className="details-content">
                <div className="detail-section">
                  <h4>Client Information</h4>
                  <p><strong>Name:</strong> {selectedReport.clientName}</p>
                  <p><strong>Client ID:</strong> {selectedReport.clientId}</p>
                </div>

                <div className="detail-section">
                  <h4>Therapist Information</h4>
                  <p><strong>Name:</strong> {selectedReport.assignedTherapistName}</p>
                  <p><strong>Therapist ID:</strong> {selectedReport.assignedTherapistId}</p>
                </div>

                <div className="detail-section">
                  <h4>Incident Details</h4>
                  <p><strong>Type:</strong> {selectedReport.incidentType?.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}</p>
                  <p><strong>Description:</strong></p>
                  <p className="description-text">{selectedReport.description}</p>
                  
                  {selectedReport.additionalDetails && (
                    <>
                      <p><strong>Additional Details:</strong></p>
                      <p className="description-text">{selectedReport.additionalDetails}</p>
                    </>
                  )}
                </div>

                <div className="detail-section">
                  <h4>Update Status</h4>
                  <div className="status-buttons">
                    {statusOptions.slice(1).map(option => (
                      <button
                        key={option.value}
                        className={`status-btn ${selectedReport.status === option.value ? 'active' : ''}`}
                        onClick={() => {
                          handleStatusUpdate(selectedReport.id, option.value);
                          setShowReportModal(false);
                        }}
                        disabled={isUpdating || selectedReport.status === option.value}
                      >
                        {getStatusIcon(option.value)}
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}














