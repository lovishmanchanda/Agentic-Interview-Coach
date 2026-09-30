import * as THREE from "three";

/**
 * Hand-written shaders for the two "fake volumetric" effects: the visible cone of a spotlight in a dark,
 * slightly hazy room, and the soft pool of light it leaves on the floor or desk. Both are additive and never
 * write depth, so they glow over whatever is behind them. These return ShaderMaterial parameters, used as
 * <shaderMaterial args={[beamParams(...)]} ref={...} />; opacity is then animated through the ref.
 */
export function beamParams(color, opacity) {
  return {
    uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity }, uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      varying float vHeight;
      varying vec3 vNormal;
      varying vec3 vView;
      varying vec3 vLocal;
      void main() {
        vHeight = uv.y; // 1 at the lamp, 0 at the floor
        vLocal = position;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uTime;
      varying float vHeight;
      varying vec3 vNormal;
      varying vec3 vView;
      varying vec3 vLocal;

      // Cheap 3D value noise: the haze drifting slowly through the beam.
      float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      float noise(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
                   mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
      }

      void main() {
        float core = pow(abs(dot(vNormal, vView)), 1.8);  // dense in the middle, soft at the edges
        float fade = mix(0.18, 1.0, smoothstep(0.0, 1.0, vHeight));
        vec3 q = vLocal * vec3(2.2, 0.9, 2.2) + vec3(0.0, -uTime * 0.12, uTime * 0.05);
        float haze = 0.65 * noise(q) + 0.35 * noise(q * 2.3 + 7.0);
        gl_FragColor = vec4(uColor, uOpacity * core * fade * mix(0.55, 1.35, haze));
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  };
}

export function poolParams(color, opacity) {
  return {
    uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying vec2 vUv;
      void main() {
        float d = distance(vUv, vec2(0.5)) * 2.0;
        float falloff = pow(1.0 - smoothstep(0.0, 1.0, d), 2.2);
        gl_FragColor = vec4(uColor, uOpacity * falloff);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  };
}

/** A small seeded random generator, so the scene looks the same on every load (and renders stay pure). */
export function seededRandom(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export const VERA_LIGHT = "#e6ecf5"; // the spotlight: cool steel-white
export const ARIA_LIGHT = "#ff7a2e"; // the desk lamp: the brand orange
