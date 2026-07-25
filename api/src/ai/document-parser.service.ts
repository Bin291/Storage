import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import { PDFParse } from 'pdf-parse';
import * as mammoth from 'mammoth';

const TEXT_EXTS = new Set([
  'txt', 'md', 'markdown', 'json', 'csv', 'log', 'xml', 'yaml', 'yml',
  'js', 'ts', 'jsx', 'tsx', 'py', 'java', 'c', 'cpp', 'h', 'go', 'rs',
  'html', 'css', 'scss', 'sh', 'sql',
]);
const OCR_EXTS = new Set(['png', 'jpg', 'jpeg', 'webp']);
// Office OOXML: bảng tính + slide (mục 8.D) — dùng officeparser.
const OFFICE_EXTS = new Set(['xlsx', 'pptx', 'odt', 'ods', 'odp']);

/**
 * Trích raw text từ file để embed (mục 8.D) — bước tiền xử lý quan trọng nhất của RAG.
 * pdf-parse (PDF text layer), mammoth (DOCX), đọc thẳng text/code, Gemini OCR cho ảnh.
 * File không trích được text vẫn OK — chỉ là không có chunk (mục 24).
 */
@Injectable()
export class DocumentParserService {
  private readonly logger = new Logger(DocumentParserService.name);
  private readonly ai: GoogleGenAI;
  private readonly ocrModel: string;

  constructor(private readonly config: ConfigService) {
    this.ai = new GoogleGenAI({
      apiKey: this.config.get<string>('gemini.apiKey'),
    });
    this.ocrModel = this.config.get<string>('gemini.ocrModel', 'gemini-2.5-flash');
  }

  async extractText(
    buffer: Buffer,
    extension: string,
    mimeType: string,
  ): Promise<string> {
    const ext = extension.toLowerCase();
    try {
      if (ext === 'pdf') {
        const parser = new PDFParse({ data: buffer });
        const result = await parser.getText();
        const text = result.text?.trim() ?? '';
        // PDF scan (không có text layer) -> OCR trang qua Gemini nếu rỗng.
        if (text.length > 0) return text;
        return await this.runGeminiOcr(buffer, mimeType || 'application/pdf');
      }
      if (ext === 'docx') {
        const { value } = await mammoth.extractRawText({ buffer });
        return value?.trim() ?? '';
      }
      if (OFFICE_EXTS.has(ext)) {
        // officeparser: trích text từ XLSX/PPTX/ODF (mục 8.D).
        const office = await import('officeparser');
        const ast = await office.parseOffice(buffer);
        return (ast?.toText() ?? '').trim();
      }
      if (TEXT_EXTS.has(ext)) {
        return buffer.toString('utf-8').trim();
      }
      if (OCR_EXTS.has(ext)) {
        return await this.runGeminiOcr(buffer, mimeType || `image/${ext}`);
      }
      // Loại khác (zip, video, office khác...) không trích text ở MVP.
      return '';
    } catch (err) {
      this.logger.warn(
        `Trích text ${ext} lỗi: ${(err as Error).message} — coi như không có text`,
      );
      return '';
    }
  }

  /** OCR ảnh/PDF scan qua Gemini generateContent (inline data). */
  private async runGeminiOcr(buffer: Buffer, mimeType: string): Promise<string> {
    try {
      const res = await this.ai.models.generateContent({
        model: this.ocrModel,
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: 'Trích xuất toàn bộ chữ trong tài liệu/ảnh này, giữ nguyên thứ tự dòng, không thêm bớt, không giải thích.',
              },
              { inlineData: { mimeType, data: buffer.toString('base64') } },
            ],
          },
        ],
      });
      return (res.text ?? '').trim();
    } catch (err) {
      this.logger.warn(`Gemini OCR lỗi: ${(err as Error).message}`);
      return '';
    }
  }
}
