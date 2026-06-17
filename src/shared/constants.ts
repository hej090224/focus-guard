export const DEFAULT_BLOCKED_SITES = [
  'youtube.com',
  'instagram.com',
  'netflix.com',
] as const

export const MIN_SESSION_LIMIT_MINUTES = 1
export const MAX_SESSION_LIMIT_MINUTES = 30
export const DEFAULT_SESSION_LIMIT_MINUTES = 10
export const SESSION_WARNING_THRESHOLD_MS = 60 * 1000

export function getSessionLimitMs(limitMinutes: number): number {
  return limitMinutes * 60 * 1000
}

export const MOTIVATION_MESSAGES = [
  '지금의 선택이 오늘의 결과를 바꿉니다.',
  '잠깐 멈추고 다시 목표로 돌아가세요.',
  '집중은 선택이고, 선택은 힘이 됩니다.',
  '오늘의 공부 시간은 내일의 여유를 만듭니다.',
  '방해 요소를 줄이면 해야 할 일이 선명해집니다.',
] as const
