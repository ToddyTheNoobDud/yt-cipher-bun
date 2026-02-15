import { execInPool } from "../workerPool.ts";
import { getPlayerFilePath, getPlayerContent, getPreprocessed, setPreprocessed } from "../cacheManager.ts";
import type { ResolveUrlRequest, ResolveUrlResponse } from "../types.ts";
import { errorResponse, jsonResponse } from "../shared.ts";
import { validateUrl } from "../utils.ts";

const _decrypt = async (
	playerUrl: string,
	requests: Array<{ type: "sig" | "n"; challenges: string[] }>,
): Promise<{
	responses: Array<{ type: string; data: Record<string, string> }>;
	preprocessedPlayer?: string;
} | null> => {
	let path: string;
	try {
		path = await getPlayerFilePath(playerUrl);
	} catch (e) {
		console.error("getPlayerFilePath failed:", e);
		return null;
	}

	const preprocessed = await getPreprocessed(path);
	let player: string | undefined;

	if (!preprocessed) {
		try {
			player = await getPlayerContent(path);
		} catch (e) {
			console.error("getPlayerContent failed:", e);
			return null;
		}
	}

	try {
		const input = preprocessed
			? {
					type: "preprocessed" as const,
					preprocessed_player: preprocessed,
					requests,
				}
			: {
					type: "player" as const,
					player: player!,
					output_preprocessed: true,
					requests,
				};

		const output = await execInPool(input);

		if (output.type === "error") return null;

		if (output.preprocessed_player && !preprocessed) {
			await setPreprocessed(path, output.preprocessed_player);
		}

		return {
			responses: (output.responses || []) as any[],
			preprocessedPlayer: output.preprocessed_player,
		};
	} catch (error) {
		console.error("Error in decrypt:", error);
		return null;
	}
};

export const handleResolveUrl = async (req: Request): Promise<Response> => {
	let body: ResolveUrlRequest;
	try {
		const rawText = await req.text();
		body = rawText ? JSON.parse(rawText) : {};
	} catch {
		return errorResponse("Invalid JSON body", 400);
	}

	const { stream_url, player_url, encrypted_signature, signature_key, n_param: nParamFromRequest } = body;

	if (!stream_url) return errorResponse("stream_url is required", 400);
	if (!player_url) return errorResponse("player_url is required", 400);

	let normalizedPlayerUrl: string;
	try {
		normalizedPlayerUrl = validateUrl(player_url);
	} catch (e) {
		return errorResponse(e instanceof Error ? e.message : "Invalid player_url format", 400);
	}

	let url: URL;
	try {
		url = new URL(stream_url);
	} catch {
		return errorResponse("Invalid stream_url format", 400);
	}

	const nParam = nParamFromRequest || url.searchParams.get("n") || null;
	const requests: Array<{ type: "sig" | "n"; challenges: string[] }> = [];

	if (encrypted_signature) {
		requests.push({ type: "sig", challenges: [encrypted_signature] });
	}
	if (nParam) {
		requests.push({ type: "n", challenges: [nParam] });
	}

	if (requests.length === 0) {
		const response: ResolveUrlResponse = { resolved_url: url.toString() };
		return jsonResponse(response);
	}
	const result = await _decrypt(normalizedPlayerUrl, requests);

	if (!result) {
		return errorResponse("Failed to decrypt signature/n parameter", 500);
	}

	for (const response of result.responses) {
		if (response.type !== "result") continue;

		if (encrypted_signature && encrypted_signature in response.data) {
			const sigKey = signature_key || "sig";
			url.searchParams.set(sigKey, response.data[encrypted_signature]);
			url.searchParams.delete("s");
		}

		if (nParam && nParam in response.data) {
			url.searchParams.set("n", response.data[nParam]);
		}
	}

	const responseData: ResolveUrlResponse = { resolved_url: url.toString() };
	return jsonResponse(responseData);
};
