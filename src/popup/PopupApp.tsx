import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type { FocusGuardSettings, TabUsageSession } from '../shared/types'
import { normalizeHostname } from '../shared/url'
import {
  addBlockedSite,
  DEFAULT_SETTINGS,
  getSettings,
  removeBlockedSite,
  setFocusModeEnabled,
  SETTINGS_STORAGE_KEY,
} from '../storage/settingsStorage'
import { readAllTabUsageSessions } from '../storage/sessionStorage'

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

export function PopupApp() {
  const [settings, setSettings] = useState<FocusGuardSettings>(DEFAULT_SETTINGS)
  const [activeSessions, setActiveSessions] = useState<TabUsageSession[]>([])
  const [siteInput, setSiteInput] = useState('')
  const [formMessage, setFormMessage] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [now, setNow] = useState(0)

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

  const blockedSiteCountText = useMemo(
    () => `${settings.blockedSites.length}개 사이트`,
    [settings.blockedSites.length],
  )

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
    <main className="popup-shell">
      <header className="popup-header card">
        <div>
          <p className="eyebrow">FocusGuard</p>
          <h1>집중 모드</h1>
          <p className="header-copy">차단 사이트별 10분 사용을 관리합니다.</p>
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
      </header>

      <section className="status-card card">
        <div>
          <span className="label">현재 상태</span>
          <strong className={settings.focusModeEnabled ? 'status-on' : 'status-off'}>
            {settings.focusModeEnabled ? '차단 감지 중' : '대기 중'}
          </strong>
        </div>
        <small>{blockedSiteCountText}</small>
      </section>

      <section className="card section-card">
        <div className="section-title">
          <div>
            <h2>남은 시간</h2>
            <p>현재 세션이 진행 중인 차단 사이트</p>
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

      <section className="card section-card">
        <div className="section-title">
          <div>
            <h2>차단 사이트</h2>
            <p>사용 제한을 적용할 도메인</p>
          </div>
          <span>10분 허용</span>
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
          {settings.blockedSites.map((site) => (
            <li key={site}>
              <span>{site}</span>
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
          ))}
        </ul>
      </section>
    </main>
  )
}
