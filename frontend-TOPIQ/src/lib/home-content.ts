import type { Language } from "./landing-content";

interface HomeContent {
  hero: { title: string; description: string; action: string };
  tests: { title: string; description: string; round: string; section: string; mode: string; timed: string; practice: string; start: string };
  about: { title: string; description: string; features: { title: string; description: string }[]; notice: string };
  guide: { title: string; organizations: string; ministry: string; institute: string; points: string[]; action: string };
  uses: { title: string; description: string; cards: { title: string; description: string }[] };
  faq: { title: string; items: { question: string; answer: string }[] };
  trademark: string;
}

export const homeContent: Record<Language, HomeContent> = {
  ko: {
    hero: {
      title: "TOPIK II 실력을\n확인해보세요.",
      description: "TOPIK II 읽기와 듣기 50문항을 실전 또는 연습 모드로 풀고,\n정확한 응답 분석과 오답 해설을 확인할 수 있습니다.",
      action: "TOPIQ 소개",
    },
    tests: { title: "PBT 모의고사 선택", description: "읽기 또는 듣기 모의고사를 선택하세요.\n각 회차는 50문항, 총 100점입니다.", round: "회차", section: "영역", mode: "모드", timed: "실전 모드", practice: "연습 모드", start: "모의고사 시작" },
    about: {
      title: "TOPIK 문제 풀이와\n결과 확인을 한곳에서",
      description: "TOPIQ는 외국인 한국어 학습자를 위한 AI 기반 TOPIK 학습 서비스입니다. 다양한 문제를 풀고 정답과 해설을 확인하며 한국어 학습을 이어갈 수 있습니다.",
      features: [
        { title: "더 풍부하고 정교한 문제를 만듭니다", description: "LLM을 활용해 TOPIK 유형에 맞는 문제를 생성하고 검토·최적화합니다. 축적된 문항은 지속적으로 관리되어 폭넓은 학습 기반이 됩니다." },
        { title: "풀이 결과를 확인하고 복습합니다", description: "모의시험을 마치면 점수와 문항별 정오답을 확인할 수 있습니다. 정답과 해설을 살펴보며 틀린 문제를 복습해보세요." },
      ],
      notice: "현재 베타 버전에서는 읽기·듣기 모의고사와\n풀이 결과 및 해설을 제공합니다.",
    },
    guide: {
      title: "TOPIK 시험이란 무엇인가요?", organizations: "TOPIK 주관 기관", ministry: "대한민국 교육부", institute: "국립국제교육원",
      points: ["한국어가 모국어가 아닌 외국인과 재외동포를 위한 시험", "TOPIK I은 1급과 2급, TOPIK II는 3급부터 6급까지 평가", "공식 성적은 성적 발표일부터 2년 동안 유효", "대한민국 교육부 국립국제교육원이 주관"],
      action: "TOPIK 공식 시험 안내 보기",
    },
    uses: {
      title: "TOPIK 성적은 어디에 사용하나요?",
      description: "필요한 급수는 학교, 회사, 비자 종류에 따라 다릅니다.\n지원하기 전에 해당 기관의 최신 기준을 확인하세요.",
      cards: [
        { title: "한국 유학", description: "한국 대학과 대학원 입학, 졸업, 정부초청 장학생 프로그램에서 한국어 능력 확인에 활용될 수 있습니다." },
        { title: "취업과 경력", description: "한국과 해외의 기업 또는 공공기관에서 지원자의 한국어 능력을 확인하는 자료로 사용할 수 있습니다." },
        { title: "비자와 체류", description: "일부 취업 비자와 영주권 등 체류 자격을 신청할 때 TOPIK 성적이 필요하거나 도움이 될 수 있습니다." },
      ],
    },
    faq: {
      title: "TOPIK 자주 묻는 질문",
      items: [
        { question: "누가 TOPIK에 응시할 수 있나요?", answer: "한국어가 모국어가 아닌 외국인과 재외동포가 응시할 수 있습니다. 한국어 학습 수준을 확인하거나 유학, 취업, 체류 자격 신청에 성적이 필요한 사람이 주로 응시합니다." },
        { question: "TOPIK I과 TOPIK II는 어떻게 다른가요?", answer: "TOPIK I은 초급 학습자를 대상으로 1급과 2급을 평가합니다. TOPIK II는 중급과 고급 학습자를 대상으로 3급부터 6급까지 평가합니다." },
        { question: "TOPIK 성적은 얼마나 오래 사용할 수 있나요?", answer: "공식 TOPIK 성적은 성적 발표일부터 2년 동안 유효합니다. 제출할 기관의 마감일에 성적이 유효한지 미리 확인하세요." },
        { question: "대학이나 취업에 몇 급이 필요한가요?", answer: "필요한 급수는 대학, 전공, 회사, 비자 종류에 따라 다릅니다. 지원하려는 기관의 공식 모집 안내에서 최신 기준을 확인해야 합니다." },
        { question: "TOPIQ 모의고사 점수는 공식 성적인가요?", answer: "아닙니다. TOPIQ 점수와 예측 급수는 현재 실력을 확인하고 학습 계획을 세우기 위한 참고 자료입니다. 공식 성적은 국립국제교육원이 시행하는 TOPIK에 응시해야 받을 수 있습니다." },
      ],
    },
    trademark: "UNIGATE는 등록상표입니다. 대한민국 출원 제40-2026-0039342호, 인도네시아 등록 제IDM001488588호.",
  },
  en: {
    hero: {
      title: "Find out where you stand in TOPIK II.",
      description: "Take 50-question TOPIK II reading and listening tests in timed or practice mode,\nthen review detailed response analysis and explanations.",
      action: "About TOPIQ",
    },
    tests: { title: "Choose a PBT Mock Test", description: "Choose a TOPIK II reading or listening test.\nEach set has 50 questions and a maximum score of 100.", round: "Set", section: "Section", mode: "Mode", timed: "Timed Mode", practice: "Practice Mode", start: "Start Mock Test" },
    about: {
      title: "TOPIK practice and\nresults in one place",
      description: "TOPIQ is an AI-powered TOPIK learning service for international Korean learners. Practice a range of questions, check your answers, and learn from explanations.",
      features: [
        { title: "A richer, more refined question bank", description: "TOPIQ uses LLMs to generate, review, and optimize questions aligned with TOPIK formats. Each item is continuously managed as part of a broad learning foundation." },
        { title: "Review your results and learn from mistakes", description: "After a mock test, check your score and see which answers were correct. Review the answers and explanations to learn from your mistakes." },
      ],
      notice: "The current beta offers reading and listening mock tests,\nresults, and answer explanations.",
    },
    guide: {
      title: "What is the TOPIK test?", organizations: "TOPIK organizers", ministry: "Ministry of Education, Republic of Korea", institute: "National Institute for International Education",
      points: ["For overseas Koreans and international learners whose first language is not Korean", "TOPIK I awards Levels 1 and 2. TOPIK II awards Levels 3 to 6", "Official scores are valid for two years from the result date", "Administered by the National Institute for International Education in Korea"],
      action: "Read the official TOPIK guide",
    },
    uses: {
      title: "What can a TOPIK score be used for?",
      description: "The required level depends on the school, employer, or visa type.\nAlways check the latest rules from the organization you plan to apply to.",
      cards: [
        { title: "Study in Korea", description: "Universities, graduate schools, and Korean government scholarship programs may use TOPIK to confirm Korean language ability." },
        { title: "Jobs and careers", description: "Companies and public organizations in Korea or abroad may use TOPIK as evidence of an applicant's Korean skills." },
        { title: "Visas and residence", description: "A TOPIK score may be required or helpful for some work visas, permanent residence applications, and other residence programs." },
      ],
    },
    faq: {
      title: "Frequently asked questions about TOPIK",
      items: [
        { question: "Who can take TOPIK?", answer: "TOPIK is for overseas Koreans and international learners whose first language is not Korean. Many people take it to check their level or to support an application for study, work, or residence." },
        { question: "What is the difference between TOPIK I and TOPIK II?", answer: "TOPIK I is for beginner learners and awards Level 1 or Level 2. TOPIK II is for intermediate and advanced learners and awards Levels 3 to 6." },
        { question: "How long is a TOPIK score valid?", answer: "An official TOPIK score is valid for two years from the result announcement date. Check that your score will still be valid on the application deadline." },
        { question: "Which TOPIK level do I need for university or work?", answer: "The required level depends on the university, major, employer, and visa type. Check the latest official requirements from the organization you plan to apply to." },
        { question: "Is a TOPIQ mock test score an official TOPIK score?", answer: "No. TOPIQ scores and predicted levels help you understand your current skills and plan your study. You must take a TOPIK test administered by the National Institute for International Education to receive an official score." },
      ],
    },
    trademark: "UNIGATE is a registered trademark. Republic of Korea application No. 40-2026-0039342 and Indonesia registration No. IDM001488588.",
  },
  id: {
    hero: {
      title: "Ketahui kemampuan TOPIK II Anda.",
      description: "Kerjakan 50 soal membaca dan menyimak TOPIK II dalam mode simulasi atau latihan,\nlalu tinjau analisis jawaban dan pembahasannya.",
      action: "Tentang TOPIQ",
    },
    tests: { title: "Pilih Simulasi PBT", description: "Pilih simulasi membaca atau menyimak TOPIK II.\nSetiap set berisi 50 soal dengan nilai maksimal 100.", round: "Set", section: "Bidang", mode: "Mode", timed: "Mode Simulasi", practice: "Mode Latihan", start: "Mulai Simulasi" },
    about: {
      title: "Latihan dan hasil TOPIK\ndi satu tempat",
      description: "TOPIQ adalah layanan belajar TOPIK berbasis AI untuk pelajar bahasa Korea internasional. Kerjakan beragam soal, periksa jawaban, dan pelajari pembahasannya.",
      features: [
        { title: "Bank soal yang lebih beragam dan teruji", description: "TOPIQ menggunakan LLM untuk membuat, meninjau, dan menyempurnakan soal sesuai format TOPIK. Setiap soal terus dikelola untuk membangun sumber belajar yang luas." },
        { title: "Tinjau hasil dan belajar dari kesalahan", description: "Setelah simulasi, lihat nilai serta jawaban yang benar dan salah. Pelajari kembali jawaban dan pembahasannya untuk memahami kesalahan Anda." },
      ],
      notice: "Versi beta saat ini menyediakan simulasi membaca dan menyimak,\nhasil ujian, serta pembahasan jawaban.",
    },
    guide: {
      title: "Apa itu ujian TOPIK?", organizations: "Penyelenggara TOPIK", ministry: "Kementerian Pendidikan Republik Korea", institute: "National Institute for International Education",
      points: ["Untuk warga Korea di luar negeri dan pelajar yang bahasa ibunya bukan bahasa Korea", "TOPIK I menilai level 1 dan 2. TOPIK II menilai level 3 hingga 6", "Nilai resmi berlaku selama dua tahun sejak pengumuman hasil", "Diselenggarakan oleh National Institute for International Education di Korea"],
      action: "Lihat panduan resmi TOPIK",
    },
    uses: {
      title: "Untuk apa nilai TOPIK digunakan?",
      description: "Level yang diperlukan bergantung pada sekolah, perusahaan, atau jenis visa.\nPeriksa persyaratan terbaru dari institusi tujuan sebelum mendaftar.",
      cards: [
        { title: "Studi di Korea", description: "Universitas, program pascasarjana, dan beasiswa pemerintah Korea dapat menggunakan TOPIK untuk menilai kemampuan bahasa Korea." },
        { title: "Pekerjaan dan karier", description: "Perusahaan dan lembaga publik di Korea maupun luar negeri dapat menggunakan TOPIK sebagai bukti kemampuan bahasa Korea pelamar." },
        { title: "Visa dan izin tinggal", description: "Nilai TOPIK mungkin diperlukan atau bermanfaat untuk jenis visa kerja tertentu, izin tinggal permanen, dan program izin tinggal lainnya." },
      ],
    },
    faq: {
      title: "Pertanyaan umum tentang TOPIK",
      items: [
        { question: "Siapa yang dapat mengikuti TOPIK?", answer: "TOPIK ditujukan bagi warga Korea di luar negeri dan pelajar yang bahasa ibunya bukan bahasa Korea. Ujian ini dapat digunakan untuk mengetahui kemampuan bahasa atau mendukung pendaftaran studi, pekerjaan, dan izin tinggal." },
        { question: "Apa perbedaan TOPIK I dan TOPIK II?", answer: "TOPIK I ditujukan untuk pemula dan menilai level 1 atau 2. TOPIK II ditujukan untuk pelajar tingkat menengah dan lanjut, dengan level 3 hingga 6." },
        { question: "Berapa lama nilai TOPIK berlaku?", answer: "Nilai resmi TOPIK berlaku selama dua tahun sejak tanggal pengumuman hasil. Pastikan nilai masih berlaku pada batas waktu pendaftaran institusi tujuan." },
        { question: "Level berapa yang diperlukan untuk kuliah atau bekerja?", answer: "Level yang diperlukan bergantung pada universitas, jurusan, perusahaan, dan jenis visa. Periksa persyaratan terbaru dalam panduan resmi institusi tujuan." },
        { question: "Apakah nilai simulasi TOPIQ merupakan nilai resmi TOPIK?", answer: "Tidak. Nilai TOPIQ dan perkiraan level membantu Anda memahami kemampuan saat ini dan merencanakan belajar. Untuk memperoleh nilai resmi, ikuti TOPIK yang diselenggarakan oleh National Institute for International Education." },
      ],
    },
    trademark: "UNIGATE adalah merek terdaftar. Permohonan Republik Korea No. 40-2026-0039342 dan pendaftaran Indonesia No. IDM001488588.",
  },
};
