import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  ListPartsCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'node:stream';

export interface CompletedPart {
  ETag: string;
  PartNumber: number;
}

/**
 * Bọc mọi thao tác Google Cloud Storage — mục 5.A/5.C PLAN.md.
 *
 * GCS được gọi qua **XML API tương thích S3** (Interoperability): cùng một
 * AWS SDK v3, chỉ đổi endpoint sang `https://storage.googleapis.com` và dùng
 * cặp **HMAC key** (Access key / Secret) của một service account. Nhờ vậy toàn
 * bộ luồng multipart + presigned URL giữ nguyên như khi còn dùng R2.
 *
 * Key object = ID cố định "{userId}/{fileId}", không chứa path người đọc được.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicBaseUrl: string;

  constructor(private readonly config: ConfigService) {
    this.bucket = this.config.get<string>('gcs.bucket', 'storage-app');
    this.publicBaseUrl = this.config.get<string>('gcs.publicBaseUrl', '');
    this.client = new S3Client({
      // SigV4 của GCS lấy region theo location của bucket (VD multi-region 'asia').
      region: this.config.get<string>('gcs.region', 'auto'),
      endpoint: this.config.get<string>(
        'gcs.endpoint',
        'https://storage.googleapis.com',
      ),
      credentials: {
        accessKeyId: this.config.get<string>('gcs.accessKeyId', ''),
        secretAccessKey: this.config.get<string>('gcs.secretAccessKey', ''),
      },
      // AWS SDK v3 (>=3.729) tự thêm checksum CRC32 vào presigned URL
      // (x-amz-checksum-crc32=AAAAAA==) — GCS XML API không hiểu header này và
      // sẽ từ chối PUT từ trình duyệt. Chỉ tính checksum khi thực sự bắt buộc
      // để URL presign sạch (mục 5.A).
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }

  /** Key gốc của 1 file. */
  buildKey(userId: string, fileId: string): string {
    return `${userId}/${fileId}`;
  }

  /** Key của thumbnail sinh nền. */
  thumbnailKey(userId: string, fileId: string): string {
    return `${userId}/${fileId}.thumb.webp`;
  }

  /** Key của AI artifact (raw text tách khỏi file gốc — mục 4.B). */
  artifactKey(userId: string, fileId: string): string {
    return `${userId}/${fileId}.txt`;
  }

  /** Key avatar cá nhân hoá — cố định theo user, ghi đè khi đổi ảnh (mục 11.E). */
  avatarKey(userId: string): string {
    return `avatars/${userId}.webp`;
  }

  // --- Multipart upload (mục 5.A) ---

  async createMultipartUpload(key: string, contentType: string): Promise<string> {
    const res = await this.client.send(
      new CreateMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: contentType,
      }),
    );
    if (!res.UploadId) throw new Error('GCS không trả về UploadId');
    return res.UploadId;
  }

  /** Presigned URL để Angular PUT thẳng 1 part lên GCS (không qua backend). */
  presignUploadPart(
    key: string,
    uploadId: string,
    partNumber: number,
    expiresIn = 3600,
  ): Promise<string> {
    return getSignedUrl(
      this.client,
      new UploadPartCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: uploadId,
        PartNumber: partNumber,
      }),
      { expiresIn },
    );
  }

  /** Upload 1 part QUA backend (proxy) — trả ETag. Tránh phụ thuộc CORS bucket (mục 5.A). */
  async uploadPart(
    key: string,
    uploadId: string,
    partNumber: number,
    body: Buffer,
  ): Promise<string> {
    const res = await this.client.send(
      new UploadPartCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: uploadId,
        PartNumber: partNumber,
        Body: body,
      }),
    );
    if (!res.ETag) throw new Error('GCS không trả ETag khi upload part');
    return res.ETag;
  }

  async completeMultipartUpload(
    key: string,
    uploadId: string,
    parts: CompletedPart[],
  ): Promise<void> {
    await this.client.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: parts
            .slice()
            .sort((a, b) => a.PartNumber - b.PartNumber),
        },
      }),
    );
  }

  /** Hỏi GCS các part đã nhận để resume (mục 5.A — không cần bảng track riêng). */
  async listParts(key: string, uploadId: string): Promise<CompletedPart[]> {
    const parts: CompletedPart[] = [];
    let partNumberMarker: string | undefined;
    do {
      const res = await this.client.send(
        new ListPartsCommand({
          Bucket: this.bucket,
          Key: key,
          UploadId: uploadId,
          PartNumberMarker: partNumberMarker,
        }),
      );
      for (const p of res.Parts ?? []) {
        if (p.ETag && p.PartNumber != null) {
          parts.push({ ETag: p.ETag, PartNumber: p.PartNumber });
        }
      }
      partNumberMarker = res.IsTruncated
        ? res.NextPartNumberMarker
        : undefined;
    } while (partNumberMarker);
    return parts;
  }

  async abortMultipartUpload(key: string, uploadId: string): Promise<void> {
    await this.client.send(
      new AbortMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: uploadId,
      }),
    );
  }

  // --- Download / preview (mục 5.C / 11.J) ---

  /**
   * Presigned GET URL. Nếu có CDN public thì ưu tiên URL public (cache tốt hơn).
   * `filename` (nếu truyền) ép GCS trả `Content-Disposition` đúng tên gốc — không
   * thì trình duyệt suy tên tải xuống từ key ("{userId}/{fileId}", không đuôi,
   * không tên đọc được) vì thẻ `<a download>` HTML BỊ BỎ QUA với URL khác gốc
   * (mục 11.J — sửa lỗi tên file "bể chữ"/thiếu đuôi khi tải xuống).
   */
  presignDownload(
    key: string,
    expiresIn = 3600,
    filename?: string,
    disposition: 'inline' | 'attachment' = 'inline',
  ): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentDisposition: filename
          ? contentDisposition(filename, disposition)
          : undefined,
      }),
      { expiresIn },
    );
  }

  publicUrl(key: string): string | null {
    if (!this.publicBaseUrl) return null;
    return `${this.publicBaseUrl.replace(/\/$/, '')}/${key}`;
  }

  // --- Server-side get/put (worker: thumbnail, AI artifact) ---

  async getObjectBuffer(key: string): Promise<Buffer> {
    const res = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    const stream = res.Body as Readable;
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  /** Stream đọc object (dùng cho archiver zip — mục 5.E). */
  async getObjectStream(key: string): Promise<Readable> {
    const res = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    return res.Body as Readable;
  }

  /** Upload streaming (không load hết vào RAM) — mục 5.E. */
  async uploadStream(
    key: string,
    body: Readable,
    contentType: string,
  ): Promise<void> {
    const { Upload } = await import('@aws-sdk/lib-storage');
    const upload = new Upload({
      client: this.client,
      params: {
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      },
    });
    await upload.done();
  }

  async putObject(
    key: string,
    body: Buffer,
    contentType: string,
  ): Promise<void> {
    // PutObject dùng lại từ client-s3 (import động để tránh phình import phía trên).
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  /**
   * Sao chép object NGAY TRÊN GCS (server-side) — byte không đi vòng qua backend.
   * Dùng cho tính năng Sao chép/Dán (mục 11.N): copy 2GB cũng chỉ là 1 lệnh API,
   * không tốn băng thông Cloud Run.
   *
   * Trả `false` nếu object nguồn không tồn tại (VD tệp chưa có thumbnail) —
   * gọi bên ngoài coi đó là bình thường, không phải lỗi.
   */
  async copyObject(srcKey: string, destKey: string): Promise<boolean> {
    const { CopyObjectCommand } = await import('@aws-sdk/client-s3');
    try {
      await this.client.send(
        new CopyObjectCommand({
          Bucket: this.bucket,
          // CopySource phải là "bucket/key" và ĐÃ mã hoá URL — tên tệp/id có
          // ký tự lạ (dấu cách, unicode) sẽ làm hỏng chữ ký nếu để nguyên.
          CopySource: encodeURI(`${this.bucket}/${srcKey}`),
          Key: destKey,
        }),
      );
      return true;
    } catch (err) {
      const name = (err as { name?: string }).name;
      if (name === 'NoSuchKey' || name === 'NotFound') return false;
      throw err;
    }
  }

  async deleteObject(key: string): Promise<void> {
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
    } catch (err) {
      // Delete idempotent; log nhưng không chặn luồng dọn rác.
      this.logger.warn(`Xoá object ${key} lỗi: ${(err as Error).message}`);
    }
  }
}

/**
 * Dựng header Content-Disposition chuẩn RFC 6266/5987 — bắt buộc để tên có
 * dấu tiếng Việt không bị "bể chữ" (mục 11.J). `filename=` là bản ASCII dự
 * phòng cho client cũ; `filename*=UTF-8''...` là bản đầy đủ Unicode mà mọi
 * trình duyệt hiện đại ưu tiên đọc.
 */
function contentDisposition(filename: string, disposition: 'inline' | 'attachment'): string {
  const asciiFallback = filename.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, "'") || 'file';
  const encoded = encodeURIComponent(filename);
  return `${disposition}; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}
