'use strict';

// Manual protocol smoke test against the real local Codex app-server.
// Uses the exact same code path as the extension (lib/appserver.js + lib/quota.js)
// and prints ONLY sanitized quota fields.

const appserver = require('../lib/appserver.js');
const quota = require('../lib/quota.js');

const codexPath = process.env.CODEX_BIN || 'codex';

(async () => {
  const result = await appserver.readRateLimits(codexPath);
  const parsed = quota.parseRateLimitResponse(result);
  if (!parsed) {
    console.log('SMOKE: app-server responded but contained no usable rate-limit snapshot.');
    process.exit(1);
  }
  console.log('SMOKE: handshake + account/rateLimits/read OK');
  if (parsed.planType) {
    console.log(`  plan: ${parsed.planType}`);
  }
  for (const w of parsed.windows) {
    const parts = [`${w.label || 'window'}: ${w.remainingPercent}% remaining (used ${w.usedPercent}%)`];
    if (w.resetAt) {
      parts.push(`resets ${w.resetAt.toLocaleString()}`);
    }
    console.log(`  - ${parts.join(' — ')}`);
  }
  if (parsed.resetCreditsAvailable !== null) {
    console.log(`  reset credits available: ${parsed.resetCreditsAvailable}`);
  }
  process.exit(0);
})().catch((err) => {
  console.error(`SMOKE FAILED [${err.reason || 'error'}]: ${err.message}`);
  process.exit(1);
});
