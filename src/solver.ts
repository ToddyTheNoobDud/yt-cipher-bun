// solver.ts - Get solver functions from player scripts
import main from '../ejs/src/main.ts';
import { getPlayerFilePath, getPlayerContent } from './cacheManager.ts';
import { preprocessedCache } from './processedCache.ts';
import { solverCache } from './solverCache.ts';
import type { Solvers } from './types.ts';

export async function getSolvers(player_url: string): Promise<Solvers | null> {
    const playerCacheKey = await getPlayerFilePath(player_url);

    let solvers = solverCache.get(playerCacheKey);

    if (solvers) {
        return solvers;
    }

    let preprocessedPlayer = await preprocessedCache.get(playerCacheKey);
    if (!preprocessedPlayer) {
        // For now, we'll use the main function directly
        // In a full implementation, you'd want to use the worker pool here
        try {
          const playerContent = await getPlayerContent(playerCacheKey);
          const input = {
            type: 'player' as const,
            player: playerContent,
            output_preprocessed: true,
            requests: [
              { type: 'sig' as const, challenges: ['test'] },
              { type: 'nsig' as const, challenges: ['test'] }
            ]
          };

          const output = main(input);

          if (output.type === 'error') return null;

          if (output.preprocessed_player) {
            preprocessedPlayer = output.preprocessed_player;
            await preprocessedCache.set(playerCacheKey, preprocessedPlayer);
          }
        } catch {
          return null;
        }
    }

    if (preprocessedPlayer) {
        try {
          // Extract solvers from preprocessed player
          // This is a simplified approach - you'd need proper extraction logic
          solvers = {
            n: (val: string) => val, // Placeholder
            sig: (val: string) => val // Placeholder
          };
          solverCache.set(playerCacheKey, solvers);
          return solvers;
        } catch {
          return null;
        }
    }

    return null;
}
