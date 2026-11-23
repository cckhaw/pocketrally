import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import type { QualityPreset } from '../core/quality'

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uBoost: { value: 0 },
    uVignette: { value: 0.35 },
    uSaturation: { value: 1 },
    uContrast: { value: 1 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uBoost;
    uniform float uVignette;
    uniform float uSaturation;
    uniform float uContrast;
    varying vec2 vUv;
    void main() {
      vec2 c = vUv - 0.5;
      float r = length(c);
      vec3 col = texture2D(tDiffuse, vUv).rgb;
      if (uBoost > 0.01) {
        // radial blur toward the screen centre, stronger near the edges
        vec3 acc = col;
        float strength = uBoost * 0.06 * smoothstep(0.1, 0.7, r);
        for (int i = 1; i < 6; i++) {
          acc += texture2D(tDiffuse, vUv - c * strength * float(i)).rgb;
        }
        col = acc / 6.0;
      }
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(l), col, uSaturation);
      col = (col - 0.5) * uContrast + 0.5;
      float v = smoothstep(0.85, 0.25, r * (1.0 + uVignette));
      col *= mix(1.0 - uVignette, 1.0, v);
      gl_FragColor = vec4(col, 1.0);
    }`,
}

/** Bloom, vignette, radial boost blur and colour grade. No SSAO. */
export class PostFX {
  private composer: EffectComposer
  private bloom: UnrealBloomPass
  private grade: ShaderPass
  private samples: number
  enabled = true
  reducedMotion = false

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    q: QualityPreset,
  ) {
    this.samples = q.msaa
    const size = renderer.getSize(new THREE.Vector2())
    const target = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType,
      samples: q.msaa,
    })
    this.composer = new EffectComposer(renderer, target)
    this.composer.addPass(new RenderPass(scene, camera))
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.25, 0.6, 0.88)
    this.composer.addPass(this.bloom)
    this.grade = new ShaderPass(GradeShader)
    this.composer.addPass(this.grade)
    this.composer.addPass(new OutputPass())
  }

  setScene(scene: THREE.Scene, camera: THREE.Camera): void {
    const rp = this.composer.passes[0] as RenderPass
    rp.scene = scene
    rp.camera = camera
  }

  configure(q: QualityPreset, bloom: number, saturation: number, contrast: number): void {
    this.enabled = q.post
    this.bloom.enabled = q.bloom
    this.bloom.strength = bloom
    this.grade.uniforms.uSaturation.value = saturation
    this.grade.uniforms.uContrast.value = contrast
    if (q.msaa !== this.samples) {
      this.samples = q.msaa
      this.composer.renderTarget1.samples = q.msaa
      this.composer.renderTarget2.samples = q.msaa
      this.composer.renderTarget1.dispose()
      this.composer.renderTarget2.dispose()
    }
  }

  setSize(w: number, h: number, pixelRatio: number): void {
    this.composer.setPixelRatio(pixelRatio)
    this.composer.setSize(w, h)
  }

  render(dt: number, boost: number): void {
    this.grade.uniforms.uBoost.value = this.reducedMotion ? 0 : boost
    this.composer.render(dt)
  }
}
