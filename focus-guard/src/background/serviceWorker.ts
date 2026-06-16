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

function scheduleLimitAlarm(tabId: number, startedAt: number): void {
  chrome.alarms.clear(getAlarmName(tabId))
  chrome.alarms.create(getAlarmName(tabId), {
    when: startedAt + SESSION_LIMIT_MS,
  })
}

function getTab(tabId: number): Promise<ChromeTab | undefined> {
  return new Promise((resolve) => {
    chrome.tabs.get(tabId, (tab) => resolve(tab))
  })
}

function buildBlockedUrl(hostname: string): string {
  const params = new URLSearchParams({
    site: hostname,
    reason: '10분 사용 시간이 초과되었습니다.',
  })

  return chrome.runtime.getURL(`blocked.html?${params.toString()}`)
}

async function redirectToBlockedPage(tabId: number, hostname: string): Promise<void> {
  chrome.alarms.clear(getAlarmName(tabId))
  await removeSession(tabId)
  chrome.tabs.update(tabId, { url: buildBlockedUrl(hostname) })
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
      : {
          tabId,
          hostname,
          startedAt: Date.now(),
        }

  const elapsedMs = Date.now() - session.startedAt

  if (elapsedMs >= SESSION_LIMIT_MS) {
    await redirectToBlockedPage(tabId, hostname)
    return
  }

  await writeSession(session)
  scheduleLimitAlarm(tabId, session.startedAt)
}

chrome.runtime.onInstalled.addListener(() => {
  void getSettings()
})

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading' || changeInfo.status === 'complete' || changeInfo.url) {
    void handleTabUrl(tabId, tab.url ?? changeInfo.url)
  }
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
