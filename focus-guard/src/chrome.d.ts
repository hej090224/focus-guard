interface ChromeStorageArea {
  get(keys: string, callback: (items: Record<string, unknown>) => void): void
  set(items: Record<string, unknown>, callback?: () => void): void
  remove(keys: string | string[], callback?: () => void): void
}

interface ChromeTab {
  id?: number
  url?: string
}

interface ChromeAlarm {
  name: string
}

interface ChromeTabsApi {
  get(tabId: number, callback: (tab: ChromeTab) => void): void
  onActivated: {
    addListener(callback: (activeInfo: { tabId: number }) => void): void
  }
  onUpdated: {
    addListener(
      callback: (tabId: number, changeInfo: { status?: string; url?: string }, tab: ChromeTab) => void,
    ): void
  }
  onRemoved: {
    addListener(callback: (tabId: number) => void): void
  }
}

interface ChromeAlarmsApi {
  create(name: string, alarmInfo: { when: number }): void
  clear(name: string): void
  onAlarm: {
    addListener(callback: (alarm: ChromeAlarm) => void): void
  }
}

interface ChromeRuntimeApi {
  onInstalled: {
    addListener(callback: () => void): void
  }
}

declare const chrome: {
  alarms: ChromeAlarmsApi
  runtime: ChromeRuntimeApi
  storage: {
    local: ChromeStorageArea
    session: ChromeStorageArea
  }
  tabs: ChromeTabsApi
}
