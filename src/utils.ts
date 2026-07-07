const HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com'])
const PATH_PREFIX = '/s/player/'

/** Map embed player variant to TV variant for TVHTML5 client support */
const VARIANT_MAP: Record<string, string> = {
  'player_embed.vflset': 'player_ias.vflset/en_US/base.js',
  'player_ias.vflset': 'player_ias.vflset/en_US/base.js',
  'player_es6.vflset': 'player_es6.vflset/en_US/base.js'
}

const forcePlayerPath = (pathname: string): string => {
  if (!pathname.startsWith(PATH_PREFIX))
    throw new Error(`Invalid player path: ${pathname}`)

  const parts = pathname.split('/')
  if (parts.length < 5 || parts[1] !== 's' || parts[2] !== 'player') {
    throw new Error(`Invalid player path: ${pathname}`)
  }

  const playerId = parts[3]
  const variant = parts[4]

  if (variant && VARIANT_MAP[variant]) {
    return `/${['s', 'player', playerId, VARIANT_MAP[variant]].join('/')}`
  }

  // Default to IAS for unknown variants
  return `/${['s', 'player', playerId, 'player_ias.vflset', 'en_US', 'base.js'].join('/')}`
}

export const validateUrl = (url: string): string => {
  if (url.startsWith('/')) {
    const normalized = new URL(`https://www.youtube.com${url}`)
    normalized.pathname = forcePlayerPath(normalized.pathname)
    return normalized.toString()
  }

  try {
    const parsed = new URL(url)
    if (!HOSTS.has(parsed.hostname))
      throw new Error(`Player URL from invalid host: ${parsed.hostname}`)
    parsed.pathname = forcePlayerPath(parsed.pathname)
    return parsed.toString()
  } catch {
    throw new Error(`Invalid player URL: ${url}`)
  }
}

export function extractPlayerId(playerUrl: string): string {
  try {
    const url = new URL(playerUrl)
    const pathParts = url.pathname.split('/')
    const playerIndex = pathParts.indexOf('player')
    if (playerIndex !== -1 && playerIndex + 1 < pathParts.length) {
      return pathParts[playerIndex + 1]
    }
  } catch {
    const match = playerUrl.match(/\/s\/player\/([^/]+)/)
    if (match) {
      return match[1]
    }
  }
  return 'unknown'
}
