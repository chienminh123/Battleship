import * as THREE from 'three'
import { createShipModel } from './oceanModels'
import { effectDuration, shotStatus, sunkCellKeys, validCell } from './battlePresentation'
import type { BattleEvent, GraphicsQuality } from './battlePresentation'
import type { Coordinate, ShipView, ShotHistoryItem } from './types'

const STEP = 1.12
const BOARD = STEP * 10

function makeLabelTexture(value: string, small = false) {
  const canvas = document.createElement('canvas')
  canvas.width = 192; canvas.height = 192
  const context = canvas.getContext('2d')!
  context.clearRect(0, 0, 192, 192)
  context.fillStyle = '#e0f2ed'
  context.textAlign = 'center'; context.textBaseline = 'middle'
  context.font = `600 ${small ? 96 : 112}px "DM Sans", sans-serif`
  context.shadowColor = '#061f2c'; context.shadowBlur = 12
  context.fillText(value, 96, 96)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 2
  return texture
}

function addShip(group: THREE.Group, ship: ShipView) {
  if (!ship.cells.length) return
  const horizontal = ship.cells.length < 2 || ship.cells[0].y === ship.cells[1].y
  const first = ship.cells[0]
  const hull = createShipModel(ship)
  hull.position.set((first.x + (horizontal ? (ship.cells.length - 1) / 2 : 0) - 4.5) * STEP,
    .10, (first.y + (horizontal ? 0 : (ship.cells.length - 1) / 2) - 4.5) * STEP)
  hull.rotation.y = horizontal ? 0 : -Math.PI / 2
  group.add(hull)
  return hull
}

export type SceneInput = {
  ships: ShipView[]; shots: ShotHistoryItem[]; previewCells: Coordinate[]; previewInvalid: boolean
  selected: Coordinate | null; quality: GraphicsQuality; mini: boolean; rotate: boolean; animate: boolean
  effect?: BattleEvent
  onCell?: (cell: Coordinate) => void; onHover?: (cell: Coordinate | null) => void
  onNavigate: (cell: Coordinate) => void
  onContext: (lost: boolean) => void; showWrecks: boolean
}

function disposeTree(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>()
  const materials = new Set<THREE.Material>()
  const textures = new Set<THREE.Texture>()
  root.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points) geometries.add(object.geometry)
    if ('material' in object) {
      const value = object.material as THREE.Material | THREE.Material[]
      for (const material of Array.isArray(value) ? value : [value]) {
        materials.add(material)
        if ('map' in material && material.map instanceof THREE.Texture) textures.add(material.map)
      }
    }
  })
  geometries.forEach((geometry) => geometry.dispose())
  materials.forEach((material) => material.dispose())
  textures.forEach((texture) => texture.dispose())
  root.clear()
}

function addMark(group: THREE.Group, cell: Coordinate, status: string, latest: boolean, elevated: boolean) {
  const mark = new THREE.Group()
  mark.position.set((cell.x - 4.5) * STEP, .29, (cell.y - 4.5) * STEP)
  const miss = status === 'Miss', sunk = status === 'Sunk' || status === 'Won'
  const color = miss ? '#bcefff' : sunk ? '#ff7883' : '#ffcc69'
  if (miss) {
    const ripple = new THREE.Mesh(new THREE.TorusGeometry(.18, .025, 5, 24), new THREE.MeshBasicMaterial({ color }))
    ripple.rotation.x = Math.PI / 2; mark.add(ripple)
  } else {
    const fill = new THREE.Mesh(new THREE.PlaneGeometry(STEP - .04, STEP - .04), new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: sunk ? .24 : .20, depthWrite: false,
    }))
    fill.rotation.x = -Math.PI / 2; fill.position.y = .015; mark.add(fill)
    for (const angle of [-Math.PI / 4, Math.PI / 4]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(.51, .035, .055), new THREE.MeshBasicMaterial({ color }))
      bar.rotation.y = angle; bar.position.y = elevated ? 1.05 : .06; mark.add(bar)
    }
  }
  if (latest) {
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(STEP - .07, .02, STEP - .07)), new THREE.LineBasicMaterial({ color: '#f1fff7' }))
    edge.position.y = .03; mark.add(edge)
  }
  group.add(mark)
}

type Particle = { mesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>; velocity: THREE.Vector3; smoke: boolean; size: number }
type ShotEffect = {
  root: THREE.Group; start: number; duration: number; shot: ShotHistoryItem
  projectile: THREE.Mesh; flash: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>
  ripple: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>; particles: Particle[]
}

