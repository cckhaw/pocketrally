import * as THREE from 'three'
import { CarModel } from '../car/car'
import type { QualityPreset } from '../core/quality'
import { Batch } from './batch'
import { PropCtx } from './propCtx'
import { gardenProp } from './propsGarden'
import { houseProp } from './propsHouse'
import { cellarProp } from './propsCellar'
import { Track } from '../core/track'
import { floorTexture, skyTexture } from './textures'
import { corkModel, footModel } from './hazardModels'

export interface Diorama {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  update(dt: number): void
  setAspect(a: number): void
  setQuality(q: QualityPreset): void
}

/** Title-screen diorama: the toy car on a turntable surrounded by giant everyday objects. */
export function buildDiorama(renderer: THREE.WebGLRenderer): Diorama {
  const scene = new THREE.Scene()
  const sky = skyTexture(0x4a90d9, 0xffe6b0, 0xa07a50)
  scene.background = sky
  const pm = new THREE.PMREMGenerator(renderer)
  scene.environment = pm.fromEquirectangular(sky).texture
  scene.environmentIntensity = 0.8
  pm.dispose()
  scene.fog = new THREE.Fog(0xf3d9a0, 25, 90)
  scene.add(new THREE.HemisphereLight(0xdfeaff, 0x6a5a3a, 1.1))
  const sun = new THREE.DirectionalLight(0xffe0b0, 3)
  sun.position.set(-8, 14, 6)
  sun.castShadow = true
  sun.shadow.mapSize.set(1024, 1024)
  Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 50 })
  scene.add(sun)

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(80, 40),
    new THREE.MeshStandardMaterial({
      map: (() => {
        const t = floorTexture('wood', 0xb98a5a, 5)
        t.repeat.set(12, 12)
        return t
      })(),
      roughness: 0.9,
    }),
  )
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  scene.add(floor)

  const turntable = new THREE.Group()
  const disc = new THREE.Mesh(
    new THREE.CylinderGeometry(3.6, 3.8, 0.4, 32),
    new THREE.MeshStandardMaterial({ color: 0xe9e2d0, roughness: 0.6 }),
  )
  disc.position.y = 0.2
  disc.receiveShadow = true
  turntable.add(disc)
  const car = new CarModel()
  car.root.scale.setScalar(1.3)
  car.root.position.y = 0.4
  turntable.add(car.root)
  scene.add(turntable)

  // props
  const track = new Track(
    [
      { x: 0, z: 0, w: 10 },
      { x: 0, z: -20, w: 10 },
      { x: 0, z: -40, w: 10 },
    ],
    [],
    [],
  )
  const batch = new Batch()
  const ctx = new PropCtx(batch, track)
  const put = (kind: string, x: number, z: number, rot: number, scale = 1) => {
    ctx.place(20, 0, rot, scale)
    ctx.base.setPosition(x, 0, z)
    if (!gardenProp(ctx, kind, 1) && !houseProp(ctx, kind, 1, { id: 'd' } as never))
      cellarProp(ctx, kind, 1)
  }
  put('onion', -13, -10, 0.4, 1.3)
  put('onion', 14, -14, 1, 1.5)
  put('sneakerS', 14, 4, 2.2)
  put('ballS', -13, 6, 0, 1)
  put('flower', -7, -16, 0, 1.2)
  put('stalk', 20, -2, 0)
  put('corkS', 6, 8, 0.5)
  put('barrel', -17, 0, 0)
  const staticMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.7,
    side: THREE.DoubleSide,
  })
  const props = batch.build(staticMat)
  scene.add(props)

  const cork = corkModel()
  cork.position.set(-7, 0, -3)
  cork.scale.setScalar(1.5)
  scene.add(cork)
  const foot = footModel()
  foot.position.set(-9, 6, 5)
  foot.scale.setScalar(0.5)
  scene.add(foot)

  const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 300)
  let t = 0
  let aspect = 16 / 9
  const d: Diorama = {
    scene,
    camera,
    update(dt) {
      t += dt
      turntable.rotation.y = t * 0.5
      foot.position.y = 6 + Math.abs(Math.sin(t * 0.8)) * 2
      cork.rotation.y = t * 0.3
      const r = aspect < 1 ? 15 : 12
      camera.position.set(Math.sin(t * 0.12) * r, aspect < 1 ? 6 : 3.6, Math.cos(t * 0.12) * r)
      camera.lookAt(0, aspect < 1 ? -1.4 : -0.5, 0)
      car.update(
        dt,
        {
          s: 0,
          d: 0,
          vLat: 0,
          speed: 8,
          yaw: 0,
          y: 0,
          vy: 0,
          grounded: true,
          groundVy: 0,
          boostT: 0,
          spinT: 0,
          slowT: 0,
          invulnT: 0,
          wall: 0,
          brake: false,
          landed: 0,
          launched: false,
          fell: false,
          boostHit: false,
          scraped: false,
          airTime: 0,
        },
        new THREE.Vector3(0, 0.4, 0),
        0,
        0.4,
      )
      car.shadow.visible = false
    },
    setAspect(a) {
      aspect = a
      camera.aspect = a
      camera.fov = a < 1 ? 62 : 45
      camera.updateProjectionMatrix()
    },
    setQuality() {},
  }
  return d
}
