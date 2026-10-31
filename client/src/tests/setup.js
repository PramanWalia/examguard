import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Some Node + jsdom combinations do not expose Web Storage. Provide a
// deterministic in-memory implementation so tests exercise the same code paths
// as the browser without depending on the host Node flags.
const createStorage = () => {
  const store = new Map();
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key) => (store.has(String(key)) ? store.get(String(key)) : null),
    key: (index) => Array.from(store.keys())[index] ?? null,
    removeItem: (key) => store.delete(String(key)),
    setItem: (key, value) => store.set(String(key), String(value)),
  };
};

for (const name of ['localStorage', 'sessionStorage']) {
  if (!window[name]) {
    Object.defineProperty(window, name, { configurable: true, value: createStorage() });
  }
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.sessionStorage.clear();
});
