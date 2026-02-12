import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

// ------------------------------------------------------------------ //
//  Colour palette                                                      //
// ------------------------------------------------------------------ //

const COLORS = {
  primary: '#0079BF',
  primaryHover: '#026AA7',
  danger: '#EB5A46',
  bg: '#F4F5F7',
  card: '#FFFFFF',
  text: '#172B4D',
  textSecondary: '#5E6C84',
};

// ------------------------------------------------------------------ //
//  Component                                                           //
// ------------------------------------------------------------------ //

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, register } = useAuth();

  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setLoading(true);

      try {
        if (isRegistering) {
          await register({ email, password, displayName });
        } else {
          await login({ email, password });
        }
        navigate('/');
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : 'Something went wrong';
        setError(message);
      } finally {
        setLoading(false);
      }
    },
    [email, password, displayName, isRegistering, login, register, navigate],
  );

  const toggleMode = () => {
    setIsRegistering((prev) => !prev);
    setError(null);
  };

  // ---------------------------------------------------------------- //
  //  Styles                                                            //
  // ---------------------------------------------------------------- //

  const styles: Record<string, React.CSSProperties> = {
    page: {
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: `linear-gradient(135deg, ${COLORS.primary} 0%, #00395D 100%)`,
      padding: 16,
    },
    card: {
      background: COLORS.card,
      borderRadius: 8,
      padding: 40,
      width: '100%',
      maxWidth: 400,
      boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
    },
    logo: {
      textAlign: 'center' as const,
      marginBottom: 8,
      fontSize: 28,
      fontWeight: 700,
      color: COLORS.primary,
      letterSpacing: '-0.5px',
    },
    subtitle: {
      textAlign: 'center' as const,
      marginBottom: 28,
      fontSize: 14,
      color: COLORS.textSecondary,
    },
    label: {
      display: 'block',
      marginBottom: 4,
      fontSize: 13,
      fontWeight: 600,
      color: COLORS.text,
    },
    input: {
      width: '100%',
      padding: '10px 12px',
      marginBottom: 16,
      fontSize: 14,
      border: `1px solid #DFE1E6`,
      borderRadius: 4,
      outline: 'none',
      boxSizing: 'border-box' as const,
      color: COLORS.text,
      transition: 'border-color 0.2s',
    },
    button: {
      width: '100%',
      padding: '12px 0',
      background: COLORS.primary,
      color: '#fff',
      border: 'none',
      borderRadius: 4,
      fontSize: 15,
      fontWeight: 600,
      cursor: 'pointer',
      transition: 'background 0.2s',
    },
    buttonDisabled: {
      opacity: 0.7,
      cursor: 'not-allowed',
    },
    error: {
      background: '#FFEBE6',
      color: COLORS.danger,
      padding: '10px 14px',
      borderRadius: 4,
      marginBottom: 16,
      fontSize: 13,
    },
    toggle: {
      marginTop: 20,
      textAlign: 'center' as const,
      fontSize: 13,
      color: COLORS.textSecondary,
    },
    toggleLink: {
      color: COLORS.primary,
      cursor: 'pointer',
      fontWeight: 600,
      background: 'none',
      border: 'none',
      padding: 0,
      fontSize: 13,
      textDecoration: 'underline',
    },
  };

  // ---------------------------------------------------------------- //
  //  Render                                                            //
  // ---------------------------------------------------------------- //

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.logo}>FHE Project Board</div>
        <div style={styles.subtitle}>
          {isRegistering ? 'Create your account' : 'Log in to continue'}
        </div>

        {error && <div style={styles.error}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <label style={styles.label} htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={styles.input}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = COLORS.primary;
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = '#DFE1E6';
            }}
          />

          {isRegistering && (
            <>
              <label style={styles.label} htmlFor="displayName">
                Display Name
              </label>
              <input
                id="displayName"
                type="text"
                placeholder="Jane Doe"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                style={styles.input}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = COLORS.primary;
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = '#DFE1E6';
                }}
              />
            </>
          )}

          <label style={styles.label} htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            placeholder="Enter password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            style={styles.input}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = COLORS.primary;
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = '#DFE1E6';
            }}
          />

          <button
            type="submit"
            disabled={loading}
            style={{
              ...styles.button,
              ...(loading ? styles.buttonDisabled : {}),
            }}
            onMouseEnter={(e) => {
              if (!loading) e.currentTarget.style.background = COLORS.primaryHover;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = COLORS.primary;
            }}
          >
            {loading
              ? 'Please wait...'
              : isRegistering
              ? 'Create Account'
              : 'Log In'}
          </button>
        </form>

        <div style={styles.toggle}>
          {isRegistering ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button type="button" style={styles.toggleLink} onClick={toggleMode}>
            {isRegistering ? 'Log in' : 'Sign up'}
          </button>
        </div>
      </div>
    </div>
  );
}
