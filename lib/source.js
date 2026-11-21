'use strict';

// How cli.js and mcp.js read the Codex quota outside VS Code: from the local
// `codex app-server`. CODEX_BIN selects the executable (default `codex` on
// PATH).

const appserver = require('./appserver');
const quota = require('./quota');

async function load() {
  const result = await appserver.readRateLimits(process.env.CODEX_BIN || 'codex');
  const parsed = quota.parseRateLimitResponse(result);
  if (!parsed) {
    throw Object.assign(new Error('rate-limit information unavailable'), { reason: 'unavailable' });
  }
  return { parsed };
}

module.exports = {
  provider: 'codex',
  load,
  extra: (parsed) => ({ resetCreditsAvailable: parsed.resetCreditsAvailable }),
  helpExtra: 'Environment: CODEX_BIN (default codex).',
  dispose: () => appserver.disposeAll(),
};
