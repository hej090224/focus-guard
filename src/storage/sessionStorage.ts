import type { TabUsageSession } from '../shared/types'

export const SESSION_STORAGE_KEY_PREFIX = 'focusGuardTabSession:'

export function getTabSessionKey(tabId: number): string {
  return `${SESSION_STORAGE_KEY_PREFIX}${tabId}`
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isOptionalFiniteNumber(value: unknown): value is number | undefined {
  return typeof value === 'undefined' || isFiniteNumber(value)
}

function isTabUsageSession(value: unknown): value is TabUsageSession {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const session = value as Partial<TabUsageSession>

  return (
    isFiniteNumber(session.tabId) &&
    Number.isInteger(session.tabId) &&
    typeof session.hostname === 'string' &&
    session.hostname.length > 0 &&
    isFiniteNumber(session.startedAt) &&
    isFiniteNumber(session.expiresAt) &&
    session.expiresAt > session.startedAt &&
    isFiniteNumber(session.limitMinutes) &&
    Number.isInteger(session.limitMinutes) &&
    typeof session.isLimitExceeded === 'boolean' &&
    isOptionalFiniteNumber(session.warningNotificationShownAt) &&
    isOptionalFiniteNumber(session.limitExceededAt)
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
