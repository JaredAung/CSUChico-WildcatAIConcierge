import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { ThemeProvider } from 'next-themes'
import './globals.css'

// ─── Font ──────────────────────────────────────────────────────────────────────

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
})

// ─── Metadata ─────────────────────────────────────────────────────────────────

export const metadata: Metadata = {
  title: {
    default: 'Wildcat AI Concierge - CSU Chico',
    template: '%s | Wildcat AI Concierge',
  },
  description:
    'Your AI-powered campus guide for California State University, Chico. ' +
    'Get instant answers about campus services, departments, events, and more.',
  keywords: [
    'CSU Chico',
    'California State University Chico',
    'campus AI',
    'student services',
    'Wildcat',
    'campus guide',
    'chatbot',
  ],
  authors: [{ name: 'CSU Chico' }],
  creator: 'CSU Chico',
  metadataBase: new URL('https://ai.csuchico.edu'),
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://ai.csuchico.edu',
    title: 'Wildcat AI Concierge - CSU Chico',
    description:
      'Your AI-powered campus guide for California State University, Chico.',
    siteName: 'Wildcat AI Concierge',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Wildcat AI Concierge - CSU Chico',
    description:
      'Your AI-powered campus guide for California State University, Chico.',
  },
  robots: {
    index: true,
    follow: true,
  },
}

// ─── Root Layout ──────────────────────────────────────────────────────────────

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="en"
      className={inter.variable}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-background font-sans antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
