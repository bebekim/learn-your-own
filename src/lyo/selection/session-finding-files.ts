import { readFileSync } from 'node:fs';

export function findingFiles(paths: string[]) {
  return paths.map(path => {
    try {
      const bytes = readFileSync(path);
      if (bytes.length > 1024 * 1024) throw new Error('finding evidence files must be at most 1 MiB each');
      return { path, content: bytes.toString('base64') };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { path, content: null };
      throw error;
    }
  });
}
