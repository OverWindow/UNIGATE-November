export const navigationStartEvent = "topiq:navigation-start";

export function announceNavigation() {
  window.dispatchEvent(new Event(navigationStartEvent));
}

export function isPageDestination(currentUrl: string, destinationUrl: string): boolean {
  const current = new URL(currentUrl);
  const destination = new URL(destinationUrl);
  return current.origin === destination.origin
    && (current.pathname !== destination.pathname || current.search !== destination.search);
}
