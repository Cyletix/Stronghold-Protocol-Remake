(function registerGameShortcuts() {
  'use strict';
  const buttons = {KeyA:'shop-right', KeyS:'freeze-btn', KeyD:'refresh-btn', KeyG:'shop-left', KeyC:'start-btn'};
  const overlays = ['menu','setup','decision-modal','roster-modal','roster-detail','exit-confirm','settlement'];
  function visible(element) {
    if (!element || element.hidden) return false;
    if (element.getClientRects && !element.getClientRects().length) return false;
    const style = window.getComputedStyle ? window.getComputedStyle(element) : element.style;
    return style?.display !== 'none' && style?.visibility !== 'hidden';
  }
  document.addEventListener('keydown', event => {
    // Do not spend money while typing, using an IME/browser shortcut, or holding a key.
    if (event.defaultPrevented || event.repeat || event.isComposing || event.keyCode === 229 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    const target = event.target;
    if (target?.isContentEditable || target?.closest?.('input,textarea,select,[role="textbox"]')) return;
    const code = event.code || (/^[a-z]$/i.test(event.key || '') ? 'Key'+event.key.toUpperCase() : '');
    const id = buttons[code];
    if (!id || !G || GMODE !== 'auto' || G.phase !== 'rest' || !visible(document.getElementById('main'))) return;
    if (overlays.some(id => visible(document.getElementById(id))) || document.querySelector('dialog[open]')) return;
    const button = document.getElementById(id);
    if (!visible(button) || button.disabled || button.getAttribute?.('aria-disabled') === 'true') return;
    event.preventDefault();
    // Use the very same click path as the HUD, including upgrade confirmation and
    // the room client's authoritative commands, busy/ready/spectator guards.
    button.click();
  });
})();
