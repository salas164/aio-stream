import { Router, Request, Response, NextFunction } from 'express';
import { createResponse } from '../../utils/responses';
import {
  createLogger,
  UserData,
  UserDataSchema,
  formatZodError,
} from '@aiostreams/core';
import {
  createFormatter,
  ParsedStreamSchema,
  APIError,
} from '@aiostreams/core';
import * as constants from '@aiostreams/core';
import { formatApiRateLimiter } from '../../middlewares/ratelimit';

const router: Router = Router();

router.use(formatApiRateLimiter);

const logger = createLogger('server');

router.post('/', (req: Request, res: Response) => {
  const { userData, stream } = req.body;
  const {
    success: streamSuccess,
    error: streamError,
    data: streamData,
  } = ParsedStreamSchema.safeParse(stream);
  if (!streamSuccess) {
    logger.error('Invalid stream', { error: streamError });
    throw new APIError(
      constants.ErrorCode.FORMAT_INVALID_STREAM,
      400,
      formatZodError(streamError)
    );
  }
  const {
    success: userDataSuccess,
    error: userDataError,
    data: userDataData,
  } = UserDataSchema.safeParse(userData);
  if (!userDataSuccess) {
    logger.error('Invalid user data', { error: userDataError });
    throw new APIError(
      constants.ErrorCode.FORMAT_INVALID_FORMATTER,
      400,
      formatZodError(userDataError)
    );
  }
  const formattedStream = createFormatter(userDataData).format(streamData);
  res
    .status(200)
    .json(createResponse({ success: true, data: formattedStream }));
});

export default router;
