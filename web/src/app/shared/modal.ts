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
    }
    .panel {
      width: 100%;
      max-width: 440px;
      padding: var(--s-xl);
      background: var(--c-surface-card);
    }
    h3 { margin-bottom: var(--s-lg); }
    .body { margin-bottom: var(--s-xl); }
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: var(--s-sm);
    }
  `,
})
export class Modal {
  readonly title = input('');
  readonly close = output<void>();
}
