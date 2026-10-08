(function registerSessionCommands(global) {
  'use strict';
  const stateApi = global.ArkState;
  if (!stateApi) throw new Error('session-commands.js requires ArkState.');
  const sessionOf = state => { if (!state.session) throw new Error('No active game session.'); return state.session; };
  const changed = (session, type, payload) => ({ changes:[{ scope:'session', value:session }], events:[{ type, payload:payload || null }] });
  stateApi.registerCommand('session/patch', ({ command, state }) => {
    const fields = command.payload && command.payload.fields;
    if (!fields || typeof fields !== 'object' || Array.isArray(fields)) throw new TypeError('session/patch requires fields.');
    return changed({ ...sessionOf(state), ...fields }, 'session.patched', { keys:Object.keys(fields) });
  });
  stateApi.registerCommand('economy/add', ({ command, state }) => {
    const amount = Number(command.payload && command.payload.amount);
    if (!Number.isFinite(amount)) throw new TypeError('economy/add requires a finite amount.');
    const current = sessionOf(state);
    return changed({ ...current, money:current.money + amount }, 'economy.money-added', { amount });
  });
  stateApi.registerCommand('economy/spend', ({ command, state }) => {
    const amount = Number(command.payload && command.payload.amount);
    if (!Number.isFinite(amount) || amount < 0) throw new TypeError('economy/spend requires a non-negative amount.');
    const current = sessionOf(state);
    if (current.money < amount) throw new Error('Insufficient money.');
    return changed({ ...current, money:current.money - amount }, 'economy.money-spent', { amount, reason:command.payload.reason || null });
  });
  stateApi.registerCommand('shop/toggle-freeze', ({ state }) => {
    const current = sessionOf(state);
    return changed({ ...current, frozen:!current.frozen }, 'shop.freeze-changed', { frozen:!current.frozen });
  });
  stateApi.registerCommand('shop/upgrade', ({ command, state }) => {
    const current = sessionOf(state), cost = Number(command.payload.cost), nextCost = Number(command.payload.nextCost);
    if (current.money < cost) throw new Error('Insufficient money.');
    return changed({ ...current, money:current.money-cost, level:current.level+1, upgradeCost:nextCost, _upgradeConfirm:false }, 'shop.upgraded', { cost, level:current.level+1 });
  });
  stateApi.registerCommand('round/begin', ({ command, state }) => {
    const current = sessionOf(state), payload = command.payload || {};
    return changed({ ...current, round:payload.round, phase:'rest', battleDone:false, money:payload.money }, 'round.began', { round:payload.round });
  });
})(typeof window !== 'undefined' ? window : globalThis);
