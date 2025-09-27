import type { Input as MainInput } from "../../ejs/src/main.ts";
import { execInPool } from "../workerPool.ts";
import { getPlayerFilePath } from "../playerCache.ts";
import { preprocessedCache } from "../processedCache.ts";
import type { SignatureRequest, SignatureResponse } from "../types.ts";
import fs from "fs/promises";
export async function handleDecryptSignature(req: Request): Promise<Response> {

    let body: any;
    try {
        const text = await req.text();
        body = text ? JSON.parse(text) : {};
    } catch (err) {
        return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
        });
    }

    const { encrypted_signature, n_param, player_url } = body as SignatureRequest;

    if (!player_url) {
        return new Response(JSON.stringify({ error: "player_url is required" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
        });
    }

    let playerFilePath: string;
    try {
        playerFilePath = await getPlayerFilePath(player_url);
    } catch (err) {
        return new Response(JSON.stringify({ error: "Failed to resolve player file path" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }

    const cachedPreprocessedPlayer = preprocessedCache.get(playerFilePath);

    let player: string;
    try {
        player = await fs.readFile(playerFilePath, "utf8");
    } catch (err) {
        return new Response(JSON.stringify({ error: "Failed to read player file" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }

    const mainInput: MainInput = cachedPreprocessedPlayer
        ? {
            type: "preprocessed",
            preprocessed_player: cachedPreprocessedPlayer,
            requests: [
                { type: "sig", challenges: encrypted_signature ? [encrypted_signature] : [] },
                { type: "nsig", challenges: n_param ? [n_param] : [] },
            ],
        }
        : {
            type: "player",
            player,
            output_preprocessed: true,
            requests: [
                { type: "sig", challenges: encrypted_signature ? [encrypted_signature] : [] },
                { type: "nsig", challenges: n_param ? [n_param] : [] },
            ],
        };

    const output = await execInPool(mainInput);

    if (output.type === "error") {
        return new Response(JSON.stringify({ error: output.error }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }

    if (output.preprocessed_player && !cachedPreprocessedPlayer) {
        preprocessedCache.set(playerFilePath, output.preprocessed_player);
        console.log(`Cached preprocessed player for: ${player_url}`);
    }

    let decrypted_signature = "";
    let decrypted_n_sig = "";

    for (const r of output.responses || []) {
        if (r.type === "result") {
            if (encrypted_signature && encrypted_signature in r.data) {
                decrypted_signature = r.data[encrypted_signature];
            }
            if (n_param && n_param in r.data) {
                decrypted_n_sig = r.data[n_param];
            }
        }
    }

    const response: SignatureResponse = {
        decrypted_signature,
        decrypted_n_sig,
    };

    return new Response(JSON.stringify(response), { status: 200, headers: { "Content-Type": "application/json" } });
}
