export const errorResponse = (msg: string, status: number): Response =>
	new Response(JSON.stringify({ error: msg }), {
		status,
		headers: { "Content-Type": "application/json" },
	});

export const jsonResponse = (data: unknown, status = 200): Response =>
	new Response(JSON.stringify(data), {
		status,
		headers: { "Content-Type": "application/json" },
	});
