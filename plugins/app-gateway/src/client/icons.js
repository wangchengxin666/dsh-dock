export function AppGatewayNavIcon({ React, size = 18 }) {
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
    h('circle', { cx: 12, cy: 12, r: 9 }),
    h('path', { d: 'M3.6 9h16.8M3.6 15h16.8M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18' }),
  )
}
