import * as React from 'react'
import { ArrowLeft, ArrowRight, Check, GitBranch, KeyRound, LogIn, MailCheck, UserPlus } from 'lucide-react'
import { Dialog, Button, Input } from '@/components/ui'
import {
  AuthApiError,
  BackendUnavailableError,
  fetchProfile,
  login as apiLogin,
  requestPasswordReset,
  requestSignupOtp,
  resetPassword,
  verifySignupOtp,
} from '@/lib/auth-api'
import { useAuthStore } from '@/lib/auth-store'

/**
 * Routes server-side field errors onto the matching form inputs.
 * Maps backend payload field names (pydantic) to this dialog's input ids.
 * Also routes known string-detail 400s (duplicate email, wrong OTP, password
 * mismatch) onto the field they belong to, by keyword.
 * Returns true when at least one field error was placed on an input.
 */
function applyServerFieldErrors(
  err: unknown,
  map: Record<string, string>,
  setFieldErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>,
): boolean {
  if (!(err instanceof AuthApiError)) return false

  const mapped: Record<string, string> = {}
  if (err.fieldErrors.length > 0) {
    for (const issue of err.fieldErrors) {
      const target = map[issue.field]
      if (target && !mapped[target]) mapped[target] = issue.message
    }
  } else if (err.status === 400) {
    // Backend business-rule errors arrive as plain strings; route by keyword.
    const msg = err.message.toLowerCase()
    if (msg.includes('email')) {
      const target = map['email']
      if (target) mapped[target] = err.message
    } else if (msg.includes('password')) {
      const target = map['password'] ?? map['confirm_password']
      if (target) mapped[target] = err.message
    } else if (msg.includes('otp') || msg.includes('code')) {
      const target = map['otp']
      if (target) mapped[target] = err.message
    }
  }

  if (Object.keys(mapped).length === 0) return false
  setFieldErrors((prev) => ({ ...prev, ...mapped }))
  return true
}

export type AuthMode = 'login' | 'signup'
export type AuthScreen = AuthMode | 'signup-otp' | 'forgot' | 'reset-otp'

