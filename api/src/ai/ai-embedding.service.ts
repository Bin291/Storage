import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';

/**
 * Sinh embedding qua Google Gemini (mục 8.A/8.B). Bọc riêng để dễ swap provider
 * (backup Jina AI) mà không sửa nơi gọi.
 */
@Injectable()
export class AiEmbeddingService {
  private readonly logger = new Logger(AiEmbeddingService.name);
  private readonly ai: GoogleGenAI;
  private readonly model: string;

  constructor(private readonly config: ConfigService) {
    this.ai = new GoogleGenAI({
      apiKey: this.config.get<string>('gemini.apiKey'),
    });
    this.model = this.config.get<string>(
      'gemini.embedModel',
      'gemini-embedding-001',
    );
  }

  /** 1 đoạn text -> vector 768 chiều. */
  async generateEmbedding(text: string): Promise<number[]> {
    const res = await this.ai.models.embedContent({
      model: this.model,
      contents: text,
      config: { outputDimensionality: 768 },
    });
    const values = res.embeddings?.[0]?.values;
    if (!values || values.length === 0) {
      throw new Error('Gemini không trả về embedding');
    }
    return values;
  }

  /** Nhiều đoạn cùng lúc (mỗi contents -> 1 embedding). */
  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const res = await this.ai.models.embedContent({
      model: this.model,
      contents: texts,
      config: { outputDimensionality: 768 },
    });
    const list = res.embeddings ?? [];
    return list.map((e) => e.values ?? []);
  }
}
