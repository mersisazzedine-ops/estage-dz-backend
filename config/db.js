const mysql = require('mysql2');
require('dotenv').config();

// Create the database connection pool using variables from the .env file
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Convert the pool to use Promises (this makes it easier to use async/await later)
const db = pool.promise();

// Test the connection when the server starts
pool.getConnection((err, connection) => {
    if (err) {
        console.error('❌ Error connecting to the MySQL database:', err.message);
    } else {
        console.log('✅ Successfully connected to the MySQL database!');
        connection.release();
    }
});

module.exports = db;