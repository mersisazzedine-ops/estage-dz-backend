const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { verifyToken, verifyStudent, verifyCompany } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// ─── Helper: safe student (no password) ──────────────────────────────────────
const safeUser = (user) => {
  if (!user) return null;
  const { password, ...safe } = user;
  return safe;
};

// ─── Helper: parse JSON string safely ────────────────────────────────────────
const parseJSON = (str, fallback = []) => {
  if (!str) return fallback;
  if (Array.isArray(str)) return str;
  try { return JSON.parse(str); } catch { return fallback; }
};

const serializeJob = (job) => {
  if (!job) return null;
  return { ...job, tags: parseJSON(job.tags) };
};

// ─── GET /api/applications/mine  (Student – list own applications) ────────────
router.get('/mine', verifyStudent, async (req, res) => {
  try {
    const applications = await prisma.application.findMany({
      where: { studentId: req.user.id },
      include: { job: true },
      orderBy: { dateApplied: 'desc' },
    });

    const result = applications.map((app) => ({
      ...app,
      job: app.job ? serializeJob(app.job) : null,
    }));

    res.status(200).json({ success: true, data: { applications: result } });
  } catch (error) {
    console.error('[GET /applications/mine]', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ─── GET /api/applications/company  (Company – all applicants for their jobs) ──
router.get('/company', verifyCompany, async (req, res) => {
  try {
    const applications = await prisma.application.findMany({
      where: {
        job: { companyId: req.user.id },
      },
      include: {
        job: true,
        student: true,
      },
      orderBy: { dateApplied: 'desc' },
    });

    const result = applications.map((app) => ({
      ...app,
      student: safeUser(app.student),
      job: app.job ? serializeJob(app.job) : null,
    }));

    res.status(200).json({ success: true, data: { applications: result } });
  } catch (error) {
    console.error('[GET /applications/company]', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ─── POST /api/applications/apply/:jobId  (Student – apply to a job) ──────────
router.post('/apply/:jobId', verifyStudent, async (req, res) => {
  try {
    const { jobId } = req.params;

    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job) return res.status(404).json({ success: false, message: 'Job not found.' });
    if (job.status !== 'Active') {
      return res.status(400).json({ success: false, message: 'This job is not accepting applications.' });
    }

    // Check for duplicate application
    const existing = await prisma.application.findUnique({
      where: { studentId_jobId: { studentId: req.user.id, jobId } },
    });
    if (existing) {
      return res.status(409).json({ success: false, message: 'You have already applied to this job.' });
    }

    const application = await prisma.application.create({
      data: {
        studentId: req.user.id,
        jobId,
        status: 'Pending',
        matchScore: req.body.matchScore || null,
      },
      include: { job: true },
    });

    res.status(201).json({
      success: true,
      data: {
        application: {
          ...application,
          job: application.job ? serializeJob(application.job) : null,
        },
      },
    });
  } catch (error) {
    console.error('[POST /applications/apply/:jobId]', error);
    if (error.code === 'P2002') {
      return res.status(409).json({ success: false, message: 'You have already applied to this job.' });
    }
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ─── DELETE /api/applications/cancel/:jobId  (Student – withdraw application) ──
router.delete('/cancel/:jobId', verifyStudent, async (req, res) => {
  try {
    const { jobId } = req.params;

    const application = await prisma.application.findUnique({
      where: { studentId_jobId: { studentId: req.user.id, jobId } },
    });
    if (!application) {
      return res.status(404).json({ success: false, message: 'Application not found.' });
    }

    await prisma.application.delete({
      where: { studentId_jobId: { studentId: req.user.id, jobId } },
    });

    res.status(200).json({ success: true, message: 'Application withdrawn successfully.' });
  } catch (error) {
    console.error('[DELETE /applications/cancel/:jobId]', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ─── PATCH /api/applications/:applicationId/status  (Company – update status) ──
router.patch('/:applicationId/status', verifyCompany, async (req, res) => {
  try {
    const { applicationId } = req.params;
    const { status } = req.body;

    const validStatuses = ['Pending', 'Under Review', 'Interview', 'Accepted', 'Rejected'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Status must be one of: ${validStatuses.join(', ')}.`,
      });
    }

    const application = await prisma.application.findUnique({
      where: { id: applicationId },
      include: { job: true },
    });
    if (!application) {
      return res.status(404).json({ success: false, message: 'Application not found.' });
    }
    if (application.job.companyId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    const updated = await prisma.application.update({
      where: { id: applicationId },
      data: { status },
      include: { job: true, student: true },
    });

    res.status(200).json({
      success: true,
      data: {
        application: {
          ...updated,
          student: safeUser(updated.student),
          job: updated.job ? serializeJob(updated.job) : null,
        },
      },
    });
  } catch (error) {
    console.error('[PATCH /applications/:applicationId/status]', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

module.exports = router;