function createShotEffect(shot: ShotHistoryItem, low: boolean): ShotEffect {
  const root = new THREE.Group()
  root.position.set((shot.coordinate.x - 4.5) * STEP, .32, (shot.coordinate.y - 4.5) * STEP)
  const miss = shot.status === 'Miss'
  const projectile = new THREE.Mesh(new THREE.SphereGeometry(.10, 8, 6), new THREE.MeshBasicMaterial({ color: '#fff2be' }))
  projectile.scale.set(1, 1, 3); root.add(projectile)
  const flash = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshBasicMaterial({ color: miss ? '#c9f5ff' : '#ffbc4f', transparent: true, opacity: 0, depthWrite: false }))
  root.add(flash)
  const ripple = new THREE.Mesh(new THREE.TorusGeometry(.4, .025, 6, 40), new THREE.MeshBasicMaterial({ color: miss ? '#d1f8ff' : '#ffb37b', transparent: true, opacity: 0, depthWrite: false }))
  ripple.rotation.x = -Math.PI / 2; ripple.position.y = .04; root.add(ripple)
  const particles: Particle[] = []
  const geometry = new THREE.SphereGeometry(1, low ? 5 : 7, 5)
  const count = low ? 16 : 38
  for (let i = 0; i < count; i++) {
    const smoke = !miss && i % 3 === 0
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
      color: smoke ? '#71868a' : miss ? (i % 2 ? '#e4faff' : '#7dd8eb') : (i % 2 ? '#ffdc85' : '#ff793f'),
      transparent: true, opacity: 0, depthWrite: false,
    }))
    const angle = i * 2.39996
    const spread = smoke ? .5 : .6 + (i % 5) * .22
    const velocity = new THREE.Vector3(Math.cos(angle) * spread, smoke ? 1.1 + (i % 4) * .22 : (miss ? 3.6 : 2.8) + (i % 5) * .3, Math.sin(angle) * spread)
    const size = smoke ? .15 + (i % 3) * .07 : miss ? .045 : .035
    root.add(mesh); particles.push({ mesh, velocity, smoke, size })
  }
  return { root, start: performance.now(), duration: effectDuration(shot), shot, projectile, flash, ripple, particles }
}

function updateEffect(effect: ShotEffect, now: number) {
  const age = (now - effect.start) / 1000
  const impact = age - .28
  effect.projectile.visible = impact < 0
  const travel = Math.min(1, age / .28)
  effect.projectile.position.set(-3.5 * (1 - travel), 4.5 * (1 - travel) + Math.sin(travel * Math.PI) * .8, 4 * (1 - travel))
  effect.projectile.rotation.x = -.7; effect.projectile.rotation.y = -.65
  if (impact < 0) return
  const miss = effect.shot.status === 'Miss'
  effect.flash.scale.setScalar(Math.max(.01, miss ? .1 + impact : .15 + impact * 3))
  if (miss) effect.flash.scale.y = Math.max(.01, 2.1 * Math.sin(Math.min(1, impact / .5) * Math.PI))
  effect.flash.position.y = miss ? .5 : .4
  effect.flash.material.opacity = Math.max(0, (miss ? .65 : .95) * (1 - impact / .35))
  effect.ripple.scale.setScalar(.4 + impact * 4)
  effect.ripple.material.opacity = Math.max(0, .8 * (1 - impact / (effect.duration / 1000 - .28)))
  for (const particle of effect.particles) {
    const { mesh, velocity, smoke, size } = particle
    mesh.position.copy(velocity).multiplyScalar(impact)
    mesh.position.y -= smoke ? 0 : 4.5 * impact * impact
    mesh.visible = mesh.position.y >= -.05
    mesh.scale.setScalar(smoke ? size * (1 + impact * 2.5) : size)
    if (miss) mesh.scale.y *= 1.8
    mesh.material.opacity = Math.max(0, (smoke ? .55 : .95) * (1 - impact / (smoke ? 1.8 : .8)))
  }
}

