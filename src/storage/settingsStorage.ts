import {
  DEFAULT_BLOCKED_SITES,
  DEFAULT_SESSION_LIMIT_MINUTES,
  MAX_SESSION_LIMIT_MINUTES,
  MIN_SESSION_LIMIT_MINUTES,
} from '../shared/constants'
import type { FocusGuardSettings, ThemeMode } from '../shared/types'
import { normalizeHostname } from '../shared/url'

export const SETTINGS_STORAGE_KEY = 'focusGuardSettings'

export const DEFAULT_SETTINGS: FocusGuardSettings = {
  focusModeEnabled: false,
  blockedSites: [...DEFAULT_BLOCKED_SITES],
  defaultLimitMinutes: DEFAULT_SESSION_LIMIT_MINUTES,
  siteLimitMinutes: {},
  theme: 'dark',
}

type StoredSettings = Partial<FocusGuardSettings>

function readLocal<T>(key: string): Promise<T | undefined> {
  return new Promise((resolve) => {
    chrome.storage.local.get(key, (result) => {
      if (chrome.runtime.lastError) {
        resolve(undefined)
        return
      }

      resolve(result[key] as T | undefined)
    })
  })
}

function writeLocal<T>(key: string, value: T): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [key]: value }, () => {
      resolve()
    })
  })
}

function normalizeSites(sites: unknown): string[] {
  if (!Array.isArray(sites)) {
    return [...DEFAULT_SETTINGS.blockedSites]
  }

  const normalizedSites = sites
    .filter((site): site is string => typeof site === 'string')
    .map((site) => normalizeHostname(site))
    .filter((site): site is string => site !== null)

  return Array.from(new Set(normalizedSites))
}

export function isValidLimitMinutes(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= MIN_SESSION_LIMIT_MINUTES &&
    value <= MAX_SESSION_LIMIT_MINUTES
  )
}

function normalizeLimitMinutes(value: unknown, fallback: number): number {
  return isValidLimitMinutes(value) ? value : fallback
}

function normalizeSiteLimitMinutes(value: unknown, blockedSites: string[]): Record<string, number> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {}
  }

  return Object.entries(value).reduce<Record<string, number>>((limits, [site, limitMinutes]) => {
    const hostname = normalizeHostname(site)

    if (hostname !== null && blockedSites.includes(hostname) && isValidLimitMinutes(limitMinutes)) {
      limits[hostname] = limitMinutes
    }

    return limits
  }, {})
}

function normalizeTheme(value: unknown): ThemeMode {
  return value === 'dark' || value === 'light' ? value : DEFAULT_SETTINGS.theme
}

function normalizeStoredSettings(storedSettings: StoredSettings | undefined): FocusGuardSettings {
  const blockedSites = normalizeSites(storedSettings?.blockedSites)
  const defaultLimitMinutes = normalizeLimitMinutes(
    storedSettings?.defaultLimitMinutes,
    DEFAULT_SETTINGS.defaultLimitMinutes,
  )

  return {
    focusModeEnabled:
      typeof storedSettings?.focusModeEnabled === 'boolean'
        ? storedSettings.focusModeEnabled
        : DEFAULT_SETTINGS.focusModeEnabled,
    blockedSites,
    defaultLimitMinutes,
    siteLimitMinutes: normalizeSiteLimitMinutes(storedSettings?.siteLimitMinutes, blockedSites),
    theme: normalizeTheme(storedSettings?.theme),
  }
}

function areSiteLimitMinutesEqual(
  storedLimits: Record<string, number> | undefined,
  normalizedLimits: Record<string, number>,
): boolean {
  if (typeof storedLimits !== 'object' || storedLimits === null || Array.isArray(storedLimits)) {
    return Object.keys(normalizedLimits).length === 0
  }

  const storedEntries = Object.entries(storedLimits)
  const normalizedEntries = Object.entries(normalizedLimits)

  return (
    storedEntries.length === normalizedEntries.length &&
    normalizedEntries.every(([site, limitMinutes]) => storedLimits[site] === limitMinutes)
  )
}

