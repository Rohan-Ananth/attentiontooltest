/**
 * utils.js — Shared utilities for TideTrack
 */

function formatDuration(seconds) {
  if (!seconds || seconds < 1) return '0s';
  if (seconds < 60) return `${seconds}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s}s`;
}

function extractHostname(url) {
  try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase(); }
  catch { return ''; }
}

function isInternalUrl(url) {
  if (!url) return true;
  return /^(chrome|chrome-extension|about|edge|brave|opera|vivaldi|file):/.test(url);
}

/**
 * Validates a segment object has the required shape and reasonable values.
 * Returns the segment if valid, null otherwise.
 */
function validateSegment(segment) {
  if (!segment || typeof segment !== 'object') return null;
  if (segment.type !== 'study' && segment.type !== 'distraction') return null;
  if (typeof segment.startTime !== 'number' || segment.startTime <= 0) return null;
  if (typeof segment.endTime !== 'number' || segment.endTime <= 0) return null;
  if (typeof segment.duration !== 'number' || segment.duration < 0) return null;
  if (typeof segment.url !== 'string') return null;
  return segment;
}
