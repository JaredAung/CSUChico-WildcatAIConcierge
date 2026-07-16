import type { Metadata } from 'next'
import Link from 'next/link'
import {
  Brain,
  Database,
  Shield,
  Accessibility,
  FlaskConical,
  ArrowRight,
  CheckCircle2,
  Server,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Header } from '@/components/layout/Header'

// ─── Metadata ─────────────────────────────────────────────────────────────────

export const metadata: Metadata = {
  title: 'About',
  description:
    'Learn how the Wildcat Navigator works, its technology stack, privacy practices, ' +
    'and accessibility commitment.',
}

// ─── Tech Stack Items ─────────────────────────────────────────────────────────

const TECH_STACK = [
  { label: 'Next.js 14', category: 'Frontend', variant: 'info' as const },
  { label: 'React 18', category: 'Frontend', variant: 'info' as const },
  { label: 'TypeScript', category: 'Frontend', variant: 'info' as const },
  { label: 'Tailwind CSS', category: 'Frontend', variant: 'info' as const },
  { label: 'FastAPI', category: 'Backend', variant: 'success' as const },
  { label: 'Python 3.12', category: 'Backend', variant: 'success' as const },
  { label: 'Amazon Bedrock', category: 'AI / LLM', variant: 'gold' as const },
  { label: 'Claude 3 Sonnet', category: 'AI / LLM', variant: 'gold' as const },
  { label: 'Amazon OpenSearch', category: 'Vector DB', variant: 'warning' as const },
  { label: 'AWS Lambda', category: 'Infrastructure', variant: 'secondary' as const },
  { label: 'Amazon S3', category: 'Infrastructure', variant: 'secondary' as const },
]

const ACCESSIBILITY_COMMITMENTS = [
  'Keyboard-navigable interface — all interactions accessible without a mouse',
  'Screen reader compatible with ARIA landmarks, roles, and live regions',
  'Sufficient color contrast ratios meeting WCAG 2.1 AA requirements',
  'Descriptive alt text and aria-labels throughout',
  'Focus indicators visible on all interactive elements',
  'Responsive layout works on phones, tablets, and desktops',
  'Reduced-motion support for users who prefer less animation',
]

// ─── About Page ───────────────────────────────────────────────────────────────

