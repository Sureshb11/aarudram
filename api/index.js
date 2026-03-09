const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { put } = require('@vercel/blob');
const { sql } = require('@vercel/postgres');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Set up multer for handling file uploads (stored in memory temporarily)
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// API Endpoint to handle registration
app.post('/api/register', upload.single('photo'), async (req, res) => {
    try {
        const {
            name,
            age,
            aadhaar,
            qualification,
            business_nature,
            business_address,
            residential_address
        } = req.body;

        const file = req.file;
        let photoUrl = null;

        if (!name || !age || !aadhaar || !qualification || !business_nature || !residential_address) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // 1. Upload photo to Vercel Blob if available
        if (file && process.env.BLOB_READ_WRITE_TOKEN) {
             const blob = await put(file.originalname, file.buffer, {
                access: 'public',
                token: process.env.BLOB_READ_WRITE_TOKEN
            });
            photoUrl = blob.url;
        }

        // 2. Save data to Vercel PostgresDB
        if (process.env.POSTGRES_URL) {
            const query = `
                INSERT INTO members (name, age, aadhaar, qualification, business_nature, business_address, residential_address, photo_url)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                RETURNING id;
            `;
            const values = [name, parseInt(age), aadhaar, qualification, business_nature, business_address, residential_address, photoUrl];
            
            // Note: @vercel/postgres uses parameterization differently depending on if you use `sql` string tag or `sql.query`
            const result = await sql.query(query, values);

            res.status(201).json({
                message: 'Registration successful',
                memberId: result.rows[0].id,
                photoUrl: photoUrl
            });
        } else {
             // Fallback for local development if Postgres is not set up
             console.log("Mock Registration Data received:", { name, age, photoUrl });
             res.status(201).json({
                message: 'Registration successful (Mock DB)',
                photoUrl: photoUrl
            });
        }
    } catch (error) {
        console.error('Registration Error:', error);
        res.status(500).json({ error: 'Internal server error during registration' });
    }
});

// Route for testing server status
app.get('/api/status', (req, res) => {
    res.json({ status: 'Server is running', postgres: !!process.env.POSTGRES_URL, blob: !!process.env.BLOB_READ_WRITE_TOKEN });
});

module.exports = app;

// Only start listening if run directly (not on Vercel)
if (require.main === module) {
  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });
}
