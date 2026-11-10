import { describe, expect, it } from 'vitest';
import {
  getLiveVidqueenFrame,
  getPlayerCaptureStreams,
  isBuiltInProviderEmbedUrl,
  isBuiltInProviderPlaybackUrl,
  isMainWindowFrame,
  isVidqueenEmbedUrl,
  isVidqueenPlaybackUrl,
} from '../../electron/providerCaptureRules.js';

const variants = ['artplayer', 'vidstack', 'plyr', 'videojs', 'mediachrome', 'mc-capsule', 'mc-slate', 'onyx'];

function fakeWindow({
  windowDestroyed = false,
  contentsDestroyed = false,
  frameDestroyed = false,
  frameId = 11,
  url = 'https://vidqueen.st/embed/movie/603?autoplay=false',
} = {}) {
  const mainFrame = {
    frameTreeNodeId: 11,
    url,
    isDestroyed: () => frameDestroyed,
  };
  const webContents = {
    mainFrame,
    isDestroyed: () => contentsDestroyed,
    getURL: () => url,
  };
  return {
    window: {
      webContents,
      isDestroyed: () => windowDestroyed,
    },
    mainFrame,
    frame: { ...mainFrame, frameTreeNodeId: frameId },
  };
}

const builtInProviders = [
  {
    id: 'vidqueen',
    movie: 'https://vidqueen.st/embed/movie/603?autoplay=false',
    episode: 'https://vidqueen.st/embed/tv/1399/0/1?autoplay=false',
  },
  {
    id: 'vidrift',
    movie: 'https://embed.vidrift.net/embed/movie/603',
    episode: 'https://embed.vidrift.net/embed/tv/1399/0/1',
  },
  {
    id: 'vidbolt',
    movie: 'https://vidbolt.xyz/movie/603?autoPlay=false',
    episode: 'https://vidbolt.xyz/tv/1399/0/1?autoPlay=false',
  },
  {
    id: 'cinezo',
    movie: 'https://player.cinezo.live/embed/movie/603',
    episode: 'https://player.cinezo.live/embed/tv/1399/0/1',
  },
  {
    id: 'vidlink',
    movie: 'https://vidlink.pro/movie/603?autoplay=false',
    episode: 'https://vidlink.pro/tv/1399/0/1?autoplay=false',
  },
];

describe('built-in provider capture rules', () => {
  it.each(builtInProviders)('accepts documented $id movie and episode URLs', ({ id, movie, episode }) => {
    expect(isBuiltInProviderEmbedUrl(id, movie)).toBe(true);
    expect(isBuiltInProviderEmbedUrl(id, episode)).toBe(true);
    expect(isBuiltInProviderPlaybackUrl(id, movie)).toBe(true);
    expect(isBuiltInProviderPlaybackUrl(id, episode)).toBe(true);
  });

  it.each(builtInProviders)('rejects ambiguous or unauthorized $id embeds', ({ id, movie }) => {
    const parsed = new URL(movie);
    const wrongOrigin = new URL(movie);
    wrongOrigin.hostname = 'evil.example';
    const wrongPath = new URL(movie);
    wrongPath.pathname = '/watch/movie/603';
    const missingAutoplay = new URL(movie);
    missingAutoplay.search = '';
    const extraParameter = new URL(movie);
    extraParameter.searchParams.set('unexpected', '1');
    expect(isBuiltInProviderEmbedUrl(id, wrongOrigin.toString())).toBe(false);
    expect(isBuiltInProviderEmbedUrl(id, wrongPath.toString())).toBe(false);
    expect(isBuiltInProviderEmbedUrl(id, `${movie}#fragment`)).toBe(false);
    expect(isBuiltInProviderEmbedUrl(id, extraParameter.toString())).toBe(false);
    expect(isBuiltInProviderEmbedUrl(id, parsed.toString().replace('https:', 'http:'))).toBe(false);
    expect(isBuiltInProviderEmbedUrl(id, movie.replace('https://', 'https://user:password@'))).toBe(false);
    expect(isBuiltInProviderEmbedUrl(id, missingAutoplay.toString())).toBe(!/autoplay=false/i.test(movie));
    expect(isBuiltInProviderEmbedUrl(id, 'not a URL')).toBe(false);
    expect(isBuiltInProviderEmbedUrl('unknown-provider', movie)).toBe(false);
    expect(isBuiltInProviderPlaybackUrl(id, wrongOrigin.toString())).toBe(false);
  });
});

