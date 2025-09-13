// Polyfills for Node.js core modules in browser environment

// Buffer polyfill
import { Buffer } from 'buffer';
window.Buffer = Buffer;

// Process polyfill
import process from 'process/browser';
window.process = process;

// Global polyfills for compatibility
if (typeof global === 'undefined') {
  window.global = window;
}

// Export for explicit imports
export { Buffer, process };