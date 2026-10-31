import { fileURLToPath } from "node:url";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants.js";

export default (phase) => ({
  ...(phase === PHASE_DEVELOPMENT_SERVER ? {
    async rewrites() {
      const backend = (process.env.BACKEND_ORIGIN || "http://127.0.0.1:8000").replace(/\/$/, "");
      return [{ source: "/api/:path*/", destination: `${backend}/api/:path*/` }];
    },
  } : { output: "export" }),
  trailingSlash: true,
  images: { unoptimized: true },
  turbopack: { root: fileURLToPath(new URL(".", import.meta.url)) },
});
