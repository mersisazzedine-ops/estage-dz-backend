const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// --- 1. STUDENT DASHBOARD STATS ---
router.get('/student', verifyToken, async (req, res) => {
    try {
        if (req.user.role !== 'student') {
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }

        const studentId = req.user.id;

        // Run all queries at the exact same time for maximum speed!
        const [
            totalApplications,
            pendingApplications,
            acceptedApplications,
            rejectedApplications,
            recentApplications
        ] = await Promise.all([
            prisma.application.count({ where: { studentId } }),
            prisma.application.count({ where: { studentId, status: 'Pending' } }),
            prisma.application.count({ where: { studentId, status: 'Accepted' } }),
            prisma.application.count({ where: { studentId, status: 'Rejected' } }),
            prisma.application.findMany({
                where: { studentId },
                take: 3, // Only get the 3 most recent
                orderBy: { dateApplied: 'desc' },
                include: { job: true } // Bring in the job details
            })
        ]);

        // Format the recent applications exactly as the frontend expects
        const formattedRecent = recentApplications.map(app => ({
            id: app.id,
            role: app.job.role,
            company: app.job.company,
            logo: app.job.logo,
            logoColor: app.job.logoColor,
            status: app.status,
            dateApplied: app.dateApplied
        }));

        res.status(200).json({
            success: true,
            data: {
                totalApplications,
                pendingApplications,
                acceptedApplications,
                rejectedApplications,
                recentApplications: formattedRecent
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error fetching student stats' });
    }
});

// --- 2. COMPANY DASHBOARD STATS ---
router.get('/company', verifyToken, async (req, res) => {
    try {
        if (req.user.role !== 'company') {
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }

        const companyId = req.user.id;

        // 1. Get total active jobs for this company
        const activeOffers = await prisma.job.count({
            where: { companyId, status: 'Active' }
        });

        // 2. Find all applications that belong to ANY job this company posted
        const companyJobs = await prisma.job.findMany({ 
            where: { companyId }, select: { id: true } 
        });
        const jobIds = companyJobs.map(job => job.id);

        const [
            totalApplicants,
            pendingApplicants,
            acceptedApplicants,
            recentApplicationsRaw,
            activeOffersPreviewRaw
        ] = await Promise.all([
            prisma.application.count({ where: { jobId: { in: jobIds } } }),
            prisma.application.count({ where: { jobId: { in: jobIds }, status: 'Pending' } }),
            prisma.application.count({ where: { jobId: { in: jobIds }, status: 'Accepted' } }),
            prisma.application.findMany({
                where: { jobId: { in: jobIds } },
                take: 4, // Get the 4 most recent applicants
                orderBy: { dateApplied: 'desc' },
                include: { student: true, job: true }
            }),
            prisma.job.findMany({
                where: { companyId, status: 'Active' },
                take: 3, // Get 3 active jobs for the preview box
                orderBy: { createdAt: 'desc' }
            })
        ]);

        // Format exactly as the PDF requested
        const recentApplications = recentApplicationsRaw.map(app => ({
            id: app.id,
            jobId: app.jobId,
            jobTitle: app.job.role,
            status: app.status,
            dateApplied: app.dateApplied,
            student: {
                firstName: app.student.firstName,
                lastName: app.student.lastName,
                major: app.student.major,
                avatar: app.student.avatar
            }
        }));

        const activeOffersPreview = activeOffersPreviewRaw.map(job => ({
            id: job.id,
            role: job.role,
            type: job.type,
            location: job.location
        }));

        res.status(200).json({
            success: true,
            data: {
                activeOffers,
                totalApplicants,
                pendingApplicants,
                acceptedApplicants,
                recentApplications,
                activeOffersPreview
            }
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error fetching company stats' });
    }
});

module.exports = router;