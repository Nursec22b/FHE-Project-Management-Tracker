import React, { useState, useRef } from 'react';
import { admin, users as usersApi } from '../services/api';
import type { TrelloImportPreview, TrelloImportResult } from '../services/api';
import type { User } from '../types';

interface Props {
  onClose: () => void;
  onImported: () => void;
}

type Step = 'upload' | 'map' | 'importing' | 'done';

export default function ImportTrello({ onClose, onImported }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('upload');
  const [error, setError] = useState<string | null>(null);
  const [trelloJson, setTrelloJson] = useState<unknown>(null);
  const [preview, setPreview] = useState<TrelloImportPreview | null>(null);
  const [fheUsers, setFheUsers] = useState<User[]>([]);
  const [memberMap, setMemberMap] = useState<Record<string, string>>({});
  const [includeArchived, setIncludeArchived] = useState(true);
  const [result, setResult] = useState<TrelloImportResult | null>(null);

  // ── Step 1: upload file and get preview ──────────────────────────────
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      setTrelloJson(json);

      const [previewData, userList] = await Promise.all([
        admin.previewTrelloImport(json),
        usersApi.list(),
      ]);

      setPreview(previewData);
      setFheUsers(userList);

      // Auto-match by display name where possible
      const autoMap: Record<string, string> = {};
      for (const tm of previewData.trelloMembers) {
        const match = userList.find(
          u =>
            u.displayName.toLowerCase() === tm.fullName.toLowerCase() ||
            u.email.toLowerCase().includes(tm.username.toLowerCase()),
        );
        if (match) autoMap[tm.username] = match.email;
      }
      setMemberMap(autoMap);
      setStep('map');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to parse Trello JSON file.');
    }
  };

  // ── Step 2: execute import ───────────────────────────────────────────
  const handleImport = async () => {
    if (!trelloJson) return;
    setStep('importing');
    setError(null);
    try {
      const res = await admin.executeTrelloImport({
        trello: trelloJson,
        memberMap,
        includeArchived,
      });
      setResult(res);
      setStep('done');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Import failed.');
      setStep('map');
    }
  };

  // ── Styles ───────────────────────────────────────────────────────────
  const s = {
    overlay: {
      position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 16,
    },
    modal: {
      background: '#fff', borderRadius: 8, padding: 28, width: '100%',
      maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' as const,
      boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
    },
    title: { fontSize: 18, fontWeight: 700, color: '#172B4D', marginBottom: 16 },
    subtitle: { fontSize: 14, fontWeight: 600, color: '#172B4D', marginBottom: 8 },
    text: { fontSize: 13, color: '#5E6C84', marginBottom: 12 },
    stat: { fontSize: 13, color: '#172B4D', padding: '2px 0' },
    row: {
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '6px 0', borderBottom: '1px solid #f0f0f0',
    },
    label: { flex: 1, fontSize: 13, color: '#172B4D' },
    select: {
      flex: 1, padding: '6px 8px', fontSize: 13, border: '1px solid #DFE1E6',
      borderRadius: 4, color: '#172B4D',
    },
    btn: {
      padding: '8px 20px', border: 'none', borderRadius: 4, fontSize: 14,
      fontWeight: 600, cursor: 'pointer',
    },
    btnPrimary: { background: '#0079BF', color: '#fff' },
    btnSecondary: { background: 'transparent', color: '#5E6C84' },
    btnSuccess: { background: '#61BD4F', color: '#fff' },
    actions: { display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 },
    error: {
      background: '#FFEBE6', color: '#EB5A46', padding: '8px 12px',
      borderRadius: 4, fontSize: 13, marginBottom: 12,
    },
    success: {
      background: '#E3FCEF', color: '#006644', padding: '8px 12px',
      borderRadius: 4, fontSize: 13, marginBottom: 12,
    },
    upload: {
      border: '2px dashed #C1C7D0', borderRadius: 8, padding: 40,
      textAlign: 'center' as const, cursor: 'pointer', color: '#5E6C84',
      fontSize: 14, transition: 'border-color 0.15s',
    },
  };

  return (
    <div style={s.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={s.modal}>
        <div style={s.title}>Import from Trello</div>

        {error && <div style={s.error}>{error}</div>}

        {/* ── Upload step ───────────────────────────────────────── */}
        {step === 'upload' && (
          <>
            <div style={s.text}>
              Export your Trello board as JSON (Board menu → More → Print and Export
              → Export as JSON), then upload the file here.
            </div>
            <div
              style={s.upload}
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files[0];
                if (file && fileRef.current) {
                  const dt = new DataTransfer();
                  dt.items.add(file);
                  fileRef.current.files = dt.files;
                  fileRef.current.dispatchEvent(new Event('change', { bubbles: true }));
                }
              }}
            >
              Click to select file or drag &amp; drop
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".json"
              style={{ display: 'none' }}
              onChange={handleFile}
            />
            <div style={s.actions}>
              <button style={{ ...s.btn, ...s.btnSecondary }} onClick={onClose}>Cancel</button>
            </div>
          </>
        )}

        {/* ── Map members + confirm step ────────────────────────── */}
        {step === 'map' && preview && (
          <>
            <div style={s.subtitle}>Board: {preview.boardName}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginBottom: 16 }}>
              <div style={s.stat}>Lists: {preview.lists}</div>
              <div style={s.stat}>Labels: {preview.labels}</div>
              <div style={s.stat}>Cards: {preview.cards}</div>
              <div style={s.stat}>Checklists: {preview.checklists}</div>
              <div style={s.stat}>Comments: {preview.comments}</div>
              <div style={s.stat}>Archived: {preview.archivedCards} cards, {preview.archivedLists} lists (skipped)</div>
            </div>

            {preview.trelloMembers.length > 0 && (
              <>
                <div style={s.subtitle}>Map Trello Members → FHE Users</div>
                <div style={s.text}>Match each Trello member to their FHE account so card assignments carry over.</div>
                {preview.trelloMembers.map((tm) => (
                  <div key={tm.id} style={s.row}>
                    <div style={s.label}>
                      <strong>@{tm.username}</strong>
                      <span style={{ color: '#5E6C84' }}> ({tm.fullName})</span>
                    </div>
                    <select
                      style={s.select}
                      value={memberMap[tm.username] ?? ''}
                      onChange={(e) =>
                        setMemberMap((prev) => ({
                          ...prev,
                          [tm.username]: e.target.value,
                        }))
                      }
                    >
                      <option value="">— Skip —</option>
                      {fheUsers.map((u) => (
                        <option key={u.id} value={u.email}>
                          {u.displayName} ({u.email})
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, marginBottom: 4 }}>
              <input
                id="includeArchived"
                type="checkbox"
                checked={includeArchived}
                onChange={(e) => setIncludeArchived(e.target.checked)}
                style={{ cursor: 'pointer', accentColor: '#0079BF', width: 16, height: 16 }}
              />
              <label htmlFor="includeArchived" style={{ fontSize: 13, color: '#172B4D', cursor: 'pointer' }}>
                Include archived cards and lists ({preview.archivedCards} cards, {preview.archivedLists} lists)
              </label>
            </div>

            <div style={s.actions}>
              <button style={{ ...s.btn, ...s.btnSecondary }} onClick={onClose}>Cancel</button>
              <button style={{ ...s.btn, ...s.btnPrimary }} onClick={handleImport}>
                Import Board
              </button>
            </div>
          </>
        )}

        {/* ── Importing spinner ─────────────────────────────────── */}
        {step === 'importing' && (
          <div style={{ textAlign: 'center', padding: 40, color: '#5E6C84', fontSize: 14 }}>
            Importing... this may take a minute for large boards.
          </div>
        )}

        {/* ── Done ──────────────────────────────────────────────── */}
        {step === 'done' && result && (
          <>
            <div style={s.success}>
              Successfully imported "{result.boardName}"
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginBottom: 8 }}>
              <div style={s.stat}>Lists: {result.listsCreated}</div>
              <div style={s.stat}>Labels: {result.labelsCreated}</div>
              <div style={s.stat}>Cards: {result.cardsCreated}</div>
              <div style={s.stat}>Checklists: {result.checklistsCreated}</div>
              <div style={s.stat}>Checklist items: {result.checklistItemsCreated}</div>
              <div style={s.stat}>Comments: {result.commentsCreated}</div>
              <div style={s.stat}>Assignments: {result.assignmentsLinked} linked</div>
              <div style={s.stat}>Skipped: {result.cardsSkipped} cards, {result.assignmentsSkipped} assignments</div>
            </div>

            {result.errors.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#DE350B', marginBottom: 4 }}>
                  {result.errors.length} warning(s):
                </div>
                {result.errors.map((e, i) => (
                  <div key={i} style={{ fontSize: 12, color: '#5E6C84', paddingLeft: 8 }}>• {e}</div>
                ))}
              </div>
            )}

            <div style={s.actions}>
              <button
                style={{ ...s.btn, ...s.btnSuccess }}
                onClick={() => { onImported(); onClose(); }}
              >
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
