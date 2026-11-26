import { seoMetadata } from "@/lib/seo";
import { seoCopy } from "@/lib/seo-content";
import PolicyDocument from "@/components/PolicyDocument";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import "../open-source-licenses/licenses.css";

export const generateMetadata = () => seoMetadata("/terms", seoCopy.terms);

const withdrawalLaw = "https://www.law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1027063337";
const mediation = "https://www.kcdrc.kr/";

const copy = {
  ko: {
    intro: "이 약관은 TOPIQ에서 한국어를 학습하고 크레딧을 구매·사용할 때 이용자와 운영자가 지킬 사항을 설명합니다.",
    sections: [
      { title: "서비스와 계정", paragraphs: [
        "TOPIQ는 TOPIK 대비 PBT·IBT 모의시험, 단어장, 쓰기 연습을 제공합니다. 누구나 공개 회차를 볼 수 있으며 응시는 로그인 후 가능합니다. PBT·IBT 읽기와 듣기에서 Free 회원은 시험 방식과 영역별 첫 공개 세트에, Plus 회원은 모든 공개 세트에 응시할 수 있습니다. 쓰기 평가 이력과 크레딧은 로그인한 계정에 연결됩니다.",
        "Plus 구독은 선택한 1·3·6개월 주기로 자동 결제됩니다. 결제한 기간 동안 매월 400크레딧을 지급하며, 남은 크레딧은 이월됩니다. 설정 → 구독 관리 → 결제 관리에서 다음 갱신을 취소할 수 있고, 결제한 기간이 끝날 때까지 이용할 수 있습니다.",
        "새 월간 구독은 계정당 1회, 카드당 1회의 7일 무료 체험으로 시작합니다. Stripe에서 카드를 직접 등록하고 TOPIQ에 표시된 전환 일시와 조건에 동의하면 체험이 시작됩니다. 체험 종료 시 등록 카드로 9,900원이 자동 결제되며 이후 매월 같은 금액이 청구됩니다. 종료 전에 설정의 구독 관리에서 해지하면 종료일까지 Plus 콘텐츠를 이용하고 구독료는 0원입니다. 체험 중에는 유료 월별 크레딧이 지급되지 않으며, 첫 결제 성공 시 400크레딧을 지급합니다. 3개월과 6개월 구독은 가입 시 각각 23,900원과 43,900원을 결제합니다.",
        "본인이 사용할 수 있는 이메일로 가입하고 계정의 비밀번호와 인증 링크를 안전하게 관리해 주세요. 타인의 계정이나 결제 수단을 허락 없이 사용하거나 다른 이용자의 학습을 방해해서는 안 됩니다.",
      ] },
      { title: "모의시험과 AI 쓰기 평가", paragraphs: [
        "모의시험 점수는 학습 진행을 확인하는 참고자료입니다. 공식 TOPIK 성적이나 급수 인증으로 사용할 수 없습니다. AI 쓰기 튜터는 제출한 답안에 대한 점수와 수정 제안을 제공합니다. 설명에 오류가 있을 수 있으므로 원문과 함께 검토해 주세요.",
      ] },
      { title: "크레딧 구매와 사용", paragraphs: [
        "충전 가능 여부, 보유량과 거래 내역은 계정 메뉴의 ‘크레딧’에서 확인할 수 있습니다. 충전을 중지한 기간에도 보유한 크레딧은 학습에 사용할 수 있습니다.",
        "유료·무료 크레딧은 계정 탈퇴 시까지 사용할 수 있습니다. 일회성 유료 충전분을 먼저 사용하며, 여러 번 충전한 경우 먼저 적립된 주문부터 차감합니다.",
        "Free와 Plus 회원 모두 쓰기 세트를 처음 열 때 100크레딧을 사용합니다. 해제한 세트는 같은 계정에서 다시 열 수 있으며, 문항당 최대 20회의 쓰기 평가는 추가 차감 없이 이용할 수 있습니다.",
      ] },
      { title: "청약철회와 환불", paragraphs: [
        "일회성 충전 주문의 크레딧이 모두 남아 있으면 설정의 ‘일회성 크레딧 환불’에서 해당 주문을 전액 환불할 수 있습니다. 일부를 사용했다면 남은 유료분의 부분 환불은 해당 주문의 고객 문의로 신청해 주세요. 중복 결제와 미적립은 결제·환불 문의 이메일로 접수합니다. 무료 크레딧은 현금 환불 대상에서 제외됩니다.",
        "국내 전자상거래법이 적용되는 구매는 원칙적으로 계약 내용을 서면으로 받은 날부터 7일 이내에 청약철회를 요청할 수 있습니다. 서비스 공급이 더 늦게 시작된 경우에는 그 시작일부터 계산합니다.",
        "디지털콘텐츠 제공이 시작되고 법정 고지 등 요건을 갖춘 경우 철회가 제한될 수 있습니다. 나누어 제공할 수 있는 콘텐츠 중 아직 공급하지 않은 부분에는 철회권이 적용됩니다. 결제가 중복되거나 구매 내용과 다른 서비스를 받은 경우 결제 내역을 근거로 정정 또는 환불을 요청할 수 있습니다.",
      ], link: { href: withdrawalLaw, label: "전자상거래법 제17조의 청약철회 기준" } },
      { title: "콘텐츠와 제출한 답안", paragraphs: [
        "학습 자료는 각 권리자의 이용 조건에 따라 개인 학습에 이용할 수 있습니다. 별도 허락이나 법적 근거 없이 시험 문제·음원·해설을 복제해 판매하거나 배포해서는 안 됩니다. 오픈소스 소프트웨어와 사전 데이터에는 라이선스 페이지에 기재된 조건이 적용됩니다.",
        "이용자가 작성한 답안의 권리는 이용자에게 있습니다. TOPIQ는 이용자가 요청한 평가, 결과 제공과 이력 조회에 필요한 범위에서 답안을 처리합니다.",
      ], link: { href: "/open-source-licenses", label: "오픈소스 라이선스" } },
      { title: "변경, 이용 종료와 분쟁", paragraphs: [
        "계정 탈퇴는 위 문의 이메일로 신청할 수 있습니다. 서비스 종료 시에는 사이트에 종료 일정과 잔여 유료 크레딧의 환불 신청 방법을 공지합니다.",
        "운영자는 약관을 변경할 때 변경 내용과 적용일을 알리고, 이용자에게 불리한 변경은 사전에 안내합니다. 이용자는 서비스 이용을 중단하거나 계정 탈퇴를 요청할 수 있습니다. 탈퇴와 유료 거래의 청약철회·환불은 각각 요청할 수 있습니다.",
        "유료 콘텐츠 이용이나 결제에 관한 분쟁은 콘텐츠분쟁조정위원회에 상담 또는 조정을 신청할 수 있습니다. 이용자는 관계 법령에 따른 손해배상과 재판을 청구할 권리가 있습니다.",
      ], link: { href: mediation, label: "콘텐츠분쟁조정위원회" } },
    ],
  },
  en: {
    intro: "These terms describe the responsibilities of TOPIQ and its users when you study Korean or buy and use credits.",
    sections: [
      { title: "Service and accounts", paragraphs: [
        "TOPIQ offers PBT and IBT mock exams, vocabulary sets and writing practice for TOPIK preparation. Everyone can browse published exams. Sign in to take an exam. Free includes the first published reading and listening sets in both PBT and IBT. Plus includes all published reading and listening sets in both formats. Writing evaluation history and credits are linked to your signed-in account.",
        "Plus renews automatically every 1, 3 or 6 months according to your selection. You receive 400 credits each month of the paid period, and unused credits carry over. You can cancel the next renewal in Settings → Manage subscription → Manage billing and keep access through the paid period.",
        "New monthly subscriptions start with a 7-day free trial, limited to one per account and per card. Register a card directly with Stripe, then agree to the transition date, time and terms shown on TOPIQ to start the trial. Your registered card will be charged KRW 9,900 when the trial ends, then KRW 9,900 every month. Cancel in Settings → Manage subscription before the trial ends to pay nothing and keep Plus access through the end of the trial. Monthly credits start with the first successful payment of the subscription fee, when you receive 400 credits. The 3- and 6-month subscriptions charge KRW 23,900 and KRW 43,900 respectively at signup.",
        "Register with an email address you control and keep your password and verification links secure. You must have permission to use another person’s account or payment method. Do not disrupt other users’ learning.",
      ] },
      { title: "Mock exams and AI writing feedback", paragraphs: [
        "Mock exam scores help you track your progress. Only the official TOPIK exam certifies a score or level. The AI writing tutor scores your answer and suggests revisions. Its explanations may contain errors, so review them alongside your original answer.",
      ] },
      { title: "Buying and using credits", paragraphs: [
        "Open Credits in the account menu to check top-up availability, balances and transaction history. You can use your existing credits for learning while top-ups are paused.",
        "Purchased and free credits can be used until account closure. Credits from one-time top-ups are spent first, starting with the oldest credited order.",
        "On both Free and Plus, it costs 100 credits to unlock a writing set. You can reopen it with the same account and get up to 20 evaluations per question at no additional credit cost.",
      ] },
      { title: "Withdrawal and refunds", paragraphs: [
        "Open One-time credit refunds in Settings to refund an entirely unused one-time top-up in full. If some credits have been used, select Contact billing on that order to request a partial refund for the remaining paid credits. For duplicate charges or missing credits, use the payments and refunds email above. Free credits have no cash refund value.",
        "For purchases covered by Korean e-commerce law, you generally have seven days from receiving the written contract details to withdraw. If supply starts later, the period runs from the start of supply.",
        "Withdrawal may be limited for digital content already supplied when statutory conditions, including notice, are met. The right to withdraw still applies to any undelivered, separable portion. If you were charged twice or received something different from your purchase, you may request a correction or refund using your payment record.",
      ], link: { href: withdrawalLaw, label: "Withdrawal rights under Article 17 of Korean e-commerce law (Korean)" } },
      { title: "Learning materials and your writing", paragraphs: [
        "You may use learning materials for personal study under the rights holder’s terms. Copying exam questions, audio or explanations for sale or distribution requires permission or another legal basis. Open-source software and dictionary data are subject to the licenses listed below.",
        "You retain the rights to answers you write. TOPIQ processes them to evaluate your work, deliver the results and let you review your history.",
      ], link: { href: "/open-source-licenses", label: "Open-source licenses" } },
      { title: "Changes, account closure and disputes", paragraphs: [
        "You can request account closure using the contact email above. If TOPIQ closes the service, it will publish the closure date and instructions for requesting refunds of remaining paid credits on this site.",
        "TOPIQ will announce changes to these terms and their effective date, with advance notice of changes that disadvantage users. You may stop using the service or request account closure. Withdrawal from a purchase or a refund can be requested separately.",
        "For a dispute over paid content or billing, you may seek advice or mediation from Korea’s Content Dispute Resolution Committee. You retain the right to seek damages and take legal action under applicable law.",
      ], link: { href: mediation, label: "Korean Content Dispute Resolution Committee" } },
    ],
  },
  id: {
    intro: "Ketentuan ini menjelaskan tanggung jawab TOPIQ dan pengguna saat kamu belajar bahasa Korea atau membeli dan menggunakan kredit.",
    sections: [
      { title: "Layanan dan akun", paragraphs: [
        "TOPIQ menyediakan simulasi PBT dan IBT, set kosakata, dan latihan menulis untuk persiapan TOPIK. Siapa saja dapat melihat daftar ujian. Masuk untuk mengikuti ujian. Free mencakup set membaca dan menyimak pertama yang tersedia untuk PBT dan IBT. Plus mencakup semua set membaca dan menyimak yang tersedia pada kedua format ujian. Riwayat evaluasi tulisan dan kredit terhubung ke akun yang kamu gunakan untuk masuk.",
        "Langganan Plus diperpanjang otomatis setiap 1, 3, atau 6 bulan sesuai pilihanmu. Kamu mendapat 400 kredit setiap bulan selama periode berbayar. Sisa kredit tetap tersimpan. Kamu dapat membatalkan perpanjangan berikutnya di Pengaturan → Kelola langganan → Kelola pembayaran dan tetap menggunakan layanan sampai periode berbayar berakhir.",
        "Langganan bulanan baru dimulai dengan uji coba gratis 7 hari, satu kali per akun dan per kartu. Daftarkan kartu langsung di Stripe, lalu setujui tanggal, waktu, dan ketentuan peralihan yang tertera di TOPIQ untuk memulai uji coba. Kartu terdaftar akan ditagih otomatis KRW 9.900 saat uji coba berakhir, lalu KRW 9.900 setiap bulan. Batalkan di Pengaturan → Kelola langganan sebelum uji coba berakhir agar tidak dikenakan biaya dan tetap dapat mengakses Plus sampai akhir uji coba. Kredit bulanan mulai diberikan saat pembayaran pertama berhasil, sebesar 400 kredit. Paket 3 dan 6 bulan langsung menagih masing-masing KRW 23.900 dan KRW 43.900 saat pendaftaran.",
        "Daftar dengan email yang kamu kuasai dan jaga keamanan kata sandi serta tautan verifikasi. Kamu memerlukan izin untuk menggunakan akun atau metode pembayaran orang lain. Jangan mengganggu kegiatan belajar pengguna lain.",
      ] },
      { title: "Simulasi ujian dan evaluasi tulisan dengan AI", paragraphs: [
        "Nilai simulasi membantu kamu memantau kemajuan belajar. Hanya ujian resmi TOPIK yang dapat memberikan sertifikasi nilai atau level. Tutor menulis AI menilai jawaban dan menyarankan perbaikan. Penjelasannya bisa keliru, jadi periksa saran tersebut bersama jawaban aslimu.",
      ] },
      { title: "Pembelian dan penggunaan kredit", paragraphs: [
        "Buka Kredit di menu akun untuk melihat ketersediaan isi ulang, saldo, dan riwayat transaksi. Selama isi ulang dihentikan sementara, kredit yang sudah tersedia tetap dapat digunakan untuk belajar.",
        "Kredit berbayar dan gratis dapat digunakan hingga akun ditutup. Kredit dari isi ulang satu kali digunakan terlebih dahulu, mulai dari pesanan yang paling awal dikreditkan.",
        "Pengguna Free dan Plus menggunakan 100 kredit untuk membuka satu set menulis. Kamu dapat membukanya kembali dengan akun yang sama dan mendapat hingga 20 evaluasi per soal tanpa potongan kredit tambahan.",
      ] },
      { title: "Pembatalan pembelian dan pengembalian dana", paragraphs: [
        "Buka Pengembalian dana isi ulang satu kali di Pengaturan untuk meminta pengembalian dana penuh atas isi ulang satu kali yang belum digunakan. Jika sebagian kredit telah digunakan, pilih Hubungi layanan pembayaran pada pesanan untuk meminta pengembalian dana sebagian atas sisa kredit berbayar. Untuk tagihan ganda atau kredit yang belum masuk, gunakan email pembayaran dan pengembalian dana di atas. Kredit gratis tidak dapat diuangkan.",
        "Untuk pembelian yang tunduk pada hukum perdagangan elektronik Korea, kamu umumnya dapat membatalkan pembelian dalam tujuh hari sejak menerima rincian kontrak secara tertulis. Jika layanan mulai diberikan lebih lambat, jangka waktu dihitung sejak layanan mulai diberikan.",
        "Hak pembatalan dapat dibatasi untuk konten digital yang mulai diberikan jika persyaratan hukum, termasuk pemberitahuan, terpenuhi. Hak ini tetap berlaku untuk bagian yang dapat dipisahkan dan belum diberikan. Jika terjadi tagihan ganda atau layanan berbeda dari yang dibeli, kamu dapat meminta koreksi atau pengembalian dana berdasarkan bukti pembayaran.",
      ], link: { href: withdrawalLaw, label: "Hak pembatalan menurut Pasal 17 hukum perdagangan elektronik Korea (bahasa Korea)" } },
      { title: "Materi belajar dan jawabanmu", paragraphs: [
        "Kamu dapat menggunakan materi untuk belajar secara pribadi sesuai ketentuan pemegang hak. Menyalin soal, audio, atau pembahasan untuk dijual atau disebarkan memerlukan izin atau dasar hukum lain. Perangkat lunak sumber terbuka dan data kamus tunduk pada lisensi yang tercantum di bawah ini.",
        "Hak atas jawaban yang kamu tulis tetap milikmu. TOPIQ memprosesnya untuk mengevaluasi tulisan, menyampaikan hasil, dan menampilkan riwayatmu.",
      ], link: { href: "/open-source-licenses", label: "Lisensi sumber terbuka" } },
      { title: "Perubahan, penutupan akun, dan sengketa", paragraphs: [
        "Kamu dapat meminta penutupan akun melalui email kontak di atas. Jika layanan TOPIQ ditutup, tanggal penutupan dan cara mengajukan pengembalian dana untuk sisa kredit berbayar akan diumumkan di situs ini.",
        "TOPIQ akan mengumumkan perubahan ketentuan dan tanggal berlakunya. Perubahan yang merugikan pengguna akan diberitahukan sebelumnya. Kamu dapat berhenti menggunakan layanan atau meminta penutupan akun. Pembatalan pembelian atau pengembalian dana dapat diajukan secara terpisah.",
        "Untuk sengketa terkait konten berbayar atau tagihan, kamu dapat meminta konsultasi atau mediasi kepada Komite Penyelesaian Sengketa Konten Korea. Kamu tetap berhak menuntut ganti rugi dan mengajukan gugatan sesuai hukum yang berlaku.",
      ], link: { href: mediation, label: "Komite Penyelesaian Sengketa Konten Korea" } },
    ],
  },
};

export default function TermsPage() {
  return <><SiteHeader /><main id="main-content" className="licenses-main page-container" tabIndex={-1}>
    <PolicyDocument kind="terms" copy={copy} />
  </main><SiteFooter /></>;
}
