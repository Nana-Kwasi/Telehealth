import React from 'react';
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { 
  Home, 
  MessageSquare, 
  Video, 
  Calendar, 
  BookOpen, 
  CreditCard, 
  Settings, 
  HelpCircle,
  LogOut
} from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth } from '../../Auth/firebaseConfig';
import './ClientDashboard.css';
import '../DashboardShell.css';

// Import all client dashboard components
import ClientHome from './Home';
import ClientMessages from './Messages';
import ClientVideoCall from './VideoCall';
import ClientSchedule from './Schedule';
// import ClientProfile from './Profile';
import ClientResources from './Resources';
import ClientBilling from './Billing';
import ClientSettings from './Settings';
import ClientSupport from './Support';

export default function ClientDashboard({ profile }) {
  const location = useLocation();
  const navigate = useNavigate();
  
  // Get client data from localStorage
  const clientData = JSON.parse(localStorage.getItem('th.onboard') || '{}');
  const therapistName = clientData.assignedTherapistName || 'Your therapist';

  const navigationItems = [
    { path: '/dashboard', icon: Home, label: 'Home', component: ClientHome },
    { path: '/dashboard/messages', icon: MessageSquare, label: 'Therapist', component: ClientMessages },
    { path: '/dashboard/video', icon: Video, label: 'Schedule', component: ClientVideoCall },
    { path: '/dashboard/schedule', icon: Calendar, label: 'Calendar', component: ClientSchedule },
    // { path: '/dashboard/profile', icon: User, label: 'Profile', component: ClientProfile },
    { path: '/dashboard/resources', icon: BookOpen, label: 'Resources', component: ClientResources },
    { path: '/dashboard/billing', icon: CreditCard, label: 'Billing', component: ClientBilling },
    { path: '/dashboard/settings', icon: Settings, label: 'Settings', component: ClientSettings },
    { path: '/dashboard/support', icon: HelpCircle, label: 'Support', component: ClientSupport }
  ];

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate('/');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const isActiveRoute = (path) => {
    if (path === '/dashboard') {
      return location.pathname === '/dashboard';
    }
    return location.pathname.startsWith(path);
  };

  const handleProfileImageUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    try {
      // Here you would typically upload to Firebase Storage
      // For now, we'll create a local URL
      const imageUrl = URL.createObjectURL(file);
      
      // Update profile with new image URL
      // In a real app, you'd upload to Firebase Storage and update the profile document
      console.log('Profile image uploaded:', imageUrl);
      
      // You can add Firebase Storage upload logic here
      // const storageRef = ref(storage, `profile-images/${profile.id}`);
      // await uploadBytes(storageRef, file);
      // const downloadURL = await getDownloadURL(storageRef);
      
    } catch (error) {
      console.error('Error uploading profile image:', error);
    }
  };

  return (
    <div className="client-dashboard">
      {/* Sidebar */}
      <aside className="client-sidebar">
        <div className="sidebar-header">
          <div className="logo">
            <h2>NessaHub</h2>
          </div>
          <div className="user-info">
            <div className="user-avatar" onClick={() => document.getElementById('profile-image-input').click()}>
              {profile?.photoURL ? (
                <img src={profile.photoURL} alt="Profile" />
              ) : (
                <span>{profile?.name ? profile.name.charAt(0).toUpperCase() : 'C'}</span>
              )}
              <div className="avatar-overlay">
                <span>📷</span>
              </div>
            </div>
            <input
              id="profile-image-input"
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleProfileImageUpload}
            />
            <div className="user-details">
              <p className="user-name">{profile?.name || 'Client'}</p>
              <p className="user-role">Client</p>
            </div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section">
            <h3>NAVIGATION</h3>
            <ul className="nav-list">
              {navigationItems.map((item) => (
                <li key={item.path}>
                  <button
                    className={`nav-item ${isActiveRoute(item.path) ? 'active' : ''}`}
                    onClick={() => navigate(item.path)}
                  >
                    <item.icon size={20} />
                    <span>{item.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </nav>

        <div className="sidebar-footer">
          <button className="logout-btn" onClick={handleLogout}>
            <LogOut size={20} />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="client-main">
        <Routes>
          <Route path="/" element={<ClientHome />} />
          <Route path="/messages" element={<ClientMessages />} />
          <Route path="/video" element={<ClientVideoCall profile={profile} />} />
          <Route path="/schedule" element={<ClientSchedule />} />
          {/* <Route path="/profile" element={<ClientProfile />} /> */}
          <Route path="/resources" element={<ClientResources />} />
          <Route path="/billing" element={<ClientBilling />} />
          <Route path="/settings" element={<ClientSettings />} />
          <Route path="/support" element={<ClientSupport />} />
        </Routes>
      </main>
    </div>
  );
}
