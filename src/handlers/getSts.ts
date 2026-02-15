import { getPlayerFilePath, getPlayerContent, getSts, setSts } from "../cacheManager.ts";
import type { StsRequest, StsResponse } from "../types.ts";
import { errorResponse, jsonResponse } from "../shared.ts";

const STS_REGEX = /(?:signatureTimestamp|sts):(\d+)/;

export const handleGetSts = async (req: Request): Promise<Response> => {
	let body: StsRequest;
	try {
		const text = await req.text();
		body = text ? JSON.parse(text) : {};
	} catch {
		return errorResponse("Invalid JSON body", 400);
	}

	const { player_url } = body;

	if (!player_url) return errorResponse("player_url is required", 400);

	let path: string;
	try {
		path = await getPlayerFilePath(player_url);
	} catch (err) {
		return errorResponse(err instanceof Error ? err.message : "Failed to resolve player file path", 500);
	}

	const cached = getSts(path);
	if (cached) {
		const res: StsResponse = { sts: cached };
		return jsonResponse(res);
	}

	let content: string;
	try {
		content = await getPlayerContent(path);
	} catch {
		return errorResponse("Failed to read player file", 500);
	}

	const match = content.match(STS_REGEX);
	if (!match?.[1]) return errorResponse("Timestamp not found in player script", 404);

	const sts = match[1];
	setSts(path, sts);

	const res: StsResponse = { sts };
	return jsonResponse(res);
};
