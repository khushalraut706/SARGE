require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/sar_platform');
  
  // Clear existing
  await User.deleteMany({});
  
  const users = [
    { name: 'Admin User', email: 'admin@sarplatform.com', password: 'Admin123!', role: 'admin', department: 'IT Security' },
    { name: 'Jane Analyst', email: 'analyst@sarplatform.com', password: 'Analyst123!', role: 'analyst', department: 'Compliance' },
    { name: 'Bob Supervisor', email: 'supervisor@sarplatform.com', password: 'Super123!', role: 'supervisor', department: 'AML Operations' },
  ];
  
  for (const u of users) {
    await User.create(u);
    console.log(`✅ Created user: ${u.email} (${u.role})`);
  }
  
  console.log('\n🎉 Seed complete! Login credentials:');
  users.forEach(u => console.log(`  ${u.role}: ${u.email} / ${u.password}`));
  
  process.exit(0);
}

seed().catch(err => { console.error(err); process.exit(1); });
