import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type { FocusGuardSettings, TabUsageSession } from '../shared/types'
import {
  addBlockedSite,
  DEFAULT_SETTINGS,
  getSettings,
  removeBlockedSite,
  setFocusModeEnabled,
} from '../storage/settingsStorage'
import { readAllTabUsageSessions } from '../storage/sessionStorage'

function formatRemainingTime(expiresAt: number, now: number): string {
  const totalSeconds = Math.max(0, Math.ceil((expiresAt - now) / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export function PopupApp() {
  const [settings, setSettings] = useState<FocusGuardSettings>(DEFAULT_SETTINGS)
  const [activeSessions, setActiveSessions] = useState<TabUsageSession[]>([])
  const [siteInput, setSiteInput] = useState('')
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

      if (!isMounted) {
        return
      }

      setActiveSessions(
        sessions
          .filter((session) => !session.isLimitExceeded && session.expiresAt > currentTime)
          .sort((first, second) => first.hostname.localeCompare(second.hostname) || first.tabId - second.tabId),
      )
    }

    void refreshSessions()
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

  async function handleFocusModeChange(enabled: boolean) {
    const nextSettings = await setFocusModeEnabled(enabled)

    setSettings(nextSettings)

    if (!enabled) {
      setActiveSessions([])
    }
  }

  async function handleAddSite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const nextSettings = await addBlockedSite(siteInput)

    setSettings(nextSettings)
    setSiteInput('')
  }

  async function handleRemoveSite(site: string) {
    setSettings(await removeBlockedSite(site))
  }

  return (
    <main className="popup-shell">
      <header className="popup-header">
        <div>
          <p className="eyebrow">FocusGuard</p>
          <h1>집중 모드</h1>
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

      <section className="status-panel">
        <span>현재 상태</span>
        <strong>{settings.focusModeEnabled ? '차단 감지 중' : '대기 중'}</strong>
        <small>{blockedSiteCountText}</small>
      </section>

      {settings.focusModeEnabled && (
        <section className="session-section">
          <div className="section-title">
            <h2>진행 중인 세션</h2>
            <span>남은 시간</span>
          </div>

          {activeSessions.length > 0 ? (
            <ul className="session-list">
              {activeSessions.map((session) => (
                <li key={`${session.tabId}:${session.startedAt}`}>
                  <span>{session.hostname}</span>
                  <strong>{formatRemainingTime(session.expiresAt, now)}</strong>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-state">현재 사용 중인 차단 사이트가 없습니다.</p>
          )}
        </section>
      )}

      <section className="site-section">
        <div className="section-title">
          <h2>차단 사이트</h2>
          <span>사이트별 10분 허용</span>
        </div>

        <form className="site-form" onSubmit={handleAddSite}>
          <input
            type="text"
            value={siteInput}
            placeholder="example.com"
            aria-label="차단 사이트 추가"
            onChange={(event) => setSiteInput(event.currentTarget.value)}
          />
          <button type="submit">추가</button>
        </form>

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
