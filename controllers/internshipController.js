const db = require('../config/db');

// 1. Create a new internship (Only for Companies)
exports.createInternship = async (req, res) => {
    try {
        // The Smart Bouncer: Check if the user is a company
        if (req.user.role !== 'company') {
            return res.status(403).json({ message: "Access denied. Only companies can post internships." });
        }

        const { title, description } = req.body;
        const company_id = req.user.id; // We get this from the token!

        if (!title || !description) {
            return res.status(400).json({ message: "Please provide a title and description." });
        }

        const sqlQuery = 'INSERT INTO internships (company_id, title, description) VALUES (?, ?, ?)';
        await db.query(sqlQuery, [company_id, title, description]);

        res.status(201).json({ message: "Internship posted successfully!" });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error while creating internship." });
    }
};

// 2. Get all internships (For Students and Companies to see)
exports.getAllInternships = async (req, res) => {
    try {
        // We use a JOIN to also get the name of the company that posted it
        const sqlQuery = `
            SELECT internships.id, internships.title, internships.description, users.name AS company_name, internships.created_at 
            FROM internships 
            JOIN users ON internships.company_id = users.id
            ORDER BY internships.created_at DESC
        `;
        
        const [internships] = await db.query(sqlQuery);
        res.status(200).json(internships);

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error while fetching internships." });
    }
};