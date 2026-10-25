import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoader, plain } from './load-module.mjs';

const { createWorkoutDraft, updateWorkoutDraft, removeWorkoutDraftRow, parseWorkoutDraft, isEmptySet } = createLoader()('src/lib/workoutDraft.ts');
const sets = [{ reps: 5, weight: 100 }, { reps: 3, weight: 120 }];

test('opening and saving unchanged sets ignores the empty final row', () => {
  const draft = createWorkoutDraft(sets);
  assert.equal(draft.rows.length, 3);
  assert.equal(isEmptySet(draft.rows.at(-1)), true);
  assert.deepEqual(plain(parseWorkoutDraft(draft.rows, true)), sets);
});

test('filling the spare row creates a new one without shifting input identity or losing previous sets', () => {
  const initial = createWorkoutDraft(sets), id = initial.rows.at(-1).id;
  let draft = updateWorkoutDraft(initial, id, 'reps', '8');
  assert.equal(draft.rows.length, 4);
  assert.equal(draft.rows[2].id, id);
  assert.equal(isEmptySet(draft.rows.at(-1)), true);
  draft = updateWorkoutDraft(draft, id, 'weight', '0');
  assert.equal(draft.rows.length, 4);
  assert.deepEqual(plain(parseWorkoutDraft(draft.rows, true)), [...sets, { reps: 8, weight: 0 }]);
  assert.equal(initial.rows[2].reps, '');
  const secondId = draft.rows.at(-1).id;
  draft = updateWorkoutDraft(draft, secondId, 'weight', '12.5');
  draft = updateWorkoutDraft(draft, secondId, 'reps', '6');
  assert.deepEqual(plain(parseWorkoutDraft(draft.rows, true)), [...sets, { reps: 8, weight: 0 }, { reps: 6, weight: 12.5 }]);
  assert.equal(draft.rows.length, 5);
});

test('blank rows are ignored but partially entered sets cannot silently become zero', () => {
  for (const [field, value] of [['reps', '5'], ['weight', '0']]) {
    const initial = createWorkoutDraft(sets);
    const draft = updateWorkoutDraft(initial, initial.rows.at(-1).id, field, value);
    assert.throws(() => parseWorkoutDraft(draft.rows, true), /Vyplň opakovania aj váhu/);
  }
  const draft = createWorkoutDraft(sets);
  draft.rows.splice(1, 0, { id: 99, reps: ' ', weight: '' });
  assert.deepEqual(plain(parseWorkoutDraft(draft.rows, true)), sets);
});

test('removing all saved rows retains an empty input and allows clearing an existing exercise only', () => {
  let draft = createWorkoutDraft(sets);
  for (const row of draft.rows.slice(0, -1)) draft = removeWorkoutDraftRow(draft, row.id);
  assert.equal(draft.rows.length, 1);
  assert.equal(isEmptySet(draft.rows[0]), true);
  assert.deepEqual(plain(parseWorkoutDraft(draft.rows, true)), []);
  assert.throws(() => parseWorkoutDraft(draft.rows, false), /aspoň jednu sériu/);
  const empty = createWorkoutDraft([]);
  assert.equal(empty.rows.length, 1);
  assert.throws(() => parseWorkoutDraft(empty.rows, false), /aspoň jednu sériu/);
});

test('removing a series preserves set order and never reuses an existing row ID', () => {
  let draft = createWorkoutDraft(sets);
  const removedId = draft.rows[0].id;
  draft = removeWorkoutDraftRow(draft, removedId);
  const spareId = draft.rows.at(-1).id;
  draft = updateWorkoutDraft(draft, spareId, 'reps', '10');
  draft = updateWorkoutDraft(draft, spareId, 'weight', '90');
  assert.equal(new Set(draft.rows.map(row => row.id)).size, draft.rows.length);
  assert.equal(draft.rows.some(row => row.id === removedId), false);
  assert.deepEqual(plain(parseWorkoutDraft(draft.rows, true)), [sets[1], { reps: 10, weight: 90 }]);
});

test('invalid repetitions and weights remain invalid even with an empty spare row', () => {
  for (const set of [{ reps: 0, weight: 100 }, { reps: 2.5, weight: 100 }, { reps: 5, weight: -1 }, { reps: 5, weight: Infinity }]) {
    const draft = createWorkoutDraft([set]);
    assert.throws(() => parseWorkoutDraft(draft.rows, true));
  }
});
