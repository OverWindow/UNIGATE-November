export type Language = "ko" | "en" | "id";

interface LandingContent {
  navigation: [string, string, string, string, string];
  accessibility: {
    home: string;
    language: string;
    openMenu: string;
    closeMenu: string;
    skip: string;
    navigation: string;
  };
  footer: { parent: string; top: string; licenses: string; trademark: string; billing: string; settings: string };
}

export const landingContent: Record<Language, LandingContent> = {
  ko: {
    navigation: ["홈", "PBT", "IBT", "단어장", "AI 쓰기 튜터"],
    accessibility: {
      home: "TOPIQ 처음으로",
      language: "화면 언어 선택",
      openMenu: "메뉴 열기",
      closeMenu: "메뉴 닫기",
      skip: "본문으로 바로가기",
      navigation: "페이지 메뉴",
    },
    footer: { parent: "UNIGATE 소개", top: "맨 위로", licenses: "오픈소스 라이선스", trademark: "UNIGATE는 등록상표입니다. 대한민국 출원 제40-2026-0039342호, 인도네시아 등록 제IDM001488588호.", billing: "결제·환불 문의", settings: "설정" },
  },
  en: {
    navigation: ["Home", "PBT", "IBT", "Vocabulary", "AI Writing Tutor"],
    accessibility: {
      home: "TOPIQ home",
      language: "Choose a language",
      openMenu: "Open menu",
      closeMenu: "Close menu",
      skip: "Skip to content",
      navigation: "Page navigation",
    },
    footer: { parent: "About UNIGATE", top: "Back to top", licenses: "Open-source licenses", trademark: "UNIGATE is a registered trademark. Republic of Korea application No. 40-2026-0039342 and Indonesia registration No. IDM001488588.", billing: "Payment and refund inquiries", settings: "Settings" },
  },
  id: {
    navigation: ["Beranda", "PBT", "IBT", "Kosakata", "Tutor Menulis AI"],
    accessibility: {
      home: "Beranda TOPIQ",
      language: "Pilih bahasa",
      openMenu: "Buka menu",
      closeMenu: "Tutup menu",
      skip: "Langsung ke konten",
      navigation: "Navigasi halaman",
    },
    footer: { parent: "Tentang UNIGATE", top: "Kembali ke atas", licenses: "Lisensi sumber terbuka", trademark: "UNIGATE adalah merek terdaftar. Permohonan Republik Korea No. 40-2026-0039342 dan pendaftaran Indonesia No. IDM001488588.", billing: "Pertanyaan pembayaran dan pengembalian dana", settings: "Pengaturan" },
  },
};
