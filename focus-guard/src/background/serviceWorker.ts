import { SESSION_LIMIT_MS } from '../shared/constants'
import type { TabUsageSession } from '../shared/types'
import { getHostnameFromUrl, isBlockedHostname, shouldIgnoreUrl } from '../shared/url'
import { getSettings, SETTINGS_STORAGE_KEY } from '../storage/settingsStorage'

const SESSION_KEY_PREFIX = 'focusGuardTabSession:'
const ALARM_PREFIX = 'focusGuardSessionLimit:'
const BLOCKED_PAGE_PATH = 'blocked.html'

function getSessionKey(tabId: number): string {
  return `${SESSION_KEY_PREFIX}${tabId}`
}

function getAlarmName(tabId: number): string {
  return `${ALARM_PREFIX}${tabId}`
}

function getTabIdFromAlarmName(alarmName: string): number | null {
  if (!alarmName.startsWith(ALARM_PREFIX)) {
    return null
  }

  const tabId = Number(alarmName.slice(ALARM_PREFIX.length))
  return Number.isInteger(tabId) ? tabId : null
}

function readSession(tabId: number): Promise<TabUsageSession | undefined> {
  const key = getSessionKey(tabId)

  return new Promise((resolve) => {
    chrome.storage.session.get(key, (items) => {
      if (chrome.runtime.lastError) {
        resolve(undefined)
        return
      }

      resolve(items[key] as TabUsageSession | undefined)
    })
  })
}

function writeSession(session: TabUsageSession): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.session.set({ [getSessionKey(session.tabId)]: session }, () => resolve())
  })
}

function removeSession(tabId: number): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.session.remove(getSessionKey(tabId), () => resolve())
  })
}

function readAllSessions(): Promise<TabUsageSession[]> {
  return new Promise((resolve) => {
    chrome.storage.session.get(null, (items) => {
      if (chrome.runtime.lastError) {
        resolve([])
        return
      }

      const sessions = Object.entries(items)
        .filter(([key]) => key.startsWith(SESSION_KEY_PREFIX))
        .map(([, value]) => value)
        .filter((value): value is TabUsageSession => isTabUsageSession(value))

      resolve(sessions)
    })
  })
}

async function clearAllSessions(): Promise<void> {
  const sessions = await readAllSessions()
  const sessionKeys = sessions.map((session) => getSessionKey(session.tabId))

  sessions.forEach((session) => chrome.alarms.clear(getAlarmName(session.tabId)))

  if (sessionKeys.length === 0) {
    return
  }

  await new Promise<void>((resolve) => {
    chrome.storage.session.remove(sessionKeys, () => resolve())
  })
}

function scheduleLimitAlarm(tabId: number, expiresAt: number): void {
  chrome.alarms.clear(getAlarmName(tabId))
  chrome.alarms.create(getAlarmName(tabId), {
    when: expiresAt,
  })
}

function getTab(tabId: number): Promise<ChromeTab | undefined> {
  return new Promise((resolve) => {
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) {
        resolve(undefined)
        return
      }

      resolve(tab)
    })
  })
}

function getAllTabs(): Promise<ChromeTab[]> {
  return new Promise((resolve) => {
    chrome.tabs.query({}, (tabs) => {
      if (chrome.runtime.lastError) {
        resolve([])
        return
      }

      resolve(tabs)
    })
  })
}

function getExtensionOrigin(): string {
  return new URL(chrome.runtime.getURL('')).origin
}

function isBlockedPageUrl(url: string | undefined): boolean {
  if (!url) {
    return false
  }

  try {
    const currentUrl = new URL(url)
    const blockedPageUrl = new URL(chrome.runtime.getURL(BLOCKED_PAGE_PATH))

    return currentUrl.origin === blockedPageUrl.origin && currentUrl.pathname === blockedPageUrl.pathname
  } catch {
    return false
  }
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
    typeof session.isLimitExceeded === 'boolean'
  )
}

function createSession(tabId: number, hostname: string): TabUsageSession {
  const startedAt = Date.now()

  return {
    tabId,
    hostname,
    startedAt,
    expiresAt: startedAt + SESSION_LIMIT_MS,
    isLimitExceeded: false,
  }
}

