import type { Metadata } from 'next'
import Link from 'next/link'
import {
  MessageSquare,
  BookOpen,
  Workflow,
  Accessibility,
  ChevronRight,
  ArrowRight,
  Search,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Header } from '@/components/layout/Header'

export const metadata: Metadata = {
  title: 'Wildcat AI Concierge — CSU Chico',
  description:
    'Your AI-powered campus guide for California State University, Chico. Ask questions about campus services, parking, dining, accessibility, events, and more.',
}

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

const STATS = [
  { value: '#9', label: 'Top Public Schools West', sub: '— U.S. News' },
  { value: '48%', label: 'First-generation', sub: 'college students' },
  { value: '200+', label: 'Student organizations', sub: 'on campus' },
  { value: '300+', label: 'Majors & programs', sub: 'to explore' },
] as const

const FEATURES = [
  {
    Icon: BookOpen,
    title: 'Source-Cited Answers',
    description:
      'Every response links to official CSU Chico documents and web pages — so you can always verify what you read.',
    color: 'text-primary',
    bgColor: 'bg-primary/10',
  },
  {
    Icon: Workflow,
    title: 'Guided Workflows',
    description:
      'Complex processes like facility rentals or disability accommodations are broken into clear, step-by-step guides.',
    color: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-500/10',
  },
  {
    Icon: Accessibility,
    title: 'Always Accessible',
    description:
      'Designed to WCAG 2.1 AA standards. Keyboard navigable, screen reader friendly, and mobile optimized.',
    color: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-500/10',
  },
] as const

const QUICK_LINKS = [
  { label: 'Academics', href: 'https://www.csuchico.edu/academics/index.shtml' },
  { label: 'Admissions', href: 'https://www.csuchico.edu/admissions/index.shtml' },
  { label: 'Financial Aid', href: 'https://www.csuchico.edu/cost-aid/financial-aid-scholarships.shtml' },
  { label: 'Student Life', href: 'https://www.csuchico.edu/student-life/index.shtml' },
  { label: 'Campus Map', href: 'https://www.csuchico.edu/maps/campus/' },
  { label: 'Athletics', href: 'https://chicowildcats.com/' },
] as const

