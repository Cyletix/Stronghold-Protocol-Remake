(function bootstrapGameState(global) {
  'use strict';

  const VALID_SCOPES = new Set(['catalog', 'session', 'battle']);
  const handlers = new Map();
  const subscribers = new Set();
  const state = {
    schemaVersion: 1,
    revision: 0,
    catalog: null,
    session: null,
    battle: null,
  };
  let commandSequence = 0;
  let eventSequence = 0;
  let dispatching = false;

  function assertCommand(command) {
    if (!command || typeof command !== 'object') throw new TypeError('Command must be an object.');
    if (typeof command.type !== 'string' || !command.type.trim()) throw new TypeError('Command.type must be a non-empty string.');
  }

  function snapshot() {
    // 迁移期只冻结状态根；旧 G/B 仍直接修改其对象。新模块不得持有这些可变引用，
    // 后续切片会逐个把旧写入迁到 command handler，再升级为深只读 FrameSnapshot。
    return Object.freeze({
      schemaVersion: state.schemaVersion,
      revision: state.revision,
      catalog: state.catalog,
      session: state.session,
      battle: state.battle,
    });
  }

  function registerCommand(type, handler) {
    if (typeof type !== 'string' || !type.trim()) throw new TypeError('Command type must be a non-empty string.');
    if (typeof handler !== 'function') throw new TypeError('Command handler must be a function.');
    if (handlers.has(type)) throw new Error('Command handler already registered: ' + type);
    handlers.set(type, handler);
    return function unregister() { handlers.delete(type); };
  }

  function normalizeResult(result) {
    const value = result || {};
    const changes = Array.isArray(value.changes) ? value.changes : [];
    const events = Array.isArray(value.events) ? value.events : [];
    for (const change of changes) {
      if (!change || !VALID_SCOPES.has(change.scope)) throw new Error('Invalid state scope in command result.');
      if (change.value !== null && typeof change.value !== 'object') {
        throw new TypeError('State scope value must be an object or null: ' + change.scope);
      }
    }
    for (const event of events) {
      if (!event || typeof event.type !== 'string' || !event.type.trim()) throw new TypeError('Domain event.type must be a non-empty string.');
    }
    return { changes, events };
  }

  function publish(event) {
    for (const subscriber of [...subscribers]) {
      try { subscriber(event, snapshot()); }
      catch (error) { if (global.console && global.console.error) global.console.error('GameState subscriber failed', error); }
    }
  }

  function dispatch(command) {
    assertCommand(command);
    if (dispatching) throw new Error('Nested command dispatch is not allowed.');
    const handler = handlers.get(command.type);
    if (!handler) throw new Error('Unknown command: ' + command.type);
    const commandId = ++commandSequence;
    let normalized;
    dispatching = true;
    try {
      // handler 只能返回待提交 changes；在全部校验完成前不会修改状态根。
      normalized = normalizeResult(handler({
        command: Object.freeze({ id: commandId, type: command.type, payload: command.payload, meta: command.meta || null }),
        state: snapshot(),
      }));
    } finally {
      dispatching = false;
    }
    if (!normalized.changes.length && !normalized.events.length) return snapshot();
    for (const change of normalized.changes) state[change.scope] = change.value;
    state.revision++;
    for (const entry of normalized.events) {
      publish(Object.freeze({
        id: ++eventSequence,
        revision: state.revision,
        commandId,
        type: entry.type,
        payload: entry.payload || null,
      }));
    }
    return snapshot();
  }

  function subscribe(subscriber) {
    if (typeof subscriber !== 'function') throw new TypeError('Subscriber must be a function.');
    subscribers.add(subscriber);
    return function unsubscribe() { subscribers.delete(subscriber); };
  }

  registerCommand('legacy/replace-scope', ({ command }) => {
    const payload = command.payload || {};
    if (!VALID_SCOPES.has(payload.scope)) throw new Error('Invalid legacy state scope: ' + payload.scope);
    return {
      changes: [{ scope: payload.scope, value: payload.value == null ? null : payload.value }],
      events: [{
        type: 'state.' + payload.scope + '.replaced',
        payload: { reason: payload.reason || 'legacy-adapter' },
      }],
    };
  });

  function bindLegacy(scope, value, reason) {
    dispatch({
      type: 'legacy/replace-scope',
      payload: { scope, value: value == null ? null : value, reason },
      meta: { adapter: 'legacy' },
    });
    return value;
  }

  global.ArkState = Object.freeze({
    getSnapshot: snapshot,
    dispatch,
    registerCommand,
    subscribe,
    bindLegacy,
  });
})(typeof window !== 'undefined' ? window : globalThis);
