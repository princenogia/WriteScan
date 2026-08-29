import { type NextRequest, NextResponse } from "next/server";

// Groq retired Llama 4 Scout for developer/free-tier accounts in July 2026.
// Qwen 3.6 is a currently supported multimodal model for image OCR.
const GROQ_OCR_MODEL = process.env.GROQ_OCR_MODEL ?? "qwen/qwen3.6-27b";

// Convert file to base64 for Groq vision API
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

    if (!isImage) {
      return NextResponse.json(
        {
          error:
            "File must be an image. PDFs are rendered client-side before being sent here.",
        },
        { status: 400 },
      );
    }

    if (!process.env.GROQ_API_KEY) {
      return NextResponse.json(
        {
          error:
            "Groq API key not configured. Please add GROQ_API_KEY to your .env file.",
        },
        { status: 500 },
      );
    }

    console.log(
      `[OCR] Processing image (${fileType}, ${(file.size / 1024).toFixed(1)} KB)...`,
    );
    const base64Data = await fileToBase64(file);

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

    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: GROQ_OCR_MODEL,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: prompt },
                {
                  type: "image_url",
                  image_url: { url: `data:${fileType};base64,${base64Data}` },
                },
              ],
            },
          ],
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[OCR] Groq API error: ${response.status}`, errorText);

      if (response.status === 429) {
        return NextResponse.json(
          {
            error:
              "API rate limit exceeded. Please wait a moment and try again.",
          },
          { status: 429 },
        );
      }
      if (response.status === 404) {
        return NextResponse.json(
          {
            error:
              `The configured Groq OCR model (${GROQ_OCR_MODEL}) is unavailable. Set GROQ_OCR_MODEL to a currently supported vision model.`,
          },
          { status: 502 },
        );
      }
      throw new Error(
        `Groq API returned status ${response.status}: ${errorText}`,
      );
    }

    const data = await response.json();
    const markdown = data.choices?.[0]?.message?.content?.trim() || "";

    return NextResponse.json({
      markdown: markdown || "No text could be extracted from this image.",
    });
  } catch (error) {
    console.error(
      "[OCR] Error:",
      error instanceof Error ? error.message : String(error),
    );
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to process file",
      },
      { status: 500 },
    );
  }
}
