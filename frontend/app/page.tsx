import type { Metadata } from 'next'
import Link from 'next/link'
import {
  MessageSquare,
  BookOpen,
  Workflow,
  Accessibility,
  ChevronRight,
  ArrowRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Header } from '@/components/layout/Header'

// ─── Metadata ─────────────────────────────────────────────────────────────────

export const metadata: Metadata = {
  title: 'Home',
  description:
    'Wildcat AI Concierge — your conversational AI guide to CSU Chico campus services, ' +
    'events, facilities, departments, and more.',
}

// ─── Static Data ──────────────────────────────────────────────────────────────

const SUGGESTED_QUESTIONS = [
  'Where do I park?',
  'Where do I eat?',
  'How do I rent a facility?',
  'How do I request disability accommodations?',
  'What events are happening?',
  'I need an ASL interpreter',
  'How do I get a parking permit?',
  'Who do I contact for housing?',
] as const

const FEATURES = [
  {
    Icon: BookOpen,
    title: 'Source-Cited Answers',
    description:
      'Every response includes links to the official CSU Chico documents and web pages used to generate the answer — so you can always verify.',
    color: 'text-primary',
    bgColor: 'bg-primary/10',
  },
  {
    Icon: Workflow,
    title: 'Guided Workflows',
    description:
      'Complex processes like applying for disability accommodations or renting a campus facility are broken into clear, actionable step-by-step guides.',
    color: 'text-gold-700 dark:text-gold-400',
    bgColor: 'bg-gold/10',
  },
  {
    Icon: Accessibility,
    title: 'Always Accessible',
    description:
      'Designed to meet WCAG 2.1 AA standards. Keyboard navigable, screen-reader friendly, and optimized for all devices and connection speeds.',
    color: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-500/10',
  },
] as const

