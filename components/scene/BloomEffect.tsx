"use client";
/**
 * Emerald glow via three's own UnrealBloomPass (ships with three, so it always
 * matches the installed version). Takes over rendering with useFrame priority 1.
 */
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

/** Software rasterisers (SwiftShader, llvmpipe) render the bloom chain black; skip it there. */
function isSoftwareRenderer(gl: THREE.WebGLRenderer): boolean {
  const ctx = gl.getContext();
  const info = ctx.getExtension("WEBGL_debug_renderer_info");
  const name = String(info ? ctx.getParameter(info.UNMASKED_RENDERER_WEBGL) : ctx.getParameter(ctx.RENDERER));
  return /swiftshader|llvmpipe|software/i.test(name);
}

export function BloomEffect(props: { strength?: number; radius?: number; threshold?: number }) {
  const gl = useThree((s) => s.gl);
  const software = useMemo(() => isSoftwareRenderer(gl), [gl]);
  return software ? null : <BloomComposer {...props} />;
}

// Threshold 0.9: only true emissive glows bloom; lit silver and tile tops stay crisp.
function BloomComposer({ strength = 0.7, radius = 0.5, threshold = 0.9 }) {
  const { gl, scene, camera, size } = useThree();
  const dpr = useThree((s) => s.viewport.dpr);

  const composer = useMemo(() => {
    // 4x MSAA on the offscreen HDR target keeps edges smooth (the canvas itself has antialias off).
    // Only when the GPU can multisample half-float targets; otherwise plain target, never a black frame.
    const ctx = gl.getContext();
    const msaa = gl.capabilities.isWebGL2 && (ctx.getExtension("EXT_color_buffer_float") || ctx.getExtension("EXT_color_buffer_half_float"));
    const target = new THREE.WebGLRenderTarget(size.width, size.height, { type: THREE.HalfFloatType, samples: msaa ? 4 : 0 });
    const c = new EffectComposer(gl, target);
    c.addPass(new RenderPass(scene, camera));
    c.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), strength, radius, threshold));
    c.addPass(new OutputPass()); // tone mapping + sRGB
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, scene, camera, strength, radius, threshold]);

  useEffect(() => {
    composer.setPixelRatio(dpr);
    composer.setSize(size.width, size.height);
  }, [composer, dpr, size.width, size.height]);

  useEffect(() => () => composer.dispose(), [composer]);

  useFrame((_, delta) => composer.render(delta), 1);
  return null;
}
