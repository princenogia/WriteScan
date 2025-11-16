import { type NextRequest, NextResponse } from "next/server"

async function retryWithBackoff<T>(fn: () => Promise<T>, maxRetries = 5, initialDelayMs = 3000): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn()
    } catch (error) {
      if (i === maxRetries - 1) throw error

      const errorMsg = error instanceof Error ? error.message : String(error)
      if (!errorMsg.includes("429") && !errorMsg.includes("RESOURCE_EXHAUSTED")) {
        throw error
      }

      const delayMs = initialDelayMs * Math.pow(2, i)
      console.log(`[v0] Rate limited (attempt ${i + 1}/${maxRetries}). Retrying in ${delayMs}ms...`)
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }
  throw new Error("Max retries exceeded")
}

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.GEMINI_API_KEY

    if (!apiKey) {
      console.error("[v0] Gemini API key not found")
      return NextResponse.json({ error: "Gemini API key not configured" }, { status: 500 })
    }

    const formData = await request.formData()
    const file = formData.get("file") as File

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    const fileType = file.type
    const isImage = fileType.startsWith("image/")
    const isPDF = fileType === "application/pdf"

    if (!isImage && !isPDF) {
      return NextResponse.json({ error: "File must be a PDF or image (JPG, PNG, GIF, WebP)" }, { status: 400 })
    }

    console.log(`[v0] Processing ${isImage ? "image" : "PDF"} with Gemini Vision API...`)
    console.log("[v0] File name:", file.name, "Size:", file.size)

    const buffer = await file.arrayBuffer()

    const results = isImage
      ? await extractTextFromImage(buffer, fileType, apiKey)
      : await extractTextFromPDF(buffer, apiKey)

    console.log("[v0] Processing complete, returning results")
    return NextResponse.json({ results })
  } catch (error) {
    console.error("[v0] OCR processing error:", error instanceof Error ? error.message : String(error))
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to process file" },
      { status: 500 },
    )
  }
}

async function extractTextFromPDF(buffer: ArrayBuffer, apiKey: string) {
  const base64PDF = Buffer.from(buffer).toString("base64")

  console.log("[v0] Sending PDF to Gemini API for text extraction...")

  const response = await retryWithBackoff(() =>
    fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: `You are an expert at reading and transcribing handwritten documents. Extract ALL text from this PDF with maximum accuracy. Follow these rules carefully:

CRITICAL RULES:
1. Read handwriting very carefully and precisely - prioritize accuracy over speed
2. If uncertain about a character, provide your best interpretation with a [?] notation
3. Preserve EXACT formatting and structure - maintain original line breaks where appropriate
4. Identify section headers clearly (mark with "HEADING: " prefix)
5. Preserve numbered lists and bullet points (use "• " for bullets)
6. Maintain paragraphs as they appear in the document
7. Include ALL text - do not omit anything
8. For each page, start with "--- PAGE X ---" marker
9. Preserve special characters, numbers, and punctuation exactly as written
10. If there are corrections or strikethroughs, transcribe the corrected version

ACCURACY TIPS:
- Look at character shapes carefully to distinguish similar letters
- Use context from surrounding words to resolve ambiguous characters
- Pay special attention to proper nouns and names
- Preserve original capitalization exactly as written
- Note any unusual formatting or emphasis (underlines, boxes, etc.)

Output format: Structured text with clear section organization.`,
              },
              {
                inlineData: {
                  mimeType: "application/pdf",
                  data: base64PDF,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0,
          topK: 1,
          topP: 1,
          maxOutputTokens: 30000,
        },
      }),
    }),
  )

  if (!response.ok) {
    const contentType = response.headers.get("content-type") || ""
    let errorMessage = `API returned status ${response.status}`

    if (contentType.includes("application/json")) {
      try {
        const error = await response.json()
        console.error("[v0] Gemini API error:", error)
        errorMessage = `Gemini API error: ${JSON.stringify(error)}`
      } catch {
        const text = await response.text()
        console.error("[v0] Gemini API error (non-JSON):", text)
        errorMessage = `Gemini API error: ${text.substring(0, 200)}`
      }
    } else {
      const text = await response.text()
      console.error("[v0] Gemini API error (non-JSON response):", text.substring(0, 200))
      errorMessage = `Gemini API error: ${text.substring(0, 200)}`
    }

    throw new Error(errorMessage)
  }

  const data = await response.json()

  if (!data.candidates || !data.candidates[0]?.content?.parts?.[0]?.text) {
    console.error("[v0] Invalid response format from Gemini:", data)
    throw new Error("No text extracted from PDF")
  }

  const extractedText = data.candidates[0].content.parts[0].text

  console.log("[v0] Text extraction successful, parsing content...")

  // Parse the extracted text into pages
  //@ts-ignore
  const pages = extractedText.split(/--- PAGE \d+ ---/).filter((page) => page.trim())

  //@ts-ignore
  const results = pages.map((pageText, index) => {
    const content = parseExtractedText(pageText)
    return {
      page: index + 1,
      content,
    }
  })

  return results
}

