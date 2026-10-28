// Keyboard shortcuts, so counts and behaviours can be changed while
// recording or screen-capturing without touching the panel.

const BEHAVIOUR_KEYS = { f: 'fuse', d: 'disperse', m: 'magnet', i: 'image' };

export function bindKeyboard(actions) {
  window.addEventListener('keydown', (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target;
    const key = event.key;

    if (key === 'Escape') {
      actions.exitClean();
      return;
    }
    // Leave typing and native control keys alone.
    if (target.matches?.('input[type="number"], input[type="text"], select, textarea')) return;
    if (key.startsWith('Arrow') && target.matches?.('input[type="range"], input[type="radio"]')) return;
    if (key === ' ' && target.matches?.('button, input, label')) return;

    const lower = key.toLowerCase();
    if (key === 'ArrowUp' || key === 'ArrowRight' || key === '+' || key === '=') actions.nudge(1, event.shiftKey);
    else if (key === 'ArrowDown' || key === 'ArrowLeft' || key === '-' || key === '_') actions.nudge(-1, event.shiftKey);
    else if (BEHAVIOUR_KEYS[lower]) actions.setBehaviour(BEHAVIOUR_KEYS[lower]);
    else if (lower === 'r') actions.toggleRecord();
    else if (lower === 'h') actions.toggleClean();
    else if (key === ' ') actions.toggleSequence();
    else return;
    event.preventDefault();
  });
}
