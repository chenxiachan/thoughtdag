import type { Attachment } from '../types';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { generateId } from '../utils';
import { extractPdf } from './api';
import { PDF_VISION_PAGE_THRESHOLD } from './constants';
import { internAttachment } from './attachment-vault';

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

// Open a base64 PDF with pdfjs in the browser (worker configured by the import).
async function openPdf(base64: string): Promise<PDFDocumentProxy> {
  const [m, worker] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]);
  m.GlobalWorkerOptions.workerSrc = worker.default;
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return m.getDocument({ data: bytes, verbosity: 0 }).promise;
}

const PAGE_RENDER_DPI = 150; // matches the proxy's pdftoppm default

// Render every page to a base64 PNG in the browser — the local stand-in for
// the proxy's poppler when it is absent (the desktop app inherits a GUI PATH
// that hides Homebrew; the public demo has no backend at all). Same shape
// the proxy returns; the reader and Recognize consume both interchangeably.
async function renderPdfPages(doc: PDFDocumentProxy): Promise<string[]> {
  const scale = PAGE_RENDER_DPI / 72; // PDF user units are 72/inch
  const images: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const canvas = document.createElement('canvas');
    try {
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale });
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no 2d context');
      await page.render({ canvasContext: ctx, viewport }).promise;
    } catch {
      // keep page numbering intact for (p.N) anchors and Recognize: a failed
      // page becomes a blank frame instead of shifting every page after it
      canvas.width = 8;
      canvas.height = 8;
    }
    images.push(canvas.toDataURL('image/png').split(',')[1]);
  }
  return images;
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

  // The original PDF bytes go straight to the vault — the store only ever
  // sees the lightened attachment. Extraction below keeps using the local
  // `att.content` closure value.
  const light = await internAttachment(att);
  cb.add({ ...light, isExtracting: true });
  try {
    const data = await extractPdf(att.content);
    const numPages = data.numPages || 0;
    // The proxy answers without images when poppler is missing (minimal
    // installs; a desktop launch never sees Homebrew's PATH). Pages matter —
    // Recognize and the digest for scanned PDFs dead-end without them — so
    // render them right here instead.
    let images = data.images;
    if (!images?.length) {
      try {
        const doc = await openPdf(att.content);
        images = await renderPdfPages(doc);
        void doc.destroy();
      } catch { images = undefined; }
    }
    cb.update(att.id, {
      extractedText: data.text,
      pageImages: images?.length ? images : undefined,
      numPages,
      renderMode: numPages > PDF_VISION_PAGE_THRESHOLD ? 'text-only' : 'full',
      isExtracting: false,
    });
  } catch {
    // No extraction backend at all (the public demo has none): extract the
    // text layer and render the pages in the browser instead. Summaries,
    // digests, the text view and Recognize all keep working.
    try {
      const doc = await openPdf(att.content);
      const pages: string[] = [];
      for (let i = 1; i <= doc.numPages; i++) {
        try {
          const page = await doc.getPage(i);
          const content = await page.getTextContent();
          pages.push(content.items.map((it) => ('str' in it ? it.str : '')).join(' '));
        } catch { pages.push(''); }
      }
      let images: string[] | undefined;
      try { images = await renderPdfPages(doc); } catch { images = undefined; }
      void doc.destroy();
      cb.update(att.id, {
        extractedText: pages.join('\n\n').trim(),
        pageImages: images?.length ? images : undefined,
        numPages: doc.numPages,
        renderMode: doc.numPages > PDF_VISION_PAGE_THRESHOLD ? 'text-only' : 'full',
        isExtracting: false,
      });
    } catch {
      cb.update(att.id, { isExtracting: false });
    }
  }
}
