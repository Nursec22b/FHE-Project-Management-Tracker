import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { boards } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import type { BoardSummary } from '../types';
import ImportTrello from './ImportTrello';

// ------------------------------------------------------------------ //
//  Colour palette                                                      //
// ------------------------------------------------------------------ //

const COLORS = {
  primary: '#0079BF',
  primaryHover: '#026AA7',
  success: '#61BD4F',
  bg: '#F4F5F7',
  card: '#FFFFFF',
  text: '#172B4D',
  textSecondary: '#5E6C84',
};

const BOARD_COLORS = [
  '#0079BF',
  '#D29034',
  '#519839',
  '#B04632',
  '#89609E',
  '#CD5A91',
  '#4BBF6B',
  '#00AECC',
  '#838C91',
];

// ------------------------------------------------------------------ //
//  Component                                                           //
// ------------------------------------------------------------------ //

export default function BoardList() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [boardList, setBoardList] = useState<BoardSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create-board form state
  const [showCreate, setShowCreate] = useState(false);
  // Trello import modal
  const [showImport, setShowImport] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newColor, setNewColor] = useState(BOARD_COLORS[0]);
  const [creating, setCreating] = useState(false);

  const fetchBoards = useCallback(async () => {
    try {
      setLoading(true);
      const data = await boards.list();
      setBoardList(data);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load boards');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBoards();
  }, [fetchBoards]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      const board = await boards.create({
        title: newTitle.trim(),
        description: newDesc.trim() || undefined,
        backgroundColor: newColor,
      });
      setBoardList((prev) => [
        ...prev,
        {
          id: board.id,
          title: board.title,
          description: board.description,
          backgroundColor: board.backgroundColor,
          memberRole: 'admin',
          createdAt: board.createdAt,
        },
      ]);
      setNewTitle('');
      setNewDesc('');
      setNewColor(BOARD_COLORS[0]);
      setShowCreate(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create board');
    } finally {
      setCreating(false);
    }
  };

  // ---------------------------------------------------------------- //
  //  Styles                                                            //
  // ---------------------------------------------------------------- //

  const styles: Record<string, React.CSSProperties> = {
    page: {
      flex: 1,
      background: COLORS.bg,
      padding: '32px 24px',
      overflowY: 'auto',
    },
    container: {
      maxWidth: 960,
      margin: '0 auto',
    },
    heading: {
      fontSize: 22,
      fontWeight: 700,
      color: COLORS.text,
      marginBottom: 24,
    },
    grid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
      gap: 16,
    },
    boardCard: {
      borderRadius: 6,
      padding: 16,
      minHeight: 100,
      cursor: 'pointer',
      color: '#fff',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      transition: 'opacity 0.15s',
      position: 'relative',
      overflow: 'hidden',
    },
    boardTitle: {
      fontSize: 16,
      fontWeight: 700,
      wordBreak: 'break-word' as const,
    },
    boardDesc: {
      fontSize: 12,
      marginTop: 8,
      opacity: 0.85,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      display: '-webkit-box',
      WebkitLineClamp: 2,
      WebkitBoxOrient: 'vertical' as const,
    },
    boardMeta: {
      fontSize: 11,
      opacity: 0.75,
      marginTop: 8,
    },
    createCard: {
      borderRadius: 6,
      padding: 16,
      minHeight: 100,
      cursor: 'pointer',
      background: 'rgba(0,0,0,0.04)',
      border: '2px dashed #C1C7D0',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 14,
      fontWeight: 500,
      color: COLORS.textSecondary,
      transition: 'background 0.15s, border-color 0.15s',
    },
    formOverlay: {
      position: 'fixed' as const,
      inset: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: 16,
    },
    formCard: {
      background: COLORS.card,
      borderRadius: 8,
      padding: 28,
      width: '100%',
      maxWidth: 420,
      boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
    },
    formTitle: {
      fontSize: 18,
      fontWeight: 700,
      color: COLORS.text,
      marginBottom: 20,
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
      padding: '8px 12px',
      marginBottom: 14,
      fontSize: 14,
      border: '1px solid #DFE1E6',
      borderRadius: 4,
      outline: 'none',
      boxSizing: 'border-box' as const,
      color: COLORS.text,
    },
    colorPicker: {
      display: 'flex',
      gap: 8,
      marginBottom: 18,
      flexWrap: 'wrap',
    },
    colorSwatch: {
      width: 32,
      height: 32,
      borderRadius: 4,
      cursor: 'pointer',
      border: '2px solid transparent',
      transition: 'border-color 0.15s, transform 0.1s',
    },
    colorSwatchSelected: {
      border: '2px solid #172B4D',
      transform: 'scale(1.15)',
    },
    formActions: {
      display: 'flex',
      gap: 10,
      justifyContent: 'flex-end',
      marginTop: 8,
    },
    btnPrimary: {
      padding: '8px 20px',
      background: COLORS.primary,
      color: '#fff',
      border: 'none',
      borderRadius: 4,
      fontSize: 14,
      fontWeight: 600,
      cursor: 'pointer',
    },
    btnCancel: {
      padding: '8px 20px',
      background: 'transparent',
      color: COLORS.textSecondary,
      border: 'none',
      borderRadius: 4,
      fontSize: 14,
      fontWeight: 500,
      cursor: 'pointer',
    },
    loadingMsg: {
      color: COLORS.textSecondary,
      fontSize: 14,
      textAlign: 'center' as const,
      padding: 40,
    },
    errorMsg: {
      color: '#EB5A46',
      background: '#FFEBE6',
      padding: '10px 14px',
      borderRadius: 4,
      marginBottom: 16,
      fontSize: 13,
    },
  };

  // ---------------------------------------------------------------- //
  //  Render                                                            //
  // ---------------------------------------------------------------- //

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <h1 style={styles.heading}>Your Boards</h1>

        {error && <div style={styles.errorMsg}>{error}</div>}

        {loading ? (
          <div style={styles.loadingMsg}>Loading boards...</div>
        ) : (
          <div style={styles.grid}>
            {boardList.map((b) => (
              <div
                key={b.id}
                style={{ ...styles.boardCard, background: b.backgroundColor || COLORS.primary }}
                onClick={() => navigate(`/board/${b.id}`)}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLDivElement).style.opacity = '0.85';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLDivElement).style.opacity = '1';
                }}
              >
                <div>
                  <div style={styles.boardTitle}>{b.title}</div>
                  {b.description && <div style={styles.boardDesc}>{b.description}</div>}
                </div>
                <div style={styles.boardMeta}>Role: {b.memberRole}</div>
              </div>
            ))}

            {/* Create new board tile */}
            <div
              style={styles.createCard}
              onClick={() => setShowCreate(true)}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(0,0,0,0.08)';
                e.currentTarget.style.borderColor = COLORS.primary;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(0,0,0,0.04)';
                e.currentTarget.style.borderColor = '#C1C7D0';
              }}
            >
              + Create new board
            </div>

            {/* Import from Trello tile — admin only */}
            {isAdmin && (
              <div
                style={{
                  ...styles.createCard,
                  borderColor: '#0079BF',
                  color: '#0079BF',
                }}
                onClick={() => setShowImport(true)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(0,121,191,0.08)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(0,0,0,0.04)';
                }}
              >
                Import from Trello
              </div>
            )}
          </div>
        )}

        {/* Create board modal */}
        {showCreate && (
          <div
            style={styles.formOverlay}
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowCreate(false);
            }}
          >
            <div style={styles.formCard}>
              <div style={styles.formTitle}>Create Board</div>
              <form onSubmit={handleCreate}>
                <label style={styles.label}>Board Title</label>
                <input
                  style={styles.input}
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Enter board title"
                  required
                  autoFocus
                />

                <label style={styles.label}>Description (optional)</label>
                <input
                  style={styles.input}
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="A brief description"
                />

                <label style={styles.label}>Background Color</label>
                <div style={styles.colorPicker}>
                  {BOARD_COLORS.map((c) => (
                    <div
                      key={c}
                      style={{
                        ...styles.colorSwatch,
                        background: c,
                        ...(c === newColor ? styles.colorSwatchSelected : {}),
                      }}
                      onClick={() => setNewColor(c)}
                    />
                  ))}
                </div>

                <div style={styles.formActions}>
                  <button
                    type="button"
                    style={styles.btnCancel}
                    onClick={() => setShowCreate(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    style={{
                      ...styles.btnPrimary,
                      opacity: creating ? 0.7 : 1,
                    }}
                    disabled={creating}
                  >
                    {creating ? 'Creating...' : 'Create'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Trello import modal */}
        {showImport && (
          <ImportTrello
            onClose={() => setShowImport(false)}
            onImported={fetchBoards}
          />
        )}
      </div>
    </div>
  );
}
