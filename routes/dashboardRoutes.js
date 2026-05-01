const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { verifyStudent, verifyCompany } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

const parseJSON = (str, fallback = []) => {
  if (!str) return fallback;
  if (Array.isArray(str)) return str;
  try { return JSON.parse(str); } catch { return fallback; }
};

const serializeJob = (job) => {
  if (!job) return null;
  return { ...job, tags: parseJSON(job.tags) };
};

// ─── GET /api/dashboard/student ───────────────────────────────────────────────
router.get('/student', verifyStudent, async (req, res) => {
  try {
    const studentId = req.user.id;

    // Aggregate counts
    const [total, pending, underReview, interview, accepted, rejected] = await Promise.all([
      prisma.application.count({ where: { studentId } }),
      prisma.application.count({ where: { studentId, status: 'Pending' } }),
      prisma.application.count({ where: { studentId, status: 'Under Review' } }),
      prisma.application.count({ where: { studentId, status: 'Interview' } }),
      prisma.application.count({ where: { studentId, status: 'Accepted' } }),
      prisma.application.count({ where: { studentId, status: 'Rejected' } }),
    ]);

    // 3 most recent applications with job details
    const recentApplications = await prisma.application.findMany({
      where: { studentId },
      include: { job: true },
      orderBy: { dateApplied: 'desc' },
      take: 3,
    });

    res.status(200).json({
      success: true,
      data: {
        stats: { total, pending, underReview, interview, accepted, rejected },
        recentApplications: recentApplications.map((app) => ({
          ...app,
          job: app.job ? serializeJob(app.job) : null,
        })),
      },
    });
  } catch (error) {
    console.error('[GET /dashboard/student]', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ─── GET /api/dashboard/company ───────────────────────────────────────────────
router.get('/company', verifyCompany, async (req, res) => {
  try {
    const companyId = req.user.id;

    // All job IDs for this company
    const companyJobs = await prisma.job.findMany({
      where: { companyId },
      select: { id: true },
    });
    const jobIds = companyJobs.map((j) => j.id);

    const [activeOffers, totalApplicants, pendingApplicants, acceptedApplicants] = await Promise.all([
      prisma.job.count({ where: { companyId, status: 'Active' } }),
      prisma.application.count({ where: { jobId: { in: jobIds } } }),
      prisma.application.count({ where: { jobId: { in: jobIds }, status: 'Pending' } }),
      prisma.application.count({ where: { jobId: { in: jobIds }, status: 'Accepted' } }),
    ]);

    // 4 most recent applicants
    const recentApplications = await prisma.application.findMany({
      where: { jobId: { in: jobIds } },
      include: {
        student: true,
        job: true,
      },
      orderBy: { dateApplied: 'desc' },
      take: 4,
    });

    // 3 active job previews
    const activeJobs = await prisma.job.findMany({
      where: { companyId, status: 'Active' },
      orderBy: { createdAt: 'desc' },
      take: 3,
    });

    res.status(200).json({
      success: true,
      data: {
        stats: { activeOffers, totalApplicants, pendingApplicants, acceptedApplicants },
        recentApplications: recentApplications.map((app) => {
          const { password, ...student } = app.student;
          return {
            ...app,
            student,
            job: app.job ? serializeJob(app.job) : null,
          };
        }),
        activeJobs: activeJobs.map(serializeJob),
      },
    });
  } catch (error) {
    console.error('[GET /dashboard/company]', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

module.exports = router;