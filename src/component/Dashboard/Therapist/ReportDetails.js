import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../../Auth/firebaseConfig';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { ArrowLeft, AlertTriangle, CheckCircle, Clock, XCircle, Flag, Eye } from 'lucide-react';
import './ReportDetails.css';

const statusOptions = [
  { value: 'submitted', label: 'Submitted', icon: Flag },
  { value: 'seen', label: 'Seen', icon: Eye },
  { value: 'processing', label: 'Processing', icon: Clock },
  { value: 'completed', label: 'Completed', icon: CheckCircle }
];

const getStatusColor = (status) => {
  const colors = {
    submitted: 'submitted',
    seen: 'seen',
    processing: 'processing',
    completed: 'resolved'
  };
  return colors[status] || 'submitted';
};

const getStatusIcon = (status) => {
  const option = statusOptions.find(opt => opt.value === status);
  return option ? option.icon : Clock;
};

const formatDate = (timestamp) => {
  if (!timestamp) return 'N/A';
  if (timestamp.toDate) {
    return timestamp.toDate().toLocaleString();
  }
  return new Date(timestamp).toLocaleString();
};

export default function ReportDetails() {
  const { reportId } = useParams();
  const navigate = useNavigate();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    const fetchReport = async () => {
      try {
        // Try therapistReports collection first (where reports are actually stored)
        let reportDoc = await getDoc(doc(db, 'therapistReports', reportId));
        if (!reportDoc.exists()) {
          // Fallback to reports collection if not found
          reportDoc = await getDoc(doc(db, 'reports', reportId));
        }
        if (reportDoc.exists()) {
          setReport({ id: reportDoc.id, ...reportDoc.data() });
        }
      } catch (error) {
        console.error('Error fetching report:', error);
      } finally {
        setLoading(false);
      }
    };

    if (reportId) {
      fetchReport();
    }
  }, [reportId]);

  const handleStatusUpdate = async (newStatus) => {
    if (!report) return;
    
    setIsUpdating(true);
    try {
      // Try therapistReports collection first
      const reportRef = doc(db, 'therapistReports', report.id);
      let reportDoc = await getDoc(reportRef);
      
      if (!reportDoc.exists()) {
        // Fallback to reports collection
        reportDoc = await getDoc(doc(db, 'reports', report.id));
        if (reportDoc.exists()) {
          await updateDoc(doc(db, 'reports', report.id), {
            status: newStatus,
            updatedAt: serverTimestamp()
          });
        }
      } else {
        await updateDoc(reportRef, {
          status: newStatus,
          updatedAt: serverTimestamp()
        });
      }
      
      setReport({ ...report, status: newStatus });
      alert(`Report status updated to ${newStatus.charAt(0).toUpperCase() + newStatus.slice(1)}`);
    } catch (error) {
      console.error('Error updating status:', error);
      alert('Failed to update status');
    } finally {
      setIsUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className="page-container">
        <div className="loading-state">Loading report details...</div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="page-container">
        <div className="error-state">Report not found</div>
        <button onClick={() => navigate('/dashboard/reports')} className="btn-primary">
          Back to Reports
        </button>
      </div>
    );
  }

  const StatusIcon = getStatusIcon(report.status);

  return (
    <div className="page-container report-details-page">
      <div className="page-header">
        <button onClick={() => navigate('/dashboard/reports')} className="back-button">
          <ArrowLeft size={20} />
          Back to Reports
        </button>
        <h1 className="page-title">Report Details - #{report.incidentId}</h1>
      </div>

      <div className="report-details-content">
        <div className="details-header">
          <div className="details-badges">
            <span className={`status-badge ${getStatusColor(report.status)}`}>
              <StatusIcon size={16} />
              {report.status?.charAt(0).toUpperCase() + report.status?.slice(1)}
            </span>
            <span className={`severity-badge ${report.severity}`}>
              <AlertTriangle size={16} />
              {report.severity?.charAt(0).toUpperCase() + report.severity?.slice(1)}
            </span>
          </div>
          <div className="details-meta">
            <span><strong>Created:</strong> {formatDate(report.createdAt)}</span>
            {report.updatedAt && (
              <span><strong>Updated:</strong> {formatDate(report.updatedAt)}</span>
            )}
          </div>
        </div>

        <div className="details-content">
          <div className="detail-section">
            <h3>Client Information</h3>
            <div className="detail-item">
              <strong>Name:</strong> {report.clientName}
            </div>
            <div className="detail-item">
              <strong>Client ID:</strong> {report.clientId}
            </div>
          </div>

          <div className="detail-section">
            <h3>Therapist Information</h3>
            <div className="detail-item">
              <strong>Name:</strong> {report.assignedTherapistName}
            </div>
            <div className="detail-item">
              <strong>Therapist ID:</strong> {report.assignedTherapistId}
            </div>
          </div>

          <div className="detail-section">
            <h3>Incident Details</h3>
            <div className="detail-item">
              <strong>Type:</strong> {report.incidentType?.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
            </div>
            <div className="detail-item">
              <strong>Description:</strong>
              <p className="description-text">{report.description}</p>
            </div>
            
            {report.additionalDetails && (
              <div className="detail-item">
                <strong>Additional Details:</strong>
                <p className="description-text">{report.additionalDetails}</p>
              </div>
            )}
          </div>

          <div className="detail-section">
            <h3>Update Status</h3>
            <div className="status-buttons">
              {statusOptions.slice(1).map(option => {
                const OptionIcon = option.icon;
                return (
                  <button
                    key={option.value}
                    className={`status-btn ${report.status === option.value ? 'active' : ''}`}
                    onClick={() => handleStatusUpdate(option.value)}
                    disabled={isUpdating || report.status === option.value}
                  >
                    <OptionIcon size={16} />
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
