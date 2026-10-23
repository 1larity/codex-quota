'use strict';

const fs = require('fs');
const path = require('path');

function platformDirectory(platform = process.platform, arch = process.arch) {
  const platformName = { win32: 'win32', darwin: 'darwin', linux: 'linux' }[platform] || platform;
  const archName = { x64: 'x86_64', arm64: 'aarch64', arm: 'arm' }[arch] || arch;
  return `${platformName}-${archName}`;
}

function isExecutable(candidate, accessSync = fs.accessSync) {
  try {
    accessSync(candidate, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

// Resolve the bundled Codex CLI from the installed ChatGPT extension before
// falling back to PATH. The extension directory changes on every update, but
// VS Code exposes the current one through its extension registry.
function resolveCodexPath(options = {}) {
  const configuredPath = typeof options.configuredPath === 'string' ? options.configuredPath.trim() : '';
  const defaultPath = options.defaultPath || 'codex';
  if (configuredPath && configuredPath !== defaultPath) {
    return configuredPath;
  }

  const extensionPath = options.extensionPath;
  if (extensionPath) {
    const platform = options.platform || process.platform;
    const executable = path.join(
      extensionPath,
      'bin',
      platformDirectory(platform, options.arch),
      platform === 'win32' ? 'codex.exe' : 'codex'
    );
    if (isExecutable(executable, options.accessSync)) {
      return executable;
    }
  }

  return configuredPath || defaultPath;
}

module.exports = { platformDirectory, resolveCodexPath };
