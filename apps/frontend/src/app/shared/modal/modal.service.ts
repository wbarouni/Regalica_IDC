import { Injectable, signal, Type } from '@angular/core';

export interface ModalConfig {
  component: Type<unknown>;
  inputs?: Record<string, unknown>;
}

@Injectable({ providedIn: 'root' })
export class ModalService {
  readonly activeModal = signal<ModalConfig | null>(null);

  open(component: Type<unknown>, inputs?: Record<string, unknown>): void {
    this.activeModal.set({ component, inputs });
  }

  close(): void {
    this.activeModal.set(null);
  }
}
