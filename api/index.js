const express = require('express');
const cors = require('cors');
const multer = require('multer');
const sharp = require('sharp');
const { put } = require('@vercel/blob');
const { sql } = require('@vercel/postgres');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Set up multer for handling file uploads (stored in memory temporarily)
const storage = multer.memoryStorage();
// Limit initial upload to 5MB to prevent memory bloat
const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }
});

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
        let photoBase64 = null;

        if (!name || !age || !aadhaar || !qualification || !business_nature || !residential_address) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // 1. Convert and heavily compress uploaded photo to Base64 (to store directly in database easily)
        if (file) {
            const compressedBuffer = await sharp(file.buffer)
                .resize({ width: 400, height: 400, fit: 'inside' }) // Max 400x400
                .webp({ quality: 80 }) // Convert to high-efficiency webp
                .toBuffer();

            const b64 = compressedBuffer.toString('base64');
            photoBase64 = `data:image/webp;base64,${b64}`;
        }

        // 2. Save data to Vercel PostgresDB
        if (process.env.POSTGRES_URL) {
            const query = `
                INSERT INTO members (name, age, aadhaar, qualification, business_nature, business_address, residential_address, photo_base64)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                RETURNING id;
            `;
            const values = [name, parseInt(age), aadhaar, qualification, business_nature, business_address, residential_address, photoBase64];

            // Note: @vercel/postgres uses parameterization differently depending on if you use `sql` string tag or `sql.query`
            const result = await sql.query(query, values);

            res.status(201).json({
                message: 'Registration successful',
                memberId: result.rows[0].id
            });
        } else {
            // Fallback for local development if Postgres is not set up
            console.log("Mock Registration Data received:", { name, age, photoBase64: photoBase64 ? 'present' : 'null' });
            res.status(201).json({
                message: 'Registration successful (Mock DB)',
                photoUrl: photoBase64
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
