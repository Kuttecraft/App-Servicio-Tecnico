import type { BrowserClerk } from '@clerk/clerk-js';

declare global {
  interface Window {
    Clerk: BrowserClerk;
  }
}

export {};
