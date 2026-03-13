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
        let {
            name,
            dob,
            mobile_number,
            aadhaar,
            qualification,
            business_nature,
            business_address,
            residential_address
        } = req.body;

        const file = req.file;
        let photoBase64 = null;

        // Calculate age from DOB
        const birthDate = new Date(dob);
        const today = new Date();
        let calculatedAge = today.getFullYear() - birthDate.getFullYear();
        const m = today.getMonth() - birthDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
            calculatedAge--;
        }

        // Strip spaces from formatted numbers for backend validation and storage
        if (mobile_number) mobile_number = mobile_number.replace(/\s+/g, '');
        if (aadhaar) aadhaar = aadhaar.replace(/\s+/g, '');

        // Strict Backend Validation
        if (!name || name.trim().length < 2) return res.status(400).json({ error: 'Valid Name is required' });
        if (!dob || isNaN(Date.parse(dob))) return res.status(400).json({ error: 'Valid Date of Birth is required' });
        if (!mobile_number || !/^\d{10}$/.test(mobile_number)) return res.status(400).json({ error: 'Valid 10-digit Mobile Number is required' });
        if (!aadhaar || !/^\d{12}$/.test(aadhaar)) return res.status(400).json({ error: 'Valid 12-digit Aadhaar Number is required' });
        if (!qualification || qualification.trim().length < 2) return res.status(400).json({ error: 'Valid Qualification is required' });
        if (!business_nature || business_nature.trim().length < 2) return res.status(400).json({ error: 'Valid Business/Job Nature is required' });
        if (!residential_address || residential_address.trim().length < 5) return res.status(400).json({ error: 'Valid Residential Address is required' });

        // 1. Convert and heavily compress uploaded photo to Base64
        if (file) {
            const compressedBuffer = await sharp(file.buffer)
                .resize({ width: 300, height: 300, fit: 'cover' }) // Resize to smaller square for profile
                .webp({ quality: 60, effort: 6 }) // Aggressive but acceptable compression
                .toBuffer();

            const b64 = compressedBuffer.toString('base64');
            photoBase64 = `data:image/webp;base64,${b64}`;
        }

        // 2. Save data to Vercel PostgresDB
        if (process.env.POSTGRES_URL) {
            // Using the template literal approach for more reliable parameterization
            const result = await sql`
                INSERT INTO members (
                    name, age, dob, mobile_number, aadhaar, 
                    qualification, business_nature, business_address, 
                    residential_address, photo_base64
                )
                VALUES (
                    ${name.trim()}, ${calculatedAge}, ${dob}, ${mobile_number}, ${aadhaar}, 
                    ${qualification.trim()}, ${business_nature.trim()}, ${business_address ? business_address.trim() : null}, 
                    ${residential_address.trim()}, ${photoBase64}
                )
                RETURNING id;
            `;

            if (result && result.rows && result.rows[0]) {
                return res.status(201).json({
                    message: 'Registration successful',
                    memberId: result.rows[0].id
                });
            } else {
                throw new Error('Database insert failed - no ID returned');
            }
        } else {
            // Error if Postgres is not configured
            return res.status(500).json({ error: 'Database connection not configured' });
        }
    } catch (error) {
        console.error('Registration Error:', error);
        res.status(500).json({ error: 'Registration failed: ' + error.message });
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
