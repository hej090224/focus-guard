export function getQueryParam(search: string, name: string): string | null {
  const value = new URLSearchParams(search).get(name)

  return value && value.trim().length > 0 ? value : null
}
