import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const backend = process.env.DJANGO_BACKEND_URL || "http://127.0.0.1:8000";
const backendOrigin = new URL(backend);
if (!["http:", "https:"].includes(backendOrigin.protocol) || backendOrigin.username ||
    backendOrigin.password || backendOrigin.pathname !== "/" || backendOrigin.search || backendOrigin.hash) {
  throw new Error("DJANGO_BACKEND_URL must be an HTTP(S) origin without credentials or a path.");
}

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  // Preserve Django's trailing-slash API URLs through the proxy.
  skipTrailingSlashRedirect: true,
  turbopack: {
    root: fileURLToPath(new URL(".", import.meta.url)),
  },
  async rewrites() {
    return [
      { source: "/api/auth/:path*", destination: `${backendOrigin.origin}/api/auth/:path*/` },
      { source: "/api/pbt/:path*", destination: `${backendOrigin.origin}/api/pbt/:path*/` },
      { source: "/api/csrf/", destination: `${backendOrigin.origin}/api/csrf/` },
    ];
  },
};

export default nextConfig;
