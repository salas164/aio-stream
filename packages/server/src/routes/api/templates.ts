import { Router, Request, Response, NextFunction } from 'express';
import { createResponse } from '../../utils/responses.js';
import { APIError, constants, createLogger } from '@aiostreams/core';
import fs from 'fs/promises';
import path from 'path';

const router: Router = Router();
const logger = createLogger('server');

// Get templates directory from the workspace root
// Use process.cwd() which returns the directory from where the process was started
const TEMPLATES_DIR = path.join(process.cwd(), 'templates');

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Check if templates directory exists
    try {
      await fs.access(TEMPLATES_DIR);
    } catch {
      // Templates directory doesn't exist, return empty array
      return res.status(200).json(createResponse({ success: true, data: [] }));
    }

    // Read all files in templates directory
    const files = await fs.readdir(TEMPLATES_DIR);
    const templates = [];

    // Filter for JSON files and read them
    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          const filePath = path.join(TEMPLATES_DIR, file);
          const content = await fs.readFile(filePath, 'utf-8');
          const templateData = JSON.parse(content);

          // Extract metadata and create template object
          if (templateData.metadata) {
            templates.push({
              id: file.replace('.json', ''),
              name: templateData.metadata.name || file,
              description: templateData.metadata.description || '',
              author: templateData.metadata.author || 'Unknown',
              category: templateData.metadata.category || 'Custom',
              addons: templateData.metadata.addons || [],
              debridServices: templateData.metadata.debridServices || [],
              config: templateData.config,
            });
          }
        } catch (error: any) {
          logger.error(`Failed to parse template ${file}: ${error.message}`);
          // Skip invalid templates
        }
      }
    }

    res.status(200).json(createResponse({ success: true, data: templates }));
  } catch (error: any) {
    logger.error(`Failed to load templates: ${error.message}`);
    next(
      new APIError(constants.ErrorCode.INTERNAL_SERVER_ERROR, error.message)
    );
  }
});

export default router;

