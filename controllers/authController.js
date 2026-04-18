const jwt = require('jsonwebtoken');
const db = require('../config/db');
const bcrypt = require('bcryptjs'); // The tool we use to encrypt passwords

// Register a new user
exports.register = async (req, res) => {
    try {
        // 1. Get the data sent by the frontend
        const { name, email, password, role } = req.body;

        // 2. Check if the user filled in all fields
        if (!name || !email || !password || !role) {
            return res.status(400).json({ message: "Please fill in all fields." });
        }

        // 3. Encrypt (hash) the password for security
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // 4. Save the new user to the database
        const sqlQuery = 'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)';
        
        // We use [name, email, hashedPassword, role] to replace the '?' safely (prevents SQL injection hacking)
        const [result] = await db.query(sqlQuery, [name, email, hashedPassword, role]);

        // 5. Send a success message back to the frontend
        res.status(201).json({ message: "User registered successfully!" });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error during registration." });
    }
};
// Login an existing user
exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        // 1. Check if email and password are provided
        if (!email || !password) {
            return res.status(400).json({ message: "Please provide email and password." });
        }

        // 2. Find the user in the database
        const [users] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
        
        if (users.length === 0) {
            return res.status(401).json({ message: "Invalid email or password." });
        }

        const user = users[0];

        // 3. Compare the provided password with the hashed password in the database
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: "Invalid email or password." });
        }

        // 4. Generate the JWT (The VIP Wristband)
        const token = jwt.sign(
            { id: user.id, role: user.role }, // The data we want to attach to the wristband
            process.env.JWT_SECRET,           // The secret key to sign it
            { expiresIn: '1d' }               // The token expires in 1 day
        );

        // 5. Send the token and user data back to the frontend
        res.status(200).json({
            message: "Login successful!",
            token: token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error during login." });
    }
};