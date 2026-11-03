import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoader } from './load-module.mjs';

function setup() {
  const state = [];
  let cursor = 0;
  const { WorkoutEditor } = createLoader({ mocks: {
    react: {
      useId: () => 'suggestions',
      useState: initial => {
        const index = cursor++;
        if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial;
        return [state[index], value => { state[index] = typeof value === 'function' ? value(state[index]) : value; }];
      },
    },
  } })('src/components/WorkoutEditor.tsx');
  const render = () => {
    cursor = 0;
    const root = WorkoutEditor({ date: '2026-11-03', initialSets: [], exercises: ['Bench press'], busy: false, onSave: async () => true, onClose() {} });
    const nodes = [];
    const visit = node => {
      if (Array.isArray(node)) return node.forEach(visit);
      if (!node || typeof node !== 'object') return;
      nodes.push(node);
      visit(node.props?.children);
    };
    visit(root);
    return role => nodes.find(node => node.props?.role === role);
  };
  return render;
}

test('touch selection fills the name even if the browser never dispatches a click', () => {
  const render = setup();
  render()('combobox').props.onFocus();
  let prevented = false;
  render()('option').props.onPointerDown({ pointerType: 'touch', isPrimary: true, button: 0, preventDefault() { prevented = true; } });
  const find = render();
  assert.equal(prevented, true);
  assert.equal(find('combobox').props.value, 'Bench press');
  assert.equal(find('combobox').props['aria-expanded'], false);
});

test('secondary pointers do not select a suggestion and accessible clicks still work', () => {
  const render = setup();
  render()('combobox').props.onFocus();
  render()('option').props.onPointerDown({ isPrimary: false, button: 0 });
  assert.equal(render()('combobox').props.value, '');
  render()('option').props.onClick();
  assert.equal(render()('combobox').props.value, 'Bench press');
});
