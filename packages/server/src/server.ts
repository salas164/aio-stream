import app from './app';

import {
  Env,
  createLogger,
  DB,
  UserRepository,
  logStartupInfo,
} from '@aiostreams/core';

const logger = createLogger('server');
const PORT = Number(process.env.PORT || Env.PORT || 3000);
const HOST = '0.0.0.0';

async function initialiseDatabase() {
  try {
    await DB.getInstance().initialise(Env.DATABASE_URI, []);
    logger.info('Database initialised');
  } catch (error) {
    logger.error('Failed to initialise database:', error);
    throw error;
  }
}

async function startAutoPrune() {
  try {
    if (Env.PRUNE_MAX_DAYS < 0) return;
    await UserRepository.pruneUsers(Env.PRUNE_MAX_DAYS);
  } catch {}
  setTimeout(startAutoPrune, Env.PRUNE_INTERVAL * 1000);
}

async function start() {
  try {
    await initialiseDatabase();

    if (Env.PRUNE_MAX_DAYS >= 0) {
      startAutoPrune();
    }

    logStartupInfo();

    // Bind to 0.0.0.0 so Render detects the port
    app.listen(PORT, HOST, () => {
      logger.info(`Server running on http://${HOST}:${PORT}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received. Shutting down gracefully...');
  await DB.getInstance().close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received. Shutting down gracefully...');
  await DB.getInstance().close();
  process.exit(0);
});

start().catch((error) => {
  logger.error('Failed to start server:', error);
  process.exit(1);
});
