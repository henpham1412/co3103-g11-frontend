import { normalizeApiError } from '@/api/apiError'

export function formatAdminTimestamp(value: string | null, emptyLabel = '—'): string {
  if (!value) return emptyLabel
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  }).format(date) + ' UTC'
}

export function formatAdminDecimal(value: number | null, suffix = ''): string {
  if (value === null) return 'N/A'
  return `${value.toFixed(2)}${suffix}`
}

export function formatAdminError(cause: unknown, fallback: string): string {
  const error = normalizeApiError(cause)
  switch (error.code) {
    case 'INVALID_ROLE_OR_STATUS_TRANSITION':
      return 'Cannot demote or suspend the last active administrator.'
    case 'REPORT_ALREADY_UPDATED':
      return 'This content report was already updated. Reloading the latest state.'
    case 'USER_NOT_FOUND':
      return 'The requested user access record could not be found.'
    case 'CONTENT_REPORT_NOT_FOUND':
      return 'The requested content report could not be found.'
    case 'REPORTED_CONTENT_NOT_FOUND':
      return 'The reported file is no longer available for download.'
    case 'AUDIT_LOG_NOT_FOUND':
      return 'The requested audit log entry could not be found.'
    case 'CLASS_NOT_FOUND':
      return 'No class was found matching that Class UUID.'
    case 'VALIDATION_ERROR':
      return error.message || 'Check the filter values and try again.'
    case 'INVALID_ADMIN_RESPONSE':
      return error.message
    case 'FORBIDDEN':
      return 'Administrator access is required for this action.'
    default:
      return error.message || fallback
  }
}

export function triggerFileDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
