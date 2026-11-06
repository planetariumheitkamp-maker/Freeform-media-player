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
| ONNX Runtime Web | 1.21.0 | MIT | Local WebGPU/WASM execution of the experimental live Real-ESRGAN model |
| cdt2d | 1.0.0 | MIT | Constrained Delaunay triangulation for advanced meshes |
| Lucide React | 1.61.0 | ISC | Interface icons |
| Fontsource Fira Sans | 5.3.0 | SIL OFL 1.1 | Bundled interface font |
| Fontsource Fira Mono | 5.3.0 | SIL OFL 1.1 | Bundled technical and timecode font |

Fira Sans and Fira Mono are distributed under the **SIL Open Font License, Version 1.1**. Their copyright statements and full font license are provided in the `LICENSE` files of `@fontsource/fira-sans` and `@fontsource/fira-mono`. The fonts are bundled locally; Freeform does not request them from a third-party font service.

HLS.js and TypeScript are distributed under the **Apache License, Version 2.0**. Lucide is distributed under the **ISC License**. Packages marked MIT are distributed under the **MIT License**. This summary does not replace the license terms supplied with those works.

## Experimental live AI model and reference implementation

The `prototype/live-ai-enhancement` branch uses tiled Real-ESRGAN inference. Its local worker/scheduler integration was informed by the tiling approach in [NextGenUp](https://github.com/riponcm/nextgenUp), Copyright (c) 2026 Ripon Chandra Malo, MIT License. No NextGenUp application, service, FFmpeg bundle, or model bundle is included.

At first use, the prototype downloads `realesr-general-x4v3.onnx` from `https://huggingface.co/OwlMaster/AllFilesRope/resolve/main/realesr-general-x4v3.onnx`. The expected length is 4,871,181 bytes and the SHA-256 is `09b757accd747d7e423c1d352b3e8f23e77cc5742d04bae958d4eb8082b76fa4`; both are verified before inference. The model is cached locally after verification and is not bundled in the installer. This third-party host does not provide a model card or an independently verified statement of weight licensing. That provenance limitation must not be represented as a license clearance for the weights. Real-ESRGAN's upstream source is Copyright (c) 2021 Xintao Wang, BSD 3-Clause License.

### ONNX Runtime — MIT License

Copyright (c) Microsoft Corporation

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

### NextGenUp — MIT License

Copyright (c) 2026 Ripon Chandra Malo

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

### Real-ESRGAN — BSD 3-Clause License

Copyright (c) 2021, Xintao Wang
All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.
3. Neither the name of the copyright holder nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

## Build and test dependencies

| Package | Locked version | License |
| --- | ---: | --- |
| Vite | 8.3.5 | MIT |
| TypeScript | 7.0.2 | Apache-2.0 |
| Playwright | 1.64.1 | Apache-2.0 |
| Vitest | 5.0.5 | MIT |
| electron-builder | 26.18.0 | MIT |

Additional transitive dependencies are recorded in `package-lock.json`. Their respective license files remain the authoritative notices for those works.
