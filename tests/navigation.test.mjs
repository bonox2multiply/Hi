import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
function harness() {
  let index = 0,
    capture = false;
  const handlers = {},
    links = Array.from({ length: 5 }, (_, i) => ({
      getBoundingClientRect: () => ({ left: 10 + i * 60, width: 60 }),
      hasAttribute: () => index === i,
      focus() {},
      click() {
        index = i;
      }
    }));
  const nav = {
    dataset: {},
    scrollLeft: 0,
    isConnected: true,
    querySelectorAll: () => links,
    prepend() {},
    append() {},
    setAttribute() {},
    getBoundingClientRect: () => ({ left: 4, width: 312 }),
    style: { setProperty() {} },
    addEventListener: (n, f) => (handlers[n] = f),
    classList: { add() {}, remove() {} },
    setPointerCapture() {
      capture = true;
    },
    hasPointerCapture: () => capture,
    releasePointerCapture() {
      capture = false;
    },
    contains: () => true
  };
  const c = {
    AbortController,
    matchMedia: () => ({ matches: true, addEventListener() {} }),
    document: {
      body: {},
      documentElement: { dataset: {} },
      querySelectorAll: (s) => (s === '.mobile-nav' ? [nav] : []),
      createElement: () => ({ setAttribute() {} })
    },
    window: { addEventListener() {} },
    MutationObserver: class {
      observe() {}
    },
    ResizeObserver: class {
      observe() {}
    },
    requestAnimationFrame: (f) => f(),
    performance: { now: () => 1000 }
  };
  vm.createContext(c);
  vm.runInContext(
    fs.readFileSync('public/navigation.js', 'utf8').replace('export function', 'function'),
    c
  );
  const e = (x, y = 10) => ({
    isPrimary: true,
    button: 0,
    pointerId: 1,
    clientX: x,
    clientY: y,
    preventDefault() {}
  });
  return { handlers, e, nav, index: () => index };
}
test('swipes and the selector move in the same direction as the finger; cancel and vertical movement preserve selection', () => {
  const h = harness();
  h.handlers.pointerdown(h.e(40));
  h.handlers.pointermove(h.e(164));
  h.handlers.pointerup(h.e(164));
  assert.equal(h.index(), 2);
  h.handlers.pointerdown(h.e(164));
  h.handlers.pointermove(h.e(280));
  h.handlers.pointercancel(h.e(280));
  assert.equal(h.index(), 2);
  h.handlers.pointerdown(h.e(164));
  h.handlers.pointermove(h.e(165, 60));
  h.handlers.pointerup(h.e(165, 60));
  assert.equal(h.index(), 2);
  h.handlers.pointerdown(h.e(165));
  h.handlers.pointermove(h.e(100));
  h.handlers.pointerup(h.e(100));
  assert.equal(h.index(), 1);
});
test('implicit capture loss bubbling from a touched tab does not abort navigation', () => {
  const h = harness();
  h.handlers.pointerdown(h.e(40));
  h.handlers.pointermove(h.e(100));
  h.handlers.lostpointercapture({ target: {}, pointerId: 1 });
  h.handlers.pointermove(h.e(164));
  h.handlers.pointerup(h.e(164));
  assert.equal(h.index(), 2);
});
test('short touch jitter never changes menus and swipes clamp at the first and last menu', () => {
  const h = harness();
  h.handlers.pointerdown(h.e(40));
  h.handlers.pointermove(h.e(30));
  h.handlers.pointerup(h.e(30));
  assert.equal(h.index(), 0);
  h.handlers.pointerdown(h.e(150));
  h.handlers.pointermove(h.e(40));
  h.handlers.pointerup(h.e(40));
  assert.equal(h.index(), 0);
  h.handlers.keydown({ key: 'End', preventDefault() {} });
  h.handlers.pointerdown(h.e(40));
  h.handlers.pointermove(h.e(250));
  h.handlers.pointerup(h.e(250));
  assert.equal(h.index(), 4);
});
test('keyboard and horizontal trackpad gestures select tabs and clamp at edges', () => {
  const h = harness();
  h.handlers.keydown({ key: 'End', preventDefault() {} });
  assert.equal(h.index(), 4);
  h.handlers.keydown({ key: 'ArrowRight', preventDefault() {} });
  assert.equal(h.index(), 4);
  h.handlers.wheel({ deltaX: -60, deltaY: 0, preventDefault() {} });
  assert.equal(h.index(), 3);
  h.handlers.wheel({
    deltaX: 0,
    deltaY: 100,
    preventDefault() {
      throw Error('vertical scrolling must remain native');
    }
  });
  assert.equal(h.index(), 3);
});

test('spring settles at target at both 60 Hz and 120 Hz without numerical drift', () => {
  const c = {
    MutationObserver: class {
      observe() {}
    },
    window: {},
    document: { body: {}, documentElement: { dataset: {} }, querySelectorAll: () => [] }
  };
  vm.createContext(c);
  vm.runInContext(
    fs.readFileSync('public/navigation.js', 'utf8').replace('export function', 'function'),
    c
  );
  for (const hz of [60, 120]) {
    let x = 0,
      v = 0;
    for (let i = 0; i < hz * 2; i++) [x, v] = c.springStep(x, v, 200, 1 / hz);
    assert.ok(Math.abs(x - 200) < 0.01);
    assert.ok(Math.abs(v) < 0.01);
  }
});
