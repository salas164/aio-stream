// looks at Env.ALIASED_CONFIGURATIONS and then redirects to /stremio/{uuid}/{encryptedPassword} after parsing the alias value

import { APIError, constants, createLogger, Env } from '@aiostreams/core';
import { Router, Request, Response } from 'express';
import { createResponse } from '../../utils/responses';

const logger = createLogger('server');
const router: Router = Router();

interface AliasParams {
  alias: string;
  [key: string]: string;
}

router.get(
  '/:alias/*wildcardPath',
  (req: Request<AliasParams>, res: Response) => {
    const { alias } = req.params;
    let { wildcardPath } = req.params;
    if (Array.isArray(wildcardPath)) {
      wildcardPath = wildcardPath.join('/');
    }

    const configuration = Env.ALIASED_CONFIGURATIONS[alias];
    if (!configuration || !configuration.uuid || !configuration.password) {
      throw new APIError(constants.ErrorCode.USER_INVALID_DETAILS);
    }

    const redirectPath = `/stremio/${configuration.uuid}/${configuration.password}${wildcardPath ? `/${wildcardPath}` : ''}`;
    logger.debug(`Redirecting alias ${alias} to ${redirectPath}`);

    res.redirect(redirectPath);
  }
);

export default router;
