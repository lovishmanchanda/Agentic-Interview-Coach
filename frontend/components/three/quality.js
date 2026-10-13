/**
 * How much the room asks of this device, decided once when the canvas starts (before the first frame), so a
 * weak GPU never has to stutter until the frame-rate watcher (pace.js) catches up.
 *
 *   high    everything: bloom + tone mapping with 4× MSAA, 2048 px spotlight shadows, every lamp casts shadows
 *   medium  the same look, cheaper: no MSAA, 1024 px shadows, resolution capped at 1.25×
 *   low     no post-processing (tone mapping moves to the renderer), only VERA's spotlight casts shadows,
 *           less dust, resolution capped at 1×
 *
 * Read from what WebGL says the GPU is, plus CPU cores and memory. No benchmark download, no third party.
 */
export const QUALITY = {
  high: { effects: true, multisampling: 4, spotShadow: 2048, lampShadows: true, dust: 180, maxDpr: 1.5 },
  medium: { effects: true, multisampling: 0, spotShadow: 1024, lampShadows: true, dust: 120, maxDpr: 1.25 },
  low: { effects: false, multisampling: 0, spotShadow: 1024, lampShadows: false, dust: 50, maxDpr: 1 },
};

const SOFTWARE = /swiftshader|llvmpipe|softpipe|software|microsoft basic render/i;
const WEAK = /mali-[4t]|mali-g(31|51|52|57)|adreno \(tm\) [3-5]\d\d|powervr|intel.*(hd graphics [2-5]\d{2,3}|gma)|videocore/i;
const STRONG = /apple (m\d|gpu)|nvidia|geforce|rtx|radeon (rx|pro)|adreno \(tm\) (6[4-9]\d|7\d\d)|mali-g7[1-9]/i;

/**
 * The tier for a device. `renderer` is WebGL's unmasked renderer string (may be empty when hidden),
 * `cores` navigator.hardwareConcurrency, `memory` navigator.deviceMemory in GB (Chrome only), `mobile` a phone
 * or tablet, `width` the screen width in px.
 */
export function qualityTier({ renderer = "", cores = 8, memory, mobile = false, width = 1440 } = {}) {
  if (SOFTWARE.test(renderer)) return "low";
  if (WEAK.test(renderer)) return "low";
  if ((memory !== undefined && memory <= 2) || cores <= 2) return "low";
  const strong = STRONG.test(renderer);
  if (mobile || width < 640 || (memory !== undefined && memory <= 4) || cores <= 4) return "medium";
  return strong || !renderer ? "high" : "medium";
}

/** The renderer string WebGL reports for this context (empty if the browser hides it). */
export function rendererOf(gl) {
  try {
    const context = gl.getContext();
    const info = context.getExtension("WEBGL_debug_renderer_info");
    return String(info ? context.getParameter(info.UNMASKED_RENDERER_WEBGL) : context.getParameter(context.RENDERER));
  } catch {
    return "";
  }
}

/** Without post-processing, the renderer does the filmic tone mapping the Effects pass would have done. */
export function applyQuality(gl, quality, THREE) {
  if (quality.effects) return;
  gl.toneMapping = THREE.ACESFilmicToneMapping;
  gl.toneMappingExposure = 1;
}

/** The tier for the device running this renderer. */
export function detectQuality(gl) {
  const nav = typeof navigator === "undefined" ? {} : navigator;
  return qualityTier({
    renderer: rendererOf(gl),
    cores: nav.hardwareConcurrency || 8,
    memory: nav.deviceMemory,
    mobile: typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches,
    width: typeof window !== "undefined" ? window.screen?.width || window.innerWidth : 1440,
  });
}
