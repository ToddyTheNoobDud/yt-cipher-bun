const HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com"]);
const PATH_PREFIX = "/s/player/";
const IAS_PLAYER_PATH = ["player_ias.vflset", "en_US", "base.js"];

const forcePlayerPath = (pathname: string): string => {
	if (!pathname.startsWith(PATH_PREFIX)) throw new Error(`Invalid player path: ${pathname}`);

	const parts = pathname.split("/");
	if (parts.length < 5 || parts[1] !== "s" || parts[2] !== "player") {
		throw new Error(`Invalid player path: ${pathname}`);
	}

	return `/${["s", "player", parts[3], ...IAS_PLAYER_PATH].join("/")}`;
};

export const validateUrl = (url: string): string => {
	if (url.startsWith("/")) {
		const normalized = new URL(`https://www.youtube.com${url}`);
		normalized.pathname = forcePlayerPath(normalized.pathname);
		return normalized.toString();
	}

	try {
		const parsed = new URL(url);
		if (!HOSTS.has(parsed.hostname)) throw new Error(`Player URL from invalid host: ${parsed.hostname}`);
		parsed.pathname = forcePlayerPath(parsed.pathname);
		return parsed.toString();
	} catch {
		throw new Error(`Invalid player URL: ${url}`);
	}
};

export function extractPlayerId(playerUrl: string): string {
	try {
		const url = new URL(playerUrl);
		const pathParts = url.pathname.split("/");
		const playerIndex = pathParts.indexOf("player");
		if (playerIndex !== -1 && playerIndex + 1 < pathParts.length) {
			return pathParts[playerIndex + 1];
		}
	} catch {
		const match = playerUrl.match(/\/s\/player\/([^/]+)/);
		if (match) {
			return match[1];
		}
	}
	return "unknown";
}
