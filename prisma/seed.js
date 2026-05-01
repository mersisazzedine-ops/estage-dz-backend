/**
 * Prisma Seed Script
 * Creates the default admin user.
 * Run with: node prisma/seed.js
 */

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // ─── Create Admin User ────────────────────────────────────────────────────
  const adminEmail = 'admin@estage-dz.com';
  const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });

  if (!existingAdmin) {
    const hashedPassword = await bcrypt.hash('Admin@2024!', 10);
    const admin = await prisma.user.create({
      data: {
        role: 'admin',
        email: adminEmail,
        password: hashedPassword,
        firstName: 'Platform',
        lastName: 'Admin',
        status: 'active',
        avatar: `https://api.dicebear.com/8.x/initials/svg?seed=Admin`,
        verificationStatus: null,
      },
    });
    console.log(`✅ Admin user created: ${admin.email} / Admin@2024!`);
  } else {
    console.log(`ℹ️  Admin already exists: ${adminEmail}`);
  }

  // ─── Create a demo Company (approved) ────────────────────────────────────
  const companyEmail = 'demo-company@estage-dz.com';
  const existingCompany = await prisma.user.findUnique({ where: { email: companyEmail } });

  if (!existingCompany) {
    const hashedPassword = await bcrypt.hash('Company@2024!', 10);
    await prisma.user.create({
      data: {
        role: 'company',
        email: companyEmail,
        password: hashedPassword,
        companyName: 'TechStartup DZ',
        industry: 'Technology',
        location: 'Algiers, Algeria',
        website: 'https://techstartup.dz',
        size: '10-50',
        about: 'A leading tech startup in Algeria building the future.',
        verificationStatus: 'approved',
        status: 'active',
        avatar: `https://api.dicebear.com/8.x/initials/svg?seed=TechStartupDZ`,
      },
    });
    console.log(`✅ Demo company created: ${companyEmail} / Company@2024!`);
  } else {
    console.log(`ℹ️  Demo company already exists: ${companyEmail}`);
  }

  // ─── Create a demo Student ────────────────────────────────────────────────
  const studentEmail = 'demo-student@estage-dz.com';
  const existingStudent = await prisma.user.findUnique({ where: { email: studentEmail } });

  if (!existingStudent) {
    const hashedPassword = await bcrypt.hash('Student@2024!', 10);
    await prisma.user.create({
      data: {
        role: 'student',
        email: studentEmail,
        password: hashedPassword,
        firstName: 'Ahmed',
        lastName: 'Benali',
        university: 'USTHB',
        major: 'Computer Science',
        graduationYear: '2025',
        skills: JSON.stringify(['JavaScript', 'React', 'Node.js', 'Python']),
        status: 'active',
        avatar: `https://api.dicebear.com/8.x/initials/svg?seed=AhmedBenali`,
      },
    });
    console.log(`✅ Demo student created: ${studentEmail} / Student@2024!`);
  } else {
    console.log(`ℹ️  Demo student already exists: ${studentEmail}`);
  }

  console.log('\n🎉 Seeding complete!');
  console.log('\n📋 Login Credentials:');
  console.log('   Admin:   admin@estage-dz.com     /  Admin@2024!');
  console.log('   Company: demo-company@estage-dz.com / Company@2024!');
  console.log('   Student: demo-student@estage-dz.com / Student@2024!\n');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
