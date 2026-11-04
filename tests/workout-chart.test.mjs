import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoader, plain } from './load-module.mjs';
const { workoutPoints } = createLoader()('src/lib/workoutChart.ts');
const history = {
  '2026-11-03': { Bench: [{ weight: 100, reps: 3 }, { weight: 80, reps: 10 }, { weight: 80, reps: 8 }], Drep: [{ weight: 200, reps: 5 }] },
  '2026-11-01': { Bench: [{ weight: 90, reps: 5 }] },
  '2026-11-02': { Bench: [] },
};
test('each metric calculates per workout, orders dates and isolates the chosen exercise', () => {
  for (const [metric, expected] of [['weight', 100], ['volume', 1740], ['set', 800]]) {
    assert.deepEqual(plain(workoutPoints(history, 'Bench', metric)), [{ date: '2026-11-01', value: metric === 'weight' ? 90 : 450 }, { date: '2026-11-03', value: expected }]);
  }
});
test('missing workouts are omitted while zero-weight training remains a point', () => {
  assert.deepEqual(plain(workoutPoints(history, 'Unknown', 'volume')), []);
  for (const metric of ['weight', 'volume', 'set']) assert.deepEqual(plain(workoutPoints({ '2026-11-01': { Drep: [{ weight: 0, reps: 10 }] } }, 'Drep', metric)), [{ date: '2026-11-01', value: 0 }]);
  assert.deepEqual(plain(workoutPoints({}, 'Bench', 'weight')), []);
});
