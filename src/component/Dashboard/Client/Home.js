import React, { useState, useEffect } from 'react';
import { MessageSquare, Calendar, User, BookOpen, Clock, TrendingUp, Activity, Target } from 'lucide-react';

export default function ClientHome() {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [clientData] = useState(() => {
    try { return JSON.parse(localStorage.getItem('th.onboard') || '{}'); } catch { return {}; }
  });
  
  const therapistName = clientData.assignedTherapistName || 'Your therapist';

  // Update time every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const formatTime = (date) => {
    return date.toLocaleTimeString('en-US', { 
      hour12: true, 
      hour: 'numeric', 
      minute: '2-digit', 
      second: '2-digit' 
    });
  };

  const formatDate = (date) => {
    return date.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  const dashboardCards = [
    {
      title: 'Messages',
      description: 'Chat with your therapist',
      icon: MessageSquare,
      color: 'bg-blue-500',
      value: '2 unread',
      trend: '+1 new'
    },
    {
      title: 'Schedule',
      description: 'Book and manage sessions',
      icon: Calendar,
      color: 'bg-green-500',
      value: 'Next: Tomorrow',
      trend: '2 upcoming'
    },
    {
      title: 'Profile',
      description: 'Update your preferences',
      icon: User,
      color: 'bg-purple-500',
      value: '85% complete',
      trend: '+5% this week'
    },
    {
      title: 'Resources',
      description: 'Self-help tools and articles',
      icon: BookOpen,
      color: 'bg-orange-500',
      value: '12 available',
      trend: '3 new this week'
    }
  ];

  const progressData = [
    { label: 'Mood Improvement', value: 75, color: 'bg-green-500' },
    { label: 'Stress Management', value: 60, color: 'bg-blue-500' },
    { label: 'Sleep Quality', value: 45, color: 'bg-yellow-500' },
    { label: 'Goal Achievement', value: 80, color: 'bg-purple-500' }
  ];

  const recentActivities = [
    { type: 'session', text: 'Completed therapy session', time: '2 hours ago', icon: '🎯' },
    { type: 'message', text: 'Received message from therapist', time: '1 day ago', icon: '💬' },
    { type: 'resource', text: 'Completed breathing exercise', time: '2 days ago', icon: '🧘' },
    { type: 'goal', text: 'Set new weekly goal', time: '3 days ago', icon: '🎯' }
  ];

  return (
    <div className="dashboard-home">
      {/* Header with Live Time */}
      <div className="dashboard-header">
        <div className="header-content">
          <div className="welcome-section">
            <h1 className="welcome-title">Welcome back!</h1>
            <p className="welcome-subtitle">
              Ready to continue your therapy journey with {therapistName}?
            </p>
          </div>
          <div className="time-section">
            <div className="current-time">{formatTime(currentTime)}</div>
            <div className="current-date">{formatDate(currentTime)}</div>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="stats-section">
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon bg-blue-100">
              <Calendar className="text-blue-600" size={24} />
            </div>
            <div className="stat-content">
              <h3 className="stat-value">12</h3>
              <p className="stat-label">Sessions Completed</p>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon bg-green-100">
              <TrendingUp className="text-green-600" size={24} />
            </div>
            <div className="stat-content">
              <h3 className="stat-value">85%</h3>
              <p className="stat-label">Progress Score</p>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon bg-purple-100">
              <Target className="text-purple-600" size={24} />
            </div>
            <div className="stat-content">
              <h3 className="stat-value">8</h3>
              <p className="stat-label">Goals Achieved</p>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon bg-orange-100">
              <Activity className="text-orange-600" size={24} />
            </div>
            <div className="stat-content">
              <h3 className="stat-value">24</h3>
              <p className="stat-label">Days Active</p>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="quick-actions">
        <h2 className="section-title">Quick Actions</h2>
        <div className="cards-grid">
          {dashboardCards.map((card) => (
            <div key={card.title} className="dashboard-card">
              <div className={`card-icon ${card.color}`}>
                <card.icon size={24} />
              </div>
              <div className="card-content">
                <h3 className="card-title">{card.title}</h3>
                <p className="card-description">{card.description}</p>
                <div className="card-stats">
                  <span className="card-value">{card.value}</span>
                  <span className="card-trend">{card.trend}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Progress & Activities */}
      <div className="progress-section">
        <div className="progress-grid">
          {/* Progress Tracking */}
          <div className="progress-card">
            <h3 className="card-title">Your Progress</h3>
            <div className="progress-items">
              {progressData.map((item, index) => (
                <div key={index} className="progress-item">
                  <div className="progress-header">
                    <span className="progress-label">{item.label}</span>
                    <span className="progress-percentage">{item.value}%</span>
                  </div>
                  <div className="progress-bar">
                    <div 
                      className={`progress-fill ${item.color}`}
                      style={{ width: `${item.value}%` }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Activities */}
          <div className="activities-card">
            <h3 className="card-title">Recent Activities</h3>
            <div className="activities-list">
              {recentActivities.map((activity, index) => (
                <div key={index} className="activity-item">
                  <div className="activity-icon">{activity.icon}</div>
                  <div className="activity-content">
                    <p className="activity-text">{activity.text}</p>
                    <span className="activity-time">{activity.time}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Therapy Progress Summary */}
      <div className="therapy-progress">
        <h2 className="section-title">Your Therapy Progress</h2>
        <div className="progress-summary">
          <div className="progress-item">
            <span className="progress-label">Therapy Type:</span>
            <span className="progress-value">{clientData.therapyType || 'Individual'}</span>
          </div>
          <div className="progress-item">
            <span className="progress-label">Sessions Completed:</span>
            <span className="progress-value">12</span>
          </div>
          <div className="progress-item">
            <span className="progress-label">Current Goal:</span>
            <span className="progress-value">Managing anxiety</span>
          </div>
          <div className="progress-item">
            <span className="progress-label">Next Session:</span>
            <span className="progress-value">Tomorrow at 2:00 PM</span>
          </div>
        </div>
      </div>
    </div>
  );
}


