export function EvolveNavIcon({ React, size = 18 }) {
  const h = React.createElement
  return h(
    'svg',
    {
      width: size,
      height: size,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.9,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      'aria-hidden': 'true',
      style: { display: 'block' },
    },
    h('path', { d: 'M3 12a9 9 0 0 1 15.4-6.3' }),
    h('polyline', { points: '19 2 19 8 13 8' }),
    h('path', { d: 'M21 12a9 9 0 0 1-15.4 6.3' }),
    h('polyline', { points: '5 22 5 16 11 16' }),
  )
}
