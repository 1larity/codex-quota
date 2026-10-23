'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const quota = require('../lib/quota.js');
const { platformDirectory, resolveCodexPath } = require('../lib/codex-path.js');

test('resolves the current bundled Codex executable after an extension update', () => {
  const extensionPath = '/home/user/.vscode/extensions/openai.chatgpt-26.902.1';
  const expected = `${extensionPath}/bin/linux-x86_64/codex`;
  assert.equal(platformDirectory('linux', 'x64'), 'linux-x86_64');
  assert.equal(
    resolveCodexPath({
      configuredPath: 'codex',
      extensionPath,
      platform: 'linux',
      arch: 'x64',
      accessSync: (candidate) => {
        if (candidate !== expected) throw new Error('not executable');
      },
    }),
    expected
  );
});

test('honors an explicitly configured Codex path', () => {
  assert.equal(
    resolveCodexPath({
      configuredPath: '/opt/codex/bin/codex',
      extensionPath: '/home/user/.vscode/extensions/openai.chatgpt-current',
      accessSync: () => { throw new Error('should not inspect bundled path'); },
    }),
    '/opt/codex/bin/codex'
  );
});

test('usedToRemaining converts used percent to clamped remaining percent', () => {
  assert.equal(quota.usedToRemaining(0), 100);
  assert.equal(quota.usedToRemaining(25), 75);
  assert.equal(quota.usedToRemaining(100), 0);
});

test('usedToRemaining clamps bad values safely', () => {
  assert.equal(quota.usedToRemaining(-5), 100);
  assert.equal(quota.usedToRemaining(130), 0);
  assert.equal(quota.usedToRemaining(NaN), undefined);
  assert.equal(quota.usedToRemaining('82'), undefined);
  assert.equal(quota.usedToRemaining(undefined), undefined);
});

test('classifyWindowMinutes maps known durations', () => {
  assert.deepEqual(quota.classifyWindowMinutes(300), { kind: '5h', label: '5-hour', short: '5h' });
  assert.deepEqual(quota.classifyWindowMinutes(10080), { kind: 'week', label: 'Weekly', short: 'W' });
  assert.deepEqual(quota.classifyWindowMinutes(1440), { kind: '24h', label: '24-hour', short: '24h' });
  assert.deepEqual(quota.classifyWindowMinutes(43200), { kind: '30d', label: '30-day', short: '30d' });
});

test('classifyWindowMinutes gives unknown durations a generic label', () => {
  assert.deepEqual(quota.classifyWindowMinutes(720), { kind: 'generic', label: '720m', short: '720m' });
  assert.deepEqual(quota.classifyWindowMinutes(undefined), { kind: 'unknown', label: '', short: '' });
  assert.deepEqual(quota.classifyWindowMinutes(-1), { kind: 'unknown', label: '', short: '' });
});

test('parseResetAt detects unix seconds and milliseconds', () => {
  const fromSeconds = quota.parseResetAt(1787521415);
  assert.equal(fromSeconds instanceof Date, true);
  assert.equal(fromSeconds.getTime(), 1787521415000);
  const fromMillis = quota.parseResetAt(1787521415000);
  assert.equal(fromMillis.getTime(), 1787521415000);
  assert.equal(quota.parseResetAt(0), null);
  assert.equal(quota.parseResetAt('soon'), null);
});

function windowFixture(overrides = {}) {
  return Object.assign({ usedPercent: 18, windowDurationMins: 300, resetsAt: 1787521415 }, overrides);
}

function snapshotFixture(overrides = {}) {
  return Object.assign({ primary: null, secondary: null }, overrides);
}

test('parses rateLimitsByLimitId.codex and ignores unknown extra fields', () => {
  const result = quota.parseRateLimitResponse({
    rateLimits: { primary: null, secondary: null },
    rateLimitsByLimitId: {
      codex: snapshotFixture({
        limitId: 'codex',
        planType: 'plus',
        someFutureField: { nested: true },
        primary: windowFixture({ usedPercent: 18, windowDurationMins: 300 }),
        secondary: windowFixture({ usedPercent: 39, windowDurationMins: 10080, future: 1 }),
      }),
    },
    brandNewTopLevel: 42,
  });
  assert.equal(result.planType, 'plus');
  assert.equal(result.windows.length, 2);
  // shorter window sorts first regardless of primary/secondary order
  assert.equal(result.windows[0].kind, '5h');
  assert.equal(result.windows[0].remainingPercent, 82);
  assert.equal(result.windows[0].usedPercent, 18);
  assert.equal(result.windows[1].kind, 'week');
  assert.equal(result.windows[1].remainingPercent, 61);
});

