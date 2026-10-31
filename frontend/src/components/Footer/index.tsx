"use client";

import Image from "next/image";
import Link from "next/link";
import { Instagram, Youtube, Linkedin } from "lucide-react";
import TikTokIcon from "@/components/icons/TikTokIcon";
import ScrollLink from "@/components/Common/ScrollLink";
import { useTranslation } from "@/lib/i18n/LanguageContext";

const Footer = ({ year }: { year: number }) => {
  const t = useTranslation();

  const menu = [
    { title: t.nav.home, href: "#home" },
    { title: t.nav.about, href: "#about" },
    { title: t.nav.curriculum, href: "#curriculum" },
    { title: t.nav.partners, href: "#partners" },
    { title: t.nav.contact, href: "#contact" },
  ];

  const social = [
    { label: "Instagram", href: "/", icon: Instagram },
    { label: "TikTok", href: "/", icon: TikTokIcon },
    { label: "YouTube", href: "/", icon: Youtube },
    {
      label: "LinkedIn",
      href: "https://linkedin.com/company/unigatekr",
      icon: Linkedin,
    },
  ];

  return (
    <footer className="relative z-10 bg-white pt-16 md:pt-20 lg:pt-24">
      <div className="container">
        <div className="-mx-4 flex flex-wrap gap-y-10">
          <div className="w-full px-4 lg:w-5/12 xl:w-5/12">
            <div className="max-w-[380px]">
              <Link href="/" className="mb-6 inline-flex items-center">
                <Image
                  src="/brand/unigate-logo.svg"
                  alt="UNIGATE"
                  width={140}
                  height={30}
                  className="h-[30px] w-auto"
                  priority
                />
              </Link>

              <p className="text-body-color mb-6 text-sm leading-relaxed">
                {t.footer.tagline}
              </p>

              <div className="flex items-center gap-4">
                {social.map(({ label, href, icon: Icon }) => (
                  <a
                    key={label}
                    href={href}
                    aria-label={label}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="border-body-color/[.15] text-body-color hover:text-primary inline-flex h-10 w-10 items-center justify-center rounded-2xl border bg-white/60 transition hover:-translate-y-0.5 hover:shadow-lg"
                  >
                    <Icon className="h-5 w-5" />
                  </a>
                ))}
              </div>
            </div>
          </div>

          <div className="w-full px-4 sm:w-1/2 lg:w-2/12">
            <h2 className="mb-5 text-base font-bold text-black">
              {t.footer.menuTitle}
            </h2>
            <ul className="space-y-3">
              {menu.map((item) => (
                <li key={item.title}>
                  <ScrollLink
                    href={item.href}
                    className="text-body-color hover:text-primary text-sm transition"
                  >
                    {item.title}
                  </ScrollLink>
                </li>
              ))}
            </ul>
          </div>

          <div className="w-full px-4 sm:w-1/2 lg:w-2/12">
            <h2 className="mb-5 text-base font-bold text-black">
              {t.footer.policyTitle}
            </h2>
            <ul className="space-y-3">
              <li>
                <Link
                  href="/terms"
                  className="text-body-color hover:text-primary text-sm transition"
                >
                  {t.footer.terms}
                </Link>
              </li>
              <li>
                <Link
                  href="/privacy"
                  className="text-body-color hover:text-primary text-sm transition"
                >
                  {t.footer.privacy}
                </Link>
              </li>
              <li>
                <Link
                  href="/refund"
                  className="text-body-color hover:text-primary text-sm transition"
                >
                  {t.footer.refund}
                </Link>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div className="w-full px-4 lg:w-3/12">
            <h2 className="mb-5 text-base font-bold text-black">
              {t.footer.contactTitle}
            </h2>
            <ul className="space-y-3">
              <li className="text-body-color text-sm">
                {t.footer.emailLabel}: contact@unigate.kr
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 h-px w-full bg-linear-to-r from-transparent via-[#D2D8E183] to-transparent" />

        <div className="py-8">
          <p className="text-body-color text-center text-xs font-medium">
            © {year} UNIGATE. All rights reserved.{" "}
            <span className="text-body-color/70">
              <br className="block lg:hidden" />
              {t.footer.copyright}
            </span>
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
