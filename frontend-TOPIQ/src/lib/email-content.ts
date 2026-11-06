import type { Language } from "./landing-content";

interface EmailContent {
  title: string;
  start: string; send: string; sentTitle: string; sentDescription: string;
  expiry: string; resend: string; cooldown: string; change: string;
  checking: string; verified: string; finish: string; invalidTitle: string;
  restart: string; steps: string;
}

export const emailContent: Record<Language, EmailContent> = {
  ko: {
    title: "이메일 인증",
    start: "먼저 이메일을 인증해 주세요. 인증이 끝나면 닉네임과 비밀번호를 설정할 수 있어요.",
    send: "인증 메일 보내기", sentTitle: "메일함을 확인해 주세요.",
    sentDescription: "아래 주소로 인증 링크를 보냈어요. 메일의 버튼을 눌러 가입을 이어가세요.",
    expiry: "링크는 15분 동안 유효해요. 메일이 보이지 않으면 스팸함도 확인해 주세요.",
    resend: "인증 메일 다시 보내기", cooldown: "{seconds}초 후 다시 보낼 수 있어요", change: "다른 이메일 사용하기",
    checking: "이메일 인증 링크를 확인하고 있어요.", verified: "인증된 이메일", finish: "이메일 인증을 마쳤어요. 닉네임과 비밀번호를 설정한 뒤 학습 설문을 작성해 주세요.",
    invalidTitle: "인증 링크를 확인해 주세요.", restart: "다시 이메일 인증하기", steps: "이메일 인증 → 계정 설정 → 학습 설문",
  },
  en: {
    title: "Verify email",
    start: "Verify your email first. Then choose your nickname and password.",
    send: "Send verification email", sentTitle: "Check your inbox.",
    sentDescription: "We sent a verification link to the address below. Open the email to continue signing up.",
    expiry: "The link is valid for 15 minutes. Check your spam folder if the email hasn't arrived.",
    resend: "Resend verification email", cooldown: "Resend in {seconds}s", change: "Use a different email",
    checking: "Checking your verification link…", verified: "Verified email", finish: "Your email is verified. Choose your nickname and password, then complete a learning survey.",
    invalidTitle: "Check your verification link.", restart: "Verify your email again", steps: "Verify email → Set up account → Learning survey",
  },
  id: {
    title: "Verifikasi email",
    start: "Verifikasi email terlebih dahulu. Setelah itu, tentukan nama panggilan dan kata sandimu.",
    send: "Kirim email verifikasi", sentTitle: "Periksa kotak masukmu.",
    sentDescription: "Tautan verifikasi telah dikirim ke alamat berikut. Buka email untuk melanjutkan pendaftaran.",
    expiry: "Tautan berlaku selama 15 menit. Periksa folder spam jika email belum diterima.",
    resend: "Kirim ulang email verifikasi", cooldown: "Kirim ulang dalam {seconds} dtk", change: "Gunakan email lain",
    checking: "Memeriksa tautan verifikasi…", verified: "Email terverifikasi", finish: "Emailmu sudah terverifikasi. Tentukan nama panggilan dan kata sandi, lalu lengkapi survei belajar.",
    invalidTitle: "Periksa tautan verifikasimu.", restart: "Verifikasi email lagi", steps: "Verifikasi email → Atur akun → Survei belajar",
  },
};
