import fs from 'fs/promises';
import path from 'path';

const WORKSPACE_ROOT = process.env['WORKSPACE_ROOT'] ?? '/workspace';

function safePath(relativePath: string): string {
  const resolved = path.resolve(WORKSPACE_ROOT, relativePath);
  if (!resolved.startsWith(WORKSPACE_ROOT)) {
    throw new Error(`Path traversal denied: ${relativePath}`);
  }
  return resolved;
}

export async function writeFile(filePath: string, content: string): Promise<void> {
  const abs = safePath(filePath);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, content, 'utf-8');
}

export async function readFile(filePath: string): Promise<string> {
  return fs.readFile(safePath(filePath), 'utf-8');
}

export async function deleteFile(filePath: string): Promise<void> {
  await fs.rm(safePath(filePath), { force: true });
}

export async function listFiles(dirPath: string): Promise<string[]> {
  const abs = safePath(dirPath);
  const entries = await fs.readdir(abs, { withFileTypes: true, recursive: true });
  return entries
    .filter((e) => e.isFile())
    .map((e) => path.relative(WORKSPACE_ROOT, path.join(e.path ?? abs, e.name)));
}
