export function closeWithMotion(element: HTMLElement | null, onClosed: () => void): Animation | null {
  if (!element || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    onClosed();
    return null;
  }

  element.dataset.closing = "true";
  const animation = element.animate([
    { opacity: 1, transform: "translateY(0) scale(1)" },
    { opacity: 0, transform: "translateY(8px) scale(.98)" },
  ], { duration: 180, easing: "ease-in", fill: "forwards" });
  void animation.finished.then(() => {
    try {
      onClosed();
    } finally {
      // The same dialog can reopen. Release the final transparent frame.
      animation.cancel();
      element.removeAttribute("data-closing");
    }
  }, () => { element.removeAttribute("data-closing"); });
  return animation;
}
