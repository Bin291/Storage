/**
 * Cắt text thô theo độ dài cố định 1000 ký tự, overlap 100 ký tự (mục 8.C).
 * Tự cắt bằng vòng lặp, không dùng thư viện ngoài.
 */
export function chunkText(
  text: string,
  size = 1000,
  overlap = 100,
): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length === 0) return [];
  if (clean.length <= size) return [clean];

  const chunks: string[] = [];
  const step = Math.max(1, size - overlap);
  for (let start = 0; start < clean.length; start += step) {
    const piece = clean.slice(start, start + size).trim();
    if (piece) chunks.push(piece);
    if (start + size >= clean.length) break;
  }
  return chunks;
}
