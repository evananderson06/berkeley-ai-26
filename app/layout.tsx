import type { Metadata } from 'next'
import localFont from 'next/font/local'
import { Newsreader } from 'next/font/google'
import './globals.css'
import { Nav } from '@/components/nav'

// Type roles: Geist Sans = UI/body, Geist Mono = data/transcripts/code chrome/timecodes,
// Newsreader = display/headlines/verdict.
const geistSans = localFont({
  src: './fonts/GeistVF.woff',
  variable: '--font-geist-sans',
  weight: '100 900',
})
const geistMono = localFont({
  src: './fonts/GeistMonoVF.woff',
  variable: '--font-geist-mono',
  weight: '100 900',
})
const newsreader = Newsreader({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['400', '500', '600'],
  style: ['normal', 'italic'],
  display: 'swap',
  adjustFontFallback: false,
})

export const metadata: Metadata = {
  title: 'InterviewIQ — Interview AI candidates, learn who to hire',
  description:
    'Interview realistic AI candidates by voice or text, then see who you should have hired and what you missed.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${newsreader.variable}`}>
      <body className="min-h-screen bg-ground font-sans text-ink antialiased">
        <Nav />
        <main>{children}</main>
      </body>
    </html>
  )
}
