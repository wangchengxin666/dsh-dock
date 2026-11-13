/**
 * File manager — sidebar glyph.
 *
 * A folder with a small drive bar, drawn as plain path data at the 36-unit
 * canvas Plugin Manager uses. The layers use `currentColor` with opacity, so
 * the sidebar's own ink colour decides how it looks in either theme.
 */

/** Icon canvas. */
export const ICON_VIEWBOX = '0 0 36 36'

/** Flat path definitions, back to front. */
export const ICON_PATHS = [
  // Folder back: a rounded tab and body, filled with a muted tint.
  {
    d: 'M7 12.5a2.5 2.5 0 0 1 2.5-2.5h6.2l2.6 3H26.5A2.5 2.5 0 0 1 29 15.5v10A2.5 2.5 0 0 1 26.5 28h-17A2.5 2.5 0 0 1 7 25.5v-13Z',
    fill: 'currentColor', fillOpacity: 0.9,
  },
  // Folder front: a lighter band across the lower half.
  {
    d: 'M7 18.5h22v7a2.5 2.5 0 0 1-2.5 2.5h-17A2.5 2.5 0 0 1 7 25.5v-7Z',
    fill: 'currentColor', fillOpacity: 0.55,
  },
  // Drive slot: a dark rounded bar that reads as storage at row size.
  {
    d: 'M11.5 21h13a1.2 1.2 0 0 1 1.2 1.2v2.1a1.2 1.2 0 0 1-1.2 1.2h-13a1.2 1.2 0 0 1-1.2-1.2v-2.1A1.2 1.2 0 0 1 11.5 21Z',
    fill: 'currentColor', fillOpacity: 0.3,
  },
  // Status dot on the slot.
  {
    d: 'M21.6 24.25a1 1 0 1 1 2 0 1 1 0 0 1-2 0Z',
    fill: 'currentColor',
    fillOpacity: 0.95,
  },
]