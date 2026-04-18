const db = require('../config/db');

// Student applies for an internship
exports.applyForInternship = async (req, res) => {
    try {
        // The Smart Bouncer: Check if the user is a student
        if (req.user.role !== 'student') {
            return res.status(403).json({ message: "Access denied. Only students can apply for internships." });
        }

        const { internship_id, cover_letter } = req.body;
        const student_id = req.user.id; // From the student's JWT token

        // Make sure they provided the internship ID
        if (!internship_id) {
            return res.status(400).json({ message: "Please specify which internship you are applying to." });
        }

        // Save the application to the database
        const sqlQuery = 'INSERT INTO applications (student_id, internship_id, cover_letter) VALUES (?, ?, ?)';
        await db.query(sqlQuery, [student_id, internship_id, cover_letter]);

        res.status(201).json({ message: "Application submitted successfully!" });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error while submitting application." });
    }
};
// 2. Get applications for a company's internships
exports.getCompanyApplications = async (req, res) => {
    try {
        if (req.user.role !== 'company') {
            return res.status(403).json({ message: "Access denied. Only companies can view these." });
        }

        const company_id = req.user.id; // Get the company ID from the token

        // We use JOIN to get the Student's Name/Email and the Internship Title all at once!
        const sqlQuery = `
            SELECT applications.id, applications.cover_letter, applications.status, applications.created_at,
                   users.name AS student_name, users.email AS student_email,
                   internships.title AS internship_title
            FROM applications
            JOIN users ON applications.student_id = users.id
            JOIN internships ON applications.internship_id = internships.id
            WHERE internships.company_id = ?
        `;
        
        const [applications] = await db.query(sqlQuery, [company_id]);
        res.status(200).json(applications);

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error while fetching applications." });
    }
};

// 3. Company accepts or rejects an application
exports.updateApplicationStatus = async (req, res) => {
    try {
        if (req.user.role !== 'company') {
            return res.status(403).json({ message: "Access denied." });
        }

        const applicationId = req.params.id; // We will get this from the URL (e.g., /api/applications/5/status)
        const { status } = req.body; // This will be either 'accepted' or 'rejected'

        // Make sure they only send valid statuses
        if (status !== 'accepted' && status !== 'rejected') {
            return res.status(400).json({ message: "Status must be 'accepted' or 'rejected'." });
        }

        const sqlQuery = 'UPDATE applications SET status = ? WHERE id = ?';
        await db.query(sqlQuery, [status, applicationId]);

        res.status(200).json({ message: `Application has been ${status}!` });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error while updating status." });
    }
};