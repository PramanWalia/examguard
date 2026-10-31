import bcrypt from 'bcrypt';

import { connectDatabase, disconnectDatabase } from './config/db.js';
import { config } from './config/env.js';
import { createRepositoryFactory } from './repositories/index.js';

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;

if (!email || !password || password.length < 8) {
  throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD (at least 8 characters) for this one-time command.');
}

if (config.REPOSITORY_DRIVER !== 'mongo') {
  throw new Error('The create-admin command requires REPOSITORY_DRIVER=mongo.');
}

await connectDatabase();
try {
  const repos = createRepositoryFactory('mongo');
  const existing = await repos.userRepo.findByEmail(email);
  const passwordHash = await bcrypt.hash(password, config.BCRYPT_ROUNDS);
  if (existing) {
    if (existing.role !== 'admin') throw new Error('A non-admin account already uses this email.');
    await repos.userRepo.updateById(existing.id, { passwordHash, isActive: true });
    console.log('Administrator password updated.');
  } else {
    await repos.userRepo.create({
      name: process.env.ADMIN_NAME?.trim() || 'System Administrator',
      email,
      passwordHash,
      role: 'admin',
      isActive: true,
    });
    console.log('Administrator created.');
  }
} finally {
  await disconnectDatabase();
}
