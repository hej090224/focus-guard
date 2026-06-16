import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type { FocusGuardSettings } from '../shared/types'
import {
  addBlockedSite,
  DEFAULT_SETTINGS,
  getSettings,
  removeBlockedSite,
  setFocusModeEnabled,
} from '../storage/settingsStorage'

export function PopupApp() {
  const [settings, setSettings] = useState<FocusGuardSettings>(DEFAULT_SETTINGS)
  const [siteInput, setSiteInput] = useState('')
  const [isLoading, setIsLoading] = useState(true)

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

  const blockedSiteCountText = useMemo(
    () => `${settings.blockedSites.length}개 사이트`,
    [settings.blockedSites.length],
  )

  async function handleFocusModeChange(enabled: boolean) {
    setSettings(await setFocusModeEnabled(enabled))
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
