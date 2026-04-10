/**
 * Trello → FHE import service.
 *
 * Re-usable core logic that takes a parsed Trello JSON export and writes
 * it into the database inside a single transaction.  Used by both the
 * CLI script (scripts/import-trello.ts) and the admin REST endpoint.
 */

import { PoolClient } from 'pg';
import { pool, query as poolQuery } from '../db/pool';

// ════════════════════════════════════════════════════════════════════════════
// Trello types (subset we need)
// ════════════════════════════════════════════════════════════════════════════

export interface TrelloMember {
  id: string;
  username: string;
  fullName: string;
}

interface TrelloLabel {
  id: string;
  name: string;
  color: string | null;
}

interface TrelloList {
  id: string;
  name: string;
  pos: number;
  closed: boolean;
}

interface TrelloCheckItem {
  id: string;
  name: string;
  state: 'complete' | 'incomplete';
  pos: number;
}

interface TrelloChecklist {
  id: string;
  name: string;
  idCard: string;
  checkItems: TrelloCheckItem[];
}

interface TrelloCard {
  id: string;
  name: string;
  desc: string;
  idList: string;
  pos: number;
  due: string | null;
  closed: boolean;
  idLabels: string[];
  idMembers: string[];
  idChecklists: string[];
}

interface TrelloCommentAction {
  id: string;
  type: 'commentCard';
  date: string;
  memberCreator: TrelloMember;
  data: { card: { id: string }; text: string };
}

export interface TrelloBoard {
  id: string;
  name: string;
  desc: string;
  closed: boolean;
  labels: TrelloLabel[];
  lists: TrelloList[];
  cards: TrelloCard[];
  members: TrelloMember[];
  checklists: TrelloChecklist[];
  actions: Array<TrelloCommentAction | { type: string; [key: string]: unknown }>;
}

// ════════════════════════════════════════════════════════════════════════════
// Import options & result types
// ════════════════════════════════════════════════════════════════════════════

export interface ImportOptions {
  /** Trello username → FHE email mapping */
  memberMap?: Record<string, string>;
  /** Import into an existing FHE board instead of creating one */
  boardId?: string | null;
  /** Include archived Trello lists and cards */
  includeArchived?: boolean;
}

export interface ImportStats {
  boardId: string;
  boardName: string;
  listsCreated: number;
  listsSkipped: number;
  labelsCreated: number;
  cardsCreated: number;
  cardsSkipped: number;
  checklistsCreated: number;
  checklistItemsCreated: number;
  commentsCreated: number;
  assignmentsLinked: number;
  assignmentsSkipped: number;
  errors: string[];
}

// ════════════════════════════════════════════════════════════════════════════
// Trello colour → hex
// ════════════════════════════════════════════════════════════════════════════

const TRELLO_COLOR_HEX: Record<string, string> = {
  green: '#61BD4F', yellow: '#F2D600', orange: '#FF9F1A', red: '#EB5A46',
  purple: '#C377E0', blue: '#0079BF', sky: '#00C2E0', lime: '#51E898',
  pink: '#FF78CB', black: '#4D4D4D',
  green_dark: '#0C5A24', green_light: '#9EDB6B', yellow_dark: '#B8860B',
  yellow_light: '#FFF4D9', orange_dark: '#CC5500', orange_light: '#FFD8A8',
  red_dark: '#7C2D12', red_light: '#FFCFC4', purple_dark: '#6B21A8',
  purple_light: '#EDE9FE', blue_dark: '#0C3E8C', blue_light: '#BAE6FD',
  sky_dark: '#0369A1', sky_light: '#E0F2FE', lime_dark: '#166534',
  lime_light: '#DCFCE7', pink_dark: '#831843', pink_light: '#FCE7F3',
  black_dark: '#1C1C1C', black_light: '#9CA3AF',
};

function trelloColorToHex(color: string | null): string {
  if (!color) return '#B3BAC5';
  return TRELLO_COLOR_HEX[color.toLowerCase().replace(/-/g, '_')] ?? '#B3BAC5';
}

// ════════════════════════════════════════════════════════════════════════════
// Preview (returns member list + summary without touching the DB)
// ════════════════════════════════════════════════════════════════════════════

export interface ImportPreview {
  boardName: string;
  boardDesc: string;
  lists: number;
  archivedLists: number;
  cards: number;
  archivedCards: number;
  labels: number;
  checklists: number;
  comments: number;
  trelloMembers: Array<{ id: string; username: string; fullName: string }>;
}

