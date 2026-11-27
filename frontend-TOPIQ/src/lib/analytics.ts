export const GA_MEASUREMENT_ID = "G-MNFFKP03XD";

type EventParams = Record<string, string | number | Record<string, string | number>[]>;
type AnalyticsWindow = Window & {
  gtag?: {
    (command: "event", name: string, params: EventParams): void;
    (command: "get", target: string, field: "client_id", callback: (value: unknown) => void): void;
  };
};

export function trackEvent(name: string, params: EventParams) {
  (window as AnalyticsWindow).gtag?.("event", name, { ...params, send_to: GA_MEASUREMENT_ID });
}

export function getAnalyticsClientId(): Promise<string | undefined> {
  const { gtag } = window as AnalyticsWindow;
  if (!gtag) return Promise.resolve(undefined);
  return new Promise(resolve => {
    const timeout = window.setTimeout(() => resolve(undefined), 300);
    gtag("get", GA_MEASUREMENT_ID, "client_id", value => {
      window.clearTimeout(timeout);
      resolve(typeof value === "string" && /^[0-9]{1,20}\.[0-9]{1,20}$/.test(value) ? value : undefined);
    });
  });
}
