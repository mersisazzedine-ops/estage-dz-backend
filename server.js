const express = require('express');
const cors = require('cors');
require('dotenv').config();
const db = require('./config/db'); // Imports the database connection

const app = express();

// Basic Middleware
app.use(cors()); // Allows the React frontend to communicate with the server
app.use(express.json()); // Allows the server to read incoming JSON data
// 1. IMPORT YOUR ROUTES HERE
const authRoutes = require('./routes/authRoutes');
const internshipRoutes = require('./routes/internshipRoutes');
const applicationRoutes = require('./routes/applicationRoutes');
// 2. USE YOUR ROUTES HERE
app.use('/api/auth', authRoutes);
app.use('/api/internships', internshipRoutes);
app.use('/api/applications', applicationRoutes);
app.get('/api/test', (req, res) => {
    res.json({ message: 'Welcome to the E-Stage DZ Backend!' });
});

// 3. APP.LISTEN MUST BE AT THE VERY BOTTOM
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
});