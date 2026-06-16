import { SESSION_LIMIT_MS } from '../shared/constants'
import type { TabUsageSession } from '../shared/types'
import { getHostnameFromUrl, isBlockedHostname } from '../shared/url'
import { getSettings } from '../storage/settingsStorage'

const SESSION_KEY_PREFIX = 'focusGuardTabSession:'
const ALARM_PREFIX = 'focusGuardSessionLimit:'

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

function scheduleLimitAlarm(tabId: number, expiresAt: number): void {
  chrome.alarms.clear(getAlarmName(tabId))
  chrome.alarms.create(getAlarmName(tabId), {
    when: expiresAt,
  })
}

function getTab(tabId: number): Promise<ChromeTab | undefined> {
  return new Promise((resolve) => {
    chrome.tabs.get(tabId, (tab) => resolve(tab))
  })
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

async function handleTabUrl(tabId: number, url: string | undefined): Promise<void> {
  const hostname = getHostnameFromUrl(url)

  if (hostname === null) {
    chrome.alarms.clear(getAlarmName(tabId))
    await removeSession(tabId)
    return
  }

  const settings = await getSettings()

  if (!settings.focusModeEnabled || !isBlockedHostname(hostname, settings.blockedSites)) {
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
    chrome.alarms.clear(getAlarmName(tabId))
    logLimitExceeded(exceededSession)
    return
  }

  await writeSession(session)
  scheduleLimitAlarm(tabId, session.expiresAt)
}

chrome.runtime.onInstalled.addListener(() => {
  void getSettings()
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
