import { RenderedPlan } from './plan-export';

/** Rasterizes a rendered plan SVG to a PNG blob in the browser. */
export async function svgToPng(rendered: RenderedPlan): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([rendered.svg], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = rendered.width;
    canvas.height = rendered.height;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Canvas 2D is not available');
    }
    context.drawImage(image, 0, 0, rendered.width, rendered.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('PNG encoding failed'))),
        'image/png',
      ),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Prints only the plan (not the editor UI) through a hidden iframe. The browser's print dialog
 * also offers "Save as PDF", which is how PDF export works without bundling a PDF library.
 */
export function printPlan(rendered: RenderedPlan, title: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.tabIndex = -1;
    frame.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0;';
    const escapedTitle = title.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
    frame.srcdoc =
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapedTitle}</title>` +
      '<style>@page{margin:12mm}html,body{margin:0}svg{display:block;width:100%;height:auto;max-height:100vh}</style>' +
      `</head><body>${rendered.svg}</body></html>`;
    frame.onload = () => {
      const win = frame.contentWindow;
      if (!win) {
        frame.remove();
        reject(new Error('Print frame did not load'));
        return;
      }
      win.addEventListener('afterprint', () => frame.remove(), { once: true });
      // Fallback cleanup for browsers that do not fire afterprint on the frame.
      setTimeout(() => frame.remove(), 60_000);
      win.focus();
      win.print();
      resolve();
    };
    document.body.appendChild(frame);
  });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
