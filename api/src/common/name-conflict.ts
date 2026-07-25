/**
 * Tự thêm hậu tố kiểu Windows Explorer khi trùng tên trong cùng 1 folder (mục 2.1).
 * Dùng chung cho cả 3 tình huống: upload/tạo mới, rename, move.
 *
 * "Báo cáo.pdf" trùng -> "Báo cáo (1).pdf" -> "Báo cáo (2).pdf" ...
 * Với folder (không có phần mở rộng): "Ảnh" -> "Ảnh (1)" ...
 */

function splitBaseExt(name: string): { base: string; ext: string } {
  const dot = name.lastIndexOf('.');
  // Không tách nếu dấu chấm ở đầu (file ẩn) hoặc không có phần mở rộng.
  if (dot <= 0) return { base: name, ext: '' };
  return { base: name.slice(0, dot), ext: name.slice(dot) };
}

/** Bỏ hậu tố " (n)" nếu có, trả về base gốc. */
function stripSuffix(base: string): string {
  return base.replace(/ \(\d+\)$/, '');
}

/**
 * Trả về tên không đụng với tập tên đã tồn tại (so sánh không phân biệt hoa/thường
 * để khớp hành vi hệ tệp Windows).
 */
export function resolveNameConflict(
  desiredName: string,
  existingNames: string[],
): string {
  const taken = new Set(existingNames.map((n) => n.toLowerCase()));
  if (!taken.has(desiredName.toLowerCase())) return desiredName;

  const { base, ext } = splitBaseExt(desiredName);
  const rootBase = stripSuffix(base);
  for (let i = 1; i < 10_000; i++) {
    const candidate = `${rootBase} (${i})${ext}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  // Cực hiếm: quá nhiều trùng — nối timestamp cho chắc chắn duy nhất.
  return `${rootBase} (${Date.now()})${ext}`;
}
