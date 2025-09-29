const ALLOWED_HOSTNAMES = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com']);
const PLAYER_PATH_PREFIX = '/s/player/';

export const validateAndNormalizePlayerUrl = (playerUrl: string): string => {
  if (playerUrl.startsWith('/')) {
    if (!playerUrl.startsWith(PLAYER_PATH_PREFIX)) {
      throw new Error(`Invalid player path: ${playerUrl}`);
    }
    return `https://www.youtube.com${playerUrl}`;
  }

  try {
    const url = new URL(playerUrl);
    if (!ALLOWED_HOSTNAMES.has(url.hostname)) {
      throw new Error(`Player URL from invalid host: ${url.hostname}`);
    }
    return playerUrl;
  } catch {
    throw new Error(`Invalid player URL: ${playerUrl}`);
  }
};