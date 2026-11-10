import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('desktop content security policy', () => {
  it('allows authorized local files to load as image textures', () => {
    const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
    const policy = html.match(/Content-Security-Policy" content="([^"]+)"/)?.[1];
    expect(policy).toBeTruthy();
    expect(policy).toMatch(/img-src[^;]*freeform-media:/);
  });

  it('permits only HTTPS frames, with validation enforced by the source workflow', () => {
    const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
    const policy = html.match(/Content-Security-Policy" content="([^"]+)"/)?.[1] ?? '';
    const frameSource = policy.split(';').map((directive) => directive.trim()).find((directive) => directive.startsWith('frame-src '));
    expect(frameSource).toBe('frame-src https:');
    expect(frameSource).not.toContain('http:');
    expect(frameSource).not.toContain('*');
  });
});
