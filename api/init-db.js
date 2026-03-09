const { sql } = require('@vercel/postgres');
require('dotenv').config();

async function initializeDatabase() {
    try {
        console.log('Connecting to Vercel Postgres...');

        // This will create the 'members' table if it doesn't already exist
        const result = await sql`
            CREATE TABLE IF NOT EXISTS members (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                age INTEGER NOT NULL,
                aadhaar VARCHAR(12) NOT NULL,
                qualification VARCHAR(255) NOT NULL,
                business_nature VARCHAR(255) NOT NULL,
                business_address TEXT,
                residential_address TEXT NOT NULL,
                photo_url VARCHAR(500),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `;

        console.log('Database initialized successfully.');
        console.log(result);

    } catch (error) {
        console.error('Failed to initialize database:', error);
    }
}

// Ensure the environment variable is present before running
if (!process.env.POSTGRES_URL) {
    console.warn("POSTGRES_URL is not set in the environment. Create a .env file and add it, or connect your Vercel project.");
} else {
    initializeDatabase();
}
