# Third-Party Notices

Freeform uses the following major open-source packages. Versions below match `package-lock.json`; compatible updates may change them when the lockfile is regenerated. Each package retains its own copyright and license text in its published package and upstream repository.

## Runtime dependencies

| Package | Locked version | License | Use in Freeform |
| --- | ---: | --- | --- |
| Electron | 45.0.0 | MIT | Cross-platform desktop shell, media authorization, and capture integration |
| React and React DOM | 19.3.1 | MIT | Application interface |
| Three.js | 0.186.1 | MIT | GPU workspace, media textures, and mesh rendering |
| Zustand | 5.0.16 | MIT | Workspace state management |
| HLS.js | 1.7.3 | Apache-2.0 | HLS playback and locally bundled transmux worker |
| cdt2d | 1.0.0 | MIT | Constrained Delaunay triangulation for advanced meshes |
| Lucide React | 1.61.0 | ISC | Interface icons |
| Fontsource Fira Sans | 5.3.0 | SIL OFL 1.1 | Bundled interface font |
| Fontsource Fira Mono | 5.3.0 | SIL OFL 1.1 | Bundled technical and timecode font |

Fira Sans and Fira Mono are distributed under the **SIL Open Font License, Version 1.1**. Their copyright statements and full font license are provided in the `LICENSE` files of `@fontsource/fira-sans` and `@fontsource/fira-mono`. The fonts are bundled locally; Freeform does not request them from a third-party font service.

HLS.js and TypeScript are distributed under the **Apache License, Version 2.0**. Lucide is distributed under the **ISC License**. Packages marked MIT are distributed under the **MIT License**. This summary does not replace the license terms supplied with those works.

## Build and test dependencies

| Package | Locked version | License |
| --- | ---: | --- |
| Vite | 8.3.5 | MIT |
| TypeScript | 7.0.2 | Apache-2.0 |
| Playwright | 1.64.1 | Apache-2.0 |
| Vitest | 5.0.5 | MIT |
| electron-builder | 26.18.0 | MIT |

Additional transitive dependencies are recorded in `package-lock.json`. Their respective license files remain the authoritative notices for those works.
