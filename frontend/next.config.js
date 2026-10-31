import { fileURLToPath } from "node:url";
import { PHASE_PRODUCTION_BUILD } from "next/constants.js";

export default (phase) => {
  // Public URLs are embedded at build time. / 공개 주소는 빌드 시 반영됩니다.
  const backend = process.env.NEXT_PUBLIC_BACKEND_URL;
  if (phase === PHASE_PRODUCTION_BUILD && !backend) {
    throw new Error("Set NEXT_PUBLIC_BACKEND_URL before building the frontend.");
  }
  if (phase === PHASE_PRODUCTION_BUILD || backend) {
    const url = new URL(backend || "");
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password ||
        url.pathname !== "/" || url.search || url.hash) {
      throw new Error("NEXT_PUBLIC_BACKEND_URL must be an HTTP(S) origin without a path.");
    }
  }
  return {
    output: "export",
    trailingSlash: true,
    images: { unoptimized: true },
    turbopack: { root: fileURLToPath(new URL(".", import.meta.url)) },
  };
};
