import { describe, expect, it } from 'vitest';
import {
  currentAgent,
  describeHttpAgent,
  runWithAgent,
  sanitizeAgent,
  setProcessAgent,
} from '../src/agent-context.js';

describe('describeHttpAgent', () => {
  it('passes the User-Agent through', () => {
    expect(describeHttpAgent('openai-mcp/1.0.0', {})).toBe('openai-mcp/1.0.0');
    expect(describeHttpAgent('Claude-User', undefined)).toBe('Claude-User');
  });

  it('marks ChatGPT tool calls from their openai/* _meta keys', () => {
    const body = { params: { _meta: { 'openai/locale': 'de-AT' } } };
    expect(describeHttpAgent('node', body)).toBe('chatgpt node');
    expect(describeHttpAgent(undefined, body)).toBe('chatgpt');
    expect(describeHttpAgent('openai-mcp/1.0.0', body)).toBe('openai-mcp/1.0.0');
  });

  it('returns undefined when nothing identifies the caller', () => {
    expect(describeHttpAgent(undefined, {})).toBeUndefined();
    expect(describeHttpAgent('   ', null)).toBeUndefined();
  });
});

describe('sanitizeAgent', () => {
  it('drops non-printable characters and caps the length', () => {
    expect(sanitizeAgent('a\nbéc')).toBe('abc');
    expect(sanitizeAgent('x'.repeat(500))).toHaveLength(200);
    expect(sanitizeAgent(42)).toBeUndefined();
  });
});

describe('currentAgent', () => {
  it('prefers the request-scoped agent over the process default', async () => {
    setProcessAgent('cursor/1.0');
    expect(currentAgent()).toBe('cursor/1.0');
    await runWithAgent('Claude-User', async () => {
      await Promise.resolve();
      expect(currentAgent()).toBe('Claude-User');
    });
    expect(currentAgent()).toBe('cursor/1.0');
    setProcessAgent(undefined);
  });
});

describe('caller IP', () => {
  it('is scoped to the request and normalised', async () => {
    const { currentCallerIp, normalizeCallerIp } = await import('../src/agent-context.js');
    expect(normalizeCallerIp('::ffff:203.0.113.7')).toBe('203.0.113.7');
    expect(normalizeCallerIp('1.2.3.4, 5.6.7.8')).toBeUndefined();
    expect(normalizeCallerIp(undefined)).toBeUndefined();
    runWithAgent('Claude-User', () => {
      expect(currentCallerIp()).toBe('198.51.100.9');
      expect(currentAgent()).toBe('Claude-User');
    }, '198.51.100.9');
    expect(currentCallerIp()).toBeUndefined();
  });
});
