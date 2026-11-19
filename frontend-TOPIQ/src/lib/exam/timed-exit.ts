export function guardTimedExit({ id, fallback, isActive, requestExit, pageExit, restore }: {
  id: string;
  fallback: string;
  isActive: () => boolean;
  requestExit: (leave: () => void) => void;
  pageExit: () => void;
  restore: () => void;
}) {
  const examUrl = window.location.href;
  const examState = { ...window.history.state, timedExamGuard: id };
  const pushGuard = () => window.history.pushState(examState, "", examUrl);
  if (window.history.state?.timedExamGuard !== id) pushGuard();

  const click = (event: MouseEvent) => {
    if (!isActive() || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
    if (!(link instanceof HTMLAnchorElement) || (link.target && link.target !== "_self") || link.hasAttribute("download")) return;
    const target = new URL(link.href);
    const current = new URL(examUrl);
    if (target.origin === current.origin && target.pathname === current.pathname && target.search === current.search) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    requestExit(() => window.location.assign(target.href));
  };
  const pop = (event: PopStateEvent) => {
    if (!isActive()) return;
    event.stopImmediatePropagation();
    const steps = window.location.href === examUrl ? -2 : -1;
    pushGuard();
    requestExit(() => {
      if (window.history.length > -steps) window.history.go(steps);
      else window.location.assign(fallback);
    });
  };
  const unload = (event: BeforeUnloadEvent) => {
    if (!isActive()) return;
    event.preventDefault();
    event.returnValue = "";
  };
  const show = (event: PageTransitionEvent) => { if (event.persisted) restore(); };
  document.addEventListener("click", click, true);
  window.addEventListener("popstate", pop, true);
  window.addEventListener("beforeunload", unload);
  window.addEventListener("pagehide", pageExit);
  window.addEventListener("pageshow", show);
  return () => {
    document.removeEventListener("click", click, true);
    window.removeEventListener("popstate", pop, true);
    window.removeEventListener("beforeunload", unload);
    window.removeEventListener("pagehide", pageExit);
    window.removeEventListener("pageshow", show);
    pageExit();
  };
}
