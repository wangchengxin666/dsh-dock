export function MeshNavIcon({ React, size = 18 }) {
  const H = React.createElement
  return H(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      viewBox: '0 0 24 24',
      width: size,
      height: size,
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.75,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      'aria-hidden': 'true',
      style: { display: 'block', flexShrink: 0 },
    },
    // Subtle orbital ring linking federated nodes
    H('circle', {
      cx: 12,
      cy: 12.2,
      r: 7.4,
      strokeOpacity: 0.28,
      strokeWidth: 1.4,
    }),
    // Spokes from center nexus to orbital pods
    H('path', {
      d: 'M12 9.4V6.8M9.5 13.6L6.6 15.3M14.5 13.6L17.4 15.3',
    }),
    // Center crystalline nexus with duo-tone translucent fill
    H('polygon', {
      points: '12,9.1 14.7,10.65 14.7,13.75 12,15.3 9.3,13.75 9.3,10.65',
      fill: 'currentColor',
      fillOpacity: 0.18,
    }),
    // Elevated moderator/conductor node & two peer pods
    H('circle', { cx: 12, cy: 4.8, r: 2.1, fill: 'currentColor', fillOpacity: 0.22 }),
    H('circle', { cx: 5.2, cy: 16.4, r: 2 }),
    H('circle', { cx: 18.8, cy: 16.4, r: 2 }),
  )
}

export function AgentIcon({ React, size = 13 }) {
  const H = React.createElement
  return H(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      viewBox: '0 0 16 16',
      width: size,
      height: size,
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.4,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      className: 'sm-icon',
      'aria-hidden': 'true',
    },
    H('polygon', {
      points: '8,1.5 13.6,4.75 13.6,11.25 8,14.5 2.4,11.25 2.4,4.75',
      fill: 'currentColor',
      fillOpacity: 0.12,
    }),
    H('circle', { cx: 8, cy: 8, r: 2, fill: 'currentColor' }),
  )
}

export function HumanIcon({ React, size = 13 }) {
  const H = React.createElement
  return H(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      viewBox: '0 0 16 16',
      width: size,
      height: size,
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.4,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      className: 'sm-icon',
      'aria-hidden': 'true',
    },
    H('circle', { cx: 8, cy: 5.2, r: 2.5, fill: 'currentColor', fillOpacity: 0.14 }),
    H('path', { d: 'M3.2 13.8C3.6 11.1 5.5 9.6 8 9.6C10.5 9.6 12.4 11.1 12.8 13.8' }),
  )
}

export function ModeratorCrownIcon({ React, size = 13 }) {
  const H = React.createElement
  return H(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      viewBox: '0 0 16 16',
      width: size,
      height: size,
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.4,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      className: 'sm-icon',
      'aria-hidden': 'true',
    },
    H('path', {
      d: 'M2.2 12L3.3 5L6.4 7.8L8 3.6L9.6 7.8L12.7 5L13.8 12H2.2Z',
      fill: 'currentColor',
      fillOpacity: 0.18,
    }),
  )
}

export function SystemBellIcon({ React, size = 13 }) {
  const H = React.createElement
  return H(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      viewBox: '0 0 16 16',
      width: size,
      height: size,
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.4,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      className: 'sm-icon',
      'aria-hidden': 'true',
    },
    H('path', {
      d: 'M4.5 6.8C4.5 4.7 6 3 8 3C10 3 11.5 4.7 11.5 6.8V10L12.8 11.6H3.2L4.5 10V6.8Z',
      fill: 'currentColor',
      fillOpacity: 0.12,
    }),
    H('path', { d: 'M6.8 13.4C7.2 13.9 8.8 13.9 9.2 13.4' }),
  )
}

