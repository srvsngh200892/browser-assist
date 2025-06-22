import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

function Header({ showPreviewButton, togglePreview, previewVisible, pingServer, user, handleLogout }) {
  const location = useLocation();
  const navigate = useNavigate();
  const isTestCycles = location.pathname.startsWith('/test-cycles');

  return (
    <header className="app-header">
      <h1 style={{ cursor: 'pointer' }} onClick={() => navigate('/')}>🤖 Browser Assist</h1>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
        {showPreviewButton && (
          <button
            className="toggle-preview-button"
            onClick={togglePreview}
          >
            {previewVisible ? 'Hide Preview' : 'Show Preview'}
          </button>
        )}
        <button
          className="nav-button"
          style={getNavButtonStyle(isTestCycles)}
          onClick={() => navigate(isTestCycles ? '/' : '/test-cycles')}
        >
          {isTestCycles ? 'Back to Chat' : 'Test Management'}
        </button>
        <div className="user-avatar-container">
          <button
            className="logout-button"
            onClick={handleLogout}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '5px 12px 5px 5px',
              backgroundColor: 'rgba(255, 255, 255, 0.2)',
              border: 'none',
              borderRadius: '20px',
              color: 'white',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
          >
            <div className="avatar-circle" style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              backgroundColor: 'white',
              color: '#6b46c1',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 'bold',
              fontSize: '16px',
              boxShadow: '0 0 0 2px rgba(255, 255, 255, 0.3)',
            }}>
              {user?.email?.charAt(0)?.toUpperCase() || 'U'}
            </div>
            <span>Logout</span>
          </button>
        </div>
      </div>
    </header>
  );
}

const getNavButtonStyle = (isActive) => ({
  background: isActive ? '#7c3aed' : 'white',
  color: isActive ? 'white' : '#7c3aed',
  border: '1.5px solid #7c3aed',
  borderRadius: '20px',
  padding: '6px 18px',
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'all 0.2s',
  marginLeft: 8
});

export default Header;
