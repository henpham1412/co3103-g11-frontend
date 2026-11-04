import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Form, Input } from 'antd'
import type { User } from '@/types/auth'
import { profileFields, type ProfileField, type ProfileFormValues } from '@/types/profile'
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
}

const labels: Record<ProfileField, string> = { fullName: 'Full name', avatarUrl: 'Avatar URL', bio: 'Bio', phoneNumber: 'Phone number', dateOfBirth: 'Date of birth', locale: 'Locale', timezone: 'Timezone' }

export function ProfileForm({ user, busy, locked, feedback, onSave, onCancel }: Props) {
  const [baseline] = useState(() => toProfileFormValues(user))
  const [draft, setDraft] = useState(baseline)
  const [form] = Form.useForm<ProfileFormValues>()
  const banner = useRef<HTMLDivElement>(null)
  const changes = buildProfileChanges(baseline, draft)
  useEffect(() => {
    form.setFields(feedback?.fields ?? [])
    if (feedback?.field) form.focusField(feedback.field)
    else if (feedback?.message) banner.current?.focus()
  }, [feedback, form])

  return <section className="profile-card" aria-labelledby="profile-edit-title">
    <h2 id="profile-edit-title">Edit profile</h2>
    <p className="profile-muted">Email and account status are managed by Central Identity. Leave an optional field blank to remove its saved value. Full name is required.</p>
    {feedback?.message && <div ref={banner} role="alert" tabIndex={-1}><Alert type="error" title={feedback.message} showIcon role="presentation" /></div>}
    <Form form={form} name="profile" initialValues={baseline} layout="vertical" requiredMark={false} disabled={busy || locked}
      onValuesChange={(_, values) => setDraft(values)} aria-label="Edit profile" aria-busy={busy} scrollToFirstError={{ focus: true }} noValidate
      onFinish={async values => { if (!busy && !locked && buildProfileChanges(baseline, values).kind === 'changed') await onSave(values) }}>
      {profileFields.map(field => <Form.Item key={field} name={field} label={labels[field]} rules={[{
        required: field === 'fullName',
        validator: (_rule, value: unknown) => {
          const result = buildProfileChanges(baseline, { ...baseline, [field]: value })
          return result.kind === 'invalid' && result.errors[field] ? Promise.reject(new Error(result.errors[field])) : Promise.resolve()
        },
      }]}>
        {field === 'bio' ? <Input.TextArea rows={4} /> : <Input
          type={field === 'dateOfBirth' ? 'date' : field === 'avatarUrl' ? 'url' : 'text'}
          max={field === 'dateOfBirth' ? localToday() : undefined}
          maxLength={profileLengthLimits[field]?.max}
          autoComplete={field === 'fullName' ? 'name' : field === 'phoneNumber' ? 'tel' : 'off'}
          autoCapitalize={field === 'avatarUrl' || field === 'locale' || field === 'timezone' ? 'none' : undefined}
          spellCheck={field === 'avatarUrl' ? false : undefined} />}
      </Form.Item>)}
      <div className="profile-form-actions">
        <Button type="primary" htmlType="submit" loading={busy} disabled={busy || locked || changes.kind !== 'changed'}>Save changes</Button>
        <Button onClick={onCancel} disabled={busy || locked}>Cancel</Button>
      </div>
    </Form>
  </section>
}
