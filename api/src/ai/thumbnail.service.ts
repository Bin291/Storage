import { Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';
import * as XLSX from 'xlsx';
import { parseBuffer } from 'music-metadata';
import ffmpegPath from 'ffmpeg-static';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fsp from 'node:fs/promises';

const execFileAsync = promisify(execFile);

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'tiff']);
const SHEET_EXTS = new Set(['xlsx', 'xls', 'csv', 'ods']);
const AUDIO_EXTS = new Set(['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma', 'opus']);
const VIDEO_EXTS = new Set(['mp4', 'mov', 'webm', 'mkv', 'avi', 'wmv', 'flv', 'm4v', 'mpeg', '3gp']);
const CANVAS = { w: 400, h: 300 };

/**
 * Sinh thumbnail (mục 7.C / 11.I): ảnh qua `sharp`, PDF (trang đầu) qua
 * `pdf-to-img`. Bảng tính KHÔNG có layout engine -> tự vẽ 1 "thẻ xem trước"
 * SVG (vài ô đầu) rồi rasterize bằng sharp. DOCX KHÔNG hỗ trợ preview thật
 * (chỉ icon phía client — MVP, tránh LibreOffice/Puppeteer nặng cho side
 * project). Âm thanh (mp3/flac/m4a/...) lấy bìa nhạc nhúng sẵn trong tag qua
 * `music-metadata` (giống Explorer/Windows) — không tự vẽ thẻ giả nếu file
 * không có bìa. Video bắt khung hình đầu qua `ffmpeg-static` (binary tĩnh
 * kèm theo gói).
 */
@Injectable()
export class ThumbnailService {
  private readonly logger = new Logger(ThumbnailService.name);

  supports(extension: string): boolean {
    const ext = extension.toLowerCase();
    return (
      IMAGE_EXTS.has(ext) ||
      ext === 'pdf' ||
      SHEET_EXTS.has(ext) ||
      AUDIO_EXTS.has(ext) ||
      VIDEO_EXTS.has(ext)
    );
  }

