import main, { type Input, type Output } from "./ejs/src/yt/solver/main.ts";

declare var self: Worker;

self.onmessage = async (e: MessageEvent<Input & { id: number }>) => {
	const { id, ...input } = e.data;
	try {
		const output = main(input as Input);
		// Use simple object fast path for postMessage
		self.postMessage({ type: "success", id, data: output });
	} catch (error) {
		const err = error as Error;
		// Use simple object fast path for postMessage
		self.postMessage({
			type: "error",
			id,
			data: { message: err.message, stack: err.stack },
		});
	}
};
