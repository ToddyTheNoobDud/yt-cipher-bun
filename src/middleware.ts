import { validateUrl } from "./utils.ts";
import { errorResponse } from "./shared.ts";

type Next = (req: Request) => Promise<Response>;

interface RateLimit {
	c: number;
	r: number;
}

const RATE_MAP = new Map<string, RateLimit>();
const MAX_REQ = 100;
const WINDOW = 60000;
const CLEANUP_INT = 300000;

const _getClient = (req: Request): string =>
	req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
	req.headers.get("x-real-ip") ||
	req.headers.get("cf-connecting-ip") ||
	"unknown";

const _cleanup = (): void => {
	const now = Date.now();
	for (const [key, entry] of RATE_MAP) {
		if (now > entry.r) RATE_MAP.delete(key);
	}
};

const timer = setInterval(_cleanup, CLEANUP_INT);
if (timer.unref) timer.unref();

const _isLimited = (id: string): boolean => {
	const now = Date.now();
	const entry = RATE_MAP.get(id);

	if (!entry || now > entry.r) {
		RATE_MAP.set(id, { c: 1, r: now + WINDOW });
		return false;
	}

	if (entry.c >= MAX_REQ) return true;
	entry.c++;
	return false;
};

export const withValidation = (handler: Next): Next => {
	return async (req: Request): Promise<Response> => {
		const id = _getClient(req);
		if (_isLimited(id)) return errorResponse("Rate limit exceeded", 429);

		if (req.method !== "POST") return handler(req);

		const requestUrl = new URL(req.url);
		if (requestUrl.pathname === "/resolve_url") {
			return handler(req);
		}

		let body: Record<string, unknown>;
		try {
			const text = await req.text();
			body = text ? JSON.parse(text) : {};
		} catch {
			return errorResponse("Invalid JSON body", 400);
		}

		if (!body.player_url) return errorResponse("player_url is required", 400);

		let validatedUrl: string;
		try {
			validatedUrl = validateUrl(body.player_url as string);
		} catch (error) {
			return errorResponse(error instanceof Error ? error.message : "Invalid player URL", 400);
		}

		const newReq = new Request(req.url, {
			method: req.method,
			headers: req.headers,
			body: JSON.stringify({ ...body, player_url: validatedUrl }),
		});

		return handler(newReq);
	};
};
