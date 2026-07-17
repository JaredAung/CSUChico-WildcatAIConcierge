import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { FileUploader } from './FileUploader'

afterEach(() => {
  cleanup()
})

describe('FileUploader', () => {
  const defaultProps = {
    onFileAttach: vi.fn(),
    onFileRemove: vi.fn(),
  }

  it('renders the attachment button', () => {
    render(<FileUploader {...defaultProps} />)
    expect(screen.getByLabelText('Attach file')).toBeInTheDocument()
  })

  it('disables button when disabled prop is true', () => {
    render(<FileUploader {...defaultProps} disabled />)
    expect(screen.getByLabelText('Attach file')).toBeDisabled()
  })

  it('disables button when isUploading is true', () => {
    render(<FileUploader {...defaultProps} isUploading />)
    expect(screen.getByLabelText('Attach file')).toBeDisabled()
  })

  it('shows upload progress indicator when isUploading', () => {
    render(<FileUploader {...defaultProps} isUploading />)
    expect(screen.getByRole('status', { name: 'Upload in progress' })).toBeInTheDocument()
    expect(screen.getByText('Uploading…')).toBeInTheDocument()
  })

  it('shows error for unsupported file type', () => {
    render(<FileUploader {...defaultProps} />)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement

    const file = new File(['content'], 'test.txt', { type: 'text/plain' })
    fireEvent.change(input, { target: { files: [file] } })

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Unsupported file type. Accepted: PNG, JPEG, GIF, WebP, PDF'
    )
  })

  it('shows error for file exceeding 10 MB', () => {
    render(<FileUploader {...defaultProps} />)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement

    // Create a file > 10 MB
    const largeContent = new ArrayBuffer(10 * 1024 * 1024 + 1)
    const file = new File([largeContent], 'large.png', { type: 'image/png' })
    fireEvent.change(input, { target: { files: [file] } })

    expect(screen.getByRole('alert')).toHaveTextContent('File exceeds 10 MB limit')
  })

  it('calls onFileAttach with base64 content for valid file', async () => {
    const onFileAttach = vi.fn()
    render(<FileUploader {...defaultProps} onFileAttach={onFileAttach} />)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement

    const file = new File(['hello'], 'test.png', { type: 'image/png' })
    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => {
      expect(onFileAttach).toHaveBeenCalledWith({
        content: expect.any(String),
        mime_type: 'image/png',
        filename: 'test.png',
      })
    })
  })

  it('shows image thumbnail preview when image file is attached', () => {
    render(
      <FileUploader
        {...defaultProps}
        attachedFile={{
          filename: 'photo.png',
          mime_type: 'image/png',
          previewUrl: 'data:image/png;base64,abc',
        }}
      />
    )
    const img = screen.getByAltText('Preview of photo.png')
    expect(img).toBeInTheDocument()
    expect(img).toHaveAttribute('src', 'data:image/png;base64,abc')
  })

  it('shows filename chip for non-image files', () => {
    render(
      <FileUploader
        {...defaultProps}
        attachedFile={{
          filename: 'document.pdf',
          mime_type: 'application/pdf',
        }}
      />
    )
    expect(screen.getByText('document.pdf')).toBeInTheDocument()
  })

  it('truncates long filenames to 30 chars', () => {
    render(
      <FileUploader
        {...defaultProps}
        attachedFile={{
          filename: 'this-is-a-very-long-filename-that-exceeds-limit.pdf',
          mime_type: 'application/pdf',
        }}
      />
    )
    // Should be truncated with ellipsis + extension
    const filenameEl = screen.getByText(/…\.pdf$/)
    expect(filenameEl).toBeInTheDocument()
    expect(filenameEl.textContent!.length).toBeLessThanOrEqual(30)
  })

  it('shows dismiss button and calls onFileRemove', () => {
    const onFileRemove = vi.fn()
    render(
      <FileUploader
        {...defaultProps}
        onFileRemove={onFileRemove}
        attachedFile={{
          filename: 'test.png',
          mime_type: 'image/png',
        }}
      />
    )
    const dismissBtn = screen.getByLabelText('Remove attached file: test.png')
    fireEvent.click(dismissBtn)
    expect(onFileRemove).toHaveBeenCalledOnce()
  })

  it('accepts valid file types in the file input', () => {
    render(<FileUploader {...defaultProps} />)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    expect(input.getAttribute('accept')).toBe('.png,.jpg,.jpeg,.gif,.webp,.pdf')
  })

  it('does not show error when no file is selected', () => {
    render(<FileUploader {...defaultProps} />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('accepts image/jpeg files', async () => {
    const onFileAttach = vi.fn()
    render(<FileUploader {...defaultProps} onFileAttach={onFileAttach} />)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement

    const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' })
    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => {
      expect(onFileAttach).toHaveBeenCalledWith({
        content: expect.any(String),
        mime_type: 'image/jpeg',
        filename: 'photo.jpg',
      })
    })
  })

  it('accepts application/pdf files', async () => {
    const onFileAttach = vi.fn()
    render(<FileUploader {...defaultProps} onFileAttach={onFileAttach} />)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement

    const file = new File(['pdf content'], 'report.pdf', { type: 'application/pdf' })
    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => {
      expect(onFileAttach).toHaveBeenCalledWith({
        content: expect.any(String),
        mime_type: 'application/pdf',
        filename: 'report.pdf',
      })
    })
  })
})
