'use strict';

// Minimal JSON-RPC client for `codex app-server` over stdio.
// One short-lived child process per read: spawn -> initialize -> initialized
// -> account/rateLimits/read -> terminate. No fs, no network, no credentials.

const { spawn } = require('child_process');
const { version } = require('../package.json');

const DEFAULT_TIMEOUT_MS = 20000;
const SIGKILL_DELAY_MS = 2000;

let activeChild = null; // at most one, prevents overlapping processes

function fail(settled, reject, error) {
  if (settled.done) {
    return;
  }
  settled.done = true;
  reject(error);
}

// Reads rate limits from the official Codex app-server.
// Resolves with the raw JSON-RPC result object, rejects with a classified Error
// (err.reason: 'not-found' | 'not-executable' | 'exited' | 'timeout' |
//  'not-authenticated' | 'rpc' | 'protocol').
function readRateLimits(codexPath, timeoutMs = DEFAULT_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const settled = { done: false };
    let child;
    try {
      child = spawn(codexPath, ['app-server'], { stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (err) {
      reject(Object.assign(new Error(`Failed to start Codex: ${err.message}`), { reason: 'not-found' }));
      return;
    }
    activeChild = child;

    let killTimer = null;
    let cleanedUp = false;
    const pending = new Map(); // id -> handler

    const cleanup = () => {
      if (cleanedUp) {
        return; // settle paths and the exit handler can both get here
      }
      cleanedUp = true;
      if (activeChild === child) {
        activeChild = null;
      }
      pending.clear();
      try {
        child.stdin.end();
      } catch {
        /* already closed */
      }
      try {
        child.kill('SIGTERM');
        killTimer = setTimeout(() => {
          try {
            child.kill('SIGKILL');
          } catch {
            /* already dead */
          }
        }, SIGKILL_DELAY_MS);
        killTimer.unref?.();
      } catch {
        /* already dead */
      }
    };

    const finishOk = (result) => {
      if (settled.done) {
        return;
      }
      settled.done = true;
      cleanup();
      resolve(result);
    };
    const finishErr = (error) => {
      fail(settled, reject, error);
      cleanup();
    };

    const timeout = setTimeout(() => {
      finishErr(Object.assign(new Error('Codex app-server did not respond in time.'), { reason: 'timeout' }));
    }, timeoutMs);
    timeout.unref?.();

    child.on('error', (err) => {
      clearTimeout(timeout);
      if (err && (err.code === 'ENOENT' || err.code === 'notfound')) {
        finishErr(
          Object.assign(new Error(`Codex executable not found: ${codexPath}`), { reason: 'not-found' })
        );
        return;
      }
      finishErr(Object.assign(new Error(`Failed to start Codex: ${err.message}`), { reason: 'not-executable' }));
    });

    child.on('exit', (code, signal) => {
      clearTimeout(timeout);
      clearTimeout(killTimer); // exited on its own; no SIGKILL needed
      finishErr(
        Object.assign(
          new Error(`Codex app-server exited unexpectedly (code ${code === null ? signal : code}).`),
          { reason: 'exited' }
        )
      );
    });

    // Line-buffered stdout: handle partial JSON chunks and multiple lines.
    let buffer = '';
    child.stdout.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      let newlineIndex;
      while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (!line) {
          continue;
        }
        let message;
        try {
          message = JSON.parse(line);
        } catch {
          continue; // not JSON; ignore
        }
        if (message && message.id !== undefined && pending.has(String(message.id))) {
          const handler = pending.get(String(message.id));
          pending.delete(String(message.id));
          handler(message);
        }
        // Notifications and unrelated messages are ignored.
      }
    });

    // Drain stderr so the child never blocks; never parsed as protocol data.
    child.stderr.on('data', () => {});

    // Writing to a child that already exited fails asynchronously (EPIPE) as
    // a stream 'error' event, which the try/catch in send() cannot see. The
    // 'exit' handler reports the failure; swallow the stream error so it is
    // not an uncaught exception in the extension host.
    child.stdin.on('error', () => {});

    const send = (payload) => {
      try {
        child.stdin.write(JSON.stringify(payload) + '\n');
      } catch (err) {
        finishErr(Object.assign(new Error(`Failed to write to Codex app-server: ${err.message}`), { reason: 'protocol' }));
      }
    };

    const request = (id, method, params, onMessage) => {
      pending.set(String(id), onMessage);
      send({ jsonrpc: '2.0', id, method, params });
    };

    request(1, 'initialize', {
      clientInfo: {
        name: 'codex-quota-vscode',
        title: 'Codex Quota',
        version,
      },
      capabilities: { experimentalApi: true },
    }, (message) => {
      if (message.error) {
        finishErr(Object.assign(new Error('Codex initialization failed.'), { reason: 'rpc' }));
        return;
      }
      send({ jsonrpc: '2.0', method: 'initialized' });
      request(2, 'account/rateLimits/read', null, (msg) => {
        clearTimeout(timeout);
        if (msg.error) {
          const text = String(msg.error.message || '');
          const notAuthenticated =
            /not (logged|signed) in|unauthori[sz]ed|unauthenticated|authenticat\w* (required|failed)|login required|credential/i.test(
              text
            );
          finishErr(
            Object.assign(new Error('Codex rate-limit request failed.'), {
              reason: notAuthenticated ? 'not-authenticated' : 'rpc',
            })
          );
          return;
        }
        finishOk(msg.result);
      });
    });
  });
}

// Kill any in-flight child process (used on deactivate). Never throws.
function disposeAll() {
  if (activeChild) {
    try {
      activeChild.kill('SIGKILL');
    } catch {
      /* already dead */
    }
    activeChild = null;
  }
}

module.exports = { readRateLimits, disposeAll };
