export type ThemeMode = 'light' | 'dark'

export interface FocusGuardSettings {
  focusModeEnabled: boolean
  blockedSites: string[]
  defaultLimitMinutes: number
  siteLimitMinutes: Record<string, number>
  theme: ThemeMode
}

export interface TabUsageSession {
  tabId: number
  hostname: string
  startedAt: number
  expiresAt: number
  limitMinutes: number
  isLimitExceeded: boolean
  warningNotificationShownAt?: number
  limitExceededAt?: number
}
