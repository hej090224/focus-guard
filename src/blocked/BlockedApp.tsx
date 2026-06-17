import { useEffect, useMemo, useState } from 'react'
import { MOTIVATION_MESSAGES } from '../shared/constants'
import { getQueryParam } from '../shared/queryString'
import type { ThemeMode } from '../shared/types'
import { DEFAULT_SETTINGS, getSettings, SETTINGS_STORAGE_KEY } from '../storage/settingsStorage'

function getBlockedReason(limitMinutes: string | null): string {
  const parsedLimit = Number(limitMinutes)

  if (!Number.isInteger(parsedLimit) || parsedLimit < 1) {
    return '집중 모드 사용 시간을 초과했습니다.'
  }

  return `집중 모드에서 ${parsedLimit}분 사용 시간을 초과했습니다.`
}

function getRandomMessage(): string {
  const index = Math.floor(Math.random() * MOTIVATION_MESSAGES.length)
  return MOTIVATION_MESSAGES[index]
}

function formatCurrentTime(date: Date): string {
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(date)
}

export function BlockedApp() {
  const [currentTime, setCurrentTime] = useState(() => formatCurrentTime(new Date()))
  const [theme, setTheme] = useState<ThemeMode>(DEFAULT_SETTINGS.theme)
  const site = getQueryParam(window.location.search, 'site') ?? '차단 사이트'
  const blockedReason = getBlockedReason(getQueryParam(window.location.search, 'limit'))
  const message = useMemo(() => getRandomMessage(), [])

  useEffect(() => {
    let isMounted = true

    void getSettings().then((settings) => {
      if (isMounted) {
        setTheme(settings.theme)
      }
    })

    function handleStorageChange(
      changes: Record<string, ChromeStorageChange>,
      areaName: 'local' | 'sync' | 'session' | 'managed',
    ) {
      if (areaName !== 'local' || !changes[SETTINGS_STORAGE_KEY]) {
        return
      }

      void getSettings().then((settings) => setTheme(settings.theme))
    }

    chrome.storage.onChanged.addListener(handleStorageChange)

    return () => {
      isMounted = false
      chrome.storage.onChanged.removeListener(handleStorageChange)
    }
  }, [])

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setCurrentTime(formatCurrentTime(new Date()))
    }, 1000)

    return () => window.clearInterval(timerId)
  }, [])

  return (
    <main className="blocked-shell" data-theme={theme}>
      <section className="blocked-panel">
        <p className="eyebrow">FocusGuard</p>
        <h1>접속이 차단되었습니다</h1>
        <p className="blocked-site">{site}</p>

        <dl className="blocked-details">
          <div>
            <dt>차단 이유</dt>
            <dd>{blockedReason}</dd>
          </div>
          <div>
            <dt>현재 시간</dt>
            <dd>{currentTime}</dd>
          </div>
        </dl>

        <blockquote>{message}</blockquote>
      </section>
    </main>
  )
}
