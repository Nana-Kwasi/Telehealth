import React, { useState, useEffect } from 'react';
import { 
  FileText, 
  Download, 
  Calendar,
  Filter,
  Users,
  Shield,
  LogIn,
  LogOut,
  Activity,
  Clock,
  Search,
  RefreshCw
} from 'lucide-react';
import { auth, db } from '../../../services/firestoreShim';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  getDocs,
  Timestamp
} from '../../../services/firestoreShim';
import './Logs.css';
import { downloadLogsPdf } from '../../../utils/brandedPdf';

export default function TherapistLogs() {
  const [selectedLogType, setSelectedLogType] = useState('all');
  const [dateRange, setDateRange] = useState({
    startDate: '',
    endDate: ''
  });
  const [logs, setLogs] = useState({
    auditLogs: [],
    loginLogs: [],
    userLoginLogs: [],
    userLogoutLogs: []
  });
  const [filteredLogs, setFilteredLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [userNames, setUserNames] = useState({});

  const currentUser = auth.currentUser;

  // Debug logging
  console.log('TherapistLogs component rendered');
  console.log('Current user:', currentUser);

  const logTypes = {
    all: { name: 'All Logs', icon: Activity, color: 'blue' },
    auditLogs: { name: 'Audit Logs', icon: Shield, color: 'red' },
    loginLogs: { name: 'Login Logs', icon: LogIn, color: 'green' },
    userLoginLogs: { name: 'User Login Logs', icon: Users, color: 'purple' },
    userLogoutLogs: { name: 'User Logout Logs', icon: LogOut, color: 'orange' }
  };

  // Function to fetch user names
  const fetchUserNames = async (userIds) => {
    if (userIds.length === 0) return;
    
    try {
      const uniqueUserIds = [...new Set(userIds)];
      const userPromises = uniqueUserIds.map(async (userId) => {
        try {
          // Try to get from therapists collection first
          const therapistQuery = query(collection(db, 'therapists'), where('uid', '==', userId));
          const therapistSnapshot = await getDocs(therapistQuery);
          
          if (!therapistSnapshot.empty) {
            const therapistData = therapistSnapshot.docs[0].data();
            return {
              id: userId,
              name: therapistData.name || therapistData.displayName || 'Unknown Therapist',
              type: 'therapist'
            };
          }
          
          // Try to get from clients collection
          const clientQuery = query(collection(db, 'clients'), where('id', '==', userId));
          const clientSnapshot = await getDocs(clientQuery);
          
          if (!clientSnapshot.empty) {
            const clientData = clientSnapshot.docs[0].data();
            return {
              id: userId,
              name: clientData.name || 'Unknown Client',
              type: 'client'
            };
          }
          
          return {
            id: userId,
            name: 'Unknown User',
            type: 'unknown'
          };
        } catch (error) {
          console.error(`Error fetching user ${userId}:`, error);
          return {
            id: userId,
            name: 'Unknown User',
            type: 'unknown'
          };
        }
      });
      
      const userResults = await Promise.all(userPromises);
      const userNamesMap = {};
      userResults.forEach(user => {
        userNamesMap[user.id] = user;
      });
      
      setUserNames(prev => ({ ...prev, ...userNamesMap }));
    } catch (error) {
      console.error('Error fetching user names:', error);
    }
  };

  // Fetch logs based on selected type and date range
  useEffect(() => {
    if (!currentUser) return;

    const fetchLogs = async () => {
      setLoading(true);
      try {
        const startDate = dateRange.startDate ? new Date(dateRange.startDate) : null;
        const endDate = dateRange.endDate ? new Date(dateRange.endDate) : null;

        const newLogs = { ...logs };

        // Fetch audit logs
        if (selectedLogType === 'all' || selectedLogType === 'auditLogs') {
          let auditQuery = query(collection(db, 'auditLogs'), orderBy('timestamp', 'desc'));
          if (startDate && endDate) {
            auditQuery = query(
              collection(db, 'auditLogs'),
              where('timestamp', '>=', Timestamp.fromDate(startDate)),
              where('timestamp', '<=', Timestamp.fromDate(endDate)),
              orderBy('timestamp', 'desc')
            );
          }
          const auditSnapshot = await getDocs(auditQuery);
          newLogs.auditLogs = auditSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        }

        // Fetch login logs
        if (selectedLogType === 'all' || selectedLogType === 'loginLogs') {
          let loginQuery = query(collection(db, 'loginLogs'), orderBy('timestamp', 'desc'));
          if (startDate && endDate) {
            loginQuery = query(
              collection(db, 'loginLogs'),
              where('timestamp', '>=', Timestamp.fromDate(startDate)),
              where('timestamp', '<=', Timestamp.fromDate(endDate)),
              orderBy('timestamp', 'desc')
            );
          }
          const loginSnapshot = await getDocs(loginQuery);
          newLogs.loginLogs = loginSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        }

        // Fetch user login logs
        if (selectedLogType === 'all' || selectedLogType === 'userLoginLogs') {
          let userLoginQuery = query(collection(db, 'userLoginLogs'), orderBy('timestamp', 'desc'));
          if (startDate && endDate) {
            userLoginQuery = query(
              collection(db, 'userLoginLogs'),
              where('timestamp', '>=', Timestamp.fromDate(startDate)),
              where('timestamp', '<=', Timestamp.fromDate(endDate)),
              orderBy('timestamp', 'desc')
            );
          }
          const userLoginSnapshot = await getDocs(userLoginQuery);
          newLogs.userLoginLogs = userLoginSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        }

        // Fetch user logout logs
        if (selectedLogType === 'all' || selectedLogType === 'userLogoutLogs') {
          let userLogoutQuery = query(collection(db, 'userLogoutLogs'), orderBy('timestamp', 'desc'));
          if (startDate && endDate) {
            userLogoutQuery = query(
              collection(db, 'userLogoutLogs'),
              where('timestamp', '>=', Timestamp.fromDate(startDate)),
              where('timestamp', '<=', Timestamp.fromDate(endDate)),
              orderBy('timestamp', 'desc')
            );
          }
          const userLogoutSnapshot = await getDocs(userLogoutQuery);
          newLogs.userLogoutLogs = userLogoutSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        }

        setLogs(newLogs);

        // Collect all user IDs from the logs
        const allUserIds = [];
        Object.values(newLogs).forEach(logArray => {
          logArray.forEach(log => {
            if (log.userId) allUserIds.push(log.userId);
            if (log.adminId) allUserIds.push(log.adminId);
            if (log.clientId) allUserIds.push(log.clientId);
          });
        });

        // Fetch user names
        if (allUserIds.length > 0) {
          await fetchUserNames(allUserIds);
        }
      } catch (error) {
        console.error('Error fetching logs:', error);
        alert('Error fetching logs. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchLogs();
  }, [selectedLogType, dateRange, currentUser]);

  // Filter logs based on search query
  useEffect(() => {
    let allLogs = [];
    
    if (selectedLogType === 'all') {
      allLogs = [
        ...logs.auditLogs.map(log => ({ ...log, type: 'audit' })),
        ...logs.loginLogs.map(log => ({ ...log, type: 'login' })),
        ...logs.userLoginLogs.map(log => ({ ...log, type: 'userLogin' })),
        ...logs.userLogoutLogs.map(log => ({ ...log, type: 'userLogout' }))
      ];
    } else {
      const logType = selectedLogType.replace('Logs', '').toLowerCase();
      allLogs = logs[selectedLogType]?.map(log => ({ ...log, type: logType })) || [];
    }

    // Sort by timestamp
    allLogs.sort((a, b) => {
      const aTime = a.timestamp?.toDate?.() || new Date(a.timestamp);
      const bTime = b.timestamp?.toDate?.() || new Date(b.timestamp);
      return bTime - aTime;
    });

    // Apply search filter
    if (searchQuery) {
      allLogs = allLogs.filter(log => {
        const searchLower = searchQuery.toLowerCase();
        return (
          log.action?.toLowerCase().includes(searchLower) ||
          log.adminName?.toLowerCase().includes(searchLower) ||
          log.adminEmail?.toLowerCase().includes(searchLower) ||
          log.userId?.toLowerCase().includes(searchLower) ||
          log.userRole?.toLowerCase().includes(searchLower) ||
          log.clientName?.toLowerCase().includes(searchLower) ||
          log.description?.toLowerCase().includes(searchLower)
        );
      });
    }

    setFilteredLogs(allLogs);
  }, [logs, selectedLogType, searchQuery]);

  // Generate PDF report
  //
  // The report used to be built here with raw jsPDF calls — no header, no
  // watermark, no footer and its own margins, so a downloaded log report looked
  // nothing like the notes and resources the same system hands out. It now goes
  // through the shared branded builder, which owns that livery in one place.
  const generatePDFReport = () => {
    const rangeLabel = dateRange.startDate && dateRange.endDate
      ? `${dateRange.startDate} to ${dateRange.endDate}`
      : 'All time';
    const logTypeLabel = selectedLogType === 'all'
      ? 'All logs'
      : (logTypes[selectedLogType]?.name || selectedLogType);

    downloadLogsPdf(
      filteredLogs.map(log => ({ ...log, typeLabel: logTypes[log.type]?.name || log.type })),
      {
        logTypeLabel,
        rangeLabel,
        generatedBy: currentUser?.displayName || currentUser?.email || '',
        userNames,
      },
    );
  };

  // Format timestamp
  const formatTimestamp = (timestamp) => {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString();
  };

  // Get log icon
  const getLogIcon = (logType) => {
    const LogIcon = logTypes[logType]?.icon || Activity;
    return <LogIcon size={16} />;
  };

  // Get log color
  const getLogColor = (logType) => {
    return logTypes[logType]?.color || 'blue';
  };

  // Early return for debugging
  if (!currentUser) {
    return (
      <div className="logs-dashboard">
        <div className="logs-header">
          <h1>System Logs</h1>
          <p>Loading user authentication...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="logs-dashboard">
      <div className="logs-header">
        <div className="header-content">
          <h1 className="page-title">System Logs</h1>
          <p className="subtitle">Monitor system activity, user actions, and security events</p>
        </div>
        <div className="header-actions">
          <button 
            className="btn-primary"
            onClick={generatePDFReport}
            disabled={filteredLogs.length === 0}
          >
            <Download size={16} />
            Generate PDF Report
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="filters-section">
        <div className="filter-group">
          <label>Log Type</label>
          <select
            value={selectedLogType}
            onChange={(e) => setSelectedLogType(e.target.value)}
          >
            {Object.entries(logTypes).map(([key, type]) => (
              <option key={key} value={key}>{type.name}</option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label>Start Date</label>
          <input
            type="date"
            value={dateRange.startDate}
            onChange={(e) => setDateRange(prev => ({ ...prev, startDate: e.target.value }))}
          />
        </div>

        <div className="filter-group">
          <label>End Date</label>
          <input
            type="date"
            value={dateRange.endDate}
            onChange={(e) => setDateRange(prev => ({ ...prev, endDate: e.target.value }))}
          />
        </div>

        <div className="filter-group">
          <label>Search</label>
          <div className="search-input">
            <Search size={16} />
            <input
              type="text"
              placeholder="Search logs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <button 
          className="btn-secondary"
          onClick={() => {
            setDateRange({ startDate: '', endDate: '' });
            setSearchQuery('');
          }}
        >
          <RefreshCw size={16} />
          Clear Filters
        </button>
      </div>

      {/* Logs List */}
      <div className="logs-content">
        {loading ? (
          <div className="loading-state">
            <RefreshCw size={24} className="spinning" />
            <p>Loading logs...</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="empty-state">
            <FileText size={48} />
            <h3>No logs found</h3>
            <p>Try adjusting your filters or date range</p>
          </div>
        ) : (
          <div className="logs-list">
            {filteredLogs.map((log, index) => (
              <div key={`${log.type}-${log.id || index}`} className="log-item">
                <div className="log-header">
                  <div className="log-type">
                    {getLogIcon(log.type)}
                    <span className={`log-type-name ${getLogColor(log.type)}`}>
                      {logTypes[log.type]?.name || log.type.toUpperCase()}
                    </span>
                  </div>
                  <div className="log-timestamp">
                    <Clock size={14} />
                    <span>{formatTimestamp(log.timestamp)}</span>
                  </div>
                </div>

                <div className="log-content">
                  {log.action && (
                    <div className="log-field">
                      <strong>Action:</strong> {log.action}
                    </div>
                  )}

                  {log.adminName && (
                    <div className="log-field">
                      <strong>Admin:</strong> {log.adminName} ({log.adminEmail})
                    </div>
                  )}

                  {log.userId && (
                    <div className="log-field">
                      <strong>User:</strong> {
                        userNames[log.userId] 
                          ? `${userNames[log.userId].name} (${userNames[log.userId].type})`
                          : log.userId
                      }
                    </div>
                  )}

                  {log.userRole && (
                    <div className="log-field">
                      <strong>Role:</strong> {log.userRole}
                    </div>
                  )}

                  {(log.clientId || log.clientName) && (
                    <div className="log-field">
                      <strong>Client:</strong> {
                        log.clientId && userNames[log.clientId]
                          ? userNames[log.clientId].name
                          : (log.clientName || log.clientId)
                      }
                    </div>
                  )}

                  {log.description && (
                    <div className="log-field">
                      <strong>Description:</strong> {log.description}
                    </div>
                  )}

                  {log.success !== undefined && (
                    <div className="log-field">
                      <strong>Success:</strong> 
                      <span className={log.success ? 'success' : 'error'}>
                        {log.success ? ' Yes' : ' No'}
                      </span>
                    </div>
                  )}

                  {log.sessionDuration && (
                    <div className="log-field">
                      <strong>Session Duration:</strong> {Math.round(log.sessionDuration / 60)} minutes
                    </div>
                  )}

                  {log.ipAddress && (
                    <div className="log-field">
                      <strong>IP Address:</strong> {log.ipAddress}
                    </div>
                  )}

                  {log.errorMessage && (
                    <div className="log-field error">
                      <strong>Error:</strong> {log.errorMessage}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Summary */}
      {filteredLogs.length > 0 && (
        <div className="logs-summary">
          <h3>Summary</h3>
          <div className="summary-stats">
            <div className="stat-item">
              <span className="stat-label">Total Logs:</span>
              <span className="stat-value">{filteredLogs.length}</span>
            </div>
            {selectedLogType === 'all' && (
              <>
                <div className="stat-item">
                  <span className="stat-label">Audit Logs:</span>
                  <span className="stat-value">{logs.auditLogs.length}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Login Logs:</span>
                  <span className="stat-value">{logs.loginLogs.length}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">User Login Logs:</span>
                  <span className="stat-value">{logs.userLoginLogs.length}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">User Logout Logs:</span>
                  <span className="stat-value">{logs.userLogoutLogs.length}</span>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
