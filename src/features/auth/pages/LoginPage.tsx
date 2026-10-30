import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Checkbox, Form, Input } from 'antd'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { normalizeApiError } from '@/api/apiError'
import { AuthLayout } from '@/components/layout/AuthLayout'
import { useAuth } from '@/hooks/useAuth'
import { isRecord } from '@/utils/typeGuards'
import { ForgotPasswordNotice } from '../components/ForgotPasswordNotice'
import { authRule, normalizeEmail, validateEmail, validateLoginPassword } from '../utils/authValidation'
import { authFormErrors, type AuthField } from '../utils/authFormErrors'
import { loginErrorMessage } from '../utils/authErrorPresentation'
import { returnDestination } from '../utils/returnDestination'

interface LoginValues {
  email: string
  password: string
  rememberMe: boolean
}

export default function LoginPage() {
  const [form] = Form.useForm<LoginValues>()
  const { login, state } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const navigationState = isRecord(location.state) ? location.state : {}
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<{ message?: string; field?: AuthField }>()
  const [forgotOpen, setForgotOpen] = useState(false)
  const errorRef = useRef<HTMLDivElement>(null)
  const active = useRef(false)
  const pending = useRef<AbortController | null>(null)

  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
      pending.current?.abort()
    }
  }, [])

  useEffect(() => {
    if (submitting) return
    if (feedback?.field) form.focusField(feedback.field)
    else if (feedback?.message) errorRef.current?.focus()
  }, [feedback, form, submitting])

  const sessionExpired = state.status === 'anonymous' && (state.reason === 'expired' || state.reason === 'unauthorized')
  const flash = typeof navigationState.message === 'string' && navigationState.message.trim()
    ? navigationState.message : sessionExpired ? 'Your session has expired. Please sign in again.' : undefined
  const flashType = navigationState.messageType === 'info' || sessionExpired ? 'info' : 'success'

  async function submit(values: LoginValues) {
    if (pending.current) return
    const controller = new AbortController()
    pending.current = controller
    setSubmitting(true)
    setFeedback(undefined)
    try {
      await login({ email: normalizeEmail(values.email), password: values.password }, values.rememberMe, controller.signal)
      if (active.current) void navigate(returnDestination(navigationState.from), { replace: true })
    } catch (failure) {
      if (!active.current || controller.signal.aborted) return
      const problem = normalizeApiError(failure, '/auth/login')
      let field: AuthField | undefined
      if (problem.status === 400) {
        const { fields, hasUnbound } = authFormErrors(problem, ['email', 'password'])
        form.setFields(fields)
        const first = fields.find(field => field.errors.length)
        field = first?.name
        if (first && !hasUnbound) {
          setFeedback({ field })
          return
        }
      }
      setFeedback({ field, message: loginErrorMessage(problem) })
    } finally {
      pending.current = null
      if (active.current) setSubmitting(false)
    }
  }

  return (
    <AuthLayout notice={<Alert className="auth-notice" type="info" role="note" title="Central Identity Service" description="Sign in once with your central account credentials to access all authorized tutoring workspaces." />}>
      <h1 id="auth-title" className="auth-title">Sign In to G11 LMS</h1>
      <p className="auth-subtitle">Enter your credentials to access your courses and dashboard</p>
      {flash && <Alert className="auth-alert" type={flashType} title={flash} showIcon role="status" />}
      {feedback?.message && (
        <div ref={errorRef} className="auth-alert" role="alert" tabIndex={-1}>
          <Alert type="error" title={feedback.message} showIcon role="presentation" />
        </div>
      )}
      <Form<LoginValues>
        form={form}
        name="login"
        layout="vertical"
        requiredMark={false}
        initialValues={{ email: typeof navigationState.email === 'string' ? normalizeEmail(navigationState.email) : '', rememberMe: false }}
        onFinish={submit}
        scrollToFirstError={{ focus: true }}
        disabled={submitting}
        aria-label="Sign in"
        aria-busy={submitting}
        noValidate
      >
        <Form.Item name="email" label="Email" rules={[authRule(validateEmail)]}>
          <Input type="email" autoComplete="username" placeholder="you@example.com" autoCapitalize="none" spellCheck={false} />
        </Form.Item>
        <Form.Item name="password" label="Password" rules={[authRule(validateLoginPassword)]}>
          <Input.Password autoComplete="current-password" placeholder="Enter your password" />
        </Form.Item>
        <div className="auth-options">
          <Form.Item name="rememberMe" valuePropName="checked">
            <Checkbox>Remember me</Checkbox>
          </Form.Item>
          <Button type="link" className="auth-forgot" onClick={() => setForgotOpen(true)}>Forgot password?</Button>
        </div>
        <Button type="primary" htmlType="submit" block loading={submitting} className="auth-submit">Sign In to LMS</Button>
      </Form>
      <p className="auth-footer">Don’t have an account? <Link to="/register" state={{ from: returnDestination(navigationState.from) }}>Create account</Link></p>
      <ForgotPasswordNotice open={forgotOpen} onClose={() => setForgotOpen(false)} />
    </AuthLayout>
  )
}
