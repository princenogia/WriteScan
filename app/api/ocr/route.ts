import { type NextRequest, NextResponse } from "next/server";
import { createCanvas } from "@napi-rs/canvas";
import path from "path";
import { pathToFileURL } from "url";

// @ts-ignore
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

// Set up worker path for pdfjs
const workerPath = path.join(
  process.cwd(),
  "node_modules",
  "pdfjs-dist",
  "legacy",
  "build",
  "pdf.worker.mjs"
);
pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;

// Custom canvas factory for pdfjs in Node.js with @napi-rs/canvas
class NodeCanvasFactory {
  create(width: number, height: number) {
    const canvas = createCanvas(width, height);
    const context = canvas.getContext("2d");
    return { canvas, context };
  }

  reset(canvasAndContext: any, width: number, height: number) {
    canvasAndContext.canvas.width = width;
    canvasAndContext.canvas.height = height;
  }

  destroy(canvasAndContext: any) {
    canvasAndContext.canvas = null;
    canvasAndContext.context = null;
  }
}

const canvasFactory = new NodeCanvasFactory();

// Convert file to base64 for Groq
async function fileToBase64(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  return buffer.toString("base64");
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const fileType = file.type;
    const isImage = fileType.startsWith("image/");
    const isPDF = fileType === "application/pdf" || file.name.endsWith(".pdf");

    if (!isImage && !isPDF) {
      return NextResponse.json(
        { error: "File must be an image or a PDF (JPG, JPEG, PNG, GIF, WebP, PDF)" },
        { status: 400 },
      );
    }

    // Check for API key
    if (!process.env.GROQ_API_KEY) {
      return NextResponse.json(
        {
          error:
            "Groq API key not configured. Please add GROQ_API_KEY to your .env file.",
        },
        { status: 500 },
      );
    }

    const pagesToProcess: { page: number; base64Data: string; mimeType: string }[] = [];

    if (isImage) {
      console.log(`[Groq OCR] Processing image...`);
      const base64Data = await fileToBase64(file);
      pagesToProcess.push({ page: 1, base64Data, mimeType: fileType });
    } else {
      console.log(`[Groq OCR] Processing PDF...`);
      const arrayBuffer = await file.arrayBuffer();
      const data = new Uint8Array(arrayBuffer).slice();
      
      const pdfDoc = await pdfjsLib.getDocument({
        data,
        canvasFactory,
        useWorkerFetch: false,
        isEvalSupported: false,
        useSystemFonts: true,
      } as any).promise;
      const numPages = pdfDoc.numPages;

      console.log(`[Groq OCR] PDF loaded successfully. Total pages: ${numPages}`);

      // Process up to 10 pages to avoid server timeout / resource issues
      for (let i = 1; i <= Math.min(numPages, 10); i++) {
        const page = await pdfDoc.getPage(i);
        const viewport = page.getViewport({ scale: 1.5 });
        
        const { canvas, context } = canvasFactory.create(viewport.width, viewport.height);

        await page.render({
          canvasContext: context as any,
          viewport: viewport,
          canvas: canvas as any,
        }).promise;

        const buffer = await (canvas as any).encode("png");
        const base64Data = buffer.toString("base64");
        
        pagesToProcess.push({
          page: i,
          base64Data,
          mimeType: "image/png"
        });
      }
    }

    const results: any[] = [];

    for (const pageItem of pagesToProcess) {
      console.log(`[Groq OCR] OCR on page ${pageItem.page}/${pagesToProcess.length}...`);
      
      const prompt = `You are an expert OCR and document transcription system. Your task is to extract ALL text from this image and reproduce it using Markdown + inline HTML so the output **exactly mirrors the original document's structure, layout, and alignment**.

CRITICAL RULES — follow every one:
1. Reproduce the text EXACTLY as written — every word, number, symbol, punctuation mark.
2. Preserve the EXACT structure of the original document:
   - Headings → use the appropriate Markdown heading level (# ## ### etc.) matching their visual hierarchy.
   - Numbered lists → use Markdown numbered lists (1. 2. 3.).
   - Bullet points → use Markdown bullet lists (- item). Always use the dash character.
   - Tables → use Markdown table syntax (| col1 | col2 |) with alignment.
   - Indented or nested content → use proper Markdown indentation / nesting.
   - Paragraphs → separate with blank lines exactly as in the original.
   - Line breaks within a block → preserve them.
   - Bold / italic / underlined text → use **bold**, *italic*, or <u>underline</u> as appropriate.
3. ALIGNMENT IS CRITICAL — preserve the visual alignment of every block:
   - If text is centered in the original → wrap it in <div align="center">...</div>
   - If text is right-aligned → wrap it in <div align="right">...</div>
   - Left-aligned text needs no wrapper (it is the default).
   - Titles and headings that are centered MUST be wrapped in a center-aligned div.
4. For handwritten text, transcribe as accurately as possible. If a word is ambiguous, pick the most likely reading.
5. Do NOT add any commentary, explanations, notes, or meta-text.
6. Do NOT wrap the output in a code fence or add any prefix/suffix.
7. Output ONLY the transcription of the document — nothing else.

Begin transcription:`;

      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "meta-llama/llama-4-scout-17b-16e-instruct",
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: prompt,
                },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:${pageItem.mimeType};base64,${pageItem.base64Data}`,
                  },
                },
              ],
            },
          ],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Groq API returned status ${response.status} on page ${pageItem.page}: ${errorText}`);
      }

      const data = await response.json();
      const extractedText = data.choices?.[0]?.message?.content || "";

      results.push({
        page: pageItem.page,
        markdown: extractedText.trim() || "No text could be extracted from this page."
      });
    }

    return NextResponse.json({ results });
  } catch (error) {
    console.error(
      "[Groq OCR] Processing error:",
      error instanceof Error ? error.message : String(error),
    );

    // Handle rate limiting or too many requests
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes("429") || errorMessage.includes("limit")) {
      return NextResponse.json(
        {
          error: "API rate limit exceeded. Please wait a moment and try again.",
        },
        { status: 429 },
      );
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to process file",
      },
      { status: 500 },
    );
  }
}
