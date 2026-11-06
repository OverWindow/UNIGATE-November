import catalog from "./survey-catalog.json";
import type { Language } from "./landing-content";

export { catalog };
export interface SurveyInput {
  nationalityCode: string; birthYear: number; topikReasons: string[]; topikReasonOther: string;
  koreanStudyDuration: string; topikExperience: string; currentTopikLevel: number | null;
  targetTopikLevel: number; privacyConsent: boolean; privacyConsentVersion: string;
}
export type SurveyPurpose = "exam" | "signup";
export const consentVersion = (purpose: SurveyPurpose) => purpose === "signup" ? catalog.signupConsentVersion : catalog.consentVersion;
export const emptySurvey = (purpose: SurveyPurpose = "exam"): SurveyInput => ({ nationalityCode: "", birthYear: 0, topikReasons: [], topikReasonOther: "",
  koreanStudyDuration: "", topikExperience: "", currentTopikLevel: null, targetTopikLevel: 0,
  privacyConsent: false, privacyConsentVersion: consentVersion(purpose) });
export const currentSurveyYear = () => Number(new Intl.DateTimeFormat("en", { year: "numeric", timeZone: "Asia/Seoul" }).format(new Date()));
export function surveyErrors(value: SurveyInput, purpose: SurveyPurpose = "exam"): string[] {
  const errors: string[] = [];
  if (![...catalog.countries, "OTHER"].includes(value.nationalityCode)) errors.push("nationalityCode");
  if (!Number.isInteger(value.birthYear) || value.birthYear < 1950 || value.birthYear > currentSurveyYear()) errors.push("birthYear");
  if (!value.topikReasons.length || new Set(value.topikReasons).size !== value.topikReasons.length || value.topikReasons.some(v => !catalog.reasons.some(([code]) => code === v))) errors.push("topikReasons");
  if (value.topikReasons.includes("other") && (!value.topikReasonOther.trim() || value.topikReasonOther.trim().length > 500)) errors.push("topikReasonOther");
  if (!catalog.studyDurations.some(([code]) => code === value.koreanStudyDuration)) errors.push("koreanStudyDuration");
  if (!catalog.experiences.some(([code]) => code === value.topikExperience)) errors.push("topikExperience");
  if (value.topikExperience !== "none" && (value.currentTopikLevel === null || !Number.isInteger(value.currentTopikLevel) || value.currentTopikLevel < 0 || value.currentTopikLevel > 6)) errors.push("currentTopikLevel");
  if (!Number.isInteger(value.targetTopikLevel) || value.targetTopikLevel < 3 || value.targetTopikLevel > 6) errors.push("targetTopikLevel");
  if (!value.privacyConsent || value.privacyConsentVersion !== consentVersion(purpose)) errors.push("privacyConsent");
  return errors;
}
export const choiceLabel = (row: string[], language: Language) => row[language === "ko" ? 1 : language === "en" ? 2 : 3];

export const signupSurveyCopy = {
  ko: {
    title: "어떤 한국어 학습을 하고 계신가요?", description: "마지막 단계예요. 학습 설문을 작성하고 가입을 완료해 주세요.",
    next: "다음: 학습 설문", back: "계정 정보 수정", finish: "가입 완료", step: "3단계 중 3 · 학습 설문",
    targetTopikLevel: "목표 TOPIK 급수",
    privacyConsent: "학습자 이해 및 설문 응답 분석을 위해 계정과 연결된 국적, 출생연도, 응시 목적, 학습 기간, 응시 경험과 급수를 수집·이용하는 데 동의합니다.",
  },
  en: {
    title: "Tell us about your Korean learning.", description: "One last step. Complete this learning survey to finish signing up.",
    next: "Next: learning survey", back: "Edit account details", finish: "Complete sign-up", step: "Step 3 of 3 · Learning survey",
    targetTopikLevel: "Target TOPIK level",
    privacyConsent: "I consent to the collection and use of my account-linked nationality, birth year, test reasons, study duration, test experience and levels to understand learners and analyze survey responses.",
  },
  id: {
    title: "Ceritakan pembelajaran bahasa Koreamu.", description: "Langkah terakhir. Lengkapi survei belajar untuk menyelesaikan pendaftaran.",
    next: "Lanjut: survei belajar", back: "Ubah informasi akun", finish: "Selesaikan pendaftaran", step: "Langkah 3 dari 3 · Survei belajar",
    targetTopikLevel: "Target level TOPIK",
    privacyConsent: "Saya menyetujui pengumpulan dan penggunaan kewarganegaraan, tahun lahir, tujuan ujian, lama belajar, pengalaman ujian, dan level yang terhubung ke akun untuk memahami pelajar dan menganalisis jawaban survei.",
  },
} satisfies Record<Language, Record<"title" | "description" | "next" | "back" | "finish" | "step" | "targetTopikLevel" | "privacyConsent", string>>;

