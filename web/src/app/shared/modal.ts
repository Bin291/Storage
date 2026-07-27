import { Component, input, output } from '@angular/core';

/** Modal tối giản: backdrop mờ + card hairline (không shadow — hệ ollama). */
@Component({
  selector: 'app-modal',
  template: `
    <div class="backdrop" (click)="close.emit()">
      <div class="card panel" (click)="$event.stopPropagation()">
        <h3>{{ title() }}</h3>
        <div class="body">
          <ng-content />
        </div>
        <div class="actions">
          <ng-content select="[actions]" />
        </div>
      </div>
    </div>
  `,
  styles: `
    .backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.35);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 100;
      padding: var(--s-lg);
      /* Chừa vùng an toàn + không cho vuốt trong modal cuộn lây trang nền. */
      padding-top: max(var(--s-lg), var(--safe-t));
      padding-bottom: max(var(--s-lg), var(--safe-b));
      overscroll-behavior: contain;
    }
    .panel {
      width: 100%;
      max-width: 440px;
      /* Nội dung cao hơn màn hình (VD dialog Chia sẻ có danh sách người nhận)
         thì CHÍNH modal cuộn — trước đây nó tràn ra ngoài và nút hành động
         bị đẩy khỏi màn hình, không bấm được trên điện thoại. */
      max-height: calc(100dvh - 2 * var(--s-lg));
      display: flex;
      flex-direction: column;
      padding: var(--s-xl);
      background: var(--c-surface-card);
      border-radius: var(--r-xl, 28px);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.24);
    }
    h3 {
      margin-bottom: var(--s-lg);
      /* Tiêu đề dài (tên file) không được nong modal rộng ra. */
      overflow-wrap: anywhere;
    }
    .body {
      margin-bottom: var(--s-xl);
      min-height: 0;
      overflow-y: auto;
      overscroll-behavior: contain;
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: var(--s-sm);
      flex-wrap: wrap;
      flex-shrink: 0;
    }
    @media (max-width: 480px) {
      .backdrop { padding: var(--s-sm); }
      .panel { padding: var(--s-lg); }
      /* Màn rất hẹp: nút xếp dọc, mỗi nút full-width cho dễ bấm bằng ngón cái. */
      .actions { flex-direction: column-reverse; align-items: stretch; }
    }
  `,
})
export class Modal {
  readonly title = input('');
  readonly close = output<void>();
}