function shouldRepairSettings(storedSettings: StoredSettings | undefined, settings: FocusGuardSettings): boolean {
  return (
    !storedSettings ||
    typeof storedSettings.focusModeEnabled !== 'boolean' ||
    !Array.isArray(storedSettings.blockedSites) ||
    storedSettings.blockedSites.length !== settings.blockedSites.length ||
    storedSettings.blockedSites.some((site, index) => site !== settings.blockedSites[index]) ||
    storedSettings.defaultLimitMinutes !== settings.defaultLimitMinutes ||
    !areSiteLimitMinutesEqual(storedSettings.siteLimitMinutes, settings.siteLimitMinutes) ||
    storedSettings.theme !== settings.theme
  )
}

export async function getSettings(): Promise<FocusGuardSettings> {
  const storedSettings = await readLocal<StoredSettings>(SETTINGS_STORAGE_KEY)
  const settings = normalizeStoredSettings(storedSettings)

  if (shouldRepairSettings(storedSettings, settings)) {
    await saveSettings(settings)
  }

  return settings
}

export async function saveSettings(settings: FocusGuardSettings): Promise<void> {
  const blockedSites = normalizeSites(settings.blockedSites)
  const defaultLimitMinutes = normalizeLimitMinutes(settings.defaultLimitMinutes, DEFAULT_SETTINGS.defaultLimitMinutes)

  await writeLocal<FocusGuardSettings>(SETTINGS_STORAGE_KEY, {
    focusModeEnabled: settings.focusModeEnabled,
    blockedSites,
    defaultLimitMinutes,
    siteLimitMinutes: normalizeSiteLimitMinutes(settings.siteLimitMinutes, blockedSites),
    theme: normalizeTheme(settings.theme),
  })
}

export async function setFocusModeEnabled(enabled: boolean): Promise<FocusGuardSettings> {
  const settings = await getSettings()
  const nextSettings = { ...settings, focusModeEnabled: enabled }

  await saveSettings(nextSettings)
  return nextSettings
}

export async function addBlockedSite(site: string): Promise<FocusGuardSettings> {
  const hostname = normalizeHostname(site)

  if (hostname === null) {
    return getSettings()
  }

  const settings = await getSettings()
  const nextSettings = {
    ...settings,
    blockedSites: Array.from(new Set([...settings.blockedSites, hostname])),
  }

  await saveSettings(nextSettings)
  return nextSettings
}

export async function removeBlockedSite(site: string): Promise<FocusGuardSettings> {
  const hostname = normalizeHostname(site)

  if (hostname === null) {
    return getSettings()
  }

  const settings = await getSettings()
  const { [hostname]: removedLimit, ...siteLimitMinutes } = settings.siteLimitMinutes
  const nextSettings = {
    ...settings,
    blockedSites: settings.blockedSites.filter((blockedSite) => blockedSite !== hostname),
    siteLimitMinutes,
  }

  void removedLimit
  await saveSettings(nextSettings)
  return nextSettings
}

export async function setDefaultLimitMinutes(limitMinutes: number): Promise<FocusGuardSettings> {
  if (!isValidLimitMinutes(limitMinutes)) {
    return getSettings()
  }

  const settings = await getSettings()
  const nextSettings = { ...settings, defaultLimitMinutes: limitMinutes }

  await saveSettings(nextSettings)
  return nextSettings
}

export async function setSiteLimitMinutes(site: string, limitMinutes: number): Promise<FocusGuardSettings> {
  if (!isValidLimitMinutes(limitMinutes)) {
    return getSettings()
  }

  const hostname = normalizeHostname(site)

  if (hostname === null) {
    return getSettings()
  }

  const settings = await getSettings()

  if (!settings.blockedSites.includes(hostname)) {
    return settings
  }

  const nextSettings = {
    ...settings,
    siteLimitMinutes: {
      ...settings.siteLimitMinutes,
      [hostname]: limitMinutes,
    },
  }

  await saveSettings(nextSettings)
  return nextSettings
}

export async function clearSiteLimitMinutes(site: string): Promise<FocusGuardSettings> {
  const hostname = normalizeHostname(site)

  if (hostname === null) {
    return getSettings()
  }

  const settings = await getSettings()
  const { [hostname]: removedLimit, ...siteLimitMinutes } = settings.siteLimitMinutes

  void removedLimit
  const nextSettings = { ...settings, siteLimitMinutes }

  await saveSettings(nextSettings)
  return nextSettings
}

export async function setTheme(theme: ThemeMode): Promise<FocusGuardSettings> {
  const settings = await getSettings()
  const nextSettings = { ...settings, theme: normalizeTheme(theme) }

  await saveSettings(nextSettings)
  return nextSettings
}
