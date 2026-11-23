import * as THREE from 'three'
import type { Blocker } from '../core/camera'
import type { Run } from '../core/run'
import type { Track } from '../core/track'
import { makeTrackPoint } from '../core/track'
import { rng } from '../levels/builder'
import type { LevelConfig } from '../levels/types'
import { Batch, CHUNK } from './batch'
import { HazardViews } from './hazardModels'
import { PropCtx } from './propCtx'
import { buildProp } from './props'
import { checkerTexture, chevronTexture, coinTexture, floorTexture, skyTexture } from './textures'
import { addCheckpointFlags, addFinishGate, buildTrackMeshes } from './trackMesh'
import type { QualityPreset } from '../core/quality'

export interface LevelView {
  scene: THREE.Scene
  sun: THREE.DirectionalLight
  blockers: Blocker[]
  triangles: number
  update(dt: number, run: Run, carPos: THREE.Vector3): void
  setQuality(q: QualityPreset): void
  dispose(): void
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0))
const P = makeTrackPoint()

export function applyTheme(
  scene: THREE.Scene,
  level: LevelConfig,
  renderer: THREE.WebGLRenderer,
): void {
  const th = level.theme
  const sky = skyTexture(th.skyTop, th.skyHorizon, th.skyBottom)
  scene.background = sky
  const pm = new THREE.PMREMGenerator(renderer)
  const env = pm.fromEquirectangular(sky)
  scene.environment = env.texture
  scene.environmentIntensity = 0.7
  pm.dispose()
  scene.fog = new THREE.Fog(th.fog, th.fogNear, th.fogFar)
  const hemi = new THREE.HemisphereLight(th.hemiSky, th.hemiGround, th.hemiIntensity)
  scene.add(hemi)
}

export async function buildLevelView(
  level: LevelConfig,
  track: Track,
  renderer: THREE.WebGLRenderer,
  quality: QualityPreset,
  progress: (f: number) => void,
): Promise<LevelView> {
  const scene = new THREE.Scene()
  const th = level.theme
  applyTheme(scene, level, renderer)

  const sun = new THREE.DirectionalLight(th.sun, th.sunIntensity)
  sun.castShadow = true
  sun.shadow.mapSize.set(quality.shadowSize, quality.shadowSize)
  const sc = sun.shadow.camera
  sc.left = -22
  sc.right = 22
  sc.top = 22
  sc.bottom = -22
  sc.near = 1
  sc.far = 90
  sun.shadow.bias = -0.0004
  sun.shadow.normalBias = 0.04
  scene.add(sun)
  scene.add(sun.target)
  progress(0.1)
  await tick()

  const batch = new Batch()
  const ctx = new PropCtx(batch, track)
  const floorMap = floorTexture(th.floor, th.trackColor, 3)
  floorMap.repeat.set(1, 1)
  const groundBase = new THREE.Color(th.trackColor).multiplyScalar(0.8).getHex()
  const floorTex2 = floorTexture(th.floor, groundBase, 7)
  const chevron = chevronTexture()
  const checker = checkerTexture()
  const meshes = buildTrackMeshes(level, track, floorTex2, floorMap, chevron, batch, ctx)
  scene.add(meshes.group)
  progress(0.3)
  await tick()

  // props in slices so the loading bar can animate
  const rand = rng(level.id.length * 7919)
  const total = level.props.length
  for (let i = 0; i < total; i++) {
    const def = level.props[i]
    ctx.rnd = rand
    buildProp(ctx, def, level)
    if (i % 40 === 39) {
      progress(0.3 + 0.35 * (i / total))
      await tick()
    }
  }
  if (th.ceiling) {
    // rafters every 14 units keep the ceiling readable and the cellar feeling enclosed
    for (let s = 0; s < track.length; s += 14) {
      ctx.place(s, 0, 0)
      ctx.box(th.ceiling.color, 150, 1.4, 1.6, 0, th.ceiling.y - 0.7, 0)
    }
  }
  addCheckpointFlags(level, track, ctx)
  addFinishGate(level, track, ctx, checker, meshes.group)
  const staticMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.7,
    metalness: 0.05,
    side: THREE.DoubleSide,
  })
  const tris = batch.triangles
  const staticGroup = batch.build(staticMat)
  scene.add(staticGroup)
  scene.add(ctx.group)
  progress(0.7)
  await tick()

  // tokens (instanced coins)
  const coinGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.12, 14)
  coinGeo.rotateX(Math.PI / 2)
  const coinMat = new THREE.MeshStandardMaterial({
    map: coinTexture(),
    metalness: 0.7,
    roughness: 0.3,
    emissive: 0xffa800,
    emissiveIntensity: 0.35,
  })
  const coins = new THREE.InstancedMesh(coinGeo, coinMat, Math.max(1, level.tokens.length))
  coins.frustumCulled = false
  coins.castShadow = false
  scene.add(coins)
  const coinPos = level.tokens.map((t) => {
    const p = track.at(t.s, P)
    return new THREE.Vector3(
      p.x + p.nx * t.d,
      (track.ground(t.s, t.d) ?? 0) + (t.y ?? 0) + 0.9,
      p.z + p.nz * t.d,
    )
  })
  const coinHeading = level.tokens.map((t) => {
    const p = track.at(t.s, P)
    return Math.atan2(p.tx, -p.tz)
  })

  if (th.ceiling) {
    const ceil = new THREE.Mesh(
      new THREE.PlaneGeometry(4000, 4000),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(th.ceiling.color).multiplyScalar(0.8) }),
    )
    ceil.rotation.x = Math.PI / 2
    ceil.position.y = th.ceiling.y
    scene.add(ceil)
  }
  const hazards = new HazardViews(level, track)
  scene.add(hazards.group)
  progress(0.9)
  await tick()

  const dummy = new THREE.Object3D()
  const light = new THREE.Vector3(...th.sunDir).normalize().multiplyScalar(40)
  const blockers = ctx.blockers
  const view: LevelView = {
    scene,
    sun,
    blockers,
    triangles: tris,
    update(dt, run, carPos) {
      sun.position.copy(carPos).add(light)
      sun.target.position.copy(carPos)
      sun.target.updateMatrixWorld()
      const t = run.time
      const near = carPos
      for (let i = 0; i < coinPos.length; i++) {
        const c = coinPos[i]
        if (run.tokens[i] || Math.abs(c.x - near.x) + Math.abs(c.z - near.z) > 160) {
          dummy.scale.set(0, 0, 0)
        } else {
          dummy.position.set(c.x, c.y + Math.sin(t * 3 + i) * 0.08, c.z)
          dummy.rotation.set(0, coinHeading[i] + t * 3 + i, 0)
          dummy.scale.set(1, 1, 1)
        }
        dummy.updateMatrix()
        coins.setMatrixAt(i, dummy.matrix)
      }
      coins.instanceMatrix.needsUpdate = true
      hazards.update(run, dt)
      for (const d of ctx.dynamic) d.update(t, run.car.s)
    },
    setQuality(q) {
      sun.shadow.mapSize.set(q.shadowSize, q.shadowSize)
      sun.shadow.map?.dispose()
      sun.shadow.map = null
    },
    dispose() {
      scene.traverse((o) => {
        const m = o as THREE.Mesh
        if (m.geometry) m.geometry.dispose()
      })
      scene.environment?.dispose()
      sun.shadow.map?.dispose()
    },
  }
  progress(1)
  void CHUNK
  return view
}