export function previewImport(trello: TrelloBoard): ImportPreview {
  const activeLists = trello.lists.filter(l => !l.closed);
  const activeCards = trello.cards.filter(c => !c.closed);
  const comments = trello.actions.filter(a => a.type === 'commentCard');

  return {
    boardName: trello.name,
    boardDesc: trello.desc || '',
    lists: activeLists.length,
    archivedLists: trello.lists.length - activeLists.length,
    cards: activeCards.length,
    archivedCards: trello.cards.length - activeCards.length,
    labels: trello.labels.length,
    checklists: trello.checklists.length,
    comments: comments.length,
    trelloMembers: trello.members.map(m => ({
      id: m.id,
      username: m.username,
      fullName: m.fullName,
    })),
  };
}

// ════════════════════════════════════════════════════════════════════════════
// Execute import
// ════════════════════════════════════════════════════════════════════════════

export async function executeTrelloImport(
  trello: TrelloBoard,
  adminUserId: string,
  opts: ImportOptions = {},
): Promise<ImportStats> {
  const memberMap = opts.memberMap ?? {};
  const includeArchived = opts.includeArchived ?? false;

  const client: PoolClient = await pool.connect();

  const stats: ImportStats = {
    boardId: '',
    boardName: trello.name,
    listsCreated: 0,
    listsSkipped: 0,
    labelsCreated: 0,
    cardsCreated: 0,
    cardsSkipped: 0,
    checklistsCreated: 0,
    checklistItemsCreated: 0,
    commentsCreated: 0,
    assignmentsLinked: 0,
    assignmentsSkipped: 0,
    errors: [],
  };

  try {
    await client.query('BEGIN');

    // ── email → user-id lookup ─────────────────────────────────────────
    const usersResult = await client.query(
      'SELECT id, email FROM users WHERE is_active = true',
    );
    const emailToUserId = new Map<string, string>(
      usersResult.rows.map((r: { id: string; email: string }) => [
        r.email.toLowerCase(),
        r.id,
      ]),
    );

    // ── Trello member → FHE user ──────────────────────────────────────
    const trelloMemberToFheId = new Map<string, string | null>();
    for (const m of trello.members) {
      const fheEmail = memberMap[m.username];
      if (fheEmail) {
        const fheId = emailToUserId.get(fheEmail.toLowerCase());
        if (fheId) {
          trelloMemberToFheId.set(m.id, fheId);
        } else {
          trelloMemberToFheId.set(m.id, null);
          stats.errors.push(
            `@${m.username} mapped to "${fheEmail}" but that email is not in the database`,
          );
        }
      } else {
        trelloMemberToFheId.set(m.id, null);
      }
    }

    // ── Board ──────────────────────────────────────────────────────────
    let fheBoardId: string;

    if (opts.boardId) {
      const check = await client.query(
        'SELECT id, title FROM boards WHERE id = $1',
        [opts.boardId],
      );
      if (check.rows.length === 0) {
        throw new Error(`Board "${opts.boardId}" not found.`);
      }
      fheBoardId = opts.boardId;
    } else {
      const boardResult = await client.query(
        `INSERT INTO boards (title, description, background_color, created_by)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [trello.name, trello.desc || null, '#0079BF', adminUserId],
      );
      fheBoardId = boardResult.rows[0].id;

      await client.query(
        `INSERT INTO board_members (board_id, user_id, role)
         VALUES ($1, $2, 'admin') ON CONFLICT DO NOTHING`,
        [fheBoardId, adminUserId],
      );
      for (const fheId of trelloMemberToFheId.values()) {
        if (fheId) {
          await client.query(
            `INSERT INTO board_members (board_id, user_id, role)
             VALUES ($1, $2, 'member') ON CONFLICT DO NOTHING`,
            [fheBoardId, fheId],
          );
        }
      }
    }
    stats.boardId = fheBoardId;

    // ── Labels ─────────────────────────────────────────────────────────
    const trelloLabelToFheId = new Map<string, string>();
    for (const label of trello.labels) {
      const r = await client.query(
        'INSERT INTO labels (board_id, name, color) VALUES ($1, $2, $3) RETURNING id',
        [fheBoardId, label.name || null, trelloColorToHex(label.color)],
      );
      trelloLabelToFheId.set(label.id, r.rows[0].id);
      stats.labelsCreated++;
    }

    // ── Lists ──────────────────────────────────────────────────────────
    const activeLists = trello.lists
      .filter(l => includeArchived || !l.closed)
      .sort((a, b) => a.pos - b.pos);

    const trelloListToFheId = new Map<string, string>();
    for (let i = 0; i < activeLists.length; i++) {
      const list = activeLists[i];
      const r = await client.query(
        'INSERT INTO lists (board_id, title, position) VALUES ($1, $2, $3) RETURNING id',
        [fheBoardId, list.name, i],
      );
      trelloListToFheId.set(list.id, r.rows[0].id);
      stats.listsCreated++;
    }
    stats.listsSkipped = trello.lists.length - activeLists.length;

    // ── Index checklists + comments by card ────────────────────────────
    const checklistsByCard = new Map<string, TrelloChecklist[]>();
    for (const cl of trello.checklists) {
      if (!checklistsByCard.has(cl.idCard)) checklistsByCard.set(cl.idCard, []);
      checklistsByCard.get(cl.idCard)!.push(cl);
    }

    const comments = trello.actions.filter(
      (a): a is TrelloCommentAction => a.type === 'commentCard',
    );
    const commentsByCard = new Map<string, TrelloCommentAction[]>();
    for (const c of comments) {
      const cid = c.data.card.id;
      if (!commentsByCard.has(cid)) commentsByCard.set(cid, []);
      commentsByCard.get(cid)!.push(c);
    }

    // ── Cards ──────────────────────────────────────────────────────────
    const activeCards = trello.cards
      .filter(c => includeArchived || !c.closed)
      .sort((a, b) => a.pos - b.pos);

    const listPosCounter = new Map<string, number>();

    for (const card of activeCards) {
      const fheListId = trelloListToFheId.get(card.idList);
      if (!fheListId) { stats.cardsSkipped++; continue; }

      try {
        const pos = listPosCounter.get(fheListId) ?? 0;
        listPosCounter.set(fheListId, pos + 1);

        const cr = await client.query(
          `INSERT INTO cards
             (list_id, title, description, position, due_date, is_archived, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
          [fheListId, card.name, card.desc || null, pos,
           card.due ? new Date(card.due) : null, card.closed, adminUserId],
        );
        const fheCardId: string = cr.rows[0].id;
        stats.cardsCreated++;

        // Labels
        for (const lid of card.idLabels) {
          const fid = trelloLabelToFheId.get(lid);
          if (fid) {
            await client.query(
              'INSERT INTO card_labels (card_id, label_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
              [fheCardId, fid],
            );
          }
        }

        // Assignments
        for (const mid of card.idMembers) {
          const uid = trelloMemberToFheId.get(mid);
          if (uid) {
            await client.query(
              'INSERT INTO card_assignments (card_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
              [fheCardId, uid],
            );
            stats.assignmentsLinked++;
          } else {
            stats.assignmentsSkipped++;
          }
        }

        // Checklists
        const cardCls = (checklistsByCard.get(card.id) ?? []).sort((a, b) =>
          card.idChecklists.indexOf(a.id) - card.idChecklists.indexOf(b.id),
        );
        for (let ci = 0; ci < cardCls.length; ci++) {
          const cl = cardCls[ci];
          const clr = await client.query(
            'INSERT INTO checklists (card_id, title, position) VALUES ($1,$2,$3) RETURNING id',
            [fheCardId, cl.name, ci],
          );
          stats.checklistsCreated++;
          const items = [...cl.checkItems].sort((a, b) => a.pos - b.pos);
          for (let ii = 0; ii < items.length; ii++) {
            await client.query(
              `INSERT INTO checklist_items (checklist_id, content, is_checked, position)
               VALUES ($1,$2,$3,$4)`,
              [clr.rows[0].id, items[ii].name, items[ii].state === 'complete', ii],
            );
            stats.checklistItemsCreated++;
          }
        }

        // Comments
        const cardComments = [...(commentsByCard.get(card.id) ?? [])].sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
        );
        for (const comment of cardComments) {
          const author = comment.memberCreator.fullName || `@${comment.memberCreator.username}`;
          const text = `[Trello — ${author}]\n${comment.data.text}`;
          const uid = trelloMemberToFheId.get(comment.memberCreator.id) ?? adminUserId;
          await client.query(
            `INSERT INTO comments (card_id, user_id, content, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$4)`,
            [fheCardId, uid, text, new Date(comment.date)],
          );
          stats.commentsCreated++;
        }
      } catch (err: unknown) {
        stats.errors.push(`Card "${card.name}": ${err instanceof Error ? err.message : String(err)}`);
        stats.cardsSkipped++;
      }
    }

    await client.query('COMMIT');
    return stats;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
