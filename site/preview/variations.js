// The variations offered on the preview page, in this order. `stimuli` names
// a folder site/preview/variations/<stimuli>/ with assets/ and stimuli.js
// (made by tools/build_variation.py from a handoff in data/preview/<stimuli>/handoff);
// `points` are the bullets shown under the name; `design` overrides the
// preview config's design block (see design.js for `order` and `groupOrder`).
// Several variations can share one stimulus set.
export const variations = [
  {
    id: 'random', stimuli: 'squares-diamonds', version: '2026-10-31',
    name: 'Random order',
    points: ['All 2AFC trials in random order'],
    design: {order: 'interleaved', avoidConsecutiveSameFamily: true},
  },
  {
    id: 'blocked-by-type', stimuli: 'squares-diamonds', version: '2026-10-31',
    name: 'Blocks by type of form',
    points: ['First a block of forms made of texture, then a block of forms made of figurative parts', 'The 2AFC trials within each block in random order'],
    design: {order: 'blocked-by-group', groupOrder: ['texture', 'four figurative parts'], avoidConsecutiveSameFamily: true},
  },
  {
    id: 'blocked-by-reference', stimuli: 'squares-diamonds', version: '2026-10-31',
    name: 'Blocks by reference',
    points: ['The three 2AFC trials of a reference in a row, in random order', 'References in random order', 'All texture forms before or after all figurative-part forms, at random'],
    design: {order: 'blocked-by-family', groupOrder: 'random', avoidConsecutiveSameFamily: false},
  },
];
