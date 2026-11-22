import type { Metadata } from "next";
import PolicyDocument from "@/components/PolicyDocument";

export const metadata: Metadata = {
  title: "개인정보 처리방침 · 설정 | TOPIQ",
  description: "TOPIQ의 계정, 학습 기록, 쓰기 평가 및 결제 정보 처리와 이용자의 권리를 안내합니다.",
};

const retentionLaw = "https://www.law.go.kr/LSW/lsLawLinkInfo.do?chrClsCd=010202&lsJoLnkSeq=900619372";
const privacyPortal = "https://www.privacy.go.kr/";

const copy = {
  ko: {
    intro: "TOPIQ에서 계정을 만들거나 모의시험, AI 쓰기 튜터, 크레딧을 이용할 때 어떤 정보가 쓰이는지 안내합니다.",
    draft: "TOPIQ는 한국에서 개인이 운영합니다. 시행 예정일은 2026년 11월 21일이며 정식 방침은 사이트에 공지할 예정입니다. 비회원 기록·로그·백업의 보관 및 파기 일정, 아동의 동의 절차, 외부 업체별 국외 이전 조건은 확인 중입니다.",
    sections: [
      { title: "가입과 로그인", paragraphs: [
        "TOPIQ는 계정 생성과 본인 확인에 이메일 주소와 닉네임을 사용합니다. 비밀번호로 가입하면 비밀번호를 해시값으로 저장합니다. Google로 로그인하면 Google이 확인한 이메일 주소와 계정 식별자를 받아 TOPIQ 계정에 연결합니다.",
        "인증 메일은 Brevo를 통해 보냅니다. Brevo에는 수신 주소와 인증 링크가 포함된 메일 내용이 전달됩니다. 인증 링크는 15분 동안 유효합니다.",
      ] },
      { title: "학습 설문과 모의시험", paragraphs: [
        "가입 설문에서는 동의를 받아 국적, 출생연도, TOPIK 응시 목적, 한국어 학습 기간, 응시 경험, 현재·목표 급수를 계정에 연결합니다. 학습자의 배경과 설문 응답을 분석하며 동의한 시점과 문구의 버전도 기록합니다.",
        "PBT·IBT 모의시험에서는 응시한 시험, 답안, 응시 시각과 점수를 기록해 결과와 이력을 보여줍니다. 이전에 비회원으로 응시한 기록은 당시 브라우저 세션에 연결됩니다. 결과 설문을 제출하면 동의를 받아 이메일, 별점과 학습 설문 응답을 처리합니다. 결과 메일 발송 시 Brevo에 수신 주소와 시험명, 결과 링크가 전달됩니다.",
      ] },
      { title: "AI 쓰기 평가", paragraphs: [
        "평가를 요청하면 제출한 답안과 평가 결과를 계정의 쓰기 이력에 저장합니다. AI 평가에 필요한 문제와 답안, 평가 지침, 피드백 언어 및 요청 식별자를 BizRouter를 통해 전달합니다. 답안에 이름이나 연락처를 적으면 해당 내용도 함께 전송됩니다.",
      ] },
      { title: "내부 통계와 제품 개선", paragraphs: [
        "TOPIQ는 설문 응답과 제출한 답안을 수집 목적과 동의 범위에서 내부 통계와 학습 기능 개선에 활용합니다. 운영자는 학습 기록과 결제 기록을 조회할 수 있습니다. 설문과 답안은 광고·마케팅에 사용하지 않으며 학교나 제휴사에 제공하지 않습니다.",
      ] },
      { title: "크레딧과 결제", paragraphs: [
        "TOPIQ는 잔액을 계산하고 결제 내역을 확인할 수 있도록 크레딧 지급·예약·사용 내역, 구매 금액과 통화, 구독·결제 상태, Stripe 고객·결제·구독·청구서 식별자를 기록합니다. 구매 시 결제 수단 정보는 Stripe 결제 화면에 입력합니다.",
      ] },
      { title: "쿠키와 브라우저 저장소", paragraphs: [
        "TOPIQ는 로그인 상태를 유지하고 기존 비회원 응시 기록을 식별하는 세션 쿠키, 요청 위조를 방지하는 보안 쿠키를 사용합니다. 선택한 언어는 브라우저에 저장하고, 듣기 재생 상태 등 일부 진행 정보는 현재 탭에 보관합니다. 페이지를 열면 Google 태그 스크립트를 불러오며 이 과정에서 접속 IP 주소 등 요청 정보가 Google에 전달될 수 있습니다.",
        "브라우저 설정에서 쿠키를 차단하거나 사이트 데이터를 삭제할 수 있습니다. 삭제하면 비회원 응시 이력에 접근하기 어려울 수 있고, 필수 쿠키를 차단하면 로그인 등 일부 기능이 제한됩니다.",
      ] },
      { title: "보유기간과 파기", paragraphs: [
        "회원의 계정·가입 설문, 모의시험 답안·점수·결과 설문, AI 쓰기 답안·평가 결과의 보유 기준은 회원 탈퇴 시까지입니다. 비회원의 응시 기록과 결과 발송용 이메일에는 별도의 보유기간이 필요하며 현재 확인 중입니다.",
        "처리 목적을 달성하거나 보유기간이 끝난 개인정보는 관계 법령에 따른 보존 의무가 있는 경우를 제외하고 파기 대상입니다. 인증·결과 링크의 유효기간과 서버에 저장한 기록의 보유기간은 별개입니다.",
        "국내 전자상거래법령이 적용되는 거래에서는 계약·청약철회 기록과 대금 결제·서비스 공급 기록의 법정 보존기간은 각각 5년이며, 소비자 불만·분쟁 처리 기록은 3년입니다.",
      ], link: { href: retentionLaw, label: "전자상거래법 시행령 제6조" } },
      { title: "이용자의 권리와 문의", paragraphs: [
        "이용자 또는 법정대리인은 위 문의 이메일로 개인정보 열람, 정정·삭제, 처리정지, 동의 철회 또는 탈퇴를 요청할 수 있습니다. 운영자는 이메일로 본인을 확인한 후 요청을 처리합니다. 외부 상담이나 분쟁조정 절차는 개인정보 포털에서 확인할 수 있습니다.",
      ], link: { href: privacyPortal, label: "개인정보 포털" } },
    ],
  },
  en: {
    intro: "This policy explains how TOPIQ uses information when you create an account, take a mock exam, submit writing for AI feedback or use credits.",
    draft: "An individual in South Korea operates TOPIQ. The proposed effective date is November 21, 2026. TOPIQ plans to publish the formal notice on this site. Retention and deletion schedules for guest records, logs and backups, consent procedures for children, and the terms of international transfers by each provider are under review.",
    sections: [
      { title: "Accounts and sign-in", paragraphs: [
        "TOPIQ uses your email address and nickname to create and identify your account. If you register with a password, TOPIQ stores a password hash. If you sign in with Google, TOPIQ receives your verified email address and Google account identifier to link your accounts.",
        "Brevo sends verification emails. It receives the recipient address and the message containing the verification link. The link is valid for 15 minutes.",
      ] },
      { title: "Learner surveys and mock exams", paragraphs: [
        "With your consent, the sign-up survey links your nationality, year of birth, reasons for taking TOPIK, length of Korean study, exam experience, and current and target levels to your account. TOPIQ uses these responses to understand learners and records when you agreed and which consent text you saw.",
        "For PBT and IBT mock exams, TOPIQ records the exam, answers, attempt times and scores to display your results and history. Past guest attempts are linked to the browser session used for the exam. If you submit the results survey, TOPIQ processes your email, rating and learner responses with your consent. To email results, Brevo receives your address, the exam title and the results link.",
      ] },
      { title: "AI writing feedback", paragraphs: [
        "When you request feedback, TOPIQ saves the submitted answer and evaluation in your writing history. For AI evaluation, TOPIQ sends the question, answer, grading instructions, feedback language and request identifier through BizRouter. A name or contact detail you include in an answer is sent with it.",
      ] },
      { title: "Internal statistics and product improvement", paragraphs: [
        "TOPIQ uses survey responses and submitted answers for internal statistics and to improve learning features within the purposes of collection and the scope of consent. TOPIQ operators can access learning and payment records. TOPIQ does not use survey responses or answers for advertising or marketing, or share them with schools or business partners.",
      ] },
      { title: "Credits and payments", paragraphs: [
        "To calculate your balance and show your payment history, TOPIQ records credit grants, reservations and spending, purchase amounts, currencies, subscription and payment status, and Stripe customer, checkout, subscription and invoice identifiers. You enter payment method details on Stripe’s checkout page.",
      ] },
      { title: "Cookies and browser storage", paragraphs: [
        "TOPIQ uses session cookies for sign-in and access to past guest attempts, and a security cookie to protect requests. Your browser stores your language preference. Some progress, such as listening playback, is stored in the current tab. Pages load a Google tag script, which may send request information such as your IP address to Google.",
        "You can block cookies or clear site data in your browser settings. Clearing data can remove access to guest exam history. Blocking essential cookies can prevent sign-in and other features from working.",
      ] },
      { title: "Retention and deletion", paragraphs: [
        "TOPIQ’s retention period for member accounts, sign-up surveys, mock exam answers, scores and results surveys, and AI writing submissions and evaluations runs until account closure. The retention period for guest exam records and results email addresses is under review.",
        "Personal data is due for deletion when its purpose has been fulfilled or its retention period ends, unless the law requires continued retention. A verification or results link can expire while the underlying record is still retained.",
        "For transactions covered by Korean e-commerce law, the statutory periods are five years for contract and withdrawal records, five years for payment and supply records, and three years for consumer complaint and dispute records.",
      ], link: { href: retentionLaw, label: "Article 6 of the Korean e-commerce Enforcement Decree (Korean)" } },
      { title: "Your rights and how to get help", paragraphs: [
        "You or your legal representative can use the contact email above to request access, correction, deletion, suspension of processing or account closure, or to withdraw consent. The operator verifies your identity by email before processing your request. The Korean Privacy Portal explains how to seek independent advice or mediation.",
      ], link: { href: privacyPortal, label: "Korean Privacy Portal" } },
    ],
  },
  id: {
    intro: "Kebijakan ini menjelaskan penggunaan data saat kamu membuat akun TOPIQ, mengikuti simulasi ujian, meminta evaluasi tulisan dengan AI, atau menggunakan kredit.",
    draft: "TOPIQ dikelola oleh perorangan di Korea Selatan. Tanggal berlaku yang diusulkan adalah 21 November 2026. Pemberitahuan resmi akan diumumkan di situs ini. Jadwal penyimpanan dan penghapusan data tamu, log dan cadangan, prosedur persetujuan untuk anak, serta ketentuan transfer data lintas negara tiap penyedia masih ditinjau.",
    sections: [
      { title: "Akun dan proses masuk", paragraphs: [
        "TOPIQ menggunakan alamat email dan nama panggilan untuk membuat dan mengenali akunmu. Jika kamu mendaftar dengan kata sandi, TOPIQ menyimpan nilai hash kata sandi. Jika kamu masuk dengan Google, TOPIQ menerima email terverifikasi dan pengenal akun Google untuk menghubungkan akunmu.",
        "Brevo mengirim email verifikasi. Brevo menerima alamat penerima dan isi pesan yang memuat tautan verifikasi. Tautan tersebut berlaku selama 15 menit.",
      ] },
      { title: "Survei pelajar dan simulasi ujian", paragraphs: [
        "Dengan persetujuanmu, survei pendaftaran mengaitkan kewarganegaraan, tahun lahir, tujuan mengikuti TOPIK, lama belajar bahasa Korea, pengalaman ujian, serta level saat ini dan target dengan akunmu. TOPIQ menganalisis jawaban untuk memahami latar belakang pelajar serta mencatat waktu dan versi persetujuan.",
        "Dalam simulasi PBT dan IBT, TOPIQ mencatat ujian, jawaban, waktu pengerjaan, dan nilai untuk menampilkan hasil dan riwayat. Riwayat ujian tamu sebelumnya terhubung ke sesi browser yang digunakan saat ujian. Jika kamu mengirim survei hasil, TOPIQ memproses email, penilaian, dan jawaban survei dengan persetujuanmu. Untuk mengirim hasil melalui email, Brevo menerima alamat penerima, judul ujian, dan tautan hasil.",
      ] },
      { title: "Evaluasi tulisan dengan AI", paragraphs: [
        "Saat kamu meminta evaluasi, TOPIQ menyimpan jawaban dan hasil evaluasi di riwayat tulisanmu. Untuk evaluasi AI, TOPIQ mengirim soal, jawaban, panduan penilaian, bahasa umpan balik, dan pengenal permintaan melalui BizRouter. Nama atau informasi kontak yang kamu tulis di dalam jawaban akan ikut terkirim.",
      ] },
      { title: "Statistik internal dan perbaikan produk", paragraphs: [
        "TOPIQ menggunakan jawaban survei dan jawaban yang dikirim untuk statistik internal serta perbaikan fitur belajar sesuai tujuan pengumpulan dan lingkup persetujuan. Pengelola TOPIQ dapat mengakses riwayat belajar dan pembayaran. Jawaban survei dan jawaban latihan tidak digunakan untuk iklan atau pemasaran dan tidak dibagikan kepada sekolah atau mitra bisnis.",
      ] },
      { title: "Kredit dan pembayaran", paragraphs: [
        "Untuk menghitung saldo dan menampilkan riwayat pembayaran, TOPIQ mencatat pemberian, pencadangan dan penggunaan kredit, jumlah dan mata uang pembelian, status langganan dan pembayaran, serta pengenal pelanggan, sesi pembayaran, langganan, dan faktur Stripe. Kamu memasukkan informasi metode pembayaran di halaman pembayaran Stripe.",
      ] },
      { title: "Cookie dan penyimpanan browser", paragraphs: [
        "TOPIQ menggunakan cookie sesi untuk login dan akses ke riwayat ujian tamu sebelumnya serta cookie keamanan untuk melindungi permintaan. Browser menyimpan pilihan bahasa. Sebagian progres, seperti pemutaran audio, tersimpan di tab yang sedang digunakan. Halaman memuat skrip tag Google sehingga informasi permintaan, seperti alamat IP, dapat terkirim ke Google.",
        "Kamu dapat memblokir cookie atau menghapus data situs melalui pengaturan browser. Jika data dihapus, akses ke riwayat ujian tamu bisa hilang. Memblokir cookie yang diperlukan dapat mengganggu login dan fungsi lain.",
      ] },
      { title: "Masa penyimpanan dan penghapusan", paragraphs: [
        "Masa penyimpanan akun anggota, survei pendaftaran, jawaban simulasi, nilai dan survei hasil, serta tulisan dan hasil evaluasi AI berlangsung hingga akun ditutup. Masa penyimpanan untuk riwayat ujian tamu dan alamat email pengiriman hasil masih ditinjau.",
        "Data pribadi perlu dihapus setelah tujuan pemrosesan tercapai atau masa penyimpanannya berakhir, kecuali hukum mewajibkan penyimpanan lebih lanjut. Tautan verifikasi atau hasil dapat kedaluwarsa saat catatan terkait masih tersimpan.",
        "Untuk transaksi yang tunduk pada hukum perdagangan elektronik Korea, masa penyimpanan wajib adalah lima tahun untuk catatan kontrak dan pembatalan, lima tahun untuk catatan pembayaran dan penyediaan layanan, serta tiga tahun untuk catatan keluhan dan sengketa konsumen.",
      ], link: { href: retentionLaw, label: "Pasal 6 peraturan pelaksana perdagangan elektronik Korea (bahasa Korea)" } },
      { title: "Hak dan bantuan", paragraphs: [
        "Kamu atau perwakilan sahmu dapat menghubungi email di atas untuk meminta akses, koreksi, penghapusan, penghentian pemrosesan, penarikan persetujuan, atau penutupan akun. Pengelola memverifikasi identitas melalui email sebelum memproses permintaan. Portal Privasi Korea menyediakan informasi tentang konsultasi independen dan mediasi.",
      ], link: { href: privacyPortal, label: "Portal Privasi Korea" } },
    ],
  },
};

export default function PrivacyPage() {
  return <PolicyDocument kind="privacy" copy={copy} />;
}
