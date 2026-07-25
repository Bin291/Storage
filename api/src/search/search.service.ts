import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiEmbeddingService } from '../ai/ai-embedding.service';

interface ChunkMatch {
  file_id: string;
  file_name: string;
  content: string;
  similarity: number;
}

export interface SearchResultItem {
  fileId: string;
  fileName: string;
  similarity: number; // 0..1 (điểm cao nhất trong các chunk khớp)
  snippets: string[];
}

@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly embedder: AiEmbeddingService,
  ) {}

  /**
   * Semantic search (mục 8.C): embed câu hỏi -> RPC match_document_chunks
   * (LUÔN filter user_id) -> gom theo file, giữ điểm cao nhất.
   */
  async search(userId: string, query: string): Promise<SearchResultItem[]> {
    const q = query.trim();
    if (!q) return [];

    const embedding = await this.embedder.generateEmbedding(q);
    const literal = `[${embedding.join(',')}]`;

    const rows = await this.prisma.$queryRawUnsafe<ChunkMatch[]>(
      `SELECT * FROM match_document_chunks($1::vector, $2::uuid, $3::int)`,
      literal,
      userId,
      10,
    );

    // Gom theo file: giữ similarity cao nhất + tối đa 3 snippet.
    const byFile = new Map<string, SearchResultItem>();
    for (const r of rows) {
      const existing = byFile.get(r.file_id);
      if (existing) {
        existing.similarity = Math.max(existing.similarity, r.similarity);
        if (existing.snippets.length < 3) existing.snippets.push(r.content);
      } else {
        byFile.set(r.file_id, {
          fileId: r.file_id,
          fileName: r.file_name,
          similarity: r.similarity,
          snippets: [r.content],
        });
      }
    }
    return [...byFile.values()].sort((a, b) => b.similarity - a.similarity);
  }
}
