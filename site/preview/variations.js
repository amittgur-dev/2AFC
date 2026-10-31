// The variations offered on the preview page, in this order. `stimuli` names
// a folder site/preview/variations/<stimuli>/ with assets/ and stimuli.js
// (made by tools/build_variation.py from a handoff in data/preview/<stimuli>/handoff);
// `design` overrides the preview config's design block (see design.js for
// `order` and `groupOrder`). Several variations can share one stimulus set.
const SQUARES = 'Textures of 16 small squares and figures of four larger squares (8 references, 24 screens). Each comparison differs from the reference by a 45° rotation of the sub-shapes, of the whole object, or of the global shape only. Left/right placement is random on every screen.';
export const variations = [
  {
    id: 'random', stimuli: 'squares-diamonds', version: '2026-10-31',
    name: 'All screens in random order',
    description: SQUARES + ' All 24 screens are mixed together, never two in a row from the same reference.',
    design: {order: 'interleaved', avoidConsecutiveSameFamily: true},
  },
  {
    id: 'blocked-by-type', stimuli: 'squares-diamonds', version: '2026-10-31',
    name: 'Textures first, then figurative parts',
    description: SQUARES + ' The 12 texture screens come first in random order, then the 12 figurative-part screens in random order.',
    design: {order: 'blocked-by-group', groupOrder: ['texture', 'four figurative parts'], avoidConsecutiveSameFamily: true},
  },
  {
    id: 'blocked-by-reference', stimuli: 'squares-diamonds', version: '2026-10-31',
    name: 'Three screens per reference',
    description: SQUARES + ' The three screens of a reference follow each other in random order; the references come in random order, all textures either before or after all figurative parts (decided at random).',
    design: {order: 'blocked-by-family', groupOrder: 'random', avoidConsecutiveSameFamily: false},
  },
];
