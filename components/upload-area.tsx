"use client"

import type React from "react"

import { useRef } from "react"
import { Upload } from "lucide-react"
import { Button } from "@/components/ui/button"

interface UploadAreaProps {
  onFileSelect: (file: File) => void
  loading: boolean
}

export default function UploadArea({ onFileSelect, loading }: UploadAreaProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dragCounterRef = useRef(0)

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    dragCounterRef.current++
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    dragCounterRef.current--
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    dragCounterRef.current = 0
    const files = e.dataTransfer.files
    if (files.length > 0) {
      onFileSelect(files[0])
    }
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.currentTarget.files
    if (files?.length) {
      onFileSelect(files[0])
    }
  }

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className="border-2 border-dashed border-border rounded-2xl p-12 text-center hover:border-primary/50 transition-smooth cursor-pointer bg-gradient-to-b from-secondary/40 to-secondary/10"
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.gif,.webp"
        onChange={handleFileInputChange}
        className="hidden"
        disabled={loading}
      />

      <div className="flex flex-col items-center justify-center gap-4">
        <div className="w-16 h-16 bg-gradient-to-br from-primary/20 to-accent/20 rounded-full flex items-center justify-center ring-1 ring-primary/30">
          <Upload className="w-8 h-8 text-primary" />
        </div>

        <div>
          <h3 className="text-lg font-semibold text-foreground">
            {loading ? "Processing your file..." : "Drop your PDF or image here"}
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            {loading ? "Please wait while we extract the text" : "Supports PDF, JPG, PNG, GIF, WebP (PDF up to 20MB, Images up to 4MB)"}
          </p>
        </div>

        {!loading && (
          <Button onClick={() => fileInputRef.current?.click()} className="mt-4 transition-smooth">
            Select File
          </Button>
        )}
      </div>
    </div>
  )
}
