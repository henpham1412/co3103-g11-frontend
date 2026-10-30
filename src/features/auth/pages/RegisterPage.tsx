import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Form, Input } from 'antd'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { authApi } from '@/api/authApi'
import { normalizeApiError } from '@/api/apiError'
import { AuthLayout } from '@/components/layout/AuthLayout'
import type { RegisterRequest } from '@/types/auth'
import { isRecord } from '@/utils/authValidation'
import { PasswordChecklist } from '../components/PasswordChecklist'
import {
  authRule, normalizeEmail, validateConfirmPassword, validateEmail,
  validateFullName, validateRegisterPassword,
} from '../utils/authValidation'
import { authFormErrors, type AuthField } from '../utils/authFormErrors'
import { returnDestination } from '../utils/returnDestination'

interface RegisterValues extends RegisterRequest {
  confirmPassword: string
}

const fieldNames = ['fullName', 'email', 'password', 'confirmPassword'] as const

export default function RegisterPage() {
  const [form] = Form.useForm<RegisterValues>()
  const password = Form.useWatch('password', form) as string | undefined
  const navigate = useNavigate()
  const location = useLocation()
  const from = returnDestination(isRecord(location.state) ? location.state.from : undefined)
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<{ message?: string; field?: AuthField }>()
  const errorRef = useRef<HTMLDivElement>(null)
  const pending = useRef<AbortController | null>(null)

  useEffect(() => () => { pending.current?.abort() }, [])

  useEffect(() => {
    if (submitting) return
    if (feedback?.field) form.focusField(feedback.field)
    else if (feedback?.message) errorRef.current?.focus()
  }, [feedback, form, submitting])

  async function submit(values: RegisterValues) {
    if (pending.current) return
    const controller = new AbortController()
    pending.current = controller
    setSubmitting(true)
    setFeedback(undefined)
    const email = normalizeEmail(values.email)
    try {
      await authApi.register({ fullName: values.fullName.trim(), email, password: values.password }, controller.signal)
      if (!controller.signal.aborted) {
        void navigate('/login', {
          replace: true,
          state: { email, from, message: 'Your account has been created successfully. Please sign in.', messageType: 'success' },
        })
      }
    } catch (failure) {
      if (controller.signal.aborted) return
      const problem = normalizeApiError(failure, '/auth/register')
      if (problem.status === 0 || problem.status >= 500) {
        setFeedback({ message: problem.status === 0 ? problem.message : 'The registration service is temporarily unavailable. Please try again later.' })
        return
      }
      if (problem.status === 409) {
        form.setFields([{ name: 'email', errors: ['An account with this email already exists.'] }])
        setFeedback({ field: 'email' })
        return
      }
      let field: AuthField | undefined
      if (problem.status === 400) {
        const { fields, hasUnbound } = authFormErrors(problem, fieldNames)
        form.setFields(fields)
        const first = fields.find(field => field.errors.length)
        field = first?.name
        if (first && !hasUnbound) {
          setFeedback({ field })
          return
        }
      }
      setFeedback({ field, message: problem.status === 429 ? 'Too many registration attempts. Please try again later.'
        : 'Unable to create your account. Please check your details and try again.' })
    } finally {
      pending.current = null
      if (!controller.signal.aborted) setSubmitting(false)
    }
  }

  return (
    <AuthLayout
      variant="register"
      notice={<Alert className="auth-notice" type="info" role="note" showIcon title="Central Identity · SSO Provider - Your account works across all G11 LMS services" />}
    >
      <h1 id="auth-title" className="auth-title">Create Central Account</h1>
      <p className="auth-subtitle">One account for all your G11 LMS services.</p>
      {feedback?.message && (
        <div ref={errorRef} className="auth-alert" role="alert" tabIndex={-1}>
          <Alert type="error" title={feedback.message} showIcon role="presentation" />
        </div>
      )}
      <Form<RegisterValues>
        form={form}
        name="register"
        layout="vertical"
        requiredMark={false}
        onFinish={submit}
        scrollToFirstError={{ focus: true }}
        disabled={submitting}
        aria-label="Create account"
        aria-busy={submitting}
        noValidate
      >
        <Form.Item name="fullName" label="Full Name" rules={[authRule(validateFullName)]}>
          <Input autoComplete="name" placeholder="Enter your full name" />
        </Form.Item>
        <Form.Item name="email" label="Email" rules={[authRule(validateEmail)]}>
          <Input type="email" autoComplete="email" placeholder="you@example.com" autoCapitalize="none" spellCheck={false} />
        </Form.Item>
        <Form.Item name="password" label="Password" rules={[authRule(validateRegisterPassword)]} extra={<PasswordChecklist password={password} />}>
          <Input.Password autoComplete="new-password" placeholder="Create a password" />
        </Form.Item>
        <Form.Item
          name="confirmPassword"
          label="Confirm Password"
          dependencies={['password']}
          rules={[authRule(value => validateConfirmPassword(value, form.getFieldValue('password') as string | undefined))]}
        >
          <Input.Password autoComplete="new-password" placeholder="Re-enter your password" />
        </Form.Item>
        <Button type="primary" htmlType="submit" block loading={submitting} className="auth-submit">Create Account</Button>
      </Form>
      <p className="auth-footer">Already have an account? <Link to="/login" state={{ from }}>Sign in</Link></p>
    </AuthLayout>
  )
}
