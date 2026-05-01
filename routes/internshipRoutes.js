const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { verifyToken } = require('../middleware/auth'); 

const router = express.Router();
const prisma = new PrismaClient();

// --- 1. GET ALL INTERNSHIPS (WITH SEARCH & FILTERING) --- [cite: 94, 96]
router.get('/', async (req, res) => {
    try {
        const { search, location, type } = req.query; // [cite: 97]

        // Build the Prisma query dynamically based on what the frontend sends
        let filter = {};

        if (search) {
            filter.OR = [
                { role: { contains: search } }, // [cite: 98] SQLite uses case-sensitive by default, but this works for basic search
                { company: { contains: search } } // [cite: 98]
            ];
        }
        if (location) {
            filter.location = { contains: location }; // [cite: 98]
        }
        if (type) {
            filter.type = type; // [cite: 98] e.g., "Remote", "Hybrid"
        }

        const internships = await prisma.internship.findMany({
            where: filter,
            orderBy: { posted: 'desc' } // Newest jobs first
        });

        // Convert stringified tags back to arrays for the frontend
        const formattedInternships = internships.map(job => ({
            ...job,
            tags: job.tags ? JSON.parse(job.tags) : []
        }));

        res.status(200).json(formattedInternships);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error fetching internships' });
    }
});

// --- 2. GET COMPANY'S OWN INTERNSHIPS --- 
// IMPORTANT: This must go BEFORE '/:id' or Express will think "mine" is an ID!
router.get('/mine', verifyToken, async (req, res) => {
    try {
        if (req.user.role !== 'company') {
            return res.status(403).json({ message: 'Only companies can view their posted jobs' });
        }

        const internships = await prisma.internship.findMany({
            where: { companyId: req.user.id },
            orderBy: { posted: 'desc' }
        });

        const formattedInternships = internships.map(job => ({
            ...job,
            tags: job.tags ? JSON.parse(job.tags) : []
        }));

        res.status(200).json(formattedInternships);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error fetching your internships' });
    }
});

// --- 3. GET SINGLE INTERNSHIP --- 
router.get('/:id', async (req, res) => {
    try {
        const internship = await prisma.internship.findUnique({
            where: { id: req.params.id }
        });

        if (!internship) return res.status(404).json({ message: 'Internship not found' });

        internship.tags = internship.tags ? JSON.parse(internship.tags) : [];
        res.status(200).json(internship);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error fetching internship' });
    }
});

// --- 4. POST A NEW INTERNSHIP --- 
router.post('/', verifyToken, async (req, res) => {
    try {
        if (req.user.role !== 'company') {
            return res.status(403).json({ message: 'Only companies can post jobs' });
        }

        // Fetch the company's full profile to grab their name and logo automatically [cite: 111]
        const companyUser = await prisma.user.findUnique({ where: { id: req.user.id } });

        const jobData = { ...req.body };
        jobData.companyId = req.user.id; // [cite: 111] Auto-attach companyId
        jobData.company = companyUser.companyName || 'Unknown Company'; // [cite: 111]
        jobData.logo = companyUser.avatar || companyUser.companyName?.charAt(0) || 'C'; // [cite: 111]
        jobData.logoColor = "bg-blue-600 text-white"; // [cite: 111] Default color fallback
        
        // SQLite Workaround: Store tags as a string
        if (jobData.tags && Array.isArray(jobData.tags)) {
            jobData.tags = JSON.stringify(jobData.tags);
        }

        const newJob = await prisma.internship.create({ data: jobData });
        res.status(201).json(newJob);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error creating internship' });
    }
});

// --- 5. EDIT AN INTERNSHIP --- 
router.put('/:id', verifyToken, async (req, res) => {
    try {
        const job = await prisma.internship.findUnique({ where: { id: req.params.id } });
        if (!job) return res.status(404).json({ message: 'Job not found' });
        if (job.companyId !== req.user.id) return res.status(403).json({ message: 'Not authorized' });

        const updateData = { ...req.body };
        if (updateData.tags && Array.isArray(updateData.tags)) {
            updateData.tags = JSON.stringify(updateData.tags);
        }

        const updatedJob = await prisma.internship.update({
            where: { id: req.params.id },
            data: updateData
        });

        res.status(200).json(updatedJob);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error updating job' });
    }
});

// --- 6. CHANGE STATUS (Active / Closed / Draft) --- 
router.put('/:id/status', verifyToken, async (req, res) => {
    try {
        const job = await prisma.internship.findUnique({ where: { id: req.params.id } });
        if (!job) return res.status(404).json({ message: 'Job not found' });
        if (job.companyId !== req.user.id) return res.status(403).json({ message: 'Not authorized' });

        const updatedJob = await prisma.internship.update({
            where: { id: req.params.id },
            data: { status: req.body.status }
        });

        res.status(200).json(updatedJob);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error updating status' });
    }
});

// --- 7. DELETE AN INTERNSHIP --- 
router.delete('/:id', verifyToken, async (req, res) => {
    try {
        const job = await prisma.internship.findUnique({ where: { id: req.params.id } });
        if (!job) return res.status(404).json({ message: 'Job not found' });
        if (job.companyId !== req.user.id) return res.status(403).json({ message: 'Not authorized' });

        await prisma.internship.delete({ where: { id: req.params.id } });
        res.status(200).json({ message: 'Job deleted successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error deleting job' });
    }
});

module.exports = router;