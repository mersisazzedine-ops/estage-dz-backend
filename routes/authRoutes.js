const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// ─── Helper: strip password from user object ──────────────────────────────────
const safeUser = (user) => {
  const { password, ...safe } = user;
  return safe;
};

// ─── POST /api/auth/register ──────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { role, email, password, firstName, lastName, companyName } = req.body;

    if (!role || !email || !password) {
      return res.status(400).json({ success: false, message: 'Role, email, and password are required.' });
    }
    if (!['student', 'company'].includes(role)) {
      return res.status(400).json({ success: false, message: 'Role must be "student" or "company".' });
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(409).json({ success: false, message: 'An account with this email already exists.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Dicebear avatar
    const seed = encodeURIComponent(email);
    const avatar = `https://api.dicebear.com/8.x/initials/svg?seed=${seed}`;

    const userData = {
      role,
      email,
      password: hashedPassword,
      avatar,
      status: 'active',
    };

    if (role === 'student') {
      userData.firstName = firstName || '';
      userData.lastName = lastName || '';
    } else if (role === 'company') {
      userData.companyName = companyName || '';
      userData.verificationStatus = 'pending';
    }

    const newUser = await prisma.user.create({ data: userData });

    res.status(201).json({
      success: true,
      message: 'Account created successfully.',
      data: { user: safeUser(newUser) },
    });
  } catch (error) {
    console.error('[POST /auth/register]', error);
    res.status(500).json({ success: false, message: 'Server error during registration.' });
  }
});

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    // ── GATE 1: Suspended accounts ────────────────────────────────────────────
    if (user.status === 'suspended') {
      return res.status(403).json({ success: false, message: 'Your account has been suspended.' });
    }

    // ── GATE 2: Company verification ──────────────────────────────────────────
    if (user.role === 'company') {
      if (user.verificationStatus === 'pending') {
        return res.status(403).json({ success: false, message: 'Your company account is pending admin approval.' });
      }
      if (user.verificationStatus === 'rejected') {
        return res.status(403).json({ success: false, message: 'Your company account has been rejected.' });
      }
    }

    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET || 'supersecretkey',
      { expiresIn: '7d' }
    );

    res.status(200).json({
      success: true,
      data: { token, user: safeUser(user) },
    });
  } catch (error) {
    console.error('[POST /auth/login]', error);
    res.status(500).json({ success: false, message: 'Server error during login.' });
  }
});

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────
router.get('/me', verifyToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    res.status(200).json({ success: true, data: { user: safeUser(user) } });
  } catch (error) {
    console.error('[GET /auth/me]', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ─── POST /api/auth/logout ────────────────────────────────────────────────────
router.post('/logout', verifyToken, (req, res) => {
  // JWT is stateless — client discards token. Server-side: no-op.
  res.status(200).json({ success: true, message: 'Logged out successfully.' });
});

// ─── POST /api/auth/forgot-password ──────────────────────────────────────────
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required.' });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    // Always return success to prevent email enumeration
    if (!user) {
      return res.status(200).json({ success: true, message: 'If that email exists, a reset link has been sent.' });
    }

    // In a real scenario: generate a reset token, store it, send via email
    // For now, we acknowledge the request
    res.status(200).json({ success: true, message: 'If that email exists, a reset link has been sent.' });
  } catch (error) {
    console.error('[POST /auth/forgot-password]', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ─── POST /api/auth/reset-password ───────────────────────────────────────────
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      return res.status(400).json({ success: false, message: 'Token and new password are required.' });
    }

    // In production: verify the reset token from DB, find user, update password
    // Placeholder implementation:
    res.status(200).json({ success: true, message: 'Password reset successfully. Please log in.' });
  } catch (error) {
    console.error('[POST /auth/reset-password]', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

module.exports = router;