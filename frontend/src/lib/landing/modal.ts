const closing = new WeakSet<HTMLDialogElement>();

export function openModal(modal: HTMLDialogElement) {
  if (modal.open) return;
  modal.classList.remove("closing");
  modal.showModal();
  // Keep keyboard focus in the dialog without selecting its close button first.
  modal.tabIndex = -1;
  modal.focus({ preventScroll: true });
  modal.scrollTop = 0;
  const region = modal.querySelector(".stats-table-window");
  if (region) region.scrollTop = 0;
  modal.animate([
    { opacity: 0, transform: "translateY(22px) scale(.96)", filter: "blur(5px)" },
    { opacity: 1, transform: "translateY(0) scale(1)", filter: "blur(0)" },
  ], { duration: matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 360, easing: "cubic-bezier(.16,1,.3,1)" });
}

export async function closeModal(modal: HTMLDialogElement) {
  if (!modal.open || closing.has(modal)) return;
  closing.add(modal);
  modal.classList.add("closing");
  const animation = modal.animate([
    { opacity: 1, transform: "translateY(0) scale(1)" },
    { opacity: 0, transform: "translateY(12px) scale(.97)" },
  ], { duration: matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 230, easing: "cubic-bezier(.4,0,1,1)", fill: "forwards" });
  try {
    await animation.finished;
    modal.close();
  } catch { /* Unmounting may cancel an in-progress animation. */ }
  finally {
    animation.cancel();
    modal.classList.remove("closing");
    closing.delete(modal);
  }
}

export function isBackdropClick(event: MouseEvent, modal: HTMLDialogElement) {
  if (event.target !== modal) return false;
  const r = modal.getBoundingClientRect();
  return event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom;
}
