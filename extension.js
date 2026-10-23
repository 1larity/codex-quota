'use strict';

const vscode = require('vscode');
const appserver = require('./lib/appserver');
const codexPath = require('./lib/codex-path');
const { createMonitor } = require('./lib/monitor');
const quota = require('./lib/quota');

const USAGE_URL = 'https://chatgpt.com/codex/settings/usage';

function getCodexPath() {
  const configuredPath = vscode.workspace.getConfiguration('codexQuota').get('codexPath');
  const chatgptExtension = vscode.extensions.getExtension('openai.chatgpt');
  return codexPath.resolveCodexPath({
    configuredPath,
    extensionPath: chatgptExtension && chatgptExtension.extensionPath,
  });
}

function friendlyError(error) {
  switch (error && error.reason) {
    case 'not-found':
      return "Codex executable not found.\nSet codexQuota.codexPath or ensure Codex is on VS Code's PATH.";
    case 'not-executable':
      return `Codex executable could not be started: ${error.message}`;
    case 'not-authenticated':
      return "Codex is not logged in.\nRun 'codex login' in a terminal, then refresh.";
    case 'timeout':
      return 'Codex app-server did not respond in time.';
    case 'exited':
      return error.message;
    default:
      return `Codex quota unavailable: ${(error && error.message) || 'unknown error'}`;
  }
}

async function load() {
  const result = await appserver.readRateLimits(getCodexPath());
  const parsed = quota.parseRateLimitResponse(result);
  if (!parsed) {
    throw Object.assign(new Error('rate-limit information unavailable'), { reason: 'unavailable' });
  }
  return { parsed, summary: `windows=${parsed.windows.length}` };
}

function activate(context) {
  createMonitor(vscode, context, {
    section: 'codexQuota',
    name: 'Codex Quota',
    label: 'Codex',
    icon: '$(pulse)',
    priority: 50,
    usageUrl: USAGE_URL,
    load,
    statusText: (parsed) => quota.statusText(parsed.windows),
    tooltip: quota.tooltipText,
    friendlyError,
    credentialReasons: ['not-authenticated'],
  });
}

function deactivate() {
  appserver.disposeAll();
}

module.exports = { activate, deactivate };
