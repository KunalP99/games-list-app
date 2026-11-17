import type { Metadata } from 'next'
import localFont from 'next/font/local'
import { Anton, Orbitron } from 'next/font/google'
import './globals.css'
import EnvBanner from '@/components/layout/EnvBanner'

const geistSans = localFont({
  src: './fonts/GeistVF.woff',
  variable: '--font-geist-sans',
  weight: '100 900',
})

const orbitron = Orbitron({
  subsets: ['latin'],
  variable: '--font-orbitron',
  weight: ['700', '800'],
})

// The big condensed numbers on the Stats page.
const anton = Anton({
  subsets: ['latin'],
  variable: '--font-anton',
  weight: '400',
})

export const metadata: Metadata = {
  title: 'GamesList',
  description: 'Track games. Earn tickets. Spin the wheel.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='dark')document.documentElement.classList.add('dark')}catch(e){}})();` }} />
      </head>
      <body className={`${geistSans.variable} ${orbitron.variable} ${anton.variable} font-sans antialiased`}>
        {children}
        <EnvBanner />
      </body>
    </html>
  )
}
