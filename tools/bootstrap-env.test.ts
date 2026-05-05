/**
 * S1 L4 — bootstrap-env tests (pure functions).
 *
 * Coverage focus per the S1 doctrine: Q3 accepted 50-60% coverage on
 * scripts with heavy I/O (filesystem, prompt). The pure helpers below
 * own 100% of the logic that decides what to write — the IO orchestration
 * is exercised by the ultimate fresh-machine test (L10).
 *
 * Runner: node:test (built-in since Node 18). Run via:
 *   pnpm exec tsx --test tools/bootstrap-env.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseEnv,
  setEnvValue,
  getEnvValue,
  isPlaceholderSecret,
  generateSecret,
  rewriteDatabaseUrlHost,
  rewriteDatabaseUrlPassword,
} from './bootstrap-env.js';

describe('parseEnv', () => {
  it('preserves blank and comment lines as null-key entries', () => {
    const lines = parseEnv('# top\n\nFOO=bar\n# trailing\n');
    assert.equal(lines.length, 5);
    assert.deepEqual(lines[0], { key: null, value: '', raw: '# top' });
    assert.deepEqual(lines[1], { key: null, value: '', raw: '' });
    assert.deepEqual(lines[2], { key: 'FOO', value: 'bar', raw: 'FOO=bar' });
    assert.deepEqual(lines[3], { key: null, value: '', raw: '# trailing' });
    assert.deepEqual(lines[4], { key: null, value: '', raw: '' });
  });

  it('captures values with embedded equals signs verbatim', () => {
    const lines = parseEnv('DATABASE_URL=postgres://user:pass=word@host/db');
    assert.equal(lines[0]?.key, 'DATABASE_URL');
    assert.equal(lines[0]?.value, 'postgres://user:pass=word@host/db');
  });

  it('handles CRLF line endings', () => {
    const lines = parseEnv('A=1\r\nB=2\r\n');
    const meaningful = lines.filter((l) => l.key !== null);
    assert.equal(meaningful.length, 2);
  });

  it('treats lines without an = as blank/comment-equivalent', () => {
    const lines = parseEnv('lonely_token\nNORMAL=v');
    assert.equal(lines[0]?.key, null);
    assert.equal(lines[1]?.key, 'NORMAL');
  });
});

describe('getEnvValue', () => {
  const lines = parseEnv('FOO=bar\nBAZ=qux');

  it('returns the matching value', () => {
    assert.equal(getEnvValue(lines, 'FOO'), 'bar');
    assert.equal(getEnvValue(lines, 'BAZ'), 'qux');
  });

  it('returns null for missing keys', () => {
    assert.equal(getEnvValue(lines, 'MISSING'), null);
  });
});

describe('setEnvValue', () => {
  it('replaces in place when the key exists, preserving comments', () => {
    const lines = parseEnv('# header\nFOO=old\n# trailer\nBAR=keep');
    const next = setEnvValue(lines, 'FOO', 'new');
    assert.equal(next, '# header\nFOO=new\n# trailer\nBAR=keep\n');
  });

  it('appends a new entry when the key is absent', () => {
    const lines = parseEnv('FOO=bar');
    const next = setEnvValue(lines, 'NEW', 'value');
    assert.equal(next, 'FOO=bar\n\nNEW=value\n');
  });

  it('normalises trailing blank lines to a single newline', () => {
    const lines = parseEnv('FOO=bar\n\n\n');
    const next = setEnvValue(lines, 'FOO', 'baz');
    assert.equal(next, 'FOO=baz\n');
  });

  it('handles values that contain "=" without re-splitting', () => {
    const lines = parseEnv('DATABASE_URL=old');
    const next = setEnvValue(lines, 'DATABASE_URL', 'postgres://u:p@h/d?x=1');
    assert.equal(next, 'DATABASE_URL=postgres://u:p@h/d?x=1\n');
  });
});

describe('isPlaceholderSecret', () => {
  it('treats null and empty as placeholder', () => {
    assert.equal(isPlaceholderSecret(null), true);
    assert.equal(isPlaceholderSecret(''), true);
    assert.equal(isPlaceholderSecret('   '), true);
  });

  it('treats any value containing change_me as placeholder, case-insensitive', () => {
    assert.equal(isPlaceholderSecret('change_me_in_local_env'), true);
    assert.equal(isPlaceholderSecret('CHANGE_ME'), true);
    assert.equal(isPlaceholderSecret('please_change_me_now'), true);
  });

  it('treats genuine secrets as non-placeholder', () => {
    assert.equal(isPlaceholderSecret('aB3xY9zQ=='), false);
    assert.equal(isPlaceholderSecret('a-real-postgres-password'), false);
  });
});

describe('generateSecret', () => {
  it('returns a base64 string of the requested entropy', () => {
    const secret = generateSecret(48);
    assert.equal(typeof secret, 'string');
    // 48 raw bytes -> 64 base64 chars (no padding needed since 48%3==0)
    assert.equal(secret.length, 64);
    // base64 alphabet: A-Z a-z 0-9 + /
    assert.match(secret, /^[A-Za-z0-9+/]+=*$/);
  });

  it('produces distinct values across calls (no static state)', () => {
    const a = generateSecret(24);
    const b = generateSecret(24);
    assert.notEqual(a, b);
  });
});

describe('rewriteDatabaseUrlHost', () => {
  it('rewrites @postgres:port → @localhost:port (canonical compose case)', () => {
    assert.equal(
      rewriteDatabaseUrlHost('postgresql://regalica_app:secret@postgres:5432/regalica'),
      'postgresql://regalica_app:secret@localhost:5432/regalica',
    );
  });

  it('rewrites @postgres/db (no port) → @localhost/db', () => {
    assert.equal(
      rewriteDatabaseUrlHost('postgresql://u:p@postgres/regalica'),
      'postgresql://u:p@localhost/regalica',
    );
  });

  it('is idempotent on already-localhost URLs', () => {
    const url = 'postgresql://u:p@localhost:5432/regalica';
    assert.equal(rewriteDatabaseUrlHost(url), url);
  });

  it('leaves other custom hosts intact (host.docker.internal, prod DSN)', () => {
    assert.equal(
      rewriteDatabaseUrlHost('postgresql://u:p@host.docker.internal:5432/regalica'),
      'postgresql://u:p@host.docker.internal:5432/regalica',
    );
    assert.equal(
      rewriteDatabaseUrlHost('postgresql://u:p@db.prod.internal:5432/regalica'),
      'postgresql://u:p@db.prod.internal:5432/regalica',
    );
  });

  it('does not rewrite the substring "postgres" elsewhere in the URL', () => {
    // Path / query strings that happen to contain "postgres" must not
    // be touched — only the host segment after `@` matters.
    assert.equal(
      rewriteDatabaseUrlHost('postgresql://u:p@db:5432/postgres?sslmode=require'),
      'postgresql://u:p@db:5432/postgres?sslmode=require',
    );
  });
});

describe('rewriteDatabaseUrlPassword', () => {
  it('replaces the password segment between user: and @host', () => {
    assert.equal(
      rewriteDatabaseUrlPassword(
        'postgresql://regalica_app:change_me_in_local_env@postgres:5432/regalica',
        'F1RESHpW=',
      ),
      'postgresql://regalica_app:F1RESHpW=@postgres:5432/regalica',
    );
  });

  it('preserves the rest of the URL (host, port, path, query)', () => {
    assert.equal(
      rewriteDatabaseUrlPassword(
        'postgresql://u:old@db.internal:6543/regalica?sslmode=require',
        'NEW',
      ),
      'postgresql://u:NEW@db.internal:6543/regalica?sslmode=require',
    );
  });

  it('handles passwords containing special characters in the original URL', () => {
    // The producer URL-encodes them, but our regex must still match.
    assert.equal(
      rewriteDatabaseUrlPassword('postgresql://u:abc%40123%2F%3D@host:5432/db', 'plain'),
      'postgresql://u:plain@host:5432/db',
    );
  });

  it('returns the URL unchanged when it does not match the userinfo shape', () => {
    // Missing password segment.
    assert.equal(
      rewriteDatabaseUrlPassword('postgresql://host:5432/db', 'NEW'),
      'postgresql://host:5432/db',
    );
  });

  it('only replaces the userinfo password, not later occurrences in the path', () => {
    assert.equal(
      rewriteDatabaseUrlPassword('postgresql://u:p@h:5432/db?password=p', 'NEW'),
      'postgresql://u:NEW@h:5432/db?password=p',
    );
  });
});
