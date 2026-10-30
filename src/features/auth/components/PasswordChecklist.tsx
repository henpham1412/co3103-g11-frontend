import { CheckCircleFilled, CloseCircleOutlined, MinusCircleOutlined } from '@ant-design/icons'
import { passwordByteLength } from '../utils/authValidation'

export function PasswordChecklist({ password = '' }: { password?: string }) {
  const requirements = [
    { label: 'At least 8 characters', state: password.length >= 8 ? 'met' : 'pending' },
    {
      label: 'At most 72 bytes',
      state: passwordByteLength(password) > 72 ? 'exceeded' : password ? 'met' : 'pending',
    },
    { label: 'Contains a non-whitespace character', state: password.trim() ? 'met' : 'pending' },
  ]

  return (
    <ul className="password-checklist" aria-label="Password requirements" aria-live="polite">
      {requirements.map(({ label, state }) => (
        <li key={label} data-state={state}>
          {state === 'met' ? <CheckCircleFilled aria-hidden="true" />
            : state === 'exceeded' ? <CloseCircleOutlined aria-hidden="true" />
              : <MinusCircleOutlined aria-hidden="true" />}
          <span><span className="sr-only">{state === 'met' ? 'Met: ' : 'Not met: '}</span>{label}</span>
        </li>
      ))}
    </ul>
  )
}
