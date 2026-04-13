import React, { useState, useCallback, useEffect } from 'react';
import { cards as cardsApi, checklists as checklistsApi } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import type { Board, Card, Label, User, Checklist } from '../types';

// ------------------------------------------------------------------ //
//  Colour palette                                                      //
// ------------------------------------------------------------------ //

const COLORS = {
  primary: '#0079BF',
  primaryHover: '#026AA7',
  success: '#61BD4F',
  warning: '#F2D600',
  danger: '#EB5A46',
  bg: '#F4F5F7',
  card: '#FFFFFF',
  text: '#172B4D',
  textSecondary: '#5E6C84',
  border: '#DFE1E6',
};

// ------------------------------------------------------------------ //
//  Props                                                               //
// ------------------------------------------------------------------ //

interface CardDetailProps {
  card: Card;
  board: Board;
  onClose: () => void;
  onCardUpdated: (card: Card) => void;
  onCardArchived: (cardId: string) => void;
  onCardMoved?: (cardId: string, newListId: string) => void;
}

// ------------------------------------------------------------------ //
//  List-usage helpers (localStorage)                                   //
// ------------------------------------------------------------------ //

function getListUsage(boardId: string): Record<string, { lastUsed: number; useCount: number }> {
  try {
    const stored = localStorage.getItem(`fhe_list_usage_${boardId}`);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

function recordListUsage(boardId: string, listId: string): void {
  try {
    const usage = getListUsage(boardId);
    usage[listId] = {
      lastUsed: Date.now(),
      useCount: (usage[listId]?.useCount ?? 0) + 1,
    };
    localStorage.setItem(`fhe_list_usage_${boardId}`, JSON.stringify(usage));
  } catch {
    // ignore
  }
}

// ------------------------------------------------------------------ //
//  Component                                                           //
// ------------------------------------------------------------------ //

export default function CardDetail({
  card,
  board,
  onClose,
  onCardUpdated,
  onCardArchived,
  onCardMoved,
}: CardDetailProps) {
  const { user: currentUser } = useAuth();

  // ---------------------------------------------------------------- //
  //  Local state                                                       //
  // ---------------------------------------------------------------- //

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(card.title);

  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState(card.description ?? '');

  const [dueDateDraft, setDueDateDraft] = useState(
    card.dueDate ? card.dueDate.slice(0, 10) : '',
  );

  // Labels
  const [showLabelDropdown, setShowLabelDropdown] = useState(false);

  // Members
  const [showMemberDropdown, setShowMemberDropdown] = useState(false);

  // Checklists
  const [newChecklistTitle, setNewChecklistTitle] = useState('');
  const [showAddChecklist, setShowAddChecklist] = useState(false);
  const [addingItemToChecklist, setAddingItemToChecklist] = useState<string | null>(null);
  const [newItemContent, setNewItemContent] = useState('');

  // Comments
  const [newComment, setNewComment] = useState('');
  const [commentLoading, setCommentLoading] = useState(false);

  // Move card
  const [showMoveDropdown, setShowMoveDropdown] = useState(false);
  const [movingCard, setMovingCard] = useState(false);

  // Sync state when card prop changes
  useEffect(() => {
    setTitleDraft(card.title);
    setDescDraft(card.description ?? '');
    setDueDateDraft(card.dueDate ? card.dueDate.slice(0, 10) : '');
  }, [card]);

  // Fetch full card data (checklists, comments) on mount
  useEffect(() => {
    refreshCard();
  }, [card.id]); // card.id is the stable key; refreshCard wraps it

  // ---------------------------------------------------------------- //
  //  Refresh the card data from the server                             //
  // ---------------------------------------------------------------- //

  const refreshCard = useCallback(async () => {
    try {
      const updated = await cardsApi.getById(card.id);
      onCardUpdated(updated);
    } catch {
      // ignore
    }
  }, [card.id, onCardUpdated]);

  // ---------------------------------------------------------------- //
  //  Title                                                             //
  // ---------------------------------------------------------------- //

  const saveTitle = async () => {
    setEditingTitle(false);
    const trimmed = titleDraft.trim();
    if (!trimmed || trimmed === card.title) {
      setTitleDraft(card.title);
      return;
    }
    try {
      const updated = await cardsApi.update(card.id, { title: trimmed });
      onCardUpdated({ ...card, ...updated });
    } catch {
      setTitleDraft(card.title);
    }
  };

  // ---------------------------------------------------------------- //
  //  Description                                                       //
  // ---------------------------------------------------------------- //

  const saveDesc = async () => {
    setEditingDesc(false);
    const value = descDraft.trim() || null;
    if (value === (card.description ?? null)) return;
    try {
      const updated = await cardsApi.update(card.id, { description: value });
      onCardUpdated({ ...card, ...updated });
    } catch {
      setDescDraft(card.description ?? '');
    }
  };

  // ---------------------------------------------------------------- //
  //  Due date                                                          //
  // ---------------------------------------------------------------- //

  const saveDueDate = async (value: string) => {
    setDueDateDraft(value);
    try {
      const updated = await cardsApi.update(card.id, {
        dueDate: value || null,
      });
      onCardUpdated({ ...card, ...updated });
    } catch {
      setDueDateDraft(card.dueDate ? card.dueDate.slice(0, 10) : '');
    }
  };

  // ---------------------------------------------------------------- //
  //  Labels                                                            //
  // ---------------------------------------------------------------- //

  const cardLabelIds = new Set(card.labels?.map((l) => l.id));

  const toggleLabel = async (label: Label) => {
    try {
      if (cardLabelIds.has(label.id)) {
        await cardsApi.removeLabel(card.id, label.id);
      } else {
        await cardsApi.addLabel(card.id, label.id);
      }
      await refreshCard();
    } catch {
      // ignore
    }
  };

  // ---------------------------------------------------------------- //
  //  Members                                                           //
  // ---------------------------------------------------------------- //

  const cardAssigneeIds = new Set(card.assignees?.map((a) => a.id));

  const toggleMember = async (member: User) => {
    try {
      if (cardAssigneeIds.has(member.id)) {
        await cardsApi.unassign(card.id, member.id);
      } else {
        await cardsApi.assign(card.id, member.id);
      }
      await refreshCard();
    } catch {
      // ignore
    }
  };

  const boardMembers: User[] = (board.members || [])
    .map((m) => {
      if (m.user) return m.user;
      return {
        id: m.userId,
        email: m.email || '',
        displayName: m.displayName || m.email || 'Unknown',
        avatarUrl: m.avatarUrl ?? null,
        role: 'member' as const,
        createdAt: '',
      };
    });

  // ---------------------------------------------------------------- //
  //  Checklists                                                        //
  // ---------------------------------------------------------------- //

  const addChecklist = async () => {
    const title = newChecklistTitle.trim() || 'Checklist';
    try {
      await checklistsApi.create({ cardId: card.id, title });
      setNewChecklistTitle('');
      setShowAddChecklist(false);
      await refreshCard();
    } catch {
      // ignore
    }
  };

  const deleteChecklist = async (checklistId: string) => {
    if (!window.confirm('Delete this checklist?')) return;
    try {
      await checklistsApi.delete(checklistId);
      await refreshCard();
    } catch {
      // ignore
    }
  };

  const addChecklistItem = async (checklistId: string) => {
    if (!newItemContent.trim()) return;
    try {
      await checklistsApi.addItem(checklistId, newItemContent.trim());
      setNewItemContent('');
      setAddingItemToChecklist(null);
      await refreshCard();
    } catch {
      // ignore
    }
  };

  const toggleChecklistItem = async (itemId: string, isChecked: boolean) => {
    try {
      await checklistsApi.updateItem(itemId, { isChecked: !isChecked });
      await refreshCard();
    } catch {
      // ignore
    }
  };

  const deleteChecklistItem = async (itemId: string) => {
    try {
      await checklistsApi.deleteItem(itemId);
      await refreshCard();
    } catch {
      // ignore
    }
  };

  // ---------------------------------------------------------------- //
  //  Comments                                                          //
  // ---------------------------------------------------------------- //

  const addComment = async () => {
    if (!newComment.trim()) return;
    setCommentLoading(true);
    try {
      await cardsApi.addComment(card.id, newComment.trim());
      setNewComment('');
      await refreshCard();
    } catch {
      // ignore
    } finally {
      setCommentLoading(false);
    }
  };

  const deleteComment = async (commentId: string) => {
    if (!window.confirm('Delete this comment?')) return;
    try {
      await cardsApi.deleteComment(card.id, commentId);
      await refreshCard();
    } catch {
      // ignore
    }
  };

  // ---------------------------------------------------------------- //
  //  Archive                                                           //
  // ---------------------------------------------------------------- //

  const archiveCard = async () => {
    if (!window.confirm('Archive this card?')) return;
    try {
      await cardsApi.archive(card.id);
      onCardArchived(card.id);
    } catch {
      // ignore
    }
  };

  // ---------------------------------------------------------------- //
  //  Move card                                                         //
  // ---------------------------------------------------------------- //

  // Active lists on this board, excluding the card's current list
  const moveTargetLists = (() => {
    const usage = getListUsage(board.id);
    const available = (board.lists || []).filter(
      (l) => !l.isArchived && l.id !== card.listId,
    );
    return available.sort((a, b) => {
      const ua = usage[a.id];
      const ub = usage[b.id];
      if (!ua && !ub) return a.title.localeCompare(b.title);
      if (!ua) return 1;
      if (!ub) return -1;
      // Sort by most recently used first
      return ub.lastUsed - ua.lastUsed;
    });
  })();

  const handleMoveCard = async (targetListId: string) => {
    if (movingCard) return;
    setMovingCard(true);
    setShowMoveDropdown(false);
    try {
      await cardsApi.move(card.id, { targetListId, newPosition: 9999 });
      recordListUsage(board.id, targetListId);
      // Notify parent to update board state
      onCardMoved?.(card.id, targetListId);
      // Update card's listId locally
      onCardUpdated({ ...card, listId: targetListId });
    } catch {
      // ignore
    } finally {
      setMovingCard(false);
    }
  };

  // ---------------------------------------------------------------- //
  //  Styles                                                            //
  // ---------------------------------------------------------------- //

  const styles: Record<string, React.CSSProperties> = {
    overlay: {
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.55)',
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'center',
      zIndex: 2000,
      overflowY: 'auto',
      padding: '48px 16px',
    },
    modal: {
      background: COLORS.bg,
      borderRadius: 8,
      width: '100%',
      maxWidth: 720,
      position: 'relative' as const,
      boxShadow: '0 12px 40px rgba(0,0,0,0.3)',
    },
    closeBtn: {
      position: 'absolute' as const,
      top: 12,
      right: 12,
      background: 'none',
      border: 'none',
      fontSize: 24,
      cursor: 'pointer',
      color: COLORS.textSecondary,
      lineHeight: 1,
      zIndex: 1,
      padding: '4px 8px',
      borderRadius: 4,
    },
    body: {
      padding: '24px 28px 28px',
      display: 'flex',
      flexDirection: 'column' as const,
      gap: 20,
    },
    section: {
      background: COLORS.card,
      borderRadius: 6,
      padding: 16,
    },
    sectionTitle: {
      fontSize: 13,
      fontWeight: 700,
      color: COLORS.textSecondary,
      textTransform: 'uppercase' as const,
      letterSpacing: '0.5px',
      marginBottom: 10,
    },
    titleInput: {
      fontSize: 20,
      fontWeight: 700,
      border: '2px solid ' + COLORS.primary,
      borderRadius: 4,
      padding: '4px 8px',
      outline: 'none',
      width: '100%',
      boxSizing: 'border-box' as const,
      color: COLORS.text,
    },
    titleDisplay: {
      fontSize: 20,
      fontWeight: 700,
      color: COLORS.text,
      cursor: 'pointer',
      padding: '4px 8px',
      borderRadius: 4,
      wordBreak: 'break-word' as const,
    },
    textarea: {
      width: '100%',
      minHeight: 80,
      padding: '8px 10px',
      fontSize: 14,
      border: '1px solid ' + COLORS.border,
      borderRadius: 4,
      outline: 'none',
      resize: 'vertical' as const,
      boxSizing: 'border-box' as const,
      color: COLORS.text,
      fontFamily: 'inherit',
    },
    desc: {
      fontSize: 14,
      color: COLORS.text,
      cursor: 'pointer',
      whiteSpace: 'pre-wrap' as const,
      minHeight: 32,
      padding: '8px 10px',
      borderRadius: 4,
      background: '#EBECF0',
    },
    descPlaceholder: {
      color: COLORS.textSecondary,
      fontStyle: 'italic' as const,
    },
    labelDot: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      padding: '4px 10px',
      borderRadius: 4,
      color: '#fff',
      fontSize: 12,
      fontWeight: 600,
    },
    dropdownOverlay: {
      position: 'absolute' as const,
      zIndex: 10,
      background: COLORS.card,
      border: '1px solid ' + COLORS.border,
      borderRadius: 6,
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      padding: 8,
      minWidth: 220,
      maxHeight: 260,
      overflowY: 'auto' as const,
    },
    dropdownItem: {
      padding: '6px 10px',
      fontSize: 13,
      cursor: 'pointer',
      borderRadius: 4,
      display: 'flex',
      alignItems: 'center',
      gap: 8,
    },
    btnSmall: {
      padding: '5px 12px',
      background: '#EBECF0',
      border: 'none',
      borderRadius: 4,
      fontSize: 13,
      fontWeight: 500,
      cursor: 'pointer',
      color: COLORS.text,
    },
    btnPrimary: {
      padding: '6px 16px',
      background: COLORS.primary,
      color: '#fff',
      border: 'none',
      borderRadius: 4,
      fontSize: 13,
      fontWeight: 600,
      cursor: 'pointer',
    },
    btnDanger: {
      padding: '8px 18px',
      background: COLORS.danger,
      color: '#fff',
      border: 'none',
      borderRadius: 4,
      fontSize: 13,
      fontWeight: 600,
      cursor: 'pointer',
    },
    checklistProgressBar: {
      height: 6,
      borderRadius: 3,
      background: '#DFE1E6',
      overflow: 'hidden',
      marginBottom: 8,
    },
    checklistProgressFill: {
      height: '100%',
      borderRadius: 3,
      transition: 'width 0.3s',
    },
    commentBox: {
      borderBottom: '1px solid ' + COLORS.border,
      padding: '10px 0',
    },
    commentAuthor: {
      fontWeight: 600,
      fontSize: 13,
      color: COLORS.text,
    },
    commentDate: {
      fontSize: 11,
      color: COLORS.textSecondary,
      marginLeft: 8,
    },
    commentContent: {
      fontSize: 14,
      color: COLORS.text,
      marginTop: 4,
      whiteSpace: 'pre-wrap' as const,
    },
    attachmentRow: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '6px 0',
      fontSize: 13,
      color: COLORS.text,
      borderBottom: '1px solid ' + COLORS.border,
    },
    dateInput: {
      padding: '6px 10px',
      fontSize: 14,
      border: '1px solid ' + COLORS.border,
      borderRadius: 4,
      color: COLORS.text,
      outline: 'none',
    },
  };

  // ---------------------------------------------------------------- //
  //  Progress helper                                                   //
  // ---------------------------------------------------------------- //

  const checklistProgress = (cl: Checklist) => {
    const total = cl.items.length;
    if (total === 0) return 0;
    const checked = cl.items.filter((i) => i.isChecked).length;
    return Math.round((checked / total) * 100);
  };

  // ---------------------------------------------------------------- //
  //  Render                                                            //
  // ---------------------------------------------------------------- //

  return (
    <div
      style={styles.overlay}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div style={styles.modal}>
        <button
          style={styles.closeBtn}
          onClick={onClose}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#DFE1E6';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
          }}
        >
          &times;
        </button>

        <div style={styles.body}>
          {/* ---- Title ---- */}
          {editingTitle ? (
            <input
              style={styles.titleInput}
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveTitle();
                if (e.key === 'Escape') {
                  setTitleDraft(card.title);
                  setEditingTitle(false);
                }
              }}
              autoFocus
            />
          ) : (
            <div style={styles.titleDisplay} onClick={() => setEditingTitle(true)}>
              {card.title}
            </div>
          )}

          {/* ---- Labels ---- */}
          <div style={styles.section}>
            <div style={styles.sectionTitle}>Labels</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              {card.labels?.map((l) => (
                <span key={l.id} style={{ ...styles.labelDot, background: l.color }}>
                  {l.name || l.color}
                </span>
              ))}
              {(!card.labels || card.labels.length === 0) && (
                <span style={{ fontSize: 13, color: COLORS.textSecondary }}>No labels</span>
              )}
            </div>
            <div style={{ position: 'relative' }}>
              <button
                style={styles.btnSmall}
                onClick={() => setShowLabelDropdown((v) => !v)}
              >
                {showLabelDropdown ? 'Close' : 'Add / Remove Labels'}
              </button>
              {showLabelDropdown && (
                <div style={{ ...styles.dropdownOverlay, top: 32, left: 0 }}>
                  {(board.labels || []).map((l) => {
                    const active = cardLabelIds.has(l.id);
                    return (
                      <div
                        key={l.id}
                        style={{
                          ...styles.dropdownItem,
                          background: active ? '#E4F0F6' : 'transparent',
                        }}
                        onClick={() => toggleLabel(l)}
                        onMouseEnter={(e) => {
                          if (!active) e.currentTarget.style.background = '#F4F5F7';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = active ? '#E4F0F6' : 'transparent';
                        }}
                      >
                        <span
                          style={{
                            width: 24,
                            height: 16,
                            borderRadius: 3,
                            background: l.color,
                            display: 'inline-block',
                            flexShrink: 0,
                          }}
                        />
                        <span style={{ flex: 1, color: COLORS.text }}>{l.name || l.color}</span>
                        {active && <span style={{ fontWeight: 700, color: COLORS.primary }}>&#10003;</span>}
                      </div>
                    );
                  })}
                  {(!board.labels || board.labels.length === 0) && (
                    <div style={{ padding: 8, fontSize: 13, color: COLORS.textSecondary }}>
                      No labels on this board
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ---- Members ---- */}
          <div style={styles.section}>
            <div style={styles.sectionTitle}>Members</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              {card.assignees?.map((u) => {
                const initials = u.displayName
                  .split(' ')
                  .map((n) => n[0])
                  .join('')
                  .toUpperCase()
                  .slice(0, 2);
                return (
                  <div
                    key={u.id}
                    title={u.displayName}
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: '50%',
                      background: COLORS.primary,
                      color: '#fff',
                      fontSize: 12,
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden',
                    }}
                  >
                    {u.avatarUrl ? (
                      <img
                        src={u.avatarUrl}
                        alt={u.displayName}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      initials
                    )}
                  </div>
                );
              })}
              {(!card.assignees || card.assignees.length === 0) && (
                <span style={{ fontSize: 13, color: COLORS.textSecondary }}>No members</span>
              )}
            </div>
            <div style={{ position: 'relative' }}>
              <button
                style={styles.btnSmall}
                onClick={() => setShowMemberDropdown((v) => !v)}
              >
                {showMemberDropdown ? 'Close' : 'Assign / Unassign'}
              </button>
              {showMemberDropdown && (
                <div style={{ ...styles.dropdownOverlay, top: 32, left: 0 }}>
                  {boardMembers.map((m) => {
                    const active = cardAssigneeIds.has(m.id);
                    return (
                      <div
                        key={m.id}
                        style={{
                          ...styles.dropdownItem,
                          background: active ? '#E4F0F6' : 'transparent',
                        }}
                        onClick={() => toggleMember(m)}
                        onMouseEnter={(e) => {
                          if (!active) e.currentTarget.style.background = '#F4F5F7';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = active ? '#E4F0F6' : 'transparent';
                        }}
                      >
                        <span style={{ flex: 1, color: COLORS.text }}>{m.displayName}</span>
                        {active && <span style={{ fontWeight: 700, color: COLORS.primary }}>&#10003;</span>}
                      </div>
                    );
                  })}
                  {boardMembers.length === 0 && (
                    <div style={{ padding: 8, fontSize: 13, color: COLORS.textSecondary }}>
                      No board members
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ---- Description ---- */}
          <div style={styles.section}>
            <div style={styles.sectionTitle}>Description</div>
            {editingDesc ? (
              <div>
                <textarea
                  style={styles.textarea}
                  value={descDraft}
                  onChange={(e) => setDescDraft(e.target.value)}
                  autoFocus
                  placeholder="Add a more detailed description..."
                />
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  <button style={styles.btnPrimary} onClick={saveDesc}>
                    Save
                  </button>
                  <button
                    style={styles.btnSmall}
                    onClick={() => {
                      setDescDraft(card.description ?? '');
                      setEditingDesc(false);
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div
                style={{
                  ...styles.desc,
                  ...(card.description ? {} : styles.descPlaceholder),
                }}
                onClick={() => setEditingDesc(true)}
              >
                {card.description || 'Click to add a description...'}
              </div>
            )}
          </div>

          {/* ---- Due date ---- */}
          <div style={styles.section}>
            <div style={styles.sectionTitle}>Due Date</div>
            <input
              type="date"
              style={styles.dateInput}
              value={dueDateDraft}
              onChange={(e) => saveDueDate(e.target.value)}
            />
            {dueDateDraft && (
              <button
                style={{ ...styles.btnSmall, marginLeft: 8 }}
                onClick={() => saveDueDate('')}
              >
                Clear
              </button>
            )}
          </div>

          {/* ---- Checklists ---- */}
          <div style={styles.section}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 10,
              }}
            >
              <div style={styles.sectionTitle}>Checklists</div>
              {!showAddChecklist && (
                <button
                  style={styles.btnSmall}
                  onClick={() => setShowAddChecklist(true)}
                >
                  + Add Checklist
                </button>
              )}
            </div>

            {showAddChecklist && (
              <div style={{ marginBottom: 12, display: 'flex', gap: 6 }}>
                <input
                  value={newChecklistTitle}
                  onChange={(e) => setNewChecklistTitle(e.target.value)}
                  placeholder="Checklist title"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') addChecklist();
                    if (e.key === 'Escape') setShowAddChecklist(false);
                  }}
                  style={{
                    flex: 1,
                    padding: '6px 10px',
                    fontSize: 13,
                    border: '1px solid ' + COLORS.border,
                    borderRadius: 4,
                    outline: 'none',
                    color: COLORS.text,
                  }}
                />
                <button style={styles.btnPrimary} onClick={addChecklist}>
                  Add
                </button>
                <button
                  style={styles.btnSmall}
                  onClick={() => setShowAddChecklist(false)}
                >
                  Cancel
                </button>
              </div>
            )}

            {(card.checklists || []).map((cl) => {
              const pct = checklistProgress(cl);
              return (
                <div key={cl.id} style={{ marginBottom: 16 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 6,
                    }}
                  >
                    <span style={{ fontWeight: 600, fontSize: 14, color: COLORS.text }}>
                      {cl.title}
                    </span>
                    <button
                      style={{
                        background: 'none',
                        border: 'none',
                        fontSize: 11,
                        cursor: 'pointer',
                        color: COLORS.textSecondary,
                      }}
                      onClick={() => deleteChecklist(cl.id)}
                    >
                      Delete
                    </button>
                  </div>

                  {/* Progress */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 11, color: COLORS.textSecondary, minWidth: 30 }}>
                      {pct}%
                    </span>
                    <div style={{ ...styles.checklistProgressBar, flex: 1 }}>
                      <div
                        style={{
                          ...styles.checklistProgressFill,
                          width: `${pct}%`,
                          background: pct === 100 ? COLORS.success : COLORS.primary,
                        }}
                      />
                    </div>
                  </div>

                  {/* Items */}
                  {cl.items
                    .sort((a, b) => a.position - b.position)
                    .map((item) => (
                      <div
                        key={item.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '4px 0',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={item.isChecked}
                          onChange={() => toggleChecklistItem(item.id, item.isChecked)}
                          style={{ cursor: 'pointer', accentColor: COLORS.primary }}
                        />
                        <span
                          style={{
                            flex: 1,
                            fontSize: 13,
                            color: COLORS.text,
                            textDecoration: item.isChecked ? 'line-through' : 'none',
                            opacity: item.isChecked ? 0.6 : 1,
                          }}
                        >
                          {item.content}
                        </span>
                        <button
                          onClick={() => deleteChecklistItem(item.id)}
                          style={{
                            background: 'none',
                            border: 'none',
                            fontSize: 14,
                            cursor: 'pointer',
                            color: COLORS.textSecondary,
                            lineHeight: 1,
                            padding: '0 4px',
                          }}
                          title="Delete item"
                        >
                          &times;
                        </button>
                      </div>
                    ))}

                  {/* Add item */}
                  {addingItemToChecklist === cl.id ? (
                    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                      <input
                        value={newItemContent}
                        onChange={(e) => setNewItemContent(e.target.value)}
                        placeholder="Add an item"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') addChecklistItem(cl.id);
                          if (e.key === 'Escape') setAddingItemToChecklist(null);
                        }}
                        style={{
                          flex: 1,
                          padding: '5px 8px',
                          fontSize: 13,
                          border: '1px solid ' + COLORS.border,
                          borderRadius: 4,
                          outline: 'none',
                          color: COLORS.text,
                        }}
                      />
                      <button
                        style={styles.btnPrimary}
                        onClick={() => addChecklistItem(cl.id)}
                      >
                        Add
                      </button>
                      <button
                        style={styles.btnSmall}
                        onClick={() => setAddingItemToChecklist(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      style={{
                        ...styles.btnSmall,
                        marginTop: 6,
                        fontSize: 12,
                      }}
                      onClick={() => {
                        setNewItemContent('');
                        setAddingItemToChecklist(cl.id);
                      }}
                    >
                      + Add Item
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* ---- Attachments ---- */}
          {card.attachments && card.attachments.length > 0 && (
            <div style={styles.section}>
              <div style={styles.sectionTitle}>Attachments</div>
              {card.attachments.map((att) => (
                <div key={att.id} style={styles.attachmentRow}>
                  <span style={{ fontSize: 16 }}>&#128206;</span>
                  <a
                    href={`/api/attachments/${att.id}/download`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: COLORS.primary,
                      textDecoration: 'none',
                      fontWeight: 500,
                      flex: 1,
                    }}
                  >
                    {att.originalName}
                  </a>
                  <span style={{ fontSize: 11, color: COLORS.textSecondary }}>
                    {(att.fileSize / 1024).toFixed(1)} KB
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* ---- Comments ---- */}
          <div style={styles.section}>
            <div style={styles.sectionTitle}>Comments</div>

            {/* New comment */}
            <div style={{ marginBottom: 12 }}>
              <textarea
                style={{ ...styles.textarea, minHeight: 60 }}
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Write a comment..."
              />
              <button
                style={{
                  ...styles.btnPrimary,
                  marginTop: 6,
                  opacity: commentLoading ? 0.7 : 1,
                }}
                onClick={addComment}
                disabled={commentLoading || !newComment.trim()}
              >
                {commentLoading ? 'Posting...' : 'Save'}
              </button>
            </div>

            {/* Comments list */}
            {(card.comments || [])
              .sort(
                (a, b) =>
                  new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
              )
              .map((c) => {
                const authorName =
                  c.user?.displayName || c.displayName || 'Unknown';
                const isOwn = c.userId === currentUser?.id;
                return (
                  <div key={c.id} style={styles.commentBox}>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <span style={styles.commentAuthor}>{authorName}</span>
                      <span style={styles.commentDate}>
                        {new Date(c.createdAt).toLocaleString()}
                      </span>
                      {isOwn && (
                        <button
                          onClick={() => deleteComment(c.id)}
                          style={{
                            marginLeft: 'auto',
                            background: 'none',
                            border: 'none',
                            fontSize: 11,
                            cursor: 'pointer',
                            color: COLORS.danger,
                          }}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                    <div style={styles.commentContent}>{c.content}</div>
                  </div>
                );
              })}

            {(!card.comments || card.comments.length === 0) && (
              <div style={{ fontSize: 13, color: COLORS.textSecondary }}>No comments yet.</div>
            )}
          </div>

          {/* ---- Move card ---- */}
          <div style={styles.section}>
            <div style={styles.sectionTitle}>Move Card</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' as const }}>
              <div style={{ position: 'relative' }}>
                <button
                  style={{
                    ...styles.btnSmall,
                    background: movingCard ? '#DFE1E6' : '#EBECF0',
                    cursor: movingCard ? 'wait' : 'pointer',
                  }}
                  onClick={() => setShowMoveDropdown((v) => !v)}
                  disabled={movingCard}
                >
                  {movingCard ? 'Moving...' : showMoveDropdown ? 'Close' : 'Select List'}
                </button>
                {showMoveDropdown && (
                  <>
                    <div
                      style={{ position: 'fixed', inset: 0, zIndex: 9 }}
                      onClick={() => setShowMoveDropdown(false)}
                    />
                    <div style={{ ...styles.dropdownOverlay, top: 36, left: 0, zIndex: 10 }}>
                      {moveTargetLists.length === 0 ? (
                        <div style={{ padding: 8, fontSize: 13, color: COLORS.textSecondary }}>
                          No other lists available
                        </div>
                      ) : (
                        moveTargetLists.map((l) => {
                          const usage = getListUsage(board.id)[l.id];
                          return (
                            <div
                              key={l.id}
                              style={styles.dropdownItem}
                              onClick={() => handleMoveCard(l.id)}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = '#F4F5F7';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'transparent';
                              }}
                            >
                              <span style={{ flex: 1, color: COLORS.text }}>{l.title}</span>
                              {usage && (
                                <span style={{ fontSize: 11, color: COLORS.textSecondary, marginLeft: 6 }}>
                                  {usage.useCount > 1 ? `×${usage.useCount}` : 'recent'}
                                </span>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </>
                )}
              </div>
              <span style={{ fontSize: 12, color: COLORS.textSecondary }}>
                Current list: <strong>{board.lists?.find((l) => l.id === card.listId)?.title ?? 'Unknown'}</strong>
              </span>
            </div>
          </div>

          {/* ---- Archive button ---- */}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button style={styles.btnDanger} onClick={archiveCard}>
              Archive Card
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