test('falls back to legacy rateLimits snapshot', () => {
  const result = quota.parseRateLimitResponse({
    rateLimits: snapshotFixture({
      primary: windowFixture({ usedPercent: 18, windowDurationMins: 300 }),
      secondary: null,
    }),
  });
  assert.equal(result.windows.length, 1);
  assert.equal(result.windows[0].kind, '5h');
  assert.equal(result.windows[0].remainingPercent, 82);
});

test('secondary-only windows parse fine', () => {
  const result = quota.parseRateLimitResponse({
    rateLimits: snapshotFixture({
      primary: null,
      secondary: windowFixture({ usedPercent: 39, windowDurationMins: 10080 }),
    }),
  });
  assert.equal(result.windows.length, 1);
  assert.equal(result.windows[0].kind, 'week');
  assert.equal(result.windows[0].remainingPercent, 61);
});

test('null windows yield an unavailable result, not zero', () => {
  assert.equal(quota.parseRateLimitResponse({ rateLimits: snapshotFixture() }), null);
  assert.equal(quota.parseRateLimitResponse({ rateLimits: null, rateLimitsByLimitId: null }), null);
});

test('missing usedPercent keeps the window with unknown percentages', () => {
  const result = quota.parseRateLimitResponse({
    rateLimits: snapshotFixture({
      primary: { windowDurationMins: 300, resetsAt: 1787521415 },
    }),
  });
  assert.equal(result.windows.length, 1);
  assert.equal(result.windows[0].remainingPercent, undefined);
  assert.equal(result.windows[0].usedPercent, undefined);
});

test('malformed responses return null instead of throwing', () => {
  assert.equal(quota.parseRateLimitResponse(null), null);
  assert.equal(quota.parseRateLimitResponse('nope'), null);
  assert.equal(quota.parseRateLimitResponse(42), null);
  assert.equal(quota.parseRateLimitResponse({ rateLimits: 'broken' }), null);
});

test('single unnamed bucket in rateLimitsByLimitId is used', () => {
  const result = quota.parseRateLimitResponse({
    rateLimitsByLimitId: {
      other: snapshotFixture({ primary: windowFixture({ usedPercent: 50, windowDurationMins: 720 }) }),
    },
  });
  assert.equal(result.windows.length, 1);
  assert.equal(result.windows[0].kind, 'generic');
  assert.equal(result.windows[0].remainingPercent, 50);
});

test('banked rate-limit reset credits are surfaced when present', () => {
  const result = quota.parseRateLimitResponse({
    rateLimits: snapshotFixture({
      primary: windowFixture({ usedPercent: 18, windowDurationMins: 300 }),
    }),
    rateLimitResetCredits: {
      availableCount: 2,
      credits: [{ id: 'c1', status: 'available', resetType: 'codexRateLimits' }],
      futureField: true,
    },
  });
  assert.equal(result.resetCreditsAvailable, 2);
});

test('reset credits absent or malformed count as unavailable', () => {
  const base = () => ({
    rateLimits: snapshotFixture({ primary: windowFixture({ usedPercent: 18, windowDurationMins: 300 }) }),
  });
  assert.equal(quota.parseRateLimitResponse(base()).resetCreditsAvailable, null);
  assert.equal(
    quota.parseRateLimitResponse(
      Object.assign(base(), { rateLimitResetCredits: { availableCount: 'many' } })
    ).resetCreditsAvailable,
    null
  );
});

test('severityBand maps remaining percentage to color bands', () => {
  const w = (remainingPercent) => ({ remainingPercent });
  assert.equal(quota.severityBand([w(100)]), 'green');
  assert.equal(quota.severityBand([w(30)]), 'green'); // exactly 30% counts as green
  assert.equal(quota.severityBand([w(29.9)]), 'amber');
  assert.equal(quota.severityBand([w(20)]), 'amber');
  assert.equal(quota.severityBand([w(10)]), 'amber');
  assert.equal(quota.severityBand([w(9.9)]), 'red');
  assert.equal(quota.severityBand([w(0)]), 'red');
  // out-of-range values are clamped first
  assert.equal(quota.severityBand([w(-5)]), 'red');
  assert.equal(quota.severityBand([w(130)]), 'green');
});

