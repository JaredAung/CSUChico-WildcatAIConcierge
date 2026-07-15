'use client'

import { Clock, CheckCircle2, Circle, Loader2, FileText, Building2 } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { WorkflowCard as WorkflowCardType, WorkflowStep } from '@/lib/types'

// ─── Step Status Helpers ───────────────────────────────────────────────────────

type StepStatus = 'completed' | 'in_progress' | 'pending'

function inferStepStatus(step: WorkflowStep, index: number, total: number): StepStatus {
  // WorkflowStep doesn't carry a runtime status; we infer visually from position.
  // Callers can override by passing explicit status via the statusMap prop.
  return 'pending'
}

const statusConfig: Record<StepStatus, { label: string; badgeVariant: 'success' | 'info' | 'secondary'; Icon: React.FC<{ className?: string }> }> = {
  completed: {
    label: 'Completed',
    badgeVariant: 'success',
    Icon: ({ className }) => <CheckCircle2 className={cn('text-green-500', className)} />,
  },
  in_progress: {
    label: 'In Progress',
    badgeVariant: 'info',
    Icon: ({ className }) => <Loader2 className={cn('text-blue-500 animate-spin', className)} />,
  },
  pending: {
    label: 'Pending',
    badgeVariant: 'secondary',
    Icon: ({ className }) => <Circle className={cn('text-muted-foreground', className)} />,
  },
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface WorkflowCardProps {
  workflow: WorkflowCardType
  /** Optional map of step_number → status for runtime progress tracking */
  statusMap?: Record<number, StepStatus>
  className?: string
}

// ─── WorkflowCard ─────────────────────────────────────────────────────────────

export function WorkflowCard({ workflow, statusMap, className }: WorkflowCardProps) {
  const {
    title,
    description,
    total_estimated_time,
    steps,
    departments_involved,
    notes,
  } = workflow

  // Collect all unique required documents across steps
  const allForms = Array.from(
    new Set(steps.flatMap((s) => s.required_documents ?? []))
  )

  return (
    <Card
      className={cn('border-primary/20 bg-card shadow-sm', className)}
      role="region"
      aria-label={`Workflow guide: ${title}`}
    >
      {/* ── Header ─────────────────────────────────────────────────── */}
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <CardTitle className="text-base leading-snug">{title}</CardTitle>
          {total_estimated_time && (
            <Badge variant="gold" className="shrink-0 flex items-center gap-1">
              <Clock className="w-3 h-3" aria-hidden="true" />
              {total_estimated_time}
            </Badge>
          )}
        </div>
        {description && (
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        )}
      </CardHeader>

      <CardContent className="space-y-5 pt-0">
        {/* ── Steps ────────────────────────────────────────────────── */}
        <ol aria-label="Workflow steps" className="space-y-3">
          {steps.map((step) => {
            const status = statusMap?.[step.step_number] ?? 'pending'
            const { label, badgeVariant, Icon } = statusConfig[status]

            return (
              <li
                key={step.step_number}
                className="flex gap-3 rounded-lg border border-border p-3 bg-background/50"
              >
                {/* Step number circle */}
                <div
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold"
                  aria-hidden="true"
                >
                  {step.step_number}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="text-sm font-medium leading-tight">{step.title}</span>
                    <Badge variant={badgeVariant} className="flex items-center gap-1 text-xs py-0">
                      <Icon className="w-3 h-3" aria-hidden="true" />
                      {label}
                    </Badge>
                    {step.estimated_time && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" aria-hidden="true" />
                        {step.estimated_time}
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {step.description}
                  </p>

                  {step.action_url && step.action_label && (
                    <a
                      href={step.action_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1.5 inline-flex text-xs text-primary underline underline-offset-2 hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                      aria-label={`${step.action_label} (opens in new tab)`}
                    >
                      {step.action_label} ↗
                    </a>
                  )}

                  {step.tips && step.tips.length > 0 && (
                    <ul className="mt-2 space-y-0.5" aria-label="Tips for this step">
                      {step.tips.map((tip, i) => (
                        <li key={i} className="text-xs text-muted-foreground flex gap-1">
                          <span aria-hidden="true">💡</span>
                          <span>{tip}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            )
          })}
        </ol>

        {/* ── Required Forms ────────────────────────────────────────── */}
        {allForms.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
              <FileText className="w-3.5 h-3.5" aria-hidden="true" />
              Required Forms
            </h4>
            <div className="flex flex-wrap gap-1.5" role="list" aria-label="Required forms">
              {allForms.map((form) => (
                <Badge
                  key={form}
                  variant="outline"
                  className="text-xs"
                  role="listitem"
                >
                  {form}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* ── Responsible Offices ───────────────────────────────────── */}
        {departments_involved && departments_involved.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
              <Building2 className="w-3.5 h-3.5" aria-hidden="true" />
              Responsible Offices
            </h4>
            <ul className="space-y-1.5" aria-label="Responsible offices">
              {departments_involved.map((dept) => (
                <li
                  key={dept.name}
                  className="rounded-md border border-border px-3 py-2 bg-background/50"
                >
                  <span className="text-sm font-medium">{dept.name}</span>
                  {dept.phone && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {dept.phone}
                    </span>
                  )}
                  {dept.website && (
                    <a
                      href={dept.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-2 text-xs text-primary underline underline-offset-2 hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                      aria-label={`${dept.name} website (opens in new tab)`}
                    >
                      Website ↗
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ── Notes ─────────────────────────────────────────────────── */}
        {notes && notes.length > 0 && (
          <div className="rounded-md bg-gold/10 border border-gold/30 px-3 py-2">
            <h4 className="text-xs font-semibold text-gold-800 dark:text-gold-300 uppercase tracking-wide mb-1">
              Notes
            </h4>
            <ul className="space-y-1" aria-label="Additional notes">
              {notes.map((note, i) => (
                <li key={i} className="text-xs text-muted-foreground">{note}</li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
