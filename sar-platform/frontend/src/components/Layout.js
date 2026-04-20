import React from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import {
  LayoutDashboard, Upload, ListFilter, FileText,
  ShieldAlert, LogOut, Settings, Users
} from 'lucide-react';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => { logout(); navigate('/login'); };

  const navItems = [
    { to: '/dashboard', icon: <LayoutDashboard />, label: 'Dashboard' },
    { to: '/upload', icon: <Upload />, label: 'Upload Data' },
    { to: '/transactions', icon: <ListFilter />, label: 'Transactions' },
    { to: '/sar', icon: <FileText />, label: 'SAR Reports' },
  ];

  const adminItems = [
    { to: '/admin', icon: <Users />, label: 'Admin Panel' },
  ];

  const initials = user?.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'U';

  return (
    <div className="app-shell">
      <nav className="sidebar">
        <div className="sidebar-logo">
          <div className="logo-mark">
            <div className="logo-icon">
              <ShieldAlert size={18} color="white" />
            </div>
            <div>
              <div className="logo-text">SARGen AI</div>
              <div className="logo-sub">COMPLIANCE PLATFORM</div>
            </div>
          </div>
        </div>

        <div className="sidebar-nav">
          <div className="nav-section-label">Navigation</div>
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            >
              {item.icon}
              {item.label}
            </NavLink>
          ))}

          {['admin', 'supervisor'].includes(user?.role) && (
            <>
              <div className="nav-section-label" style={{ marginTop: 12 }}>Administration</div>
              {adminItems.map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
                >
                  {item.icon}
                  {item.label}
                </NavLink>
              ))}
            </>
          )}
        </div>

        <div className="sidebar-footer">
          <div className="user-badge" style={{ marginBottom: 8 }}>
            <div className="user-avatar">{initials}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="user-name truncate">{user?.name}</div>
              <div className="user-role">{user?.role}</div>
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" style={{ width: '100%' }} onClick={handleLogout}>
            <LogOut size={14} /> Sign Out
          </button>
        </div>
      </nav>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