test('severityBand uses the most constrained window', () => {
  const w = (remainingPercent) => ({ remainingPercent });
  assert.equal(quota.severityBand([w(82), w(61)]), 'green');
  assert.equal(quota.severityBand([w(82), w(25)]), 'amber');
  assert.equal(quota.severityBand([w(82), w(5)]), 'red');
  assert.equal(quota.severityBand([w(5), w(82)]), 'red');
});

test('severityBand returns null without known percentages', () => {
  assert.equal(quota.severityBand([]), null);
  assert.equal(quota.severityBand([{ remainingPercent: undefined }]), null);
  assert.equal(quota.severityBand([null]), null);
});

test('severityBand honors custom thresholds', () => {
  const t = { redBelowPercent: 20, amberBelowPercent: 50 };
  const w = (remainingPercent) => ({ remainingPercent });
  assert.equal(quota.severityBand([w(15)], t), 'red');
  assert.equal(quota.severityBand([w(19.9)], t), 'red');
  assert.equal(quota.severityBand([w(20)], t), 'amber');
  assert.equal(quota.severityBand([w(49)], t), 'amber');
  assert.equal(quota.severityBand([w(50)], t), 'green');
  assert.equal(quota.severityBand([w(100)], t), 'green');
});

test('severityBand falls back to defaults for invalid thresholds', () => {
  const w = (remainingPercent) => ({ remainingPercent });
  assert.equal(quota.severityBand([w(15)], null), 'amber'); // defaults: red<10, amber<30
  assert.equal(quota.severityBand([w(15)], {}), 'amber');
  assert.equal(quota.severityBand([w(15)], 'junk'), 'amber');
  assert.equal(quota.severityBand([w(15)], { redBelowPercent: 'x' }), 'amber');
  assert.equal(quota.severityBand([w(5)], { amberBelowPercent: NaN }), 'red');
});

test('normalizeThresholds clamps and fills defaults', () => {
  assert.deepEqual(quota.normalizeThresholds(undefined), { redBelowPercent: 10, amberBelowPercent: 30 });
  assert.deepEqual(quota.normalizeThresholds({ redBelowPercent: 200 }), { redBelowPercent: 100, amberBelowPercent: 30 });
  assert.deepEqual(quota.normalizeThresholds({ amberBelowPercent: -5 }), { redBelowPercent: 10, amberBelowPercent: 0 });
});

test('red threshold is checked first when thresholds are inverted', () => {
  const t = { redBelowPercent: 40, amberBelowPercent: 20 };
  const w = (remainingPercent) => ({ remainingPercent });
  assert.equal(quota.severityBand([w(25)], t), 'red'); // below red wins
  assert.equal(quota.severityBand([w(45)], t), 'green'); // above both
});

test('statusText renders compact remaining percentages', () => {
  const both = [
    { short: '5h', remainingPercent: 82, usedPercent: 18 },
    { short: 'W', remainingPercent: 61, usedPercent: 39 },
  ];
  assert.equal(quota.statusText(both), '5h 82% · W 61%');
  const weekOnly = [{ short: 'W', remainingPercent: 61, usedPercent: 39 }];
  assert.equal(quota.statusText(weekOnly), 'W 61%');
  const unidentified = [{ short: '', remainingPercent: 61, usedPercent: 39 }];
  assert.equal(quota.statusText(unidentified), '61%');
});

test('tooltipText includes details, staleness, and last refresh time', () => {
  const parsed = {
    windows: [
      {
        kind: '5h',
        label: '5-hour',
        short: '5h',
        usedPercent: 18,
        remainingPercent: 82,
        resetAt: new Date(Date.UTC(2026, 7, 21, 12, 0, 0)),
        windowMinutes: 300,
      },
    ],
    planType: 'plus',
    resetCreditsAvailable: 0,
  };
  const fetchedAt = new Date(Date.UTC(2026, 7, 21, 8, 18, 0, 0));
  const tip = quota.tooltipText(parsed, fetchedAt, null);
  assert.match(tip, /Codex quota/);
  assert.match(tip, /Plan: plus/);
  assert.match(tip, /5-hour/);
  assert.match(tip, /Remaining: 82%/);
  assert.match(tip, /Used: 18%/);
  assert.match(tip, /Resets: /);
  assert.match(tip, /Last refreshed: /);

  const stale = quota.tooltipText(parsed, fetchedAt, 'Codex app-server did not respond in time.');
  assert.match(stale, /Last refresh failed: /);
  assert.match(stale, /may be stale/);

  const withCredits = quota.tooltipText(
    Object.assign({}, parsed, { resetCreditsAvailable: 2 }),
    fetchedAt,
    null
  );
  assert.match(withCredits, /Reset credits available: 2/);
});
