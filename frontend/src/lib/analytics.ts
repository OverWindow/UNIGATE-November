type EventParams = Record<string, string | number | boolean>;

// Queue events before the asynchronous Google tag loads; never include form values.
export function trackEvent(name: string, params: EventParams = {}) {
  if (typeof window === "undefined") return;
  const analyticsWindow = window as Window & { dataLayer?: unknown[][] };
  analyticsWindow.dataLayer ??= [];
  analyticsWindow.dataLayer.push(["event", name, params]);
}
