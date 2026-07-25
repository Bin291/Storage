import { Pipe, PipeTransform, inject } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

/**
 * Đánh dấu URL an toàn để nhúng vào <iframe> (preview PDF — mục 2.2).
 * URL là presigned GCS do chính backend cấp nên tin cậy được.
 */
@Pipe({ name: 'safeUrl' })
export class SafeUrlPipe implements PipeTransform {
  private readonly sanitizer = inject(DomSanitizer);
  transform(url: string): SafeResourceUrl {
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }
}
