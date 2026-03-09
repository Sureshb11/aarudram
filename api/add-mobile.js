const { sql } = require('@vercel/postgres');
require('dotenv').config();

async function addMobileColumn() {
    try {
        console.log('Connecting to Vercel Postgres...');

        // Add a new column to store the mobile number
        const result = await sql`
            ALTER TABLE members 
            ADD COLUMN IF NOT EXISTS mobile_number VARCHAR(15);
        `;

        console.log('Database schema updated successfully.');
        console.log(result);

    } catch (error) {
        console.error('Failed to update database schema:', error.message);
    }
}

addMobileColumn();