export function RoundtableIcon({ React, size = 13 }) {
  const H = React.createElement
  return H(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      viewBox: '0 0 16 16',
      width: size,
      height: size,
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.4,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      className: 'sm-icon',
      'aria-hidden': 'true',
    },
    H('circle', { cx: 8, cy: 8, r: 4.8, strokeDasharray: '6 2.5' }),
    H('circle', { cx: 8, cy: 3.2, r: 1.3, fill: 'currentColor' }),
    H('circle', { cx: 12.2, cy: 10.4, r: 1.3, fill: 'currentColor' }),
    H('circle', { cx: 3.8, cy: 10.4, r: 1.3, fill: 'currentColor' }),
  )
}

export function AgendaIcon({ React, size = 13 }) {
  const H = React.createElement
  return H(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      viewBox: '0 0 16 16',
      width: size,
      height: size,
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.4,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      className: 'sm-icon',
      'aria-hidden': 'true',
    },
    H('rect', { x: 2.6, y: 2.2, width: 10.8, height: 11.6, rx: 2, fill: 'currentColor', fillOpacity: 0.1 }),
    H('path', { d: 'M5.2 6H10.8M5.2 8.8H10.8M5.2 11.4H8.6' }),
  )
}

export function SynthesisIcon({ React, size = 13 }) {
  const H = React.createElement
  return H(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      viewBox: '0 0 16 16',
      width: size,
      height: size,
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.4,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      className: 'sm-icon',
      'aria-hidden': 'true',
    },
    H('circle', { cx: 8, cy: 8, r: 5.8, fill: 'currentColor', fillOpacity: 0.14 }),
    H('path', { d: 'M5.4 8.2L7.2 10L10.8 6.2' }),
  )
}

export function FileDocIcon({ React, size = 13 }) {
  const H = React.createElement
  return H(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      viewBox: '0 0 16 16',
      width: size,
      height: size,
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.4,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      className: 'sm-icon',
      'aria-hidden': 'true',
    },
    H('path', {
      d: 'M4 2.2H9.4L12.4 5.2V13.8H4V2.2Z',
      fill: 'currentColor',
      fillOpacity: 0.1,
    }),
    H('path', { d: 'M9.2 2.4V5.4H12.2' }),
  )
}

export function FolderIcon({ React, size = 13 }) {
  const H = React.createElement
  return H(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      viewBox: '0 0 16 16',
      width: size,
      height: size,
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.4,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      className: 'sm-icon',
      'aria-hidden': 'true',
    },
    H('path', {
      d: 'M2.2 4.2C2.2 3.5 2.7 3 3.4 3H6.4L7.6 4.5H12.6C13.3 4.5 13.8 5 13.8 5.7V11.8C13.8 12.5 13.3 13 12.6 13H3.4C2.7 13 2.2 12.5 2.2 11.8V4.2Z',
      fill: 'currentColor',
      fillOpacity: 0.16,
    }),
  )
}

export function BroadcastIcon({ React, size = 13 }) {
  const H = React.createElement
  return H(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      viewBox: '0 0 16 16',
      width: size,
      height: size,
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.4,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      className: 'sm-icon',
      'aria-hidden': 'true',
    },
    H('circle', { cx: 8, cy: 8, r: 1.6, fill: 'currentColor' }),
    H('path', { d: 'M5 5.2C3.6 6.7 3.6 9.3 5 10.8M11 5.2C12.4 6.7 12.4 9.3 11 10.8' }),
    H('path', { d: 'M3 3.4C1 5.9 1 10.1 3 12.6M13 3.4C15 5.9 15 10.1 13 12.6', strokeOpacity: 0.55 }),
  )
}

export function ClipIcon({ React, size = 13 }) {
  const H = React.createElement
  return H(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      viewBox: '0 0 16 16',
      width: size,
      height: size,
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.4,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      className: 'sm-icon',
      'aria-hidden': 'true',
    },
    H('path', { d: 'M11.6 6.2L7 10.8C5.9 11.9 4.2 11.9 3.1 10.8C2 9.7 2 8 3.1 6.9L8.2 1.8C9 1 10.3 1 11.1 1.8C11.9 2.6 11.9 3.9 11.1 4.7L6.2 9.6C5.8 10 5.1 10 4.7 9.6C4.3 9.2 4.3 8.5 4.7 8.1L8.9 3.9' }),
  )
}
