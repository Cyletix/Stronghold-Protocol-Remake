'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'web', 'src', 'domain', 'game-state.js'), 'utf8');
const sandbox = { console };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(source, sandbox);

const api = sandbox.ArkState;
if (!api) throw new Error('ArkState was not installed.');
const initial = api.getSnapshot();
if (initial.schemaVersion !== 1 || initial.revision !== 0) throw new Error('Unexpected initial state.');

const events = [];
const unsubscribe = api.subscribe((event, state) => events.push({ event, state }));
const legacySession = { phase: 'rest', money: 12 };
api.bindLegacy('session', legacySession, 'smoke.session');
if (api.getSnapshot().session !== legacySession) throw new Error('Legacy session identity was not preserved.');
if (events[0].event.type !== 'state.session.replaced') throw new Error('Legacy state event missing.');

api.registerCommand('economy/add-money', ({ command, state }) => ({
  changes: [{ scope: 'session', value: { ...state.session, money: state.session.money + command.payload.amount } }],
  events: [{ type: 'economy.money-added', payload: { amount: command.payload.amount } }],
}));
api.dispatch({ type: 'economy/add-money', payload: { amount: 5 } });
const updated = api.getSnapshot();
if (updated.session.money !== 17 || updated.revision !== 2) throw new Error('Command did not commit atomically.');
if (legacySession.money !== 12) throw new Error('Command mutated the previous state object.');
if (events[1].event.type !== 'economy.money-added') throw new Error('Domain event missing.');

const revisionBeforeFailure = updated.revision;
try {
  api.registerCommand('invalid/change', () => ({ changes: [{ scope: 'missing', value: {} }] }));
  api.dispatch({ type: 'invalid/change' });
  throw new Error('Invalid change was accepted.');
} catch (error) {
  if (error.message === 'Invalid change was accepted.') throw error;
}
if (api.getSnapshot().revision !== revisionBeforeFailure) throw new Error('Failed command changed the revision.');

unsubscribe();
console.log('STATE BOUNDARY SMOKE OK');
