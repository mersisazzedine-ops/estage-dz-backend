const jwt = require('jsonwebtoken');
require('dotenv').config();

const protect = (req, res, next) => {
    // 1. Look at the request headers to see if the user brought a token
    let token = req.header('Authorization');

    // 2. If there is no token at all, stop them here
    if (!token) {
        return res.status(401).json({ message: "Access denied. No token provided." });
    }

    try {
        // 3. Tokens usually come in the format "Bearer eyJhbGci..." so we remove the word "Bearer "
        if (token.startsWith('Bearer ')) {
            token = token.slice(7, token.length).trimLeft();
        }

        // 4. Verify the token using our secret key
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // 5. If it's valid, attach the user's data (id and role) to the request so we can use it later
        req.user = decoded;

        // 6. Let them pass to the actual route!
        next(); 
    } catch (error) {
        // If the token is fake or expired, kick them out
        res.status(400).json({ message: "Invalid token." });
    }
};

module.exports = protect;