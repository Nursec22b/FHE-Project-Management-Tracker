import bcrypt from 'bcryptjs';
import { pool, query } from './pool';

async function seed() {
  console.log('Seeding database...');

  try {
    // Create default admin user
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

    // Create a sample board
    const boardResult = await query(
      `INSERT INTO boards (title, description, background_color, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      ['General Engineering', 'Main project tracking board', '#0079BF', adminId]
    );
    const boardId = boardResult.rows[0].id;

    // Add admin as board member
    await query(
      'INSERT INTO board_members (board_id, user_id, role) VALUES ($1, $2, $3)',
      [boardId, adminId, 'admin']
    );

    // Create default lists
    const listNames = ['To Do', 'In Progress', 'Review', 'Done'];
    const listIds: string[] = [];
    for (let i = 0; i < listNames.length; i++) {
      const listResult = await query(
        'INSERT INTO lists (board_id, title, position) VALUES ($1, $2, $3) RETURNING id',
        [boardId, listNames[i], i]
      );
      listIds.push(listResult.rows[0].id);
    }

    // Create default labels
    const labelDefs = [
      { name: 'Urgent', color: '#EB5A46' },
      { name: 'Client Request', color: '#F2D600' },
      { name: 'Internal', color: '#61BD4F' },
      { name: 'Design', color: '#C377E0' },
      { name: 'Engineering', color: '#0079BF' },
      { name: 'Permits', color: '#FF9F1A' },
    ];
    for (const label of labelDefs) {
      await query(
        'INSERT INTO labels (board_id, name, color) VALUES ($1, $2, $3)',
        [boardId, label.name, label.color]
      );
    }

    // Create a few sample cards
    const sampleCards = [
      { list: 0, title: 'Review structural plans for Building A', desc: 'Complete review of the structural engineering plans submitted by the contractor.' },
      { list: 0, title: 'Submit permit application - Project Delta', desc: 'Prepare and submit building permit application to the county.' },
      { list: 1, title: 'Site inspection - 123 Main St', desc: 'Conduct on-site inspection for foundation work.' },
      { list: 2, title: 'Client proposal - Smith Residence', desc: 'Finalize and send engineering proposal to the Smith family.' },
      { list: 3, title: 'Completed: Phase 1 drainage design', desc: 'Drainage system design approved by county.' },
    ];

    for (let i = 0; i < sampleCards.length; i++) {
      const card = sampleCards[i];
      await query(
        `INSERT INTO cards (list_id, title, description, position, created_by)
         VALUES ($1, $2, $3, $4, $5)`,
        [listIds[card.list], card.title, card.desc, i, adminId]
      );
    }

    console.log('Seed completed successfully.');
    console.log('\nDefault admin credentials:');
    console.log('  Email: admin@floridahorizoneng.com');
    console.log('  Password: admin123');
    console.log('\n  ⚠ Change this password immediately in production!');
  } catch (error) {
    console.error('Seed failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seed();
