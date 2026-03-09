const { sql } = require('@vercel/postgres');
require('dotenv').config();

async function addPhotoColumn() {
    try {
        console.log('Connecting to Vercel Postgres...');

        // Add a new column to store the base64 string
        const result = await sql`
            ALTER TABLE members 
            ADD COLUMN photo_base64 TEXT;
        `;

        console.log('Database schema updated successfully.');
        console.log(result);

    } catch (error) {
        // If it already exists, output the error but don't crash
        console.error('Failed to update database schema (it might already exist):', error.message);
    }
}

addPhotoColumn();
