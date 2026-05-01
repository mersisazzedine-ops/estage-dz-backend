const express = require('express');
const nodemailer = require('nodemailer');
const { PrismaClient } = require('@prisma/client');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// ─── Nodemailer Transporter ───────────────────────────────────────────────────
const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: false, // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
};

// ─── POST /api/tickets  (Authenticated – create support ticket) ────────────────
router.post('/', verifyToken, async (req, res) => {
  try {
    const { type, subject, description, reportedPartyId } = req.body;

    if (!type || !subject || !description) {
      return res.status(400).json({ success: false, message: 'type, subject, and description are required.' });
    }

    const validTypes = ['conflict', 'support', 'bug'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ success: false, message: `type must be one of: ${validTypes.join(', ')}.` });
    }

    // Validate reportedPartyId if provided
    if (reportedPartyId) {
      const reportedUser = await prisma.user.findUnique({ where: { id: reportedPartyId } });
      if (!reportedUser) {
        return res.status(404).json({ success: false, message: 'Reported party not found.' });
      }
    }

    const ticket = await prisma.ticket.create({
      data: {
        type,
        subject,
        description,
        reporterId: req.user.id,
        reportedPartyId: reportedPartyId || null,
        status: 'open',
      },
      include: {
        reporter: true,
        reportedParty: true,
      },
    });

    const { password: _rp, ...reporter } = ticket.reporter;
    const reportedParty = ticket.reportedParty
      ? (() => { const { password: _pp, ...rp } = ticket.reportedParty; return rp; })()
      : null;

    res.status(201).json({
      success: true,
      message: 'Ticket submitted successfully.',
      data: { ticket: { ...ticket, reporter, reportedParty } },
    });
  } catch (error) {
    console.error('[POST /tickets]', error);
    res.status(500).json({ success: false, message: 'Server error creating ticket.' });
  }
});

// ─── POST /api/contact  (Public – send email via Nodemailer) ──────────────────
router.post('/contact', async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;

    if (!name || !email || !subject || !message) {
      return res.status(400).json({
        success: false,
        message: 'name, email, subject, and message are required.',
      });
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ success: false, message: 'Invalid email address.' });
    }

    const transporter = createTransporter();

    const mailOptions = {
      from: `"E-Stage DZ Contact" <${process.env.SMTP_USER}>`,
      to: process.env.SUPPORT_EMAIL || 'support@internship-platform.dz',
      replyTo: email,
      subject: `[Contact Form] ${subject}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #4F46E5;">New Contact Form Submission – E-Stage DZ</h2>
          <table style="width:100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px; font-weight: bold; background: #f3f4f6;">Name:</td>
              <td style="padding: 8px;">${name}</td>
            </tr>
            <tr>
              <td style="padding: 8px; font-weight: bold; background: #f3f4f6;">Email:</td>
              <td style="padding: 8px;"><a href="mailto:${email}">${email}</a></td>
            </tr>
            <tr>
              <td style="padding: 8px; font-weight: bold; background: #f3f4f6;">Subject:</td>
              <td style="padding: 8px;">${subject}</td>
            </tr>
            <tr>
              <td style="padding: 8px; font-weight: bold; background: #f3f4f6;">Message:</td>
              <td style="padding: 8px;">${message.replace(/\n/g, '<br>')}</td>
            </tr>
          </table>
          <hr style="margin-top: 24px;"/>
          <p style="color: #6b7280; font-size: 12px;">Sent from the E-Stage DZ platform contact form.</p>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);

    res.status(200).json({
      success: true,
      message: 'Your message has been sent successfully. We will get back to you soon.',
    });
  } catch (error) {
    console.error('[POST /contact]', error);
    // Don't expose SMTP errors to the client
    res.status(500).json({ success: false, message: 'Failed to send message. Please try again later.' });
  }
});

module.exports = router;