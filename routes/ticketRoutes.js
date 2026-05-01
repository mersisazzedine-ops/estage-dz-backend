const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { verifyToken } = require('../middleware/auth');
const nodemailer = require('nodemailer');

const router = express.Router();
const prisma = new PrismaClient();

// --- SMTP CONFIGURATION ---
// Set up the email sender using variables from your .env file
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: process.env.SMTP_PORT || 587,
    secure: false, // true for 465, false for other ports
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

// --- 1. SUBMIT A SUPPORT TICKET (/api/tickets) ---
router.post('/', verifyToken, async (req, res) => {
    try {
        const { type, subject, description, reportedPartyId } = req.body;

        // Validation
        if (!subject || !description || !type) {
            return res.status(400).json({ success: false, message: 'Type, subject, and description are required.' });
        }

        const newTicket = await prisma.ticket.create({
            data: {
                type,
                subject,
                description,
                reportedPartyId: reportedPartyId || null,
                reporterId: req.user.id,
                status: 'open',
                // dateOpened is automatically set by Prisma via @default(now())
            }
        });

        res.status(201).json({ 
            success: true, 
            message: 'Your ticket has been submitted. We will get back to you shortly.',
            data: newTicket
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error creating ticket' });
    }
});

// --- 2. PUBLIC CONTACT FORM (/api/tickets/contact) ---
// Note: We'll map /api/contact to point here in server.js!
router.post('/contact', async (req, res) => {
    try {
        const { name, email, message } = req.body;

        if (!name || !email || !message) {
            return res.status(400).json({ success: false, message: 'All fields are required.' });
        }

        // Email content
        const mailOptions = {
            from: `"${name}" <${email}>`, // Sender address
            to: 'support@internship-platform.dz', // Receiver defined in the PDF
            subject: `New Contact Form Submission from ${name}`,
            text: `Name: ${name}\nEmail: ${email}\n\nMessage:\n${message}`,
        };

        // Attempt to send the email
        try {
            await transporter.sendMail(mailOptions);
        } catch (emailError) {
            console.error("Email failed to send. Check SMTP credentials:", emailError);
            // Even if email fails during development, we shouldn't necessarily crash the whole app, 
            // but the PDF requires a 500 error on fail:
            return res.status(500).json({ success: false, message: 'Failed to send message. Please try again.' });
        }

        res.status(200).json({ success: true, message: 'Message received. We will contact you shortly.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error processing contact form' });
    }
});

module.exports = router;