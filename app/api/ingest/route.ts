import { NextResponse } from "next/server";
import "pdf-parse/worker";
import { PDFParse } from "pdf-parse";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { embedText } from "@/lib/gemini-embed";
import { extractPowerPointSlides } from "@/lib/pptx-slides";

export const runtime = "nodejs";
// This route processes a whole document synchronously in one request, same
// as the n8n webhook it replaces — a large multi-slide deck with many chunks
// (each needing its own embedding call) can take a while. Vercel Hobby caps
// at 60s regardless of this value; Pro/Enterprise honor up to 300s (or more
// with Fluid Compute).
export const maxDuration = 300;

type Chunk = {
  repo_id: string;
  document_id: string;
  heading: string;
  content: string;
  topic_tags: string[];
};

// Ported unchanged from the n8n "Chunk & Tag" / "Extract Slides" nodes.
const TOPIC_SYNONYMS: Record<string, string[]> = {
  mission: ["mission", "our why", "purpose", "what we believe"],
  vision: ["vision", "where we're going", "the future"],
  team: ["team", "founders", "who we are", "leadership"],
  product: ["product", "how it works", "platform", "solution"],
  financials: ["financials", "revenue", "the ask", "funding", "numbers"],
  traction: ["traction", "growth", "metrics", "customers"],
  roadmap: ["roadmap", "what's next", "timeline"],
  competitors: ["competitors", "competition", "market landscape"],
};

function tagForHeading(heading: string | null): string[] {
  const h = (heading || "").toLowerCase();
  const tags: string[] = [];
  for (const [topic, synonyms] of Object.entries(TOPIC_SYNONYMS)) {
    if (synonyms.some((s) => h.includes(s))) tags.push(topic);
  }
  return tags;
}

// Strip footer noise (date stamps, bare page numbers) before chunking.
function stripNoise(text: string): string {
  return text
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      const isDateStamp = /^\d{1,2}\/\d{1,2}\/\d{4}\s*$/.test(trimmed);
      const isBarePageNumber = /^\d{1,3}$/.test(trimmed);
      return !isDateStamp && !isBarePageNumber;
    })
    .join("\n");
}

function chunkAndTag(rawText: string, repoId: string, documentId: string): Chunk[] {
  const text = stripNoise(rawText);
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const rawChunks: { heading: string; text: string }[] = [];
  let current = "";
  let currentHeading = "Untitled";

  for (const para of paragraphs) {
    const looksLikeHeading = para.length < 60 && !para.endsWith(".");
    if (looksLikeHeading) {
      if (current.trim()) {
        rawChunks.push({ heading: currentHeading, text: current.trim() });
      }
      currentHeading = para;
      current = "";
    } else {
      current += (current ? "\n\n" : "") + para;
      if (current.length > 1600) {
        rawChunks.push({ heading: currentHeading, text: current.trim() });
        current = "";
      }
    }
  }
  if (current.trim()) {
    rawChunks.push({ heading: currentHeading, text: current.trim() });
  }

  return rawChunks.map((c) => ({
    repo_id: repoId,
    document_id: documentId,
    heading: c.heading,
    content: c.text,
    topic_tags: tagForHeading(c.heading),
  }));
}

function detectFileType(fileUrl: string): "pdf" | "pptx" | "other" {
  const lower = fileUrl.toLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".pptx")) return "pptx";
  // Legacy .ppt is a binary OLE2 format, not a zip, so it falls through to
  // the PDF.co conversion path like .docx rather than native extraction.
  return "other";
}

