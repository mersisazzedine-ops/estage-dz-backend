const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// --- 1. MIDDLEWARE ---
app.use(cors()); // Allows the React frontend to communicate with the server
app.use(express.json()); // Allows the server to read incoming JSON data
app.use(express.urlencoded({ extended: true })); // For parsing form data

// Allows the frontend to view uploaded files (avatars, resumes)
app.use('/uploads', express.static('uploads')); 

// --- 2. IMPORT ROUTES ---
const authRoutes = require('./routes/authRoutes');
const internshipRoutes = require('./routes/internshipRoutes'); // Mapped to /api/jobs
const applicationRoutes = require('./routes/applicationRoutes');
const userRoutes = require('./routes/userRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes'); // New!
const adminRoutes = require('./routes/adminRoutes');         // Uncommented!
const ticketRoutes = require('./routes/ticketRoutes');       // Uncommented!

// --- 3. USE ROUTES ---
app.use('/api/auth', authRoutes);
app.use('/api/jobs', internshipRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/users', userRoutes);
app.use('/api/dashboard', dashboardRoutes); // New!
app.use('/api/admin', adminRoutes);         // Uncommented!
app.use('/api/tickets', ticketRoutes);      // Uncommented!

// Trick to map the standalone /api/contact directly into our ticket routes contact logic
app.use('/api/contact', (req, res, next) => {
    req.url = '/contact'; 
    ticketRoutes(req, res, next);
});

// --- 4. DEBUG & TEST ROUTES ---
// Temporary route to approve all companies for testing
app.get('/approve-all', async (req, res) => {
    try {
        await prisma.user.updateMany({
            where: { role: 'company' },
            data: { verificationStatus: 'approved' }
        });
        res.send("<h1>✅ ALL COMPANIES APPROVED! You can now log in.</h1>");
    } catch (error) {
        res.status(500).send("Error: " + error.message);
    }
});

// Temporary route to view all users in the DB
app.get('/debug-users', async (req, res) => {
    try {
        const users = await prisma.user.findMany();
        res.json({ total: users.length, users: users });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Simple API health check
app.get('/api/test', (req, res) => {
    res.json({ message: 'Welcome to the E-Stage DZ Backend!' });
});

// --- 5. START SERVER ---
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
    console.log(`🌐 API available at http://localhost:${PORT}/api/test`);
});