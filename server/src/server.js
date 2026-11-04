import { createApp } from './app.js';
import { connectDatabase, disconnectDatabase } from './config/db.js';
import { config } from './config/env.js';
import { startAutoSubmitJob } from './jobs/autoSubmit.js';
import { createRepositoryFactory } from './repositories/index.js';
import { seedRepositories } from './seed.js';

const start = async () => {
  if (config.NODE_ENV === 'production' && config.REPOSITORY_DRIVER !== 'mongo') {
    throw new Error('Production requires REPOSITORY_DRIVER=mongo.');
  }

  if (config.REPOSITORY_DRIVER === 'mongo') {
    await connectDatabase();
  }

  const repos = createRepositoryFactory(config.REPOSITORY_DRIVER);

  if (config.SEED_ON_START) {
    if (config.NODE_ENV === 'production') {
      throw new Error('Refusing to seed database when NODE_ENV=production.');
    }
    await seedRepositories(repos);
  }

  const app = createApp({ repos });
  const cronTask = startAutoSubmitJob(repos);

  const server = app.listen(config.PORT, () => {
    console.log(
      `ExamGuard API listening on http://localhost:${config.PORT} (${config.NODE_ENV}, driver=${config.REPOSITORY_DRIVER})`,
    );
  });

  const shutdown = async (signal) => {
    console.log(`${signal} received, shutting down gracefully...`);
    cronTask?.stop?.();
    server.close(async () => {
      if (config.REPOSITORY_DRIVER === 'mongo') {
        await disconnectDatabase();
      }
      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
};

start().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