function markLimitExceeded(session: TabUsageSession): TabUsageSession {
  if (session.isLimitExceeded) {
    return session
  }

  return {
    ...session,
    isLimitExceeded: true,
    limitExceededAt: Date.now(),
  }
}

function logLimitExceeded(session: TabUsageSession): void {
  console.info('[FocusGuard] Site session limit exceeded', {
    tabId: session.tabId,
    hostname: session.hostname,
    startedAt: session.startedAt,
    limitExceededAt: session.limitExceededAt,
  })
}

async function redirectToBlockedPage(session: TabUsageSession): Promise<void> {
  const tab = await getTab(session.tabId)

  if (!tab || isBlockedPageUrl(tab.url) || getHostnameFromUrl(tab.url) !== session.hostname) {
    await removeSession(session.tabId)
    chrome.alarms.clear(getAlarmName(session.tabId))
    return
  }

  const params = new URLSearchParams({
    site: session.hostname,
  })

  await removeSession(session.tabId)
  chrome.alarms.clear(getAlarmName(session.tabId))
  chrome.tabs.update(
    session.tabId,
    {
      url: chrome.runtime.getURL(`${BLOCKED_PAGE_PATH}?${params.toString()}`),
    },
    () => {
      if (chrome.runtime.lastError) {
        console.info('[FocusGuard] Block redirect skipped', chrome.runtime.lastError.message)
      }
    },
  )
}

async function refreshOpenTabs(): Promise<void> {
  const tabs = await getAllTabs()

  await Promise.all(
    tabs.map(async (tab) => {
      if (typeof tab.id !== 'number') {
        return
      }

      await handleTabUrl(tab.id, tab.url)
    }),
  )
}

async function handleSettingsChange(): Promise<void> {
  const settings = await getSettings()

  await clearAllSessions()

  if (!settings.focusModeEnabled || settings.blockedSites.length === 0) {
    return
  }

  await refreshOpenTabs()
}

async function handleTabUrl(tabId: number, url: string | undefined): Promise<void> {
  if (isBlockedPageUrl(url) || shouldIgnoreUrl(url, getExtensionOrigin())) {
    chrome.alarms.clear(getAlarmName(tabId))
    await removeSession(tabId)
    return
  }

  const hostname = getHostnameFromUrl(url)

  if (hostname === null) {
    chrome.alarms.clear(getAlarmName(tabId))
    await removeSession(tabId)
    return
  }

  const settings = await getSettings()

  if (!settings.focusModeEnabled) {
    await clearAllSessions()
    return
  }

  if (settings.blockedSites.length === 0 || !isBlockedHostname(hostname, settings.blockedSites)) {
    chrome.alarms.clear(getAlarmName(tabId))
    await removeSession(tabId)
    return
  }

  const previousSession = await readSession(tabId)
  const session =
    previousSession?.hostname === hostname
      ? previousSession
      : createSession(tabId, hostname)

  const elapsedMs = Date.now() - session.startedAt

  if (elapsedMs >= SESSION_LIMIT_MS) {
    const exceededSession = markLimitExceeded(session)

    await writeSession(exceededSession)
    logLimitExceeded(exceededSession)
    await redirectToBlockedPage(exceededSession)
    return
  }

  await writeSession(session)
  scheduleLimitAlarm(tabId, session.expiresAt)
}

chrome.runtime.onInstalled.addListener(() => {
  void getSettings()
})

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local' || !changes[SETTINGS_STORAGE_KEY]) {
    return
  }

  void handleSettingsChange()
})

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading' || changeInfo.status === 'complete' || changeInfo.url) {
    void handleTabUrl(tabId, tab.url ?? changeInfo.url)
  }
})

chrome.tabs.onActivated.addListener(({ tabId }) => {
  void getTab(tabId).then((tab) => {
    void handleTabUrl(tabId, tab?.url)
  })
})

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.alarms.clear(getAlarmName(tabId))
  void removeSession(tabId)
})

chrome.alarms.onAlarm.addListener((alarm) => {
  const tabId = getTabIdFromAlarmName(alarm.name)

  if (tabId === null) {
    return
  }

  void getTab(tabId).then((tab) => {
    void handleTabUrl(tabId, tab?.url)
  })
})
