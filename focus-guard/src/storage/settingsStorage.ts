import { DEFAULT_BLOCKED_SITES } from '../shared/constants'
import type { FocusGuardSettings } from '../shared/types'
import { normalizeHostname } from '../shared/url'

export const SETTINGS_STORAGE_KEY = 'focusGuardSettings'

export const DEFAULT_SETTINGS: FocusGuardSettings = {
  focusModeEnabled: false,
  blockedSites: [...DEFAULT_BLOCKED_SITES],
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

function normalizeSites(sites: string[] | undefined): string[] {
  const normalizedSites = sites
    ?.map((site) => normalizeHostname(site))
    .filter((site): site is string => site !== null)

  return Array.from(new Set(normalizedSites ?? DEFAULT_SETTINGS.blockedSites))
}

export async function getSettings(): Promise<FocusGuardSettings> {
  const storedSettings = await readLocal<StoredSettings>(SETTINGS_STORAGE_KEY)
  const hasStoredBlockedSites = Array.isArray(storedSettings?.blockedSites)
  const settings = {
    focusModeEnabled: storedSettings?.focusModeEnabled ?? DEFAULT_SETTINGS.focusModeEnabled,
    blockedSites: normalizeSites(storedSettings?.blockedSites),
  }

  if (!storedSettings || !hasStoredBlockedSites) {
    await saveSettings(settings)
  }

  return settings
}

export async function saveSettings(settings: FocusGuardSettings): Promise<void> {
  await writeLocal<FocusGuardSettings>(SETTINGS_STORAGE_KEY, {
    focusModeEnabled: settings.focusModeEnabled,
    blockedSites: normalizeSites(settings.blockedSites),
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
  const nextSettings = {
    ...settings,
    blockedSites: settings.blockedSites.filter((blockedSite) => blockedSite !== hostname),
  }

  await saveSettings(nextSettings)
  return nextSettings
}
