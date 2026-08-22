/**
 * IFC globally-unique identifiers, derived rather than drawn from a hat.
 *
 * IFC gives every object a 22-character GlobalId in its own base-64 alphabet.
 * The obvious implementation is a random UUID per export, and it is wrong for
 * this codebase: exporting the same building twice would produce two files
 * that no receiving tool could tell were the same building, and a wall that
 * had not moved would arrive as a new wall. The handoff's §49 asks for a
 * stable mapping from our key to an IFC GlobalId precisely so a downstream
 * scene knows which object changed.
 *
 * So the id is a pure function of the key. The keys are already stable across
 * a re-pack, which is what makes this worth doing.
 */

/** IFC's base-64 alphabet, which is its own and not RFC 4648. */
const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$";

/**
 * A 128-bit digest of a string.
 *
 * Not cryptographic and not trying to be — it needs to be deterministic,
 * well spread, and identical in Node and the browser, because this runs both
 * server-side and behind a download button. Four independently seeded FNV-1a
 * lanes mixed at the end.
 */
function digest128(input: string): bigint {
  const SEEDS = [0x811c9dc5, 0x01000193, 0x9e3779b9, 0x85ebca6b];
  const lanes = SEEDS.map((seed) => {
    let h = seed >>> 0;
    for (let i = 0; i < input.length; i++) {
      h ^= input.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
      h ^= h >>> 13;
    }
    // A final avalanche, so short keys differing in one character do not land
    // in neighbouring buckets.
    h ^= h >>> 16;
    h = Math.imul(h, 0x7feb352d) >>> 0;
    h ^= h >>> 15;
    return BigInt(h >>> 0);
  });
  return (lanes[0] << 96n) | (lanes[1] << 64n) | (lanes[2] << 32n) | lanes[3];
}

/**
 * The IFC GlobalId for one of our object keys.
 *
 * Twenty-two characters: the first carries two bits, the remaining twenty-one
 * carry six each, which is the 128 bits IFC asks for.
 */
export function ifcGuid(key: string): string {
  let n = digest128(key);
  const out: string[] = new Array(22);
  for (let i = 21; i >= 1; i--) {
    out[i] = ALPHABET[Number(n & 63n)];
    n >>= 6n;
  }
  out[0] = ALPHABET[Number(n & 3n)];
  return out.join("");
}
