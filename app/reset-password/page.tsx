import { notFound } from 'next/navigation'
import { FEATURES } from '@/lib/edition'
import AuthShell from '@/components/auth/AuthShell'
import ResetPasswordForm from './ResetPasswordForm'

/**
 * Setting a new password from a reset link (public edition). The link signs
 * them in through /auth/callback first, so this page has a session; the
 * middleware sends anyone without one to /login.
 */
export default function ResetPasswordPage() {
  if (!FEATURES.secureAuth) notFound()
  return (
    <AuthShell title="Set a new password" subtitle="At least 8 characters, with a letter and a number.">
      <ResetPasswordForm />
    </AuthShell>
  )
}
