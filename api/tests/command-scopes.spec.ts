import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// CommandService.run takes the permission from the first segment of the scope.
// A scope whose first segment is not a catalogued permission always answers 403.
const root = join(__dirname, '..');
const permissions = new Set(
  readFileSync(join(root, '..', 'docs', 'arquitectura', 'datos', 'permisos.csv'), 'utf8')
    .split(/\r?\n/).slice(1).map(line => line.split(',')[0].trim()).filter(Boolean),
);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : path.endsWith('.ts') ? [path] : [];
  });
}

const literalScopes = sourceFiles(join(root, 'src')).flatMap(file =>
  [...readFileSync(file, 'utf8').matchAll(/commands\.run\(\s*\w+\s*,\s*[`'"]([^`'"]+)[`'"]/g)]
    .map(match => ({ file: file.slice(root.length + 1), scope: match[1] })),
);

describe('command scopes', () => {
  it('finds literal command scopes to check', () => {
    expect(literalScopes.length).toBeGreaterThan(0);
  });

  it.each(literalScopes)('$file uses a catalogued permission in "$scope"', ({ scope }) => {
    expect(permissions).toContain(scope.split(':')[0]);
  });
});
