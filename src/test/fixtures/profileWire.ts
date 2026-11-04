import { wireIdentity } from './authWire'

export const wireFullProfile = {
  ...wireIdentity,
  profile: {
    avatar_url: 'https://images.example/avatar.png', bio: 'Learning together', phone_number: '+0012345',
    date_of_birth: '2001-03-15', locale: 'vi-VN', timezone: 'Asia/Ho_Chi_Minh',
  },
}
export const wireProfileAcknowledgment = { message: 'Updated' }
