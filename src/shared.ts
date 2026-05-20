export const errorResponse = (msg: string, status: number): Response =>
  Response.json({ error: msg }, { status })

export const jsonResponse = (data: unknown, status = 200): Response =>
  Response.json(data, { status })
