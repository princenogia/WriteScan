"use client"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import UploadArea from "@/components/upload-area"
import ResultsDisplay from "@/components/results-display"
import { Loader2, FileUp, Download, Moon, Sun } from 'lucide-react'
import Image from "next/image"

interface ExtractedText {
  page: number
  content: {
    type: "heading" | "paragraph" | "bullet-list" | "text"
    text: string
    items?: string[]
  }[]
}

export default function Home() {
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<ExtractedText[] | null>(null)
  const [error, setError] = useState("")
  const [isDark, setIsDark] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const isDarkMode = document.documentElement.classList.contains("dark")
    setIsDark(isDarkMode)
  }, [])

  const toggleDarkMode = () => {
    const html = document.documentElement
    if (isDark) {
      html.classList.remove("dark")
      localStorage.setItem("theme", "light")
    } else {
      html.classList.add("dark")
      localStorage.setItem("theme", "dark")
    }
    setIsDark(!isDark)
  }

  const handleFileSelect = async (file: File) => {
    if (file.size > 100 * 1024 * 1024) {
      setError("File size must be less than 100MB")
      return
    }

    const allowedTypes = ["application/pdf", "image/jpeg", "image/png", "image/gif", "image/webp"]
    if (!allowedTypes.includes(file.type)) {
      setError("Please upload a PDF or image file (JPG, PNG, GIF, WebP)")
      return
    }

    setLoading(true)
    setError("")
    setResults(null)

    try {
      const formData = new FormData()
      formData.append("file", file)

      const response = await fetch("/api/ocr", {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        const errorData = await response.json()
        let errorMessage = errorData.error || "Failed to process file"
        if (errorMessage.includes("429") || errorMessage.includes("RESOURCE_EXHAUSTED")) {
          errorMessage =
            "API rate limit reached. Please wait a moment and try again. Free tier has usage limits - consider processing files one at a time."
        }
        throw new Error(errorMessage)
      }

      const data = await response.json()
      setResults(data.results)
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-secondary/20 to-background">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur-xl border-b border-border/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Image 
                src="/logo.png" 
                alt="WriteScan Logo" 
                width={200}
                height={200}
                className="h-24 w-auto object-contain"
              />
            </div>
            <button
              onClick={toggleDarkMode}
              className="p-2.5 rounded-lg border border-border hover:bg-secondary transition-smooth"
              aria-label="Toggle dark mode"
            >
              {isDark ? <Sun className="w-5 h-5 text-foreground" /> : <Moon className="w-5 h-5 text-foreground" />}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {!results ? (
          <div className="space-y-8 fade-in">
            {/* Upload Section */}
            <Card className="p-8 border-border/50 shadow-sm hover:shadow-md transition-smooth">
              <UploadArea onFileSelect={handleFileSelect} loading={loading} />

              {error && (
                <div className="mt-6 p-4 bg-destructive/10 border border-destructive/30 rounded-lg slide-up">
                  <p className="text-destructive text-sm font-medium">{error}</p>
                  {error.includes("rate limit") && (
                    <p className="text-destructive/80 text-xs mt-2">
                      Free tier quota: 15 requests per minute. Consider upgrading to Gemini API paid tier for higher
                      limits.
                    </p>
                  )}
                </div>
              )}

              {loading && (
                <div className="mt-6 flex items-center justify-center gap-3 p-4 bg-primary/5 border border-primary/20 rounded-lg slide-up">
                  <Loader2 className="w-5 h-5 text-primary animate-spin" />
                  <p className="text-sm text-foreground font-medium">Processing your file... This may take a moment.</p>
                </div>
              )}
            </Card>

            {/* Info Section */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="p-6 border-border/50 bg-gradient-to-br from-card to-secondary/30 hover:border-primary/30 transition-smooth group">
                <div className="w-10 h-10 bg-primary/10 rounded-lg mb-3 group-hover:bg-primary/20 transition-smooth flex items-center justify-center">
                  <FileUp className="w-5 h-5 text-primary" />
                </div>
                <h3 className="font-semibold text-foreground mb-2">Large Files</h3>
                <p className="text-sm text-muted-foreground">Support for PDFs and images up to 100MB</p>
              </Card>
              <Card className="p-6 border-border/50 bg-gradient-to-br from-card to-secondary/30 hover:border-primary/30 transition-smooth group">
                <div className="w-10 h-10 bg-primary/10 rounded-lg mb-3 group-hover:bg-primary/20 transition-smooth flex items-center justify-center">
                  <Download className="w-5 h-5 text-primary" />
                </div>
                <h3 className="font-semibold text-foreground mb-2">Structured Format</h3>
                <p className="text-sm text-muted-foreground">Preserves headings, bullet points, and text formatting</p>
              </Card>
              <Card className="p-6 border-border/50 bg-gradient-to-br from-card to-secondary/30 hover:border-primary/30 transition-smooth group">
                <div className="w-10 h-10 bg-primary/10 rounded-lg mb-3 group-hover:bg-primary/20 transition-smooth flex items-center justify-center">
                  <FileUp className="w-5 h-5 text-primary" />
                </div>
                <h3 className="font-semibold text-foreground mb-2">Page Organization</h3>
                <p className="text-sm text-muted-foreground">Results organized by page for easy navigation</p>
              </Card>
            </div>
          </div>
        ) : (
          <div className="space-y-8 fade-in">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <h2 className="text-3xl font-bold text-balance text-foreground">Extraction Complete</h2>
                <p className="text-muted-foreground mt-1 text-sm">{results.length} pages processed successfully</p>
              </div>
              <Button
                variant="outline"
                onClick={() => {
                  setResults(null)
                  setError("")
                }}
                className="transition-smooth"
              >
                Upload Another File
              </Button>
            </div>

            <ResultsDisplay results={results} />
          </div>
        )}
      </main>
    </div>
  )
}
