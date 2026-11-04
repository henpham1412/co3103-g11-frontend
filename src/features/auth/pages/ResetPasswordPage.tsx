import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Alert, Button, Form, Input } from 'antd'
import { Link, useNavigate } from 'react-router-dom'
import { passwordRecoveryApi } from '@/api/passwordRecoveryApi'
import { AuthLayout } from '@/components/layout/AuthLayout'
import { useAuth } from '@/hooks/useAuth'
import { PasswordChecklist } from '../components/PasswordChecklist'
import { useResetToken } from '../hooks/useResetToken'
import { authRule, validateConfirmPassword } from '../utils/authValidation'
import { recoveryErrorPresentation, resetSuccessMessage, type RecoveryFeedback } from '../utils/passwordRecoveryErrors'
import { validateResetPassword, validateResetToken } from '../utils/passwordRecoveryValidation'
import type { ResetToken } from '../utils/resetToken'

interface ResetValues { token?: string; newPassword: string; confirmPassword: string }

function ResetPasswordForm({ selection, clear }: { selection: ResetToken; clear: () => void }) {
  const [form] = Form.useForm<ResetValues>()
  const password = Form.useWatch('newPassword', form)
  const { state } = useAuth()
  const latestStatus = useRef(state.status)
  useLayoutEffect(() => { latestStatus.current = state.status }, [state.status])
  const navigate = useNavigate()
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [feedback, setFeedback] = useState<RecoveryFeedback>()
  const pending = useRef<AbortController | null>(null)
  const active = useRef(false)
  const banner = useRef<HTMLDivElement>(null)
  const manual = selection.kind !== 'token'
  useEffect(() => {
    active.current = true
    return () => { active.current = false; pending.current?.abort() }
  }, [])
  useEffect(() => {
    if (submitting) return
    if (feedback?.field) form.focusField(feedback.field)
    else if (feedback?.message || success) banner.current?.focus()
  }, [feedback, form, submitting, success])

  async function submit(values: ResetValues) {
    if (pending.current) return
    const token = selection.kind === 'token' ? selection.token : values.token ?? ''
    if (validateResetToken(token)) return
    const controller = new AbortController()
    pending.current = controller
    setSubmitting(true)
    setFeedback(undefined)
    try {
      await passwordRecoveryApi.resetPassword({ token, newPassword: values.newPassword }, controller.signal)
      if (!active.current || controller.signal.aborted) return
      form.setFieldsValue({ token: '', newPassword: '', confirmPassword: '' })
      setSuccess(true)
      clear()
      if (latestStatus.current === 'anonymous') void navigate('/login', { replace: true, state: { message: resetSuccessMessage } })
    } catch (error) {
      if (!active.current || controller.signal.aborted) return
      const result = recoveryErrorPresentation(error, 'reset', manual)
      form.setFields((result.fields ?? []).flatMap(field => field.name !== 'email' ? [{ name: field.name, errors: field.errors }] : []))
      setFeedback(result)
    } finally {
      if (pending.current === controller) {
        pending.current = null
        if (active.current) setSubmitting(false)
      }
    }
  }

  return <AuthLayout variant="recovery">
    <p className="recovery-step">Step 2 of 2 · Choose a new password</p>
    <h1 id="auth-title" className="auth-title">Reset your password</h1>
    {success ? <>
      <div ref={banner} role="status" tabIndex={-1}><Alert type="success" title={resetSuccessMessage} showIcon role="presentation" /></div>
      <Link to={state.status === 'authenticated' ? '/profile' : '/login'}>{state.status === 'authenticated' ? 'Back to profile' : 'Back to sign in'}</Link>
    </> : <>
      <p className="auth-subtitle">Choose a strong password for your central account.</p>
      {selection.kind === 'ambiguous' && <Alert type="info" title="This link contains multiple tokens. Please enter the token from your email." role="note" />}
      {feedback?.message && <div ref={banner} role="alert" tabIndex={-1}><Alert type="error" title={feedback.message} showIcon role="presentation" /></div>}
      <Form form={form} name="reset" layout="vertical" requiredMark={false} onFinish={submit} scrollToFirstError={{ focus: true }}
        disabled={submitting} aria-label="Reset password" aria-busy={submitting} noValidate>
        {manual && <Form.Item name="token" label="Reset token" rules={[authRule(validateResetToken)]}>
          <Input.Password autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="Paste the token from your email" />
        </Form.Item>}
        <Form.Item name="newPassword" label="New password" rules={[authRule(validateResetPassword)]}>
          <Input.Password autoComplete="new-password" aria-describedby="reset-requirements" />
        </Form.Item>
        <div id="reset-requirements"><PasswordChecklist mode="reset" password={password} /></div>
        <Form.Item name="confirmPassword" label="Confirm password" dependencies={['newPassword']} rules={[authRule(value => validateConfirmPassword(value, form.getFieldValue('newPassword')))]}>
          <Input.Password autoComplete="new-password" />
        </Form.Item>
        <Button type="primary" htmlType="submit" block loading={submitting}>Reset password</Button>
      </Form>
      <p className="auth-footer"><Link to="/forgot-password">Request a new reset link</Link> · <Link to="/login">Back to sign in</Link></p>
    </>}
  </AuthLayout>
}

export default function ResetPasswordPage() {
  const { selection, revision, clear } = useResetToken()
  return <ResetPasswordForm key={revision} selection={selection} clear={clear} />
}
