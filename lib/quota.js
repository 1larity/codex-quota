'use strict';

// Pure parsing/formatting helpers for Codex rate-limit data.
// No vscode import, no fs, no network. Unknown/extra fields are ignored.

const common = require('./common');
const { clampPercent } = common;

const FIVE_HOUR_MINUTES = 300;
const WEEK_MINUTES = 10080;
const DAY_MINUTES = 1440;
const MONTH_MINUTES = 43200;

// usedPercent -> remainingPercent (clamped to 0..100)
function usedToRemaining(usedPercent) {
  const used = clampPercent(usedPercent);
  if (used === undefined) {
    return undefined;
  }
  return clampPercent(100 - used);
}

// Classify a rate-limit window by its duration. Never throws.
function classifyWindowMinutes(minutes) {
  if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes <= 0) {
    return { kind: 'unknown', label: '', short: '' };
  }
  if (minutes === FIVE_HOUR_MINUTES) {
    return { kind: '5h', label: '5-hour', short: '5h' };
  }
  if (minutes === WEEK_MINUTES) {
    return { kind: 'week', label: 'Weekly', short: 'W' };
  }
  if (minutes === DAY_MINUTES) {
    return { kind: '24h', label: '24-hour', short: '24h' };
  }
  if (minutes === MONTH_MINUTES) {
    return { kind: '30d', label: '30-day', short: '30d' };
  }
  const generic = `${minutes}m`;
  return { kind: 'generic', label: generic, short: generic };
}

// resetsAt may be unix seconds or milliseconds; detect heuristically.
function parseResetAt(resetsAt) {
  if (typeof resetsAt !== 'number' || !Number.isFinite(resetsAt) || resetsAt <= 0) {
    return null;
  }
  const ms = resetsAt >= 1e12 ? resetsAt : resetsAt * 1000;
  const d = new Date(ms);
  return isNaN(d.getTime()) ? null : d;
}

// Parse one rate-limit window object into a UsageWindow. Returns null for junk.
function parseWindow(w) {
  if (!w || typeof w !== 'object') {
    return null;
  }
  const cls = classifyWindowMinutes(w.windowDurationMins);
  const usedPercent = clampPercent(w.usedPercent);
  return {
    kind: cls.kind,
    label: cls.label,
    short: cls.short,
    usedPercent,
    remainingPercent: usedPercent === undefined ? undefined : clampPercent(100 - usedPercent),
    resetAt: parseResetAt(w.resetsAt),
    windowMinutes:
      typeof w.windowDurationMins === 'number' && Number.isFinite(w.windowDurationMins)
        ? w.windowDurationMins
        : undefined,
  };
}

// Prefer the explicitly identified `codex` bucket, then the legacy snapshot,
// then a lone entry of the multi-bucket map. Returns null when nothing usable.
function selectSnapshot(result) {
  if (!result || typeof result !== 'object') {
    return null;
  }
  const byId = result.rateLimitsByLimitId;
  if (byId && typeof byId === 'object') {
    const codex = byId.codex;
    if (codex && typeof codex === 'object') {
      return codex;
    }
  }
  const legacy = result.rateLimits;
  if (legacy && typeof legacy === 'object') {
    return legacy;
  }
  if (byId && typeof byId === 'object') {
    const snapshots = Object.values(byId).filter((v) => v && typeof v === 'object');
    if (snapshots.length === 1) {
      return snapshots[0];
    }
  }
  return null;
}

// Parse the result of account/rateLimits/read. Returns null when the payload
// carries no usable snapshot. Never throws, ignores unknown extra fields.
function parseRateLimitResponse(result) {
  const snapshot = selectSnapshot(result);
  if (!snapshot) {
    return null;
  }
  const windows = [snapshot.primary, snapshot.secondary]
    .map(parseWindow)
    .filter((w) => w !== null)
    .sort((a, b) => {
      const am = a.windowMinutes === undefined ? Infinity : a.windowMinutes;
      const bm = b.windowMinutes === undefined ? Infinity : b.windowMinutes;
      return am - bm;
    });
  if (windows.length === 0) {
    return null;
  }
  const credits = result.rateLimitResetCredits;
  const resetCreditsAvailable =
    credits && typeof credits === 'object' && typeof credits.availableCount === 'number'
      ? credits.availableCount
      : null;
  return {
    windows,
    planType: typeof snapshot.planType === 'string' ? snapshot.planType : null,
    resetCreditsAvailable,
  };
}

// Compact status bar text (without label), e.g. "5h 82% · W 61%".
// Banked rate-limit resets are intentionally NOT part of the status text;
// they appear in the tooltip only.
function statusText(windows) {
  return common.statusText(windows);
}

// Detailed hover tooltip. `staleError` (optional) marks the data as stale.
function tooltipText(parsed, fetchedAt, staleError) {
  const sections = parsed.windows.map((w) => common.windowLines(w, fetchedAt));
  if (parsed.resetCreditsAvailable !== null && parsed.resetCreditsAvailable > 0) {
    sections.push([`Reset credits available: ${parsed.resetCreditsAvailable}`]);
  }
  return common.tooltipText('Codex quota', parsed.planType, fetchedAt, staleError, sections);
}

module.exports = {
  clampPercent,
  usedToRemaining,
  classifyWindowMinutes,
  parseResetAt,
  parseWindow,
  selectSnapshot,
  parseRateLimitResponse,
  severityBand: common.severityBand,
  normalizeThresholds: common.normalizeThresholds,
  statusText,
  formatDurationMs: common.formatDurationMs,
  formatResets: common.formatResets,
  tooltipText,
};
