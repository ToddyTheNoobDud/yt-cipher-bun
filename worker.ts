import main, { type Input } from "./ejs/src/yt/solver/main.ts";

self.onmessage = async (e: MessageEvent<Input & { id: number }>) => {
	const { id, ...input } = e.data;
	try {
		const output = main(input as Input);
		self.postMessage({ type: "success", id, data: output });
	} catch (error) {
		const err = error as Error;
		self.postMessage({
			type: "error",
			id,
			data: {
				message: err.message,
				stack: err.stack,
			},
		});
	}
};
