(function bootstrapRenderPolicy(global) {
  'use strict';

  const PROFILES = Object.freeze({
    high: Object.freeze({ id: 'high', sceneScaleMax: 3, warpGrid: 24, projectileBudget: 1500, particleBudget: 1000, particleStride: 1 }),
    balanced: Object.freeze({ id: 'balanced', sceneScaleMax: 2, warpGrid: 16, projectileBudget: 1000, particleBudget: 600, particleStride: 1 }),
    low: Object.freeze({ id: 'low', sceneScaleMax: 1.25, warpGrid: 12, projectileBudget: 500, particleBudget: 250, particleStride: 2 }),
  });
  const listeners = new Set();
  let requested = 'auto';

  function autoProfile() {
    const memory = Number(global.navigator && global.navigator.deviceMemory) || 8;
    const cores = Number(global.navigator && global.navigator.hardwareConcurrency) || 8;
    if (memory <= 4 || cores <= 4) return PROFILES.low;
    if (memory <= 6 || cores <= 6) return PROFILES.balanced;
    // CPU core count and system RAM do not identify the GPU. Start conservatively;
    // high quality remains an explicit option rather than an integrated-GPU guess.
    return PROFILES.balanced;
  }

  function getProfile() {
    return requested === 'auto' ? autoProfile() : PROFILES[requested];
  }

  function setQuality(value) {
    const next = value || 'auto';
    if (next !== 'auto' && !PROFILES[next]) throw new Error('Unknown render quality: ' + next);
    if (next === requested) return getProfile();
    requested = next;
    const profile = getProfile();
    for (const listener of [...listeners]) listener(profile, requested);
    return profile;
  }

  function onQualityChange(listener) {
    if (typeof listener !== 'function') throw new TypeError('Quality listener must be a function.');
    listeners.add(listener);
    return function unsubscribe() { listeners.delete(listener); };
  }

  function isMapPointVisible(x, y, viewRect, padding) {
    if (!viewRect || viewRect.colLeft == null) return true;
    const pad = padding == null ? 1 : padding;
    return x >= viewRect.colLeft - pad && x <= viewRect.colRight + pad
      && y >= viewRect.rowTop - pad && y <= viewRect.rowBot + pad;
  }

  function createObjectPool(factory, maxFree) {
    if (typeof factory !== 'function') throw new TypeError('Pool factory must be a function.');
    const free = [];
    const limit = Math.max(0, maxFree == null ? 4096 : maxFree);
    let created = 0;
    return Object.freeze({
      acquire() {
        if (free.length) return free.pop();
        created++;
        return factory();
      },
      release(value) {
        if (value && free.length < limit) free.push(value);
      },
      clear() { free.length = 0; },
      stats() { return Object.freeze({ created, free: free.length, maxFree: limit }); },
    });
  }

  global.ArkRender = Object.freeze({
    profiles: PROFILES,
    getRequestedQuality: () => requested,
    getProfile,
    setQuality,
    onQualityChange,
    isMapPointVisible,
    createObjectPool,
  });
})(typeof window !== 'undefined' ? window : globalThis);
