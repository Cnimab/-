import type { Cookie } from 'playwright'

export type Mode = 'diagnose' | 'test-one' | 'send-all'
export class SafeError extends Error {
  constructor(public readonly code: string) {
    super(code)
  }
}
export function safeErrorCode(error: unknown): string {
  // Never print raw exceptions: parser / Playwright errors can contain secrets.
  return error instanceof SafeError ? error.code : 'UNEXPECTED_ERROR_REDACTED'
}
function parseJson(value: string | undefined, code: string): unknown {
  try {
    return JSON.parse(value ?? '')
  } catch {
    throw new SafeError(code)
  }
}
export function resolveMode(value?: string): Mode {
  const mode = value?.trim() || 'diagnose'
  if (mode !== 'diagnose' && mode !== 'test-one' && mode !== 'send-all') {
    throw new SafeError('INVALID_RUN_MODE')
  }
  return mode
}
export function resolveTargets(value?: string): string[] {
  const parsed = parseJson(value, 'INVALID_TARGETS_JSON')
  if (
    !Array.isArray(parsed) ||
    parsed.length === 0 ||
    parsed.some((v) => typeof v !== 'string' || !v.trim())
  ) {
    throw new SafeError('INVALID_TARGETS')
  }
  const targets = parsed.map((v: string) => v.trim())
  if (new Set(targets).size !== targets.length) throw new SafeError('DUPLICATE_TARGETS')
  return targets
}
export function resolveCookies(value?: string): Cookie[] {
  const parsed = parseJson(value, 'INVALID_COOKIE_JSON')
  if (!Array.isArray(parsed) || parsed.length === 0) throw new SafeError('INVALID_COOKIES')
  return parsed.map((c: Record<string, unknown>) => {
    if (
      !c ||
      typeof c.name !== 'string' ||
      !c.name ||
      typeof c.value !== 'string' ||
      (c.domain !== '.douyin.com' && c.domain !== 'www.douyin.com') ||
      c.path !== '/'
    ) {
      throw new SafeError('INVALID_COOKIES')
    }
    const expires = c.session ? -1 : (c.expirationDate ?? -1)
    if (typeof expires !== 'number' || !Number.isFinite(expires))
      throw new SafeError('INVALID_COOKIES')
    return {
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path,
      expires,
      httpOnly: c.httpOnly === true,
      secure: c.secure === true,
      sameSite:
        c.sameSite === 'no_restriction' ? 'None' : c.sameSite === 'strict' ? 'Strict' : 'Lax',
    }
  })
}
export function resolveBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value?.trim()) return fallback
  if (value.trim().toLowerCase() === 'true') return true
  if (value.trim().toLowerCase() === 'false') return false
  throw new SafeError('INVALID_BOOLEAN_OPTION')
}
