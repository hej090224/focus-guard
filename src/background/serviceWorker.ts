import { SESSION_LIMIT_MS, SESSION_WARNING_THRESHOLD_MS } from '../shared/constants'
import type { TabUsageSession } from '../shared/types'
import { getHostnameFromUrl, isBlockedHostname, shouldIgnoreUrl } from '../shared/url'
import { getSettings, SETTINGS_STORAGE_KEY } from '../storage/settingsStorage'
import {
  clearTabUsageSessions,
  readAllTabUsageSessions,
  readTabUsageSession,
  removeTabUsageSession,
  writeTabUsageSession,
} from '../storage/sessionStorage'

const ALARM_PREFIX = 'focusGuardSessionLimit:'
const WARNING_ALARM_PREFIX = 'focusGuardSessionWarning:'
const BLOCKED_PAGE_PATH = 'blocked.html'

function getAlarmName(tabId: number): string {
  return `${ALARM_PREFIX}${tabId}`
}

function getWarningAlarmName(tabId: number): string {
  return `${WARNING_ALARM_PREFIX}${tabId}`
}

function getTabIdFromAlarmName(alarmName: string): number | null {
  if (!alarmName.startsWith(ALARM_PREFIX)) {
    return null
  }

  const tabId = Number(alarmName.slice(ALARM_PREFIX.length))
  return Number.isInteger(tabId) ? tabId : null
}

function getTabIdFromWarningAlarmName(alarmName: string): number | null {
  if (!alarmName.startsWith(WARNING_ALARM_PREFIX)) {
    return null
  }

  const tabId = Number(alarmName.slice(WARNING_ALARM_PREFIX.length))
  return Number.isInteger(tabId) ? tabId : null
}

function clearSessionAlarms(tabId: number): void {
  chrome.alarms.clear(getAlarmName(tabId))
  chrome.alarms.clear(getWarningAlarmName(tabId))
}

function consumeRuntimeError(): void {
  void chrome.runtime.lastError
}

async function clearAllSessions(): Promise<void> {
  const sessions = await readAllTabUsageSessions()

  sessions.forEach((session) => clearSessionAlarms(session.tabId))
  await clearTabUsageSessions()
}

function scheduleSessionAlarms(session: TabUsageSession): void {
  clearSessionAlarms(session.tabId)

  chrome.alarms.create(getAlarmName(session.tabId), {
    when: session.expiresAt,
  })

  if (session.warningNotificationShownAt) {
    return
  }

  const warningAt = session.expiresAt - SESSION_WARNING_THRESHOLD_MS

  if (warningAt > Date.now()) {
    chrome.alarms.create(getWarningAlarmName(session.tabId), {
      when: warningAt,
    })
  }
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

function markWarningNotificationShown(session: TabUsageSession): TabUsageSession {
  if (session.warningNotificationShownAt) {
    return session
  }

  return {
    ...session,
    warningNotificationShownAt: Date.now(),
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

async function redirectToBlockedPage(session: TabUsageSession): Promise<void> {
  const tab = await getTab(session.tabId)

  if (!tab || isBlockedPageUrl(tab.url) || getHostnameFromUrl(tab.url) !== session.hostname) {
    await removeTabUsageSession(session.tabId)
    clearSessionAlarms(session.tabId)
    return
  }

  const params = new URLSearchParams({
    site: session.hostname,
  })

  await removeTabUsageSession(session.tabId)
  clearSessionAlarms(session.tabId)
  chrome.tabs.update(
    session.tabId,
    {
      url: chrome.runtime.getURL(`${BLOCKED_PAGE_PATH}?${params.toString()}`),
    },
    consumeRuntimeError,
  )
}

async function showWarningNotification(tabId: number): Promise<void> {
  const session = await readTabUsageSession(tabId)

  if (!session || session.warningNotificationShownAt || session.isLimitExceeded) {
    return
  }

  const settings = await getSettings()
  const tab = await getTab(tabId)

  if (
    !settings.focusModeEnabled ||
    !tab ||
    getHostnameFromUrl(tab.url) !== session.hostname ||
    Date.now() >= session.expiresAt
  ) {
    await removeTabUsageSession(tabId)
    clearSessionAlarms(tabId)
    return
  }

  const notifiedSession = markWarningNotificationShown(session)

  await writeTabUsageSession(notifiedSession)
  chrome.notifications.create(
    `focusGuardWarning:${tabId}:${session.startedAt}`,
    {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icon-128.png'),
      title: 'FocusGuard',
      message: `${session.hostname} 사용 가능 시간이 1분 남았습니다.`,
    },
    consumeRuntimeError,
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
    clearSessionAlarms(tabId)
    await removeTabUsageSession(tabId)
    return
  }

  const hostname = getHostnameFromUrl(url)

  if (hostname === null) {
    clearSessionAlarms(tabId)
    await removeTabUsageSession(tabId)
    return
  }

  const settings = await getSettings()

  if (!settings.focusModeEnabled) {
    clearSessionAlarms(tabId)
    await removeTabUsageSession(tabId)
    return
  }

  if (settings.blockedSites.length === 0 || !isBlockedHostname(hostname, settings.blockedSites)) {
    clearSessionAlarms(tabId)
    await removeTabUsageSession(tabId)
    return
  }

  const previousSession = await readTabUsageSession(tabId)
  const session =
    previousSession?.hostname === hostname
      ? previousSession
      : createSession(tabId, hostname)

  const elapsedMs = Date.now() - session.startedAt

  if (elapsedMs >= SESSION_LIMIT_MS) {
    const exceededSession = markLimitExceeded(session)

    await writeTabUsageSession(exceededSession)
    await redirectToBlockedPage(exceededSession)
    return
  }

  await writeTabUsageSession(session)
  scheduleSessionAlarms(session)
}

chrome.runtime.onInstalled.addListener(() => {
  void getSettings().then(() => refreshOpenTabs())
})

chrome.runtime.onStartup.addListener(() => {
  void refreshOpenTabs()
})

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local' || !changes[SETTINGS_STORAGE_KEY]) {
    return
  }

  void handleSettingsChange()
})

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading' || changeInfo.status === 'complete' || changeInfo.url) {
    void handleTabUrl(tabId, changeInfo.url ?? tab.url)
  }
})

chrome.tabs.onActivated.addListener(({ tabId }) => {
  void getTab(tabId).then((tab) => {
    void handleTabUrl(tabId, tab?.url)
  })
})

chrome.tabs.onRemoved.addListener((tabId) => {
  clearSessionAlarms(tabId)
  void removeTabUsageSession(tabId)
})

chrome.alarms.onAlarm.addListener((alarm) => {
  const tabId = getTabIdFromAlarmName(alarm.name)

  if (tabId !== null) {
    void getTab(tabId).then((tab) => {
      void handleTabUrl(tabId, tab?.url)
    })
    return
  }

  const warningTabId = getTabIdFromWarningAlarmName(alarm.name)

  if (warningTabId !== null) {
    void showWarningNotification(warningTabId)
  }
})



