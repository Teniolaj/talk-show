import { inflateRawSync } from "zlib";

export type PowerPointSlide = {
  heading: string;
  content: string;
};

type ZipEntry = { compressionMethod: number; compressedSize: number; localOffset: number };

function xmlDecode(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function readZipEntries(file: Buffer): Map<string, ZipEntry> {
  // A PPTX is a ZIP file. Reading its central directory avoids a new runtime
  // dependency and works in the Node.js route handler where uploads are read.
  const endSignature = 0x06054b50;
  let endOffset = -1;
  for (let index = file.length - 22; index >= Math.max(0, file.length - 65_557); index -= 1) {
    if (file.readUInt32LE(index) === endSignature) {
      endOffset = index;
      break;
    }
  }
  if (endOffset < 0) throw new Error("The PowerPoint file is not a valid PPTX archive.");

  const entryCount = file.readUInt16LE(endOffset + 10);
  let offset = file.readUInt32LE(endOffset + 16);
  const entries = new Map<string, ZipEntry>();

  for (let index = 0; index < entryCount; index += 1) {
    if (file.readUInt32LE(offset) !== 0x02014b50) throw new Error("The PowerPoint archive directory is invalid.");
    const compressionMethod = file.readUInt16LE(offset + 10);
    const compressedSize = file.readUInt32LE(offset + 20);
    const fileNameLength = file.readUInt16LE(offset + 28);
    const extraLength = file.readUInt16LE(offset + 30);
    const commentLength = file.readUInt16LE(offset + 32);
    const localOffset = file.readUInt32LE(offset + 42);
    const name = file.subarray(offset + 46, offset + 46 + fileNameLength).toString("utf8");
    entries.set(name, { compressionMethod, compressedSize, localOffset });
    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

function readZipText(file: Buffer, entries: Map<string, ZipEntry>, name: string): string {
  const entry = entries.get(name);
  if (!entry) throw new Error(`The PowerPoint is missing ${name}.`);
  if (file.readUInt32LE(entry.localOffset) !== 0x04034b50) throw new Error("The PowerPoint archive entry is invalid.");

  const fileNameLength = file.readUInt16LE(entry.localOffset + 26);
  const extraLength = file.readUInt16LE(entry.localOffset + 28);
  const dataStart = entry.localOffset + 30 + fileNameLength + extraLength;
  const compressed = file.subarray(dataStart, dataStart + entry.compressedSize);
  const data = entry.compressionMethod === 0 ? compressed : entry.compressionMethod === 8 ? inflateRawSync(compressed) : null;
  if (!data) throw new Error("This PowerPoint uses an unsupported compression format.");
  return data.toString("utf8");
}

type SlideShape = { lines: string[]; largestFontSize: number; isTitlePlaceholder: boolean };

function shapeText(xml: string): string[] {
  return xml
    .split(/<a:p(?:\s[^>]*)?>/)
    .slice(1)
    .map((paragraph) => Array.from(paragraph.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g), (match) => xmlDecode(match[1])).join("").trim())
    .filter(Boolean);
}

function slideShapes(xml: string): SlideShape[] {
  return Array.from(xml.matchAll(/<p:sp>([\s\S]*?)<\/p:sp>/g), (match) => {
    const shape = match[1];
    const fontSizes = Array.from(shape.matchAll(/<(?:a:defRPr|a:rPr)\b[^>]*\bsz="(\d+)"/g), (font) => Number(font[1]));
    return {
      lines: shapeText(shape),
      largestFontSize: Math.max(0, ...fontSizes),
      isTitlePlaceholder: /<p:ph\b[^>]*\btype="(?:title|ctrTitle)"/.test(shape),
    };
  }).filter((shape) => shape.lines.length > 0);
}

export function extractPowerPointSlides(file: Buffer): PowerPointSlide[] {
  const entries = readZipEntries(file);
  const presentation = readZipText(file, entries, "ppt/presentation.xml");
  const relationships = readZipText(file, entries, "ppt/_rels/presentation.xml.rels");
  const relationshipTargets = new Map(
    Array.from(relationships.matchAll(/<Relationship\b[^>]*\bId="([^"]+)"[^>]*\bTarget="([^"]+)"[^>]*\/?\s*>/g), (match) => [match[1], match[2]])
  );
  const slideRelationshipIds = Array.from(presentation.matchAll(/<p:sldId\b[^>]*\br:id="([^"]+)"[^>]*\/?\s*>/g), (match) => match[1]);

  const slides = slideRelationshipIds.map((relationshipId, index) => {
    const target = relationshipTargets.get(relationshipId);
    if (!target) throw new Error("The PowerPoint slide order could not be read.");
    const xml = readZipText(file, entries, `ppt/${target.replace(/^\.\.\//, "")}`);
    const shapes = slideShapes(xml);
    // PowerPoint does not label arbitrary text boxes as "the title". The
    // actual title is normally the text box with the largest type on the
    // slide, while repeated deck labels / page numbers use smaller type.
    const titleShape =
      shapes.find((shape) => shape.isTitlePlaceholder) ??
      [...shapes].sort((a, b) => b.largestFontSize - a.largestFontSize)[0];
    const heading = titleShape?.lines.join(" ") || `Slide ${index + 1}`;
    const content = shapes
      .filter((shape) => shape !== titleShape)
      .flatMap((shape) => shape.lines)
      .filter((line) => !/^\d{1,3}$/.test(line) && line !== "PRESENTATION" && line !== "DIGITAL COLLABORATION")
      .join("\n\n") || heading;
    return { heading, content };
  });

  if (slides.length === 0) throw new Error("No readable slides were found in this PowerPoint.");
  return slides;
}