export function createOceanScene(mount: HTMLDivElement) {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  const coarsePointer = window.matchMedia('(pointer: coarse)')
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' })
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.2
  const canvas = renderer.domElement
  canvas.tabIndex = 0
  canvas.setAttribute('role', 'group')
  canvas.setAttribute('aria-roledescription', 'bàn cờ 3D tương tác')
  mount.append(canvas)
  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#0c2632')
  const camera = new THREE.OrthographicCamera(-7, 7, 7, -7, .1, 100)
  const sceneRoot = new THREE.Group(); scene.add(sceneRoot)
  sceneRoot.add(new THREE.HemisphereLight('#d4f5ff', '#173b40', 2.5))
  const sun = new THREE.DirectionalLight('#fff4dc', 3)
  sun.position.set(-6, 14, 8); sceneRoot.add(sun)
  const fill = new THREE.DirectionalLight('#81d9ee', 1.3)
  fill.position.set(10, 7, -8); sceneRoot.add(fill)
  const seaMaterial = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 } },
    vertexShader: `varying vec2 vSea;
      void main(){vec4 world=modelMatrix*vec4(position,1.0);vSea=world.xz;gl_Position=projectionMatrix*viewMatrix*world;}`,
    fragmentShader: `uniform float time; varying vec2 vSea;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1)),f.x),f.y);}
      float height(vec2 p){
        float t=time*.65;
        return sin(p.x*2.1+p.y*1.7-t+noise(p*.8)*2.)*.34
          +sin(p.x*5.4-p.y*2.6+t*1.3+noise(p*1.5)*3.)*.14
          +sin(p.x*13.+p.y*7.-t*2.+noise(p*3.)*4.)*.055;
      }
      void main(){
        vec2 p=vSea; float h=height(p);
        vec3 n=normalize(vec3((h-height(p+vec2(.035,0)))*5.,1.,(h-height(p+vec2(0,.035)))*5.));
        float diffuse=clamp(dot(n,normalize(vec3(-.6,1.,-.5))),0.,1.);
        float swell=noise(p*.25+vec2(time*.006,0));
        vec3 color=mix(vec3(.025,.105,.145),vec3(.055,.225,.265),swell*.6+diffuse*.3);
        float glint=pow(max(0.,dot(n,normalize(vec3(-.2,1.,.5)))),38.);
        float ripple=pow(max(0.,sin(p.x*25.+p.y*16.+noise(p*3.)*7.+time*.5)),18.);
        float crest=smoothstep(.30,.48,h)*smoothstep(.48,.82,noise(p*2.2-vec2(time*.12,time*.08)));
        color+=vec3(.22,.36,.36)*glint*.32+vec3(.09,.18,.20)*ripple*.20;
        color=mix(color,vec3(.31,.48,.49),crest*.30);
        gl_FragColor=vec4(color,1.);
      }`,
  })
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(180, 180), seaMaterial)
  sea.rotation.x = -Math.PI / 2; sea.position.y = -.31; sceneRoot.add(sea)
  const water = new THREE.Mesh(new THREE.PlaneGeometry(BOARD, BOARD), seaMaterial)
  water.rotation.x = -Math.PI / 2; water.position.y = .16; sceneRoot.add(water)
  // Raycast the continuous surface, then map its world position to the 10×10 grid.
  const gridPoints: THREE.Vector3[] = []
  for (let i = 0; i <= 10; i++) {
    const p = -BOARD / 2 + i * STEP
    gridPoints.push(new THREE.Vector3(p, .19, -BOARD / 2), new THREE.Vector3(p, .19, BOARD / 2),
      new THREE.Vector3(-BOARD / 2, .19, p), new THREE.Vector3(BOARD / 2, .19, p))
  }
  sceneRoot.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(gridPoints),
    new THREE.LineBasicMaterial({ color: '#9bced5', transparent: true, opacity: .24 })))
  const border = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-BOARD/2, .20, -BOARD/2), new THREE.Vector3(BOARD/2, .20, -BOARD/2),
    new THREE.Vector3(BOARD/2, .20, BOARD/2), new THREE.Vector3(-BOARD/2, .20, BOARD/2),
  ]), new THREE.LineBasicMaterial({ color: '#87bac3', transparent: true, opacity: .7 }))
  sceneRoot.add(border)
  for (let i = 0; i < 10; i++) {
    for (const axis of ['x', 'y']) {
      const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeLabelTexture(axis === 'x' ? String.fromCharCode(65 + i) : String(i + 1)), depthWrite: false, depthTest: false, toneMapped: false }))
      label.position.set(axis === 'x' ? (i - 4.5) * STEP : -6.05, .35, axis === 'x' ? -6.05 : (i - 4.5) * STEP)
      label.scale.set(.78, .78, 1); sceneRoot.add(label)
    }
  }
  const fleetGroup = new THREE.Group(), marks = new THREE.Group(), preview = new THREE.Group(), effects = new THREE.Group()
  sceneRoot.add(fleetGroup, marks, preview, effects)
  const target = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(STEP - .04, .20, STEP - .04)), new THREE.LineBasicMaterial({ color: '#d6ffe8' }))
  target.visible = false; sceneRoot.add(target)
  let input: SceneInput | undefined, disposed = false, lost = false, initialized = false
  let shipSignature = '', shotSignature = '', previewSignature = ''
  let seenEffect: number | undefined
  const models = new Map<string, THREE.Group>()
  const sinking = new Map<THREE.Group, { start: number; y: number }>()
  const activeEffects: ShotEffect[] = []
  let theta = 0, phi = .58, low = true, mini = false
  let keyboardCell: Coordinate | null = null
  let selectedSignature = ''
  let pointer: { x: number; y: number; lastX: number; lastY: number; moved: boolean; rotate: boolean; id: number } | undefined

  const frame = () => {
    const width = mount.clientWidth, height = mount.clientHeight
    if (!width || !height) return
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, low ? 1.25 : 1.75))
    renderer.setSize(width, height, false)
    camera.position.setFromSphericalCoords(25, phi, theta)
    camera.lookAt(-.15, .2, -.15); camera.updateMatrixWorld()
    // Fit projected corners, including coordinate labels and the tallest ship.
    let extentX = 0, extentY = 0
    for (const x of [-6.5, 6.1]) for (const z of [-6.5, 6.1]) for (const y of [0, 1.5]) {
      const point = new THREE.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse)
      extentX = Math.max(extentX, Math.abs(point.x)); extentY = Math.max(extentY, Math.abs(point.y))
    }
    const aspect = width / height
    const halfHeight = Math.max(extentY, extentX / aspect) * 1.025
    camera.left = -halfHeight * aspect; camera.right = halfHeight * aspect
    camera.top = halfHeight; camera.bottom = -halfHeight; camera.updateProjectionMatrix()
  }
  const observer = new ResizeObserver(frame); observer.observe(mount)
  let inView = true
  const visibilityObserver = typeof IntersectionObserver === 'undefined' ? undefined : new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting
  })
  visibilityObserver?.observe(mount)
  const raycaster = new THREE.Raycaster(), mouse = new THREE.Vector2()
  const locate = (event: PointerEvent) => {
    const bounds = canvas.getBoundingClientRect()
    mouse.set((event.clientX - bounds.left) / bounds.width * 2 - 1, 1 - (event.clientY - bounds.top) / bounds.height * 2)
    raycaster.setFromCamera(mouse, camera)
    const point = raycaster.intersectObject(water, false)[0]?.point
    if (!point) return
    const cell = { x: Math.floor((point.x + BOARD / 2) / STEP), y: Math.floor((point.z + BOARD / 2) / STEP) }
    return validCell(cell) ? cell : undefined
  }
  const down = (event: PointerEvent) => {
    if (event.button !== 0 || pointer) return
    pointer = { x: event.clientX, y: event.clientY, lastX: event.clientX, lastY: event.clientY, moved: false, rotate: Boolean(input?.rotate), id: event.pointerId }
    if (pointer.rotate) canvas.setPointerCapture(event.pointerId)
  }
  const move = (event: PointerEvent) => {
    if (pointer?.id === event.pointerId) {
      pointer.moved ||= Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 8
      if (pointer.rotate) {
        theta = THREE.MathUtils.clamp(theta - (event.clientX - pointer.lastX) * .006, -.65, .65)
        phi = THREE.MathUtils.clamp(phi + (event.clientY - pointer.lastY) * .004, .25, .75)
        pointer.lastX = event.clientX; pointer.lastY = event.clientY
        frame(); return
      }
    }
    if (!input?.rotate && event.pointerType !== 'touch') input?.onHover?.(locate(event) ?? null)
  }
  const cancel = () => { pointer = undefined; input?.onHover?.(null) }
  const up = (event: PointerEvent) => {
    if (pointer?.id !== event.pointerId) return
    const tap = !pointer.moved && !pointer.rotate
    pointer = undefined
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
    const cell = tap ? locate(event) : undefined
    if (cell) { keyboardCell = cell; input?.onHover?.(cell); input?.onCell?.(cell) }
  }
  const leave = () => { if (!pointer) input?.onHover?.(null) }
  const keydown = (event: KeyboardEvent) => {
    if (!input?.onCell) return
    const next = { ...(keyboardCell ?? input.selected ?? { x: 0, y: 0 }) }
    if (event.key === 'ArrowLeft') next.x = Math.max(0, next.x - 1)
    else if (event.key === 'ArrowRight') next.x = Math.min(9, next.x + 1)
    else if (event.key === 'ArrowUp') next.y = Math.max(0, next.y - 1)
    else if (event.key === 'ArrowDown') next.y = Math.min(9, next.y + 1)
    else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault(); input.onCell(next); return
    } else return
    event.preventDefault(); keyboardCell = next; input.onNavigate(next); input.onHover?.(next)
    target.visible = true; target.position.set((next.x - 4.5) * STEP, .34, (next.y - 4.5) * STEP)
  }
  const contextLost = (event: Event) => { event.preventDefault(); lost = true; input?.onContext(true) }
  const contextRestored = () => { lost = false; frame(); input?.onContext(false) }
  canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move)
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', cancel)
  canvas.addEventListener('pointerleave', leave); canvas.addEventListener('keydown', keydown)
  canvas.addEventListener('webglcontextlost', contextLost); canvas.addEventListener('webglcontextrestored', contextRestored)

  let raf = 0, lastFrame = 0, lastTick = 0, seaTime = 0
  const render = (now: number) => {
    if (disposed) return
    raf = requestAnimationFrame(render)
    const elapsed = lastTick ? Math.min((now - lastTick) / 1000, .1) : 0
    lastTick = now
    if (!mount.clientWidth || !mount.clientHeight || document.hidden || !inView || lost) return
    if (!reducedMotion.matches) seaTime += elapsed
    if (now - lastFrame < 1000 / (mini ? 20 : low ? 30 : 60)) return
    lastFrame = now
    seaMaterial.uniforms.time.value = reducedMotion.matches ? 0 : seaTime
    for (const model of models.values()) {
      if (sinking.has(model) || model.userData.sunk) continue
      const body = model.getObjectByName('ship-body')
      if (!body) continue
      const phase = seaTime * .8 + model.position.x * .3 + model.position.z * .2
      body.position.y = reducedMotion.matches ? 0 : Math.sin(phase) * .018
      body.rotation.x = reducedMotion.matches ? 0 : Math.sin(phase * .83) * .003
      body.rotation.z = reducedMotion.matches ? 0 : Math.cos(phase) * .0035
    }
    for (const [model, sink] of sinking) {
      const p = THREE.MathUtils.clamp((now - sink.start - 280) / 1650, 0, 1)
      model.position.y = sink.y - p * p * 2.3
      model.rotation.z = p * .4; model.rotation.x = p * .22
      model.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          const materials = Array.isArray(object.material) ? object.material : [object.material]
          materials.forEach((material) => { material.transparent = true; material.opacity = Math.min(1, (1 - p) * 2.5) })
        }
      })
      if (p >= 1) { model.visible = false; sinking.delete(model) }
    }
    for (let i = activeEffects.length - 1; i >= 0; i--) {
      const effect = activeEffects[i]
      if (now - effect.start >= effect.duration) {
        effects.remove(effect.root); disposeTree(effect.root); activeEffects.splice(i, 1)
      } else updateEffect(effect, now)
    }
    renderer.render(scene, camera)
    mount.dataset.seaTime = seaMaterial.uniforms.time.value.toFixed(2)
    mount.dataset.drawCalls = String(renderer.info.render.calls)
    mount.dataset.triangles = String(renderer.info.render.triangles)
    mount.dataset.activeEffects = String(activeEffects.length)
    mount.dataset.sinkingShips = String(sinking.size)
  }
  raf = requestAnimationFrame(render)

  return {
    resetCamera() { theta = 0; phi = .58; frame() },
    describe(label: string) { canvas.setAttribute('aria-label', label) },
    sync(next: SceneInput) {
      input = next
      const nextLow = next.quality === 'low' || (next.quality === 'auto' && (coarsePointer.matches || navigator.hardwareConcurrency <= 4))
      if (!initialized || low !== nextLow || mini !== next.mini) { low = nextLow; mini = next.mini; frame() }
      canvas.style.touchAction = next.rotate ? 'none' : 'pan-y'
      canvas.style.cursor = next.rotate ? 'grab' : next.onCell ? 'crosshair' : 'default'
      const newShots = initialized && next.animate && next.effect && next.effect.id !== seenEffect ? [next.effect.shot] : []
      if (next.effect) seenEffect = next.effect.id
      const nextShipSignature = JSON.stringify(next.ships)
      if (shipSignature !== nextShipSignature) {
        shipSignature = nextShipSignature
        const wanted = new Set(next.ships.map((ship) => ship.type))
        for (const [type, model] of models) if (!wanted.has(type as ShipView['type'])) {
          sinking.delete(model); fleetGroup.remove(model); disposeTree(model); models.delete(type)
        }
        for (const ship of next.ships) {
          let model = models.get(ship.type)
          const footprint = JSON.stringify(ship.cells)
          if (model && model.userData.footprint !== footprint) {
            sinking.delete(model); fleetGroup.remove(model); disposeTree(model); models.delete(ship.type); model = undefined
          }
          if (!model) { model = addShip(fleetGroup, ship); if (!model) continue; model.userData.footprint = footprint; models.set(ship.type, model) }
          if (ship.isSunk && !model.userData.sunk) {
            const live = newShots.some((shot) => shot.sunkShip === ship.type)
            if (live && !reducedMotion.matches) sinking.set(model, { start: performance.now(), y: model.position.y })
            else if (!initialized || !next.animate) model.visible = next.showWrecks
          }
          model.userData.sunk = ship.isSunk
        }
        mount.dataset.ships = String(models.size)
      }
      const nextShotSignature = JSON.stringify([next.shots, next.ships.filter((ship) => ship.isSunk).map((ship) => ship.type)])
      if (shotSignature !== nextShotSignature) {
        shotSignature = nextShotSignature; disposeTree(marks)
        const sunk = sunkCellKeys(next.shots, next.ships)
        next.shots.forEach((shot, i) => addMark(marks, shot.coordinate, shotStatus(shot, sunk)!, i === next.shots.length - 1,
          next.ships.some((ship) => (!ship.isSunk || next.showWrecks) && ship.cells.some((cell) => cell.x === shot.coordinate.x && cell.y === shot.coordinate.y))))
        mount.dataset.shots = String(next.shots.length)
      }
      const nextPreviewSignature = JSON.stringify([next.previewCells, next.previewInvalid])
      if (previewSignature !== nextPreviewSignature) {
        previewSignature = nextPreviewSignature; disposeTree(preview)
        for (const cell of next.previewCells.filter(validCell)) {
          const ghost = new THREE.Mesh(new THREE.BoxGeometry(STEP - .04, .10, STEP - .04), new THREE.MeshBasicMaterial({ color: next.previewInvalid ? '#ff7585' : '#9ff5ca', transparent: true, opacity: .4, depthWrite: false }))
          ghost.position.set((cell.x - 4.5) * STEP, .32, (cell.y - 4.5) * STEP); preview.add(ghost)
        }
      }
      const nextSelectedSignature = JSON.stringify(next.selected)
      if (nextSelectedSignature !== selectedSignature) { selectedSignature = nextSelectedSignature; keyboardCell = next.selected }
      const highlighted = keyboardCell ?? next.selected
      target.visible = Boolean(highlighted && next.onCell)
      if (highlighted) target.position.set((highlighted.x - 4.5) * STEP, .34, (highlighted.y - 4.5) * STEP)
      if (!reducedMotion.matches && !document.hidden) for (const shot of newShots) {
        const model = shot.sunkShip ? models.get(shot.sunkShip) : undefined
        if (model && !sinking.has(model)) {
          model.visible = true; sinking.set(model, { start: performance.now(), y: model.position.y })
        }
        // Bound GPU work if several network events arrive together after a delay.
        if (activeEffects.length >= 4) {
          const oldest = activeEffects.shift()!; effects.remove(oldest.root); disposeTree(oldest.root)
        }
        const effect = createShotEffect(shot, low); activeEffects.push(effect); effects.add(effect.root)
      }
      if (reducedMotion.matches || document.hidden) for (const shot of newShots) {
        const model = shot.sunkShip ? models.get(shot.sunkShip) : undefined
        if (model) model.visible = false
      }
      initialized = true
    },
    dispose() {
      disposed = true; cancelAnimationFrame(raf); observer.disconnect(); visibilityObserver?.disconnect()
      canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', cancel)
      canvas.removeEventListener('pointerleave', leave); canvas.removeEventListener('keydown', keydown)
      canvas.removeEventListener('webglcontextlost', contextLost); canvas.removeEventListener('webglcontextrestored', contextRestored)
      disposeTree(scene); renderer.dispose(); renderer.forceContextLoss(); canvas.remove()
    },
  }
}
