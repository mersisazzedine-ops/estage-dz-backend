const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { verifyAdmin } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// ─── Helper: safe user (no password) ─────────────────────────────────────────
const safeUser = (user) => {
  if (!user) return null;
  const { password, ...safe } = user;
  return safe;
};

const parseJSON = (str, fallback = []) => {
  if (!str) return fallback;
  if (Array.isArray(str)) return str;
  try { return JSON.parse(str); } catch { return fallback; }
};

const serializeJob = (job) => {
  if (!job) return null;
  return { ...job, tags: parseJSON(job.tags) };
};

// All admin routes require admin JWT
router.use(verifyAdmin);

// ─── GET /api/admin/stats ─────────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const [
      totalStudents,
      totalCompanies,
      activeJobs,
      totalApplications,
      openTickets,
      recentApplications,
      recentUsers,
    ] = await Promise.all([
      prisma.user.count({ where: { role: 'student' } }),
      prisma.user.count({ where: { role: 'company' } }),
      prisma.job.count({ where: { status: 'Active' } }),
      prisma.application.count(),
      prisma.ticket.count({ where: { status: 'open' } }),
      prisma.application.findMany({
        include: { student: true, job: true },
        orderBy: { dateApplied: 'desc' },
        take: 5,
      }),
      prisma.user.findMany({
        where: { role: { in: ['student', 'company'] } },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ]);

    res.status(200).json({
      success: true,
      data: {
        stats: { totalStudents, totalCompanies, activeJobs, totalApplications, openTickets },
        recentApplications: recentApplications.map((app) => ({
          ...app,
          student: safeUser(app.student),
          job: app.job ? serializeJob(app.job) : null,
        })),
        recentUsers: recentUsers.map(safeUser),
      },
    });
  } catch (error) {
    console.error('[GET /admin/stats]', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ─── GET /api/admin/users ─────────────────────────────────────────────────────
router.get('/users', async (req, res) => {
  try {
    const { role, status, search } = req.query;
    const where = {};
    if (role) where.role = role;
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { email: { contains: search } },
        { firstName: { contains: search } },
        { lastName: { contains: search } },
        { companyName: { contains: search } },
      ];
    }

    const users = await prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    res.status(200).json({ success: true, data: { users: users.map(safeUser) } });
  } catch (error) {
    console.error('[GET /admin/users]', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ─── PATCH /api/admin/users/:userId/suspend ───────────────────────────────────
router.patch('/users/:userId/suspend', async (req, res) => {
  try {
    const { userId } = req.params;
    const { status } = req.body; // "active" | "suspended"

    if (!['active', 'suspended'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Status must be "active" or "suspended".' });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    if (user.role === 'admin') {
      return res.status(403).json({ success: false, message: 'Cannot suspend an admin account.' });
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { status },
    });

    res.status(200).json({
      success: true,
      message: `User ${status === 'suspended' ? 'suspended' : 'reactivated'} successfully.`,
      data: { user: safeUser(updated) },
    });
  } catch (error) {
    console.error('[PATCH /admin/users/:userId/suspend]', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ─── DELETE /api/admin/users/:userId ─────────────────────────────────────────
router.delete('/users/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    if (user.role === 'admin') {
      return res.status(403).json({ success: false, message: 'Cannot delete an admin account.' });
    }

    await prisma.user.delete({ where: { id: userId } });
    res.status(200).json({ success: true, message: 'User deleted successfully.' });
  } catch (error) {
    console.error('[DELETE /admin/users/:userId]', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ─── GET /api/admin/jobs ──────────────────────────────────────────────────────
router.get('/jobs', async (req, res) => {
  try {
    const { status, search } = req.query;
    const where = {};
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { role: { contains: search } },
        { company: { contains: search } },
        { location: { contains: search } },
      ];
    }

    const jobs = await prisma.job.findMany({
      where,
      include: { companyRef: true },
      orderBy: { createdAt: 'desc' },
    });

    res.status(200).json({
      success: true,
      data: {
        jobs: jobs.map((job) => {
          const { companyRef, ...rest } = job;
          return {
            ...serializeJob(rest),
            companyRef: safeUser(companyRef),
          };
        }),
      },
    });
  } catch (error) {
    console.error('[GET /admin/jobs]', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ─── PATCH /api/admin/jobs/:jobId/block ───────────────────────────────────────
router.patch('/jobs/:jobId/block', async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job) return res.status(404).json({ success: false, message: 'Job not found.' });

    // Toggle: if Blocked → Active, otherwise → Blocked
    const newStatus = job.status === 'Blocked' ? 'Active' : 'Blocked';

    const updated = await prisma.job.update({
      where: { id: jobId },
      data: { status: newStatus },
    });

    res.status(200).json({
      success: true,
      message: `Job ${newStatus === 'Blocked' ? 'blocked' : 'unblocked'} successfully.`,
      data: { job: serializeJob(updated) },
    });
  } catch (error) {
    console.error('[PATCH /admin/jobs/:jobId/block]', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ─── DELETE /api/admin/jobs/:jobId ────────────────────────────────────────────
router.delete('/jobs/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job) return res.status(404).json({ success: false, message: 'Job not found.' });

    await prisma.job.delete({ where: { id: jobId } });
    res.status(200).json({ success: true, message: 'Job deleted successfully.' });
  } catch (error) {
    console.error('[DELETE /admin/jobs/:jobId]', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ─── GET /api/admin/companies/validation ─────────────────────────────────────
router.get('/companies/validation', async (req, res) => {
  try {
    const companies = await prisma.user.findMany({
      where: { role: 'company', verificationStatus: 'pending' },
      orderBy: { createdAt: 'desc' },
    });

    res.status(200).json({ success: true, data: { companies: companies.map(safeUser) } });
  } catch (error) {
    console.error('[GET /admin/companies/validation]', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ─── PATCH /api/admin/companies/:companyId/verify ─────────────────────────────
router.patch('/companies/:companyId/verify', async (req, res) => {
  try {
    const { companyId } = req.params;
    const { verificationStatus } = req.body; // "approved" | "rejected"

    if (!['approved', 'rejected'].includes(verificationStatus)) {
      return res.status(400).json({ success: false, message: 'verificationStatus must be "approved" or "rejected".' });
    }

    const company = await prisma.user.findUnique({ where: { id: companyId } });
    if (!company) return res.status(404).json({ success: false, message: 'Company not found.' });
    if (company.role !== 'company') {
      return res.status(400).json({ success: false, message: 'User is not a company.' });
    }

    const updated = await prisma.user.update({
      where: { id: companyId },
      data: { verificationStatus },
    });

    res.status(200).json({
      success: true,
      message: `Company ${verificationStatus} successfully.`,
      data: { company: safeUser(updated) },
    });
  } catch (error) {
    console.error('[PATCH /admin/companies/:companyId/verify]', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ─── GET /api/admin/tickets ───────────────────────────────────────────────────
router.get('/tickets', async (req, res) => {
  try {
    const { status, type } = req.query;
    const where = {};
    if (status) where.status = status;
    if (type) where.type = type;

    const tickets = await prisma.ticket.findMany({
      where,
      include: { reporter: true, reportedParty: true },
      orderBy: { dateOpened: 'desc' },
    });

    const result = tickets.map((ticket) => ({
      ...ticket,
      reporter: safeUser(ticket.reporter),
      reportedParty: ticket.reportedParty ? safeUser(ticket.reportedParty) : null,
    }));

    res.status(200).json({ success: true, data: { tickets: result } });
  } catch (error) {
    console.error('[GET /admin/tickets]', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ─── PATCH /api/admin/tickets/:ticketId/resolve ───────────────────────────────
router.patch('/tickets/:ticketId/resolve', async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { status } = req.body; // "resolved" | "closed"

    const validStatuses = ['resolved', 'closed'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Status must be "resolved" or "closed".' });
    }

    const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found.' });

    const updated = await prisma.ticket.update({
      where: { id: ticketId },
      data: {
        status,
        resolvedAt: new Date(),
      },
      include: { reporter: true, reportedParty: true },
    });

    res.status(200).json({
      success: true,
      message: 'Ticket updated successfully.',
      data: {
        ticket: {
          ...updated,
          reporter: safeUser(updated.reporter),
          reportedParty: updated.reportedParty ? safeUser(updated.reportedParty) : null,
        },
      },
    });
  } catch (error) {
    console.error('[PATCH /admin/tickets/:ticketId/resolve]', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

module.exports = router;