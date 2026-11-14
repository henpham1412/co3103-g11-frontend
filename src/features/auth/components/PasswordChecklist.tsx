import { CheckCircleFilled, CloseCircleOutlined, MinusCircleOutlined } from '@ant-design/icons'
import { passwordByteLength, passwordRequirements } from '../utils/authValidation'

export function PasswordChecklist({ password = '' }: { password?: string }) {
  const requirements = passwordRequirements(password).map(({ label, met }) => ({
    label,
    state: met ? 'met' : label === 'At most 72 bytes' && passwordByteLength(password) > 72 ? 'exceeded' : 'pending',
  }))

  return (
    <>
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
      <p className="auth-subtitle">Common passwords are not allowed.</p>
    </>
  )
}
