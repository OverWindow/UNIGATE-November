"use client";

import Link from "next/link";
import { ReactNode, MouseEvent } from "react";

interface ScrollLinkProps {
  href: string;
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}

export default function ScrollLink({
  href,
  children,
  className,
  onClick,
}: ScrollLinkProps) {
  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (href.startsWith("#")) {
      e.preventDefault();
      const target = document.querySelector(href);
      if (target) {
        target.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
      }
      window.history.pushState(null, "", href);
      window.dispatchEvent(new HashChangeEvent("hashchange"));
      onClick?.();
    }
  };

  return (
    <Link href={href} scroll={false} onClick={handleClick} className={className}>
      {children}
    </Link>
  );
}
