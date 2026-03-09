const { sql } = require('@vercel/postgres');
require('dotenv').config();

async function addDobColumn() {
    try {
        console.log('Connecting to Vercel Postgres...');

        // Add a new column to store the date of birth
        const result = await sql`
            ALTER TABLE members 
            ADD COLUMN IF NOT EXISTS dob DATE;
        `;

        console.log('Database schema updated successfully. Added dob column.');
        console.log(result);

    } catch (error) {
        console.error('Failed to update database schema:', error.message);
    }
}

addDobColumn();
