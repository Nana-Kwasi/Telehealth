import React, { useState, useEffect } from 'react';
import { Users, Calendar, MessageSquare, TrendingUp, Activity, Clock, Target, Award } from 'lucide-react';

export default function TherapistHome() {
  const [currentTime, setCurrentTime] = useState(new Date());
  
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

  const statsData = [
    {
      title: 'Active Clients',
      value: '8',
      change: '+2 this week',
      icon: Users,
      color: 'bg-blue-500',
      bgColor: 'bg-blue-100'
    },
    {
      title: 'Sessions Today',
      value: '3',
      change: '2 completed',
      icon: Calendar,
      color: 'bg-green-500',
      bgColor: 'bg-green-100'
    },
    {
      title: 'Unread Messages',
      value: '5',
      change: '+3 new',
      icon: MessageSquare,
      color: 'bg-purple-500',
      bgColor: 'bg-purple-100'
    },
    {
      title: 'Client Progress',
      value: '87%',
      change: '+5% avg',
      icon: TrendingUp,
      color: 'bg-orange-500',
      bgColor: 'bg-orange-100'
    }
  ];

  const todayAppointments = [
    { time: '9:00 AM', client: 'Sarah Johnson', type: 'Individual', status: 'completed' },
    { time: '11:00 AM', client: 'Mike Chen', type: 'Couples', status: 'completed' },
    { time: '2:00 PM', client: 'Emma Davis', type: 'Individual', status: 'upcoming' },
    { time: '4:00 PM', client: 'Alex Thompson', type: 'Teen', status: 'upcoming' }
  ];

  const recentActivities = [
    { type: 'session', text: 'Completed session with Sarah Johnson', time: '1 hour ago', icon: '🎯' },
    { type: 'message', text: 'Responded to Mike Chen\'s message', time: '2 hours ago', icon: '💬' },
    { type: 'note', text: 'Updated progress notes for Emma Davis', time: '3 hours ago', icon: '📝' },
    { type: 'goal', text: 'Set new goal for Alex Thompson', time: '1 day ago', icon: '🎯' }
  ];

  const clientProgress = [
    { name: 'Sarah Johnson', progress: 85, lastSession: 'Today', nextSession: 'Next week' },
    { name: 'Mike Chen', progress: 72, lastSession: 'Today', nextSession: 'Next week' },
    { name: 'Emma Davis', progress: 65, lastSession: '2 days ago', nextSession: 'Today' },
    { name: 'Alex Thompson', progress: 45, lastSession: '3 days ago', nextSession: 'Today' }
  ];

  return (
    <div className="dashboard-home">
      {/* Header with Live Time */}
      <div className="dashboard-header">
        <div className="header-content">
          <div className="welcome-section">
            <h1 className="welcome-title">Welcome back, Therapist!</h1>
            <p className="welcome-subtitle">
              Here's what's happening with your clients today
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
          {statsData.map((stat, index) => (
            <div key={index} className="stat-card">
              <div className={`stat-icon ${stat.bgColor}`}>
                <stat.icon className={stat.color.replace('bg-', 'text-')} size={24} />
              </div>
              <div className="stat-content">
                <h3 className="stat-value">{stat.value}</h3>
                <p className="stat-label">{stat.title}</p>
                <span className="stat-change">{stat.change}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Today's Schedule & Recent Activities */}
      <div className="schedule-section">
        <div className="schedule-grid">
          {/* Today's Appointments */}
          <div className="schedule-card">
            <h3 className="card-title">Today's Schedule</h3>
            <div className="appointments-list">
              {todayAppointments.map((appointment, index) => (
                <div key={index} className={`appointment-item ${appointment.status}`}>
                  <div className="appointment-time">{appointment.time}</div>
                  <div className="appointment-content">
                    <h4 className="appointment-client">{appointment.client}</h4>
                    <p className="appointment-type">{appointment.type}</p>
                  </div>
                  <div className={`appointment-status ${appointment.status}`}>
                    {appointment.status === 'completed' ? '✓' : '⏰'}
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

      {/* Client Progress Overview */}
      <div className="progress-section">
        <h2 className="section-title">Client Progress Overview</h2>
        <div className="progress-grid">
          {clientProgress.map((client, index) => (
            <div key={index} className="client-progress-card">
              <div className="client-header">
                <h4 className="client-name">{client.name}</h4>
                <span className="progress-percentage">{client.progress}%</span>
              </div>
              <div className="progress-bar">
                <div 
                  className="progress-fill bg-green-500"
                  style={{ width: `${client.progress}%` }}
                ></div>
              </div>
              <div className="client-sessions">
                <span className="last-session">Last: {client.lastSession}</span>
                <span className="next-session">Next: {client.nextSession}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="quick-actions">
        <h2 className="section-title">Quick Actions</h2>
        <div className="actions-grid">
          <div className="action-card">
            <div className="action-icon bg-blue-100">
              <MessageSquare className="text-blue-600" size={24} />
            </div>
            <h3>Check Messages</h3>
            <p>5 unread messages from clients</p>
          </div>
          <div className="action-card">
            <div className="action-icon bg-green-100">
              <Calendar className="text-green-600" size={24} />
            </div>
            <h3>View Schedule</h3>
            <p>3 appointments today</p>
          </div>
          <div className="action-card">
            <div className="action-icon bg-purple-100">
              <Users className="text-purple-600" size={24} />
            </div>
            <h3>Client List</h3>
            <p>8 active clients</p>
          </div>
          <div className="action-card">
            <div className="action-icon bg-orange-100">
              <Award className="text-orange-600" size={24} />
            </div>
            <h3>Progress Notes</h3>
            <p>Update client progress</p>
          </div>
        </div>
      </div>
    </div>
  );
}


