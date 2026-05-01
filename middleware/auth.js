const jwt = require('jsonwebtoken');
require('dotenv').config();

// ─── Core Token Verifier ──────────────────────────────────────────────────────
const verifyToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
  }

  const token = authHeader.slice(7).trim();
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'supersecretkey');
    req.user = decoded; // { id, role }
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token.' });
  }
};

// ─── Role Guards ─────────────────────────────────────────────────────────────
const verifyStudent = (req, res, next) => {
  verifyToken(req, res, () => {
    if (req.user.role !== 'student') {
      return res.status(403).json({ success: false, message: 'Access denied. Students only.' });
    }
    next();
  });
};

const verifyCompany = (req, res, next) => {
  verifyToken(req, res, () => {
    if (req.user.role !== 'company') {
      return res.status(403).json({ success: false, message: 'Access denied. Companies only.' });
    }
    next();
  });
};

const verifyAdmin = (req, res, next) => {
  verifyToken(req, res, () => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied. Admins only.' });
    }
    next();
  });
};

module.exports = { verifyToken, verifyStudent, verifyCompany, verifyAdmin };