const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// --- 1. STUDENT: GET MY APPLICATIONS ---
router.get('/mine', verifyToken, async (req, res) => {
    try {
        if (req.user.role !== 'student') {
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }

        const applications = await prisma.application.findMany({
            where: { studentId: req.user.id },
            include: { job: true }, // Join the job data
            orderBy: { dateApplied: 'desc' }
        });

        // Format exactly as the PDF requested
        const formattedData = applications.map(app => ({
            id: app.id,
            jobId: app.jobId,
            status: app.status,
            dateApplied: app.dateApplied,
            matchScore: app.matchScore,
            role: app.job.role,
            company: app.job.company,
            location: app.job.location,
            type: app.job.type,
            logo: app.job.logo,
            logoColor: app.job.logoColor
        }));

        res.status(200).json({ success: true, data: formattedData });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error fetching applications' });
    }
});

// --- 2. STUDENT: APPLY TO A JOB ---
router.post('/:jobId', verifyToken, async (req, res) => {
    try {
        if (req.user.role !== 'student') {
            return res.status(403).json({ success: false, message: 'Only students can apply' });
        }

        const { jobId } = req.params;

        // 1. Check if job exists and is active
        const job = await prisma.job.findUnique({ where: { id: jobId } }); // Note: DB table is often 'internship' but we map it logically. Assuming Prisma schema uses 'job' or 'internship'. We use 'internship' if that's what's in your schema.
        if (!job) {
            return res.status(404).json({ success: false, message: 'Job not found or no longer accepting applications.' });
        }

        // 2. Check for duplicate application
        const existingApp = await prisma.application.findFirst({
            where: { studentId: req.user.id, jobId: jobId }
        });

        if (existingApp) {
            return res.status(409).json({ success: false, message: 'You have already applied for this position.' });
        }

        // 3. Create Application (matchScore can be a random mock value for now like 85)
        const newApp = await prisma.application.create({
            data: {
                studentId: req.user.id,
                jobId: jobId,
                status: 'Pending',
                matchScore: Math.floor(Math.random() * (100 - 60 + 1) + 60), // Random 60-100
            }
        });

        res.status(201).json({ success: true, data: newApp });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error creating application' });
    }
});

// --- 3. STUDENT: CANCEL APPLICATION ---
router.delete('/cancel/:jobId', verifyToken, async (req, res) => {
    try {
        if (req.user.role !== 'student') {
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }

        const appToDelete = await prisma.application.findFirst({
            where: { studentId: req.user.id, jobId: req.params.jobId }
        });

        if (!appToDelete) {
            return res.status(404).json({ success: false, message: 'Application not found.' });
        }

        await prisma.application.delete({ where: { id: appToDelete.id } });
        res.status(200).json({ success: true, message: 'Application withdrawn successfully.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error cancelling application' });
    }
});

// --- 4. COMPANY: GET ALL APPLICANTS ---
router.get('/company', verifyToken, async (req, res) => {
    try {
        if (req.user.role !== 'company') {
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }

        // Find all applications where the connected Job's companyId matches req.user.id
        const applications = await prisma.application.findMany({
            where: {
                job: { companyId: req.user.id }
            },
            include: {
                job: true,
                student: true
            },
            orderBy: { dateApplied: 'desc' }
        });

        // Format exactly as the PDF requested
        const formattedData = applications.map(app => ({
            id: app.id,
            jobId: app.jobId,
            jobTitle: app.job.role,
            status: app.status,
            dateApplied: app.dateApplied,
            matchScore: app.matchScore,
            student: {
                id: app.student.id,
                firstName: app.student.firstName,
                lastName: app.student.lastName,
                email: app.student.email,
                avatar: app.student.avatar,
                university: app.student.university,
                major: app.student.major,
                skills: app.student.skills ? JSON.parse(app.student.skills) : [],
                resumeUrl: app.student.resumeUrl
            }
        }));

        res.status(200).json({ success: true, data: formattedData });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error fetching applicants' });
    }
});

// --- 5. COMPANY: UPDATE APPLICATION STATUS ---
router.patch('/:id/status', verifyToken, async (req, res) => {
    try {
        if (req.user.role !== 'company') {
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }

        const { status } = req.body;
        const applicationId = req.params.id;

        // Verify the company actually owns the job this application is tied to
        const application = await prisma.application.findUnique({
            where: { id: applicationId },
            include: { job: true }
        });

        if (!application) {
            return res.status(404).json({ success: false, message: 'Application not found.' });
        }

        if (application.job.companyId !== req.user.id) {
            return res.status(403).json({ success: false, message: 'You do not have permission to update this application.' });
        }

        const updatedApp = await prisma.application.update({
            where: { id: applicationId },
            data: { status }
        });

        res.status(200).json({ success: true, data: { id: updatedApp.id, status: updatedApp.status } });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error updating status' });
    }
});

module.exports = router;