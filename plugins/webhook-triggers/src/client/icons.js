export function WebhookNavIcon({ React, size = 18 }) {
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
    h('polygon', { points: '13 2 3 14 12 14 11 22 21 10 12 10 13 2' }),
  )
}
