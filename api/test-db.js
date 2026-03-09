const { sql } = require('@vercel/postgres');
require('dotenv').config();

async function checkDatabase() {
    try {
        console.log('Querying Neon database for all members...');
        const result = await sql`SELECT * FROM members ORDER BY id DESC LIMIT 5;`;
        console.log(`Found ${result.rows.length} recent registrations.`);
        console.log(JSON.stringify(result.rows, null, 2));
    } catch (error) {
        console.error('Error querying database:', error);
    }
}

checkDatabase();
