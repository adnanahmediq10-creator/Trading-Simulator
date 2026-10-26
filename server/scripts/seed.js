/**
 * seed.js — creates a demo user (demo@example.com) if SEED_DEMO_USER=true.
 * Run with: npm run seed -w server
 *
 * Only runs when SEED_DEMO_USER=true in .env.
 * Idempotent: does nothing if the user already exists.
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { User } from '../src/models/User.js';
import { env } from '../src/config/env.js';

const DEMO_EMAIL = 'demo@example.com';
const DEMO_PASSWORD = 'Demo1234';
const DEMO_NAME = 'Demo Trader';

async function seed() {
  if (env.SEED_DEMO_USER !== true && process.env.SEED_DEMO_USER !== 'true') {
    console.log('SEED_DEMO_USER is not true — skipping seed. Set SEED_DEMO_USER=true to run.');
    process.exit(0);
  }

  console.log('Connecting to MongoDB…');
  await mongoose.connect(env.MONGODB_URI);
  console.log('Connected.');

  const existing = await User.findOne({ email: DEMO_EMAIL }).lean();
  if (existing) {
    console.log(`Demo user already exists: ${DEMO_EMAIL} — nothing to do.`);
    await mongoose.disconnect();
    process.exit(0);
  }

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  await User.create({
    email: DEMO_EMAIL,
    name: DEMO_NAME,
    passwordHash,
    cashPaise: env.STARTING_CASH_PAISE,
    reservedCashPaise: 0,
    startingCashPaise: env.STARTING_CASH_PAISE,
  });

  console.log(`✅ Demo user created:`);
  console.log(`   Email:    ${DEMO_EMAIL}`);
  console.log(`   Password: ${DEMO_PASSWORD}`);
  console.log(`   Cash:     ₹${(env.STARTING_CASH_PAISE / 100).toLocaleString('en-IN')}`);

  await mongoose.disconnect();
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
