import { notFound } from 'next/navigation'
import { FEATURES } from '@/lib/edition'
import AuthShell from '@/components/auth/AuthShell'
import ForgotPasswordForm from './ForgotPasswordForm'

/** "Forgot password?" (public edition's secure sign-up; not part of the friends edition). */
export default function ForgotPasswordPage() {
  if (!FEATURES.secureAuth) notFound()
  return (
    <AuthShell title="Forgot your password?" subtitle="Enter your email and we’ll send you a link to set a new one.">
      <ForgotPasswordForm />
    </AuthShell>
  )
}
