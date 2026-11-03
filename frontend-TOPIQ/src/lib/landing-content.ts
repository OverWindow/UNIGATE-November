export type Language = "ko" | "en" | "id";
export type LearningArea = "reading" | "writing" | "vocabulary";

export const learningAreas: LearningArea[] = ["reading", "writing", "vocabulary"];

interface LearningContent {
  name: string;
  summary: string;
  title: string;
  description: string;
  points: [string, string];
}

interface LandingContent {
  navigation: [string, string, string, string];
  comingSoon: { badge: string; title: string; message: string; home: string };
  login: string;
  accessibility: {
    home: string;
    language: string;
    openMenu: string;
    closeMenu: string;
    skip: string;
    navigation: string;
    example: string;
  };
  hero: {
    eyebrow: string;
    title: string;
    description: string;
    action: string;
    note: string;
    sample: string;
    sampleLabel: string;
    sampleFooter: string;
  };
  about: { title: string; description: string; notice: string };
  areas: Record<LearningArea, LearningContent>;
  guide: {
    eyebrow: string;
    title: string;
    description: string;
    points: [string, string, string];
    action: string;
  };
  uses: {
    title: string;
    description: string;
    cards: { title: string; description: string }[];
  };
  faq: {
    title: string;
    description: string;
    items: { question: string; answer: string }[];
  };
  footer: { description: string; parent: string; top: string; tagline: string };
}

