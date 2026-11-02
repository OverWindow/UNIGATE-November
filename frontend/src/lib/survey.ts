export const educationTypes = [
  "high_school_graduate", "universitas", "institut", "sekolah_tinggi",
  "politeknik", "akademi", "akademi_komunitas", "other", "unknown",
] as const;

export const surveyCopy = {
  email: "Email", emailPlaceholder: "Masukkan alamat email Anda", age: "Usia", agePlaceholder: "Contoh: 20",
  education: "Pendidikan Terakhir", educationPlaceholder: "Pilih jenis pendidikan",
  university: "Universitas Tujuan (Opsional)", universityPlaceholder: "Masukkan universitas yang Anda minati",
  submit: "Daftar Informasi", submitting: "Mengirim…", close: "Tutup",
  successTitle: "Pendaftaran berhasil", success: "Panduan transfer universitas dalam format PDF akan dikirim ke email Anda dalam beberapa minggu.",
  failure: "Pendaftaran belum berhasil. Isian Anda tetap tersimpan di formulir. Silakan coba lagi sebentar.",
  uncertain: "Respons belum dapat dikonfirmasi. Pendaftaran mungkin sudah tersimpan; pengiriman ulang dapat membuat pendaftaran ganda.",
  invalid: "Periksa kembali isian Anda.",
  errors: { email: "Masukkan alamat email yang valid.", age: "Masukkan usia berupa bilangan bulat dari 0 hingga 120.", education_type: "Pilih jenis pendidikan.", desired_university: "Gunakan maksimal 500 karakter." },
  choices: { high_school_graduate: "Lulusan SMA/sederajat", universitas: "Universitas", institut: "Institut", sekolah_tinggi: "Sekolah Tinggi", politeknik: "Politeknik", akademi: "Akademi", akademi_komunitas: "Akademi Komunitas", other: "Lainnya", unknown: "Tidak tahu" },
};
