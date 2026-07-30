import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../infra/prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { AiPipelineJob, QUEUE } from '../jobs/queue.constants';
import { DocumentParserService } from './document-parser.service';
import { AiEmbeddingService } from './ai-embedding.service';
import { chunkText } from './chunk.util';

/**
 * Pipeline AI (mục 5.B/8.C): tải file GCS → trích text → lưu AI artifact →
 * chunk → embed → lưu DocumentChunk (vector) → set File.status='ready'.
 * Concurrency 2 để không bùng nổ lệnh gọi Gemini (mục 5.B).
 */
@Processor(QUEUE.AI_PIPELINE, { concurrency: 2 })
export class AiPipelineProcessor extends WorkerHost {
  private readonly logger = new Logger(AiPipelineProcessor.name);
  private readonly EMBED_BATCH = 32;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly parser: DocumentParserService,
    private readonly embedder: AiEmbeddingService,
  ) {
    super();
  }

  async process(job: Job<AiPipelineJob>): Promise<void> {
    const { fileId, userId } = job.data;
    const file = await this.prisma.file.findFirst({
      where: { id: fileId, userId },
    });
    if (!file || file.status === 'delete_pending') return;

    // 1) Tải file gốc + trích text.
    const buffer = await this.storage.getObjectBuffer(file.r2Key);
    const text = await this.parser.extractText(
      buffer,
      file.extension,
      file.mimeType,
    );

    // 2) Không có text (ảnh trắng, file rỗng...) -> vẫn 'ready', không chunk (mục 24).
    if (!text || text.trim().length === 0) {
      await this.prisma.file.update({
        where: { id: fileId },
        data: { status: 'ready', errorMessage: null },
      });
      return;
    }

    // 3) Lưu AI artifact (raw text nhẹ) lên GCS để re-embed sau này (mục 4.B).
    await this.storage.putObject(
      this.storage.artifactKey(userId, fileId),
      Buffer.from(text, 'utf-8'),
      'text/plain; charset=utf-8',
    );

    // 4) Chunk + embed + lưu vector.
    const chunks = chunkText(text);
    await this.prisma.documentChunk.deleteMany({ where: { fileId } }); // idempotent

    for (let i = 0; i < chunks.length; i += this.EMBED_BATCH) {
      const batch = chunks.slice(i, i + this.EMBED_BATCH);
      const vectors = await this.embedder.generateEmbeddings(batch);
      for (let j = 0; j < batch.length; j++) {
        const embedding = vectors[j];
        if (!embedding || embedding.length === 0) continue;
        // Prisma không hỗ trợ type vector -> insert raw, cast ::vector.
        await this.prisma.$executeRawUnsafe(
          `INSERT INTO "DocumentChunk" (id, "fileId", content, "chunkIndex", embedding)
           VALUES ($1, $2, $3, $4, $5::vector)`,
          randomUUID(),
          fileId,
          batch[j],
          i + j,
          `[${embedding.join(',')}]`,
        );
      }
    }

    await this.prisma.file.update({
      where: { id: fileId },
      data: { status: 'ready', errorMessage: null },
    });
    this.logger.log(`AI xong file ${fileId}: ${chunks.length} chunk`);
  }

  /** Hết số lần retry (mục 5.B/7.B) -> đánh dấu 'failed' + lý do, không kẹt 'processing'. */
  @OnWorkerEvent('failed')
  async onFailed(job: Job<AiPipelineJob>, err: Error): Promise<void> {
    const maxAttempts = job.opts.attempts ?? 1;
    if (job.attemptsMade < maxAttempts) return; // còn retry
    try {
      await this.prisma.file.update({
        where: { id: job.data.fileId },
        data: {
          status: 'failed',
          errorMessage: err.message.slice(0, 500),
        },
      });
    } catch {
      /* file có thể đã bị xoá */
    }
    this.logger.error(`AI pipeline thất bại file ${job.data.fileId}: ${err.message}`);
  }
}
