'use client'

import { useRef, useState } from 'react'
import { ArrowUploadRegular, DocumentRegular } from '@fluentui/react-icons'
import { cn } from '@/lib/utils'

interface FileDropzoneProps {
  accept?: string
  onFileSelected: (file: File) => void
  selectedFileName?: string | null
}

export function FileDropzone({ accept = '.csv,.xlsx,.xls', onFileSelected, selectedFileName }: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)

  function handleFiles(files: FileList | null) {
    const file = files?.[0]
    if (file) onFileSelected(file)
  }

  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFiles(e.dataTransfer.files) }}
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-colors',
        isDragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/50'
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      {selectedFileName ? (
        <>
          <DocumentRegular className="h-8 w-8 text-primary" />
          <p className="text-sm font-medium text-foreground">{selectedFileName}</p>
          <p className="text-xs text-muted-foreground">Click or drop a file to replace it</p>
        </>
      ) : (
        <>
          <ArrowUploadRegular className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">Click to browse or drag a file here</p>
          <p className="text-xs text-muted-foreground">CSV or Excel (.xlsx, .xls)</p>
        </>
      )}
    </div>
  )
}
