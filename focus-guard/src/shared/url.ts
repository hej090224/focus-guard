export function normalizeHostname(input: string): string | null {
  const trimmed = input.trim().toLowerCase()

  if (trimmed.length === 0) {
    return null
  }

  const candidate = trimmed.includes('://') ? trimmed : `https://${trimmed}`

  try {
    const { hostname } = new URL(candidate)
    return hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

export function getHostnameFromUrl(url: string | undefined): string | null {
  if (!url) {
    return null
  }

  try {
    const { hostname, protocol } = new URL(url)

    if (protocol !== 'http:' && protocol !== 'https:') {
      return null
    }

    return hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

export function isBlockedHostname(hostname: string, blockedSites: string[]): boolean {
  return blockedSites.some((site) => hostname === site || hostname.endsWith(`.${site}`))
}
