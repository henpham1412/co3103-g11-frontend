// Synthetic credentials only; never record request payloads in logs.
export const wireForgotPassword = { email: 'student@example.com' }
export const wireResetPassword = { token: 'opaque-test-value+%', new_password: ' Safe-test-123!é ' }
export const wireForgotAcknowledgment = { message: 'Request received' }