export default function AboutPage() {
  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground">
      <Header showNav />

      <main id="main-content" className="flex-1">
        {/* ── Hero ──────────────────────────────────────────────────── */}
        <section
          className="bg-primary text-primary-foreground py-12 sm:py-16 px-4"
          aria-labelledby="about-heading"
        >
          <div className="container mx-auto max-w-3xl text-center space-y-4">
            <div className="text-4xl" aria-hidden="true">🐾</div>
            <h1
              id="about-heading"
              className="text-3xl sm:text-4xl font-bold tracking-tight"
            >
              About Wildcat Navigator
            </h1>
            <p className="text-lg text-primary-foreground/85 max-w-2xl mx-auto leading-relaxed">
              A campus AI assistant prototype built at the CSU Chico AI Summer Camp, designed to help
              students and staff quickly find information about campus services, processes, and resources.
            </p>
          </div>
        </section>

        <div className="container mx-auto max-w-4xl px-4 py-12 space-y-12">

          {/* ── What It Is ────────────────────────────────────────── */}
          <section aria-labelledby="what-heading">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <Brain className="w-5 h-5 text-primary" aria-hidden="true" />
              </div>
              <h2 id="what-heading" className="text-2xl font-bold">
                What is the Wildcat Navigator?
              </h2>
            </div>
            <Card>
              <CardContent className="pt-5 space-y-3 text-sm leading-relaxed text-muted-foreground">
                <p>
                  The Wildcat Navigator is a conversational AI chatbot designed specifically for{' '}
                  <strong className="text-foreground">California State University, Chico</strong> students,
                  faculty, and staff. You can ask it natural language questions about campus life and
                  instantly receive accurate, sourced answers.
                </p>
                <p>
                  Instead of searching through dozens of web pages, PDF handbooks, or calling multiple
                  offices, you can simply ask: <em>&ldquo;How do I request disability accommodations?&rdquo;</em>{' '}
                  or <em>&ldquo;Where can I park near Butte Hall?&rdquo;</em> — and get a direct, helpful answer
                  with links to the relevant official resources.
                </p>
                <p>
                  For multi-step processes (like applying for housing or renting a facility), the concierge
                  generates interactive <strong className="text-foreground">workflow cards</strong> that
                  walk you through each step in order.
                </p>
              </CardContent>
            </Card>
          </section>

          {/* ── How It Works ────────────────────────────────────────── */}
          <section aria-labelledby="how-heading">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold/20">
                <Database className="w-5 h-5 text-gold-700 dark:text-gold-400" aria-hidden="true" />
              </div>
              <h2 id="how-heading" className="text-2xl font-bold">
                How It Works
              </h2>
            </div>
            <Card>
              <CardContent className="pt-5 space-y-5">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  The concierge uses a technique called{' '}
                  <strong className="text-foreground">Retrieval-Augmented Generation (RAG)</strong>. Here&rsquo;s
                  what that means in plain language:
                </p>

                <ol className="space-y-4" aria-label="How RAG works">
                  {[
                    {
                      n: 1,
                      title: 'Your question arrives',
                      body: 'You type a question. The system converts it into a mathematical representation (a "vector embedding") that captures its meaning.',
                    },
                    {
                      n: 2,
                      title: 'Relevant documents are retrieved',
                      body: 'That representation is compared against a database of pre-indexed CSU Chico documents (website pages, PDFs, policy guides) stored in Amazon OpenSearch. The most semantically relevant passages are retrieved.',
                    },
                    {
                      n: 3,
                      title: 'An AI generates the answer',
                      body: 'The retrieved passages are sent to Claude 3 Sonnet (via Amazon Bedrock) along with your question. The AI reads only those passages to formulate a grounded, factual answer — it cannot hallucinate information that isn\'t in the CSU Chico knowledge base.',
                    },
                    {
                      n: 4,
                      title: 'Sources are returned with the answer',
                      body: 'The original documents are included with the response so you can click through and verify everything yourself.',
                    },
                  ].map(({ n, title, body }) => (
                    <li key={n} className="flex gap-4">
                      <div
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold"
                        aria-hidden="true"
                      >
                        {n}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground mb-0.5">{title}</p>
                        <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          </section>

          {/* ── Technology Stack ──────────────────────────────────── */}
          <section aria-labelledby="tech-heading">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10">
                <Server className="w-5 h-5 text-blue-600 dark:text-blue-400" aria-hidden="true" />
              </div>
              <h2 id="tech-heading" className="text-2xl font-bold">
                Technology Stack
              </h2>
            </div>
            <Card>
              <CardContent className="pt-5">
                <div
                  className="flex flex-wrap gap-2"
                  role="list"
                  aria-label="Technology stack"
                >
                  {TECH_STACK.map(({ label, category, variant }) => (
                    <div
                      key={label}
                      role="listitem"
                      title={category}
                    >
                      <Badge variant={variant} className="text-xs">
                        {label}
                      </Badge>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-xs text-muted-foreground">
                  All AI inference is performed on <strong>Amazon Web Services</strong> infrastructure using
                  Amazon Bedrock — no user data is sent to third-party AI providers.
                </p>
              </CardContent>
            </Card>
          </section>

          {/* ── Privacy ───────────────────────────────────────────── */}
          <section aria-labelledby="privacy-heading">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-500/10">
                <Shield className="w-5 h-5 text-green-600 dark:text-green-400" aria-hidden="true" />
              </div>
              <h2 id="privacy-heading" className="text-2xl font-bold">
                Privacy &amp; Data
              </h2>
            </div>
            <Card>
              <CardContent className="pt-5 space-y-3 text-sm text-muted-foreground leading-relaxed">
                <p>
                  The Wildcat Navigator is a <strong className="text-foreground">prototype</strong>. Please
                  do not share sensitive personal information (student ID numbers, passwords, financial data,
                  Social Security Numbers) in the chat.
                </p>
                <p>
                  Conversation messages are processed on AWS infrastructure and are not stored beyond the
                  duration of a session. No personally identifiable information is collected to build AI
                  training datasets.
                </p>
                <p>
                  For official CSU Chico privacy policies, visit{' '}
                  <a
                    href="https://www.csuchico.edu/privacy/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline underline-offset-2 hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                  >
                    csuchico.edu/privacy ↗
                  </a>
                  .
                </p>
              </CardContent>
            </Card>
          </section>

          {/* ── Accessibility ─────────────────────────────────────── */}
          <section
            id="accessibility"
            aria-labelledby="a11y-heading"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10">
                <Accessibility className="w-5 h-5 text-purple-600 dark:text-purple-400" aria-hidden="true" />
              </div>
              <h2 id="a11y-heading" className="text-2xl font-bold">
                Accessibility Commitment
              </h2>
            </div>
            <Card>
              <CardContent className="pt-5 space-y-4">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  We are committed to ensuring the Wildcat Navigator is accessible to everyone,
                  including users with disabilities. The interface is designed to meet{' '}
                  <strong className="text-foreground">WCAG 2.1 Level AA</strong> standards.
                </p>
                <ul className="space-y-2" aria-label="Accessibility features">
                  {ACCESSIBILITY_COMMITMENTS.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <CheckCircle2
                        className="w-4 h-4 text-green-500 shrink-0 mt-0.5"
                        aria-hidden="true"
                      />
                      {item}
                    </li>
                  ))}
                </ul>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  To report an accessibility issue or request an accommodation, contact{' '}
                  <a
                    href="mailto:accessibility@csuchico.edu"
                    className="text-primary underline underline-offset-2 hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                  >
                    accessibility@csuchico.edu
                  </a>
                  .
                </p>
              </CardContent>
            </Card>
          </section>

          {/* ── Disclaimer ────────────────────────────────────────── */}
          <section aria-labelledby="disclaimer-heading">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10">
                <FlaskConical className="w-5 h-5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
              </div>
              <h2 id="disclaimer-heading" className="text-2xl font-bold">
                Project Disclaimer
              </h2>
            </div>
            <Card className="border-gold/40 bg-gold/5">
              <CardContent className="pt-5 space-y-3 text-sm text-muted-foreground leading-relaxed">
                <p>
                  <strong className="text-foreground">This is a prototype</strong> created as part of the{' '}
                  <strong className="text-foreground">CSU Chico AI Summer Camp</strong> — an educational
                  program exploring practical AI application development on AWS.
                </p>
                <p>
                  While every effort has been made to ensure accuracy, information provided by this
                  concierge may not reflect the most current CSU Chico policies or procedures.{' '}
                  <strong className="text-foreground">
                    Always verify important information with the relevant campus office before taking action.
                  </strong>
                </p>
                <p>
                  This tool is not an official CSU Chico product. It is not affiliated with or endorsed
                  by the California State University system.
                </p>
              </CardContent>
            </Card>
          </section>

          <Separator />

          {/* ── CTA ───────────────────────────────────────────────── */}
          <div className="text-center space-y-3 pb-4">
            <p className="text-muted-foreground">Ready to give it a try?</p>
            <Button asChild size="lg">
              <Link href="/chat">
                Open the Chat
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </div>
      </main>

      {/* ── Footer ──────────────────────────────────────────────────── */}
      <footer
        className="border-t border-border bg-card py-5 px-4 text-center text-sm text-muted-foreground"
        role="contentinfo"
      >
        <p>
          Powered by <span className="font-medium text-foreground">Amazon Bedrock</span>
          {' '}|{' '}
          <span className="italic">CSU Chico AI Summer Camp Prototype</span>
        </p>
      </footer>
    </div>
  )
}
