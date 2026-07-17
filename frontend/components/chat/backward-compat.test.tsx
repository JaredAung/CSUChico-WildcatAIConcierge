import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import { MessageBubble } from './MessageBubble'
import { SourcePanel } from './SourcePanel'
import type { Source } from '@/lib/types'

afterEach(() => {
  cleanup()
})

// ─── MessageBubble backward compatibility tests ───────────────────────────────

describe('MessageBubble backward compatibility', () => {
  it('renders plain markdown with no badges when sources is empty', () => {
    render(
      <MessageBubble
        message={{ role: 'assistant', content: 'The library is open until 10pm.' }}
        sources={[]}
      />
    )
    expect(screen.getByText('The library is open until 10pm.')).toBeInTheDocument()
    // No citation badge should be present
    expect(screen.queryByLabelText(/^Source \d+:/)).toBeNull()
  })

  it('renders [N] as plain text when sources have no citation_index fields', () => {
    render(
      <MessageBubble
        message={{ role: 'assistant', content: 'Parking is available [1] and the library is open [2].' }}
        sources={[
          { title: 'Parking Info', url: 'https://csuchico.edu/parking', relevance_score: 0.9, excerpt: 'Parking details...' },
          { title: 'Library Hours', url: 'https://library.csuchico.edu/hours', relevance_score: 0.85, excerpt: 'Hours...' },
        ]}
      />
    )
    // Since sources don't have citation_index, [N] markers should pass through as plain text
    expect(screen.getByText(/\[1\]/)).toBeInTheDocument()
    expect(screen.getByText(/\[2\]/)).toBeInTheDocument()
    // No citation badge aria-labels should be present
    expect(screen.queryByLabelText(/^Source \d+:/)).toBeNull()
  })

  it('renders plain markdown when answer contains no valid [N] markers', () => {
    render(
      <MessageBubble
        message={{ role: 'assistant', content: 'The campus has many resources available for students.' }}
        sources={[
          { title: 'Parking Info', url: 'https://csuchico.edu/parking', citation_index: 1, domain_label: 'csuchico' },
        ]}
      />
    )
    expect(screen.getByText('The campus has many resources available for students.')).toBeInTheDocument()
    // No badges rendered since no [N] markers exist in the text
    expect(screen.queryByLabelText(/^Source \d+:/)).toBeNull()
  })
})

// ─── SourcePanel backward compatibility tests ─────────────────────────────────

describe('SourcePanel backward compatibility', () => {
  it('renders existing layout for sources without citation_index', () => {
    const sources: Source[] = [
      {
        title: 'Parking Services',
        url: 'https://www.csuchico.edu/parking',
        relevance_score: 0.92,
        excerpt: 'CSU Chico offers several parking options for students.',
      },
      {
        title: 'Library Information',
        url: 'https://library.csuchico.edu/hours',
        relevance_score: 0.87,
        excerpt: 'The library is open Monday through Friday.',
      },
    ]

    const { container } = render(<SourcePanel sources={sources} />)

    // Expand the panel
    const toggle = container.querySelector('button[aria-expanded]') as HTMLElement
    toggle.click()

    // Verify existing layout elements: document-type badge, relevance scores, excerpts
    expect(screen.getByText('92% relevant')).toBeInTheDocument()
    expect(screen.getByText('87% relevant')).toBeInTheDocument()
    expect(screen.getByText('Parking Services')).toBeInTheDocument()
    expect(screen.getByText('Library Information')).toBeInTheDocument()
    expect(screen.getByText('CSU Chico offers several parking options for students.')).toBeInTheDocument()
    expect(screen.getByText('The library is open Monday through Friday.')).toBeInTheDocument()

    // No numbered citation badges should be rendered (no citation_index means no circle badge)
    expect(screen.queryByLabelText(/^Citation \d+$/)).toBeNull()
  })

  it('renders citation badge without domain label when citation_index present but domain_label absent', () => {
    const sources: Source[] = [
      {
        title: 'Parking Services',
        url: 'https://www.csuchico.edu/parking',
        citation_index: 1,
        chunk_text: 'CSU Chico offers several parking options.',
        // No domain_label field
      },
    ]

    const { container } = render(<SourcePanel sources={sources} />)

    // Expand the panel
    const toggle = container.querySelector('button[aria-expanded]') as HTMLElement
    toggle.click()

    // Verify citation index badge is rendered (the numbered circle with "1")
    expect(within(container).getByLabelText('Citation 1')).toBeInTheDocument()
    expect(within(container).getByText('Parking Services')).toBeInTheDocument()

    // No domain label text should appear adjacent to badge when domain_label is absent
    const domainLabelElement = container.querySelector('.text-xs.font-medium.text-muted-foreground')
    expect(domainLabelElement).toBeNull()
  })
})
