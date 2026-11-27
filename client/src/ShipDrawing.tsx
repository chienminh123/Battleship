import { useId } from 'react'
import type { ShipType } from './types'

/** Top-down deck plans share the same bow direction and footprint as the 3D fleet. */
export function ShipDrawing({ length, vertical = false, type = 'Destroyer' }: { length: number; vertical?: boolean; type?: ShipType }) {
  const id = useId().replace(/:/g, '')
  const w = length * 100
  const carrier = type === 'Carrier', sub = type === 'Submarine'
  const hull = sub ? `M40 22 H${w - 48} Q${w - 8} 22 ${w - 8} 50 Q${w - 8} 78 ${w - 48} 78 H40 Q8 78 8 50 Q8 22 40 22Z`
    : `M18 18 H${w - 82} Q${w - 42} 18 ${w - 8} 50 Q${w - 42} 82 ${w - 82} 82 H18 Q8 50 18 18Z`
  const turret = (x: number, aft = false, twin = true) => <g key={x} transform={`translate(${x} 50)${aft ? ' rotate(180)' : ''}`}>
    <circle r="17" className="ship-hardware" /><path d="M-14-11H10L17 0 10 11H-14Z" className="ship-bridge" />
    <path d={twin ? 'M6-5H39M6 5H39' : 'M6 0H37'} className="ship-barrel" />
  </g>
  return <svg className="ship-drawing" data-ship-type={type} viewBox={vertical ? `0 0 100 ${w}` : `0 0 ${w} 100`} preserveAspectRatio="none" aria-hidden="true">
    <defs>
      <linearGradient id={`${id}-metal`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#d2ded9" /><stop offset=".48" stopColor="#7d9695" /><stop offset="1" stopColor="#405e67" /></linearGradient>
      <linearGradient id={`${id}-deck`} x1="0" y1="0" x2="1" y2="1"><stop stopColor={carrier ? '#52666d' : '#728381'} /><stop offset="1" stopColor="#314f58" /></linearGradient>
    </defs>
    <g transform={vertical ? 'translate(100 0) rotate(90)' : undefined}>
      <path d={hull} className="ship-waterline" transform="translate(-3 3)" />
      <path d={hull} className="ship-hull" style={{ fill: `url(#${id}-metal)` }} />
      <path d={hull} fill={`url(#${id}-deck)`} transform={`translate(${w * .035} 7) scale(.93 .86)`} />
      <path d={`M26 22H${w - 84}Q${w - 48} 22 ${w - 18} 50M26 78H${w - 84}Q${w - 48} 78 ${w - 18} 50`} className="ship-railing" />
      {carrier ? <>
        <path d={`M35 33H${w - 73}L${w - 38} 50H35Z`} className="ship-runway" />
        <path d={`M42 41H${w - 88}`} className="ship-runway-line" strokeDasharray="17 12" />
        <path d={`M65 28V55M75 28V55M${w - 104} 28V55M${w - 94} 28V55`} className="ship-runway-line" />
        <path d={`M${w * .3} 61H${w * .7}`} className="ship-detail" />
        <rect x={w * .42} y="61" width="88" height="17" rx="3" className="ship-hardware" />
        <rect x={w * .48} y="64" width="35" height="12" rx="2" className="ship-bridge" />
        <path d={`M${w * .51} 60V79M${w * .49} 69H${w * .54}`} className="ship-mast" />
        {[.18, .32, .76].map((x) => <g key={x} transform={`translate(${w * x} 60) scale(.7)`}><path d="m18 0-14-3-8-13-4 1 4 12-12 1-5-5-3 1 2 8 16 2 8 10 4-1-4-10Z" className="ship-aircraft" /></g>)}
        <text x={w - 88} y="66" className="ship-deck-number">01</text>
      </> : sub ? <>
        <path d={`M44 50H${w - 30}`} className="ship-detail" />
        <path d="M43 22V78M52 26V74" className="ship-railing" />
        <path d={`M${w - 50} 20V80M${w - 55} 50H${w - 25}`} className="ship-fin" />
        <rect x={w * .39} y="31" width={w * .19} height="38" rx="14" className="ship-hardware" />
        <rect x={w * .42} y="37" width={w * .10} height="26" rx="8" className="ship-bridge" />
        <path d={`M${w * .46} 39V61M${w * .44} 45H${w * .53}`} className="ship-mast" />
        {[.25, .68, .78].map((x) => <circle key={x} cx={w * x} cy="50" r="6" className="ship-hatch" />)}
      </> : <>
        {Array.from({ length: length * 2 }, (_, i) => <path key={i} d={`M${30 + i * 32} 25v5m0 40v5`} className="ship-railing" />)}
        <rect x={w * .34} y="31" width={w * .28} height="38" rx="4" className="ship-hardware" />
        <rect x={w * .42} y="35" width={w * .15} height="30" rx="3" className="ship-bridge" />
        <path d={`M${w * .46} 35v30M${w * .4} 50h${w * .19}`} className="ship-mast" />
        <rect x={w * .34} y="38" width="15" height="24" rx="4" className="ship-funnel" />
        {type === 'Cruiser' && <rect x={w * .58} y="39" width="14" height="22" rx="4" className="ship-funnel" />}
        {turret(w * .73, false, type !== 'Destroyer')}
        {turret(w * .22, true, type === 'Battleship')}
        {type === 'Battleship' && turret(w * .60, false)}
        <circle cx={w * .12} cy="50" r="10" className="ship-hatch" />
        <path d={`M${w * .12 - 6} 50h12m-6-6v12`} className="ship-railing" />
        <path d={`M${w - 43} 43v14m-5-7h10`} className="ship-anchor" />
        <path d={`M${w * .35} 34h${w * .2}`} className="ship-windows" />
      </>}
    </g>
  </svg>
}
