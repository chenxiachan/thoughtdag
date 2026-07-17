import type { Attachment } from '../types';
import { generateId } from '../utils';
import { extractPdf } from './api';
import { PDF_VISION_PAGE_THRESHOLD } from './constants';

export const TEXT_EXTENSIONS = /\.(md|txt|js|ts|tsx|jsx|py|json|csv|yaml|yml|toml|sh|bash|zsh|c|cpp|h|hpp|java|rs|go|rb|swift|kt|css|html|xml|sql|r|m|lua)$/i;

// accept attribute for <input type="file"> — keep in sync with TEXT_EXTENSIONS
export const FILE_INPUT_ACCEPT =
  'image/*,.pdf,.txt,.md,.js,.ts,.tsx,.jsx,.py,.json,.csv,.yaml,.yml,.toml,.sh,.c,.cpp,.h,.java,.rs,.go,.rb,.swift,.css,.html,.xml,.sql';

// Identity of an attachment's content — used to dedup the same file uploaded
// to multiple nodes or reached via multiple DAG paths.
export function attachmentFingerprint(att: Attachment): string {
  return `${att.name}|${att.size}|${att.content?.substring(0, 100)}`;
}

// Read a File into an Attachment (no server round-trip). Returns null for
// unsupported types. PDF content is raw base64; extraction happens in processFile.
export function readFileToAttachment(file: File): Promise<Attachment | null> {
  return new Promise((resolve) => {
    const id = generateId();
    const addedAt = new Date().toISOString();
    const isImage = file.type.startsWith('image/');
    const isPDF = file.type === 'application/pdf' || file.name.endsWith('.pdf');
    const isText = file.type.startsWith('text/') || TEXT_EXTENSIONS.test(file.name);
    const isDocx = file.name.toLowerCase().endsWith('.docx');

    if (isImage) {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        resolve({
          id, name: file.name, type: file.type, size: file.size, addedAt,
          content: base64, thumbnailUrl: reader.result as string,
        });
      };
      reader.readAsDataURL(file);
    } else if (isPDF) {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        resolve({ id, name: file.name, type: 'application/pdf', size: file.size, addedAt, content: base64 });
      };
      reader.readAsDataURL(file);
    } else if (isDocx) {
      // Word docs: extract the text layer in the browser (mammoth is loaded
      // lazily — first .docx pays the module download, everyone else never does)
      void file.arrayBuffer().then(async (buf) => {
        try {
          const mammoth = await import('mammoth');
          const r = await mammoth.extractRawText({ arrayBuffer: buf });
          resolve({ id, name: file.name, type: 'text/plain', size: file.size, addedAt, content: r.value.trim() });
        } catch {
          resolve(null);
        }
      });
    } else if (isText) {
      file.text().then((text) => {
        resolve({ id, name: file.name, type: file.type || 'text/plain', size: file.size, addedAt, content: text });
      });
    } else {
      resolve(null);
    }
  });
}

export interface ProcessFileCallbacks {
  /** Called once with the initial attachment (PDFs arrive with isExtracting: true). */
  add: (att: Attachment) => void;
  /** Called after async PDF extraction with the fields to merge in. */
  update: (attachmentId: string, patch: Partial<Attachment>) => void;
}

/**
 * Full upload pipeline shared by the landing input, node drop zone and
 * FocusPanel attachments section: read the file, hand it to `add`, and for
 * PDFs run server-side extraction and deliver the result via `update`.
 */
export async function processFile(file: File, cb: ProcessFileCallbacks): Promise<void> {
  const att = await readFileToAttachment(file);
  if (!att) return;

  if (att.type !== 'application/pdf') {
    cb.add(att);
    return;
  }

  cb.add({ ...att, isExtracting: true });
  try {
    const data = await extractPdf(att.content);
    const numPages = data.numPages || 0;
    cb.update(att.id, {
      extractedText: data.text,
      pageImages: data.images,
      numPages,
      renderMode: numPages > PDF_VISION_PAGE_THRESHOLD ? 'text-only' : 'full',
      isExtracting: false,
    });
  } catch {
    cb.update(att.id, { isExtracting: false });
  }
}
