"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getMenuData } from "./menuData";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import ScrollLink from "@/components/Common/ScrollLink";
import { useTranslation } from "@/lib/i18n/LanguageContext";

const Header = () => {
  // Navbar toggle
  const [navbarOpen, setNavbarOpen] = useState(false);
  const navbarToggleHandler = () => {
    setNavbarOpen(!navbarOpen);
  };

  // Sticky Navbar
  const [sticky, setSticky] = useState(false);
  const handleStickyNavbar = () => {
    if (window.scrollY >= 80) {
      setSticky(true);
    } else {
      setSticky(false);
    }
  };
  useEffect(() => {
    window.addEventListener("scroll", handleStickyNavbar);
    return () => window.removeEventListener("scroll", handleStickyNavbar);
  }, []);

  // Active hash for anchor links
  const [activeHash, setActiveHash] = useState("");
  useEffect(() => {
    const updateHash = () => setActiveHash(window.location.hash);
    updateHash();
    window.addEventListener("hashchange", updateHash);
    return () => window.removeEventListener("hashchange", updateHash);
  }, []);

  // submenu handler
  const [openIndex, setOpenIndex] = useState(-1);
  const handleSubmenu = (index: number) => {
    if (openIndex === index) {
      setOpenIndex(-1);
    } else {
      setOpenIndex(index);
    }
  };

  const t = useTranslation();
  const menuData = getMenuData(t);

  const isActive = (path?: string) => {
    if (!path) return false;
    if (path === "#home") return activeHash === "" || activeHash === "#home";
    return activeHash === path;
  };

  return (
    <>
      <header
        className={`header top-0 left-0 z-40 flex w-full items-center ${
          sticky
            ? "  shadow-sticky fixed z-9999 bg-white/80 backdrop-blur-xs transition"
            : "absolute bg-transparent"
        }`}
      >
        <div className="container">
          <div className="relative -mx-4 flex items-center justify-between">
            <div className="w-48 shrink-0 max-w-full px-4">
              <Link
                href="/"
                className={`header-logo block w-full ${
                  sticky ? "py-5 xl:py-2" : "py-8"
                } `}
              >
                <Image
                  src="/brand/unigate-logo.svg"
                  alt="UNIGATE"
                  width={140}
                  height={30}
                  className="h-auto w-full"
                />
                
              </Link>
            </div>
            <div className="flex w-full items-center justify-between px-4">
              <div>
                <button
                  onClick={navbarToggleHandler}
                  id="navbarToggler"
                  aria-label={t.accessibility.menu}
                  aria-expanded={navbarOpen}
                  aria-controls="navbarCollapse"
                  className="ring-primary absolute top-1/2 right-4 block translate-y-[-50%] rounded-lg px-3 py-[6px] focus:ring-2 xl:hidden"
                >
                  <span
                    className={`relative my-1.5 block h-0.5 w-[30px] bg-black transition-all duration-300  ${
                      navbarOpen ? "top-[7px] rotate-45" : " "
                    }`}
                  />
                  <span
                    className={`relative my-1.5 block h-0.5 w-[30px] bg-black transition-all duration-300  ${
                      navbarOpen ? "opacity-0" : " "
                    }`}
                  />
                  <span
                    className={`relative my-1.5 block h-0.5 w-[30px] bg-black transition-all duration-300  ${
                      navbarOpen ? "top-[-8px] -rotate-45" : " "
                    }`}
                  />
                </button>
                <nav
                  id="navbarCollapse"
                  className={`navbar border-body-color/50   absolute right-0 z-30 w-[250px] rounded border-[.5px] bg-white px-6 py-4 duration-300 xl:visible xl:static xl:w-auto xl:border-none xl:!bg-transparent xl:p-0 xl:opacity-100 ${
                    navbarOpen
                      ? "visibility top-full opacity-100"
                      : "invisible top-[120%] opacity-0"
                  }`}
                >
                  <div className="mb-4 px-0 xl:hidden">
                    <LanguageSwitcher />
                  </div>
                  <ul className="block xl:flex xl:gap-5">
                    {menuData.map((menuItem, index) => (
                      <li key={index} className="group relative">
                        {menuItem.path ? (
                          <ScrollLink
                            href={menuItem.path}
                            onClick={() => setNavbarOpen(false)}
                            className={`flex py-2 text-base xl:mr-0 xl:inline-flex xl:px-0 xl:py-6 ${
                              isActive(menuItem.path)
                                ? "text-primary "
                                : "text-dark hover:text-primary  "
                            }`}
                          >
                            {menuItem.title}
                          </ScrollLink>
                        ) : (
                          <>
                            <p
                              onClick={() => handleSubmenu(index)}
                              className="text-dark group-hover:text-primary flex cursor-pointer items-center justify-between py-2 text-base xl:mr-0 xl:inline-flex xl:px-0 xl:py-6  "
                            >
                              {menuItem.title}
                              <span className="pl-3">
                                <svg width="25" height="24" viewBox="0 0 25 24">
                                  <path
                                    fillRule="evenodd"
                                    clipRule="evenodd"
                                    d="M6.29289 8.8427C6.68342 8.45217 7.31658 8.45217 7.70711 8.8427L12 13.1356L16.2929 8.8427C16.6834 8.45217 17.3166 8.45217 17.7071 8.8427C18.0976 9.23322 18.0976 9.86639 17.7071 10.2569L12 15.964L6.29289 10.2569C5.90237 9.86639 5.90237 9.23322 6.29289 8.8427Z"
                                    fill="currentColor"
                                  />
                                </svg>
                              </span>
                            </p>
                            <div
                              className={`submenu  relative top-full left-0 rounded-sm bg-white transition-[top] duration-300 group-hover:opacity-100 xl:invisible xl:absolute xl:top-[110%] xl:block xl:w-[250px] xl:p-4 xl:opacity-0 xl:shadow-lg xl:group-hover:visible xl:group-hover:top-full ${
                                openIndex === index ? "block" : "hidden"
                              }`}
                            >
                              {menuItem.submenu?.map((submenuItem, index) => (
                                <ScrollLink
                                  href={submenuItem.path ?? ""}
                                  key={index}
                                  onClick={() => setNavbarOpen(false)}
                                  className="text-dark hover:text-primary block rounded-sm py-2.5 text-sm xl:px-3  "
                                >
                                  {submenuItem.title}
                                </ScrollLink>
                              ))}
                            </div>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                </nav>
              </div>
              <div className="hidden items-center gap-4 xl:flex">
                <LanguageSwitcher />
              </div>
            </div>
          </div>
        </div>
      </header>
    </>
  );
};

export default Header;
