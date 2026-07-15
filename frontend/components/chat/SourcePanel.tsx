'use client'

import { useState } from 'react'
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Phone,
  Mail,
  Globe,
  BookOpen,
  Building2,
  BarChart2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Source, Department } from '@/lib/types'

// ─── Props ─────────────────────────────────────────────────────────────────────

interface SourcePanelProps {
  sources: Source[]
  departments?: Department[]
  /** Overall confidence score 0–1 from the RAG retrieval */
  confidence?: number
  className?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Derive a document-type label from the source URL or title.
 * Falls back to 'Document'.
 */
function inferSourceType(source: Source): string {
  const lower = (source.url + source.title).toLowerCase()
  if (lower.includes('pdf')) return 'PDF'
  if (lower.includes('form')) return 'Form'
  if (lower.includes('policy') || lower.includes('policies')) return 'Policy'
  if (lower.includes('faq')) return 'FAQ'
  if (lower.includes('event')) return 'Event'
  if (lower.includes('news') || lower.includes('press')) return 'News'
  return 'Document'
}

const sourceTypeBadge: Record<string, 'default' | 'secondary' | 'info' | 'gold' | 'warning' | 'success'> = {
  PDF: 'warning',
  Form: 'gold',
  Policy: 'info',
  FAQ: 'secondary',
  Event: 'success',
  News: 'default',
  Document: 'secondary',
}

function ConfidenceBar({ score }: { score: number }) {
  const pct = Math.round(score * 100)
  const color =
    score >= 0.75
      ? 'bg-green-500'
      : score >= 0.5
      ? 'bg-amber-400'
      : 'bg-red-500'
  const label =
    score >= 0.75 ? 'High confidence' : score >= 0.5 ? 'Moderate confidence' : 'Low confidence'

  return (
    <div className="flex items-center gap-2" aria-label={`Confidence: ${pct}% — ${label}`}>
      <span className="text-xs text-muted-foreground shrink-0">Confidence</span>
      <div
        className="flex-1 h-2 rounded-full bg-muted overflow-hidden"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className={cn('h-full rounded-full transition-all duration-500', color)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground shrink-0 tabular-nums w-8 text-right">
        {pct}%
      </span>
    </div>
  )
}

// ─── SourcePanel ──────────────────────────────────────────────────────────────

export function SourcePanel({ sources, departments = [], confidence, className }: SourcePanelProps) {
  const [isOpen, setIsOpen] = useState(false)

  const hasSources = sources.length > 0
  const hasDepts = departments.length > 0
  const hasContent = hasSources || hasDepts

  if (!hasContent && confidence === undefined) return null

  const toggleId = `source-panel-toggle-${Math.random().toString(36).slice(2, 8)}`
  const regionId = `source-panel-region-${Math.random().toString(36).slice(2, 8)}`

  return (
    <div className={cn('rounded-lg border border-border bg-muted/30 overflow-hidden', className)}>
      {/* ── Toggle Button ────────────────────────────────────────────── */}
      <Button
        id={toggleId}
        variant="ghost"
        size="sm"
        onClick={() => setIsOpen((v) => !v)}
        aria-expanded={isOpen}
        aria-controls={regionId}
        className="w-full justify-between rounded-none h-auto py-2.5 px-4 font-medium text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50"
      >
        <span className="flex items-center gap-2">
          <BookOpen className="w-4 h-4" aria-hidden="true" />
          {hasSources
            ? `${sources.length} Source${sources.length !== 1 ? 's' : ''}`
            : 'Sources'}
          {hasDepts && (
            <Badge variant="secondary" className="text-xs py-0">
              +{departments.length} dept{departments.length !== 1 ? 's' : ''}
            </Badge>
          )}
        </span>
        {isOpen ? (
          <ChevronUp className="w-4 h-4" aria-hidden="true" />
        ) : (
          <ChevronDown className="w-4 h-4" aria-hidden="true" />
        )}
      </Button>

      {/* ── Collapsible Content ──────────────────────────────────────── */}
      <div
        id={regionId}
        role="region"
        aria-labelledby={toggleId}
        hidden={!isOpen}
        className={cn(
          'transition-all duration-200',
          isOpen ? 'block' : 'hidden',
        )}
      >
        <div className="px-4 pb-4 pt-1 space-y-4">
          {/* Confidence bar */}
          {confidence !== undefined && (
            <ConfidenceBar score={confidence} />
          )}

          {/* ── Source Documents ────────────────────────────────────── */}
          {hasSources && (
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                <BookOpen className="w-3.5 h-3.5" aria-hidden="true" />
                Source Documents
              </h3>
              <ul className="space-y-2" aria-label="Source documents">
                {sources.map((source, i) => {
                  const type = inferSourceType(source)
                  const badgeVariant = sourceTypeBadge[type] ?? 'secondary'
                  return (
                    <li
                      key={i}
                      className="rounded-md border border-border bg-background/60 px-3 py-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <Badge variant={badgeVariant} className="text-xs py-0 shrink-0">
                              {type}
                            </Badge>
                            {source.relevance_score !== undefined && (
                              <span className="text-xs text-muted-foreground">
                                {Math.round(source.relevance_score * 100)}% relevant
                              </span>
                            )}
                          </div>
                          <p className="text-sm font-medium leading-tight truncate" title={source.title}>
                            {source.title}
                          </p>
                          {source.excerpt && (
                            <p className="text-xs text-muted-foreground mt-1 leading-relaxed line-clamp-2">
                              {source.excerpt}
                            </p>
                          )}
                        </div>

                        {source.url && (
                          <a
                            href={source.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0 text-primary hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                            aria-label={`Open ${source.title} (opens in new tab)`}
                          >
                            <ExternalLink className="w-4 h-4" aria-hidden="true" />
                          </a>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          {/* ── Department Recommendations ───────────────────────────── */}
          {hasDepts && (
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5" aria-hidden="true" />
                Recommended Departments
              </h3>
              <ul className="space-y-2" aria-label="Recommended departments">
                {departments.map((dept, i) => (
                  <li
                    key={i}
                    className="rounded-md border border-border bg-background/60 px-3 py-2 space-y-1"
                  >
                    <p className="text-sm font-medium">{dept.name}</p>
                    {dept.description && (
                      <p className="text-xs text-muted-foreground leading-relaxed">{dept.description}</p>
                    )}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                      {dept.phone && (
                        <a
                          href={`tel:${dept.phone}`}
                          className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                          aria-label={`Call ${dept.name}: ${dept.phone}`}
                        >
                          <Phone className="w-3 h-3" aria-hidden="true" />
                          {dept.phone}
                        </a>
                      )}
                      {dept.email && (
                        <a
                          href={`mailto:${dept.email}`}
                          className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                          aria-label={`Email ${dept.name}: ${dept.email}`}
                        >
                          <Mail className="w-3 h-3" aria-hidden="true" />
                          {dept.email}
                        </a>
                      )}
                      {dept.website && (
                        <a
                          href={dept.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                          aria-label={`${dept.name} website (opens in new tab)`}
                        >
                          <Globe className="w-3 h-3" aria-hidden="true" />
                          Website
                        </a>
                      )}
                    </div>
                    {dept.location && (
                      <p className="text-xs text-muted-foreground">{dept.location}</p>
                    )}
                    {dept.hours && (
                      <p className="text-xs text-muted-foreground">{dept.hours}</p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
