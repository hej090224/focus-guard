import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import {
  DEFAULT_SESSION_LIMIT_MINUTES,
  MAX_SESSION_LIMIT_MINUTES,
  MIN_SESSION_LIMIT_MINUTES,
} from '../shared/constants'
import { BrandMark } from '../shared/BrandMark'
import type { FocusGuardSettings, TabUsageSession, ThemeMode } from '../shared/types'
import { normalizeHostname } from '../shared/url'
import {
  addBlockedSite,
  clearSiteLimitMinutes,
  DEFAULT_SETTINGS,
  getSettings,
  isValidLimitMinutes,
  removeBlockedSite,
  setDefaultLimitMinutes,
  setFocusModeEnabled,
  setSiteLimitMinutes,
  setTheme,
  SETTINGS_STORAGE_KEY,
} from '../storage/settingsStorage'
import { readAllTabUsageSessions } from '../storage/sessionStorage'

type PopupView = 'main' | 'settings'

function formatRemainingTime(expiresAt: number, now: number): string {
  const totalSeconds = Math.max(0, Math.ceil((expiresAt - now) / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function getVisibleSessions(sessions: TabUsageSession[], now: number): TabUsageSession[] {
  return sessions
    .filter((session) => !session.isLimitExceeded && session.expiresAt > now)
    .sort((first, second) => first.hostname.localeCompare(second.hostname) || first.tabId - second.tabId)
}

function parseLimitMinutes(value: string): number | null {
  const parsedValue = Number(value)

  return isValidLimitMinutes(parsedValue) ? parsedValue : null
}

export function PopupApp() {
  const [settings, setSettings] = useState<FocusGuardSettings>(DEFAULT_SETTINGS)
  const [activeSessions, setActiveSessions] = useState<TabUsageSession[]>([])
  const [siteInput, setSiteInput] = useState('')
  const [formMessage, setFormMessage] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [now, setNow] = useState(0)
  const [view, setView] = useState<PopupView>('main')

  useEffect(() => {
    let isMounted = true

    void getSettings().then((storedSettings) => {
      if (isMounted) {
        setSettings(storedSettings)
        setIsLoading(false)
      }
    })

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    function handleStorageChange(
      changes: Record<string, ChromeStorageChange>,
      areaName: 'local' | 'sync' | 'session' | 'managed',
    ) {
      if (areaName !== 'local' || !changes[SETTINGS_STORAGE_KEY]) {
        return
      }

      void getSettings().then((storedSettings) => setSettings(storedSettings))
    }

    chrome.storage.onChanged.addListener(handleStorageChange)

    return () => chrome.storage.onChanged.removeListener(handleStorageChange)
  }, [])

  useEffect(() => {
    let isMounted = true

    async function refreshSessions() {
      const currentTime = Date.now()

      setNow(currentTime)

      if (!settings.focusModeEnabled) {
        if (isMounted) {
          setActiveSessions([])
        }
        return
      }

      const sessions = await readAllTabUsageSessions()

      if (isMounted) {
        setActiveSessions(getVisibleSessions(sessions, currentTime))
      }
    }

    void refreshSessions()

    if (!settings.focusModeEnabled) {
      return () => {
        isMounted = false
      }
    }

    const intervalId = window.setInterval(() => {
      void refreshSessions()
    }, 1000)

    return () => {
      isMounted = false
      window.clearInterval(intervalId)
    }
  }, [settings.focusModeEnabled])

  const blockedSiteCountText = useMemo(() => `${settings.blockedSites.length}개 사이트`, [settings.blockedSites.length])
  const normalizedInput = normalizeHostname(siteInput)
  const isDuplicateSite = normalizedInput !== null && settings.blockedSites.includes(normalizedInput)
  const canAddSite = normalizedInput !== null && !isDuplicateSite

  async function handleFocusModeChange(enabled: boolean) {
    const nextSettings = await setFocusModeEnabled(enabled)

    setSettings(nextSettings)

    if (!enabled) {
      setActiveSessions([])
    }
  }

  async function handleThemeChange(theme: ThemeMode) {
    setSettings(await setTheme(theme))
  }

  async function handleDefaultLimitBlur(input: HTMLInputElement) {
    const limitMinutes = parseLimitMinutes(input.value)

    if (limitMinutes === null) {
      input.value = String(settings.defaultLimitMinutes)
      setFormMessage(`제한 시간은 ${MIN_SESSION_LIMIT_MINUTES}~${MAX_SESSION_LIMIT_MINUTES}분 사이로 입력하세요.`)
      return
    }

    const nextSettings = await setDefaultLimitMinutes(limitMinutes)

    input.value = String(nextSettings.defaultLimitMinutes)
    setSettings(nextSettings)
    setFormMessage(`기본 제한 시간을 ${limitMinutes}분으로 저장했습니다.`)
  }

  async function handleSiteLimitBlur(site: string, input: HTMLInputElement) {
    if (input.value.trim().length === 0) {
      const nextSettings = await clearSiteLimitMinutes(site)

      input.value = ''
      setSettings(nextSettings)
      setFormMessage(`${site}은 기본 제한 시간을 사용합니다.`)
      return
    }

    const limitMinutes = parseLimitMinutes(input.value)

    if (limitMinutes === null) {
      input.value = settings.siteLimitMinutes[site] === undefined ? '' : String(settings.siteLimitMinutes[site])
      setFormMessage(`사이트별 제한 시간은 ${MIN_SESSION_LIMIT_MINUTES}~${MAX_SESSION_LIMIT_MINUTES}분 사이로 입력하세요.`)
      return
    }

    const nextSettings = await setSiteLimitMinutes(site, limitMinutes)

    input.value = String(nextSettings.siteLimitMinutes[site] ?? limitMinutes)
    setSettings(nextSettings)
    setFormMessage(`${site} 제한 시간을 ${limitMinutes}분으로 저장했습니다.`)
  }

  async function handleAddSite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (normalizedInput === null) {
      setFormMessage('유효한 도메인 또는 URL을 입력하세요.')
      return
    }

    if (isDuplicateSite) {
      setFormMessage('이미 등록된 사이트입니다.')
      return
    }

    const nextSettings = await addBlockedSite(normalizedInput)

    setSettings(nextSettings)
    setSiteInput('')
    setFormMessage(`${normalizedInput} 사이트를 추가했습니다.`)
  }

  async function handleRemoveSite(site: string) {
    setSettings(await removeBlockedSite(site))
    setFormMessage(`${site} 사이트를 삭제했습니다.`)
  }

  return (
    <main className="popup-shell" data-theme={settings.theme} data-view={view}>
      {view === 'main' ? (
        <>
          <header className="popup-header card">
            <div className="brand-heading">
              <BrandMark className="brand-mark" labelId="popup-brand-title" />
              <div>
                <p className="eyebrow">FocusGuard</p>
                <h1>집중 모드</h1>
              </div>
            </div>
            <button
              type="button"
              className="icon-button"
              onClick={() => {
                setFormMessage('')
                setView('settings')
              }}
            >
              설정
            </button>
          </header>

          <section className="focus-card card">
            <div>
              <span className="label">집중 모드</span>
              <strong className={settings.focusModeEnabled ? 'status-on' : 'status-off'}>
                {settings.focusModeEnabled ? '감지 중' : '대기 중'}
              </strong>
            </div>
            <label className="switch">
              <input
                type="checkbox"
                checked={settings.focusModeEnabled}
                disabled={isLoading}
                onChange={(event) => {
                  void handleFocusModeChange(event.currentTarget.checked)
                }}
              />
              <span>{settings.focusModeEnabled ? 'ON' : 'OFF'}</span>
            </label>
          </section>

          <section className="summary-grid">
            <div className="summary-item card">
              <span className="label">차단 사이트</span>
              <strong>{blockedSiteCountText}</strong>
            </div>
            <div className="summary-item card">
              <span className="label">기본 제한</span>
              <strong>{settings.defaultLimitMinutes}분</strong>
            </div>
          </section>

          <section className="card section-card sessions-card main-sessions">
            <div className="section-title">
              <div>
                <h2>진행 중인 세션</h2>
                <p>현재 차단 사이트의 남은 시간</p>
              </div>
              <span>{activeSessions.length}개</span>
            </div>

            {settings.focusModeEnabled && activeSessions.length > 0 ? (
              <ul className="session-list">
                {activeSessions.map((session) => (
                  <li key={`${session.tabId}:${session.startedAt}`}>
                    <span>{session.hostname}</span>
                    <strong>{formatRemainingTime(session.expiresAt, now)}</strong>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty-state">
                {settings.focusModeEnabled ? '진행 중인 세션이 없습니다.' : '집중 모드를 켜면 남은 시간이 표시됩니다.'}
              </p>
            )}
          </section>
        </>
      ) : (
        <>
          <header className="settings-header card">
            <button
              type="button"
              className="icon-button"
              onClick={() => {
                setView('main')
              }}
            >
              뒤로
            </button>
            <div>
              <p className="eyebrow">Settings</p>
              <h1>설정</h1>
            </div>
          </header>

          <section className="settings-content">
            <section className="card section-card compact-section">
              <div className="setting-row">
                <div>
                  <h2>테마</h2>
                  <p>popup과 차단 화면에 적용됩니다.</p>
                </div>
                <div className="theme-control" role="group" aria-label="테마 설정">
                  <button
                    type="button"
                    className={settings.theme === 'light' ? 'theme-option theme-option-active' : 'theme-option'}
                    aria-pressed={settings.theme === 'light'}
                    onClick={() => {
                      void handleThemeChange('light')
                    }}
                  >
                    Light
                  </button>
                  <button
                    type="button"
                    className={settings.theme === 'dark' ? 'theme-option theme-option-active' : 'theme-option'}
                    aria-pressed={settings.theme === 'dark'}
                    onClick={() => {
                      void handleThemeChange('dark')
                    }}
                  >
                    Dark
                  </button>
                </div>
              </div>

              <label className="setting-row limit-field">
                <div>
                  <h2>기본 제한</h2>
                  <p>사이트별 설정이 없을 때 적용됩니다.</p>
                </div>
                <input
                  key={`default-limit:${settings.defaultLimitMinutes}`}
                  type="number"
                  min={MIN_SESSION_LIMIT_MINUTES}
                  max={MAX_SESSION_LIMIT_MINUTES}
                  step="1"
                  defaultValue={settings.defaultLimitMinutes || DEFAULT_SESSION_LIMIT_MINUTES}
                  aria-label="전체 기본 제한 시간"
                  onBlur={(event) => {
                    void handleDefaultLimitBlur(event.currentTarget)
                  }}
                />
              </label>
            </section>

            <section className="card section-card site-card">
              <div className="section-title">
                <div>
                  <h2>차단 사이트</h2>
                  <p>개별 제한 시간은 비워두면 기본값을 사용합니다.</p>
                </div>
                <span>{settings.defaultLimitMinutes}분 기본</span>
              </div>

              <form className="site-form" onSubmit={handleAddSite}>
                <input
                  type="text"
                  value={siteInput}
                  placeholder="example.com"
                  aria-label="차단 사이트 추가"
                  aria-describedby="site-form-message"
                  onChange={(event) => {
                    setSiteInput(event.currentTarget.value)
                    setFormMessage('')
                  }}
                />
                <button type="submit" disabled={!canAddSite}>
                  추가
                </button>
              </form>

              <p id="site-form-message" className={formMessage ? 'form-message' : 'form-message form-message-empty'}>
                {formMessage || ' '}
              </p>

              <ul className="site-list">
                {settings.blockedSites.map((site) => {
                  const siteLimitMinutes = settings.siteLimitMinutes[site]

                  return (
                    <li key={site}>
                      <span>{site}</span>
                      <label className="site-limit-field">
                        <input
                          key={`${site}:${siteLimitMinutes ?? 'default'}`}
                          type="number"
                          min={MIN_SESSION_LIMIT_MINUTES}
                          max={MAX_SESSION_LIMIT_MINUTES}
                          step="1"
                          defaultValue={siteLimitMinutes ?? ''}
                          placeholder={String(settings.defaultLimitMinutes)}
                          aria-label={`${site} 제한 시간`}
                          onBlur={(event) => {
                            void handleSiteLimitBlur(site, event.currentTarget)
                          }}
                        />
                        <span>분</span>
                      </label>
                      <button
                        type="button"
                        aria-label={`${site} 삭제`}
                        onClick={() => {
                          void handleRemoveSite(site)
                        }}
                      >
                        삭제
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          </section>
        </>
      )}
    </main>
  )
}
