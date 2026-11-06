import { runtime } from '@/lib/server';

const TEXT_EXT = /\.(txt|md|csv)$/i;
const IMAGE_EXT = /\.(jpe?g|png|webp|heic|heif|gif)$/i;
const PDF_EXT = /\.pdf$/i;
const DOCX_EXT = /\.docx$/i;

const MAX_INLINE_BYTES = 5_000_000;
const MAX_TEXT_CHARS = 100_000;
const MAX_PLAN_FILES = 3;

export type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

export type PlanDocumentResult = {
  parts: GeminiPart[];
  documents: { name: string; text: string }[];
  unreadFiles: string[];
};

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function mimeFor(name: string, type: string) {
  if (type && type !== 'application/octet-stream') return type;
  const lower = name.toLowerCase();
  if (PDF_EXT.test(lower)) return 'application/pdf';
  if (/\.png$/i.test(lower)) return 'image/png';
  if (/\.webp$/i.test(lower)) return 'image/webp';
  if (/\.gif$/i.test(lower)) return 'image/gif';
  if (/\.heic$/i.test(lower) || /\.heif$/i.test(lower)) return 'image/heic';
  if (/\.jpe?g$/i.test(lower)) return 'image/jpeg';
  if (DOCX_EXT.test(lower))
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (/\.csv$/i.test(lower)) return 'text/csv';
  if (/\.md$/i.test(lower)) return 'text/markdown';
  return 'text/plain';
}

export function isPlanReadableFile(name: string, type: string, size: number) {
  if (size <= 0 || size > MAX_INLINE_BYTES) return false;
  const lower = name.toLowerCase();
  if (TEXT_EXT.test(lower) || type.startsWith('text/')) return size <= 200_000;
  if (PDF_EXT.test(lower) || type === 'application/pdf') return true;
  if (IMAGE_EXT.test(lower) || type.startsWith('image/')) return true;
  if (
    DOCX_EXT.test(lower) ||
    type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  )
    return true;
  return false;
}

