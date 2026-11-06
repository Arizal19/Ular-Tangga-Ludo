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

function BloomComposer({ strength = 0.75, radius = 0.55, threshold = 0.8 }) {
  const { gl, scene, camera, size } = useThree();

  const composer = useMemo(() => {
    const c = new EffectComposer(gl);
    c.addPass(new RenderPass(scene, camera));
    c.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), strength, radius, threshold));
    c.addPass(new OutputPass()); // tone mapping + sRGB
    return c;
  }, [gl, scene, camera, strength, radius, threshold]);

  useEffect(() => {
    composer.setPixelRatio(gl.getPixelRatio());
    composer.setSize(size.width, size.height);
  }, [composer, gl, size.width, size.height]);

  useEffect(() => () => composer.dispose(), [composer]);

  useFrame((_, delta) => composer.render(delta), 1);
  return null;
}
