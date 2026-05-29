"use client"

import { useState } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import rehypeRaw from "rehype-raw"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ChevronDown, ChevronUp, Copy, Check, Download, Search, X } from 'lucide-react'

interface ExtractedPage {
  page: number
  markdown: string
}

interface ResultsDisplayProps {
  results: ExtractedPage[]
}

export default function ResultsDisplay({ results }: ResultsDisplayProps) {
  const [expandedPages, setExpandedPages] = useState<Set<number>>(new Set([1]))
  const [searchQuery, setSearchQuery] = useState("")
  const [copiedPage, setCopiedPage] = useState<number | null>(null)

  const togglePage = (page: number) => {
    const newExpanded = new Set(expandedPages)
    if (newExpanded.has(page)) {
      newExpanded.delete(page)
    } else {
      newExpanded.add(page)
    }
    setExpandedPages(newExpanded)
  }

  const copyToClipboard = async (text: string, page: number) => {
    await navigator.clipboard.writeText(text)
    setCopiedPage(page)
    setTimeout(() => setCopiedPage(null), 2000)
  }

  const filteredResults = searchQuery.trim()
    ? results.filter((page) =>
        page.markdown.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : results

  const highlightSearch = (text: string): string => {
    if (!searchQuery.trim()) return text
    // We can't highlight inside markdown rendering easily,
    // so highlighting is only applied in the search feedback
    return text
  }

  const downloadAsText = () => {
    const allText = filteredResults
      .map((page) => {
        return `\n=== PAGE ${page.page} ===\n\n${page.markdown}`
      })
      .join("\n\n")

    const element = document.createElement("a")
    element.setAttribute("href", `data:text/plain;charset=utf-8,${encodeURIComponent(allText)}`)
    element.setAttribute("download", "extracted-text.txt")
    element.style.display = "none"
    document.body.appendChild(element)
    element.click()
    document.body.removeChild(element)
  }

  const downloadAsMarkdown = () => {
    const allMarkdown = filteredResults
      .map((page) => {
        return results.length > 1
          ? `---\n\n## Page ${page.page}\n\n${page.markdown}`
          : page.markdown
      })
      .join("\n\n")

    const element = document.createElement("a")
    element.setAttribute("href", `data:text/markdown;charset=utf-8,${encodeURIComponent(allMarkdown)}`)
    element.setAttribute("download", "extracted-text.md")
    element.style.display = "none"
    document.body.appendChild(element)
    element.click()
    document.body.removeChild(element)
  }

  const downloadAsJSON = () => {
    const jsonString = JSON.stringify(filteredResults, null, 2)
    const element = document.createElement("a")
    element.setAttribute("href", `data:application/json;charset=utf-8,${encodeURIComponent(jsonString)}`)
    element.setAttribute("download", "extracted-text.json")
    element.style.display = "none"
    document.body.appendChild(element)
    element.click()
    document.body.removeChild(element)
  }

  return (
    <div className="space-y-6">
      {/* Search and Export Options */}
      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search extracted text..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 pr-10"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-secondary rounded"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          )}
        </div>

        <div className="flex gap-3 justify-end flex-wrap">
          <Button variant="outline" size="sm" onClick={downloadAsMarkdown} className="gap-2 bg-transparent">
            <Download className="w-4 h-4" />
            Download as Markdown
          </Button>
          <Button variant="outline" size="sm" onClick={downloadAsJSON} className="gap-2 bg-transparent">
            <Download className="w-4 h-4" />
            Download as JSON
          </Button>
          <Button variant="outline" size="sm" onClick={downloadAsText} className="gap-2 bg-transparent">
            <Download className="w-4 h-4" />
            Download as Text
          </Button>
        </div>

        {searchQuery && (
          <p className="text-sm text-muted-foreground">
            Found {filteredResults.length} page{filteredResults.length !== 1 ? "s" : ""} with &quot;{searchQuery}&quot;
          </p>
        )}
      </div>

      {/* Pages */}
      <div className="space-y-4">
        {filteredResults.length > 0 ? (
          filteredResults.map((page) => (
            <Card key={page.page} className="overflow-hidden">
              {/* Page Header */}
              <div
                onClick={() => togglePage(page.page)}
                className="w-full px-6 py-4 flex items-center justify-between bg-secondary/50 hover:bg-secondary/70 transition-colors cursor-pointer select-none"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') togglePage(page.page) }}
              >
                <div className="flex items-center gap-3">
                  <h3 className="font-semibold text-foreground">Page {page.page}</h3>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 opacity-70 hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation()
                      copyToClipboard(page.markdown, page.page)
                    }}
                    title="Copy page text"
                  >
                    {copiedPage === page.page ? (
                      <Check className="w-4 h-4 text-green-500" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </Button>
                  {expandedPages.has(page.page) ? (
                    <ChevronUp className="w-5 h-5 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-muted-foreground" />
                  )}
                </div>
              </div>

              {/* Page Content — rendered as Markdown */}
              {expandedPages.has(page.page) && (
                <div className="px-6 py-5 border-t border-border w-full">
                  <article className="ocr-content max-w-none">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      rehypePlugins={[rehypeRaw]}
                      components={{
                        img: ({ src, alt, ...props }) =>
                          src ? <img src={src} alt={alt || ""} {...props} /> : null,
                      }}
                    >
                      {page.markdown}
                    </ReactMarkdown>
                  </article>
                </div>
              )}
            </Card>
          ))
        ) : (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No results found for &quot;{searchQuery}&quot;</p>
          </div>
        )}
      </div>
    </div>
  )
}
