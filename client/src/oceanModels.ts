import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { ShipView } from './types'

const STEP = 1.12

function hullGeometry(length: number, width: number, depth: number) {
  const s = new THREE.Shape(), h = length / 2, r = width / 2
  s.moveTo(-h + .08, -r * .85)
  s.lineTo(h - length * .22, -r)
  s.bezierCurveTo(h - .22, -r, h + .04, -.1, h + .06, 0)
  s.bezierCurveTo(h + .04, .1, h - .22, r, h - length * .22, r)
  s.lineTo(-h + .08, r * .85)
  s.quadraticCurveTo(-h - .04, 0, -h + .08, -r * .85)
  const geometry = new THREE.ExtrudeGeometry(s, { depth, steps: 1, bevelEnabled: true, bevelSegments: 2, bevelSize: .018, bevelThickness: .018, curveSegments: 12 })
  geometry.rotateX(-Math.PI / 2)
  return geometry
}

/** Batch all fittings by material: detailed decks cost a handful of draw calls per ship. */
export function createShipModel(ship: ShipView) {
  const root = new THREE.Group(), length = ship.cells.length * STEP * .91
  const body = new THREE.Group(); body.name = 'ship-body'; root.add(body)
  const carrier = ship.type === 'Carrier', sub = ship.type === 'Submarine'
  const colors = {
    hull: ship.isSunk ? '#79595a' : sub ? '#3b555f' : '#718b90',
    deck: carrier ? '#364952' : '#53696c', light: '#b4c5c2', dark: '#253a43',
    glass: '#1c424f', paint: '#d8d9bf', brass: '#9e9982',
  }
  type Finish = keyof typeof colors
  const pieces = new Map<Finish, THREE.BufferGeometry[]>()
  const add = (finish: Finish, geo: THREE.BufferGeometry, x: number, y: number, z: number, rotation?: THREE.Euler) => {
    if (rotation) geo.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(rotation))
    geo.translate(x, y, z)
    const flat = geo.index ? geo.toNonIndexed() : geo
    if (flat !== geo) geo.dispose()
    const list = pieces.get(finish) ?? []; list.push(flat); pieces.set(finish, list)
  }
  const box = (finish: Finish, x: number, y: number, z: number, a: number, b: number, c: number) => add(finish, new THREE.BoxGeometry(a, b, c), x, y, z)
  const cylinder = (finish: Finish, x: number, y: number, z: number, radius: number, height: number, rotation?: THREE.Euler) =>
    add(finish, new THREE.CylinderGeometry(radius * .92, radius, height, 10), x, y, z, rotation)
  const alongX = new THREE.Euler(0, 0, Math.PI / 2)
  const mast = (x: number, z = 0) => {
    cylinder('light', x, .85, z, .017, .46)
    box('dark', x, .97, z, .19, .018, .024)
    box('light', x, 1.04, z, .025, .06, .19)
    cylinder('dark', x, 1.1, z, .045, .026)
  }
  const gun = (x: number, direction = 1, barrels = 2, size = 1) => {
    cylinder('dark', x, .41, 0, .19 * size, .05)
    box('light', x, .49, 0, .28 * size, .14, .29 * size)
    for (let i = 0; i < barrels; i++) {
      const z = (i - (barrels - 1) / 2) * .09
      cylinder('dark', x + direction * .24 * size, .53, z, .025 * size, .36 * size, alongX)
      cylinder('light', x + direction * .39 * size, .53, z, .028 * size, .05, alongX)
    }
  }
  const bridge = (x: number, width = .36) => {
    box('hull', x, .41, 0, .85, .09, .53)
    box('light', x, .55, 0, .58, .22, width)
    box('glass', x + .04, .65, 0, .52, .045, width + .018)
    box('light', x + .06, .71, 0, .47, .07, width + .04)
    box('dark', x + .04, .76, 0, .28, .025, .27)
    mast(x + .03)
  }
  // Waterline and deck have distinct profiles instead of a stack of rectangular blocks.
  if (!sub) {
    add('dark', hullGeometry(length, carrier ? .76 : .64, .08), 0, .015, 0)
    add('hull', hullGeometry(length, carrier ? .75 : .63, .18), 0, .06, 0)
    add('deck', hullGeometry(length * .965, carrier ? .70 : .58, .035), 0, .265, 0)
    // Deck edge railings, bollards and liferafts are repeated locally, then merged.
    for (const side of [-1, 1]) {
      const z = side * (carrier ? .35 : .29)
      box('light', -.12, .34, z, length * .73, .014, .014)
      for (let i = 0; i < Math.floor(length * 3); i++) {
        const x = -length * .43 + i * .30
        cylinder('light', x, .32, z, .008, .09)
      }
      for (const x of [-length * .34, length * .28]) {
        cylinder('dark', x, .32, z * .72, .025, .06)
        box('light', x, .355, z * .72, .10, .018, .025)
      }
      for (let i = 0; i < 3; i++) box('brass', -.34 + i * .18, .35, z * 1.02, .10, .065, .065)
    }
  }
  if (carrier) {
    // Full flight deck, landing strip, arrestor wires and starboard island.
    box('deck', 0, .335, 0, length * .93, .06, .74)
    box('paint', .08, .369, -.08, length * .83, .006, .012)
    box('paint', .08, .369, .16, length * .83, .006, .012)
    for (let i = 0; i < 12; i++) box('paint', -length * .40 + i * .34, .373, .04, .16, .006, .014)
    for (let i = 0; i < 4; i++) box('paint', -length * .30 + i * .10, .374, .04, .012, .006, .28)
    box('paint', length * .35, .374, .04, .012, .006, .28)
    box('hull', -.14, .47, -.26, .96, .20, .22)
    box('light', -.02, .64, -.26, .44, .14, .24)
    box('glass', .01, .70, -.26, .46, .04, .25)
    box('light', .02, .74, -.26, .49, .025, .27)
    box('dark', -.42, .64, -.27, .18, .22, .16)
    mast(-.05, -.26)
    for (const x of [-length * .32, -length * .11, length * .29]) {
      // Folded delta wings and tail fins make the parked aircraft readable at phone scale.
      add('light', new THREE.ConeGeometry(.075, .39, 8), x, .43, .25, new THREE.Euler(0, 0, -Math.PI / 2))
      const wing = new THREE.Shape(); wing.moveTo(-.09, -.17); wing.lineTo(.09, 0); wing.lineTo(-.09, .17); wing.closePath()
      const geo = new THREE.ShapeGeometry(wing); geo.rotateX(-Math.PI / 2)
      add('light', geo, x - .02, .445, .25)
      box('glass', x + .06, .46, .25, .08, .02, .035)
      box('dark', x - .14, .48, .25, .06, .10, .016)
    }
  } else if (sub) {
    add('hull', new THREE.CapsuleGeometry(.28, length - .57, 6, 16), 0, .13, 0, alongX)
    box('dark', -.18, .26, 0, length * .68, .06, .23)
    add('hull', new THREE.CapsuleGeometry(.13, .24, 4, 12), -.18, .44, 0, alongX)
    box('dark', -.18, .52, 0, .38, .18, .21)
    cylinder('light', -.15, .76, 0, .018, .35)
    cylinder('dark', -.06, .71, .06, .013, .25)
    box('light', -.10, .925, 0, .13, .025, .025)
    for (const x of [-length * .28, length * .28]) cylinder('dark', x, .395, 0, .065, .015)
    box('hull', -length * .39, .18, 0, .13, .045, .91)
    box('hull', -length * .42, .27, 0, .24, .38, .04)
    box('hull', length * .30, .17, 0, .10, .035, .77)
    cylinder('brass', -length * .49, .12, 0, .14, .035, alongX)
  } else {
    bridge(-length * .07, ship.type === 'Battleship' ? .40 : .32)
    const twin = ship.type === 'Battleship' ? 3 : ship.type === 'Cruiser' ? 2 : 1
    gun(length * .31, 1, twin, ship.type === 'Battleship' ? 1 : .8)
    gun(-length * .32, -1, twin, .8)
    if (ship.type === 'Battleship') gun(length * .17, 1, 3, .9)
    for (const x of ship.type === 'Cruiser' ? [-.48, -.1] : [-.45]) {
      cylinder('hull', x, .57, .03, .09, .31)
      cylinder('dark', x, .73, .03, .085, .025)
    }
    for (const side of [-1, 1]) {
      box('light', -.12, .42, side * .245, .23, .06, .10)
      for (let i = 0; i < 4; i++) box('glass', -length * .18 + i * .12, .20, side * .32, .055, .025, .008)
    }
    if (ship.type === 'Cruiser') {
      for (let i = 0; i < 3; i++) cylinder('dark', length * .12, .42, -.13 + i * .13, .035, .25, new THREE.Euler(0, 0, -.3))
    }
    // Aft helicopter landing pad / hatch grid, kept clear of the aft gun.
    for (const z of [-.09, .09]) box('paint', -length * .43, .31, z, .12, .006, .012)
    box('paint', -length * .43, .31, 0, .012, .006, .18)
  }
  for (const [finish, geometries] of pieces) {
    const geometry = mergeGeometries(geometries)
    geometries.forEach((part) => part.dispose())
    if (!geometry) continue
    const material = new THREE.MeshStandardMaterial({ color: colors[finish], roughness: finish === 'glass' ? .23 : .68, metalness: finish === 'glass' ? .5 : .25, side: finish === 'light' ? THREE.DoubleSide : THREE.FrontSide })
    body.add(new THREE.Mesh(geometry, material))
  }
  // A single soft contact shadow anchors the hull in the water without shadow maps.
  const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 64
  const ctx = canvas.getContext('2d')!
  const shadow = ctx.createRadialGradient(128, 128, 2, 128, 128, 125)
  shadow.addColorStop(0, '#031921a0'); shadow.addColorStop(.65, '#03192170'); shadow.addColorStop(1, '#03192100')
  ctx.scale(1, .25); ctx.fillStyle = shadow; ctx.fillRect(0, 0, 256, 256)
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace
  const contact = new THREE.Mesh(new THREE.PlaneGeometry(length * 1.10, .95), new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, opacity: .6 }))
  contact.rotation.x = -Math.PI / 2; contact.position.y = .075; root.add(contact)
  root.name = `ship-${ship.type}`
  return root
}
