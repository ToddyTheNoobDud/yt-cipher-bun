import main, { type Input, type Output } from './ejs/src/yt/solver/main.ts'
import { getFromPrepared } from './ejs/src/yt/solver/solvers.ts'

// biome-ignore lint/suspicious/noVar: declare var self is standard for Web Workers
declare var self: Worker

// biome-ignore lint/suspicious/noExplicitAny: solver cache holds functions of dynamic signatures
const solverCache = new Map<string, any>()

self.onmessage = async (
  e: MessageEvent<Input & { id: number; cacheKey?: string }>
) => {
  const { id, ...input } = e.data
  try {
    let output: Output
    const cacheKey = input.cacheKey

    if (cacheKey && solverCache.has(cacheKey)) {
      const solvers = solverCache.get(cacheKey)
      const responses = input.requests.map((req) => {
        const solver = solvers[req.type]
        if (!solver) {
          return {
            type: 'error' as const,
            error: `Failed to extract ${req.type} function`
          }
        }
        try {
          return {
            type: 'result' as const,
            data: Object.fromEntries(
              req.challenges.map((challenge) => [challenge, solver(challenge)])
            )
          }
        } catch (error) {
          return {
            type: 'error' as const,
            error:
              error instanceof Error
                ? `${error.message}\n${error.stack}`
                : `${error}`
          }
        }
      })
      output = {
        type: 'result',
        responses
      }
    } else {
      output = main(input as Input)
      if (cacheKey && output.type === 'result') {
        const preprocessedCode =
          input.type === 'preprocessed'
            ? input.preprocessed_player
            : output.preprocessed_player
        if (preprocessedCode) {
          try {
            const solvers = getFromPrepared(preprocessedCode)
            solverCache.set(cacheKey, solvers)
          } catch (err) {
            console.error('Worker failed to compile and cache solvers:', err)
          }
        }
      }
    }

    // Use simple object fast path for postMessage
    self.postMessage({ type: 'success', id, data: output })
  } catch (error) {
    const err = error as Error
    // Use simple object fast path for postMessage
    self.postMessage({
      type: 'error',
      id,
      data: { message: err.message, stack: err.stack }
    })
  }
}
