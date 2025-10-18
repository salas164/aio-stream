import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDataFolder } from './general';
import { Template, TemplateSchema } from '../db/schemas';
import { ZodError } from 'zod';
import { formatZodError } from './config';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RESOURCE_DIR = path.join(__dirname, '../../../../', 'resources');

export class TemplateManager {
  private static templates: Template[] = [];

  static getTemplates(): Template[] {
    return TemplateManager.templates;
  }

  static loadTemplates(): {
    detected: number;
    loaded: number;
    errors: { file: string; error: string }[];
  } {
    const predefinedTemplatePath = path.join(RESOURCE_DIR, 'templates');
    const userTemplatesPath = path.join(getDataFolder(), 'templates');

    //  load all predefined templates first. look for all JSON files in the predefined template path.
    const predefinedTemplates = this.loadTemplatesFromPath(
      predefinedTemplatePath,
      true
    );
    const userTemplates = this.loadTemplatesFromPath(userTemplatesPath, false);
    this.templates = [
      ...predefinedTemplates.templates,
      ...userTemplates.templates,
    ];
    return {
      detected: predefinedTemplates.detected + userTemplates.detected,
      loaded: predefinedTemplates.loaded + userTemplates.loaded,
      errors: [...predefinedTemplates.errors, ...userTemplates.errors],
    };
  }

  private static loadTemplatesFromPath(
    dirPath: string,
    predefined: boolean
  ): {
    templates: Template[];
    detected: number;
    loaded: number;
    errors: { file: string; error: string }[];
  } {
    if (!fs.existsSync(dirPath)) {
      return { templates: [], detected: 0, loaded: 0, errors: [] };
    }
    const errors: { file: string; error: string }[] = [];
    const templates = fs.readdirSync(dirPath);
    const templateList: Template[] = [];
    for (const file of templates) {
      const filePath = path.join(dirPath, file);
      try {
        if (file.endsWith('.json')) {
          const template = TemplateSchema.parse(
            JSON.parse(fs.readFileSync(filePath, 'utf8'))
          );
          templateList.push({
            ...template,
            metadata: {
              ...template.metadata,
              predefined: predefined || false,
            },
          });
        }
      } catch (error) {
        errors.push({
          file: file,
          error:
            error instanceof ZodError
              ? `Failed to parse template: ${formatZodError(error)}`
              : `Failed to load template: ${error}`,
        });
      }
    }
    return {
      templates: templateList,
      detected: templates.length,
      loaded: templateList.length,
      errors,
    };
  }
}
