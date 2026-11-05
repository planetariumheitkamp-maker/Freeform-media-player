import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('desktop content security policy', () => {
  it('allows authorized local files to load as image textures', () => {
    const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
    const policy = html.match(/Content-Security-Policy" content="([^"]+)"/)?.[1];
    expect(policy).toBeTruthy();
    expect(policy).toMatch(/img-src[^;]*freeform-media:/);
  });
});
