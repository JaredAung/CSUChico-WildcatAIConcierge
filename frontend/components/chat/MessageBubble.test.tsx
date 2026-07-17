import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { preprocessCitationMarkers, MessageBubble } from './MessageBubble'
import type { Source } from '@/lib/types'

// ─── preprocessCitationMarkers unit tests ─────────────────────────────────────

describe('preprocessCitationMarkers', () => {
  const sources: Source[] = [
    { title: 'Source 1', url: 'https://www.csuchico.edu/parking', citation_index: 1, domain_label: 'csuchico' },
    { title: 'Source 2', url: 'https://library.csuchico.edu/hours', citation_index: 2, domain_label: 'library' },
    { title: 'Source 3', url: 'https://www.csuchico.edu/admissions', citation_index: 3, domain_label: 'csuchico' },
  ]

  it('replaces valid [N] markers with cite-badge elements', () => {
    const content = 'Parking is available [1] and the library is open [2].'
    const result = preprocessCitationMarkers(content, sources)
    expect(result).toContain('<cite-badge data-index="1"></cite-badge>')
    expect(result).toContain('<cite-badge data-index="2"></cite-badge>')
    expect(result).not.toContain('[1]')
    expect(result).not.toContain('[2]')
  })

  it('does not convert [N] when N exceeds 20', () => {
    const content = 'Some info [21] here.'
    const result = preprocessCitationMarkers(content, sources)
    expect(result).toBe('Some info [21] here.')
  })

  it('does not convert [0]', () => {
    const content = 'Some info [0] here.'
    const result = preprocessCitationMarkers(content, sources)
    expect(result).toBe('Some info [0] here.')
  })

  it('does not convert [N] when no source has matching citation_index', () => {
    const content = 'Some info [5] here.'
    const result = preprocessCitationMarkers(content, sources)
    expect(result).toBe('Some info [5] here.')
  })

  it('protects markdown links from false-positive matches', () => {
    const content = 'Visit [CSU Chico](https://www.csuchico.edu) for more info [1].'
    const result = preprocessCitationMarkers(content, sources)
    expect(result).toContain('[CSU Chico](https://www.csuchico.edu)')
    expect(result).toContain('<cite-badge data-index="1"></cite-badge>')
  })

  it('handles grouped markers [N][M] adjacent', () => {
    const content = 'Parking options [1][2] are available.'
    const result = preprocessCitationMarkers(content, sources)
    expect(result).toContain('<cite-badge data-index="1"></cite-badge><cite-badge data-index="2"></cite-badge>')
  })

  it('returns content unchanged when sources is empty', () => {
    const content = 'No citations [1] here.'
    const result = preprocessCitationMarkers(content, [])
    expect(result).toBe('No citations [1] here.')
  })

  it('returns content unchanged when sources have no valid citation_index', () => {
    const content = 'No citations [1] here.'
    const sourcesNoIndex: Source[] = [
      { title: 'Source', url: 'https://example.com' },
    ]
    const result = preprocessCitationMarkers(content, sourcesNoIndex)
    expect(result).toBe('No citations [1] here.')
  })

  it('does not convert non-numeric bracket patterns like [text]', () => {
    const content = 'See [documentation] and [1] for details.'
    const result = preprocessCitationMarkers(content, sources)
    expect(result).toContain('[documentation]')
    expect(result).toContain('<cite-badge data-index="1"></cite-badge>')
  })

  it('handles content with no bracket patterns', () => {
    const content = 'No brackets here at all.'
    const result = preprocessCitationMarkers(content, sources)
    expect(result).toBe('No brackets here at all.')
  })

  it('does not convert markdown link patterns like [1](url)', () => {
    const content = 'See [1](https://example.com) for details.'
    const result = preprocessCitationMarkers(content, sources)
    // [1] followed by ( should NOT be converted
    expect(result).toContain('[1](https://example.com)')
    expect(result).not.toContain('<cite-badge data-index="1"></cite-badge>')
  })
})

// ─── MessageBubble component integration tests ────────────────────────────────

describe('MessageBubble', () => {
  it('renders plain text for user messages without processing citations', () => {
    render(
      <MessageBubble
        message={{ role: 'user', content: 'Hello [1]' }}
        sources={[{ title: 'Source 1', url: 'https://example.com', citation_index: 1, domain_label: 'example' }]}
      />
    )
    expect(screen.getByText('Hello [1]')).toBeInTheDocument()
  })

  it('renders assistant message as markdown without sources', () => {
    render(
      <MessageBubble
        message={{ role: 'assistant', content: 'Hello world' }}
      />
    )
    expect(screen.getByText('Hello world')).toBeInTheDocument()
  })

  it('renders citation badges for assistant messages with valid sources', () => {
    const sources: Source[] = [
      { title: 'Source 1', url: 'https://www.csuchico.edu', citation_index: 1, domain_label: 'csuchico' },
    ]
    render(
      <MessageBubble
        message={{ role: 'assistant', content: 'Parking info [1] here.' }}
        sources={sources}
      />
    )
    expect(screen.getByLabelText('Source 1: csuchico')).toBeInTheDocument()
  })

  it('renders invalid [N] markers as plain text when no matching source', () => {
    const sources: Source[] = [
      { title: 'Source 1', url: 'https://www.csuchico.edu', citation_index: 1, domain_label: 'csuchico' },
    ]
    render(
      <MessageBubble
        message={{ role: 'assistant', content: 'Info [5] here.' }}
        sources={sources}
      />
    )
    expect(screen.getByText(/\[5\]/)).toBeInTheDocument()
  })
})
