import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Form, Input } from 'antd'
import { Link, useLocation } from 'react-router-dom'
import { passwordRecoveryApi } from '@/api/passwordRecoveryApi'
import { AuthLayout } from '@/components/layout/AuthLayout'
import { isRecord } from '@/utils/typeGuards'
import { authRule, normalizeEmail, validateEmail } from '../utils/authValidation'
import { forgotSuccessMessage, recoveryErrorPresentation, type RecoveryFeedback } from '../utils/passwordRecoveryErrors'
import { returnDestination } from '../utils/returnDestination'

export default function ForgotPasswordPage() {
  const [form] = Form.useForm<{ email: string }>()
  const location = useLocation()
  const navigation = isRecord(location.state) ? location.state : {}
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [feedback, setFeedback] = useState<RecoveryFeedback>()
  const pending = useRef<AbortController | null>(null)
  const banner = useRef<HTMLDivElement>(null)
  const active = useRef(false)
  useEffect(() => {
    active.current = true
    return () => { active.current = false; pending.current?.abort() }
  }, [])
  useEffect(() => {
    if (submitting) return
    if (feedback?.field) form.focusField(feedback.field)
    else if (feedback?.message || success) banner.current?.focus()
  }, [feedback, form, submitting, success])

  async function submit({ email }: { email: string }) {
    if (pending.current) return
    const controller = new AbortController()
    pending.current = controller
    setSubmitting(true)
    setFeedback(undefined)
    try {
      await passwordRecoveryApi.forgotPassword({ email: normalizeEmail(email) }, controller.signal)
      if (active.current && !controller.signal.aborted) setSuccess(true)
    } catch (error) {
      if (!active.current || controller.signal.aborted) return
      const result = recoveryErrorPresentation(error, 'forgot')
      form.setFields((result.fields ?? []).flatMap(field => field.name === 'email' ? [{ name: 'email' as const, errors: field.errors }] : []))
      setFeedback(result)
    } finally {
      if (pending.current === controller) {
        pending.current = null
        if (active.current) setSubmitting(false)
      }
    }
  }

  return <AuthLayout variant="recovery">
    <p className="recovery-step">Step 1 of 2 · Request a reset link</p>
    <h1 id="auth-title" className="auth-title">Forgot your password?</h1>
    <p className="auth-subtitle">Enter your central account email to request password reset instructions.</p>
    {success ? <>
      <div ref={banner} role="status" tabIndex={-1}><Alert type="success" showIcon title={forgotSuccessMessage} role="presentation" /></div>
      <Button block onClick={() => { setSuccess(false); setFeedback(undefined) }}>Use another email</Button>
    </> : <>
      {feedback?.message && <div ref={banner} role="alert" tabIndex={-1}><Alert type="error" showIcon title={feedback.message} role="presentation" /></div>}
      <Form form={form} name="forgot" layout="vertical" requiredMark={false} initialValues={{ email: typeof navigation.email === 'string' ? normalizeEmail(navigation.email) : '' }}
        onFinish={submit} scrollToFirstError={{ focus: true }} disabled={submitting} aria-label="Request password reset" aria-busy={submitting} noValidate>
        <Form.Item name="email" label="Email" rules={[authRule(validateEmail)]}>
          <Input type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} placeholder="you@example.com" />
        </Form.Item>
        <Button type="primary" htmlType="submit" block loading={submitting}>Send reset link</Button>
      </Form>
    </>}
    <p className="auth-footer"><Link to="/reset-password">Enter a reset token</Link> · <Link to="/login" state={{ from: returnDestination(navigation.from) }}>Back to sign in</Link></p>
  </AuthLayout>
}
