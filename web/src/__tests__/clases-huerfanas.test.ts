import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// Fase 2, R1 (S2, S5): every static class a component uses must have a CSS rule somewhere in web/src.
// A refactor that deletes a rule but keeps the className leaves raw, unstyled markup in production (WC-1, WC-2).

const SRC = join(__dirname, '..');

function walk(dir: string, ext: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === '__tests__' || name === 'generated') continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, ext, out);
    else if (path.endsWith(ext)) out.push(path);
  }
  return out;
}

/** Index of the brace that closes the one at `open`, skipping braces inside string literals. */
function closingBrace(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (c === '\'' || c === '"' || c === '`') {
      const end = text.indexOf(c, i + 1);
      if (end < 0) return -1;
      i = end;
      continue;
    }
    if (c === '{') depth++;
    if (c === '}' && --depth === 0) return i;
  }
  return -1;
}

/** Static class tokens of every `className` in a TSX source. Dynamic parts (`area-${x}`) are skipped. */
export function classTokens(source: string): string[] {
  const tokens = new Set<string>();
  const add = (literal: string) => {
    for (const token of literal.split(/\s+/)) {
      // A token glued to an interpolation or ending in `-` is a prefix built at runtime.
      if (!token || token.includes('${') || token.includes('}') || token.endsWith('-')) continue;
      if (/^[a-z][a-z0-9_-]*$/i.test(token)) tokens.add(token);
    }
  };
  const attr = /className=(?:"([^"]*)"|'([^']*)'|\{)/g;
  let match: RegExpExecArray | null;
  while ((match = attr.exec(source))) {
    if (match[1] !== undefined || match[2] !== undefined) { add(match[1] ?? match[2]); continue; }
    const open = match.index + match[0].length - 1;
    const close = closingBrace(source, open);
    if (close < 0) continue;
    const expression = source.slice(open + 1, close);
    // Only string literals used as values: skip comparisons (`x === 'a'`) and method arguments (`.startsWith('a')`).
    const literal = /(===|!==|==|!=|\w\()?\s*(['"`])((?:(?!\2)[\s\S])*)\2/g;
    let lit: RegExpExecArray | null;
    while ((lit = literal.exec(expression))) {
      if (lit[1]) continue;
      // Template literal: drop each `${...}` and keep the static words around it.
      add(lit[2] === '`' ? lit[3].replace(/\$\{[^}]*\}\S*/g, ' ').replace(/\S*\$\{/g, ' ') : lit[3]);
    }
  }
  return [...tokens];
}

/** Every `.class` that appears in a selector of the CSS files under web/src. */
function cssClasses(): Set<string> {
  const classes = new Set<string>();
  for (const file of walk(SRC, '.css')) {
    const css = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    // Selectors are the text before each `{`; declarations never hold `.name` outside url()/numbers.
    for (const block of css.split('{')) {
      const selector = block.slice(block.lastIndexOf('}') + 1);
      for (const m of selector.matchAll(/\.(-?[a-z_][a-z0-9_-]*)/gi)) classes.add(m[1]);
    }
  }
  return classes;
}

/**
 * Classes that intentionally have no rule. Each one is a hook for tests, scripts or state, never a style.
 * Add a class here only with the reason; anything else needs a CSS rule or must be removed.
 */
const ALLOWLIST = new Set<string>([
  // Hook read by avisos-area.test.tsx; the badge is styled by `priority-badge`.
  'notice-level',
]);

describe('clases sin regla CSS (R1, WC-1)', () => {
  it('cada className estático de un componente tiene un selector en web/src/**/*.css', () => {
    const styled = cssClasses();
    const orphans: string[] = [];
    for (const file of walk(SRC, '.tsx')) {
      for (const token of classTokens(readFileSync(file, 'utf8'))) {
        if (!styled.has(token) && !ALLOWLIST.has(token)) orphans.push(`${relative(SRC, file).replace(/\\/g, '/')}: ${token}`);
      }
    }
    expect(orphans.join('\n'), 'clases sin regla CSS').toBe('');
  });

  it('el lector de clases separa partes estáticas y dinámicas', () => {
    expect(classTokens('<a className="a b" /><b className={`c area-${x} d`} /><i className={on ? \'e\' : "f"} /><u className={k === \'g\' ? \'h\' : undefined} /><s className={t.startsWith(\'Vence\') ? \'j\' : \'\'} />').sort())
      .toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'h', 'j']);
  });
});
