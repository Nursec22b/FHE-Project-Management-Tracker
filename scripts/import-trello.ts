#!/usr/bin/env ts-node
/**
 * Trello → FHE Project Board Import Script
 *
 * Reads a Trello JSON export and inserts the board, lists, cards, labels,
 * checklists, and comments directly into the FHE PostgreSQL database.
 * All writes happen inside a single transaction — if anything fails the
 * entire import is rolled back with no partial data left behind.
 *
 * ── How to run ──────────────────────────────────────────────────────────────
 *   cd server
 *   DATABASE_URL=<your-db-url> npx ts-node ../scripts/import-trello.ts \
 *     ../exports/mattamy.json
 *
 *   # or with a .env file in the project root / server/:
 *   npx ts-node ../scripts/import-trello.ts ../exports/mattamy.json
 *
 * ── Options ─────────────────────────────────────────────────────────────────
 *   --member-map <path>    Path to member-map.json
 *                          (default: ../scripts/member-map.json)
 *   --board-id <uuid>      Import into an existing FHE board instead of
 *                          creating a new one
 *   --dry-run              Print a summary of what would be imported;
 *                          makes NO database changes
 *   --include-archived     Also import archived lists and cards
 *                          (default: skip them)
 *
 * ── Examples ────────────────────────────────────────────────────────────────
 *   # Preview only (no writes):
 *   npx ts-node ../scripts/import-trello.ts ../exports/mattamy.json --dry-run
 *
 *   # Import into an existing board:
 *   npx ts-node ../scripts/import-trello.ts ../exports/mattamy.json \
 *     --board-id 550e8400-e29b-41d4-a716-446655440000
 *
 *   # Include archived cards/lists:
 *   npx ts-node ../scripts/import-trello.ts ../exports/mattamy.json \
 *     --include-archived
 */

import fs from 'fs';
import path from 'path';
import { Pool, PoolClient } from 'pg';
import dotenv from 'dotenv';

// Load .env from project root then server/ (whichever has DATABASE_URL wins)
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../server/.env') });

// ════════════════════════════════════════════════════════════════════════════
// Trello JSON shape (subset we actually use)
// ════════════════════════════════════════════════════════════════════════════

interface TrelloMember {
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
  data: {
    card: { id: string };
    text: string;
  };
}

interface TrelloAction {
  type: string;
  [key: string]: unknown;
}

interface TrelloBoard {
  id: string;
  name: string;
  desc: string;
  closed: boolean;
  labels: TrelloLabel[];
  lists: TrelloList[];
  cards: TrelloCard[];
  members: TrelloMember[];
  checklists: TrelloChecklist[];
  actions: (TrelloCommentAction | TrelloAction)[];
}

// ════════════════════════════════════════════════════════════════════════════
// Trello color name → hex
// ════════════════════════════════════════════════════════════════════════════

const TRELLO_COLOR_HEX: Record<string, string> = {
  green:         '#61BD4F',
  yellow:        '#F2D600',
  orange:        '#FF9F1A',
  red:           '#EB5A46',
  purple:        '#C377E0',
  blue:          '#0079BF',
  sky:           '#00C2E0',
  lime:          '#51E898',
  pink:          '#FF78CB',
  black:         '#4D4D4D',
  // 2020+ extended palette
  green_dark:    '#0C5A24',
  green_light:   '#9EDB6B',
  yellow_dark:   '#B8860B',
  yellow_light:  '#FFF4D9',
  orange_dark:   '#CC5500',
  orange_light:  '#FFD8A8',
  red_dark:      '#7C2D12',
  red_light:     '#FFCFC4',
  purple_dark:   '#6B21A8',
  purple_light:  '#EDE9FE',
  blue_dark:     '#0C3E8C',
  blue_light:    '#BAE6FD',
  sky_dark:      '#0369A1',
  sky_light:     '#E0F2FE',
  lime_dark:     '#166534',
  lime_light:    '#DCFCE7',
  pink_dark:     '#831843',
  pink_light:    '#FCE7F3',
  black_dark:    '#1C1C1C',
  black_light:   '#9CA3AF',
};

