import { config } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './config/db.js';
import { startAutoSubmitJob } from './jobs/autoSubmit.js';
import { createApp } from './app.js';
import { createRepositoryFactory } from './repositories/index.js';
import { seedRepositories } from './seed.js';

const repos = createRepositoryFactory();

if (config.REPOSITORY_DRIVER === 'mongo') await connectDatabase();

if (config.SEED_ON_START) {
  await seedRepositories(repos);
}

const app = createApp({ repos });
const server = app.listen(config.PORT, () => {
  console.log(`ExamGuard API listening on http://localhost:${config.PORT}/api/v1`);
});

const autoSubmitJob = startAutoSubmitJob(repos);

const shutdown = () => {
  autoSubmitJob.stop();
  server.close(async () => {
    if (config.REPOSITORY_DRIVER === 'mongo') await disconnectDatabase();
    process.exit(0);
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception thrown:', error);
  shutdown();
});
