import { afterEach, describe, expect, it } from 'vitest';
import { runWithAgent } from '../src/agent-context.js';
import { callerHeaders } from '../src/api-client.js';
import { config } from '../src/config.js';

describe('callerHeaders', () => {
  const original = config.backendForwardSecret;
  afterEach(() => {
    config.backendForwardSecret = original;
  });

  it('forwards the caller IP with the shared secret', () => {
    config.backendForwardSecret = 'fwd';
    runWithAgent('x', () => {
      expect(callerHeaders()).toEqual({
        'x-wasmachen-caller-ip': '203.0.113.7',
        'x-wasmachen-forward-secret': 'fwd',
      });
    }, '203.0.113.7');
  });

  it('sends nothing without a secret or outside a request', () => {
    config.backendForwardSecret = '';
    runWithAgent('x', () => expect(callerHeaders()).toEqual({}), '203.0.113.7');
    config.backendForwardSecret = 'fwd';
    expect(callerHeaders()).toEqual({});
  });
});
