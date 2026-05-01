const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// --- ADMIN GUARD MIDDLEWARE ---
// This runs before EVERY route in this file to ensure strictly admins can access them.
const verifyAdmin = (req, res, next) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Forbidden. Admin access required.' });
    }
    next();
};

// Apply guards to all routes in this file
router.use(verifyToken, verifyAdmin);

// --- 1. GET PLATFORM STATS ---
router.get('/stats', async (req, res) => {
    try {
        const [
            totalStudents,
            totalCompanies,
            activeJobs,
            totalApplications,
            pendingCompanies,
            openTickets,
            recentApplicationsRaw,
            recentUsersRaw
        ] = await Promise.all([
            prisma.user.count({ where: { role: 'student' } }),
            prisma.user.count({ where: { role: 'company' } }),
            prisma.job.count({ where: { status: 'Active' } }),
            prisma.application.count(),
            prisma.user.count({ where: { role: 'company', verificationStatus: 'pending' } }),
            prisma.ticket.count({ where: { status: 'open' } }),
            prisma.application.findMany({
                take: 4, orderBy: { dateApplied: 'desc' }, include: { student: true, job: true }
            }),
            prisma.user.findMany({
                take: 4, orderBy: { createdAt: 'desc' },
                select: { id: true, firstName: true, lastName: true, companyName: true, role: true, avatar: true }
            })
        ]);

        const recentApplications = recentApplicationsRaw.map(app => ({
            id: app.id,
            studentId: app.studentId,
            jobId: app.jobId,
            status: app.status,
            studentName: `${app.student.firstName} ${app.student.lastName}`,
            jobRole: app.job.role,
            dateApplied: app.dateApplied
        }));

        res.status(200).json({
            success: true,
            data: {
                totalStudents, totalCompanies, activeJobs, totalApplications,
                pendingCompanies, openTickets, recentApplications,
                recentUsers: recentUsersRaw
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error fetching admin stats' });
    }
});

// --- 2. MANAGE USERS ---
router.get('/users', async (req, res) => {
    try {
        const { role, search } = req.query;
        let whereClause = {};
        
        if (role && role !== 'all') whereClause.role = role;
        if (search) {
            whereClause.OR = [
                { email: { contains: search } },
                { firstName: { contains: search } },
                { lastName: { contains: search } },
                { companyName: { contains: search } }
            ];
        }

        const users = await prisma.user.findMany({
            where: whereClause,
            orderBy: { createdAt: 'desc' }
        });

        const formattedUsers = users.map(u => ({
            id: u.id, role: u.role, email: u.email, status: u.status,
            verificationStatus: u.verificationStatus, firstName: u.firstName,
            lastName: u.lastName, companyName: u.companyName, avatar: u.avatar,
            createdAt: u.createdAt
        }));

        res.status(200).json({ success: true, data: formattedUsers });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error fetching users' });
    }
});

router.patch('/users/:userId/suspend', async (req, res) => {
    try {
        const user = await prisma.user.findUnique({ where: { id: req.params.userId } });
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        const newStatus = user.status === 'suspended' ? 'active' : 'suspended';
        const updatedUser = await prisma.user.update({
            where: { id: user.id },
            data: { status: newStatus }
        });

        res.status(200).json({ success: true, data: { id: updatedUser.id, status: updatedUser.status } });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error updating user status' });
    }
});

router.delete('/users/:userId', async (req, res) => {
    try {
        await prisma.user.delete({ where: { id: req.params.userId } });
        res.status(200).json({ success: true, message: 'User deleted successfully.' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error deleting user' });
    }
});

// --- 3. MANAGE JOBS ---
router.get('/jobs', async (req, res) => {
    try {
        const { status, search } = req.query;
        let whereClause = {};

        if (status && status !== 'all') whereClause.status = status;
        if (search) {
            whereClause.OR = [
                { role: { contains: search } },
                { company: { contains: search } }
            ];
        }

        const jobs = await prisma.job.findMany({
            where: whereClause,
            include: { _count: { select: { applications: true } } },
            orderBy: { createdAt: 'desc' }
        });

        const formattedJobs = jobs.map(job => ({
            id: job.id, role: job.role, company: job.company, companyId: job.companyId,
            type: job.type, location: job.location, status: job.status,
            deadline: job.deadline, logo: job.logo, logoColor: job.logoColor,
            applicantCount: job._count.applications
        }));

        res.status(200).json({ success: true, data: formattedJobs });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error fetching jobs' });
    }
});

router.patch('/jobs/:jobId/block', async (req, res) => {
    try {
        const job = await prisma.job.findUnique({ where: { id: req.params.jobId } });
        if (!job) return res.status(404).json({ success: false, message: 'Job not found' });

        const newStatus = job.status === 'Blocked' ? 'Active' : 'Blocked';
        const updatedJob = await prisma.job.update({
            where: { id: job.id },
            data: { status: newStatus }
        });

        res.status(200).json({ success: true, data: { id: updatedJob.id, status: updatedJob.status } });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error updating job status' });
    }
});

router.delete('/jobs/:jobId', async (req, res) => {
    try {
        await prisma.job.delete({ where: { id: req.params.jobId } });
        res.status(200).json({ success: true, message: 'Job and all associated applications deleted.' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error deleting job' });
    }
});

// --- 4. COMPANY VALIDATION ---
router.get('/companies/validation', async (req, res) => {
    try {
        const pendingCompanies = await prisma.user.findMany({
            where: { role: 'company', verificationStatus: 'pending' }
        });

        const formatted = pendingCompanies.map(c => ({
            id: c.id, companyName: c.companyName, email: c.email,
            industry: c.industry, location: c.location, website: c.website,
            avatar: c.avatar, verificationStatus: c.verificationStatus,
            nif: c.nif, registreCommerce: c.registreCommerce
        }));

        res.status(200).json({ success: true, data: formatted });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error fetching pending companies' });
    }
});

router.patch('/companies/:companyId/verify', async (req, res) => {
    try {
        const { status } = req.body;
        if (!['approved', 'rejected'].includes(status)) {
            return res.status(400).json({ success: false, message: "Status must be 'approved' or 'rejected'." });
        }

        const updatedCompany = await prisma.user.update({
            where: { id: req.params.companyId },
            data: { verificationStatus: status }
        });

        res.status(200).json({ success: true, data: { id: updatedCompany.id, verificationStatus: updatedCompany.verificationStatus } });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error updating company verification' });
    }
});

// --- 5. SUPPORT TICKETS ---
router.get('/tickets', async (req, res) => {
    try {
        const { status, search } = req.query;
        let whereClause = {};

        if (status && status !== 'all') whereClause.status = status;
        if (search) {
            whereClause.OR = [
                { subject: { contains: search } },
                { description: { contains: search } }
            ];
        }

        const tickets = await prisma.ticket.findMany({
            where: whereClause,
            include: { reporter: { select: { firstName: true, lastName: true, companyName: true, role: true } } },
            orderBy: { dateOpened: 'desc' }
        });

        const formatted = tickets.map(t => ({
            id: t.id, type: t.type, status: t.status, subject: t.subject,
            description: t.description, dateOpened: t.dateOpened, resolvedAt: t.resolvedAt,
            reporterId: t.reporterId,
            reporterName: t.reporter.role === 'student' ? `${t.reporter.firstName} ${t.reporter.lastName}` : t.reporter.companyName
        }));

        res.status(200).json({ success: true, data: formatted });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error fetching tickets' });
    }
});

router.patch('/tickets/:ticketId/resolve', async (req, res) => {
    try {
        const ticket = await prisma.ticket.update({
            where: { id: req.params.ticketId },
            data: { status: 'resolved', resolvedAt: new Date() }
        });
        res.status(200).json({ success: true, data: { id: ticket.id, status: 'resolved', resolvedAt: ticket.resolvedAt } });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error resolving ticket' });
    }
});

module.exports = router;