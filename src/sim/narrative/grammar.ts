/**
 * Tiny Tracery-style grammar (Centuria 2.0 §E). `#symbol#` expands to one of
 * the symbol's alternatives; `#symbol.cap#` capitalizes the first letter and
 * `#symbol.upper#` shouts it. Choices are hashed from a key, never drawn from
 * a sim RNG stream, so text is stable across reloads and costs no determinism.
 */
import { hash01 } from '../rng';

export type Grammar = Readonly<Record<string, readonly string[]>>;

const TOKEN = /#([a-zA-Z_]+)(?:\.(cap|upper|lower))?#/g;

export function expand(g: Grammar, start: string, key: string, vars: Readonly<Record<string, string>> = {}, depth = 0): string {
  if (depth > 8) return start;
  let n = 0;
  return start.replace(TOKEN, (_m, sym: string, mod: string | undefined) => {
    n++;
    let out: string;
    if (sym in vars) out = vars[sym];
    else {
      const alts = g[sym];
      if (!alts || !alts.length) return sym;
      const pick = alts[Math.floor(hash01(key, sym, depth, n) * alts.length)];
      out = expand(g, pick, `${key}/${sym}${n}`, vars, depth + 1);
    }
    if (mod === 'cap') return out.charAt(0).toUpperCase() + out.slice(1);
    if (mod === 'upper') return out.toUpperCase();
    if (mod === 'lower') return out.toLowerCase();
    return out;
  });
}
