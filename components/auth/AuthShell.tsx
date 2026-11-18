import Wordmark from '@/components/layout/Wordmark'

/** The centred logo-and-card frame shared by the sign-in side's smaller pages (reset, welcome). */
export default function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-surface-page flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <p className="mb-8 text-center font-orbitron text-2xl font-bold tracking-tight"><Wordmark /></p>
        <h1 className="text-xl font-bold text-fg-base">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-fg-muted">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </div>
    </div>
  )
}

export const authInput = 'w-full px-3 py-2 border border-edge-input rounded-lg text-sm text-fg-base placeholder-fg-subtle focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent bg-surface-input'
export const authButton = 'w-full py-2.5 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
export const authError = 'text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800'
export const authSuccess = 'text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800'