export default function LandingPage() {
  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground">

      {/* ── Top utility bar (mimics csuchico.edu) ────────────────── */}
      <div className="bg-[#1a1a1a] text-white text-xs py-1.5 px-4 hidden sm:block">
        <div className="container mx-auto max-w-7xl flex items-center justify-between">
          <span className="text-white/60">California State University, Chico</span>
          <nav aria-label="Utility navigation" className="flex items-center gap-4">
            <a href="https://outlook.com/csuchico.edu" className="hover:text-white/80 transition-colors" target="_blank" rel="noopener noreferrer">Email</a>
            <a href="https://portal.csuchico.edu" className="hover:text-white/80 transition-colors" target="_blank" rel="noopener noreferrer">Portal</a>
            <a href="https://library.csuchico.edu/" className="hover:text-white/80 transition-colors" target="_blank" rel="noopener noreferrer">Library</a>
            <a href="https://www.csuchico.edu/espanol/index.shtml" className="hover:text-white/80 transition-colors" target="_blank" rel="noopener noreferrer">Español</a>
          </nav>
        </div>
      </div>

      {/* ── Main Header ──────────────────────────────────────────── */}
      <Header showNav />

      <main id="main-content" className="flex-1">

        {/* ── Hero — campus photo with students ──────────────────── */}
        <section
          className="relative overflow-hidden text-white"
          aria-labelledby="hero-heading"
        >
          {/* Background photo of students on campus */}
          <div
            className="absolute inset-0"
            aria-hidden="true"
          >
            <img
              src="/students-campus.jpg"
              alt=""
              className="w-full h-full object-cover"
            />
            {/* Dark overlay for text readability */}
            <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/60 to-black/40" />
            {/* Scarlet tint */}
            <div className="absolute inset-0 bg-primary/30 mix-blend-multiply" />
          </div>

          <div className="relative container mx-auto max-w-6xl px-4 py-20 sm:py-28 grid md:grid-cols-2 gap-10 items-center">
            {/* Left: text */}
            <div className="space-y-6">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/15 backdrop-blur-sm px-4 py-1.5 text-sm font-medium border border-white/20">
                <span aria-hidden="true">🐾</span>
                <span>AI-Powered Campus Guide</span>
              </div>

              <h1
                id="hero-heading"
                className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.05]"
              >
                Campus Info.{' '}
                <span className="text-[#FFC72C]">Instantly.</span>
              </h1>

              <p className="text-lg sm:text-xl text-white/85 leading-relaxed max-w-lg">
                The Wildcat AI Concierge answers your questions about CSU Chico
                campus services — parking, dining, accessibility, events, and more.
                No searching. Just ask.
              </p>

              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <Button
                  asChild
                  size="xl"
                  className="bg-white text-primary hover:bg-white/90 font-bold shadow-lg text-base"
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
                  className="border-white/50 text-white bg-white/10 hover:bg-white/20 hover:border-white font-semibold text-base backdrop-blur-sm"
                >
                  <Link href="/about">How It Works</Link>
                </Button>
              </div>
            </div>

            {/* Right: quick-ask card */}
            <div className="hidden md:block">
              <div className="bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 p-6 space-y-3 shadow-2xl">
                <p className="text-sm font-semibold text-white/70 uppercase tracking-wider">Try asking...</p>
                {[
                  '¿Dónde puedo estacionar?',
                  'How do I request accommodations?',
                  'I want to rent Laxson Auditorium',
                  'Where can I eat on campus?',
                ].map((q) => (
                  <Link
                    key={q}
                    href={`/chat?q=${encodeURIComponent(q)}`}
                    className="flex items-center justify-between gap-3 bg-white/10 hover:bg-white/20 rounded-xl px-4 py-3 text-sm text-white transition-colors group backdrop-blur-sm"
                  >
                    <span>{q}</span>
                    <ChevronRight className="w-4 h-4 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity" aria-hidden="true" />
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── Stats bar — matches csuchico.edu achievement numbers ─ */}
        <section className="bg-[#1a1a1a] text-white py-8 px-4" aria-label="Campus statistics">
          <div className="container mx-auto max-w-5xl">
            <ul className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center" role="list">
              {STATS.map(({ value, label, sub }) => (
                <li key={value} className="space-y-1">
                  <div className="text-3xl sm:text-4xl font-bold text-[#FFC72C]">{value}</div>
                  <div className="text-sm font-semibold">{label}</div>
                  <div className="text-xs text-white/60">{sub}</div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── Quick links bar — mirrors csuchico.edu nav topics ──── */}
        <section className="bg-muted/60 border-b border-border py-4 px-4" aria-label="Quick links to CSU Chico">
          <div className="container mx-auto max-w-5xl">
            <ul className="flex flex-wrap items-center justify-center gap-2 sm:gap-4" role="list">
              {QUICK_LINKS.map(({ label, href }) => (
                <li key={label}>
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors px-3 py-1.5 rounded-full hover:bg-primary/10"
                  >
                    {label} →
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── Suggested Questions ─────────────────────────────────── */}
        <section
          className="py-14 px-4"
          aria-labelledby="questions-heading"
        >
          <div className="container mx-auto max-w-5xl">
            <div className="text-center mb-8">
              <h2
                id="questions-heading"
                className="text-2xl sm:text-3xl font-bold text-foreground"
              >
                What Can I Help You With?
              </h2>
              <p className="mt-2 text-muted-foreground">
                Click any question to start a conversation — or type your own.
              </p>
            </div>

            <ul
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3"
              role="list"
              aria-label="Suggested questions"
            >
              {SUGGESTED_QUESTIONS.map((question) => (
                <li key={question}>
                  <Link
                    href={`/chat?q=${encodeURIComponent(question)}`}
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
              ))}
            </ul>

            <div className="text-center mt-8">
              <Button asChild size="lg" className="font-semibold">
                <Link href="/chat">
                  <MessageSquare className="w-4 h-4" aria-hidden="true" />
                  Open the AI Concierge
                </Link>
              </Button>
            </div>
          </div>
        </section>

        {/* ── "Tomorrow Calls" style bold CTA ─────────────────────── */}
        <section
          className="bg-primary text-primary-foreground py-16 px-4"
          aria-labelledby="cta-heading"
        >
          <div className="container mx-auto max-w-4xl text-center space-y-6">
            <h2
              id="cta-heading"
              className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight leading-tight"
            >
              Campus Answers.{' '}
              <span className="text-[#FFC72C]">Right Now.</span>
            </h2>
            <p className="text-lg text-primary-foreground/80 max-w-xl mx-auto">
              No more searching through dozens of websites. The Wildcat AI Concierge
              knows CSU Chico — and it's ready to help.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Button
                asChild
                size="xl"
                className="bg-white text-primary hover:bg-white/90 font-bold shadow-lg"
              >
                <Link href="/chat">
                  <MessageSquare className="w-5 h-5" aria-hidden="true" />
                  Start Chatting
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                size="xl"
                className="border-white/50 text-white bg-transparent hover:bg-white/10 hover:border-white font-semibold"
              >
                <Link href="/about">Learn More</Link>
              </Button>
            </div>
          </div>
        </section>

        {/* ── Features ─────────────────────────────────────────────── */}
        <section
          className="py-14 px-4 bg-muted/30"
          aria-labelledby="features-heading"
        >
          <div className="container mx-auto max-w-5xl">
            <div className="text-center mb-10">
              <h2
                id="features-heading"
                className="text-2xl sm:text-3xl font-bold text-foreground"
              >
                Built for Every Wildcat
              </h2>
              <p className="mt-2 text-muted-foreground max-w-xl mx-auto">
                Students, faculty, staff, visitors, and community members — the Wildcat AI Concierge is for everyone.
              </p>
            </div>

            <ul
              className="grid grid-cols-1 md:grid-cols-3 gap-6"
              role="list"
              aria-label="Key features"
            >
              {FEATURES.map(({ Icon, title, description, color, bgColor }) => (
                <li key={title}>
                  <Card className="h-full hover:shadow-md transition-shadow duration-200 rounded-xl">
                    <CardHeader className="pb-3">
                      <div className={`w-12 h-12 rounded-xl ${bgColor} flex items-center justify-center mb-3`}>
                        <Icon className={`w-6 h-6 ${color}`} aria-hidden="true" />
                      </div>
                      <CardTitle className="text-base font-bold">{title}</CardTitle>
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

      </main>

      {/* ── Footer — matches csuchico.edu footer ─────────────────── */}
      <footer className="bg-[#1a1a1a] text-white" role="contentinfo">
        <div className="container mx-auto max-w-5xl px-4 py-10">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 mb-8">
            {/* Brand */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-2xl" aria-hidden="true">🐾</span>
                <div>
                  <div className="font-bold text-sm">Wildcat AI Concierge</div>
                  <div className="text-xs text-white/60">California State University, Chico</div>
                </div>
              </div>
              <address className="text-xs text-white/60 not-italic leading-relaxed">
                400 West First Street<br />
                Chico, California 95929
              </address>
            </div>

            {/* Links */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-white/50 mb-3">Campus Links</h3>
              {[
                { label: 'csuchico.edu', href: 'https://www.csuchico.edu/' },
                { label: 'Campus Map', href: 'https://www.csuchico.edu/maps/campus/' },
                { label: 'Student Services', href: 'https://www.csuchico.edu/resources/index.shtml' },
                { label: 'Campus Directory', href: 'https://apps.csuchico.edu/directory/' },
              ].map(({ label, href }) => (
                <a key={label} href={href} target="_blank" rel="noopener noreferrer"
                  className="block text-sm text-white/70 hover:text-white transition-colors">
                  {label}
                </a>
              ))}
            </div>

            {/* Social */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-white/50 mb-3">Follow Chico State</h3>
              {[
                { label: 'Facebook', href: 'https://www.facebook.com/CaliforniaStateUniversityChico/' },
                { label: 'Instagram', href: 'https://www.instagram.com/chicostate/' },
                { label: 'TikTok', href: 'https://www.tiktok.com/@chicostate' },
              ].map(({ label, href }) => (
                <a key={label} href={href} target="_blank" rel="noopener noreferrer"
                  className="block text-sm text-white/70 hover:text-white transition-colors">
                  {label}
                </a>
              ))}
            </div>
          </div>

          {/* Land acknowledgment — matches csuchico.edu footer */}
          <div className="border-t border-white/10 pt-6 mb-6">
            <p className="text-xs text-white/50 leading-relaxed max-w-3xl">
              <span className="font-semibold text-white/70">Honoring the Mechoopda People — </span>
              We acknowledge and are mindful that Chico State stands on lands that were originally
              occupied by the first people of this area, the Mechoopda, and we recognize their
              distinctive spiritual relationship with this land and the waters that run through campus.
            </p>
          </div>

          <div className="border-t border-white/10 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-white/40">
            <span>© 2026 Chico State · Wildcat AI Concierge Prototype</span>
            <span>Powered by <span className="text-white/60">Amazon Bedrock</span> · CSU Chico AI Summer Camp</span>
            <nav aria-label="Footer legal links" className="flex gap-4">
              <a href="/about#accessibility" className="hover:text-white/70 transition-colors">Accessibility</a>
              <a href="/about" className="hover:text-white/70 transition-colors">About</a>
            </nav>
          </div>
        </div>
      </footer>
    </div>
  )
}