  /** Trả về Buffer webp hoặc null nếu loại file chưa hỗ trợ/lỗi. */
  async generate(buffer: Buffer, extension: string): Promise<Buffer | null> {
    const ext = extension.toLowerCase();
    try {
      if (SHEET_EXTS.has(ext)) return await this.generateSheetThumb(buffer);
      if (AUDIO_EXTS.has(ext)) return await this.generateAudioThumb(buffer);
      if (VIDEO_EXTS.has(ext)) return await this.generateVideoThumb(buffer, ext);

      const source = ext === 'pdf' ? await this.renderPdfFirstPage(buffer) : buffer;
      if (!source) return null;
      return await sharp(source, { animated: false })
        .rotate() // tôn trọng EXIF orientation
        .resize(CANVAS.w, CANVAS.h, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 75 })
        .toBuffer();
    } catch (err) {
      this.logger.warn(`Tạo thumbnail lỗi: ${(err as Error).message}`);
      return null;
    }
  }

  /** Render trang đầu PDF thành PNG buffer (pdf-to-img — pdfjs). */
  private async renderPdfFirstPage(buffer: Buffer): Promise<Buffer | null> {
    try {
      const { pdf } = await import('pdf-to-img');
      const doc = await pdf(new Uint8Array(buffer), {
        scale: 1.5,
        // Trỏ tới standard_fonts của pdfjs để text dùng font chuẩn hiện đúng.
        docInitParams: { standardFontDataUrl: this.standardFontDir() },
      });
      for await (const page of doc) {
        return page; // Buffer PNG của trang đầu
      }
      return null;
    } catch (err) {
      this.logger.warn(`Render PDF thumbnail lỗi: ${(err as Error).message}`);
      return null;
    }
  }

  /** URL thư mục standard_fonts của pdfjs-dist — pdfjs yêu cầu forward-slash + '/' cuối. */
  private standardFontDir(): string | undefined {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const path = require('node:path') as typeof import('node:path');
      const pkg = require.resolve('pdfjs-dist/package.json');
      const dir = path.dirname(pkg).replace(/\\/g, '/');
      return `${dir}/standard_fonts/`;
    } catch {
      return undefined;
    }
  }

  /**
   * Bìa nhạc nhúng sẵn trong tag (ID3 APIC/FLAC PICTURE/MP4 covr/...) qua
   * `music-metadata` — không có bìa nhúng thì trả null (rơi vào icon phía
   * client, KHÔNG tự vẽ thẻ giả vì không có nội dung hình ảnh thật để dùng).
   */
  private async generateAudioThumb(buffer: Buffer): Promise<Buffer | null> {
    const meta = await parseBuffer(buffer, undefined, { duration: false });
    const picture = meta.common.picture?.[0];
    if (!picture?.data?.length) return null;
    return sharp(Buffer.from(picture.data))
      .resize(CANVAS.w, CANVAS.h, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
  }

  /**
   * Khung hình video qua `ffmpeg-static` (binary tĩnh, không cần cài đặt hệ
   * thống) — ghi buffer ra file tạm (ffmpeg cần input là file/pipe định dạng
   * rõ ràng). Nhiều video (đặc biệt clip tải từ YouTube) có vài giây intro
   * đen/mờ dần ở đầu -> thử vài mốc thời gian, bỏ qua khung gần như đen/trắng
   * trơn (mean độ sáng quá thấp/cao), rồi rasterize/nén lại bằng sharp.
   */
  private async generateVideoThumb(buffer: Buffer, extension: string): Promise<Buffer | null> {
    if (!ffmpegPath) return null;
    const id = randomUUID();
    const inputPath = path.join(os.tmpdir(), `thumb-in-${id}.${extension}`);
    const outputPath = path.join(os.tmpdir(), `thumb-out-${id}.png`);
    try {
      await fsp.writeFile(inputPath, buffer);
      const grabFrame = (seek: string) =>
        execFileAsync(
          ffmpegPath as string,
          [
            '-y',
            '-ss', seek,
            '-i', inputPath,
            '-frames:v', '1',
            '-vf', 'scale=800:-2:force_original_aspect_ratio=decrease',
            outputPath,
          ],
          { timeout: 15_000 },
        );

      let bestFrame: Buffer | null = null;
      for (const seek of ['00:00:03', '00:00:06', '00:00:01', '00:00:00']) {
        try {
          await grabFrame(seek);
        } catch {
          continue; // mốc vượt quá thời lượng clip hoặc lỗi decode -> thử mốc kế
        }
        const frame = await fsp.readFile(outputPath);
        bestFrame ??= frame; // luôn có 1 khung dự phòng nếu mọi mốc đều tối/trắng
        const { channels } = await sharp(frame).stats();
        const mean = channels.slice(0, 3).reduce((sum, c) => sum + c.mean, 0) / Math.min(3, channels.length);
        if (mean > 12 && mean < 250) {
          bestFrame = frame; // khung có nội dung thật (không đen/trắng trơn)
          break;
        }
      }
      if (!bestFrame) return null;

      return await sharp(bestFrame)
        .resize(CANVAS.w, CANVAS.h, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 75 })
        .toBuffer();
    } finally {
      await fsp.rm(inputPath, { force: true }).catch(() => {});
      await fsp.rm(outputPath, { force: true }).catch(() => {});
    }
  }

  /** "Thẻ xem trước" bảng tính: vài dòng/cột đầu vẽ dạng lưới ô. */
  private async generateSheetThumb(buffer: Buffer): Promise<Buffer | null> {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = wb.SheetNames[0];
    const sheet = sheetName ? wb.Sheets[sheetName] : null;
    if (!sheet) return null;
    const rows = XLSX.utils.sheet_to_json<string[]>(sheet, {
      header: 1,
      raw: false,
      defval: '',
    });
    if (rows.length === 0) return null;

    const cols = 4;
    const visibleRows = rows.slice(0, 6);
    const gridX = 24;
    const gridY = 20;
    const gridW = CANVAS.w - 48;
    const gridH = CANVAS.h - 40;
    const rowH = gridH / Math.max(visibleRows.length, 1);
    const colW = gridW / cols;

    const cells: string[] = [];
    visibleRows.forEach((row, r) => {
      for (let c = 0; c < cols; c++) {
        const x = gridX + c * colW;
        const y = gridY + r * rowH;
        const isHeader = r === 0;
        if (isHeader) {
          cells.push(
            `<rect x="${x}" y="${y}" width="${colW}" height="${rowH}" fill="#eef2ff"/>`,
          );
        }
        const val = (row?.[c] ?? '').toString();
        if (val) {
          cells.push(
            `<text x="${x + 6}" y="${y + rowH / 2 + 4}" font-family="sans-serif" font-size="10" ` +
              `${isHeader ? 'font-weight="700" fill="#4338ca"' : 'fill="#404040"'} clip-path="url(#cell)">${escapeXml(truncate(val, 10))}</text>`,
          );
        }
      }
    });

    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS.w}" height="${CANVAS.h}" viewBox="0 0 ${CANVAS.w} ${CANVAS.h}">
  <defs><clipPath id="cell"><rect x="0" y="0" width="${colW - 4}" height="${rowH}"/></clipPath></defs>
  <rect width="${CANVAS.w}" height="${CANVAS.h}" fill="#f4f4f5"/>
  <rect x="${gridX}" y="${gridY}" width="${gridW}" height="${gridH}" fill="#ffffff" stroke="#e5e5e5"/>
  ${cells.join('\n  ')}
  ${Array.from({ length: cols + 1 }, (_, c) => {
    const x = gridX + c * colW;
    return `<line x1="${x}" y1="${gridY}" x2="${x}" y2="${gridY + gridH}" stroke="#e5e5e5"/>`;
  }).join('\n  ')}
  ${visibleRows
    .map((_, r) => {
      const y = gridY + r * rowH;
      return `<line x1="${gridX}" y1="${y}" x2="${gridX + gridW}" y2="${y}" stroke="#e5e5e5"/>`;
    })
    .join('\n  ')}
</svg>`.trim();
    return sharp(Buffer.from(svg)).webp({ quality: 80 }).toBuffer();
  }
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function truncate(s: string, maxChars: number): string {
  return s.length > maxChars ? `${s.slice(0, maxChars - 1)}…` : s;
}
