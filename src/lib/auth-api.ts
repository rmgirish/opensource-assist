/**
 * Typed client for the OpenSource Assist auth backend (/api/v1/auth/*).
 *
 * Contract mirrors `backend/schemas/auth.py`. The JWT access token is stored
 * in localStorage and attached as a Bearer token; override the server with
 * VITE_API_BASE_URL (defaults to the local uvicorn dev server).
 */

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000').replace(/\/+$/, '')

export interface FieldValidationIssue {
  /** Backend field name (e.g. "email", "password", "confirm_password", "otp"). */
  field: string
  /** Human-readable message, with the pydantic "Value error, " prefix stripped. */
  message: string
}

export class AuthApiError extends Error {
  readonly status: number
  /** Populated when the backend returned field-level validation errors (FastAPI 422). */
  readonly fieldErrors: FieldValidationIssue[]
  constructor(message: string, status: number, fieldErrors: FieldValidationIssue[] = []) {
    super(message)
    this.name = 'AuthApiError'
    this.status = status
    this.fieldErrors = fieldErrors
  }
}

export class BackendUnavailableError extends Error {
  constructor(message = 'Auth service is unreachable. Make sure the backend is running, then retry.') {
    super(message)
    this.name = 'BackendUnavailableError'
  }
}

const TOKEN_KEY = 'osa-token'

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function storeToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token)
  } catch {
    // Storage unavailable: session stays in memory only
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    // ignore
  }
}

interface FastApiValidationItem {
  loc: (string | number)[]
  msg: string
  type?: string
}

function isValidationArray(value: unknown): value is FastApiValidationItem[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (item) =>
        typeof item === 'object' &&
        item !== null &&
        Array.isArray((item as FastApiValidationItem).loc) &&
        typeof (item as FastApiValidationItem).msg === 'string',
    )
  )
}

async function postJson<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new BackendUnavailableError()
  }
  if (!res.ok) {
    let detail: unknown
    try {
      detail = ((await res.json()) as { detail?: unknown }).detail
    } catch {
      // non-JSON error body: keep detail undefined
    }

    if (typeof detail === 'string') {
      throw new AuthApiError(detail, res.status)
    }
    // FastAPI 422 responses carry per-field validation errors.
    if (isValidationArray(detail)) {
      const fieldErrors: FieldValidationIssue[] = detail.map((item) => {
        const last = item.loc[item.loc.length - 1]
        return {
          field: typeof last === 'string' ? last : String(last),
          message: item.msg.replace(/^Value error,\s*/i, '').replace(/^Assertion failed,\s*/i, ''),
        }
      })
      const summary = fieldErrors.map((e) => e.message).join(' ')
      throw new AuthApiError(summary || `Request failed (${res.status}).`, res.status, fieldErrors)
    }
    throw new AuthApiError(`Request failed (${res.status}).`, res.status)
  }
  return (await res.json()) as T
}

interface TokenOnlyResponse {
  access_token: string
}

/** Step 1 of signup: validate payload server-side and email a 6-digit OTP. */
export async function requestSignupOtp(
  email: string,
  password: string,
  confirmPassword: string,
  signal?: AbortSignal,
): Promise<string> {
  const data = await postJson<{ message: string }>(
    '/api/v1/auth/signup',
    { email, password, confirm_password: confirmPassword },
    signal,
  )
  return data.message
}

/** Step 2 of signup: verify the OTP, persist the user, receive a JWT. */
export async function verifySignupOtp(
  email: string,
  otp: string,
  signal?: AbortSignal,
): Promise<string> {
  const data = await postJson<TokenOnlyResponse & { message: string }>(
    '/api/v1/auth/verify-signup-otp',
    { email, otp },
    signal,
  )
  return data.access_token
}

/** Verify credentials and receive a JWT. Throws AuthApiError(401) on bad credentials. */
export async function login(email: string, password: string, signal?: AbortSignal): Promise<string> {
  const data = await postJson<TokenOnlyResponse>('/api/v1/auth/login', { email, password }, signal)
  return data.access_token
}

/** Email a password-reset OTP. The backend intentionally never reveals account existence. */
export async function requestPasswordReset(email: string, signal?: AbortSignal): Promise<string> {
  const data = await postJson<{ message: string }>(
    '/api/v1/auth/forgot-password',
    { email },
    signal,
  )
  return data.message
}

/** Consume the reset OTP and set a new password. */
export async function resetPassword(
  email: string,
  otp: string,
  newPassword: string,
  signal?: AbortSignal,
): Promise<string> {
  const data = await postJson<{ message: string }>(
    '/api/v1/auth/reset-password',
    { email, otp, new_password: newPassword },
    signal,
  )
  return data.message
}

export interface UserProfile {
  id: string
  email: string
}

/** Fetch the authenticated profile; used to hydrate a stored session or finalize a fresh login. */
export async function fetchProfile(token: string | null = getStoredToken(), signal?: AbortSignal): Promise<UserProfile> {
  if (!token) throw new AuthApiError('No session token found.', 401)

  let res: Response
  try {
    res = await fetch(`${API_BASE_URL}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      signal,
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new BackendUnavailableError()
  }
  if (res.status === 401) throw new AuthApiError('Session expired.', 401)
  if (!res.ok) throw new AuthApiError(`Profile request failed (${res.status}).`, res.status)
  return (await res.json()) as UserProfile
}
