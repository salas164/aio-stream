import app from './app';
import {
  Env,
  createLogger,
  DB,
  UserRepository,
  logStartupInfo,
} from '@aiostreams/core';

const logger = createLogger('server');

const PORT = Number(process.env.PORT) || Env.PORT || 10000;
const HOST = '0.0.0.0';

app.listen(PORT, HOST, () => {
  logger.info(`Server running on http://${HOST}:${PORT}`);
});
