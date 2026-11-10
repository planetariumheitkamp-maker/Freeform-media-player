import { describe, expect, it, vi } from 'vitest';
import { createPlayer } from '../../src/data/defaults';
import { parseProject, serializeProject } from '../../src/lib/project';
import { sourceFromProviderCapture } from '../../src/lib/sourceActions';

vi.mock('../../src/lib/runtime', () => ({
  captureDesktop: vi.fn(),
  captureDevice: vi.fn(),
  captureProvider: vi.fn(),
}));

describe('custom capture workspace persistence', () => {
  it('retains custom provider metadata but not the temporary capture ID', () => {
    const source = {
      ...sourceFromProviderCapture({
        captureId: 'ephemeral-custom-window-id',
        url: 'https://player.example.com/embed/42',
        label: 'Calibration player',
        providerKind: 'custom',
        providerName: 'Custom player',
      }),
      connected: true,
    };
    expect(source).toMatchObject({
      name: 'Custom player — Calibration player',
      providerKind: 'custom',
      providerName: 'Custom player',
    });
    const content = serializeProject({
      projectName: 'Custom source test',
      sources: [source],
      players: [createPlayer(1, source.id)],
      groups: [],
    });
    expect(content).not.toContain('ephemeral-custom-window-id');
    const restored = parseProject(content).sources[0];
    expect(restored).toMatchObject({
      providerKind: 'custom',
      providerName: 'Custom player',
      providerUrl: 'https://player.example.com/embed/42',
      connected: false,
    });
    expect(restored.detail).toContain('Sources → Custom');
  });

  it('rejects unknown provider kinds when loading a workspace', () => {
    const source = sourceFromProviderCapture({
      captureId: 'custom-id',
      url: 'https://player.example.com',
      label: 'Example',
      providerKind: 'custom',
    });
    const project = JSON.parse(serializeProject({ projectName: 'Invalid provider', sources: [source], players: [], groups: [] }));
    project.sources[0].providerKind = 'arbitrary-script-provider';
    expect(() => parseProject(JSON.stringify(project))).toThrow('invalid media source');
  });
});
