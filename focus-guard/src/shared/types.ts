export interface FocusGuardSettings {
  focusModeEnabled: boolean
  blockedSites: string[]
}

export interface TabUsageSession {
  tabId: number
  hostname: string
  startedAt: number
}
