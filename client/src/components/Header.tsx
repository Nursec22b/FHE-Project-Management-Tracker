import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

// ------------------------------------------------------------------ //
//  Colour palette                                                      //
// ------------------------------------------------------------------ //

const COLORS = {
  primary: '#0079BF',
  primaryDark: '#026AA7',
  card: '#FFFFFF',
  text: '#172B4D',
  textSecondary: '#5E6C84',
};

// ------------------------------------------------------------------ //
//  Styles                                                              //
// ------------------------------------------------------------------ //

const styles: Record<string, React.CSSProperties> = {
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 48,
    padding: '0 16px',
    background: COLORS.primaryDark,
    color: '#fff',
    flexShrink: 0,
  },
  left: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
  },
  brand: {
    fontSize: 18,
    fontWeight: 700,
    color: '#fff',
    textDecoration: 'none',
    letterSpacing: '-0.3px',
    whiteSpace: 'nowrap' as const,
  },
  navLink: {
    color: 'rgba(255,255,255,0.85)',
    textDecoration: 'none',
    fontSize: 13,
    fontWeight: 500,
    padding: '4px 10px',
    borderRadius: 4,
    transition: 'background 0.15s',
    whiteSpace: 'nowrap' as const,
  },
  right: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.3)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 13,
    fontWeight: 700,
    color: '#fff',
    overflow: 'hidden',
    flexShrink: 0,
  },
  avatarImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover' as const,
    borderRadius: '50%',
  },
  userName: {
    fontSize: 13,
    fontWeight: 500,
    color: '#fff',
    whiteSpace: 'nowrap' as const,
  },
  logoutButton: {
    background: 'rgba(255,255,255,0.15)',
    border: 'none',
    color: '#fff',
    fontSize: 13,
    fontWeight: 500,
    padding: '5px 12px',
    borderRadius: 4,
    cursor: 'pointer',
    transition: 'background 0.15s',
    whiteSpace: 'nowrap' as const,
  },
};

// ------------------------------------------------------------------ //
//  Component                                                           //
// ------------------------------------------------------------------ //

export default function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const initials = user?.displayName
    ? user.displayName
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : '?';

  return (
    <header style={styles.header}>
      {/* Left: brand + nav */}
      <div style={styles.left}>
        <Link to="/" style={styles.brand}>
          FHE Project Board
        </Link>

        <Link
          to="/"
          style={styles.navLink}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.15)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
          }}
        >
          Boards
        </Link>

        {user?.role === 'admin' && (
          <Link
            to="/email-rules"
            style={styles.navLink}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.15)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            Email Rules
          </Link>
        )}
      </div>

      {/* Right: user info + logout */}
      <div style={styles.right}>
        <div style={styles.avatar}>
          {user?.avatarUrl ? (
            <img src={user.avatarUrl} alt={user.displayName} style={styles.avatarImg} />
          ) : (
            initials
          )}
        </div>
        <span style={styles.userName}>{user?.displayName ?? 'User'}</span>
        <button
          type="button"
          style={styles.logoutButton}
          onClick={handleLogout}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.3)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.15)';
          }}
        >
          Log out
        </button>
      </div>
    </header>
  );
}
