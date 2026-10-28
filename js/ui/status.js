// A small toast for confirmations ("Saved SVG") and errors.

export function createStatus(el) {
  let timer = 0;
  return {
    show(message, { error = false, duration = 3200 } = {}) {
      clearTimeout(timer);
      el.textContent = message;
      el.classList.toggle('is-error', error);
      el.hidden = false;
      timer = setTimeout(() => {
        el.hidden = true;
      }, error ? Math.max(duration, 6000) : duration);
    },
  };
}
