export interface ChartExportInfo {
  title: string;
  subtitle: string;
  notes?: readonly string[];
}

export interface ChartGraphic {
  source: HTMLCanvasElement | HTMLImageElement;
  width: number;
  height: number;
}
export type ChartRenderer = () => Promise<ChartGraphic>;

const FONT = '"PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
export const EXPORT_SOURCE = "数据来源：国家统计局，以官方发布为准 · House Price Index · house.taifua.com";

export function exportDimensions(width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new Error("Invalid image size");
  const scale = Math.min(2, 4096 / width, 4096 / height, Math.sqrt(4_000_000 / (width * height)));
  return { width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)), scale };
}

export function wrapExportText(text: string, width: number, measure: (value: string) => number): string[] {
  return text.split("\n").flatMap((paragraph) => {
    const lines: string[] = [];
    let line = "";
    const tokens = paragraph.match(/[A-Za-z0-9][A-Za-z0-9./%+-]*|[^]/gu) ?? [];
    for (const token of tokens) {
      for (const piece of measure(token) > width ? [...token] : [token]) {
        if (line && measure(line + piece) > width) {
          lines.push(line.trimEnd());
          line = "";
        }
        line += piece;
      }
    }
    if (line) lines.push(line.trimEnd());
    return lines;
  });
}

export function loadExportImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Chart image unavailable"));
    image.src = source;
  });
}

export async function chartPng(graphic: ChartGraphic, info: ChartExportInfo): Promise<Blob> {
  const canvas = document.createElement("canvas");
  try {
    await document.fonts.ready;
    const width = graphic.width;
    const padding = 24;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas unavailable");
    const lines = (text: string, font: string) => {
      context.font = font;
      return wrapExportText(text, width - padding * 2, (value) => context.measureText(value).width);
    };
    const title = lines(info.title, `600 20px ${FONT}`);
    const subtitle = lines(info.subtitle, `14px ${FONT}`);
    const notes = (info.notes ?? []).filter(Boolean).flatMap((note) => lines(note, `12px ${FONT}`));
    const source = lines(EXPORT_SOURCE, `12px ${FONT}`);
    const top = padding + title.length * 28 + 6 + subtitle.length * 22 + 14;
    const bottom = 16 + notes.length * 18 + (notes.length ? 12 : 0) + source.length * 18 + padding;
    const dimensions = exportDimensions(width, top + graphic.height + bottom);
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    context.scale(dimensions.scale, dimensions.scale);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, top + graphic.height + bottom);
    context.textBaseline = "top";
    let y = padding;
    const draw = (text: string[], font: string, color: string, lineHeight: number) => {
      context.font = font;
      context.fillStyle = color;
      for (const line of text) {
        context.fillText(line, padding, y);
        y += lineHeight;
      }
    };
    draw(title, `600 20px ${FONT}`, "#111827", 28);
    y += 6;
    draw(subtitle, `14px ${FONT}`, "#475467", 22);
    context.drawImage(graphic.source, 0, top, graphic.width, graphic.height);
    y = top + graphic.height + 16;
    draw(notes, `12px ${FONT}`, "#475467", 18);
    if (notes.length) y += 12;
    draw(source, `12px ${FONT}`, "#667085", 18);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("PNG unavailable");
    return blob;
  } finally {
    canvas.width = canvas.height = 0;
  }
}

export function downloadPng(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  try {
    anchor.href = url;
    anchor.download = `${fileName}.png`;
    anchor.hidden = true;
    document.body.append(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    // Give mobile download handlers time to consume the URL before releasing it.
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
}
