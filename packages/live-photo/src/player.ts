/** Bind to the host's image frame. Clicks, selection, DnD and undo belong to the host. */
export function bindLivePhoto(frame: HTMLElement, video: HTMLVideoElement, keyTarget: HTMLElement,
  events: { playing?(value: boolean): void; error?(): void } = {}) {
  const listeners = new AbortController();
  const options = { signal: listeners.signal };
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pointer: { id: number; x: number; y: number } | undefined;
  let generation = 0;
  function stop() {
    generation++;
    clearTimeout(timer);
    pointer = undefined;
    video.pause();
    events.playing?.(false);
  }
  function play() {
    const current = ++generation;
    video.currentTime = 0;
    void video.play().then(() => {
      if (current === generation) events.playing?.(true);
    }, error => {
      if (current === generation && error.name !== 'AbortError') fail();
    });
  }
  function fail() { stop(); events.error?.(); }
  frame.addEventListener('pointerdown', e => {
    if (!e.isPrimary || e.button !== 0 || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
    stop();
    pointer = { id: e.pointerId, x: e.clientX, y: e.clientY };
    timer = setTimeout(play, 250);
  }, options);
  frame.addEventListener('pointermove', e => {
    if (pointer?.id === e.pointerId && Math.hypot(e.clientX - pointer.x, e.clientY - pointer.y) > 8) stop();
  }, options);
  for (const event of ['pointerleave', 'dragstart']) frame.addEventListener(event, stop, options);
  frame.addEventListener('contextmenu', e => { if (pointer) e.preventDefault(); }, options);
  for (const event of ['pointerup', 'pointercancel', 'blur']) window.addEventListener(event, stop, options);
  document.addEventListener('visibilitychange', stop, options);
  for (const keyEvent of ['keydown', 'keyup'] as const) keyTarget.addEventListener(keyEvent, e => {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    e.preventDefault(); e.stopPropagation();
    if (!e.repeat) keyEvent === 'keydown' ? play() : stop();
  }, options);
  keyTarget.addEventListener('blur', stop, options);
  video.addEventListener('ended', stop, options);
  video.addEventListener('error', fail, options);
  const observer = new IntersectionObserver(entries => { if (!entries[0]?.isIntersecting) stop(); });
  observer.observe(frame);
  return () => { listeners.abort(); observer.disconnect(); stop(); };
}
