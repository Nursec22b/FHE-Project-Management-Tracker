import bcrypt from 'bcryptjs';
import { pool, query } from './pool';

/**
 * Seed the database with default admin user and MATTAMY board.
 * Safe to call on every startup — skips silently if already seeded.
 */
export async function runSeed(): Promise<void> {
  // Skip if the admin user already exists
  const existing = await query(
    `SELECT id FROM users WHERE email = $1`,
    ['admin@floridahorizoneng.com'],
  );
  if (existing.rows.length > 0) return;

  await seed();
}

async function seed() {
  console.log('Seeding database...');

  try {
    // ================================================================ //
    //  1. Create default admin user                                     //
    // ================================================================ //

    const passwordHash = await bcrypt.hash('admin123', 12);
    const userResult = await query(
      `INSERT INTO users (email, password_hash, display_name, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name
       RETURNING id`,
      ['admin@floridahorizoneng.com', passwordHash, 'FHE Admin', 'admin']
    );
    const adminId = userResult.rows[0].id;
    console.log('Created admin user:', adminId);

    // ================================================================ //
    //  2. Create MATTAMY board                                          //
    // ================================================================ //

    const boardResult = await query(
      `INSERT INTO boards (title, description, background_color, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      ['MATTAMY', 'Mattamy Homes project tracking board', '#0079BF', adminId]
    );
    const boardId = boardResult.rows[0].id;
    console.log('Created MATTAMY board:', boardId);

    // Add admin as board member
    await query(
      'INSERT INTO board_members (board_id, user_id, role) VALUES ($1, $2, $3)',
      [boardId, adminId, 'admin']
    );

    // ================================================================ //
    //  3. Create all 16 lists (matching Trello board order)             //
    // ================================================================ //

    const listNames = [
      'Work To Do',
      "Cindy's To Do",
      'ARCH QC',
      'STRUCT QC',
      'KENDRA TO-DO',
      "Angela's To-Do",
      'Ryan Final Review',
      'FINAL REVIEW',
      'At Truss Company',
      'At Carlos/Will',
      'KHOV WAITING ON ARCHS',
      'Completed Lots',
      'Sent to SS',
      'PAUSED LOTS',
      'Misc completed',
      "Caroline To-Do",
    ];

    const listIds: string[] = [];
    for (let i = 0; i < listNames.length; i++) {
      const listResult = await query(
        'INSERT INTO lists (board_id, title, position) VALUES ($1, $2, $3) RETURNING id',
        [boardId, listNames[i], i]
      );
      listIds.push(listResult.rows[0].id);
      console.log(`  Created list [${i}]: ${listNames[i]}`);
    }

    // ================================================================ //
    //  4. Create all labels (matching Trello label colors & names)      //
    // ================================================================ //

    const labelDefs = [
      { name: 'WAITING ON ARCHS',        color: '#FF9F1A' },  // orange
      { name: 'TRUSSES RECEIVED',        color: '#F2D600' },  // yellow
      { name: 'CADENCE',                 color: '#51E898' },  // lime green
      { name: 'Need Master Updated',     color: '#FFFD85' },  // light yellow
      { name: 'At Truss Company',        color: '#61BD4F' },  // green
      { name: 'REVISION',                color: '#C377E0' },  // lavender
      { name: 'CORRECTION',              color: '#F5DD29' },  // gold
      { name: 'ARCH START',              color: '#EB5A46' },  // red-orange
      { name: 'TOWNHOME',                color: '#7B61FF' },  // purple
      { name: 'BDCs',                    color: '#0079BF' },  // blue
      { name: 'Solara ARCH set up only', color: '#00C2E0' },  // teal
      { name: "ENG REDLINE'S RCVD",      color: '#0C3E8C' },  // dark navy
      { name: 'Ryan Final Review',       color: '#CF513D' },  // red
      { name: 'KHOV',                    color: '#B04632' },  // brown
      { name: 'KOLTER',                  color: '#FF78CB' },  // pink
    ];

    const labelIds: Record<string, string> = {};
    for (const label of labelDefs) {
      const result = await query(
        'INSERT INTO labels (board_id, name, color) VALUES ($1, $2, $3) RETURNING id',
        [boardId, label.name, label.color]
      );
      labelIds[label.name] = result.rows[0].id;
      console.log(`  Created label: ${label.name} (${label.color})`);
    }

    // ================================================================ //
    //  5. Create a sample card with the MATTAMY LOT CHECKLIST           //
    // ================================================================ //

    // Create a sample card in the "Work To Do" list
    const sampleCardResult = await query(
      `INSERT INTO cards (list_id, title, description, position, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [
        listIds[0], // Work To Do
        'SAMPLE LOT - Delete After Review',
        'This is a sample card showing the standard MATTAMY LOT CHECKLIST template. Delete this card once the team has reviewed the checklist format.',
        0,
        adminId,
      ]
    );
    const sampleCardId = sampleCardResult.rows[0].id;
    console.log('Created sample card:', sampleCardId);

    // Create the MATTAMY LOT CHECKLIST on the sample card
    const checklistResult = await query(
      'INSERT INTO checklists (card_id, title, position) VALUES ($1, $2, $3) RETURNING id',
      [sampleCardId, 'MATTAMY LOT CHECKLIST', 0]
    );
    const checklistId = checklistResult.rows[0].id;

    const checklistItems = [
      'ARCHS READY FOR QC',
      'ARCH REDLINES SENT TO DRAFTER',
      'ARCH REDLINES APPLIED',
      'CAD FILES CREATED',
      'FILES SENT TO MATTAMY/VENDORS',
      'TRUSSES RCVD',
      'STRUCTS SET AND TRUSS REVIEW COMPLETED',
      'STRUCTS QC',
      'STRUCTS REDLINES APPLIED',
      'SENT FOR FINAL QC',
      'FINAL QC REDLINES APPLIED',
      'BACKCHECKED BY CINDY',
      'SENT TO SS',
    ];

    for (let i = 0; i < checklistItems.length; i++) {
      await query(
        'INSERT INTO checklist_items (checklist_id, content, is_checked, position) VALUES ($1, $2, $3, $4)',
        [checklistId, checklistItems[i], false, i]
      );
    }
    console.log(`  Created MATTAMY LOT CHECKLIST with ${checklistItems.length} items`);

    // ================================================================ //
    //  Done                                                             //
    // ================================================================ //

    console.log('\n========================================');
    console.log('  Seed completed successfully!');
    console.log('========================================');
    console.log('\nDefault admin credentials:');
    console.log('  Email: admin@floridahorizoneng.com');
    console.log('  Password: admin123');
    console.log('\n  ⚠  CHANGE THIS PASSWORD IMMEDIATELY IN PRODUCTION!\n');
    console.log('Board created: MATTAMY');
    console.log(`  Lists: ${listNames.length}`);
    console.log(`  Labels: ${labelDefs.length}`);
    console.log(`  Sample card with MATTAMY LOT CHECKLIST (${checklistItems.length} items)`);
  } catch (error) {
    console.error('Seed failed:', error);
    throw error;
  }
}

// ── Standalone script entry point ───────────────────────────────────────────
if (require.main === module) {
  runSeed()
    .then(() => {
      console.log('Seed completed.');
      pool.end();
    })
    .catch((error) => {
      console.error('Seed failed:', error);
      pool.end();
      process.exit(1);
    });
}
