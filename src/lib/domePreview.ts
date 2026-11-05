import * as THREE from 'three';
import { domeCenter, domeRadius } from './dome';
import { getRenderQualityPreset } from './quality';
import type { RenderQuality, WorkspaceGridGeometry, WorkspaceOutputSize, WorkspacePlanetariumSettings } from '../types';

const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const fragmentShader = `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uOutput;
  uniform vec2 uOutputSize;
  uniform vec2 uCenter;
  uniform float uRadius;
  uniform float uRotation;
  uniform float uTilt;
  uniform float uTruncation;
  uniform float uFov;
  uniform float uAspect;
  uniform int uModel;

  float radial(float theta) {
    if (uModel == 1) return 2.0 * sin(theta / 2.0);
    if (uModel == 2) return 2.0 * tan(theta / 2.0);
    return theta;
  }

  void main() {
    vec2 ndc = vUv * 2.0 - 1.0;
    vec3 eye = vec3(0.0, -2.6, 1.15);
    vec3 forward = normalize(vec3(0.0, 0.0, 0.35) - eye);
    vec3 right = normalize(cross(forward, vec3(0.0, 0.0, 1.0)));
    vec3 up = cross(right, forward);
    vec3 ray = normalize(forward + right * ndc.x * 0.85 * uAspect + up * ndc.y * 0.85);
    float b = dot(ray, eye);
    float c = dot(eye, eye) - 1.0;
    float discriminant = b * b - c;
    vec3 background = vec3(0.055, 0.063, 0.058);
    if (discriminant < 0.0) { gl_FragColor = vec4(background, 1.0); return; }
    float t = -b - sqrt(discriminant);
    if (t < 0.0) t = -b + sqrt(discriminant);
    if (t < 0.0) { gl_FragColor = vec4(background, 1.0); return; }
    vec3 hit = eye + ray * t;
    if (hit.z < 0.0) { gl_FragColor = vec4(background, 1.0); return; }
    vec3 direction = normalize(hit);
    float ct = cos(uTilt);
    float st = sin(uTilt);
    vec3 tilted = vec3(direction.x, direction.y * ct - direction.z * st, direction.y * st + direction.z * ct);
    float theta = acos(clamp(tilted.z, -1.0, 1.0));
    float azimuth = atan(tilted.y, tilted.x) + uRotation;
    float halfFov = radians(uModel == 2 ? min(uFov, 179.0) : uFov) * 0.5;
    float rho = radial(theta) / radial(halfFov) / (uTruncation / 100.0);
    vec2 outputPoint = uCenter + vec2(cos(azimuth), sin(azimuth)) * uRadius * rho;
    vec2 outputUv = outputPoint / uOutputSize + 0.5;
    vec3 media = vec3(0.025, 0.03, 0.027);
    if (all(greaterThanEqual(outputUv, vec2(0.0))) && all(lessThanEqual(outputUv, vec2(1.0)))) {
      media = texture2D(uOutput, outputUv).rgb;
    }
    float longitude = 1.0 - smoothstep(0.0, 0.045, abs(sin(azimuth * 12.0)));
    float latitude = 1.0 - smoothstep(0.0, 0.045, abs(sin(theta * 12.0)));
    float grid = max(longitude, latitude) * 0.18;
    vec3 color = mix(media, vec3(0.55, 0.72, 0.60), grid);
    float springLine = smoothstep(0.0, 0.035, hit.z);
    color *= mix(0.58, 1.0, springLine);
    gl_FragColor = vec4(color, 1.0);
  }
`;

export function createDomePreview(renderer: THREE.WebGLRenderer) {
  const target = new THREE.WebGLRenderTarget(1024, 1024, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: true,
  });
  target.texture.colorSpace = THREE.SRGBColorSpace;
  const drawingBufferSize = new THREE.Vector2();
  let activeQuality: RenderQuality | undefined;
  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uOutput: { value: target.texture },
      uOutputSize: { value: new THREE.Vector2(1600, 900) },
      uCenter: { value: new THREE.Vector2() },
      uRadius: { value: 400 },
      uRotation: { value: 0 },
      uTilt: { value: 0 },
      uTruncation: { value: 100 },
      uFov: { value: 180 },
      uAspect: { value: 1 },
      uModel: { value: 0 },
    },
  });
  const geometry = new THREE.PlaneGeometry(2, 2);
  const quad = new THREE.Mesh(geometry, material);
  const scene = new THREE.Scene();
  scene.add(quad);
  const camera = new THREE.Camera();

  return {
    render(
      outputScene: THREE.Scene,
      outputCamera: THREE.Camera,
      settings: WorkspacePlanetariumSettings,
      outputSize: WorkspaceOutputSize,
      gridGeometry: WorkspaceGridGeometry,
      aspect: number,
      quality: RenderQuality,
    ) {
      renderer.getDrawingBufferSize(drawingBufferSize);
      if (target.width !== drawingBufferSize.x || target.height !== drawingBufferSize.y) {
        target.setSize(Math.max(1, drawingBufferSize.x), Math.max(1, drawingBufferSize.y));
      }
      if (activeQuality !== quality) {
        activeQuality = quality;
        const preset = getRenderQualityPreset(quality);
        target.texture.minFilter = preset.mipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
        target.texture.generateMipmaps = preset.mipmaps;
        target.texture.anisotropy = Math.min(preset.anisotropy, renderer.capabilities.getMaxAnisotropy());
      }
      const center = domeCenter(outputSize, settings);
      material.uniforms.uOutputSize.value.set(outputSize.width, outputSize.height);
      material.uniforms.uCenter.value.set(center.x, center.y);
      material.uniforms.uRadius.value = domeRadius(outputSize, gridGeometry);
      material.uniforms.uRotation.value = THREE.MathUtils.degToRad(gridGeometry.rotation);
      material.uniforms.uTilt.value = THREE.MathUtils.degToRad(settings.tilt);
      material.uniforms.uTruncation.value = settings.truncation;
      material.uniforms.uFov.value = settings.fov;
      material.uniforms.uAspect.value = aspect;
      material.uniforms.uModel.value = settings.model === 'equisolid' ? 1 : settings.model === 'stereographic' ? 2 : 0;
      renderer.setRenderTarget(target);
      renderer.render(outputScene, outputCamera);
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
    },
    dispose() {
      target.dispose();
      geometry.dispose();
      material.dispose();
    },
  };
}
