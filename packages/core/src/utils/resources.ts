import fs from 'fs';
import path from 'path';

export class ResourceManager {
  static getResource(resourceName: string) {
    // check existence
    const filePath = path.join(
      __dirname,
      '../../../../',
      'resources',
      resourceName
    );
    if (!fs.existsSync(filePath)) {
      console.warn(`Resource ${resourceName} not found at ${filePath}`);
      return undefined;
    }
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }
}
