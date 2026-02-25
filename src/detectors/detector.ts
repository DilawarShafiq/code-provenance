import type { Detector } from '../types.js';

// Re-export the Detector interface for convenience
export type { Detector } from '../types.js';

/**
 * Registry of all active detectors.
 * Populated by the analyzer — detectors are registered at startup.
 */
export function createDetectorRegistry(): Detector[] {
  return [];
}
