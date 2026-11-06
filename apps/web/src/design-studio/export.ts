import type { DiagramSource } from '@sv/shared';

// Construct an SVG from validated, structured data rather than serialising live DOM.
// In particular, labels must remain text even when they contain markup.
function escapeXml(value: string): string {
  return value.replace(/[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu, '\uFFFD').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]!);
}

export function diagramSvg(source: DiagramSource): string {
  const nodes = new Map(source.nodes.map(node => [node.id, node]));
  const edges = source.edges.map(edge => {
    const a = nodes.get(edge.from), b = nodes.get(edge.to);
    if (!a || !b) return '';
    const dx = b.x - a.x, dy = b.y - a.y;
    const k = Math.max(Math.abs(dx) / 80, Math.abs(dy) / 40, 1);
    return `<g><line x1="${a.x + 80 + dx / k}" y1="${a.y + 40 + dy / k}" x2="${b.x + 80 - dx / k}" y2="${b.y + 40 - dy / k}" stroke="#36586e" stroke-width="3" marker-end="url(#arrow)"/><text x="${(a.x + b.x) / 2 + 80}" y="${(a.y + b.y) / 2 + 32}" text-anchor="middle" font-size="20" fill="#17384e">${escapeXml(edge.label)}</text></g>`;
  }).join('');
  const boxes = source.nodes.map(node => {
    const label = node.label.length > 18 ? node.label.slice(0, 18) + '…' : node.label;
    return `<g><rect x="${node.x}" y="${node.y}" width="160" height="80" rx="8" fill="#eaf4f8" stroke="#6b91a4" stroke-width="2"/><text x="${node.x + 80}" y="${node.y + 46}" text-anchor="middle" font-size="18" fill="#17384e">${escapeXml(label)}</text></g>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1200" viewBox="0 0 1920 1200"><rect width="1920" height="1200" fill="white"/><defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#36586e"/></marker></defs>${edges}${boxes}</svg>`;
}

export function exportFilename(title: string, extension: 'svg' | 'png' | 'json'): string {
  const stem = title.trim().replace(/[^\p{L}\p{N} _-]+/gu, '').trim().slice(0, 80) || 'diagram';
  return `${stem}.${extension}`;
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = filename; link.click();
  // Allow the browser to start the download before releasing the URL.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportDiagram(source: DiagramSource, title: string, format: 'svg' | 'png'): Promise<void> {
  const svg = new Blob([diagramSvg(source)], { type: 'image/svg+xml;charset=utf-8' });
  if (format === 'svg') { download(svg, exportFilename(title, format)); return; }
  const url = URL.createObjectURL(svg);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Could not render diagram for PNG export.'));
      image.src = url;
    });
    const canvas = document.createElement('canvas'); canvas.width = 1920; canvas.height = 1200;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('PNG export is not available in this browser.');
    context.drawImage(image, 0, 0);
    const png = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!png) throw new Error('Could not create PNG image.');
    download(png, exportFilename(title, format));
  } finally { URL.revokeObjectURL(url); }
}

/** Download a structured draft for manual recovery. Import is not supported yet. */
export function exportDraft(source: DiagramSource, title: string): void {
  download(new Blob([JSON.stringify({ title, source }, null, 2)], { type: 'application/json;charset=utf-8' }), exportFilename(title, 'json'));
}
