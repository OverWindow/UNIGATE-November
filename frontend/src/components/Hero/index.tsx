"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { useTranslation } from "@/lib/i18n/LanguageContext";

const Hero = () => {
  const t = useTranslation();

  return (
    <>
      <section
        id="home"
        className="relative z-10 overflow-hidden bg-white pt-[120px] pb-16 md:pt-[150px] md:pb-[60px] xl:pt-[180px] xl:pb-[80px] 2xl:pt-[210px] 2xl:pb-[100px]"
      >
        {/* Background decoration */}
        <div className="absolute inset-0 z-[-1] overflow-hidden">
          {/* Soft gradient blobs */}
          <div className="absolute top-[-10%] right-[-5%] h-[50%] w-[50%] rounded-full bg-primary/[0.06] blur-[100px]" />
          <div className="absolute bottom-[-10%] left-[-10%] h-[45%] w-[45%] rounded-full bg-primary/[0.05] blur-[100px]" />
          <div className="absolute top-[20%] left-[15%] h-[30%] w-[30%] rounded-full bg-primary/[0.04] blur-[80px]" />

          {/* Top-right flowing lines */}
          <svg
            className="absolute top-0 right-0 opacity-60 lg:opacity-80"
            width="600"
            height="420"
            viewBox="0 0 600 420"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M40 320C160 240 300 240 420 270C500 290 560 280 620 250"
              stroke="url(#hero-line-1)"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <path
              d="M0 280C140 210 300 200 440 230C530 250 580 240 620 220"
              stroke="url(#hero-line-2)"
              strokeWidth="1"
              strokeLinecap="round"
            />
            <path
              d="M80 360C220 280 380 290 520 320"
              stroke="url(#hero-line-3)"
              strokeWidth="1"
              strokeLinecap="round"
            />
            <defs>
              <linearGradient id="hero-line-1" x1="0" y1="320" x2="620" y2="250" gradientUnits="userSpaceOnUse">
                <stop stopColor="#155FCC" stopOpacity="0.35" />
                <stop offset="1" stopColor="#4A6CF7" stopOpacity="0.05" />
              </linearGradient>
              <linearGradient id="hero-line-2" x1="0" y1="280" x2="620" y2="220" gradientUnits="userSpaceOnUse">
                <stop stopColor="#155FCC" stopOpacity="0.2" />
                <stop offset="1" stopColor="#4A6CF7" stopOpacity="0.05" />
              </linearGradient>
              <linearGradient id="hero-line-3" x1="80" y1="360" x2="520" y2="320" gradientUnits="userSpaceOnUse">
                <stop stopColor="#155FCC" stopOpacity="0.15" />
                <stop offset="1" stopColor="#4A6CF7" stopOpacity="0.05" />
              </linearGradient>
            </defs>
          </svg>

          {/* Bottom-left flowing lines */}
          <svg
            className="absolute bottom-0 left-0 opacity-60 lg:opacity-80"
            width="540"
            height="300"
            viewBox="0 0 540 300"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M-20 180C120 140 260 150 380 180C470 205 520 210 560 200"
              stroke="url(#hero-line-4)"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <path
              d="M-20 220C140 190 300 190 420 220C500 245 540 250 560 240"
              stroke="url(#hero-line-5)"
              strokeWidth="1"
              strokeLinecap="round"
            />
            <defs>
              <linearGradient id="hero-line-4" x1="-20" y1="180" x2="560" y2="200" gradientUnits="userSpaceOnUse">
                <stop stopColor="#155FCC" stopOpacity="0.25" />
                <stop offset="1" stopColor="#4A6CF7" stopOpacity="0.05" />
              </linearGradient>
              <linearGradient id="hero-line-5" x1="-20" y1="220" x2="560" y2="240" gradientUnits="userSpaceOnUse">
                <stop stopColor="#155FCC" stopOpacity="0.15" />
                <stop offset="1" stopColor="#4A6CF7" stopOpacity="0.05" />
              </linearGradient>
            </defs>
          </svg>

          {/* Subtle dot grid */}
          <svg
            className="absolute inset-0 h-full w-full opacity-[0.15]"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <pattern id="dot-grid" width="32" height="32" patternUnits="userSpaceOnUse">
                <circle cx="1" cy="1" r="1" fill="#155FCC" fillOpacity="0.15" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#dot-grid)" />
          </svg>
        </div>

        <div className="container">
          <div className="-mx-4 flex flex-wrap">
            <div className="w-full px-4">
              <div className="mx-auto max-w-[800px] animate-fade-in text-center">
                <h1 className="mb-5 text-xl leading-tight font-bold text-black xs:text-2xl sm:text-3xl md:text-4xl">
                  {t.hero.title}
                </h1>
                <p className="text-body-color  mb-12 text-base leading-relaxed! sm:text-lg md:text-xl">
                  {t.hero.subtitle}
                </p>
                <div className="flex flex-col items-center justify-center space-y-4 sm:flex-row sm:space-y-0 sm:space-x-4">
                  <Link
                    href="https://lms.unigate.kr/lms"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-xs bg-black px-8 py-4 text-base font-semibold text-white transition duration-300 ease-in-out hover:bg-black/90   "
                  >
                    {t.hero.cta}
                    <ExternalLink className="h-5 w-5" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
};

export default Hero;
