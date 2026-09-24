import type { DamApi } from './ipc/handlers';

declare global {
  interface Window {
    damApi: DamApi;
  }
}

export {};