const ko = {
  title: "결과를 받을 이메일과 설문을 작성해 주세요", description: "별점과 설문을 제출하면 점수·정답·해설을 확인할 수 있는 링크를 이메일로 보내 드립니다.",
  notice: "비회원 결과는 이메일·별점·설문 제출 후 이메일로 받은 링크에서 확인할 수 있습니다.",
  rating: "이번 모의고사는 어땠나요?", ratingUnit: "점", email: "결과를 받을 이메일", required: "필수", choose: "선택해 주세요",
  nationalityCode: "국적", birthYear: "출생연도", topikReasons: "TOPIK 응시 목적 (복수 선택)", topikReasonOther: "기타 응시 목적",
  koreanStudyDuration: "한국어 학습 기간", topikExperience: "TOPIK II 응시 경험", currentTopikLevel: "현재 보유한 TOPIK 급수", targetTopikLevel: "이번 시험의 목표 TOPIK 급수",
  noLevel: "급수 없음", level: "급", other: "기타", privacyConsent: "설문 응답 분석 및 결과 전달을 위해 이메일, 별점, 국적, 출생연도, 응시 목적, 학습 기간, 응시 경험과 급수를 수집·이용하는 데 동의합니다.",
  submit: "결과 링크 받기", submitting: "저장하고 발송하는 중…", invalid: "표시된 필수 항목을 확인해 주세요.", fieldError: "올바른 값을 입력하거나 선택해 주세요.",
  sentTitle: "메일 발송 요청이 접수되었습니다", sent: "받은 편지함과 스팸함을 확인해 주세요. 실제 도착까지 시간이 걸릴 수 있습니다.",
  expiry: "링크 유효기간", resend: "다시 보내기 / 이메일 수정", resendHint: "설문은 저장되었습니다. 재발송하면 이전 링크는 만료됩니다.",
  failed: "메일 발송에 실패했습니다. 설문은 저장되어 있으니 잠시 후 다시 보내 주세요.", uncertain: "메일 접수 여부를 확인하지 못했습니다. 받은 편지함을 먼저 확인한 뒤 필요하면 다시 보내 주세요.",
  limited: "발송 요청이 많습니다. 잠시 후 다시 시도해 주세요.", seconds: "초 후 재발송 가능", linkInvalid: "결과 링크가 올바르지 않거나 새 링크로 교체되었습니다.", linkExpired: "결과 링크가 만료되었습니다.",
  checking: "결과 링크를 확인하고 있습니다…", requestAgain: "응시한 브라우저에서 다시 발송하기", sessionHelp: "재발송은 시험을 응시한 브라우저 세션에서 가능합니다.", locked: "이메일로 결과 확인", back: "모의고사 목록",
};
type Copy = { [K in keyof typeof ko]: string };
export const surveyCopy: Record<Language, Copy> = {
  ko,
  en: {
    title: "Where should we send your result?", description: "Submit your rating and survey to receive a link to your score, answers and explanations by email.",
    notice: "Guests must enter an email, rating and survey, then open the emailed link to view results.",
    rating: "How was this mock test?", ratingUnit: "stars", email: "Result email address", required: "Required", choose: "Please select",
    nationalityCode: "Nationality", birthYear: "Birth year", topikReasons: "Reasons for taking TOPIK (select all that apply)", topikReasonOther: "Other reason",
    koreanStudyDuration: "How long have you studied Korean?", topikExperience: "TOPIK II test experience", currentTopikLevel: "Current TOPIK level", targetTopikLevel: "Target TOPIK level for this test",
    noLevel: "No level", level: "Level", other: "Other", privacyConsent: "I consent to the collection and use of my email, rating, nationality, birth year, test reasons, study duration, test experience and levels for survey analysis and result delivery.",
    submit: "Email my result link", submitting: "Saving and sending…", invalid: "Please check the marked required fields.", fieldError: "Enter or select a valid value.",
    sentTitle: "Your email request was accepted", sent: "Check your inbox and spam folder. Delivery may take a little time.", expiry: "Link expires", resend: "Resend / change email", resendHint: "Your survey is saved. Requesting another email replaces the previous link.",
    failed: "The email could not be sent. Your survey is saved; please try again shortly.", uncertain: "We could not confirm the email receipt. Check your inbox before requesting another email.",
    limited: "Too many requests. Please try again later.", seconds: "seconds until resend", linkInvalid: "This result link is invalid or has been replaced by a newer link.", linkExpired: "This result link has expired.",
    checking: "Checking your result link…", requestAgain: "Resend in the browser used for the test", sessionHelp: "Resending requires the browser session you used for the test.", locked: "Check your email for results", back: "Mock tests",
  },
  id: {
    title: "Ke mana hasil ujian harus dikirim?", description: "Isi penilaian dan survei untuk menerima tautan nilai, kunci jawaban, dan pembahasan melalui email.",
    notice: "Tamu wajib mengisi email, penilaian, dan survei, lalu membuka tautan email untuk melihat hasil.",
    rating: "Bagaimana simulasi ini?", ratingUnit: "bintang", email: "Email penerima hasil", required: "Wajib", choose: "Silakan pilih",
    nationalityCode: "Kewarganegaraan", birthYear: "Tahun lahir", topikReasons: "Tujuan mengikuti TOPIK (boleh lebih dari satu)", topikReasonOther: "Tujuan lainnya",
    koreanStudyDuration: "Lama belajar bahasa Korea", topikExperience: "Pengalaman mengikuti TOPIK II", currentTopikLevel: "Level TOPIK saat ini", targetTopikLevel: "Target level TOPIK untuk ujian ini",
    noLevel: "Belum memiliki level", level: "Level", other: "Lainnya", privacyConsent: "Saya menyetujui pengumpulan dan penggunaan email, penilaian, kewarganegaraan, tahun lahir, tujuan ujian, lama belajar, pengalaman ujian, dan level untuk analisis survei serta pengiriman hasil.",
    submit: "Kirim tautan hasil", submitting: "Menyimpan dan mengirim…", invalid: "Periksa kolom wajib yang ditandai.", fieldError: "Masukkan atau pilih nilai yang valid.",
    sentTitle: "Permintaan email diterima", sent: "Periksa kotak masuk dan folder spam. Pengiriman mungkin memerlukan waktu.", expiry: "Tautan berlaku sampai", resend: "Kirim ulang / ubah email", resendHint: "Survei Anda tersimpan. Meminta email baru menggantikan tautan sebelumnya.",
    failed: "Email gagal dikirim. Survei tersimpan; silakan coba lagi nanti.", uncertain: "Penerimaan email belum dapat dikonfirmasi. Periksa kotak masuk sebelum meminta email baru.",
    limited: "Terlalu banyak permintaan. Silakan coba lagi nanti.", seconds: "detik hingga dapat dikirim ulang", linkInvalid: "Tautan hasil tidak valid atau sudah diganti dengan tautan baru.", linkExpired: "Tautan hasil telah kedaluwarsa.",
    checking: "Memeriksa tautan hasil…", requestAgain: "Kirim ulang dari browser yang digunakan untuk ujian", sessionHelp: "Pengiriman ulang memerlukan sesi browser yang digunakan untuk ujian.", locked: "Periksa email untuk melihat hasil", back: "Daftar simulasi",
  },
};
