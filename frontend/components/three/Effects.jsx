"use client";

import { Bloom, EffectComposer, Noise, ToneMapping, Vignette } from "@react-three/postprocessing";
import { BlendFunction, ToneMappingMode } from "postprocessing";

/**
 * The film look: bloom so the lights and chrome glow, ACES tone mapping (filmic highlights, deep blacks; AgX lifted the blacks to grey), a vignette that
 * pulls the eye to the chair or the desk, and a touch of grain so the blacks don't look digital.
 * (The canvas renders `flat`, untone-mapped, because tone mapping happens here.)
 */
export default function Effects() {
  return (
    <EffectComposer multisampling={4}>
      <Bloom mipmapBlur intensity={0.75} luminanceThreshold={0.92} luminanceSmoothing={0.2} radius={0.7} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <Vignette offset={0.28} darkness={0.78} />
      <Noise premultiply blendFunction={BlendFunction.SOFT_LIGHT} opacity={0.1} />
    </EffectComposer>
  );
}
