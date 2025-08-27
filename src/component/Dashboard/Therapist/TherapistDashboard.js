import React from 'react';
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { 
  Home, 
  Users, 
  MessageSquare, 
  Video, 
  Calendar, 
  BookOpen, 
  Settings, 
  LogOut,
  UserPlus
} from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth } from '../../Auth/firebaseConfig';
import './TherapistDashboard.css';
import '../DashboardShell.css';

// Import all therapist dashboard components
import TherapistHome from './Home';
import TherapistClients from './Clients';
import TherapistMessages from './Messages';
import TherapistVideoCall from './VideoCall';
import TherapistCalendar from './Calendar';
import TherapistNotes from './Notes';
import TherapistResources from './Resources';
import TherapistSettings from './Settings';
import OnboardTherapist from '../Admin/OnboardTherapist';

export default function TherapistDashboard({ profile }) {
  const location = useLocation();
  const navigate = useNavigate();
  
  const isAdmin = profile?.role === 'admin';

  const navigationItems = [
    { path: '/dashboard', icon: Home, label: 'Home', component: TherapistHome },
    { path: '/dashboard/clients', icon: Users, label: 'Clients', component: TherapistClients },
    { path: '/dashboard/staff', icon: MessageSquare, label: 'Staff', component: TherapistMessages },
    { path: '/dashboard/video', icon: Video, label: 'Video Call', component: TherapistVideoCall },
    { path: '/dashboard/calendar', icon: Calendar, label: 'Calendar', component: TherapistCalendar },
    { path: '/dashboard/notes', icon: BookOpen, label: 'Notes', component: TherapistNotes },
    { path: '/dashboard/resources', icon: BookOpen, label: 'Resources', component: TherapistResources },
    { path: '/dashboard/settings', icon: Settings, label: 'Settings', component: TherapistSettings }
  ];

  // Add admin-only navigation items
  if (isAdmin) {
    navigationItems.push({
      path: '/dashboard/admin',
      icon: UserPlus,
      label: 'Onboard Therapist',
      component: OnboardTherapist
    });
  }

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate('/');
    } catch (error) {
      console.error('Error signing out:', error);
    }
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

  const isActiveRoute = (path) => {
    if (path === '/dashboard') {
      return location.pathname === '/dashboard';
    }
    return location.pathname.startsWith(path);
  };



  return (
    <div className="therapist-dashboard">
      {/* Sidebar */}
      <aside className="therapist-sidebar">
        <div className="sidebar-header">
          <div className="logo">
            <h2>NessaHub</h2>
          </div>
          <div className="user-info">
            <div className="user-avatar" onClick={() => document.getElementById('therapist-profile-image-input').click()}>
              {profile?.photoURL ? (
                <img src={profile.photoURL} alt="Profile" />
              ) : (
                <span>{profile?.name ? profile.name.charAt(0).toUpperCase() : 'T'}</span>
              )}
              <div className="avatar-overlay">
                <span>📷</span>
              </div>
            </div>
            <input
              id="therapist-profile-image-input"
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleProfileImageUpload}
            />
            <div className="user-details">
              <p className="user-name">{profile?.name || 'Therapist'}</p>
              <p className="user-role">
                {isAdmin ? 'Admin Therapist' : 'Therapist'}
              </p>
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
      <main className="therapist-main">
        <Routes>
          <Route path="/" element={<TherapistHome />} />
          <Route path="/clients" element={<TherapistClients />} />
          <Route path="/staff" element={<TherapistMessages />} />
          <Route path="/video" element={<TherapistVideoCall profile={profile} />} />
          <Route path="/calendar" element={<TherapistCalendar />} />
          <Route path="/notes" element={<TherapistNotes />} />
          <Route path="/resources" element={<TherapistResources />} />
          <Route path="/settings" element={<TherapistSettings />} />
          {isAdmin && <Route path="/admin" element={<OnboardTherapist />} />}
        </Routes>
      </main>
    </div>
  );
}
