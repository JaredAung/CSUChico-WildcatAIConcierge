/**
 * Integration tests for the FileUploader component.
 * Tests the end-to-end file upload UI flow including validation, attachment, and state management.
 *
 * Validates: Requirements 6.4, 6.5, 6.7
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { FileUploader } from './FileUploader'

afterEach(() => {
  cleanup()
})

describe('FileUploader Integration — File Validation Flow', () => {
  it('shows error and does NOT call onFileAttach for unsupported file type (text/plain)', () => {
    const onFileAttach = vi.fn()
    const onFileRemove = vi.fn()
    render(<FileUploader onFileAttach={onFileAttach} onFileRemove={onFileRemove} />)

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['some text content'], 'notes.txt', { type: 'text/plain' })
    fireEvent.change(input, { target: { files: [file] } })

    // Error should be displayed
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Unsupported file type. Accepted: PNG, JPEG, GIF, WebP, PDF'
    )
    // onFileAttach should never have been called
    expect(onFileAttach).not.toHaveBeenCalled()
  })

  it('shows error and does NOT call onFileAttach for file exceeding 10 MB', () => {
    const onFileAttach = vi.fn()
    const onFileRemove = vi.fn()
    render(<FileUploader onFileAttach={onFileAttach} onFileRemove={onFileRemove} />)

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    // Create a file just over 10 MB
    const oversizedContent = new ArrayBuffer(10 * 1024 * 1024 + 1)
    const file = new File([oversizedContent], 'huge-image.png', { type: 'image/png' })
    fireEvent.change(input, { target: { files: [file] } })

    // Error should be displayed
    expect(screen.getByRole('alert')).toHaveTextContent('File exceeds 10 MB limit')
    // onFileAttach should never have been called
    expect(onFileAttach).not.toHaveBeenCalled()
  })

  it('calls onFileAttach with correct data for a valid PNG file within type and size limits', async () => {
    const onFileAttach = vi.fn()
    const onFileRemove = vi.fn()
    render(<FileUploader onFileAttach={onFileAttach} onFileRemove={onFileRemove} />)

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const validContent = 'PNG image binary data'
    const file = new File([validContent], 'screenshot.png', { type: 'image/png' })
    fireEvent.change(input, { target: { files: [file] } })

    // No error should appear
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    // onFileAttach should be called with correct structure
    await waitFor(() => {
      expect(onFileAttach).toHaveBeenCalledTimes(1)
      expect(onFileAttach).toHaveBeenCalledWith({
        content: expect.any(String), // base64 content
        mime_type: 'image/png',
        filename: 'screenshot.png',
      })
    })
  })

  it('calls onFileAttach with correct data for a valid PDF file', async () => {
    const onFileAttach = vi.fn()
    const onFileRemove = vi.fn()
    render(<FileUploader onFileAttach={onFileAttach} onFileRemove={onFileRemove} />)

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['%PDF-1.4 fake pdf content'], 'syllabus.pdf', { type: 'application/pdf' })
    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => {
      expect(onFileAttach).toHaveBeenCalledTimes(1)
      expect(onFileAttach).toHaveBeenCalledWith({
        content: expect.any(String),
        mime_type: 'application/pdf',
        filename: 'syllabus.pdf',
      })
    })
  })
})

describe('FileUploader Integration — Dismiss Flow', () => {
  it('dismiss button removes file and calls onFileRemove', () => {
    const onFileAttach = vi.fn()
    const onFileRemove = vi.fn()
    render(
      <FileUploader
        onFileAttach={onFileAttach}
        onFileRemove={onFileRemove}
        attachedFile={{
          filename: 'report.pdf',
          mime_type: 'application/pdf',
        }}
      />
    )

    // The file chip should be visible
    expect(screen.getByText('report.pdf')).toBeInTheDocument()

    // Click the dismiss button
    const dismissBtn = screen.getByLabelText('Remove attached file: report.pdf')
    fireEvent.click(dismissBtn)

    // onFileRemove should be called
    expect(onFileRemove).toHaveBeenCalledTimes(1)
  })
})

describe('FileUploader Integration — Upload In Progress State', () => {
  it('disables the attach button while isUploading=true', () => {
    const onFileAttach = vi.fn()
    const onFileRemove = vi.fn()
    render(
      <FileUploader
        onFileAttach={onFileAttach}
        onFileRemove={onFileRemove}
        isUploading={true}
      />
    )

    const attachButton = screen.getByLabelText('Attach file')
    expect(attachButton).toBeDisabled()
  })

  it('shows progress indicator while isUploading=true', () => {
    const onFileAttach = vi.fn()
    const onFileRemove = vi.fn()
    render(
      <FileUploader
        onFileAttach={onFileAttach}
        onFileRemove={onFileRemove}
        isUploading={true}
      />
    )

    expect(screen.getByRole('status', { name: 'Upload in progress' })).toBeInTheDocument()
    expect(screen.getByText('Uploading…')).toBeInTheDocument()
  })

  it('attach button is enabled when isUploading=false', () => {
    const onFileAttach = vi.fn()
    const onFileRemove = vi.fn()
    render(
      <FileUploader
        onFileAttach={onFileAttach}
        onFileRemove={onFileRemove}
        isUploading={false}
      />
    )

    const attachButton = screen.getByLabelText('Attach file')
    expect(attachButton).not.toBeDisabled()
  })
})