function parseExtractedText(text: string) {
  const lines = text.split("\n").filter((line) => line.trim())
  const content: any[] = []

  const filteredLines = lines.filter((line) => {
    const trimmed = line.trim().toLowerCase()
    // Remove lines that are just quotes around noise words
    const unquoted = trimmed.replace(/^["'`]+|["'`]+$/g, "").trim()

    // Filter out common placeholder/noise words (with or without quotes)
    const noiseWords = ["text", "image", "document", "page", "untitled", "unknown", "n/a", ""]
    if (noiseWords.includes(unquoted)) {
      return false
    }

    // Also filter out lines that are just single special characters
    if (/^["'`\-_•*]+$/.test(trimmed)) {
      return false
    }

    return true
  })

  let currentBulletList: string[] = []

  for (const line of filteredLines) {
    const trimmed = line.trim()

    if (trimmed.startsWith("HEADING: ")) {
      if (currentBulletList.length > 0) {
        content.push({
          type: "bullet-list",
          items: currentBulletList,
        })
        currentBulletList = []
      }
      content.push({
        type: "heading",
        text: trimmed.replace("HEADING: ", ""),
      })
    } else if (trimmed.startsWith("• ")) {
      currentBulletList.push(trimmed.replace("• ", ""))
    } else if (
      (trimmed.length < 50 && (trimmed === trimmed.toUpperCase() || /^\d+\.?\s+/.test(trimmed))) ||
      /^#+\s/.test(trimmed)
    ) {
      if (currentBulletList.length > 0) {
        content.push({
          type: "bullet-list",
          items: currentBulletList,
        })
        currentBulletList = []
      }
      content.push({
        type: "heading",
        text: trimmed.replace(/^#+\s/, ""),
      })
    } else if (/^[•\-*]\s/.test(trimmed)) {
      currentBulletList.push(trimmed.replace(/^[•\-*]\s/, ""))
    } else if (/^\d+\.\s/.test(trimmed)) {
      currentBulletList.push(trimmed.replace(/^\d+\.\s/, ""))
    } else {
      if (currentBulletList.length > 0) {
        content.push({
          type: "bullet-list",
          items: currentBulletList,
        })
        currentBulletList = []
      }
      if (trimmed) {
        content.push({
          type: "paragraph",
          text: trimmed,
        })
      }
    }
  }

  if (currentBulletList.length > 0) {
    content.push({
      type: "bullet-list",
      items: currentBulletList,
    })
  }

  return content.length > 0 ? content : [{ type: "text", text: text }]
}

async function extractTextFromImage(buffer: ArrayBuffer, mimeType: string, apiKey: string) {
  const base64Image = Buffer.from(buffer).toString("base64")

  console.log("[v0] Sending image to Gemini API for text extraction...")

  const response = await retryWithBackoff(() =>
    fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: `You are an expert at reading and transcribing handwritten text in images. Extract ALL text with maximum accuracy. Follow these rules:

CRITICAL RULES:
1. Read handwriting very carefully and precisely - accuracy is paramount
2. If uncertain about a character, provide your best interpretation with a [?] notation
3. Preserve EXACT formatting and line breaks as they appear
4. Identify headers and section titles (mark with "HEADING: " prefix)
5. Preserve lists, indentation, and hierarchical structure
6. Include ALL visible text without omission
7. Maintain original capitalization and punctuation exactly
8. Use "• " for bullet points and preserve numbered lists
9. If text is crossed out or corrected, transcribe the corrected version
10. Preserve special symbols and characters as written

ACCURACY OPTIMIZATION:
- Examine each letter carefully for accurate character recognition
- Use surrounding context to resolve ambiguous or unclear handwriting
- Pay attention to proper nouns, numbers, and technical terms
- Preserve emphasis marks, underlines, or boxes around text
- Note any drawings or non-text elements briefly

Output: Structured text preserving the document's natural organization.`,
              },
              {
                inlineData: {
                  mimeType: mimeType,
                  data: base64Image,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0,
          topK: 1,
          topP: 1,
          maxOutputTokens: 30000,
        },
      }),
    }),
  )

  if (!response.ok) {
    const contentType = response.headers.get("content-type") || ""
    let errorMessage = `API returned status ${response.status}`

    if (contentType.includes("application/json")) {
      try {
        const error = await response.json()
        console.error("[v0] Gemini API error:", error)
        errorMessage = `Gemini API error: ${JSON.stringify(error)}`
      } catch {
        const text = await response.text()
        console.error("[v0] Gemini API error (non-JSON):", text)
        errorMessage = `Gemini API error: ${text.substring(0, 200)}`
      }
    } else {
      const text = await response.text()
      console.error("[v0] Gemini API error (non-JSON response):", text.substring(0, 200))
      errorMessage = `Gemini API error: ${text.substring(0, 200)}`
    }

    throw new Error(errorMessage)
  }

  const data = await response.json()

  if (!data.candidates || !data.candidates[0]?.content?.parts?.[0]?.text) {
    console.error("[v0] Invalid response format from Gemini:", data)
    throw new Error("No text extracted from image")
  }

  const extractedText = data.candidates[0].content.parts[0].text

  console.log("[v0] Text extraction successful, parsing content...")

  // For images, treat as single page
  const content = parseExtractedText(extractedText)
  return [{ page: 1, content }]
}
