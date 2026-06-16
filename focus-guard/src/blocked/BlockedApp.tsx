import { useMemo } from 'react'
import { MOTIVATION_MESSAGES } from '../shared/constants'

function getRandomMessage(): string {
  const index = Math.floor(Math.random() * MOTIVATION_MESSAGES.length)
  return MOTIVATION_MESSAGES[index]
}

function getQueryParam(name: string): string {
  return new URLSearchParams(window.location.search).get(name) ?? ''
}

export function BlockedApp() {
  const site = getQueryParam('site') || '차단 사이트'
  const reason = getQueryParam('reason') || '집중 모드에서 허용 시간이 초과되었습니다.'
  const currentTime = new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date())
  const message = useMemo(() => getRandomMessage(), [])

  return (
    <main className="blocked-shell">
      <section className="blocked-panel">
        <p className="eyebrow">FocusGuard</p>
        <h1>{site} 접속이 차단되었습니다</h1>
        <dl>
          <div>
            <dt>차단 이유</dt>
            <dd>{reason}</dd>
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
