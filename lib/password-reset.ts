import crypto from 'crypto'

export const RESET_TOKEN_TTL_MS = 30 * 60 * 1000
export const RESET_WINDOW_MS = 15 * 60 * 1000
export const MAX_RESETS_PER_EMAIL = 3
export const MAX_RESETS_PER_IP = 10

// Reset tokens share the otp_tokens table with LOGIN_FAIL markers; the
// prefix keeps them apart. Only the SHA-256 of the token is stored.
export const RESET_TOKEN_PREFIX = 'reset:'
export const RESET_IP_MARKER = 'RESET_REQ'

export function newResetToken(): { token: string; stored: string } {
  const token = crypto.randomBytes(32).toString('base64url')
  return { token, stored: storedResetToken(token) }
}

export function storedResetToken(token: string): string {
  return RESET_TOKEN_PREFIX + crypto.createHash('sha256').update(token).digest('hex')
}

// bcrypt ignores bytes past 72, so cap the length rather than silently
// truncating a long passphrase.
export function passwordStrengthError(password: string): string | null {
  if (password.length < 10) return 'Password must be at least 10 characters'
  if (Buffer.byteLength(password, 'utf8') > 72) return 'Password must be at most 72 bytes'
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Password must contain at least one letter and one number'
  }
  return null
}

// Never build the link from the request's Host header: a forged Host would
// mail the victim a link (with a live token) to the attacker's domain.
export function resetLinkBase(): string | null {
  const configured = process.env.NEXT_PUBLIC_APP_URL
  if (configured) return configured.replace(/\/+$/, '')
  return process.env.NODE_ENV === 'production' ? null : 'http://localhost:3000'
}
