import { preprocessPlayer } from "./ejs/src/solvers.ts";
import type { Input, Output } from "./ejs/src/main.ts";

self.onmessage = async (e: MessageEvent<Input>) => {
    try {
        const input = e.data;
        let output: Output;

        if (input.type === 'player') {
            const preprocessed = preprocessPlayer(input.player);
            output = {
                type: 'result',
                preprocessed_player: input.output_preprocessed ? preprocessed : undefined,
                responses: []
            };
        } else if (input.type === 'preprocessed') {
            output = {
                type: 'result',
                preprocessed_player: input.preprocessed_player,
                responses: []
            };
        } else {
            throw new Error('Unsupported input type');
        }
        self.postMessage({ type: 'success', data: output });

    } catch (error) {
        const err = error as Error;

        self.postMessage({
            type: 'error',
            data: {
                message: err.message,
                stack: err.stack,
            }
        });
    }
};