interface BrandMarkProps {
  className?: string
  labelId?: string
}

export function BrandMark({ className, labelId }: BrandMarkProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 48 48"
      role="img"
      aria-labelledby={labelId}
      xmlns="http://www.w3.org/2000/svg"
    >
      {labelId ? <title id={labelId}>FocusGuard logo</title> : null}
      <rect width="48" height="48" rx="14" fill="currentColor" opacity="0.1" />
      <path
        d="M24 8L37 13.2V23.4C37 31.4 31.8 38.4 24 40C16.2 38.4 11 31.4 11 23.4V13.2L24 8Z"
        fill="currentColor"
        opacity="0.22"
      />
      <path
        d="M24 13L32.2 16.3V23.5C32.2 29.1 28.9 33.8 24 35.3C19.1 33.8 15.8 29.1 15.8 23.5V16.3L24 13Z"
        fill="currentColor"
      />
      <circle cx="24" cy="23.5" r="4.2" fill="var(--color-surface)" />
      <path d="M24 17.1V13M24 34.1V30M17.6 23.5H13.6M34.4 23.5H30.4" stroke="var(--color-surface)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
