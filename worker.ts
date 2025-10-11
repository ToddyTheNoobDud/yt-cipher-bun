import { preprocessPlayer } from "./ejs/src/solvers.ts";

self.onmessage = (e: MessageEvent<string>) => {
    try {
        const output = preprocessPlayer(e.data);
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
