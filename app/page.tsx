"use client"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import UploadArea from "@/components/upload-area"
import ResultsDisplay from "@/components/results-display"
import { Loader2, FileUp, Download, Moon, Sun } from 'lucide-react'
import Image from "next/image"

interface ExtractedPage {
  page: number
  markdown: string
}

export default function Home() {
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState("")
  const [results, setResults] = useState<ExtractedPage[] | null>(null)
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

  /**
   * Render a PDF file's pages to PNG images in the browser using pdfjs-dist,
   * then send each page image to the server for OCR.
   */
  const processPDF = async (file: File): Promise<ExtractedPage[]> => {
    setProgress("Loading PDF...")
    const pdfjsLib = await import("pdfjs-dist")
    pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs"

    const arrayBuffer = await file.arrayBuffer()
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise
    const maxPages = Math.min(pdf.numPages, 10)
    const results: ExtractedPage[] = []

    for (let i = 1; i <= maxPages; i++) {
      setProgress(`Processing page ${i} of ${maxPages}...`)

      try {
        const page = await pdf.getPage(i)
        const viewport = page.getViewport({ scale: 2.0 })

        const canvas = document.createElement("canvas")
        canvas.width = viewport.width
        canvas.height = viewport.height
        const ctx = canvas.getContext("2d")!

        await page.render({ canvasContext: ctx, viewport, canvas } as any).promise

        // Convert canvas to PNG blob
        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(
            (b) => (b ? resolve(b) : reject(new Error("Canvas to blob failed"))),
            "image/png"
          )
        })

        // Send page image to server for OCR
        const formData = new FormData()
        formData.append("file", blob, `page-${i}.png`)

        const response = await fetch("/api/ocr", { method: "POST", body: formData })
        const data = await response.json()

        if (!response.ok) {
          results.push({ page: i, markdown: `⚠️ ${data.error || "Failed to process page"}` })
        } else {
          results.push({ page: i, markdown: data.markdown })
        }

        // Clean up canvas memory
        canvas.width = 0
        canvas.height = 0
      } catch (pageErr) {
        results.push({
          page: i,
          markdown: `⚠️ Failed to process page ${i}: ${pageErr instanceof Error ? pageErr.message : String(pageErr)}`,
        })
      }
    }

    return results
  }

  const handleFileSelect = async (file: File) => {
    const isPDF = file.type === "application/pdf" || file.name.endsWith(".pdf");
    const maxSize = isPDF ? 20 * 1024 * 1024 : 4 * 1024 * 1024;

    if (file.size > maxSize) {
      setError(isPDF ? "PDF file size must be less than 20MB" : "Image file size must be less than 4MB");
      return;
    }

    const allowedTypes = ["application/pdf", "image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"]
    if (!allowedTypes.includes(file.type) && !file.name.endsWith(".pdf")) {
      setError("Please upload a PDF or an image file (PDF, JPG, JPEG, PNG, GIF, WebP)")
      return
    }

    setLoading(true)
    setError("")
    setResults(null)
    setProgress("")

    try {
      if (isPDF) {
        // PDF: render pages client-side → send images to server
        const pdfResults = await processPDF(file)
        setResults(pdfResults)
      } else {
        // Image: send directly to server
        setProgress("Processing image...")
        const formData = new FormData()
        formData.append("file", file)

        const response = await fetch("/api/ocr", { method: "POST", body: formData })
        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error || "Failed to process file")
        }

        setResults([{ page: 1, markdown: data.markdown }])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
    } finally {
      setLoading(false)
      setProgress("")
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-secondary/20 to-background">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur-xl border-b border-border/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Image 
                src="/logo.png" 
                alt="WriteScan Logo" 
                width={200}
                height={200}
                className="h-12 w-auto object-contain"
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
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
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
                      Free tier quota reached. Consider upgrading to a Groq API paid tier for higher limits.
                    </p>
                  )}
                </div>
              )}

              {loading && (
                <div className="mt-6 flex items-center justify-center gap-3 p-4 bg-primary/5 border border-primary/20 rounded-lg slide-up">
                  <Loader2 className="w-5 h-5 text-primary animate-spin" />
                  <p className="text-sm text-foreground font-medium">
                    {progress || "Processing your file... This may take a moment."}
                  </p>
                </div>
              )}
            </Card>

            {/* Info Section */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="p-6 border-border/50 bg-gradient-to-br from-card to-secondary/30 hover:border-primary/30 transition-smooth group">
                <div className="w-10 h-10 bg-primary/10 rounded-lg mb-3 group-hover:bg-primary/20 transition-smooth flex items-center justify-center">
                  <FileUp className="w-5 h-5 text-primary" />
                </div>
                <h3 className="font-semibold text-foreground mb-2">Supported Formats</h3>
                <p className="text-sm text-muted-foreground">Support for PDFs up to 20MB and images up to 4MB</p>
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
                <h3 className="font-semibold text-foreground mb-2">Groq Vision Engine</h3>
                <p className="text-sm text-muted-foreground">Powered by Llama 4 Scout for rapid, accurate extraction</p>
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
