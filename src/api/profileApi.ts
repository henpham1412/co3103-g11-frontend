import type { ProfileChanges } from '@/types/profile'
import { normalizeApiError } from './apiError'
import { centralIdentityClient } from './centralIdentityClient'
import { serializeProfileChanges } from './profileMapping'

async function updateCurrentUser(changes: ProfileChanges, token: string, signal?: AbortSignal): Promise<void> {
  const endpoint = '/users/me'
  try {
    const payload = serializeProfileChanges(changes)
    await centralIdentityClient.patch(endpoint, payload, { authToken: token, headers: { Authorization: `Bearer ${token}` }, signal })
  } catch (error) { throw normalizeApiError(error, endpoint) }
}

export const profileApi = { updateCurrentUser }
