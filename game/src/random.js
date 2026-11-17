// A small seeded random number generator (mulberry32): the same seed gives the same game,
// which is what makes the screenshot scenes repeatable and the autopilot deterministic.

export function createRandom(seed) {
  let a = seed | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pick one entry of `table` (an array of [weight, value]) by the seeded roll. */
export function pickWeighted(random, table) {
  let total = 0;
  for (const entry of table) total += entry[0];
  let roll = random() * total;
  for (const entry of table) {
    roll -= entry[0];
    if (roll <= 0) return entry[1];
  }
  return table[table.length - 1][1];
}
