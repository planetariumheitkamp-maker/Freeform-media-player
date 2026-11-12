import { describe, expect, it } from 'vitest';
import { isMainWindowFrame } from '../../electron/windowSecurity.js';

function fakeWindow({
  windowDestroyed = false,
  contentsDestroyed = false,
  frameDestroyed = false,
  frameId = 11,
} = {}) {
  const mainFrame = {
    frameTreeNodeId: 11,
    isDestroyed: () => frameDestroyed,
  };
  const webContents = {
    mainFrame,
    isDestroyed: () => contentsDestroyed,
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

describe('main window frame security', () => {
  it('accepts only the live main frame belonging to the current window', () => {
    const { window, frame } = fakeWindow();
    expect(isMainWindowFrame(frame, window)).toBe(true);
    expect(isMainWindowFrame({ ...frame, frameTreeNodeId: 99 }, window)).toBe(false);
  });

  it('rejects missing, foreign, and destroyed frames or windows', () => {
    const { window, frame } = fakeWindow();
    expect(isMainWindowFrame(null, window)).toBe(false);
    expect(isMainWindowFrame(frame, null)).toBe(false);
    expect(isMainWindowFrame(frame, fakeWindow({ frameDestroyed: true }).window)).toBe(false);
    expect(isMainWindowFrame(fakeWindow({ frameDestroyed: true }).frame, window)).toBe(false);
    expect(isMainWindowFrame(frame, fakeWindow({ contentsDestroyed: true }).window)).toBe(false);
    expect(isMainWindowFrame(frame, fakeWindow({ windowDestroyed: true }).window)).toBe(false);
    expect(isMainWindowFrame(frame, { isDestroyed: () => false } as any)).toBe(false);
  });

  it('fails closed when native browser objects throw', () => {
    const broken = {
      isDestroyed: () => { throw new Error('destroyed native object'); },
    };
    expect(() => isMainWindowFrame(broken as any, broken as any)).not.toThrow();
    expect(isMainWindowFrame(broken as any, broken as any)).toBe(false);
  });
});
