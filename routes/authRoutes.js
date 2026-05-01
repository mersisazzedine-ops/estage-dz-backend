const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const { verifyToken } = require('../middleware/auth'); // Import the guard for the /me route

const router = express.Router();
const prisma = new PrismaClient();

// 1. REGISTER NEW USER
router.post('/register', async (req, res) => {
  try {
    const { role, email, password, firstName, lastName, companyName } = req.body;

    // Check if user exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Prepare data based on role
    const userData = { role, email, password: hashedPassword };

    if (role === 'student') {
      userData.firstName = firstName;
      userData.lastName = lastName;
    } else if (role === 'company') {
      userData.companyName = companyName;
      // Note: verificationStatus automatically defaults to "pending" in our Prisma schema!
    }

    await prisma.user.create({ data: userData });

    res.status(201).json({ success: true, message: 'User registered successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error during registration' });
  }
});

// 2. LOGIN USER
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(400).json({ message: 'Invalid credentials' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Invalid credentials' });

    // --- LOGIN BLOCKING RULES ---
    if (user.status === 'suspended') {
      return res.status(403).json({ success: false, message: 'Your account is suspended.' });
    }
    if (user.role === 'company') {
      if (user.verificationStatus === 'pending') {
        return res.status(403).json({ success: false, message: 'Your company account is pending admin approval.' });
      }
      if (user.verificationStatus === 'rejected') {
        return res.status(403).json({ success: false, message: 'Your company account was rejected.' });
      }
    }

    // Generate Token
    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET || 'supersecretkey',
      { expiresIn: '7d' }
    );

    // Remove the password before sending the user object to the frontend
    const { password: _, ...userWithoutPassword } = user;

    res.status(200).json({
      success: true,
      token,
      user: userWithoutPassword
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error during login' });
  }
});

// 3. GET CURRENT USER PROFILE (/api/auth/me)
router.get('/me', verifyToken, async (req, res) => {
  try {
    // req.user.id comes from the verifyToken middleware
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return res.status(404).json({ message: 'User not found' });

    const { password, ...userWithoutPassword } = user;
    res.status(200).json(userWithoutPassword);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error fetching profile' });
  }
});

module.exports = router;