"use client";

import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { announceNavigation } from "./navigation";

export default function useNavigationRouter() {
  const router = useRouter();
  return useMemo(() => ({
    ...router,
    push: (...args: Parameters<typeof router.push>) => {
      announceNavigation();
      router.push(...args);
    },
    replace: (...args: Parameters<typeof router.replace>) => {
      announceNavigation();
      router.replace(...args);
    },
  }), [router]);
}
