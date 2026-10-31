// Trial sequence construction: order, repetitions and left/right assignment.
// Pure functions so the design can be tested without a browser.

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

const CONTROL_POSITIONS = ['random', 'first', 'excluded'];
const SIDE_ASSIGNMENTS = ['random', 'fixed', 'both'];
const ORDERS = ['interleaved', 'blocked-by-group', 'blocked-by-family'];
export function validateDesign(design) {
  if (!CONTROL_POSITIONS.includes(design.controlPosition)) throw new Error(`design.controlPosition must be one of ${CONTROL_POSITIONS.join(', ')}; got "${design.controlPosition}"`);
  if (design.order !== undefined && !ORDERS.includes(design.order)) throw new Error(`design.order must be one of ${ORDERS.join(', ')}; got "${design.order}"`);
  if (design.groupOrder !== undefined && design.groupOrder !== 'random' && !Array.isArray(design.groupOrder)) throw new Error('design.groupOrder must be "random" or an array of group names');
  if (!SIDE_ASSIGNMENTS.includes(design.sideAssignment)) throw new Error(`design.sideAssignment must be one of ${SIDE_ASSIGNMENTS.join(', ')}; got "${design.sideAssignment}"`);
  if (!Number.isInteger(design.repetitions) || design.repetitions < 1) throw new Error(`design.repetitions must be a positive integer; got ${design.repetitions}`);
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
// consecutive presentations come from the same object family, and the first
// item differs in family from `previous` (the last item of the preceding
// pass) when given. Retries a plain shuffle (deterministic given the seed),
// then tries a greedy repair that checks both neighbours of every swap. The
// result may still violate the constraint for impossible inputs; callers can
// check with hasConsecutiveSameFamily().
export function interleave(items, random, previous = null, maxTries = 200) {
  const prevFamily = previous ? previous.family_id : undefined;
  const conflicts = seq => seq.map((p, i) => (i === 0 ? prevFamily : seq[i - 1].family_id) === p.family_id ? i : -1).filter(i => i >= 0);
  let best = shuffle(items, random);
  for (let i = 0; i < maxTries && conflicts(best).length; i++) best = shuffle(items, random);
  // Greedy repair: swap each conflicting item with another whose move creates
  // no new conflict at either position; repeat while progress is made.
  const fam = (seq, k) => (k < 0 ? prevFamily : k >= seq.length ? undefined : seq[k].family_id);
  const fitsAt = (seq, k, item, other) => {
    const left = k - 1 === other ? seq[k].family_id : fam(seq, k - 1);
    const right = k + 1 === other ? seq[k].family_id : fam(seq, k + 1);
    return left !== item.family_id && right !== item.family_id;
  };
  for (let pass = 0; pass < best.length; pass++) {
    const bad = conflicts(best);
    if (!bad.length) break;
    let progress = false;
    for (const i of bad) {
      for (let j = 0; j < best.length; j++) {
        if (j === i || Math.abs(j - i) === 1 && best[i].family_id === best[j].family_id) continue;
        if (fitsAt(best, i, best[j], j) && fitsAt(best, j, best[i], i)) { [best[i], best[j]] = [best[j], best[i]]; progress = true; break; }
      }
    }
    if (!progress) break;
  }
  return best;
}

// Builds one participant's presentation order. Returns {sequence, interleaved}
// where `interleaved` reports whether the no-consecutive-family constraint was
// met over the segments that were shuffled (true/false), or null when the
// constraint was not requested.
export function buildDesign(design, seed, trials) {
  validateDesign(design);
  if (!Array.isArray(trials) || !trials.length) throw new Error('buildDesign needs the experiment\'s trials');
  const random = rng(seed);
  const control = trials.filter(t => t.family === 0);
  const others = trials.filter(t => t.family !== 0);
  const sequence = [];
  const constrained = design.randomizeTrialOrder && design.avoidConsecutiveSameFamily;
  let interleaved = constrained ? true : null; // null: the constraint was not requested
  const last = () => (sequence.length ? sequence[sequence.length - 1] : null);
  const mix = items => {
    const prev = last();
    const mixed = !design.randomizeTrialOrder ? items : constrained ? interleave(items, random, prev) : shuffle(items, random);
    if (constrained && (hasConsecutiveSameFamily(mixed) || (prev && mixed.length && mixed[0].family_id === prev.family_id))) interleaved = false;
    return mixed;
  };
  // Presentation order (design.order):
  //   'interleaved' (default): every screen shuffled together, the control
  //     placed per controlPosition.
  //   'blocked-by-group': one block per trial group (design.groupOrder: the
  //     group names in order, or 'random'); the screens of a block shuffled.
  //   'blocked-by-family': blocks per group as above; within a block the
  //     families (references) in random order and each family's screens
  //     consecutive, in random order. The same-family constraint is moot.
  const order = design.order ?? 'interleaved';
  const groupsOf = items => {
    const names = [...new Set(items.map(t => t.group))];
    if (Array.isArray(design.groupOrder)) {
      const unknown = names.filter(g => !design.groupOrder.includes(g));
      if (unknown.length) throw new Error('design.groupOrder does not list the group(s) ' + unknown.join(', '));
      return design.groupOrder.filter(g => names.includes(g));
    }
    return shuffle(names, random);
  };
  if (order !== 'interleaved') {
    if (order === 'blocked-by-family') interleaved = null;
    const all = design.controlPosition === 'excluded' ? others : trials;
    for (let rep = 0; rep < design.repetitions; rep++) {
      for (const g of groupsOf(all)) {
        const block = all.filter(t => t.group === g).flatMap(t => variants(t, design, random, rep));
        if (order === 'blocked-by-group') sequence.push(...mix(block));
        else for (const f of shuffle([...new Set(block.map(p => p.family_id))], random)) sequence.push(...shuffle(block.filter(p => p.family_id === f), random));
      }
    }
    return {sequence: sequence.map((p, i) => ({presentation_index: i, ...p})), interleaved};
  }
  for (let rep = 0; rep < design.repetitions; rep++) {
    const pool = others.flatMap(t => variants(t, design, random, rep));
    const controls = design.controlPosition === 'excluded' ? [] : control.flatMap(t => variants(t, design, random, rep));
    if (design.controlPosition === 'random') sequence.push(...mix([...pool, ...controls]));
    else { sequence.push(...controls); sequence.push(...mix(pool)); } // a leading control block is deliberate, not a constraint failure
  }
  return {sequence: sequence.map((p, i) => ({presentation_index: i, ...p})), interleaved};
}
// Convenience: the ordered presentations only.
export function buildSequence(design, seed, trials) { return buildDesign(design, seed, trials).sequence; }

export function assetsFor(p, assets) {
  return [p.reference_asset_id, p.left_asset_id, p.right_asset_id].map(id => assets[id]);
}
export function allAssetIds(assets) {
  return Object.keys(assets);
}
