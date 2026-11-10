import * as THREE from 'three';
import type { PresentAmbientSettings } from '../types';

const VERTEX_SHADER = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const BLUR_SHADER = `
  uniform sampler2D tInput;
  uniform vec2 uDirection;
  varying vec2 vUv;
  void main() {
    vec4 color = texture2D(tInput, vUv) * 0.227027;
    color += texture2D(tInput, vUv + uDirection * 1.384615) * 0.316216;
    color += texture2D(tInput, vUv - uDirection * 1.384615) * 0.316216;
    color += texture2D(tInput, vUv + uDirection * 3.230769) * 0.070270;
    color += texture2D(tInput, vUv - uDirection * 3.230769) * 0.070270;
    gl_FragColor = color;
  }
`;

const AVERAGE_SHADER = `
  uniform sampler2D tInput;
  varying vec2 vUv;
  void main() {
    vec3 color = vec3(0.0);
    float weight = 0.0;
    for (int y = 0; y < 16; y++) {
      for (int x = 0; x < 16; x++) {
        vec2 sampleUv = (vec2(float(x), float(y)) + 0.5) / 16.0;
        vec4 sampleColor = texture2D(tInput, sampleUv);
        color += sampleColor.rgb * sampleColor.a;
        weight += sampleColor.a;
      }
    }
    gl_FragColor = vec4(color / max(weight, 0.00001), 1.0);
  }
`;

const TEMPORAL_SHADER = `
  uniform sampler2D tCurrent;
  uniform sampler2D tPrevious;
  uniform float uBlend;
  varying vec2 vUv;
  void main() {
    gl_FragColor = mix(texture2D(tPrevious, vUv), texture2D(tCurrent, vUv), uBlend);
  }
`;

const COMPOSITE_SHADER = `
  uniform sampler2D tGlow;
  uniform sampler2D tAverage;
  uniform float uIntensity;
  uniform float uAverageStyle;
  varying vec2 vUv;
  void main() {
    vec4 glow = texture2D(tGlow, vUv);
    vec3 average = texture2D(tAverage, vec2(0.5)).rgb;
    vec3 color = mix(glow.rgb, average, uAverageStyle);
    float alpha = clamp(glow.a * uIntensity, 0.0, 0.92);
    gl_FragColor = vec4(color * uIntensity, alpha);
  }
`;

function createTarget(): THREE.WebGLRenderTarget {
  return new THREE.WebGLRenderTarget(1, 1, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    depthBuffer: false,
    stencilBuffer: false,
  });
}

function createMaterial(fragmentShader: string, uniforms: Record<string, THREE.IUniform>): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: VERTEX_SHADER,
    fragmentShader,
    uniforms,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    toneMapped: false,
  });
}

/**
 * Low-resolution, separable GPU bloom with a temporal history. The sharp media
 * pass is rendered separately by the workspace, so blur never softens players.
 */
export function createAmbientPipeline(renderer: THREE.WebGLRenderer) {
  const source = createTarget();
  const blurA = createTarget();
  const blurB = createTarget();
  const historyA = createTarget();
  const historyB = createTarget();
  const average = createTarget();
  let historyRead = historyA;
  let historyWrite = historyB;
  let primed = false;
  let viewportWidth = 1;
  let viewportHeight = 1;

  const blurMaterial = createMaterial(BLUR_SHADER, {
    tInput: { value: null },
    uDirection: { value: new THREE.Vector2() },
  });
  const averageMaterial = createMaterial(AVERAGE_SHADER, {
    tInput: { value: source.texture },
  });
  const temporalMaterial = createMaterial(TEMPORAL_SHADER, {
    tCurrent: { value: blurB.texture },
    tPrevious: { value: historyRead.texture },
    uBlend: { value: 1 },
  });
  const compositeMaterial = createMaterial(COMPOSITE_SHADER, {
    tGlow: { value: historyRead.texture },
    tAverage: { value: average.texture },
    uIntensity: { value: 1 },
    uAverageStyle: { value: 0 },
  });
  const geometry = new THREE.PlaneGeometry(2, 2);
  const quad = new THREE.Mesh(geometry, blurMaterial);
  const scene = new THREE.Scene();
  scene.add(quad);
  const camera = new THREE.Camera();

  const draw = (material: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null) => {
    quad.material = material;
    renderer.setRenderTarget(target);
    renderer.clear();
    renderer.render(scene, camera);
  };

  const resize = (width: number, height: number) => {
    viewportWidth = Math.max(1, width);
    viewportHeight = Math.max(1, height);
    const scale = Math.min(1, 448 / Math.max(viewportWidth, viewportHeight));
    const targetWidth = Math.max(2, Math.round(viewportWidth * scale));
    const targetHeight = Math.max(2, Math.round(viewportHeight * scale));
    [source, blurA, blurB, historyA, historyB].forEach((target) => target.setSize(targetWidth, targetHeight));
    average.setSize(1, 1);
    primed = false;
  };

  const capture = (
    playerScene: THREE.Scene,
    playerCamera: THREE.Camera,
    settings: PresentAmbientSettings,
    deltaSeconds: number,
  ) => {
    const autoClear = renderer.autoClear;
    renderer.autoClear = true;
    renderer.setClearColor(0x000000, 0);
    renderer.setRenderTarget(source);
    renderer.clear();
    renderer.render(playerScene, playerCamera);

    if (settings.style === 'average') draw(averageMaterial, average);

    const horizontalSpread = settings.spread / (3.230769 * viewportWidth);
    const verticalSpread = settings.spread / (3.230769 * viewportHeight);
    blurMaterial.uniforms.tInput.value = source.texture;
    blurMaterial.uniforms.uDirection.value.set(horizontalSpread, 0);
    draw(blurMaterial, blurA);
    blurMaterial.uniforms.tInput.value = blurA.texture;
    blurMaterial.uniforms.uDirection.value.set(0, verticalSpread);
    draw(blurMaterial, blurB);

    const elapsedFrames = Math.max(0.1, Math.min(8, deltaSeconds * 60));
    temporalMaterial.uniforms.uBlend.value = primed
      ? 1 - Math.pow(settings.smoothing, elapsedFrames)
      : 1;
    temporalMaterial.uniforms.tPrevious.value = historyRead.texture;
    draw(temporalMaterial, historyWrite);
    [historyRead, historyWrite] = [historyWrite, historyRead];
    primed = true;
    renderer.setRenderTarget(null);
    renderer.autoClear = autoClear;
  };

  const composite = (settings: PresentAmbientSettings) => {
    const autoClear = renderer.autoClear;
    compositeMaterial.uniforms.tGlow.value = historyRead.texture;
    compositeMaterial.uniforms.uIntensity.value = settings.intensity;
    compositeMaterial.uniforms.uAverageStyle.value = settings.style === 'average' ? 1 : 0;
    renderer.autoClear = false;
    quad.material = compositeMaterial;
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);
    renderer.autoClear = autoClear;
  };

  const reset = () => {
    primed = false;
  };

  const dispose = () => {
    [source, blurA, blurB, historyA, historyB, average].forEach((target) => target.dispose());
    [blurMaterial, averageMaterial, temporalMaterial, compositeMaterial].forEach((material) => material.dispose());
    geometry.dispose();
  };

  return { capture, composite, resize, reset, dispose };
}
