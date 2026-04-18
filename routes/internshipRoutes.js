const express = require('express');
const router = express.Router();
const internshipController = require('../controllers/internshipController');
const protect = require('../middleware/authMiddleware'); // Bring in the Bouncer!

// POST: Create a new internship (Protected by the Bouncer)
router.post('/', protect, internshipController.createInternship);

// GET: View all internships (Public, anyone can see them)
router.get('/', internshipController.getAllInternships);

module.exports = router;