describe('Vidqueen visible-window capture rules', () => {
  it('accepts only documented movie and episode embeds with autoplay disabled', () => {
    expect(isVidqueenEmbedUrl('https://vidqueen.st/embed/movie/603?autoplay=false')).toBe(true);
    expect(isVidqueenEmbedUrl('https://vidqueen.st/embed/tv/1399/0/1?autoplay=false')).toBe(true);
    expect(isVidqueenPlaybackUrl('https://vidqueen.st/embed/movie/603?autoplay=true&next=player')).toBe(true);
  });

  it.each(variants)('accepts the documented %s player variant', (player) => {
    expect(isVidqueenEmbedUrl(`https://vidqueen.st/embed/movie/603?autoplay=false&player=${player}`)).toBe(true);
  });

  it.each([
    'http://vidqueen.st/embed/movie/603?autoplay=false',
    'https://vidqueen.st.evil.example/embed/movie/603?autoplay=false',
    'https://evil.example/embed/movie/603?autoplay=false',
    'https://user:password@vidqueen.st/embed/movie/603?autoplay=false',
    'https://vidqueen.st/watch/movie/603?autoplay=false',
    'https://vidqueen.st/embed/movie/not-a-number?autoplay=false',
    'https://vidqueen.st/embed/movie/603',
    'https://vidqueen.st/embed/movie/603?autoplay=true',
    'https://vidqueen.st/embed/movie/603?autoplay=false&player=unknown',
    'https://vidqueen.st/embed/movie/603?autoplay=false&unexpected=1',
    'https://vidqueen.st/embed/movie/603?autoplay=false&autoplay=false',
    'https://vidqueen.st/embed/movie/603?autoplay=false#fragment',
    'not a URL',
    null,
  ])('rejects an unauthorized or ambiguous embed URL: %s', (url) => {
    expect(isVidqueenEmbedUrl(url)).toBe(false);
  });

  it('requires the live identity of the Freeform main frame', () => {
    const { window, frame } = fakeWindow();
    expect(isMainWindowFrame(frame, window)).toBe(true);
    expect(isMainWindowFrame({ ...frame, frameTreeNodeId: 99 }, window)).toBe(false);
    expect(isMainWindowFrame(frame, fakeWindow({ frameDestroyed: true }).window)).toBe(false);
    expect(isMainWindowFrame(fakeWindow({ frameDestroyed: true }).frame, window)).toBe(false);
    expect(isMainWindowFrame(frame, fakeWindow({ contentsDestroyed: true }).window)).toBe(false);
    expect(isMainWindowFrame(frame, fakeWindow({ windowDestroyed: true }).window)).toBe(false);
    expect(isMainWindowFrame(null, window)).toBe(false);
    expect(isMainWindowFrame(frame, null)).toBe(false);
  });

  it('returns only a live Vidqueen provider main frame', () => {
    const valid = fakeWindow();
    expect(getLiveVidqueenFrame(valid.window)).toBe(valid.mainFrame);
    expect(getLiveVidqueenFrame(fakeWindow({ frameDestroyed: true }).window)).toBeNull();
    expect(getLiveVidqueenFrame(fakeWindow({ contentsDestroyed: true }).window)).toBeNull();
    expect(getLiveVidqueenFrame(fakeWindow({ windowDestroyed: true }).window)).toBeNull();
    expect(getLiveVidqueenFrame(fakeWindow({ url: 'https://example.com/embed/movie/603' }).window)).toBeNull();
    expect(getLiveVidqueenFrame(null)).toBeNull();
  });

  it('uses only source-player audio for capture and preserves local playback', () => {
    const frame = { frameTreeNodeId: 41, url: 'https://example.com/player' };
    const capture = getPlayerCaptureStreams(frame, true);
    expect(capture.video).toBe(frame);
    expect(capture.audio).toBe(frame);
    expect(capture.audio).not.toBe('loopback');
    expect(capture.audio).not.toBe('loopbackWithMute');
    expect(capture.enableLocalEcho).toBe(true);
    expect(getPlayerCaptureStreams(frame, false)).toEqual({ video: frame });
  });

  it('fails closed when browser objects throw during validation', () => {
    const broken = {
      isDestroyed: () => { throw new Error('destroyed native object'); },
    };
    expect(() => isMainWindowFrame(broken as any, broken as any)).not.toThrow();
    expect(isMainWindowFrame(broken as any, broken as any)).toBe(false);
    expect(getLiveVidqueenFrame(broken as any)).toBeNull();
  });
});
