import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/** The table row whose text has `person`. */
export async function rowOf(person: string | RegExp) {
  const wanted = typeof person === 'string' ? (text: string) => text.includes(person) : (text: string) => person.test(text);
  const rows = await screen.findAllByRole('row');
  const row = rows.find(r => wanted(r.textContent ?? ''));
  if (!row) throw new Error(`No row for ${String(person)}`);
  return row;
}

/** A button's visible text, or its accessible name when it is icon-only (CrudButton `iconOnly`). */
const nameOf = (b: HTMLElement) => ((b.textContent ?? '').trim() || b.getAttribute('aria-label') || '').trim();

/** Every action a row offers (RowMenu: the main one plus the ones folded under «Más acciones»; or icon-only CRUD buttons). */
export async function rowActionLabels(person: string | RegExp): Promise<string[]> {
  const row = await rowOf(person);
  const toggle = within(row).queryByRole('button', { name: /^Más acciones/ });
  if (toggle && toggle.getAttribute('aria-expanded') !== 'true') await userEvent.click(toggle);
  return within(row).queryAllByRole('button').filter(b => !/^Más acciones/.test(b.textContent ?? '')).map(nameOf);
}

/** Clicks a row action, opening «Más acciones» first when it is folded there. */
export async function clickRowAction(person: string | RegExp, label: string) {
  const row = await rowOf(person);
  const find = () => within(row).queryAllByRole('button').find(b => nameOf(b) === label);
  let button = find();
  if (!button) { await userEvent.click(within(row).getByRole('button', { name: /^Más acciones/ })); button = find(); }
  if (!button) throw new Error(`No action ${label} for ${String(person)}`);
  await userEvent.click(button);
}