async function downloadFile(fileUrl: string): Promise<Buffer> {
  const res = await fetch(fileUrl);
  if (!res.ok) throw new Error(`Could not download file (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer });
  try {
    // pdf-parse v2 defaults to inserting a "-- page N of M --" marker between
    // pages, which the heading heuristic below would mistake for a real
    // heading (short, no trailing period) — join pages with a plain
    // paragraph break instead, matching the old v1 (and n8n) behavior.
    const result = await parser.getText({ pageJoiner: "\n\n" });
    return result.text;
  } finally {
    await parser.destroy();
  }
}

// Reuses the presigned-upload flow already proven in the n8n workflow —
// PDF.co fetching the original external URL directly was unreliable, which
// is why this downloads the file ourselves and uploads the bytes instead.
async function convertToPdfViaPdfCo(fileUrl: string): Promise<Buffer> {
  const apiKey = process.env.PDFCO_API_KEY;
  if (!apiKey) throw new Error("Missing PDFCO_API_KEY");

  const originalName = fileUrl.split("/").pop() ?? "document";

  const presignedRes = await fetch(
    `https://api.pdf.co/v1/file/upload/get-presigned-url?name=${encodeURIComponent(originalName)}&contenttype=application/octet-stream`,
    { headers: { "x-api-key": apiKey } }
  );
  if (!presignedRes.ok) throw new Error(`PDF.co presigned URL request failed (${presignedRes.status})`);
  const { presignedUrl, url } = (await presignedRes.json()) as { presignedUrl: string; url: string };

  const fileBuffer = await downloadFile(fileUrl);
  const uploadRes = await fetch(presignedUrl, {
    method: "PUT",
    headers: { "Content-Type": "application/octet-stream" },
    body: new Uint8Array(fileBuffer),
  });
  if (!uploadRes.ok) throw new Error(`PDF.co file upload failed (${uploadRes.status})`);

  const convertRes = await fetch("https://api.pdf.co/v1/pdf/convert/from/doc", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url, async: false }),
  });
  if (!convertRes.ok) throw new Error(`PDF.co conversion failed (${convertRes.status})`);
  const { url: convertedPdfUrl } = (await convertRes.json()) as { url: string };

  return downloadFile(convertedPdfUrl);
}

async function extractPptxChunks(fileUrl: string, repoId: string, documentId: string): Promise<Chunk[]> {
  const buffer = await downloadFile(fileUrl);
  const slides = extractPowerPointSlides(buffer);

  return slides
    .filter((slide) => slide.content.length > 0)
    .map((slide) => ({
      repo_id: repoId,
      document_id: documentId,
      heading: slide.heading,
      content: slide.content,
      topic_tags: tagForHeading(slide.heading),
    }));
}

async function processDocument(fileUrl: string, repoId: string, documentId: string): Promise<Chunk[]> {
  const fileType = detectFileType(fileUrl);

  if (fileType === "pptx") {
    return extractPptxChunks(fileUrl, repoId, documentId);
  }

  const pdfBuffer = fileType === "pdf" ? await downloadFile(fileUrl) : await convertToPdfViaPdfCo(fileUrl);
  const text = await extractPdfText(pdfBuffer);
  return chunkAndTag(text, repoId, documentId);
}

export async function POST(request: Request) {
  const { file_url, repo_id, document_id } = (await request.json()) as {
    file_url?: string;
    repo_id?: string;
    document_id?: string;
  };

  if (!file_url || !repo_id || !document_id) {
    return NextResponse.json(
      { success: false, error: "file_url, repo_id, and document_id are required" },
      { status: 400 }
    );
  }

  const supabase = getSupabaseServerClient();

  try {
    const chunks = await processDocument(file_url, repo_id, document_id);

    const chunksWithEmbeddings = [];
    for (const chunk of chunks) {
      chunksWithEmbeddings.push({ ...chunk, embedding: await embedText(chunk.content) });
    }

    if (chunksWithEmbeddings.length > 0) {
      const { error: insertError } = await supabase.from("repo_chunks").insert(chunksWithEmbeddings);
      if (insertError) throw new Error(insertError.message);
    }

    const { error: statusError } = await supabase
      .from("repo_documents")
      .update({ status: "ready" })
      .eq("repo_id", repo_id)
      .eq("id", document_id);
    if (statusError) throw new Error(statusError.message);

    return NextResponse.json({ success: true, document_id, chunks_created: chunksWithEmbeddings.length });
  } catch (err) {
    await supabase.from("repo_documents").update({ status: "error" }).eq("repo_id", repo_id).eq("id", document_id);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