export interface AuthDialogProps {
  open: boolean
  onClose: () => void
  /** Which tab is shown when the dialog opens. */
  initialMode?: AuthMode
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function Field(props: {
  label: string
  id: string
  type?: string
  placeholder: string
  autoComplete?: string
  required?: boolean
  hint?: React.ReactNode
  error?: string | null
  inputRef?: React.Ref<HTMLInputElement>
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={props.id} className="block text-[11px] font-semibold text-foreground">
        {props.label}
      </label>
      <Input
        ref={props.inputRef}
        id={props.id}
        name={props.id}
        type={props.type ?? 'text'}
        placeholder={props.placeholder}
        autoComplete={props.autoComplete}
        required={props.required ?? true}
        error={props.error}
      />
      {props.hint && !props.error && (
        <p className="text-[11px] leading-snug text-muted-foreground">{props.hint}</p>
      )}
      {props.error && (
        <p className="animate-fade-in text-[11px] font-medium text-accent-text">{props.error}</p>
      )}
    </div>
  )
}

function OtpField(props: {
  label: string
  id: string
  email: string
  onResend: () => void
  resending: boolean
  error?: string | null
  inputRef?: React.Ref<HTMLInputElement>
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={props.id} className="block text-[11px] font-semibold text-foreground">
        {props.label}
      </label>
      <Input
        ref={props.inputRef}
        id={props.id}
        name={props.id}
        type="text"
        inputMode="numeric"
        pattern="\d{6}"
        maxLength={6}
        autoComplete="one-time-code"
        placeholder="000000"
        required
        error={props.error}
        className="text-center font-mono text-lg tracking-[0.5em]"
      />
      <p className="text-[11px] leading-snug text-muted-foreground">
        Sent to <span className="font-semibold text-foreground">{props.email}</span> · expires in 5
        minutes.{' '}
        <button
          type="button"
          onClick={props.onResend}
          disabled={props.resending}
          className="font-medium text-accent-text hover:underline disabled:opacity-50"
        >
          {props.resending ? 'Sending…' : 'Resend code'}
        </button>
      </p>
      {props.error && (
        <p className="animate-fade-in text-[11px] font-medium text-accent-text">{props.error}</p>
      )}
    </div>
  )
}

function FormError({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p role="alert" className="animate-fade-in text-[11px] font-medium text-accent-text">
      {message}
    </p>
  )
}

export function AuthDialog({ open, onClose, initialMode = 'login' }: AuthDialogProps) {
  const [screen, setScreen] = React.useState<AuthScreen>(initialMode)
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({})
  const [formError, setFormError] = React.useState<string | null>(null)
  const [submitting, setSubmitting] = React.useState(false)
  const [resending, setResending] = React.useState(false)

  /** Email the OTP screens operate on. */
  const [pendingEmail, setPendingEmail] = React.useState('')
  /** Kept in memory (never persisted) so "resend code" can re-issue the signup OTP. */
  const pendingPasswordRef = React.useRef<string>('')

  /** Forgot-password flow state. */
  const [sentTo, setSentTo] = React.useState<string | null>(null)
  const [resetComplete, setResetComplete] = React.useState(false)

  const loginTabRef = React.useRef<HTMLInputElement>(null)
  const otpRef = React.useRef<HTMLInputElement>(null)
  const resetOtpRef = React.useRef<HTMLInputElement>(null)

  // Reset to the requested tab every time the dialog opens.
  React.useEffect(() => {
    if (open) {
      setScreen(initialMode)
      setFieldErrors({})
      setFormError(null)
      setSubmitting(false)
      setPendingEmail('')
      pendingPasswordRef.current = ''
      setSentTo(null)
      setResetComplete(false)
    }
  }, [open, initialMode])

  // Move focus to the first input of the active screen.
  React.useEffect(() => {
    if (!open) return
    if (screen === 'signup-otp') otpRef.current?.focus()
    else if (screen === 'reset-otp') resetOtpRef.current?.focus()
    else if (screen !== 'forgot') loginTabRef.current?.focus()
  }, [open, screen])

  const isLogin = screen === 'login'
  const isSignup = screen === 'signup'
  const isTabScreen = screen === 'login' || screen === 'signup'

  const switchTo = (next: AuthScreen) => {
    setFieldErrors({})
    setFormError(null)
    setScreen(next)
  }

  const finishSession = async (token: string) => {
    const profile = await fetchProfile(token)
    useAuthStore.getState().setSession(token, profile)
    onClose()
  }

  const toMessage = (err: unknown): string => {
    if (err instanceof AuthApiError || err instanceof BackendUnavailableError) return err.message
    if (err instanceof Error) return err.message
    return 'Something went wrong. Please try again.'
  }

  const handleLoginSignup = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const next: Record<string, string> = {}
    setFormError(null)

    const email = String(formData.get('auth-email') ?? '').trim()
    if (!EMAIL_PATTERN.test(email)) next['auth-email'] = 'Enter a valid email address.'

    const password = String(formData.get('auth-password') ?? '')

    if (isSignup) {
      if (password.length < 8) next['auth-password'] = 'Use at least 8 characters.'
      const confirm = String(formData.get('signup-confirm') ?? '')
      if (!next['auth-password'] && confirm !== password) {
        next['signup-confirm'] = "Passwords don't match."
      }
    }

    setFieldErrors(next)
    if (Object.keys(next).length > 0) return

    setSubmitting(true)
    try {
      if (isSignup) {
        await requestSignupOtp(email, password, String(formData.get('signup-confirm') ?? ''))
        pendingPasswordRef.current = password
        setPendingEmail(email)
        switchTo('signup-otp')
      } else {
        const token = await apiLogin(email, password)
        await finishSession(token)
      }
    } catch (err) {
      const fieldMap: Record<string, string> = isSignup
        ? { email: 'auth-email', password: 'auth-password', confirm_password: 'signup-confirm' }
        : { email: 'auth-email', password: 'auth-password' }
      if (!applyServerFieldErrors(err, fieldMap, setFieldErrors)) {
        setFormError(toMessage(err))
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleSignupOtp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const otp = String(new FormData(e.currentTarget).get('signup-otp') ?? '').trim()
    setFormError(null)
    if (!/^\d{6}$/.test(otp)) {
      setFieldErrors({ 'signup-otp': 'Enter the 6-digit code from your email.' })
      return
    }
    setFieldErrors({})
    setSubmitting(true)
    try {
      const token = await verifySignupOtp(pendingEmail, otp)
      await finishSession(token)
    } catch (err) {
      if (!applyServerFieldErrors(err, { otp: 'signup-otp', email: 'auth-email' }, setFieldErrors)) {
        setFormError(toMessage(err))
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleResendSignupOtp = async () => {
    if (!pendingEmail) return
    setResending(true)
    setFormError(null)
    try {
      await requestSignupOtp(pendingEmail, pendingPasswordRef.current, pendingPasswordRef.current)
    } catch (err) {
      setFormError(toMessage(err))
    } finally {
      setResending(false)
    }
  }

  const handleForgot = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const email = String(new FormData(e.currentTarget).get('forgot-email') ?? '').trim()
    setFormError(null)
    if (!EMAIL_PATTERN.test(email)) {
      setFieldErrors({ 'forgot-email': 'Enter a valid email address.' })
      return
    }
    setFieldErrors({})
    setSubmitting(true)
    try {
      await requestPasswordReset(email)
      setSentTo(email)
      // Stay on 'forgot': the success panel renders via the forgotSent flag.
    } catch (err) {
      if (!applyServerFieldErrors(err, { email: 'forgot-email' }, setFieldErrors)) {
        setFormError(toMessage(err))
      }
    } finally {
      setSubmitting(false)
    }
  }

  const forgotSent = screen === 'forgot' && sentTo !== null

  const handleResetOtp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!sentTo) return
    const formData = new FormData(e.currentTarget)
    const otp = String(formData.get('reset-otp') ?? '').trim()
    const newPassword = String(formData.get('reset-password') ?? '')
    const confirm = String(formData.get('reset-confirm') ?? '')
    setFormError(null)

    const next: Record<string, string> = {}
    if (!/^\d{6}$/.test(otp)) next['reset-otp'] = 'Enter the 6-digit reset code.'
    if (newPassword.length < 8) next['reset-password'] = 'Use at least 8 characters.'
    else if (confirm !== newPassword) next['reset-confirm'] = "Passwords don't match."
    setFieldErrors(next)
    if (Object.keys(next).length > 0) return

    setSubmitting(true)
    try {
      await resetPassword(sentTo, otp, newPassword)
      setResetComplete(true)
    } catch (err) {
      if (
        !applyServerFieldErrors(
          err,
          { otp: 'reset-otp', new_password: 'reset-password', email: 'forgot-email' },
          setFieldErrors,
        )
      ) {
        setFormError(toMessage(err))
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleResendResetOtp = async () => {
    if (!sentTo) return
    setResending(true)
    setFormError(null)
    try {
      await requestPasswordReset(sentTo)
    } catch (err) {
      setFormError(toMessage(err))
    } finally {
      setResending(false)
    }
  }

  const switchToForgot = () => {
    setSentTo(null)
    setResetComplete(false)
    switchTo('forgot')
  }

  const switchToLogin = () => {
    setSentTo(null)
    setResetComplete(false)
    switchTo('login')
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      ariaLabel={
        screen === 'signup-otp'
          ? 'Verify your email'
          : screen === 'reset-otp'
            ? 'Set a new password'
            : forgotSent
              ? 'Check your inbox'
              : screen === 'forgot'
                ? 'Reset your password'
                : isLogin
                  ? 'Log in to OpenSource Assist'
                  : 'Create your OpenSource Assist account'
      }
      className="sm:max-h-[calc(100dvh-2.5rem)]"
    >
      <div className="auth-body p-5 sm:p-6">
        {/* Tab switcher — only on the two main tabs */}
        {isTabScreen && (
          <div
            role="tablist"
            aria-label="Authentication mode"
            className="grid grid-cols-2 gap-0 rounded-lg border border-border bg-background p-1"
          >
            <button
              type="button"
              role="tab"
              id="tab-login"
              aria-controls="panel-auth"
              aria-selected={isLogin}
              onClick={() => switchTo('login')}
              className={`inline-flex h-8 items-center justify-center gap-2 rounded-md text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                isLogin ? 'bg-accent text-on-accent shadow-accent-glow' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <LogIn className="size-4" aria-hidden="true" />
              Log in
            </button>
            <button
              type="button"
              role="tab"
              id="tab-signup"
              aria-controls="panel-auth"
              aria-selected={isSignup}
              onClick={() => switchTo('signup')}
              className={`inline-flex h-8 items-center justify-center gap-2 rounded-md text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                isSignup ? 'bg-accent text-on-accent shadow-accent-glow' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <UserPlus className="size-4" aria-hidden="true" />
              Sign up
            </button>
          </div>
        )}

        {/* Signup OTP verification */}
        {screen === 'signup-otp' && (
          <div key="signup-otp" className="animate-fade-up">
            <button
              type="button"
              onClick={() => switchTo('signup')}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-accent-text"
            >
              <ArrowLeft className="size-3.5" aria-hidden="true" />
              Change email
            </button>
            <h2 className="mt-4 flex items-center gap-2 text-xl font-bold tracking-tight">
              <MailCheck className="size-5 text-accent-text" aria-hidden="true" />
              Verify your email
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              One last step — enter the 6-digit code we emailed you to activate your account.
            </p>
            <form onSubmit={handleSignupOtp} className="mt-5 space-y-4" noValidate>
              <OtpField
                label="Verification code"
                id="signup-otp"
                email={pendingEmail}
                onResend={handleResendSignupOtp}
                resending={resending}
                error={fieldErrors['signup-otp']}
                inputRef={otpRef}
              />
              <FormError message={formError} />
              <Button type="submit" className="h-9 w-full" disabled={submitting}>
                {submitting ? 'Verifying…' : 'Verify & create account'}
                {!submitting && <ArrowRight className="size-4" aria-hidden="true" />}
              </Button>
            </form>
          </div>
        )}

        {/* Forgot-password success state */}
        {forgotSent && !resetComplete && (
          <div key="sent" className="animate-fade-up py-8 text-center">
            <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-accent/15 text-accent-text">
              <Check className="size-7" aria-hidden="true" />
            </span>
            <h2 className="mt-5 text-xl font-bold tracking-tight">Check your inbox</h2>
            <p className="mx-auto mt-2 max-w-[38ch] text-sm leading-relaxed text-muted-foreground">
              If an account exists for <span className="font-semibold text-foreground">{sentTo}</span>,
              a reset code is on its way. It expires in 5 minutes.
            </p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-6"
              onClick={() => switchTo('reset-otp')}
            >
              Enter reset code
              <ArrowRight className="size-4" aria-hidden="true" />
            </Button>
          </div>
        )}

        {/* Reset success state */}
        {forgotSent && resetComplete && (
          <div key="reset-done" className="animate-fade-up py-8 text-center">
            <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-accent/15 text-accent-text">
              <Check className="size-7" aria-hidden="true" />
            </span>
            <h2 className="mt-5 text-xl font-bold tracking-tight">Password updated</h2>
            <p className="mx-auto mt-2 max-w-[38ch] text-sm leading-relaxed text-muted-foreground">
              Your password has been reset. Log in with your new password.
            </p>
            <Button variant="secondary" size="sm" className="mt-6" onClick={switchToLogin}>
              <ArrowLeft className="size-4" aria-hidden="true" />
              Back to log in
            </Button>
          </div>
        )}

        {/* Forgot-password form */}
        {screen === 'forgot' && !forgotSent && (
          <div key="forgot" className="animate-fade-up">
            <button
              type="button"
              onClick={switchToLogin}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-accent-text"
            >
              <ArrowLeft className="size-3.5" aria-hidden="true" />
              Back to log in
            </button>
            <h2 className="mt-4 flex items-center gap-2 text-xl font-bold tracking-tight">
              <KeyRound className="size-5 text-accent-text" aria-hidden="true" />
              Reset your password
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Enter the email you signed up with and we'll send you a 6-digit reset code.
            </p>
            <form onSubmit={handleForgot} className="mt-5 space-y-4" noValidate>
              <Field
                label="Email"
                id="forgot-email"
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                error={fieldErrors['forgot-email']}
              />
              <FormError message={formError} />
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? 'Sending…' : 'Send reset code'}
                {!submitting && <ArrowRight className="size-4" aria-hidden="true" />}
              </Button>
            </form>
          </div>
        )}

        {/* Reset OTP form */}
        {screen === 'reset-otp' && sentTo && (
          <div key="reset-otp" className="animate-fade-up">
            <button
              type="button"
              onClick={switchToForgot}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-accent-text"
            >
              <ArrowLeft className="size-3.5" aria-hidden="true" />
              Use a different email
            </button>
            <h2 className="mt-4 flex items-center gap-2 text-xl font-bold tracking-tight">
              <KeyRound className="size-5 text-accent-text" aria-hidden="true" />
              Set a new password
            </h2>
            <form onSubmit={handleResetOtp} className="mt-5 space-y-4" noValidate>
              <OtpField
                label="Reset code"
                id="reset-otp"
                email={sentTo}
                onResend={handleResendResetOtp}
                resending={resending}
                error={fieldErrors['reset-otp']}
                inputRef={resetOtpRef}
              />
              <div className="grid grid-cols-2 gap-3">
                <Field
                  label="New password"
                  id="reset-password"
                  type="password"
                  placeholder="••••••••"
                  autoComplete="new-password"
                  error={fieldErrors['reset-password']}
                />
                <Field
                  label="Confirm"
                  id="reset-confirm"
                  type="password"
                  placeholder="••••••••"
                  autoComplete="new-password"
                  error={fieldErrors['reset-confirm']}
                />
              </div>
              <FormError message={formError} />
              <Button type="submit" className="h-9 w-full" disabled={submitting}>
                {submitting ? 'Saving…' : 'Reset password'}
                {!submitting && <ArrowRight className="size-4" aria-hidden="true" />}
              </Button>
            </form>
          </div>
        )}

        {/* Login / signup tabpanel */}
        {isTabScreen && (
          <div
            key={screen}
            id="panel-auth"
            role="tabpanel"
            aria-labelledby={isLogin ? 'tab-login' : 'tab-signup'}
            className="animate-fade-up"
          >
            <h2 className="mt-4 text-xl font-bold tracking-tight">
              {isLogin ? 'Welcome back' : 'Create your account'}
            </h2>
            <p className="auth-desc mt-0.5 text-sm leading-relaxed text-muted-foreground">
              {isLogin
                ? 'Log in to track quests, badges and your roadmap.'
                : 'Join free — we email you a code to verify your address.'}
            </p>

            <form onSubmit={handleLoginSignup} className="mt-3 space-y-3" noValidate>
              <Field
                label="Email"
                id="auth-email"
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                error={fieldErrors['auth-email']}
                inputRef={loginTabRef}
              />
              <Field
                label="Password"
                id="auth-password"
                type="password"
                placeholder="••••••••"
                autoComplete={isSignup ? 'new-password' : 'current-password'}
                error={fieldErrors['auth-password']}
              />
              {isSignup && (
                <Field
                  label="Confirm password"
                  id="signup-confirm"
                  type="password"
                  placeholder="••••••••"
                  autoComplete="new-password"
                  error={fieldErrors['signup-confirm']}
                />
              )}

              {isLogin && (
                <div className="flex items-center justify-end">
                  <button
                    type="button"
                    onClick={switchToForgot}
                    className="text-xs font-medium text-accent-text hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>
              )}

              {isSignup && (
                <p className="text-[11px] leading-snug text-muted-foreground">
                  <span className="font-mono text-[10px] font-semibold text-accent-text">min 8 chars</span>{' '}
                  · By signing up you agree to our{' '}
                  <a href="#" className="font-medium text-accent-text hover:underline">
                    Terms
                  </a>{' '}
                  and{' '}
                  <a href="#" className="font-medium text-accent-text hover:underline">
                    Privacy Policy
                  </a>
                  .
                </p>
              )}

              <FormError message={formError} />

              <Button type="submit" className="h-9 w-full" disabled={submitting}>
                {submitting
                  ? isSignup
                    ? 'Sending code…'
                    : 'Logging in…'
                  : isLogin
                    ? 'Log in'
                    : 'Send verification code'}
                {!submitting && <ArrowRight className="size-4" aria-hidden="true" />}
              </Button>
            </form>

            {/* Divider + GitHub OAuth */}
            <div className="mt-3 flex items-center gap-3">
              <span className="h-px flex-1 bg-border" />
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">or</span>
              <span className="h-px flex-1 bg-border" />
            </div>

            <Button type="button" variant="secondary" className="mt-2.5 h-9 w-full">
              <GitBranch className="size-4" aria-hidden="true" />
              Continue with GitHub
            </Button>

            <p className="auth-switch mt-3 text-center text-xs text-muted-foreground">
              {isLogin ? "Don't have an account? " : 'Already have an account? '}
              <button
                type="button"
                onClick={() => switchTo(isLogin ? 'signup' : 'login')}
                className="font-semibold text-accent-text hover:underline"
              >
                {isLogin ? 'Sign up' : 'Log in'}
              </button>
            </p>
          </div>
        )}
      </div>

      {/* Footer strip */}
      <div className="auth-footer border-t border-border px-6 py-2.5 sm:px-7">
        <p className="flex items-center justify-between font-mono text-[10px] text-muted-foreground">
          <span>email-verified accounts · JWT sessions</span>
          <span className="text-accent-text">v2.0</span>
        </p>
      </div>
    </Dialog>
  )
}

export default AuthDialog
