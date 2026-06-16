interface ChromeStorageArea {
  get(keys: string | string[] | null, callback: (items: Record<string, unknown>) => void): void
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
  query(queryInfo: Record<string, never>, callback: (tabs: ChromeTab[]) => void): void
  update(tabId: number, updateProperties: { url: string }, callback?: (tab?: ChromeTab) => void): void
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
  clear(name: string, callback?: (wasCleared: boolean) => void): void
  onAlarm: {
    addListener(callback: (alarm: ChromeAlarm) => void): void
  }
}

interface ChromeRuntimeApi {
  getURL(path: string): string
  lastError?: {
    message?: string
  }
  onInstalled: {
    addListener(callback: () => void): void
  }
}

interface ChromeStorageChange {
  oldValue?: unknown
  newValue?: unknown
}

interface ChromeStorageApi {
  local: ChromeStorageArea
  session: ChromeStorageArea
  onChanged: {
    addListener(
      callback: (changes: Record<string, ChromeStorageChange>, areaName: 'local' | 'sync' | 'session' | 'managed') => void,
    ): void
  }
}

declare const chrome: {
  alarms: ChromeAlarmsApi
  runtime: ChromeRuntimeApi
  storage: ChromeStorageApi
  tabs: ChromeTabsApi
}
