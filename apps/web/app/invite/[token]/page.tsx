import { redirect } from 'next/navigation'

// Invite codes are no longer distributed as URL links.
// Members receive an XKM-XXXX-XXXX code via SMS/email and register at /register.
export default function LegacyInvitePage() {
  redirect('/register')
}
