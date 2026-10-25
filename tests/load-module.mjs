import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';

const root = path.resolve(import.meta.dirname, '..');
const nativeRequire = createRequire(path.join(root, 'package.json'));
export function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

// Exercise the actual TypeScript modules, using only the existing TypeScript
// dependency and Node's test runner. Each loader has its own module state.
export function createLoader({ globals = {}, mocks = {} } = {}) {
  const cache = new Map();
  const context = vm.createContext({
    console, Error, TypeError, setTimeout, clearTimeout, setInterval, clearInterval,
    TextEncoder, TextDecoder, atob, btoa, URLSearchParams, AbortController,
    crypto: globalThis.crypto, Event, ...globals,
  });
  function load(relative) {
    const file = path.resolve(root, relative);
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} };
    cache.set(file, module);
    const text = fs.readFileSync(file, 'utf8').replaceAll('import.meta.env', '({VITE_GOOGLE_CLIENT_ID: "test.apps.googleusercontent.com"})');
    const code = ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    const require = (name) => {
      if (mocks[name]) return mocks[name];
      if (!name.startsWith('.')) return nativeRequire(name);
      const resolved = path.resolve(path.dirname(file), name);
      const relativeFile = path.relative(root, resolved);
      return load(fs.existsSync(resolved) ? relativeFile : `${relativeFile}.ts`);
    };
    vm.runInContext(`(function(require,module,exports){${code}\n})`, context, { filename: file })(require, module, module.exports);
    return module.exports;
  }
  return load;
}
export const plain = (value) => JSON.parse(JSON.stringify(value));
