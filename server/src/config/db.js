import mongoose from 'mongoose';

import { config } from './env.js';

mongoose.set('strictQuery', true);

export const connectDatabase = async ({ retries = 5, delayMs = 1000 } = {}) => {
  if (!config.MONGODB_URI) throw new Error('MONGODB_URI is required when REPOSITORY_DRIVER=mongo.');
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      return await mongoose.connect(config.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
    } catch (error) {
      lastError = error;
      if (attempt < retries) await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
    }
  }
  throw lastError;
};

export const disconnectDatabase = () => mongoose.disconnect();
