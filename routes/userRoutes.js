const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { verifyToken } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const router = express.Router();
const prisma = new PrismaClient();

// --- MULTER SETUP FOR FILE UPLOADS ---
// Ensure the uploads directory exists
if (!fs.existsSync('./uploads')) {
    fs.mkdirSync('./uploads');
}

// Configure how files are saved
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, './uploads/'),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

// Avatar upload rules (Images only, max 5MB)
const uploadAvatar = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Images only.'));
        }
    }
});

// Resume upload rules (PDF only, max 5MB)
const uploadResume = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Only PDF files are accepted.'));
        }
    }
});


// Helper to remove the password from the user object before sending it
const excludePassword = (user) => {
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
};

// --- 1. GET PROFILE ---
router.get('/me', verifyToken, async (req, res) => {
    try {
        const user = await prisma.user.findUnique({ where: { id: req.user.id } });
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });
        
        res.status(200).json({ success: true, data: excludePassword(user) });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error fetching profile' });
    }
});

// --- 2. UPDATE PROFILE ---
router.put('/me', verifyToken, async (req, res) => {
    try {
        // req.body contains the fields they want to update (from the frontend form)
        // Prisma will smartly only update the fields we provide!
        
        // SQLite workaround: If skills is an array, we must stringify it
        const updateData = { ...req.body };
        if (updateData.skills && Array.isArray(updateData.skills)) {
            updateData.skills = JSON.stringify(updateData.skills);
        }

        const updatedUser = await prisma.user.update({
            where: { id: req.user.id },
            data: updateData
        });

        // Convert skills back to an array for the frontend if it exists
        const safeUser = excludePassword(updatedUser);
        if (safeUser.skills && typeof safeUser.skills === 'string') {
            safeUser.skills = JSON.parse(safeUser.skills);
        }

        res.status(200).json({ success: true, data: safeUser });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error updating profile' });
    }
});

// --- 3. UPLOAD AVATAR ---
router.post('/me/avatar', verifyToken, (req, res) => {
    uploadAvatar.single('avatar')(req, res, async (err) => {
        if (err) {
            if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ success: false, message: 'File too large (max 5MB)' });
            return res.status(400).json({ success: false, message: err.message });
        }
        
        if (!req.file) return res.status(400).json({ success: false, message: 'No image provided' });

        try {
            // Generate the URL that the frontend can use to display the image
            const avatarUrl = `http://localhost:5000/uploads/${req.file.filename}`;
            
            await prisma.user.update({
                where: { id: req.user.id },
                data: { avatar: avatarUrl }
            });

            res.status(200).json({ success: true, data: { avatarUrl } });
        } catch (error) {
            res.status(500).json({ success: false, message: 'Database error saving avatar' });
        }
    });
});

// --- 4. UPLOAD RESUME ---
router.post('/me/resume', verifyToken, (req, res) => {
    // Only students can upload resumes!
    if (req.user.role !== 'student') {
        return res.status(403).json({ success: false, message: 'Only students can upload a resume.' });
    }

    uploadResume.single('resume')(req, res, async (err) => {
        if (err) {
            if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ success: false, message: 'File too large (max 5MB)' });
            return res.status(400).json({ success: false, message: err.message });
        }

        if (!req.file) return res.status(400).json({ success: false, message: 'No PDF provided' });

        try {
            const resumeUrl = `http://localhost:5000/uploads/${req.file.filename}`;
            const resumeName = req.file.originalname;
            
            await prisma.user.update({
                where: { id: req.user.id },
                data: { resumeUrl, resumeName }
            });

            res.status(200).json({ success: true, data: { resumeUrl, resumeName } });
        } catch (error) {
            res.status(500).json({ success: false, message: 'Database error saving resume' });
        }
    });
});

module.exports = router;