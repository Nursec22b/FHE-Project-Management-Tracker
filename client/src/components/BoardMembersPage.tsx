import React, { useState, useEffect, useCallback } from 'react';
import { boards as boardsApi, users as usersApi } from '../services/api';
import type { BoardSummary, User } from '../types';

// ------------------------------------------------------------------ //
//  Colour palette                                                      //
// ------------------------------------------------------------------ //

const COLORS = {
  primary: '#0079BF',
  primaryHover: '#026AA7',
  success: '#61BD4F',
  danger: '#EB5A46',
  bg: '#F4F5F7',
  card: '#FFFFFF',
  text: '#172B4D',
  textSecondary: '#5E6C84',
  border: '#DFE1E6',
};

// ------------------------------------------------------------------ //
//  Types                                                               //
// ------------------------------------------------------------------ //

interface BoardMemberRow {
  userId: string;
  role: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
}

interface FullBoard {
  id: string;
  title: string;
  members: BoardMemberRow[];
}

// ------------------------------------------------------------------ //
//  Component                                                           //
// ------------------------------------------------------------------ //

export default function BoardMembersPage() {
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  const [boardDetails, setBoardDetails] = useState<FullBoard | null>(null);

  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Add member state
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedRole, setSelectedRole] = useState<'admin' | 'member' | 'viewer'>('member');
  const [addingMember, setAddingMember] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Success toast
  const [toast, setToast] = useState<string | null>(null);

  // ---------------------------------------------------------------- //
  //  Load boards + users on mount                                      //
  // ---------------------------------------------------------------- //

  useEffect(() => {
    const load = async () => {
      try {
        const [boardList, userList] = await Promise.all([
          boardsApi.list(),
          usersApi.list(),
        ]);
        setBoards(boardList);
        setAllUsers(userList);
        if (boardList.length > 0) {
          setSelectedBoardId(boardList[0].id);
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // ---------------------------------------------------------------- //
  //  Load board detail when selection changes                          //
  // ---------------------------------------------------------------- //

  const loadBoardDetail = useCallback(async (boardId: string) => {
    setDetailLoading(true);
    setAddError(null);
    try {
      const data = await boardsApi.getById(boardId);
      setBoardDetails({
        id: data.id,
        title: data.title,
        members: (data.members || []).map((m) => ({
          userId: m.userId,
          role: m.role,
          displayName: m.displayName || m.user?.displayName || 'Unknown',
          email: m.email || m.user?.email || '',
          avatarUrl: m.avatarUrl ?? m.user?.avatarUrl ?? null,
        })),
      });
    } catch {
      // ignore
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedBoardId) {
      loadBoardDetail(selectedBoardId);
      setSelectedUserId('');
    }
  }, [selectedBoardId, loadBoardDetail]);

  // Auto-dismiss toast
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3500);
      return () => clearTimeout(t);
    }
  }, [toast]);

  // ---------------------------------------------------------------- //
  //  Add member                                                        //
  // ---------------------------------------------------------------- //

  const handleAddMember = async () => {
    if (!selectedBoardId || !selectedUserId) return;
    setAddingMember(true);
    setAddError(null);
    try {
      await boardsApi.addMember(selectedBoardId, { userId: selectedUserId, role: selectedRole });
      setSelectedUserId('');
      setToast('Member added successfully');
      await loadBoardDetail(selectedBoardId);
    } catch (err: unknown) {
      setAddError(err instanceof Error ? err.message : 'Failed to add member');
    } finally {
      setAddingMember(false);
    }
  };

  // ---------------------------------------------------------------- //
  //  Remove member                                                     //
  // ---------------------------------------------------------------- //

  const handleRemoveMember = async (userId: string, displayName: string) => {
    if (!selectedBoardId) return;
    if (!window.confirm(`Remove ${displayName} from this board?`)) return;
    try {
      await boardsApi.removeMember(selectedBoardId, userId);
      setToast(`${displayName} removed from board`);
      await loadBoardDetail(selectedBoardId);
    } catch (err: unknown) {
      setAddError(err instanceof Error ? err.message : 'Failed to remove member');
    }
  };

  // ---------------------------------------------------------------- //
  //  Derived: users not already on this board                          //
  // ---------------------------------------------------------------- //

  const existingMemberIds = new Set(boardDetails?.members.map((m) => m.userId) ?? []);
  const availableToAdd = allUsers.filter((u) => !existingMemberIds.has(u.id));

  // ---------------------------------------------------------------- //
  //  Render                                                            //
  // ---------------------------------------------------------------- //

  if (loading) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: COLORS.textSecondary, fontSize: 15 }}>
        Loading...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 32 }}>
        <div style={{ color: COLORS.danger, fontSize: 14 }}>{error}</div>
      </div>
    );
  }

  const roleColors: Record<string, string> = {
    admin: '#0079BF',
    member: '#61BD4F',
    viewer: '#5E6C84',
  };

  return (
    <div style={{ flex: 1, background: COLORS.bg, overflow: 'auto', padding: '32px 24px' }}>
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 70, right: 20, background: COLORS.success,
          color: '#fff', padding: '12px 20px', borderRadius: 8,
          boxShadow: '0 4px 12px rgba(0,0,0,0.25)', fontSize: 14, fontWeight: 600,
          zIndex: 9999,
        }}>
          {toast}
        </div>
      )}

      <div style={{ maxWidth: 820, margin: '0 auto' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: COLORS.text, marginBottom: 6 }}>
          Board Members
        </h1>
        <p style={{ fontSize: 14, color: COLORS.textSecondary, marginBottom: 24 }}>
          Add or remove members from project boards. Members can view and edit board content based on their role.
        </p>

        {/* Board selector */}
        <div style={{ marginBottom: 24 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: COLORS.textSecondary, display: 'block', marginBottom: 6 }}>
            SELECT BOARD
          </label>
          <select
            value={selectedBoardId ?? ''}
            onChange={(e) => setSelectedBoardId(e.target.value)}
            style={{
              padding: '8px 12px', fontSize: 14, border: '1px solid ' + COLORS.border,
              borderRadius: 6, color: COLORS.text, background: COLORS.card,
              outline: 'none', minWidth: 280, cursor: 'pointer',
            }}
          >
            {boards.map((b) => (
              <option key={b.id} value={b.id}>{b.title}</option>
            ))}
          </select>
        </div>

        {detailLoading ? (
          <div style={{ padding: 32, textAlign: 'center', color: COLORS.textSecondary, fontSize: 14 }}>
            Loading board members...
          </div>
        ) : boardDetails ? (
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>

            {/* Current members list */}
            <div style={{ flex: 1, minWidth: 300, background: COLORS.card, borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
              <div style={{
                padding: '14px 18px', borderBottom: '1px solid ' + COLORS.border,
                fontSize: 14, fontWeight: 700, color: COLORS.text,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <span>{boardDetails.title}</span>
                <span style={{ fontSize: 12, color: COLORS.textSecondary, fontWeight: 400 }}>
                  {boardDetails.members.length} member{boardDetails.members.length !== 1 ? 's' : ''}
                </span>
              </div>

              {boardDetails.members.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: COLORS.textSecondary, fontSize: 13 }}>
                  No members yet
                </div>
              ) : (
                boardDetails.members.map((m) => {
                  const initials = m.displayName.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
                  return (
                    <div
                      key={m.userId}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '12px 18px', borderBottom: '1px solid ' + COLORS.border,
                      }}
                    >
                      {/* Avatar */}
                      <div style={{
                        width: 34, height: 34, borderRadius: '50%',
                        background: COLORS.primary, color: '#fff',
                        fontSize: 13, fontWeight: 700,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0, overflow: 'hidden',
                      }}>
                        {m.avatarUrl ? (
                          <img src={m.avatarUrl} alt={m.displayName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : initials}
                      </div>

                      {/* Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {m.displayName}
                        </div>
                        <div style={{ fontSize: 12, color: COLORS.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {m.email}
                        </div>
                      </div>

                      {/* Role badge */}
                      <span style={{
                        fontSize: 11, fontWeight: 700,
                        background: roleColors[m.role] ?? COLORS.textSecondary,
                        color: '#fff', padding: '2px 8px', borderRadius: 3,
                        textTransform: 'uppercase' as const, letterSpacing: '0.3px',
                        flexShrink: 0,
                      }}>
                        {m.role}
                      </span>

                      {/* Remove button */}
                      <button
                        onClick={() => handleRemoveMember(m.userId, m.displayName)}
                        title={`Remove ${m.displayName}`}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: COLORS.textSecondary, fontSize: 16, lineHeight: 1,
                          padding: '2px 4px', borderRadius: 4, flexShrink: 0,
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = COLORS.danger; e.currentTarget.style.background = '#FFF0F0'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = COLORS.textSecondary; e.currentTarget.style.background = 'transparent'; }}
                      >
                        &times;
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            {/* Add member panel */}
            <div style={{ width: 280, background: COLORS.card, borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: 18 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.text, marginBottom: 14 }}>
                Add Member
              </div>

              <label style={{ fontSize: 12, fontWeight: 600, color: COLORS.textSecondary, display: 'block', marginBottom: 4 }}>
                USER
              </label>
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                style={{
                  width: '100%', padding: '8px 10px', fontSize: 13,
                  border: '1px solid ' + COLORS.border, borderRadius: 4,
                  color: COLORS.text, background: '#fff', outline: 'none',
                  marginBottom: 12, boxSizing: 'border-box' as const,
                }}
              >
                <option value="">— Select user —</option>
                {availableToAdd.map((u) => (
                  <option key={u.id} value={u.id}>{u.displayName} ({u.email})</option>
                ))}
              </select>

              {availableToAdd.length === 0 && (
                <div style={{ fontSize: 12, color: COLORS.textSecondary, marginBottom: 12 }}>
                  All users are already members of this board.
                </div>
              )}

              <label style={{ fontSize: 12, fontWeight: 600, color: COLORS.textSecondary, display: 'block', marginBottom: 4 }}>
                ROLE
              </label>
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value as 'admin' | 'member' | 'viewer')}
                style={{
                  width: '100%', padding: '8px 10px', fontSize: 13,
                  border: '1px solid ' + COLORS.border, borderRadius: 4,
                  color: COLORS.text, background: '#fff', outline: 'none',
                  marginBottom: 16, boxSizing: 'border-box' as const,
                }}
              >
                <option value="viewer">Viewer — read only</option>
                <option value="member">Member — can edit cards</option>
                <option value="admin">Admin — full board control</option>
              </select>

              {addError && (
                <div style={{ fontSize: 12, color: COLORS.danger, marginBottom: 10 }}>{addError}</div>
              )}

              <button
                onClick={handleAddMember}
                disabled={!selectedUserId || addingMember}
                style={{
                  width: '100%', padding: '9px 0',
                  background: selectedUserId && !addingMember ? COLORS.primary : '#DFE1E6',
                  color: selectedUserId && !addingMember ? '#fff' : COLORS.textSecondary,
                  border: 'none', borderRadius: 4, fontSize: 13, fontWeight: 600,
                  cursor: selectedUserId && !addingMember ? 'pointer' : 'not-allowed',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => { if (selectedUserId && !addingMember) e.currentTarget.style.background = COLORS.primaryHover; }}
                onMouseLeave={(e) => { if (selectedUserId && !addingMember) e.currentTarget.style.background = COLORS.primary; }}
              >
                {addingMember ? 'Adding...' : 'Add to Board'}
              </button>

              <div style={{ marginTop: 16, fontSize: 12, color: COLORS.textSecondary, lineHeight: 1.5 }}>
                <strong>Viewer:</strong> Can view cards but not edit.<br />
                <strong>Member:</strong> Can create and edit cards.<br />
                <strong>Admin:</strong> Full control including board settings.
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
