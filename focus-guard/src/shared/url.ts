export function normalizeHostname(input: string): string | null {
  const trimmed = input.trim().toLowerCase()

  if (trimmed.length === 0) {
    return null
  }

  const candidate = trimmed.includes('://') ? trimmed : `https://${trimmed}`

  try {
    const { hostname, protocol } = new URL(candidate)
    const normalizedHostname = hostname.replace(/^www\./, '').replace(/\.$/, '')

    if (
      normalizedHostname.length === 0 ||
      (protocol !== 'http:' && protocol !== 'https:') ||
      isLocalhost(normalizedHostname)
    ) {
      return null
    }

    return normalizedHostname
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

    return hostname.replace(/^www\./, '').replace(/\.$/, '')
  } catch {
    return null
  }
}

export function isBlockedHostname(hostname: string, blockedSites: string[]): boolean {
  return getMatchingBlockedSite(hostname, blockedSites) !== null
}

export function getMatchingBlockedSite(hostname: string, blockedSites: string[]): string | null {
  return blockedSites.find((site) => hostname === site || hostname.endsWith(`.${site}`)) ?? null
}

export function isLocalhost(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname === '::1' ||
    hostname === '[::1]'
  )
}

export function shouldIgnoreUrl(url: string | undefined, extensionOrigin: string): boolean {
  if (!url) {
    return true
  }

  try {
    const parsedUrl = new URL(url)

    if (parsedUrl.origin === extensionOrigin) {
      return true
    }

    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return true
    }

    return isLocalhost(parsedUrl.hostname)
  } catch {
    return true
  }
}
