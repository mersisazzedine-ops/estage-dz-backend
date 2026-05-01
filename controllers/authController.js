const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

const register = async (req, res) => {
  try {
    const { 
      role, email, password, 
      firstName, lastName, // Student fields
      companyName // Company fields
    } = req.body;

    // 1. Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });
    if (existingUser) {
      return res.status(409).json({ message: 'Email already in use' });
    }

    // 2. Hash the password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // 3. Prepare the user data based on their role
    let userData = {
      role,
      email,
      password: hashedPassword,
    };

    if (role === 'student') {
      userData.firstName = firstName;
      userData.lastName = lastName;
    } else if (role === 'company') {
      userData.companyName = companyName;
      // Najib's requirement: Companies must be approved by admin before logging in
      userData.verificationStatus = 'pending'; 
    }

    // 4. Save to the SQLite database
    const newUser = await prisma.user.create({
      data: userData
    });

    res.status(201).json({ 
      success: true, 
      message: 'User registered successfully',
      user: { id: newUser.id, email: newUser.email, role: newUser.role }
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error during registration' });
  }
};

module.exports = { register };