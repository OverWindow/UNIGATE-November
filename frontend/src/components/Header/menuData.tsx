import { Menu } from "@/types/menu";
import { Translations } from "@/lib/i18n/translations";

export function getMenuData(t: Translations): Menu[] {
  return [
    {
      id: 1,
      title: t.nav.home,
      path: "#home",
      newTab: false,
    },
    {
      id: 2,
      title: t.nav.about,
      path: "#about",
      newTab: false,
    },
    {
      id: 3,
      title: t.nav.curriculum,
      path: "#curriculum",
      newTab: false,
    },
    {
      id: 4,
      title: t.nav.partners,
      path: "#partners",
      newTab: false,
    },
    {
      id: 5,
      title: t.nav.contact,
      path: "#contact",
      newTab: false,
    },
  ];
}
