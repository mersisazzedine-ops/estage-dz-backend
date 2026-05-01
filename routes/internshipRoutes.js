const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { verifyToken, verifyCompany } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// ─── Helper: parse JSON string safely ────────────────────────────────────────
const parseJSON = (str, fallback = []) => {
  if (!str) return fallback;
  if (Array.isArray(str)) return str;
  try { return JSON.parse(str); } catch { return fallback; }
};

// ─── Helper: auto-generate tags from requirements ─────────────────────────────
const extractTags = (requirements) => {
  if (!requirements) return [];
  // Split by comma, newline, semicolon, or bullet "-"
  return requirements
    .split(/[,\n;•\-]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && t.length < 50)
    .slice(0, 10); // max 10 tags
};

// ─── Helper: serialize job (parse JSON fields) ─────────────────────────────────
const serializeJob = (job) => ({
  ...job,
  tags: parseJSON(job.tags),
});

// ─── GET /api/jobs  (Public – list Active jobs, with hasApplied for students) ──
router.get('/', verifyToken, async (req, res) => {
  try {
    const { search, type, location, industry } = req.query;

    const where = { status: 'Active' };

    if (search) {
      where.OR = [
        { role: { contains: search } },
        { company: { contains: search } },
        { location: { contains: search } },
      ];
    }
    if (type) where.type = type;
    if (location) where.location = { contains: location };

    const jobs = await prisma.job.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    let appliedJobIds = new Set();
    if (req.user.role === 'student') {
      const applications = await prisma.application.findMany({
        where: { studentId: req.user.id },
        select: { jobId: true },
      });
      appliedJobIds = new Set(applications.map((a) => a.jobId));
    }

    const result = jobs.map((job) => ({
      ...serializeJob(job),
      hasApplied: appliedJobIds.has(job.id),
    }));

    res.status(200).json({ success: true, data: { jobs: result } });
  } catch (error) {
    console.error('[GET /jobs]', error);
    res.status(500).json({ success: false, message: 'Server error fetching jobs.' });
  }
});

// ─── GET /api/jobs/company  (Company – list their own jobs) ───────────────────
router.get('/company', verifyCompany, async (req, res) => {
  try {
    const jobs = await prisma.job.findMany({
      where: { companyId: req.user.id },
      orderBy: { createdAt: 'desc' },
    });

    res.status(200).json({ success: true, data: { jobs: jobs.map(serializeJob) } });
  } catch (error) {
    console.error('[GET /jobs/company]', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ─── GET /api/jobs/:jobId  (Single job) ───────────────────────────────────────
router.get('/:jobId', verifyToken, async (req, res) => {
  try {
    const job = await prisma.job.findUnique({ where: { id: req.params.jobId } });
    if (!job) return res.status(404).json({ success: false, message: 'Job not found.' });

    let hasApplied = false;
    if (req.user.role === 'student') {
      const app = await prisma.application.findUnique({
        where: { studentId_jobId: { studentId: req.user.id, jobId: job.id } },
      });
      hasApplied = !!app;
    }

    res.status(200).json({ success: true, data: { job: { ...serializeJob(job), hasApplied } } });
  } catch (error) {
    console.error('[GET /jobs/:jobId]', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ─── POST /api/jobs  (Company – create job) ───────────────────────────────────
router.post('/', verifyCompany, async (req, res) => {
  try {
    const company = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!company) return res.status(404).json({ success: false, message: 'Company not found.' });

    const {
      role, location, type, duration, description,
      requirements, deadline, logo, logoColor, status,
    } = req.body;

    if (!role || !location || !type) {
      return res.status(400).json({ success: false, message: 'role, location, and type are required.' });
    }

    // Auto-split requirements into tags
    const tagsArray = extractTags(requirements);

    const job = await prisma.job.create({
      data: {
        companyId: req.user.id,
        company: company.companyName || '',
        role,
        location,
        type,
        duration: duration || null,
        description: description || null,
        requirements: requirements || null,
        tags: JSON.stringify(tagsArray),
        status: status || 'Active',
        deadline: deadline || null,
        logo: logo || company.avatar || null,
        logoColor: logoColor || null,
      },
    });

    res.status(201).json({ success: true, data: { job: serializeJob(job) } });
  } catch (error) {
    console.error('[POST /jobs]', error);
    res.status(500).json({ success: false, message: 'Server error creating job.' });
  }
});

// ─── PUT /api/jobs/:jobId  (Company – update job) ─────────────────────────────
router.put('/:jobId', verifyCompany, async (req, res) => {
  try {
    const job = await prisma.job.findUnique({ where: { id: req.params.jobId } });
    if (!job) return res.status(404).json({ success: false, message: 'Job not found.' });
    if (job.companyId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'You do not own this job.' });
    }

    const { role, location, type, duration, description, requirements, deadline, logo, logoColor } = req.body;

    const tagsArray = requirements !== undefined ? extractTags(requirements) : undefined;

    const updated = await prisma.job.update({
      where: { id: req.params.jobId },
      data: {
        ...(role !== undefined && { role }),
        ...(location !== undefined && { location }),
        ...(type !== undefined && { type }),
        ...(duration !== undefined && { duration }),
        ...(description !== undefined && { description }),
        ...(requirements !== undefined && { requirements }),
        ...(tagsArray !== undefined && { tags: JSON.stringify(tagsArray) }),
        ...(deadline !== undefined && { deadline }),
        ...(logo !== undefined && { logo }),
        ...(logoColor !== undefined && { logoColor }),
      },
    });

    res.status(200).json({ success: true, data: { job: serializeJob(updated) } });
  } catch (error) {
    console.error('[PUT /jobs/:jobId]', error);
    res.status(500).json({ success: false, message: 'Server error updating job.' });
  }
});

// ─── PATCH /api/jobs/:jobId/status  (Company – toggle status) ─────────────────
router.patch('/:jobId/status', verifyCompany, async (req, res) => {
  try {
    const job = await prisma.job.findUnique({ where: { id: req.params.jobId } });
    if (!job) return res.status(404).json({ success: false, message: 'Job not found.' });
    if (job.companyId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'You do not own this job.' });
    }

    const { status } = req.body;
    const validStatuses = ['Active', 'Closed', 'Draft'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: `Status must be one of: ${validStatuses.join(', ')}.` });
    }

    const updated = await prisma.job.update({
      where: { id: req.params.jobId },
      data: { status },
    });

    res.status(200).json({ success: true, data: { job: serializeJob(updated) } });
  } catch (error) {
    console.error('[PATCH /jobs/:jobId/status]', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ─── DELETE /api/jobs/:jobId  (Company – delete job) ─────────────────────────
router.delete('/:jobId', verifyCompany, async (req, res) => {
  try {
    const job = await prisma.job.findUnique({ where: { id: req.params.jobId } });
    if (!job) return res.status(404).json({ success: false, message: 'Job not found.' });
    if (job.companyId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'You do not own this job.' });
    }

    await prisma.job.delete({ where: { id: req.params.jobId } });

    res.status(200).json({ success: true, message: 'Job deleted successfully.' });
  } catch (error) {
    console.error('[DELETE /jobs/:jobId]', error);
    res.status(500).json({ success: false, message: 'Server error deleting job.' });
  }
});

module.exports = router;