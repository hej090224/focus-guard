import type { TabUsageSession } from '../shared/types'

export const SESSION_STORAGE_KEY_PREFIX = 'focusGuardTabSession:'

export function getTabSessionKey(tabId: number): string {
  return `${SESSION_STORAGE_KEY_PREFIX}${tabId}`
}

function isTabUsageSession(value: unknown): value is TabUsageSession {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const session = value as Partial<TabUsageSession>

  return (
    typeof session.tabId === 'number' &&
    typeof session.hostname === 'string' &&
    typeof session.startedAt === 'number' &&
    typeof session.expiresAt === 'number' &&
    typeof session.isLimitExceeded === 'boolean' &&
    (typeof session.warningNotificationShownAt === 'undefined' ||
      typeof session.warningNotificationShownAt === 'number')
  )
}

export function readTabUsageSession(tabId: number): Promise<TabUsageSession | undefined> {
  const key = getTabSessionKey(tabId)

  return new Promise((resolve) => {
    chrome.storage.session.get(key, (items) => {
      if (chrome.runtime.lastError) {
        resolve(undefined)
        return
      }

      const session = items[key]

      resolve(isTabUsageSession(session) ? session : undefined)
    })
  })
}

export function writeTabUsageSession(session: TabUsageSession): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.session.set({ [getTabSessionKey(session.tabId)]: session }, () => resolve())
  })
}

export function removeTabUsageSession(tabId: number): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.session.remove(getTabSessionKey(tabId), () => resolve())
  })
}

export function readAllTabUsageSessions(): Promise<TabUsageSession[]> {
  return new Promise((resolve) => {
    chrome.storage.session.get(null, (items) => {
      if (chrome.runtime.lastError) {
        resolve([])
        return
      }

      resolve(
        Object.entries(items)
          .filter(([key]) => key.startsWith(SESSION_STORAGE_KEY_PREFIX))
          .map(([, value]) => value)
          .filter((value): value is TabUsageSession => isTabUsageSession(value)),
      )
    })
  })
}

export async function clearTabUsageSessions(): Promise<void> {
  const sessions = await readAllTabUsageSessions()
  const sessionKeys = sessions.map((session) => getTabSessionKey(session.tabId))

  if (sessionKeys.length === 0) {
    return
  }

  await new Promise<void>((resolve) => {
    chrome.storage.session.remove(sessionKeys, () => resolve())
  })
}
