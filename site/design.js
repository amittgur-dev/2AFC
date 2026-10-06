// Trial sequence construction: order, repetitions and left/right assignment.
// Pure functions so the design can be tested without a browser.
import {assets, trials} from './stimuli.js';

// Small seeded PRNG (mulberry32) so an assigned order can be reproduced from
// the recorded seed.
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function shuffle(items, random) {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function presentation(trial, reversed, repetition) {
  const left = reversed ? trial.right : trial.left;
  const right = reversed ? trial.left : trial.right;
  const id = v => `${trial.family}-${v}`;
  return {
    trial_id: trial.id,
    family_id: trial.family,
    family_name: trial.name,
    group: trial.group,
    repetition_index: repetition,
    reference_asset_id: id('A'),
    left_asset_id: id(left),
    right_asset_id: id(right),
    left_condition: left,
    right_condition: right,
    side_assignment: reversed ? 'reversed' : 'canonical',
  };
}

function variants(trial, design, random, rep) {
  if (design.sideAssignment === 'both') return [presentation(trial, false, rep), presentation(trial, true, rep)];
  if (design.sideAssignment === 'fixed') return [presentation(trial, false, rep)];
  return [presentation(trial, random() < .5, rep)];
}
export function hasConsecutiveSameFamily(items) {
  return items.some((p, i) => i > 0 && p.family_id === items[i - 1].family_id);
}
// Shuffle so that every question is interleaved with the others: no two
// consecutive presentations come from the same object family. Retries a plain
// shuffle (deterministic given the seed) and falls back to a greedy repair.
export function interleave(items, random, maxTries = 200) {
  let best = shuffle(items, random);
  for (let i = 0; i < maxTries && hasConsecutiveSameFamily(best); i++) best = shuffle(items, random);
  if (!hasConsecutiveSameFamily(best)) return best;
  for (let i = 1; i < best.length; i++) {
    if (best[i].family_id !== best[i - 1].family_id) continue;
    const j = best.findIndex((p, k) => k > i && p.family_id !== best[i - 1].family_id && (k + 1 >= best.length || best[k + 1].family_id !== p.family_id) && (best[i + 1] === undefined || best[i + 1].family_id !== p.family_id));
    if (j > 0) [best[i], best[j]] = [best[j], best[i]];
  }
  return best;
}

// Returns an ordered array of presentations for one participant.
export function buildSequence(design, seed) {
  const random = rng(seed);
  const control = trials.filter(t => t.family === 0);
  const others = trials.filter(t => t.family !== 0);
  const sequence = [];
  for (let rep = 0; rep < Math.max(1, design.repetitions | 0); rep++) {
    const pool = others.flatMap(t => variants(t, design, random, rep));
    const controls = design.controlPosition === 'excluded' ? [] : control.flatMap(t => variants(t, design, random, rep));
    const mix = items => design.randomizeTrialOrder ? (design.avoidConsecutiveSameFamily ? interleave(items, random) : shuffle(items, random)) : items;
    if (design.controlPosition === 'random') sequence.push(...mix([...pool, ...controls]));
    else sequence.push(...controls, ...mix(pool));
  }
  return sequence.map((p, i) => ({presentation_index: i, ...p}));
}

export function assetsFor(p) {
  return [p.reference_asset_id, p.left_asset_id, p.right_asset_id].map(id => assets[id]);
}
export function allAssetIds() {
  return Object.keys(assets);
}
