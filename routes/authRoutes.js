const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const protect = require('../middleware/authMiddleware'); // 👈 Import the Bouncer

// Public Routes (Anyone can access)
router.post('/register', authController.register);
router.post('/login', authController.login);

//  Protected Route (The Bouncer stands in front of this one)
// Notice how we put 'protect' in the middle!
router.get('/profile', protect, (req, res) => {
    // If the code reaches here, the Bouncer let them in!
    // req.user contains the ID and Role from the token
    res.status(200).json({ 
        message: "Welcome to the VIP room!", 
        userData: req.user 
    });
});

module.exports = router;