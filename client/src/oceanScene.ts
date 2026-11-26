import * as THREE from 'three'
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
  context.font = `600 ${small ? 74 : 86}px "DM Sans", sans-serif`
  context.shadowColor = '#061f2c'; context.shadowBlur = 12
  context.fillText(value, 96, 96)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 2
  return texture
}

function makeHull(length: number) {
  const shape = new THREE.Shape()
  shape.moveTo(-length / 2 + .10, -.37)
  shape.lineTo(length / 2 - .24, -.37)
  shape.quadraticCurveTo(length / 2 - .07, -.37, length / 2 + .22, 0)
  shape.quadraticCurveTo(length / 2 - .07, .37, length / 2 - .24, .37)
  shape.lineTo(-length / 2 + .10, .37)
  shape.quadraticCurveTo(-length / 2 - .10, .37, -length / 2 - .10, 0)
  shape.quadraticCurveTo(-length / 2 - .10, -.37, -length / 2 + .10, -.37)
  return new THREE.ExtrudeGeometry(shape, { depth: .19, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: .035, bevelThickness: .035 })
}

function addShip(group: THREE.Group, ship: ShipView) {
  if (!ship.cells.length) return
  const horizontal = ship.cells.length < 2 || ship.cells[0].y === ship.cells[1].y
  const row = ship.cells[0].y, column = ship.cells[0].x
  const centreX = (column + (horizontal ? (ship.cells.length - 1) / 2 : 0) - 4.5) * STEP
  const centreZ = (row + (horizontal ? 0 : (ship.cells.length - 1) / 2) - 4.5) * STEP
  const hull = new THREE.Group()
  hull.position.set(centreX, .25 + (row % 3) * .012, centreZ)
  hull.rotation.y = horizontal ? 0 : -Math.PI / 2
  const scale = ship.isSunk ? .87 : 1
  hull.scale.setScalar(scale)
  const shipColors: Record<string, string> = {
    Carrier: '#73baae', Battleship: '#57a59f', Cruiser: '#72a7c6', Submarine: '#bea776', Destroyer: '#86c4b8',
  }
  const material = new THREE.MeshStandardMaterial({
    color: ship.isSunk ? '#7b474e' : shipColors[ship.type] ?? '#84c4b4',
    roughness: .48, metalness: .28, flatShading: false,
  })
  const darkMetal = new THREE.MeshStandardMaterial({ color: '#173946', roughness: .4, metalness: .5 })
  const cabinMaterial = new THREE.MeshStandardMaterial({ color: '#d5ebe0', roughness: .38, metalness: .12 })
  const deckGeometry = new THREE.ExtrudeGeometry((() => {
    const deck = new THREE.Shape()
    const half = ship.cells.length * STEP * .43
    deck.moveTo(-half, -.25); deck.lineTo(half - .16, -.25); deck.lineTo(half, 0)
    deck.lineTo(half - .16, .25); deck.lineTo(-half, .25); deck.closePath()
    return deck
  })(), { depth: .08, bevelEnabled: false })
  const deck = new THREE.Mesh(deckGeometry, darkMetal)
  deck.rotation.x = -Math.PI / 2; deck.position.y = .40; hull.add(deck)
  const body = new THREE.Mesh(makeHull(ship.cells.length * STEP * .91), material)
  body.rotation.x = -Math.PI / 2; body.position.y = .18; hull.add(body)

  const length = ship.cells.length
  const bridge = new THREE.Group()
  const block = new THREE.Mesh(new THREE.BoxGeometry(.42, .24, .40), cabinMaterial)
  block.position.set(-length * STEP * .11, .63, -.04); bridge.add(block)
  const roof = new THREE.Mesh(new THREE.BoxGeometry(.25, .07, .24), darkMetal)
  roof.position.set(-length * STEP * .11, .79, -.04); bridge.add(roof)
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(.015, .025, .28, 6), cabinMaterial)
  antenna.position.set(-length * STEP * .11, .92, -.04); bridge.add(antenna)
  const bridgeBase = new THREE.Mesh(new THREE.BoxGeometry(.82, .06, .58), material)
  bridgeBase.position.set(-length * STEP * .11, .49, -.04); bridge.add(bridgeBase)
  hull.add(bridge)

  const gunGroup = new THREE.Group()
  const turret = new THREE.Mesh(new THREE.CylinderGeometry(.16, .20, .12, 10), cabinMaterial)
  turret.position.set(length * STEP * .24, .55, .02); gunGroup.add(turret)
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(.035, .05, .34, 8), darkMetal)
  barrel.rotation.z = Math.PI / 2; barrel.position.set(length * STEP * .24 + .20, .62, .02); gunGroup.add(barrel)
  hull.add(gunGroup)

  const portholes = new THREE.MeshStandardMaterial({ color: '#d6f2e8', emissive: '#81c8b0', emissiveIntensity: .45 })
  for (let i = 0; i < Math.min(length, 5); i++) {
    const porthole = new THREE.Mesh(new THREE.SphereGeometry(.035, 8, 8), portholes)
    porthole.position.set(-length * STEP * .32 + i * STEP * .16, .29, -.372)
    hull.add(porthole)
  }
  if (ship.type == 'Carrier') {
    gunGroup.visible = false
    const runway = new THREE.Mesh(new THREE.BoxGeometry(length * STEP * .66, .015, .38), darkMetal)
    runway.position.set(.22, .49, .08); hull.add(runway)
    for (let i = 0; i < 7; i++) {
      const dash = new THREE.Mesh(new THREE.BoxGeometry(.19, .02, .025), cabinMaterial)
      dash.position.set(-1.25 + i * .43, .51, .08); hull.add(dash)
    }
    bridge.position.z = -.20
  } else if (ship.type === 'Submarine') {
    body.visible = false; deck.visible = false; gunGroup.visible = false; bridge.visible = false
    const tube = new THREE.Mesh(new THREE.CapsuleGeometry(.29, length * STEP * .71, 4, 12), material)
    tube.rotation.z = Math.PI / 2; tube.position.y = .24; hull.add(tube)
    const tower = new THREE.Mesh(new THREE.BoxGeometry(.54, .27, .28), darkMetal)
    tower.position.set(-.2, .51, 0); hull.add(tower)
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(.025, .025, .34, 6), cabinMaterial)
    scope.position.set(-.2, .79, 0); hull.add(scope)
  } else if (ship.type === 'Battleship') {
    const aft = gunGroup.clone(); aft.position.x = -length * STEP * .46; hull.add(aft)
  }
  hull.name = `ship-${ship.type}`
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
    vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `uniform float time; varying vec2 vUv;
      void main(){vec2 p=vUv*65.; float wave=sin(p.x*2.+time*.5+sin(p.y*1.6))*.5+.5;
      float fine=pow(max(0.,sin(p.x*4.-p.y*3.+time*.4)),18.);
      vec3 color=mix(vec3(.035,.14,.18),vec3(.07,.23,.27),wave*.12);
      gl_FragColor=vec4(color+vec3(.06,.13,.13)*fine*.10,1.);}`,
  })
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(180, 180), seaMaterial)
  sea.rotation.x = -Math.PI / 2; sea.position.y = -.31; sceneRoot.add(sea)
  const base = new THREE.Mesh(new THREE.BoxGeometry(BOARD + .32, .27, BOARD + .32), new THREE.MeshStandardMaterial({ color: '#295562', roughness: .5, metalness: .2 }))
  base.position.y = -.04; sceneRoot.add(base)
  const tiles: THREE.Mesh[] = []
  const tileGeometry = new THREE.BoxGeometry(STEP - .025, .065, STEP - .025)
  const tileMaterials = ['#225765', '#255e6b', '#205361', '#285d69'].map((color) => new THREE.MeshStandardMaterial({ color, metalness: .2, roughness: .4 }))
  for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) {
    const tile = new THREE.Mesh(tileGeometry, tileMaterials[(x * 3 + y * 5 + x * y) % 4])
    tile.position.set((x - 4.5) * STEP, .16, (y - 4.5) * STEP)
    tile.userData.coordinate = { x, y }; tiles.push(tile); sceneRoot.add(tile)
  }
  for (let i = 0; i < 10; i++) {
    for (const axis of ['x', 'y']) {
      const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeLabelTexture(axis === 'x' ? String.fromCharCode(65 + i) : String(i + 1)), depthWrite: false, depthTest: false, toneMapped: false }))
      label.position.set(axis === 'x' ? (i - 4.5) * STEP : -6.05, .35, axis === 'x' ? -6.05 : (i - 4.5) * STEP)
      label.scale.set(.55, .55, 1); sceneRoot.add(label)
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
  const raycaster = new THREE.Raycaster(), mouse = new THREE.Vector2()
  const locate = (event: PointerEvent) => {
    const bounds = canvas.getBoundingClientRect()
    mouse.set((event.clientX - bounds.left) / bounds.width * 2 - 1, 1 - (event.clientY - bounds.top) / bounds.height * 2)
    raycaster.setFromCamera(mouse, camera)
    return raycaster.intersectObjects(tiles, false)[0]?.object.userData.coordinate as Coordinate | undefined
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

  let raf = 0, lastFrame = 0
  const render = (now: number) => {
    if (disposed) return
    raf = requestAnimationFrame(render)
    if (!mount.clientWidth || !mount.clientHeight || document.hidden || lost || now - lastFrame < 1000 / (mini ? 20 : low ? 30 : 60)) return
    lastFrame = now
    seaMaterial.uniforms.time.value = reducedMotion.matches ? 0 : now / 1000
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
    mount.dataset.activeEffects = String(activeEffects.length)
    mount.dataset.sinkingShips = String(sinking.size)
    renderer.render(scene, camera)
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
      disposed = true; cancelAnimationFrame(raf); observer.disconnect()
      canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', cancel)
      canvas.removeEventListener('pointerleave', leave); canvas.removeEventListener('keydown', keydown)
      canvas.removeEventListener('webglcontextlost', contextLost); canvas.removeEventListener('webglcontextrestored', contextRestored)
      disposeTree(scene); renderer.dispose(); renderer.forceContextLoss(); canvas.remove()
    },
  }
}
