import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoader, plain } from './load-module.mjs';

const { exerciseSuggestions } = createLoader()('src/lib/exerciseSuggestions.ts');
const search = (names, query, limit) => plain(exerciseSuggestions(names, query, limit));

test('offers historical exercises before typing, deduplicates and limits suggestions', () => {
  assert.deepEqual(search(['Drep', 'drep', 'Bench press', 'Mŕtvy ťah'], '', 2), ['Drep', 'Bench press']);
  assert.deepEqual(search([], ''), []);
});

test('ignores accents, case and extra spaces and prioritizes exact and prefix matches', () => {
  assert.deepEqual(search(['Rumunský mŕtvy ťah', 'Mŕtvy ťah jednoruč', 'Mŕtvy ťah'], ' MRTVY   TAH '),
    ['Mŕtvy ťah', 'Mŕtvy ťah jednoruč', 'Rumunský mŕtvy ťah']);
});

test('finds abbreviations, reordered words and small typing errors', () => {
  for (const query of ['bp', 'bnch', 'bench pres', 'press bench', 'bencch']) {
    assert.deepEqual(search(['Drep', 'Bench press', 'Mŕtvy ťah'], query), ['Bench press']);
  }
  assert.deepEqual(search(['Drep', 'Bench press'], 'zzzz'), []);
});
