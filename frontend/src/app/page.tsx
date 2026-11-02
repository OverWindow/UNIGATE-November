import type { Metadata } from "next";
import TransferRequest from "@/components/TransferRequest";
import LandingEffects from "@/components/LandingEffects";
import universities from "@/lib/landing/universities.json";

export const metadata: Metadata = {
  title: "Panduan Transfer ke Universitas Korea | UNIGATE",
  description: "Temukan persyaratan, prosedur, dokumen, dan persiapan bahasa Korea untuk pendaftaran transfer ke universitas di Korea Selatan.",
};

// Preserve the reference structure; interactions attach after hydration.
export default function Home() {
  return (<>

<canvas id="ambient-dots" aria-hidden="true"></canvas>
<main>
<section className="hero" aria-labelledby="hero-title">
<div><h1 id="hero-title">Mau Lanjut Kuliah <span>di Korea Selatan?</span></h1><p className="hero-subtitle">Dapatkan Panduan Transfer ke Universitas Korea!</p><button className="primary" type="button" data-open-guide>Dapatkan Panduan PDF Gratis</button></div>
<div className="character-stage" role="img" aria-label="Karakter krom interaktif yang mengikuti gerakan penunjuk">
<div className="orbital orbital-one"></div><div className="orbital orbital-two"></div><div className="orbit-dot"></div><div className="character-shadow"></div>
<div className="character-float"><div className="character-tilt"><svg className="character" viewBox="0 0 420 420" fill="none" aria-hidden="true">
<defs>
<radialGradient id="chrome" cx=".32" cy=".2" r=".83"><stop stopColor="#f4ffff"/><stop offset=".19" stopColor="#b9f4f1"/><stop offset=".36" stopColor="#90b7c4"/><stop offset=".51" stopColor="#434f6a"/><stop offset=".63" stopColor="#a8a9ee"/><stop offset=".76" stopColor="#5cdfd7"/><stop offset=".9" stopColor="#93f7b7"/><stop offset="1" stopColor="#247b9d"/></radialGradient>
<radialGradient id="glow" cx=".55" cy=".95" r=".65"><stop stopColor="#47ffb4"/><stop offset=".5" stopColor="#20daa7" stopOpacity=".75"/><stop offset="1" stopColor="#1b8bd6" stopOpacity="0"/></radialGradient>
<radialGradient id="shine" cx=".4" cy=".12" r=".65"><stop stopColor="#fff" stopOpacity=".95"/><stop offset=".42" stopColor="#d8ffff" stopOpacity=".7"/><stop offset=".75" stopColor="#b5ffff" stopOpacity="0"/></radialGradient>
<linearGradient id="rim" x1="70" y1="70" x2="340" y2="350" gradientUnits="userSpaceOnUse"><stop stopColor="#f2ffff"/><stop offset=".38" stopColor="#97edf1"/><stop offset=".62" stopColor="#4739a1"/><stop offset="1" stopColor="#d2ffed"/></linearGradient>
<filter id="blur"><feGaussianBlur stdDeviation="12"/></filter><clipPath id="sphere"><circle cx="210" cy="210" r="164"/></clipPath>
</defs>
<circle cx="210" cy="210" r="166" fill="url(#rim)"/><g clipPath="url(#sphere)"><circle cx="210" cy="210" r="164" fill="url(#chrome)"/>
<path d="M26 190C104 133 148 263 247 224S351 90 408 179V333H26Z" fill="#a3a6ff" opacity=".6" filter="url(#blur)"/>
<path d="M37 270C107 215 186 306 261 248S354 204 396 273V405H37Z" fill="url(#glow)"/>
<ellipse cx="187" cy="105" rx="130" ry="63" fill="url(#shine)" filter="url(#blur)"/>
<ellipse cx="98" cy="219" rx="20" ry="97" fill="#e9ffff" opacity=".39" filter="url(#blur)"/>
<path d="M77 161C94 96 151 65 200 65" stroke="#edffff" strokeOpacity=".75" strokeWidth="3" strokeLinecap="round"/>
<g className="face"><g className="eyes"><rect x="139" y="176" width="27" height="76" rx="13.5" fill="#161825"/><rect x="252" y="176" width="27" height="76" rx="13.5" fill="#161825"/><rect x="145" y="184" width="4" height="34" rx="2" fill="#fff" opacity=".11"/><rect x="258" y="184" width="4" height="34" rx="2" fill="#fff" opacity=".11"/></g></g>
<path d="M163 350C211 367 263 355 294 335" stroke="#bbffe2" strokeWidth="2" strokeOpacity=".6" strokeLinecap="round"/></g></svg></div></div>
</div>
</section>

<section className="transfer-story" aria-labelledby="transfer-title"><div className="story-heading"><h2 id="transfer-title">Gelar sarjana Korea.<br /><span>Jalur yang lebih efisien.</span></h2><p>Lanjutkan pendidikanmu di Korea dengan jalur transfer yang sesuai dengan latar belakang studimu.</p></div><div className="transfer-reasons"><article><h3>Biaya lebih hemat</h3><p>Kurangi biaya kuliah dan biaya hidup dengan masa studi yang lebih singkat.</p></article><article><h3>Waktu lebih singkat</h3><p>Lanjut ke tahun ketiga atau keempat, sesuai pengakuan kredit dan ketentuan kampus.</p></article><article><h3>Jalur internasional</h3><p>Jalur khusus pelamar asing memiliki seleksi tersendiri, terpisah dari jalur domestik. Persyaratan bergantung pada universitas.</p></article><article><h3>Bekal karier</h3><p>Perkuat profilmu dengan gelar sarjana Korea dan kemampuan bahasa Korea.</p></article></div></section>
<section className="cost-story" aria-labelledby="cost-title">
<div className="cost-intro"><div><h2 id="cost-title">Rencanakan gelarmu.<br />Optimalkan biayamu.</h2></div><div className="saving"><strong>75<span>%</span></strong><p>potensi biaya lebih hemat dibanding jalur <span className="text-phrase">masuk tahun pertama</span></p></div></div>
<div className="cost-comparison" aria-label="Perbandingan simulasi biaya jalur masuk tahun pertama dan transfer">
<div className="cost-option"><p className="cost-route">Masuk <span className="text-phrase">tahun pertama</span></p><p className="cost-amount"><span>KRW</span>75,28 <small>juta</small></p></div>
<div className="cost-option"><p className="cost-route">Transfer ke <span className="text-phrase">tahun ketiga*</span></p><p className="cost-amount"><span>KRW</span>37,64 <small>juta</small></p></div>
<div className="cost-option"><p className="cost-route">Transfer ke <span className="text-phrase">tahun keempat*</span></p><p className="cost-amount"><span>KRW</span>18,82 <small>juta</small></p></div>
</div>
<p className="cost-note">*Simulasi biaya transfer setelah 2 atau 3 tahun studi sebelumnya, dibandingkan jalur 4 tahun di Korea. Biaya aktual dan masa studi bergantung pada kampus serta pengakuan kredit.</p><details className="cost-details"><summary>Sumber dan asumsi</summary><p>Per tahun: kuliah KRW 6,82 juta dan biaya hidup KRW 12 juta. Tidak termasuk studi sebelumnya, kursus bahasa, perjalanan, atau visa. Ketersediaan transfer tahun ketiga atau keempat bergantung pada program.</p><div className="source-links"><a href="https://studyinkorea.go.kr/en/plan/abroadExpenses.do" target="_blank" rel="noopener noreferrer">Biaya kuliah</a><a href="https://studyinkorea.go.kr/en/life/livingExpense.do" target="_blank" rel="noopener noreferrer">Biaya hidup</a><a href="https://www.studyinkorea.go.kr/ko/plan/schoolType.do" target="_blank" rel="noopener noreferrer">Jalur transfer</a></div></details>
</section>

<section className="contents" aria-labelledby="contents-title">
  <div><h2 id="contents-title"><span className="text-phrase">Apa yang Ada</span> <span className="text-phrase">di Dalam</span> <span className="text-phrase">Panduan Ini?</span></h2><p className="section-copy">Temukan informasi penting mengenai persyaratan, prosedur, dan persiapan pendaftaran transfer ke universitas di Korea Selatan.</p></div>
  <ol className="topics"><li><span className="topic-number" aria-hidden="true">01</span><span className="topic-name">Informasi universitas <span className="text-phrase">di Korea Selatan</span></span></li><li><span className="topic-number" aria-hidden="true">02</span><span className="topic-name">Persyaratan <span className="text-phrase">pendaftaran transfer</span></span></li><li><span className="topic-number" aria-hidden="true">03</span><span className="topic-name">Jadwal dan prosedur pendaftaran</span></li><li><span className="topic-number" aria-hidden="true">04</span><span className="topic-name">Dokumen yang perlu disiapkan</span></li><li><span className="topic-number" aria-hidden="true">05</span><span className="topic-name">Persyaratan kemampuan <span className="text-phrase">bahasa Korea</span></span></li></ol>
  <div className="guide-prompt"><div className="prompt-message"><span className="prompt-beacon" aria-hidden="true"></span><p><strong>Panduan PDF gratis</strong><span>Daftar sekarang untuk menerimanya melalui email.</span></p></div><button className="primary" type="button" data-open-guide>Daftar Gratis</button></div>
</section>
<section className="universities" id="universities" aria-label="Universitas di Korea Selatan"><div className="university-pin"><div className="university-heading"><h2>Temukan kampus tujuanmu.</h2><p>Informasi universitas di Korea Selatan</p></div><div className="university-window" tabIndex={0} role="region" aria-label="Daftar universitas. Gunakan tombol panah untuk menjelajah."><div className="university-track">{universities.map(item => (
  <article className="university-card" key={item.name}>
    <img src={item.image} alt={item.alt} loading="lazy" />
    <div className="university-copy"><h3><a href={item.website} target="_blank" rel="noopener noreferrer">{item.name}</a></h3><p>{item.description}</p>
      <p className="photo-credit"><a href={item.source} target="_blank" rel="noopener noreferrer">{`Foto: ${item.author}`}</a>{" / "}<a href={item.license} target="_blank" rel="noopener noreferrer">{item.licenseLabel}</a></p>
    </div>
  </article>
))}</div></div><div className="university-meta"><div className="university-more"><button className="text-link" type="button" data-open-stats>Lihat selengkapnya</button></div><p className="university-counter" aria-label="Kartu 1 dari 10"><span>01</span>/{String(universities.length).padStart(2, "0")}</p></div></div></section>
<section className="cta" aria-labelledby="cta-title"><div><h2 id="cta-title">Mulai Persiapan Kuliahmu Sekarang!</h2></div><button className="primary" type="button" data-open-guide>Dapatkan Panduan PDF Gratis</button></section>
</main>
<footer className="site-footer"><p className="footer-name">UNIGATE</p><p>Platform pembelajaran bahasa Korea dan penghubung transfer universitas.</p><p>Merek terdaftar di Indonesia: IDM001488588.</p></footer>
<TransferRequest />
<dialog id="stats-dialog" className="stats-dialog" aria-labelledby="stats-title"><button className="close" type="button" aria-label="Tutup">×</button><h2 id="stats-title">Mahasiswa Indonesia<br />di universitas Korea.</h2><div className="stats-table-window" tabIndex={0} role="region" aria-label="Statistik 20 universitas"><table><thead><tr><th scope="col">No.</th><th scope="col">Universitas</th><th scope="col">Wilayah</th><th scope="col">Mahasiswa</th></tr></thead><tbody><tr><td>1</td><th scope="row">Woosong University</th><td>Daejeon</td><td>131</td></tr><tr><td>2</td><th scope="row">Yonsei University</th><td>Seoul</td><td>98</td></tr><tr><td>3</td><th scope="row">KAIST</th><td>Daejeon</td><td>89</td></tr><tr><td>4</td><th scope="row">Pukyong National University</th><td>Busan</td><td>71</td></tr><tr><td>5</td><th scope="row">Seoul National University</th><td>Seoul</td><td>70</td></tr><tr><td>6</td><th scope="row">Korea University</th><td>Seoul</td><td>61</td></tr><tr><td>7</td><th scope="row">Gyeongsang National University</th><td>Gyeongsangnam-do</td><td>56</td></tr><tr><td>8</td><th scope="row">Hanyang University</th><td>Seoul / Gyeonggi</td><td>51</td></tr><tr><td>9</td><th scope="row">Sungkyunkwan University</th><td>Seoul / Gyeonggi</td><td>50</td></tr><tr><td>10</td><th scope="row">Pusan National University</th><td>Busan</td><td>46</td></tr><tr><td>11</td><th scope="row">Dankook University</th><td>Gyeonggi / Chungcheongnam-do</td><td>45</td></tr><tr><td>12</td><th scope="row">Dongseo University</th><td>Busan</td><td>45</td></tr><tr><td>13</td><th scope="row">Dong-A University</th><td>Busan</td><td>41</td></tr><tr><td>14</td><th scope="row">Jeonbuk National University</th><td>Jeonbuk</td><td>38</td></tr><tr><td>15</td><th scope="row">Kyung Hee University</th><td>Seoul / Gyeonggi</td><td>38</td></tr><tr><td>16</td><th scope="row">Sejong University</th><td>Seoul</td><td>37</td></tr><tr><td>17</td><th scope="row">Soonchunhyang University</th><td>Chungcheongnam-do</td><td>37</td></tr><tr><td>18</td><th scope="row">Kookmin University</th><td>Seoul</td><td>34</td></tr><tr><td>19</td><th scope="row">Konkuk University</th><td>Seoul / Chungcheongbuk-do</td><td>32</td></tr><tr><td>20</td><th scope="row">Chonnam National University</th><td>Gwangju / Jeollanam-do</td><td>30</td></tr></tbody></table></div></dialog>

<LandingEffects />
</>);
}
