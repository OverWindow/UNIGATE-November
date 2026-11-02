import type { Viewport } from "next";
import "../styles/index.css";

export const viewport: Viewport = { themeColor: "#eee7f5" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="id"><body>{children}</body></html>;
}
