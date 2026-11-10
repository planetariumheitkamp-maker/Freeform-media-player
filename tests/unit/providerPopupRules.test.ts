import { describe, expect, it } from 'vitest';
import {
  isVidriftPopupCapabilityProbe,
  VIDRIFT_POPUP_PROBE_FEATURES,
} from '../../electron/providerPopupRules.js';

const probe = {
  url: 'about:blank',
  // Electron normalizes the special `_blank` target to an empty frameName.
  frameName: '',
  features: VIDRIFT_POPUP_PROBE_FEATURES,
  disposition: 'new-window',
};

describe('Vidrift popup capability compatibility', () => {
  it('accepts the exact native request observed from Vidrift', () => {
    expect(isVidriftPopupCapabilityProbe('vidrift', probe)).toBe(true);
    expect(isVidriftPopupCapabilityProbe('vidrift', { ...probe, url: '' })).toBe(true);
  });

  it.each([
    ['another provider', 'vidqueen', {}],
    ['an unknown provider', 'custom', {}],
    ['an external URL', 'vidrift', { url: 'https://example.com/ad' }],
    ['a Vidrift page URL', 'vidrift', { url: 'https://embed.vidrift.net/embed/movie/1368337' }],
    ['a named window', 'vidrift', { frameName: 'advertisement' }],
    ['a non-normalized target', 'vidrift', { frameName: '_blank' }],
    ['missing features', 'vidrift', { features: '' }],
    ['additional features', 'vidrift', { features: `${VIDRIFT_POPUP_PROBE_FEATURES},noopener` }],
    ['reordered features', 'vidrift', { features: 'height=1,width=1,left=-9999,top=-9999' }],
    ['a link instead of a new window', 'vidrift', { disposition: 'foreground-tab' }],
    ['a missing disposition', 'vidrift', { disposition: undefined }],
  ])('denies %s', (_label, providerId, changes) => {
    expect(isVidriftPopupCapabilityProbe(providerId, { ...probe, ...changes })).toBe(false);
  });

  it('fails closed for absent or malformed details', () => {
    expect(isVidriftPopupCapabilityProbe('vidrift', null)).toBe(false);
    expect(isVidriftPopupCapabilityProbe('vidrift', undefined)).toBe(false);
    expect(isVidriftPopupCapabilityProbe('vidrift', {})).toBe(false);
    expect(isVidriftPopupCapabilityProbe(null, probe)).toBe(false);
  });
});