/** Minimal DOCX → plain text via word/document.xml inside the ZIP. */
export async function docxToText(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  const xml = await unzipEntry(bytes, 'word/document.xml');
  if (!xml) throw new Error('Could not read that Word document.');
  const text = new TextDecoder().decode(xml);
  return text
    .replace(/<w:tab[^/]*\/>/g, '\t')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function unzipEntry(bytes: Uint8Array, path: string) {
  const nameBytes = new TextEncoder().encode(path);
  for (let i = 0; i < bytes.length - 30; i++) {
    if (bytes[i] !== 0x50 || bytes[i + 1] !== 0x4b || bytes[i + 2] !== 0x03 || bytes[i + 3] !== 0x04)
      continue;
    const view = new DataView(bytes.buffer, bytes.byteOffset + i, 30);
    const compression = view.getUint16(8, true);
    const compSize = view.getUint32(18, true);
    const nameLen = view.getUint16(26, true);
    const extraLen = view.getUint16(28, true);
    const nameStart = i + 30;
    const entryName = new TextDecoder().decode(bytes.subarray(nameStart, nameStart + nameLen));
    if (entryName !== path) continue;
    const dataStart = nameStart + nameLen + extraLen;
    const compressed = bytes.subarray(dataStart, dataStart + compSize);
    if (compression === 0) return compressed;
    if (compression !== 8) return null;
    const copy = new Uint8Array(compressed);
    const stream = new Blob([copy.buffer]).stream().pipeThrough(
      new DecompressionStream('deflate-raw'),
    );
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  return null;
}

/** Build Gemini parts from browser-uploaded files (demo / localhost — no R2). */
export async function partsFromInlineFiles(
  files: { name: string; type?: string; dataBase64: string }[],
): Promise<PlanDocumentResult> {
  const parts: GeminiPart[] = [];
  const documents: { name: string; text: string }[] = [];
  const unreadFiles: string[] = [];

  for (const file of files.slice(0, MAX_PLAN_FILES)) {
    const name = typeof file.name === 'string' ? file.name.slice(0, 200) : 'file';
    const type = typeof file.type === 'string' ? file.type : '';
    if (typeof file.dataBase64 !== 'string' || !file.dataBase64) {
      unreadFiles.push(name);
      continue;
    }
    let buffer: ArrayBuffer;
    try {
      const binary = atob(file.dataBase64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      buffer = bytes.buffer;
    } catch {
      unreadFiles.push(name);
      continue;
    }
    if (!isPlanReadableFile(name, type, buffer.byteLength)) {
      unreadFiles.push(name);
      continue;
    }
    const lower = name.toLowerCase();
    const mime = mimeFor(name, type);
    try {
      if (TEXT_EXT.test(lower) || mime.startsWith('text/')) {
        const text = new TextDecoder().decode(buffer).slice(0, MAX_TEXT_CHARS);
        documents.push({ name, text });
        parts.push({ text: `Document "${name}":\n${text}` });
      } else if (
        DOCX_EXT.test(lower) ||
        mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ) {
        const text = (await docxToText(buffer)).slice(0, MAX_TEXT_CHARS);
        documents.push({ name, text });
        parts.push({ text: `Word document "${name}":\n${text}` });
      } else if (PDF_EXT.test(lower) || mime === 'application/pdf' || mime.startsWith('image/')) {
        parts.push({
          text: `Attached file "${name}" (${mime}). Use its contents as project requirements.`,
        });
        parts.push({
          inlineData: { mimeType: mime, data: bytesToBase64(new Uint8Array(buffer)) },
        });
        documents.push({ name, text: `[binary:${mime}]` });
      } else {
        unreadFiles.push(name);
      }
    } catch {
      unreadFiles.push(name);
    }
  }

  return { parts, documents, unreadFiles };
}

export async function loadPlanDocuments(
  projectId: string,
  fileIds: string[],
): Promise<PlanDocumentResult> {
  const ids = [...new Set(fileIds.filter((id) => typeof id === 'string' && id.length <= 100))].slice(
    0,
    MAX_PLAN_FILES,
  );
  const { DB, BUCKET } = runtime();
  const parts: GeminiPart[] = [];
  const documents: { name: string; text: string }[] = [];
  const unreadFiles: string[] = [];

  for (const id of ids) {
    const row = await DB.prepare(
      'SELECT id,name,size,type,storage_key FROM files WHERE id=? AND project_id=?',
    )
      .bind(id, projectId)
      .first<{
        id: string;
        name: string;
        size: number;
        type: string;
        storage_key: string | null;
      }>();
    if (!row) {
      unreadFiles.push(id);
      continue;
    }
    if (!isPlanReadableFile(row.name, row.type || '', row.size)) {
      unreadFiles.push(row.name);
      continue;
    }
    const object = await BUCKET.get(row.storage_key || row.id);
    if (!object) {
      unreadFiles.push(row.name);
      continue;
    }
    const buffer = await object.arrayBuffer();
    const lower = row.name.toLowerCase();
    const mime = mimeFor(row.name, row.type || '');

    try {
      if (TEXT_EXT.test(lower) || mime.startsWith('text/')) {
        const text = new TextDecoder().decode(buffer).slice(0, MAX_TEXT_CHARS);
        documents.push({ name: row.name, text });
        parts.push({ text: `Document "${row.name}":\n${text}` });
      } else if (
        DOCX_EXT.test(lower) ||
        mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ) {
        const text = (await docxToText(buffer)).slice(0, MAX_TEXT_CHARS);
        documents.push({ name: row.name, text });
        parts.push({ text: `Word document "${row.name}":\n${text}` });
      } else if (PDF_EXT.test(lower) || mime === 'application/pdf' || mime.startsWith('image/')) {
        parts.push({
          text: `Attached file "${row.name}" (${mime}). Use its contents as project requirements.`,
        });
        parts.push({
          inlineData: { mimeType: mime, data: bytesToBase64(new Uint8Array(buffer)) },
        });
        documents.push({ name: row.name, text: `[binary:${mime}]` });
      } else {
        unreadFiles.push(row.name);
      }
    } catch {
      unreadFiles.push(row.name);
    }
  }

  return { parts, documents, unreadFiles };
}

/** Recent project files usable for chat context (text/docx excerpts). */
export async function readableProjectDocuments(projectId: string, limit = 3) {
  const { DB, BUCKET } = runtime();
  const result = await DB.prepare(
    'SELECT id,name,size,type,storage_key FROM files WHERE project_id=? ORDER BY created DESC LIMIT 20',
  )
    .bind(projectId)
    .all<{ id: string; name: string; size: number; type: string; storage_key: string | null }>();
  const documents: { name: string; text: string }[] = [];
  const otherFiles: string[] = [];
  for (const file of result.results) {
    if (documents.length >= limit) {
      otherFiles.push(file.name);
      continue;
    }
    const lower = file.name.toLowerCase();
    const canText =
      (TEXT_EXT.test(lower) || (file.type || '').startsWith('text/')) && file.size <= 200_000;
    const canDocx =
      DOCX_EXT.test(lower) && file.size <= MAX_INLINE_BYTES;
    if (!canText && !canDocx) {
      otherFiles.push(file.name);
      continue;
    }
    const object = await BUCKET.get(file.storage_key || file.id);
    if (!object) {
      otherFiles.push(file.name);
      continue;
    }
    try {
      const buffer = await object.arrayBuffer();
      const text = canDocx
        ? (await docxToText(buffer)).slice(0, 10000)
        : new TextDecoder().decode(buffer).slice(0, 10000);
      documents.push({ name: file.name, text });
    } catch {
      otherFiles.push(file.name);
    }
  }
  return { documents, otherFiles, allFiles: result.results };
}
