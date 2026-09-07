"use client";

import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { AdaptiveDpr, PerformanceMonitor } from "@react-three/drei";
import { useState } from "react";
import type { ShaderMaterial } from "three";

/**
 * WebGL version of the ambient hero glow — a desktop-only progressive
 * enhancement over the `.hero-glow` CSS animation, which stays the baseline.
 *
 * SCOPE IS DELIBERATELY TINY: one orthographic camera, one full-bleed quad, one
 * fragment shader. No lights, no models, no post-processing, no loaders. It
 * draws the SAME radial green falloff the CSS gradient does, with a slow
 * domain-warped noise so the light breathes unevenly instead of pulsing on a
 * clock. Restraint is the point — if you can tell at a glance that it's WebGL,
 * it's too much.
 *
 * Never mounted on the recording path: a persistent WebGL context for a
 * 40-minute session, alongside a held wake lock, an STT WebSocket, an
 * AudioWorklet and a dozen backdrop-filter layers, means thermal throttling
 * degrading the one thing that actually matters — audio capture and STT
 * latency. See hero-glow.tsx for the mount gate.
 */

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

// Cheap value noise + two octaves of domain warp. Enough to make the falloff
// wobble organically; nowhere near expensive enough to matter on a GPU.
const FRAG = /* glsl */ `
  precision mediump float;
  varying vec2 vUv;
  uniform float uTime;
  uniform float uAspect;
  uniform vec3  uColor;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  void main() {
    // Aspect-correct so the glow stays circular on wide viewports.
    vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);

    float t = uTime * 0.045;
    vec2 warp = vec2(
      noise(p * 1.6 + vec2(t, 0.0)),
      noise(p * 1.6 + vec2(0.0, t * 1.3))
    ) - 0.5;

    // Slow drift of the centre, matching the CSS keyframe's wander.
    vec2 centre = vec2(sin(t * 0.9) * 0.06, cos(t * 0.7) * 0.05);
    float d = length(p - centre + warp * 0.22);

    // Same falloff shape as the CSS radial-gradient (transparent by ~70%).
    float glow = smoothstep(0.62, 0.0, d);
    glow *= 0.16 + 0.03 * noise(p * 2.2 + t);

    gl_FragColor = vec4(uColor * glow, glow);
  }
`;

function GlowQuad() {
  const mat = useRef<ShaderMaterial>(null);

  // Stable initial uniforms — never re-created, because a new object each
  // render would rebuild the shader program.
  const initialUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uAspect: { value: 1 },
      // #2ECC71, the brand green, in linear-ish 0-1 floats.
      uColor: { value: [0.18, 0.8, 0.44] },
    }),
    []
  );

  useFrame((state, delta) => {
    // Read the uniforms back off the MATERIAL rather than closing over the
    // memoized object. Three owns them once the material is constructed, and
    // mutating a value that was passed into a hook is exactly what the React
    // compiler's immutability rule (correctly) rejects.
    const uniforms = mat.current?.uniforms;
    if (!uniforms) return;
    uniforms.uTime.value += delta;
    uniforms.uAspect.value = state.viewport.aspect;
  });

  return (
    <mesh frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={mat}
        vertexShader={VERT}
        fragmentShader={FRAG}
        uniforms={initialUniforms}
        transparent
        depthWrite={false}
      />
    </mesh>
  );
}

export default function HeroGlow3D() {
  // drei's PerformanceMonitor + AdaptiveDpr do the honest thing on a weaker
  // GPU: drop resolution rather than drop frames. Starts at 1.5x and degrades.
  const [dpr, setDpr] = useState(1.5);

  return (
    <Canvas
      className="absolute inset-0"
      orthographic
      dpr={dpr}
      gl={{ antialias: false, alpha: true, powerPreference: "low-power" }}
      // Nothing moves except a uniform, so there's no scene graph to update
      // beyond the material — but the frameloop must run for the drift.
      style={{ pointerEvents: "none" }}
    >
      <PerformanceMonitor
        onDecline={() => setDpr(1)}
        onIncline={() => setDpr(1.5)}
      />
      <AdaptiveDpr />
      <GlowQuad />
    </Canvas>
  );
}
