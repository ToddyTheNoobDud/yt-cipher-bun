import { join } from 'path';
import fs from 'fs/promises';

export const CACHE_DIR = join(process.cwd(), 'player_cache');

const hashCache = new Map<string, string>();

const _computeHash = async (playerUrl: string): Promise<string> => {
  const cached = hashCache.get(playerUrl);
  if (cached) return cached;

  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(playerUrl));
  const hash = Array.from(new Uint8Array(buffer), b => b.toString(16).padStart(2, '0')).join('');

  hashCache.set(playerUrl, hash);
  if (hashCache.size > 200) {
    const firstKey = hashCache.keys().next().value;
    hashCache.delete(firstKey);
  }

  return hash;
};

export async function getPlayerFilePath(playerUrl: string): Promise<string> {
  const hash = await _computeHash(playerUrl);
  const filePath = join(CACHE_DIR, `${hash}.js`);

  try {
    await fs.access(filePath);
    return filePath;
  } catch {
    const response = await fetch(playerUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch player: ${response.statusText}`);
    }

    const content = await response.text();
    await fs.writeFile(filePath, content, 'utf8');
    return filePath;
  }
}

export async function initializeCache(): Promise<void> {
  await fs.mkdir(CACHE_DIR, { recursive: true });
}