// ─── Landing Page ─────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <Header showNav />

      <main id="main-content" className="flex-1">
        {/* ── Hero Section ────────────────────────────────────────── */}
        <section
          className="bg-gradient-to-br from-primary via-primary/90 to-scarlet-800 text-primary-foreground py-16 sm:py-24 px-4"
          aria-labelledby="hero-heading"
        >
          <div className="container mx-auto max-w-4xl text-center space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/20 px-4 py-1.5 text-sm font-medium backdrop-blur-sm">
              <span aria-hidden="true">🐾</span>
              <span>AI-Powered Campus Guide</span>
            </div>

            <h1
              id="hero-heading"
              className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-tight"
            >
              Your Campus,{' '}
              <span className="text-gold">Simplified</span>
            </h1>

            <p className="text-lg sm:text-xl text-primary-foreground/85 max-w-2xl mx-auto leading-relaxed">
              Wildcat AI Concierge is a conversational AI guide to California State University, Chico
              campus services — from parking and dining to accessibility support and event information.
              Ask anything. Get clear, cited answers instantly.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <Button
                asChild
                size="xl"
                className="bg-white text-primary hover:bg-white/90 font-semibold shadow-lg"
              >
                <Link href="/chat">
                  <MessageSquare className="w-5 h-5" aria-hidden="true" />
                  Start Chatting
                  <ArrowRight className="w-5 h-5" aria-hidden="true" />
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                size="xl"
                className="border-white/60 text-primary-foreground bg-white/10 hover:bg-white/20 hover:border-white font-semibold backdrop-blur-sm"
              >
                <Link href="/about">Learn How It Works</Link>
              </Button>
            </div>
          </div>
        </section>

        {/* ── Suggested Questions Grid ────────────────────────────── */}
        <section
          className="py-14 px-4 bg-muted/40"
          aria-labelledby="questions-heading"
        >
          <div className="container mx-auto max-w-5xl">
            <div className="text-center mb-8">
              <h2
                id="questions-heading"
                className="text-2xl sm:text-3xl font-bold text-foreground"
              >
                What can I help you with?
              </h2>
              <p className="mt-2 text-muted-foreground">
                Click any question to jump straight into a conversation.
              </p>
            </div>

            <ul
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3"
              role="list"
              aria-label="Suggested questions"
            >
              {SUGGESTED_QUESTIONS.map((question) => {
                const href = `/chat?q=${encodeURIComponent(question)}`
                return (
                  <li key={question}>
                    <Link
                      href={href}
                      className={[
                        'group flex items-center justify-between gap-3 rounded-xl',
                        'border border-border bg-card px-4 py-4 text-sm font-medium text-foreground',
                        'shadow-sm hover:shadow-md hover:border-primary/50 hover:bg-primary/5',
                        'transition-all duration-200',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                      ].join(' ')}
                      aria-label={`Ask: ${question}`}
                    >
                      <span className="leading-snug">{question}</span>
                      <ChevronRight
                        className="w-4 h-4 shrink-0 text-muted-foreground group-hover:text-primary transition-colors"
                        aria-hidden="true"
                      />
                    </Link>
                  </li>
                )
              })}
            </ul>

            <div className="text-center mt-6">
              <Button asChild variant="outline" size="default">
                <Link href="/chat">
                  <MessageSquare className="w-4 h-4" aria-hidden="true" />
                  Or ask your own question
                </Link>
              </Button>
            </div>
          </div>
        </section>

        {/* ── Features Section ────────────────────────────────────── */}
        <section
          className="py-14 px-4"
          aria-labelledby="features-heading"
        >
          <div className="container mx-auto max-w-5xl">
            <div className="text-center mb-10">
              <h2
                id="features-heading"
                className="text-2xl sm:text-3xl font-bold text-foreground"
              >
                Built for CSU Chico Students &amp; Staff
              </h2>
              <p className="mt-2 text-muted-foreground max-w-xl mx-auto">
                A smarter way to navigate campus resources, powered by retrieval-augmented AI.
              </p>
            </div>

            <ul
              className="grid grid-cols-1 md:grid-cols-3 gap-6"
              role="list"
              aria-label="Key features"
            >
              {FEATURES.map(({ Icon, title, description, color, bgColor }) => (
                <li key={title}>
                  <Card className="h-full hover:shadow-md transition-shadow duration-200">
                    <CardHeader className="pb-3">
                      <div className={`w-11 h-11 rounded-xl ${bgColor} flex items-center justify-center mb-3`}>
                        <Icon className={`w-5 h-5 ${color}`} aria-hidden="true" />
                      </div>
                      <CardTitle className="text-base">{title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <CardDescription className="text-sm leading-relaxed">
                        {description}
                      </CardDescription>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── CTA Banner ──────────────────────────────────────────── */}
        <section
          className="py-14 px-4 bg-muted/40"
          aria-labelledby="cta-heading"
        >
          <div className="container mx-auto max-w-3xl text-center space-y-4">
            <h2
              id="cta-heading"
              className="text-2xl sm:text-3xl font-bold text-foreground"
            >
              Ready to explore campus smarter?
            </h2>
            <p className="text-muted-foreground">
              No account needed. Just ask your question and get answers in seconds.
            </p>
            <Button asChild size="xl">
              <Link href="/chat">
                <MessageSquare className="w-5 h-5" aria-hidden="true" />
                Open the Chat
              </Link>
            </Button>
          </div>
        </section>
      </main>

      {/* ── Footer ────────────────────────────────────────────────── */}
      <footer
        className="border-t border-border bg-card py-6 px-4 text-center"
        role="contentinfo"
      >
        <div className="container mx-auto max-w-5xl flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <span aria-hidden="true">🐾</span>
            <span>Wildcat AI Concierge — CSU Chico</span>
          </div>
          <p>
            Powered by{' '}
            <span className="font-medium text-foreground">Amazon Bedrock</span>
            {' '}|{' '}
            <span className="italic">CSU Chico AI Summer Camp Prototype</span>
          </p>
          <nav aria-label="Footer navigation">
            <Button variant="link" size="sm" asChild className="text-muted-foreground h-auto p-0">
              <Link href="/about#accessibility">Accessibility</Link>
            </Button>
            <span className="mx-2 select-none" aria-hidden="true">·</span>
            <Button variant="link" size="sm" asChild className="text-muted-foreground h-auto p-0">
              <Link href="/about">About</Link>
            </Button>
          </nav>
        </div>
      </footer>
    </div>
  )
}
