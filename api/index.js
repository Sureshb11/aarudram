const express = require('express');
const cors = require('cors');
const multer = require('multer');
const sharp = require('sharp');
const { put } = require('@vercel/blob');
const { sql } = require('@vercel/postgres');
require('dotenv').config();

// Auto-sanitize database environment variables (removes 'psql "' prefix, quotes, and trailing comments)
const sanitizeDbUrl = (url) => {
    if (!url || typeof url !== 'string') return url;
    let cleaned = url.trim();
    // Remove common copy-paste artifacts
    if (cleaned.startsWith('psql "')) cleaned = cleaned.substring(6);
    if (cleaned.endsWith('"')) cleaned = cleaned.substring(0, cleaned.length - 1);
    // Remove anything after a space (like "this is database" comments)
    cleaned = cleaned.split(/\s+/)[0];
    return cleaned;
};

if (process.env.POSTGRES_URL) process.env.POSTGRES_URL = sanitizeDbUrl(process.env.POSTGRES_URL);
if (process.env.DATABASE_URL) process.env.DATABASE_URL = sanitizeDbUrl(process.env.DATABASE_URL);
if (process.env.POSTGRES_PRISMA_URL) process.env.POSTGRES_PRISMA_URL = sanitizeDbUrl(process.env.POSTGRES_PRISMA_URL);

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('.')); // Serve static files from the root (index.html, styles.css, etc.)

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
        const dbUrl = process.env.POSTGRES_URL || 
                      process.env.DATABASE_URL || 
                      process.env.POSTGRES_PRISMA_URL || 
                      process.env.POSTGRES_URL_NON_POOLING ||
                      process.env.DATABASE_URL_UNPOOLED;
        
        if (dbUrl) {
            console.log('Attempting database insert with detected connection string...');
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
                const memberId = result.rows[0].id;
                console.log(`Registration successful for member ID: ${memberId}`);
                return res.status(201).json({
                    message: 'Registration successful',
                    memberId: memberId
                });
            } else {
                console.error('Database insert failed: No result rows returned');
                throw new Error('Database insert failed - no ID returned');
            }
        } else {
            // Error if no database environment variable is found
            console.error('Database configuration error: No valid connection string found in environment variables');
            return res.status(500).json({ 
                error: 'Database connection not configured', 
                debugInfo: 'Available variables: ' + Object.keys(process.env).filter(k => k.includes('POSTGRES') || k.includes('DATABASE')).join(', '),
                message: 'Please ensure environment variables are set in Vercel dashboard and the project is redeployed.'
            });
        }
    } catch (error) {
        console.error('Registration Error Details:', {
            message: error.message,
            stack: error.stack,
            body: req.body ? { ...req.body, photo: 'REDACTED' } : 'null',
            file: req.file ? { size: req.file.size, mimetype: req.file.mimetype } : 'null'
        });
        
        res.status(500).json({ 
            error: 'Registration failed', 
            message: error.message,
            diagnostic: process.env.NODE_ENV === 'development' ? error.stack : 'Check server logs for details',
            errorCode: error.code || 'UNKNOWN_ERROR'
        });
    }
});

// Route for testing server status
app.get('/api/status', (req, res) => {
    const envVars = Object.keys(process.env);
    res.json({ 
        status: 'Server is running', 
        detectedVariables: envVars.filter(k => k.includes('POSTGRES') || k.includes('DATABASE')),
        hasPostgresUrl: !!process.env.POSTGRES_URL, 
        hasDatabaseUrl: !!process.env.DATABASE_URL,
        hasPrismaUrl: !!process.env.POSTGRES_PRISMA_URL,
        blob: !!process.env.BLOB_READ_WRITE_TOKEN 
    });
});

module.exports = app;

// Only start listening if run directly (not on Vercel)
if (require.main === module) {
    app.listen(port, () => {
        console.log(`Server listening on port ${port}`);
    });
}
