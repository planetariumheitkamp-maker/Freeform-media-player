import type { FreeformBridge } from './types';

declare global {
  interface Window {
    freeform?: FreeformBridge;
  }
}

export {};