export const landingContent: Record<Language, LandingContent> = {
  ko: {
    navigation: ["PBT", "IBT", "단어장", "AI 쓰기 튜터"],
    comingSoon: { badge: "준비 중", title: "아직 준비 중이에요", message: "아직 준비 중이에요. 조금만 기다려 주세요!", home: "홈으로 돌아가기" },
    login: "로그인",
    accessibility: {
      home: "TOPIQ 처음으로",
      language: "화면 언어 선택",
      openMenu: "메뉴 열기",
      closeMenu: "메뉴 닫기",
      skip: "본문으로 바로가기",
      navigation: "페이지 메뉴",
      example: "읽기 문제의 정적인 예시. 두 번째 보기가 강조되어 있습니다.",
    },
    hero: {
      eyebrow: "한국어 학습의 다음 단계",
      title: "TOPIK II, 더 자신 있게 준비하세요.",
      description: "읽기와 쓰기, 꼭 필요한 어휘까지. 내게 필요한 한국어 학습을 TOPIQ 한곳에서 만나보세요.",
      action: "학습 살펴보기",
      note: "읽기 · 쓰기 · 단어장",
      sample: "학습 예시",
      sampleLabel: "읽기",
      sampleFooter: "이해하는 즐거움, 한 문제에서 시작됩니다.",
    },
    about: {
      title: "읽기부터 어휘까지, 한곳에서 차근차근.",
      description: "지문을 이해하고, 생각을 글로 표현하고, 새로운 단어를 내 것으로 만드는 시간. TOPIQ은 서로 이어지는 한국어 학습을 준비합니다.",
      notice: "현재는 서비스 소개 페이지입니다. 실제 문제풀이와 학습 기능은 준비 중입니다.",
    },
    areas: {
      reading: {
        name: "읽기",
        summary: "글의 핵심을 찾고, 문맥을 이해하는 연습",
        title: "읽을수록 선명해지는 이해",
        description: "다양한 지문을 읽으며 글의 주제와 흐름을 살펴보세요. 문제 유형에 익숙해지고 문장을 연결해 이해하는 학습을 소개합니다.",
        points: ["지문의 핵심과 문맥 이해", "유형별 읽기 문제 학습"],
      },
      writing: {
        name: "쓰기",
        summary: "문장부터 한 편의 글까지, 생각을 표현하는 연습",
        title: "생각을 자연스러운 문장으로",
        description: "알고 있는 한국어를 나의 글로 옮겨 보세요. 문장 완성과 글의 구성을 통해 더 정확하게 표현하는 학습을 소개합니다.",
        points: ["문장 완성과 표현 연습", "주제에 맞는 글 구성"],
      },
      vocabulary: {
        name: "단어장",
        summary: "뜻과 쓰임을 함께 익히는 어휘 학습",
        title: "하나의 단어를 더 깊이",
        description: "단어의 뜻에서 한 걸음 더 나아가 보세요. 지문과 표현 속에서 어휘를 살펴보고, 읽기와 쓰기로 연결하는 학습을 소개합니다.",
        points: ["주제와 문맥 속 어휘 정리", "뜻과 쓰임을 함께 익히기"],
      },
    },
    guide: {
      eyebrow: "ABOUT TOPIK",
      title: "TOPIK, 어떤 시험인가요?",
      description: "TOPIK은 한국어를 모국어로 하지 않는 학습자의 한국어 능력을 평가하는 한국어능력시험입니다.",
      points: ["한국어 학습자를 위한 능력 평가", "TOPIK II는 중급·고급 학습자를 위한 시험", "시험 일정과 응시 안내는 공식 사이트에서 확인"],
      action: "TOPIK 공식 사이트",
    },
    uses: {
      title: "한국어로 넓어지는 나의 가능성",
      description: "유학부터 커리어, 한국에서의 일상까지. 나만의 목표를 향해 한국어 실력을 쌓아 보세요.",
      cards: [
        { title: "한국 유학 준비", description: "대학과 대학원에서 공부할 수 있도록 한국어 학습의 방향을 세워 보세요." },
        { title: "취업과 커리어", description: "한국어로 소통하는 힘을 기르고, 나의 언어 역량을 넓혀 보세요." },
        { title: "한국에서의 일상", description: "더 많은 글을 이해하고 내 생각을 표현하며 새로운 경험에 가까워지세요." },
      ],
    },
    faq: {
      title: "궁금한 점이 있나요?",
      description: "TOPIQ에 대해 자주 묻는 질문을 모았습니다.",
      items: [
        { question: "TOPIQ은 어떤 학습을 위한 서비스인가요?", answer: "TOPIQ은 TOPIK II를 준비하는 한국어 학습자를 위한 서비스입니다. 읽기 문제, 쓰기 연습, 단어장을 연결하는 학습을 준비하고 있습니다." },
        { question: "이 페이지에서 실제 문제를 풀 수 있나요?", answer: "현재는 서비스 소개용 랜딩 페이지입니다. 화면의 문제는 학습 예시이며, 실제 문제풀이·채점·학습 기록 기능은 아직 제공하지 않습니다." },
        { question: "어떤 언어로 페이지를 볼 수 있나요?", answer: "한국어, 영어, 인도네시아어를 지원합니다. 상단의 언어 선택 버튼으로 바꿀 수 있으며, 한국어 학습용 문제 예시는 한국어로 표시됩니다." },
        { question: "모바일에서도 볼 수 있나요?", answer: "네. 휴대폰, 태블릿, PC 화면에 맞춰 학습 소개를 살펴볼 수 있습니다. 모바일에서는 상단 메뉴 버튼으로 원하는 영역으로 이동할 수 있습니다." },
      ],
    },
    footer: { description: "한국어 학습의 다음 단계, TOPIQ.", parent: "UNIGATE 소개", top: "맨 위로", tagline: "당신의 다음 단계를 함께합니다." },
  },
  en: {
    navigation: ["PBT", "IBT", "Vocabulary", "AI Writing Tutor"],
    comingSoon: { badge: "Coming soon", title: "Something new is on its way", message: "We're getting things ready. Please check back soon!", home: "Back to home" },
    login: "Log in",
    accessibility: {
      home: "TOPIQ home",
      language: "Choose a language",
      openMenu: "Open menu",
      closeMenu: "Close menu",
      skip: "Skip to content",
      navigation: "Page navigation",
      example: "A static reading question example. The second option is highlighted.",
    },
    hero: {
      eyebrow: "YOUR NEXT CHAPTER, IN KOREAN",
      title: "A little closer to your TOPIK II goal.",
      description: "Reading, writing, and the words that bring them together. Discover a more connected way to learn Korean with TOPIQ.",
      action: "Explore learning",
      note: "Reading · Writing · Vocabulary",
      sample: "Learning example",
      sampleLabel: "Reading",
      sampleFooter: "Understanding starts with one question.",
    },
    about: {
      title: "From reading to vocabulary. All connected.",
      description: "Understand a passage, put your thoughts into words, and make new vocabulary your own. TOPIQ is preparing a place where your Korean learning comes together.",
      notice: "This is a service introduction. Exercises and learning features are in development.",
    },
    areas: {
      reading: {
        name: "Reading",
        summary: "Find the main idea and understand the context",
        title: "Read with a clearer understanding",
        description: "Explore the ideas and structure of different passages. Get to know reading question types and how sentences connect to create meaning.",
        points: ["Main ideas and context", "Practice by question type"],
      },
      writing: {
        name: "Writing",
        summary: "Express your ideas, from a sentence to an essay",
        title: "Turn your thoughts into words",
        description: "Bring the Korean you know into your own writing. Discover an approach built around completing sentences and organizing your ideas.",
        points: ["Sentence building and expression", "Writing around a topic"],
      },
      vocabulary: {
        name: "Vocabulary",
        summary: "Learn what words mean and how to use them",
        title: "Get to know each word better",
        description: "Go beyond a definition. Explore words in passages and expressions, and see how vocabulary connects to your reading and writing.",
        points: ["Words in context and by topic", "Meaning and everyday usage"],
      },
    },
    guide: {
      eyebrow: "ABOUT TOPIK",
      title: "What is the TOPIK test?",
      description: "The Test of Proficiency in Korean assesses Korean language skills for learners whose first language is not Korean.",
      points: ["A proficiency test for Korean learners", "TOPIK II covers intermediate and advanced levels", "Check the official site for schedules and registration"],
      action: "Official TOPIK website",
    },
    uses: {
      title: "More Korean. More possibilities.",
      description: "Studying, building a career, or finding your way in Korea. Grow your Korean with your own goals in mind.",
      cards: [
        { title: "Study in Korea", description: "Give your language learning direction as you prepare for university or graduate school." },
        { title: "Work and careers", description: "Build the confidence to communicate in Korean and expand your language skills." },
        { title: "Everyday life in Korea", description: "Understand more, express yourself, and feel a little closer to new experiences." },
      ],
    },
    faq: {
      title: "A few things you might be wondering.",
      description: "Get to know TOPIQ a little better.",
      items: [
        { question: "What kind of learning is TOPIQ for?", answer: "TOPIQ is for Korean learners preparing for TOPIK II. We are developing a learning experience that connects reading questions, writing practice, and vocabulary." },
        { question: "Can I take a test on this page?", answer: "This is a service introduction page. The question shown is an illustrative example. Exercises, scoring, and learning records are not available yet." },
        { question: "Which languages can I use?", answer: "The page supports Korean, English, and Indonesian. Use the language buttons in the header to switch. The Korean learning example stays in Korean." },
        { question: "Can I view the page on my phone?", answer: "Yes. The page adapts to phones, tablets, and computers. On smaller screens, use the menu button in the header to jump to a section." },
      ],
    },
    footer: { description: "Your next chapter in Korean, with TOPIQ.", parent: "About UNIGATE", top: "Back to top", tagline: "Made for your next chapter." },
  },
  id: {
    navigation: ["PBT", "IBT", "Kosakata", "Tutor Menulis AI"],
    comingSoon: { badge: "Segera hadir", title: "Sedang kami siapkan", message: "Sedang kami siapkan. Tunggu sebentar lagi, ya!", home: "Kembali ke beranda" },
    login: "Masuk",
    accessibility: {
      home: "Beranda TOPIQ",
      language: "Pilih bahasa",
      openMenu: "Buka menu",
      closeMenu: "Tutup menu",
      skip: "Langsung ke konten",
      navigation: "Navigasi halaman",
      example: "Contoh soal membaca yang statis. Pilihan kedua ditandai.",
    },
    hero: {
      eyebrow: "LANGKAH BARU DALAM BAHASA KOREA",
      title: "Selangkah lebih dekat dengan target TOPIK II.",
      description: "Membaca, menulis, dan kosakata yang menghubungkan keduanya. Temukan cara belajar bahasa Korea yang saling terhubung bersama TOPIQ.",
      action: "Jelajahi pembelajaran",
      note: "Membaca · Menulis · Kosakata",
      sample: "Contoh pembelajaran",
      sampleLabel: "Membaca",
      sampleFooter: "Pemahaman dimulai dari satu soal.",
    },
    about: {
      title: "Dari membaca hingga kosakata. Saling terhubung.",
      description: "Memahami bacaan, menuangkan pikiran dalam tulisan, dan menguasai kata baru. TOPIQ sedang menyiapkan tempat untuk menghubungkan proses belajar bahasa Koreamu.",
      notice: "Ini adalah halaman pengenalan layanan. Latihan dan fitur belajar sedang disiapkan.",
    },
    areas: {
      reading: {
        name: "Membaca",
        summary: "Temukan gagasan utama dan pahami konteks bacaan",
        title: "Membaca dengan pemahaman lebih baik",
        description: "Kenali gagasan dan alur berbagai bacaan. Pelajari jenis soal membaca serta hubungan antarkalimat untuk memahami makna teks.",
        points: ["Gagasan utama dan konteks", "Belajar berdasarkan jenis soal"],
      },
      writing: {
        name: "Menulis",
        summary: "Sampaikan pikiran, dari satu kalimat hingga tulisan utuh",
        title: "Tuangkan pikiran menjadi tulisan",
        description: "Gunakan bahasa Korea yang kamu ketahui dalam tulisanmu sendiri. Kenali latihan melengkapi kalimat dan menyusun gagasan secara terarah.",
        points: ["Menyusun kalimat dan ungkapan", "Menulis sesuai topik"],
      },
      vocabulary: {
        name: "Kosakata",
        summary: "Pelajari arti kata sekaligus cara menggunakannya",
        title: "Kenali setiap kata lebih dalam",
        description: "Belajar lebih dari sekadar arti kata. Kenali kosakata dalam bacaan dan ungkapan, lalu hubungkan dengan latihan membaca dan menulis.",
        points: ["Kosakata sesuai konteks dan topik", "Arti dan penggunaan kata"],
      },
    },
    guide: {
      eyebrow: "TENTANG TOPIK",
      title: "Apa itu ujian TOPIK?",
      description: "Test of Proficiency in Korean adalah ujian kemampuan bahasa Korea bagi pelajar yang bahasa ibunya bukan bahasa Korea.",
      points: ["Ujian kemampuan bagi pelajar bahasa Korea", "TOPIK II untuk tingkat menengah dan lanjut", "Lihat jadwal dan pendaftaran di situs resmi"],
      action: "Situs resmi TOPIK",
    },
    uses: {
      title: "Bahasa Korea membuka lebih banyak peluang.",
      description: "Kuliah, karier, atau keseharian di Korea. Kembangkan kemampuan bahasa Korea sesuai tujuanmu.",
      cards: [
        { title: "Kuliah di Korea", description: "Tentukan arah belajar bahasa Korea untuk mempersiapkan studi sarjana maupun pascasarjana." },
        { title: "Pekerjaan dan karier", description: "Bangun kemampuan berkomunikasi dalam bahasa Korea dan perluas keterampilan bahasamu." },
        { title: "Keseharian di Korea", description: "Pahami lebih banyak, sampaikan pikiranmu, dan sambut pengalaman baru dengan lebih percaya diri." },
      ],
    },
    faq: {
      title: "Ada yang ingin kamu tanyakan?",
      description: "Kenali TOPIQ melalui pertanyaan yang sering diajukan.",
      items: [
        { question: "TOPIQ ditujukan untuk pembelajaran apa?", answer: "TOPIQ ditujukan bagi pelajar bahasa Korea yang mempersiapkan TOPIK II. Kami sedang mengembangkan pembelajaran yang menghubungkan soal membaca, latihan menulis, dan kosakata." },
        { question: "Apakah saya bisa mengerjakan ujian di halaman ini?", answer: "Ini adalah halaman pengenalan layanan. Soal yang ditampilkan hanyalah contoh. Latihan soal, penilaian, dan catatan belajar belum tersedia." },
        { question: "Bahasa apa saja yang tersedia?", answer: "Halaman ini tersedia dalam bahasa Korea, Inggris, dan Indonesia. Gunakan tombol bahasa di bagian atas untuk beralih. Contoh pembelajaran bahasa Korea tetap ditampilkan dalam bahasa Korea." },
        { question: "Apakah halaman ini bisa dibuka di ponsel?", answer: "Ya. Tampilan menyesuaikan ponsel, tablet, dan komputer. Pada layar kecil, gunakan tombol menu di bagian atas untuk menuju bagian yang kamu inginkan." },
      ],
    },
    footer: { description: "Langkah baru dalam bahasa Korea, bersama TOPIQ.", parent: "Tentang UNIGATE", top: "Kembali ke atas", tagline: "Untuk langkah berikutnya dalam belajarmu." },
  },
};
