// utils.ts - Optimized URL validation with Set lookup
const HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com']);
const PATH_PREFIX = '/s/player/';

export const validateUrl = (url: string): string => {
  if (url.startsWith('/')) {
    if (!url.startsWith(PATH_PREFIX)) throw new Error(`Invalid player path: ${url}`);
    return `https://www.youtube.com${url}`;
  }

  try {
    const parsed = new URL(url);
    if (!HOSTS.has(parsed.hostname)) throw new Error(`Player URL from invalid host: ${parsed.hostname}`);
    return url;
  } catch {
    throw new Error(`Invalid player URL: ${url}`);
  }
};

export function extractPlayerId(playerUrl: string): string {
    try {
        const url = new URL(playerUrl);
        const pathParts = url.pathname.split('/');
        const playerIndex = pathParts.indexOf('player');
        if (playerIndex !== -1 && playerIndex + 1 < pathParts.length) {
            return pathParts[playerIndex + 1];
        }
    } catch (e) {
        // Fallback for relative paths
        const match = playerUrl.match(/\/s\/player\/([^\/]+)/);
        if (match) {
            return match[1];
        }
    }
    return 'unknown';
}
