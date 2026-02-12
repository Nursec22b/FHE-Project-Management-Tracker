import React, { useState, useEffect, useCallback } from 'react';
import {
  emailRules as emailRulesApi,
  boards as boardsApi,
  users as usersApi,
  labels as labelsApi,
} from '../services/api';
import type { EmailRule, BoardSummary, List, User, Label, Board } from '../types';

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
//  Blank rule template                                                 //
// ------------------------------------------------------------------ //

interface RuleFormData {
  name: string;
  targetBoardId: string;
  targetListId: string;
  fromAddresses: string;
  fromDomains: string;
  toAddresses: string;
  subjectContains: string;
  subjectNotContains: string;
  assignToUserIds: string[];
  autoLabels: string[];
}

const BLANK_FORM: RuleFormData = {
  name: '',
  targetBoardId: '',
  targetListId: '',
  fromAddresses: '',
  fromDomains: '',
  toAddresses: '',
  subjectContains: '',
  subjectNotContains: '',
  assignToUserIds: [],
  autoLabels: [],
};

// ------------------------------------------------------------------ //
//  Component                                                           //
// ------------------------------------------------------------------ //

export default function EmailRulesPage() {
  const [rules, setRules] = useState<EmailRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Reference data
  const [allBoards, setAllBoards] = useState<BoardSummary[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [boardListsMap, setBoardListsMap] = useState<Record<string, List[]>>({});
  const [boardLabelsMap, setBoardLabelsMap] = useState<Record<string, Label[]>>({});

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [form, setForm] = useState<RuleFormData>({ ...BLANK_FORM });
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // ---------------------------------------------------------------- //
  //  Fetch data                                                        //
  // ---------------------------------------------------------------- //

  const fetchRules = useCallback(async () => {
    try {
      setLoading(true);
      const data = await emailRulesApi.list();
      setRules(data);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load email rules');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchReferenceData = useCallback(async () => {
    try {
      const [boardsData, usersData] = await Promise.all([
        boardsApi.list(),
        usersApi.list(),
      ]);
      setAllBoards(boardsData);
      setAllUsers(usersData);
    } catch {
      // ignore -- form will show empty dropdowns
    }
  }, []);

  useEffect(() => {
    fetchRules();
    fetchReferenceData();
  }, [fetchRules, fetchReferenceData]);

  // ---------------------------------------------------------------- //
  //  When board selection changes, fetch its lists + labels             //
  // ---------------------------------------------------------------- //

  const fetchBoardDetails = useCallback(
    async (boardId: string) => {
      if (!boardId) return;
      if (boardListsMap[boardId]) return; // already cached
      try {
        const board: Board = await boardsApi.getById(boardId);
        setBoardListsMap((prev) => ({
          ...prev,
          [boardId]: (board.lists || []).filter((l) => !l.isArchived),
        }));
        setBoardLabelsMap((prev) => ({
          ...prev,
          [boardId]: board.labels || [],
        }));
      } catch {
        // ignore
      }
    },
    [boardListsMap],
  );

  useEffect(() => {
    if (form.targetBoardId) {
      fetchBoardDetails(form.targetBoardId);
    }
  }, [form.targetBoardId, fetchBoardDetails]);

  // ---------------------------------------------------------------- //
  //  Form helpers                                                      //
  // ---------------------------------------------------------------- //

  const openCreateForm = () => {
    setForm({ ...BLANK_FORM });
    setEditingRuleId(null);
    setFormError(null);
    setShowForm(true);
  };

  const openEditForm = (rule: EmailRule) => {
    setForm({
      name: rule.name,
      targetBoardId: rule.targetBoardId,
      targetListId: rule.targetListId,
      fromAddresses: (rule.fromAddresses || []).join(', '),
      fromDomains: (rule.fromDomains || []).join(', '),
      toAddresses: (rule.toAddresses || []).join(', '),
      subjectContains: (rule.subjectContains || []).join(', '),
      subjectNotContains: (rule.subjectNotContains || []).join(', '),
      assignToUserIds: rule.assignToUserIds || [],
      autoLabels: rule.autoLabels || [],
    });
    setEditingRuleId(rule.id);
    setFormError(null);
    setShowForm(true);
    // Make sure we have the board details
    if (rule.targetBoardId) {
      fetchBoardDetails(rule.targetBoardId);
    }
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingRuleId(null);
    setFormError(null);
  };

  const parseCSV = (value: string): string[] =>
    value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormLoading(true);

    const payload = {
      name: form.name.trim(),
      targetBoardId: form.targetBoardId,
      targetListId: form.targetListId,
      fromAddresses: parseCSV(form.fromAddresses),
      fromDomains: parseCSV(form.fromDomains),
      toAddresses: parseCSV(form.toAddresses),
      subjectContains: parseCSV(form.subjectContains),
      subjectNotContains: parseCSV(form.subjectNotContains),
      assignToUserIds: form.assignToUserIds,
      autoLabels: form.autoLabels,
    };

    try {
      if (editingRuleId) {
        await emailRulesApi.update(editingRuleId, payload);
      } else {
        await emailRulesApi.create(payload);
      }
      closeForm();
      await fetchRules();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to save rule');
    } finally {
      setFormLoading(false);
    }
  };

  // ---------------------------------------------------------------- //
  //  Toggle / Delete                                                   //
  // ---------------------------------------------------------------- //

  const handleToggle = async (rule: EmailRule) => {
    try {
      await emailRulesApi.toggle(rule.id, !rule.isActive);
      setRules((prev) =>
        prev.map((r) =>
          r.id === rule.id ? { ...r, isActive: !r.isActive } : r,
        ),
      );
    } catch {
      // ignore
    }
  };

  const handleDelete = async (ruleId: string) => {
    if (!window.confirm('Delete this email rule?')) return;
    try {
      await emailRulesApi.delete(ruleId);
      setRules((prev) => prev.filter((r) => r.id !== ruleId));
    } catch {
      // ignore
    }
  };

  // ---------------------------------------------------------------- //
  //  Multi-select helpers                                              //
  // ---------------------------------------------------------------- //

  const toggleArrayItem = (arr: string[], item: string): string[] =>
    arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item];

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
      maxWidth: 1000,
      margin: '0 auto',
    },
    headerRow: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 24,
    },
    heading: {
      fontSize: 22,
      fontWeight: 700,
      color: COLORS.text,
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
      transition: 'background 0.15s',
    },
    table: {
      width: '100%',
      borderCollapse: 'collapse' as const,
      background: COLORS.card,
      borderRadius: 6,
      overflow: 'hidden',
      boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
    },
    th: {
      textAlign: 'left' as const,
      padding: '12px 14px',
      fontSize: 12,
      fontWeight: 700,
      color: COLORS.textSecondary,
      textTransform: 'uppercase' as const,
      letterSpacing: '0.5px',
      borderBottom: '2px solid ' + COLORS.border,
      background: '#FAFBFC',
    },
    td: {
      padding: '10px 14px',
      fontSize: 14,
      color: COLORS.text,
      borderBottom: '1px solid ' + COLORS.border,
      verticalAlign: 'middle' as const,
    },
    badge: {
      display: 'inline-block',
      padding: '3px 8px',
      borderRadius: 10,
      fontSize: 11,
      fontWeight: 600,
    },
    badgeActive: {
      background: '#E3FCEF',
      color: '#006644',
    },
    badgeInactive: {
      background: '#FFEBE6',
      color: '#BF2600',
    },
    actionBtn: {
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      fontSize: 13,
      fontWeight: 500,
      padding: '4px 8px',
      borderRadius: 3,
      transition: 'background 0.15s',
    },
    // Form overlay
    formOverlay: {
      position: 'fixed' as const,
      inset: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'center',
      zIndex: 2000,
      overflowY: 'auto',
      padding: '48px 16px',
    },
    formCard: {
      background: COLORS.card,
      borderRadius: 8,
      padding: 28,
      width: '100%',
      maxWidth: 600,
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
      border: '1px solid ' + COLORS.border,
      borderRadius: 4,
      outline: 'none',
      boxSizing: 'border-box' as const,
      color: COLORS.text,
    },
    select: {
      width: '100%',
      padding: '8px 12px',
      marginBottom: 14,
      fontSize: 14,
      border: '1px solid ' + COLORS.border,
      borderRadius: 4,
      outline: 'none',
      boxSizing: 'border-box' as const,
      color: COLORS.text,
      background: COLORS.card,
    },
    multiSelect: {
      display: 'flex',
      flexWrap: 'wrap' as const,
      gap: 6,
      marginBottom: 14,
      maxHeight: 120,
      overflowY: 'auto' as const,
      padding: 4,
      border: '1px solid ' + COLORS.border,
      borderRadius: 4,
    },
    multiOption: {
      padding: '4px 10px',
      borderRadius: 4,
      fontSize: 12,
      fontWeight: 500,
      cursor: 'pointer',
      border: '1px solid ' + COLORS.border,
      transition: 'background 0.15s, border-color 0.15s',
    },
    multiOptionSelected: {
      background: '#E4F0F6',
      borderColor: COLORS.primary,
      color: COLORS.primary,
    },
    formActions: {
      display: 'flex',
      gap: 10,
      justifyContent: 'flex-end',
      marginTop: 12,
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
    errorMsg: {
      color: COLORS.danger,
      background: '#FFEBE6',
      padding: '10px 14px',
      borderRadius: 4,
      marginBottom: 16,
      fontSize: 13,
    },
    loadingMsg: {
      color: COLORS.textSecondary,
      fontSize: 14,
      textAlign: 'center' as const,
      padding: 40,
    },
    hint: {
      fontSize: 11,
      color: COLORS.textSecondary,
      marginTop: -10,
      marginBottom: 12,
    },
  };

  // ---------------------------------------------------------------- //
  //  Available lists + labels for the selected board                    //
  // ---------------------------------------------------------------- //

  const availableLists = form.targetBoardId
    ? boardListsMap[form.targetBoardId] || []
    : [];
  const availableLabels = form.targetBoardId
    ? boardLabelsMap[form.targetBoardId] || []
    : [];

  // ---------------------------------------------------------------- //
  //  Filter summary for table                                          //
  // ---------------------------------------------------------------- //

  const filterSummary = (rule: EmailRule): string => {
    const parts: string[] = [];
    if (rule.fromAddresses?.length) parts.push(`from: ${rule.fromAddresses.join(', ')}`);
    if (rule.fromDomains?.length) parts.push(`domains: ${rule.fromDomains.join(', ')}`);
    if (rule.toAddresses?.length) parts.push(`to: ${rule.toAddresses.join(', ')}`);
    if (rule.subjectContains?.length) parts.push(`subj has: ${rule.subjectContains.join(', ')}`);
    if (rule.subjectNotContains?.length) parts.push(`subj not: ${rule.subjectNotContains.join(', ')}`);
    return parts.length > 0 ? parts.join(' | ') : 'No filters';
  };

  // ---------------------------------------------------------------- //
  //  Render                                                            //
  // ---------------------------------------------------------------- //

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={styles.headerRow}>
          <h1 style={styles.heading}>Email Automation Rules</h1>
          <button
            style={styles.btnPrimary}
            onClick={openCreateForm}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = COLORS.primaryHover;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = COLORS.primary;
            }}
          >
            + Create Rule
          </button>
        </div>

        {error && <div style={styles.errorMsg}>{error}</div>}

        {loading ? (
          <div style={styles.loadingMsg}>Loading rules...</div>
        ) : rules.length === 0 ? (
          <div style={styles.loadingMsg}>No email rules yet. Create one to get started.</div>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Name</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Target</th>
                <th style={styles.th}>Filters</th>
                <th style={styles.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id}>
                  <td style={styles.td}>
                    <span style={{ fontWeight: 600 }}>{rule.name}</span>
                  </td>
                  <td style={styles.td}>
                    <span
                      style={{
                        ...styles.badge,
                        ...(rule.isActive ? styles.badgeActive : styles.badgeInactive),
                        cursor: 'pointer',
                      }}
                      onClick={() => handleToggle(rule)}
                      title="Click to toggle"
                    >
                      {rule.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={styles.td}>
                    <span style={{ fontSize: 13 }}>
                      {rule.boardTitle || rule.targetBoardId} &rarr;{' '}
                      {rule.listTitle || rule.targetListId}
                    </span>
                  </td>
                  <td style={{ ...styles.td, fontSize: 12, color: COLORS.textSecondary, maxWidth: 260 }}>
                    <span
                      style={{
                        display: 'block',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={filterSummary(rule)}
                    >
                      {filterSummary(rule)}
                    </span>
                  </td>
                  <td style={styles.td}>
                    <button
                      style={{ ...styles.actionBtn, color: COLORS.primary }}
                      onClick={() => openEditForm(rule)}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#E4F0F6';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      Edit
                    </button>
                    <button
                      style={{ ...styles.actionBtn, color: COLORS.danger }}
                      onClick={() => handleDelete(rule.id)}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#FFEBE6';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* ---- Form modal ---- */}
        {showForm && (
          <div
            style={styles.formOverlay}
            onClick={(e) => {
              if (e.target === e.currentTarget) closeForm();
            }}
          >
            <div style={styles.formCard}>
              <div style={styles.formTitle}>
                {editingRuleId ? 'Edit Email Rule' : 'Create Email Rule'}
              </div>

              {formError && <div style={styles.errorMsg}>{formError}</div>}

              <form onSubmit={handleSubmit}>
                {/* Name */}
                <label style={styles.label}>Rule Name</label>
                <input
                  style={styles.input}
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Client Requests"
                  required
                  autoFocus
                />

                {/* Target Board */}
                <label style={styles.label}>Target Board</label>
                <select
                  style={styles.select}
                  value={form.targetBoardId}
                  onChange={(e) => {
                    setForm((f) => ({
                      ...f,
                      targetBoardId: e.target.value,
                      targetListId: '',
                      autoLabels: [],
                    }));
                  }}
                  required
                >
                  <option value="">-- Select Board --</option>
                  {allBoards.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.title}
                    </option>
                  ))}
                </select>

                {/* Target List */}
                <label style={styles.label}>Target List</label>
                <select
                  style={styles.select}
                  value={form.targetListId}
                  onChange={(e) => setForm((f) => ({ ...f, targetListId: e.target.value }))}
                  required
                  disabled={!form.targetBoardId}
                >
                  <option value="">-- Select List --</option>
                  {availableLists.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.title}
                    </option>
                  ))}
                </select>

                {/* From Addresses */}
                <label style={styles.label}>From Addresses</label>
                <input
                  style={styles.input}
                  value={form.fromAddresses}
                  onChange={(e) => setForm((f) => ({ ...f, fromAddresses: e.target.value }))}
                  placeholder="user@example.com, other@example.com"
                />
                <div style={styles.hint}>Comma-separated email addresses</div>

                {/* From Domains */}
                <label style={styles.label}>From Domains</label>
                <input
                  style={styles.input}
                  value={form.fromDomains}
                  onChange={(e) => setForm((f) => ({ ...f, fromDomains: e.target.value }))}
                  placeholder="example.com, client.org"
                />
                <div style={styles.hint}>Comma-separated domains</div>

                {/* To Addresses */}
                <label style={styles.label}>To Addresses</label>
                <input
                  style={styles.input}
                  value={form.toAddresses}
                  onChange={(e) => setForm((f) => ({ ...f, toAddresses: e.target.value }))}
                  placeholder="team@example.com"
                />
                <div style={styles.hint}>Comma-separated email addresses</div>

                {/* Subject Contains */}
                <label style={styles.label}>Subject Contains (keywords)</label>
                <input
                  style={styles.input}
                  value={form.subjectContains}
                  onChange={(e) => setForm((f) => ({ ...f, subjectContains: e.target.value }))}
                  placeholder="urgent, help, request"
                />
                <div style={styles.hint}>Comma-separated keywords to match in subject</div>

                {/* Subject Exclude */}
                <label style={styles.label}>Subject Exclude (keywords)</label>
                <input
                  style={styles.input}
                  value={form.subjectNotContains}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, subjectNotContains: e.target.value }))
                  }
                  placeholder="newsletter, unsubscribe"
                />
                <div style={styles.hint}>Comma-separated keywords to exclude</div>

                {/* Auto-Assign Users */}
                <label style={styles.label}>Auto-Assign Users</label>
                <div style={styles.multiSelect}>
                  {allUsers.length === 0 && (
                    <span style={{ fontSize: 12, color: COLORS.textSecondary, padding: 4 }}>
                      No users available
                    </span>
                  )}
                  {allUsers.map((u) => {
                    const selected = form.assignToUserIds.includes(u.id);
                    return (
                      <div
                        key={u.id}
                        style={{
                          ...styles.multiOption,
                          ...(selected ? styles.multiOptionSelected : {}),
                        }}
                        onClick={() =>
                          setForm((f) => ({
                            ...f,
                            assignToUserIds: toggleArrayItem(f.assignToUserIds, u.id),
                          }))
                        }
                      >
                        {u.displayName}
                      </div>
                    );
                  })}
                </div>

                {/* Auto-Apply Labels */}
                <label style={styles.label}>Auto-Apply Labels</label>
                <div style={styles.multiSelect}>
                  {availableLabels.length === 0 && (
                    <span style={{ fontSize: 12, color: COLORS.textSecondary, padding: 4 }}>
                      {form.targetBoardId
                        ? 'No labels on selected board'
                        : 'Select a board first'}
                    </span>
                  )}
                  {availableLabels.map((l) => {
                    const selected = form.autoLabels.includes(l.id);
                    return (
                      <div
                        key={l.id}
                        style={{
                          ...styles.multiOption,
                          ...(selected ? styles.multiOptionSelected : {}),
                        }}
                        onClick={() =>
                          setForm((f) => ({
                            ...f,
                            autoLabels: toggleArrayItem(f.autoLabels, l.id),
                          }))
                        }
                      >
                        <span
                          style={{
                            display: 'inline-block',
                            width: 10,
                            height: 10,
                            borderRadius: 2,
                            background: l.color,
                            marginRight: 4,
                            verticalAlign: 'middle',
                          }}
                        />
                        {l.name || l.color}
                      </div>
                    );
                  })}
                </div>

                {/* Actions */}
                <div style={styles.formActions}>
                  <button type="button" style={styles.btnCancel} onClick={closeForm}>
                    Cancel
                  </button>
                  <button
                    type="submit"
                    style={{
                      ...styles.btnPrimary,
                      opacity: formLoading ? 0.7 : 1,
                    }}
                    disabled={formLoading}
                  >
                    {formLoading
                      ? 'Saving...'
                      : editingRuleId
                      ? 'Update Rule'
                      : 'Create Rule'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
