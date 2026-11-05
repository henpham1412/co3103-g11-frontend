import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Form, Input } from 'antd'
import type { User } from '@/types/auth'
import type { ProfileField, ProfileFormValues } from '@/types/profile'
import { buildProfileChanges, toProfileFormValues } from '../utils/profileForm'
import { localToday, profileLengthLimits } from '../utils/profileValidation'
import type { ProfileFeedback } from '../utils/profileErrors'

interface Props {
  user: User
  busy: boolean
  locked: boolean
  feedback?: ProfileFeedback
  onSave(values: ProfileFormValues): Promise<void>
  onCancel(): void
  onEdit?(): void
}

const labels: Record<ProfileField, string> = { fullName: 'Full Name', avatarUrl: 'Avatar URL', bio: 'Bio', phoneNumber: 'Phone number', dateOfBirth: 'Date of birth', locale: 'Locale', timezone: 'Timezone' }

export function ProfileForm({ user, busy, locked, feedback, onSave, onCancel, onEdit }: Props) {
  const [baseline] = useState(() => toProfileFormValues(user))
  const [draft, setDraft] = useState(baseline)
  const [form] = Form.useForm<ProfileFormValues>()
  const banner = useRef<HTMLDivElement>(null)
  const additional = useRef<HTMLDetailsElement>(null)
  const changes = buildProfileChanges(baseline, draft)
  useEffect(() => {
    form.setFields(feedback?.fields ?? [])
    if (feedback?.field) form.focusField(feedback.field)
    else if (feedback?.message) banner.current?.focus()
  }, [feedback, form])

  function renderField(field: ProfileField) {
    return <Form.Item key={field} name={field} label={labels[field]} rules={[{
        required: field === 'fullName',
        validator: (_rule, value: unknown) => {
          const result = buildProfileChanges(baseline, { ...baseline, [field]: value })
          return result.kind === 'invalid' && result.errors[field] ? Promise.reject(new Error(result.errors[field])) : Promise.resolve()
        },
      }]}>
        {field === 'bio' ? <Input.TextArea rows={4} placeholder="Tell us about yourself" /> : <Input
          type={field === 'dateOfBirth' ? 'date' : field === 'avatarUrl' ? 'url' : field === 'phoneNumber' ? 'tel' : 'text'}
          max={field === 'dateOfBirth' ? localToday() : undefined}
          maxLength={profileLengthLimits[field]?.max}
          autoComplete={field === 'fullName' ? 'name' : field === 'phoneNumber' ? 'tel' : 'off'}
          autoCapitalize={field === 'avatarUrl' || field === 'locale' || field === 'timezone' ? 'none' : undefined}
          spellCheck={field === 'avatarUrl' ? false : undefined} />}
      </Form.Item>
  }

  return <section className="profile-card profile-personal" aria-labelledby="profile-edit-title">
    <div className="profile-card-heading">
      <h2 id="profile-edit-title">Personal Information</h2>
      <p className="profile-muted">Update your personal details and how others see you on the platform.</p>
    </div>
    {feedback?.message && <div ref={banner} role="alert" tabIndex={-1}><Alert type="error" title={feedback.message} showIcon role="presentation" /></div>}
    <Form form={form} name="profile" initialValues={baseline} layout="vertical" requiredMark={false} disabled={busy || locked}
      onValuesChange={(_, values) => { setDraft(values); onEdit?.() }} aria-label="Edit profile" aria-busy={busy} scrollToFirstError={{ focus: true }} noValidate
      onFinishFailed={({ errorFields }) => {
        if (additional.current) additional.current.open = true
        if (errorFields[0]) form.scrollToField(errorFields[0].name, { focus: true })
      }}
      onFinish={async values => { if (!busy && !locked && buildProfileChanges(baseline, values).kind === 'changed') await onSave(values) }}>
      {renderField('fullName')}
      <Form.Item label="Email Address" htmlFor="profile-email" extra={<span id="profile-email-help">Central email address cannot be changed directly.</span>}>
        <Input id="profile-email" type="email" value={user.email} readOnly aria-describedby="profile-email-help" className="profile-readonly" />
      </Form.Item>
      {renderField('bio')}
      <details ref={additional} className="profile-additional" open={feedback?.field && !['fullName', 'bio'].includes(feedback.field) ? true : undefined}>
        <summary>Additional details <span>Contact, photo & preferences</span></summary>
        <div className="profile-additional-fields">
          <p className="profile-muted">Leave an optional field blank to remove its saved value.</p>
          {renderField('avatarUrl')}
          <div className="profile-field-pair">{renderField('phoneNumber')}{renderField('dateOfBirth')}</div>
          <div className="profile-field-pair">{renderField('locale')}{renderField('timezone')}</div>
        </div>
      </details>
      <div className="profile-form-actions">
        <Button type="primary" htmlType="submit" loading={busy} disabled={busy || locked || changes.kind === 'unchanged'}>Save Changes</Button>
        <Button onClick={() => { form.resetFields(); setDraft(baseline); onCancel() }} disabled={busy || locked}>Cancel</Button>
      </div>
    </Form>
  </section>
}