function trelloColorToHex(color: string | null): string {
  if (!color) return '#B3BAC5';
  return TRELLO_COLOR_HEX[color.toLowerCase().replace(/-/g, '_')] ?? '#B3BAC5';
}

// ════════════════════════════════════════════════════════════════════════════
// CLI argument parsing
// ════════════════════════════════════════════════════════════════════════════

interface CliOptions {
  exportPath: string;
  memberMapPath: string;
  boardId: string | null;
  dryRun: boolean;
  includeArchived: boolean;
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0].startsWith('--')) {
    console.error('Usage: npx ts-node ../scripts/import-trello.ts <trello-export.json> [options]');
    console.error('');
    console.error('Options:');
    console.error('  --member-map <path>    member-map.json path (default: ../scripts/member-map.json)');
    console.error('  --board-id <uuid>      import into an existing FHE board');
    console.error('  --dry-run              preview only; no DB changes');
    console.error('  --include-archived     also import archived lists/cards');
    process.exit(1);
  }

  let memberMapPath = path.resolve(__dirname, 'member-map.json');
  let boardId: string | null = null;
  let dryRun = false;
  let includeArchived = false;

  for (let i = 1; i < args.length; i++) {
    switch (args[i]) {
      case '--member-map':
        memberMapPath = path.resolve(args[++i] ?? '');
        break;
      case '--board-id':
        boardId = args[++i] ?? null;
        break;
      case '--dry-run':
        dryRun = true;
        break;
      case '--include-archived':
        includeArchived = true;
        break;
      default:
        console.error(`Unknown option: ${args[i]}`);
        process.exit(1);
    }
  }

  return {
    exportPath: path.resolve(args[0]),
    memberMapPath,
    boardId,
    dryRun,
    includeArchived,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// Import stats
// ════════════════════════════════════════════════════════════════════════════

interface ImportStats {
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
// DB helpers
// ════════════════════════════════════════════════════════════════════════════

async function dbQuery(client: PoolClient, text: string, params: unknown[]) {
  return client.query(text, params);
}

// ════════════════════════════════════════════════════════════════════════════
// Main
// ════════════════════════════════════════════════════════════════════════════

async function main() {
  const opts = parseArgs();

  // ── Load Trello export ───────────────────────────────────────────────────
  if (!fs.existsSync(opts.exportPath)) {
    console.error(`File not found: ${opts.exportPath}`);
    process.exit(1);
  }

  let trello: TrelloBoard;
  try {
    trello = JSON.parse(fs.readFileSync(opts.exportPath, 'utf8')) as TrelloBoard;
  } catch {
    console.error('Failed to parse JSON. Make sure the file is a valid Trello export.');
    process.exit(1);
  }

  // ── Load member map ──────────────────────────────────────────────────────
  let memberMap: Record<string, string> = {};
  if (fs.existsSync(opts.memberMapPath)) {
    const raw = JSON.parse(fs.readFileSync(opts.memberMapPath, 'utf8')) as Record<string, string>;
    // Strip comment/readme keys (those starting with _)
    memberMap = Object.fromEntries(Object.entries(raw).filter(([k]) => !k.startsWith('_')));
    console.log(`Loaded member map: ${opts.memberMapPath} (${Object.keys(memberMap).length} entries)`);
  } else {
    console.warn(`No member-map.json at ${opts.memberMapPath} — member assignments will be skipped.`);
  }

  // ── Derive active subsets ────────────────────────────────────────────────
  const activeLists = trello.lists
    .filter(l => opts.includeArchived || !l.closed)
    .sort((a, b) => a.pos - b.pos);

  const activeCards = trello.cards
    .filter(c => opts.includeArchived || !c.closed)
    .sort((a, b) => a.pos - b.pos);

  const comments = trello.actions.filter(
    (a): a is TrelloCommentAction => a.type === 'commentCard',
  );

  const archivedListCount = trello.lists.length - activeLists.length;
  const archivedCardCount = trello.cards.length - activeCards.length;

  // ── Pre-flight summary ───────────────────────────────────────────────────
  console.log('\n' + '─'.repeat(56));
  console.log(`  Trello board:    ${trello.name}`);
  console.log(`  Lists:           ${activeLists.length} active  (${archivedListCount} archived)`);
  console.log(`  Cards:           ${activeCards.length} active  (${archivedCardCount} archived)`);
  console.log(`  Labels:          ${trello.labels.length}`);
  console.log(`  Checklists:      ${trello.checklists.length}`);
  console.log(`  Comments:        ${comments.length}`);
  console.log(`  Members:         ${trello.members.length}`);
  if (opts.dryRun) {
    console.log('\n  DRY-RUN — no database changes will be made');
  }
  console.log('─'.repeat(56) + '\n');

  // ── Dry-run: print preview and exit ─────────────────────────────────────
  if (opts.dryRun) {
    console.log('Lists to import:');
    activeLists.forEach((l, i) => console.log(`  [${i}] ${l.name}`));

    console.log('\nLabels to import:');
    trello.labels.forEach(l =>
      console.log(`  "${l.name || '(unnamed)'}"  ${l.color ?? 'none'} → ${trelloColorToHex(l.color)}`),
    );

    console.log('\nCards per list:');
    for (const list of activeLists) {
      const count = activeCards.filter(c => c.idList === list.id).length;
      console.log(`  ${list.name}: ${count} card(s)`);
    }

    console.log('\nMember mapping:');
    for (const m of trello.members) {
      const email = memberMap[m.username];
      console.log(
        `  @${m.username} (${m.fullName}) => ${email ?? '(no mapping — assignments skipped)'}`,
      );
    }

    console.log('\nDry-run complete. Remove --dry-run to execute the import.');
    process.exit(0);
  }

  // ── Connect to database ──────────────────────────────────────────────────
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error(
      'DATABASE_URL is not set.\n' +
      'Set it in your .env file or pass it as an environment variable:\n' +
      '  DATABASE_URL=postgresql://... npx ts-node ../scripts/import-trello.ts ...',
    );
    process.exit(1);
  }

  const pool = new Pool({ connectionString: dbUrl });
  const client = await pool.connect();

  const stats: ImportStats = {
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

    // ── Find admin user to act as creator ──────────────────────────────────
    const adminResult = await dbQuery(
      client,
      `SELECT id FROM users WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1`,
      [],
    );
    if (adminResult.rows.length === 0) {
      throw new Error('No admin user found. Run "npm run db:seed" first.');
    }
    const adminUserId = adminResult.rows[0].id as string;

    // ── Build email → FHE user-id lookup ──────────────────────────────────
    const usersResult = await dbQuery(
      client,
      'SELECT id, email FROM users WHERE is_active = true',
      [],
    );
    const emailToUserId = new Map<string, string>(
      (usersResult.rows as Array<{ id: string; email: string }>).map(r => [
        r.email.toLowerCase(),
        r.id,
      ]),
    );

    // ── Map Trello member IDs → FHE user IDs ──────────────────────────────
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

    // ── Create or reuse board ──────────────────────────────────────────────
    let fheBoardId: string;

    if (opts.boardId) {
      const check = await dbQuery(
        client,
        'SELECT id, title FROM boards WHERE id = $1',
        [opts.boardId],
      );
      if (check.rows.length === 0) {
        throw new Error(`Board "${opts.boardId}" not found in the database.`);
      }
      fheBoardId = opts.boardId;
      console.log(`Using existing board: "${(check.rows[0] as { title: string }).title}" (${fheBoardId})`);
    } else {
      const boardResult = await dbQuery(
        client,
        `INSERT INTO boards (title, description, background_color, created_by)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [trello.name, trello.desc || null, '#0079BF', adminUserId],
      );
      fheBoardId = (boardResult.rows[0] as { id: string }).id;
      console.log(`Created board: "${trello.name}" (${fheBoardId})`);

      // Admin is always an admin member
      await dbQuery(
        client,
        `INSERT INTO board_members (board_id, user_id, role)
         VALUES ($1, $2, 'admin')
         ON CONFLICT DO NOTHING`,
        [fheBoardId, adminUserId],
      );

      // Add all mapped FHE users as members
      for (const fheId of trelloMemberToFheId.values()) {
        if (fheId) {
          await dbQuery(
            client,
            `INSERT INTO board_members (board_id, user_id, role)
             VALUES ($1, $2, 'member')
             ON CONFLICT DO NOTHING`,
            [fheBoardId, fheId],
          );
        }
      }
    }

    // ── Labels ─────────────────────────────────────────────────────────────
    console.log('Importing labels...');
    const trelloLabelToFheId = new Map<string, string>();

    for (const label of trello.labels) {
      const result = await dbQuery(
        client,
        'INSERT INTO labels (board_id, name, color) VALUES ($1, $2, $3) RETURNING id',
        [fheBoardId, label.name || null, trelloColorToHex(label.color)],
      );
      trelloLabelToFheId.set(label.id, (result.rows[0] as { id: string }).id);
      stats.labelsCreated++;
    }
    console.log(`  ${stats.labelsCreated} labels created`);

    // ── Lists ──────────────────────────────────────────────────────────────
    console.log('Importing lists...');
    const trelloListToFheId = new Map<string, string>();

    for (let i = 0; i < activeLists.length; i++) {
      const list = activeLists[i];
      const result = await dbQuery(
        client,
        'INSERT INTO lists (board_id, title, position) VALUES ($1, $2, $3) RETURNING id',
        [fheBoardId, list.name, i],
      );
      trelloListToFheId.set(list.id, (result.rows[0] as { id: string }).id);
      stats.listsCreated++;
      console.log(`  [${i}] ${list.name}`);
    }

    stats.listsSkipped = archivedListCount;

    // ── Build indexes for checklists and comments ──────────────────────────
    const checklistsByCard = new Map<string, TrelloChecklist[]>();
    for (const cl of trello.checklists) {
      if (!checklistsByCard.has(cl.idCard)) checklistsByCard.set(cl.idCard, []);
      checklistsByCard.get(cl.idCard)!.push(cl);
    }

    const commentsByCard = new Map<string, TrelloCommentAction[]>();
    for (const action of comments) {
      const cardId = action.data.card.id;
      if (!commentsByCard.has(cardId)) commentsByCard.set(cardId, []);
      commentsByCard.get(cardId)!.push(action);
    }

    // ── Cards ──────────────────────────────────────────────────────────────
    console.log('\nImporting cards...');
    const listPositionCounter = new Map<string, number>();

    for (const card of activeCards) {
      const fheListId = trelloListToFheId.get(card.idList);
      if (!fheListId) {
        // Card belongs to an archived list that was skipped
        stats.cardsSkipped++;
        continue;
      }

      try {
        const pos = listPositionCounter.get(fheListId) ?? 0;
        listPositionCounter.set(fheListId, pos + 1);

        const cardResult = await dbQuery(
          client,
          `INSERT INTO cards
             (list_id, title, description, position, due_date, is_archived, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id`,
          [
            fheListId,
            card.name,
            card.desc || null,
            pos,
            card.due ? new Date(card.due) : null,
            card.closed,
            adminUserId,
          ],
        );
        const fheCardId = (cardResult.rows[0] as { id: string }).id;
        stats.cardsCreated++;

        // Labels
        for (const trelloLabelId of card.idLabels) {
          const fheLabelId = trelloLabelToFheId.get(trelloLabelId);
          if (fheLabelId) {
            await dbQuery(
              client,
              'INSERT INTO card_labels (card_id, label_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
              [fheCardId, fheLabelId],
            );
          }
        }

        // Member assignments
        for (const trelloMemberId of card.idMembers) {
          const fheUserId = trelloMemberToFheId.get(trelloMemberId);
          if (fheUserId) {
            await dbQuery(
              client,
              'INSERT INTO card_assignments (card_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
              [fheCardId, fheUserId],
            );
            stats.assignmentsLinked++;
          } else {
            stats.assignmentsSkipped++;
          }
        }

        // Checklists (preserve card.idChecklists order)
        const cardChecklists = (checklistsByCard.get(card.id) ?? []).sort((a, b) => {
          return card.idChecklists.indexOf(a.id) - card.idChecklists.indexOf(b.id);
        });

        for (let ci = 0; ci < cardChecklists.length; ci++) {
          const cl = cardChecklists[ci];
          const clResult = await dbQuery(
            client,
            'INSERT INTO checklists (card_id, title, position) VALUES ($1, $2, $3) RETURNING id',
            [fheCardId, cl.name, ci],
          );
          const fheClId = (clResult.rows[0] as { id: string }).id;
          stats.checklistsCreated++;

          const sortedItems = [...cl.checkItems].sort((a, b) => a.pos - b.pos);
          for (let ii = 0; ii < sortedItems.length; ii++) {
            const item = sortedItems[ii];
            await dbQuery(
              client,
              `INSERT INTO checklist_items (checklist_id, content, is_checked, position)
               VALUES ($1, $2, $3, $4)`,
              [fheClId, item.name, item.state === 'complete', ii],
            );
            stats.checklistItemsCreated++;
          }
        }

        // Comments — oldest first so the thread reads chronologically
        const cardComments = [...(commentsByCard.get(card.id) ?? [])].sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
        );

        for (const comment of cardComments) {
          const authorName = comment.memberCreator.fullName || `@${comment.memberCreator.username}`;
          const text = `[Trello — ${authorName}]\n${comment.data.text}`;
          const userId = trelloMemberToFheId.get(comment.memberCreator.id) ?? adminUserId;

          await dbQuery(
            client,
            `INSERT INTO comments (card_id, user_id, content, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $4)`,
            [fheCardId, userId, text, new Date(comment.date)],
          );
          stats.commentsCreated++;
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        stats.errors.push(`Card "${card.name}": ${msg}`);
        stats.cardsSkipped++;
      }
    }

    await client.query('COMMIT');

    // ── Summary ────────────────────────────────────────────────────────────
    console.log('\n' + '═'.repeat(56));
    console.log('  Import complete!');
    console.log('═'.repeat(56));
    console.log(`  Board ID:           ${fheBoardId}`);
    console.log(`  Lists created:      ${stats.listsCreated}  (${stats.listsSkipped} skipped)`);
    console.log(`  Labels created:     ${stats.labelsCreated}`);
    console.log(`  Cards created:      ${stats.cardsCreated}  (${stats.cardsSkipped} skipped)`);
    console.log(`  Checklists:         ${stats.checklistsCreated}`);
    console.log(`  Checklist items:    ${stats.checklistItemsCreated}`);
    console.log(`  Comments:           ${stats.commentsCreated}`);
    console.log(
      `  Assignments:        ${stats.assignmentsLinked} linked` +
      `  /  ${stats.assignmentsSkipped} skipped (no mapping)`,
    );

    if (stats.errors.length > 0) {
      console.log(`\n  ${stats.errors.length} non-fatal error(s):`);
      stats.errors.forEach(e => console.log(`    • ${e}`));
    }

    console.log('═'.repeat(56) + '\n');
  } catch (err: unknown) {
    await client.query('ROLLBACK');
    const msg = err instanceof Error ? err.message : String(err);
    console.error('\nImport failed — all changes rolled back.');
    console.error(msg);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
