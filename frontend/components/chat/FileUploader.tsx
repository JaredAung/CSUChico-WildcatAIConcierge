'use client'

import { useRef, useState, useCallback } from 'react'
import { Paperclip, X, Loader2, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// ─── Constants ─────────────────────────────────────────────────────────────────

const ACCEPTED_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/pdf',
]

const ACCEPTED_EXTENSIONS = '.png,.jpg,.jpeg,.gif,.webp,.pdf'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

const MAX_FILENAME_LENGTH = 30

// ─── Props ─────────────────────────────────────────────────────────────────────

export interface FileUploaderProps {
  /** Called when a valid file is attached */
  onFileAttach: (file: { content: string; mime_type: string; filename: string }) => void
  /** Called when the file is removed/dismissed */
  onFileRemove: () => void
  /** Whether the file uploader is disabled (e.g., during send) */
  disabled?: boolean
  /** Whether an upload is currently in progress */
  isUploading?: boolean
  /** Currently attached file info for display */
  attachedFile?: { filename: string; mime_type: string; previewUrl?: string } | null
  /** Additional Tailwind class names */
  className?: string
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function truncateFilename(name: string): string {
  if (name.length <= MAX_FILENAME_LENGTH) return name
  const ext = name.lastIndexOf('.') !== -1 ? name.slice(name.lastIndexOf('.')) : ''
  const maxBase = MAX_FILENAME_LENGTH - ext.length - 1 // 1 for the ellipsis character
  if (maxBase <= 0) return name.slice(0, MAX_FILENAME_LENGTH)
  return name.slice(0, maxBase) + '…' + ext
}

function isImageType(mimeType: string): boolean {
  return mimeType.startsWith('image/')
}

// ─── FileUploader Component ────────────────────────────────────────────────────

/**
 * File uploader for the chat input area. Allows attaching one file per message
 * with type/size validation, preview, and dismiss functionality.
 */
export function FileUploader({
  onFileAttach,
  onFileRemove,
  disabled = false,
  isUploading = false,
  attachedFile,
  className,
}: FileUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)

  const handleButtonClick = useCallback(() => {
    if (disabled || isUploading) return
    fileInputRef.current?.click()
  }, [disabled, isUploading])

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setError(null)
      const file = e.target.files?.[0]

      // Reset input so the same file can be re-selected
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }

      if (!file) return

      // Validate file type
      if (!ACCEPTED_TYPES.includes(file.type)) {
        setError('Unsupported file type. Accepted: PNG, JPEG, GIF, WebP, PDF')
        return
      }

      // Validate file size
      if (file.size > MAX_FILE_SIZE) {
        setError('File exceeds 10 MB limit')
        return
      }

      // Convert to base64
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result as string
        // Strip data URL prefix (e.g., "data:image/png;base64,")
        const base64Content = result.split(',')[1] || ''
        onFileAttach({
          content: base64Content,
          mime_type: file.type,
          filename: file.name,
        })
      }
      reader.onerror = () => {
        setError('Failed to read file. Please try again.')
      }
      reader.readAsDataURL(file)
    },
    [onFileAttach],
  )

  const handleDismiss = useCallback(() => {
    setError(null)
    onFileRemove()
  }, [onFileRemove])

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      {/* Attachment preview area */}
      {attachedFile && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-2 py-1.5">
          {/* Preview: thumbnail for images, filename chip for non-images */}
          {isImageType(attachedFile.mime_type) ? (
            <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md border border-border">
              {attachedFile.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={attachedFile.previewUrl}
                  alt={`Preview of ${attachedFile.filename}`}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-muted text-muted-foreground">
                  <Paperclip className="h-4 w-4" aria-hidden="true" />
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 border border-border">
              <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
              <span className="text-xs text-foreground font-medium truncate max-w-[200px]">
                {truncateFilename(attachedFile.filename)}
              </span>
            </div>
          )}

          {/* Dismiss button */}
          <button
            type="button"
            onClick={handleDismiss}
            disabled={isUploading}
            aria-label={`Remove attached file: ${attachedFile.filename}`}
            className={cn(
              'ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
              'text-muted-foreground hover:text-foreground hover:bg-muted',
              'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              'disabled:opacity-50 disabled:pointer-events-none',
            )}
          >
            <X className="h-3 w-3" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Upload progress indicator */}
      {isUploading && (
        <div className="flex items-center gap-2 px-1" role="status" aria-label="Upload in progress">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-hidden="true" />
          <span className="text-xs text-muted-foreground">Uploading…</span>
        </div>
      )}

      {/* Error message */}
      {error && (
        <p
          role="alert"
          className="text-xs text-destructive px-1"
        >
          {error}
        </p>
      )}

      {/* Attachment button */}
      <div className="flex items-center">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={handleButtonClick}
          disabled={disabled || isUploading}
          aria-label="Attach file"
          title="Attach file (PNG, JPEG, GIF, WebP, PDF — max 10 MB)"
          className="text-muted-foreground hover:text-foreground"
        >
          {isUploading ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Paperclip className="h-4 w-4" aria-hidden="true" />
          )}
        </Button>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_EXTENSIONS}
          onChange={handleFileChange}
          className="hidden"
          aria-hidden="true"
          tabIndex={-1}
        />
      </div>
    </div>
  )
}
