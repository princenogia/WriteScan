"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ChevronDown, ChevronUp, Copy, Download, Search, X } from 'lucide-react'

interface ContentBlock {
  type: "heading" | "paragraph" | "bullet-list" | "text"
  text: string
  items?: string[]
}

interface ExtractedText {
  page: number
  content: ContentBlock[]
}

interface ResultsDisplayProps {
  results: ExtractedText[]
}

export default function ResultsDisplay({ results }: ResultsDisplayProps) {
  const [expandedPages, setExpandedPages] = useState<Set<number>>(new Set([1]))
  const [searchQuery, setSearchQuery] = useState("")
  const [filteredResults, setFilteredResults] = useState<ExtractedText[]>(results)

  const togglePage = (page: number) => {
    const newExpanded = new Set(expandedPages)
    if (newExpanded.has(page)) {
      newExpanded.delete(page)
    } else {
      newExpanded.add(page)
    }
    setExpandedPages(newExpanded)
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  const handleSearch = (query: string) => {
    setSearchQuery(query)
    if (!query.trim()) {
      setFilteredResults(results)
      return
    }

    const lowerQuery = query.toLowerCase()
    const filtered = results
      .map((page) => ({
        ...page,
        content: page.content.filter((block) => {
          if (block.type === "bullet-list" && block.items) {
            return block.items.some((item) => item.toLowerCase().includes(lowerQuery))
          }
          return block.text?.toLowerCase().includes(lowerQuery)
        }),
      }))
      .filter((page) => page.content.length > 0)

    setFilteredResults(filtered)
  }

  const downloadAsText = () => {
    const allText = (searchQuery ? filteredResults : results)
      .map((page) => {
        let pageText = `\n=== PAGE ${page.page} ===\n\n`
        page.content.forEach((block) => {
          if (block.type === "heading") {
            pageText += `# ${block.text}\n\n`
          } else if (block.type === "bullet-list") {
            pageText += block.items?.map((item) => `• ${item}`).join("\n") + "\n\n"
          } else {
            pageText += block.text + "\n\n"
          }
        })
        return pageText
      })
      .join("\n")

    const element = document.createElement("a")
    element.setAttribute("href", `data:text/plain;charset=utf-8,${encodeURIComponent(allText)}`)
    element.setAttribute("download", "extracted-text.txt")
    element.style.display = "none"
    document.body.appendChild(element)
    element.click()
    document.body.removeChild(element)
  }

  const downloadAsJSON = () => {
    const dataToExport = searchQuery ? filteredResults : results
    const jsonString = JSON.stringify(dataToExport, null, 2)
    const element = document.createElement("a")
    element.setAttribute("href", `data:application/json;charset=utf-8,${encodeURIComponent(jsonString)}`)
    element.setAttribute("download", "extracted-text.json")
    element.style.display = "none"
    document.body.appendChild(element)
    element.click()
    document.body.removeChild(element)
  }

  const displayResults = searchQuery ? filteredResults : results

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
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-10 pr-10"
          />
          {searchQuery && (
            <button
              onClick={() => handleSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-secondary rounded"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          )}
        </div>

        <div className="flex gap-3 justify-end flex-wrap">
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
            Found {displayResults.length} page{displayResults.length !== 1 ? "s" : ""} with "{searchQuery}"
          </p>
        )}
      </div>

      {/* Pages */}
      <div className="space-y-4">
        {displayResults.length > 0 ? (
          displayResults.map((page) => (
            <Card key={page.page} className="overflow-hidden">
              {/* Page Header */}
              <button
                onClick={() => togglePage(page.page)}
                className="w-full px-6 py-4 flex items-center justify-between bg-secondary/50 hover:bg-secondary/70 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <h3 className="font-semibold text-foreground">Page {page.page}</h3>
                  <span className="text-xs px-2 py-1 bg-primary/20 text-primary rounded">
                    {page.content.length} block{page.content.length !== 1 ? "s" : ""}
                  </span>
                </div>
                {expandedPages.has(page.page) ? (
                  <ChevronUp className="w-5 h-5 text-muted-foreground" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-muted-foreground" />
                )}
              </button>

              {/* Page Content */}
              {expandedPages.has(page.page) && (
                <div className="px-6 py-4 space-y-6 border-t border-border w-full">
                  {page.content.map((block, idx) => (
                    <div key={idx} className="relative group w-full">
                      {/* Copy Button */}
                      <button
                        onClick={() =>
                          copyToClipboard(block.type === "bullet-list" ? block.items?.join("\n") || "" : block.text)
                        }
                        className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 transition-opacity p-2 bg-primary rounded-lg text-primary-foreground"
                        title="Copy to clipboard"
                      >
                        <Copy className="w-4 h-4" />
                      </button>

                      {/* Content Rendering */}
                      {block.type === "heading" && (
                        <h4 className="text-lg font-bold text-foreground mb-2">
                          {block.text}
                        </h4>
                      )}

                      {block.type === "bullet-list" && (
                        <ul className="space-y-2 ml-6 w-full">
                          {block.items?.map((item, i) => (
                            <li key={i} className="flex gap-3 text-sm text-foreground">
                              <span className="text-primary font-semibold min-w-fit">•</span>
                              <span className="w-full">{item}</span>
                            </li>
                          ))}
                        </ul>
                      )}

                      {(block.type === "paragraph" || block.type === "text") && (
                        <p className="text-sm text-foreground leading-relaxed whitespace-normal break-words w-full">
                          {block.text}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          ))
        ) : (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No results found for "{searchQuery}"</p>
          </div>
        )}
      </div>
    </div>
  )
}
