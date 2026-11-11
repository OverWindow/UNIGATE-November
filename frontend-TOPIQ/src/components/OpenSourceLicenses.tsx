"use client";

import { useApp } from "@/app/providers";

interface Document { name: string; href: string }
interface Entry { name: string; version: string; license: string; sourceUrl: string; documents: Document[] }

const content = {
  ko: {
    title: "오픈소스 라이선스", intro: "TOPIQ에서 사용하는 소프트웨어와 사전 데이터의 출처 및 이용조건입니다. 각 항목에서 원문 고지를 확인할 수 있습니다.",
    dataTitle: "Garu와 사전 데이터", source: "프로젝트 원문", notices: "라이선스·저작권 고지 원문", bundled: "Next.js에 포함된 구성요소 고지",
    engine: "Garu 엔진 및 패키지 코드: Copyright 2026 Yongjin Cho. Apache License 2.0.",
    model: "Garu 0.13.0의 엔진과 모델 파일을 수정 없이 사용합니다. Garu가 포함한 사전 데이터에는 아래 출처별 이용조건이 적용됩니다.",
    mecab: "mecab-ko-dic — Eunjeon project, Yongwoon Lee, Yungho Yu 및 기여자. Apache-2.0.",
    nikl: "한국어기초사전 — 국립국어원. 우리말샘 — 국립국어원 및 원문에 표시된 기여자. CC BY-SA 2.0 KR.",
    changes: "Garu의 사전 데이터 선별·정규화와 변경 내역, 출처별 기록은 아래 models/NOTICE.md 및 bulk-provenance.json에 보존되어 있습니다. 해당 CC 데이터의 변경물을 배포할 때에는 동일조건변경허락 조건이 적용됩니다.",
    dictionary: "예문 단어 뜻은 국립국어원 한국어기초사전 API를 통해 제공합니다. 사전 결과에도 출처·원문 링크·이용조건을 표시합니다.",
    terms: "CC BY-SA 2.0 KR 이용조건", libraries: "소프트웨어", more: "포함된 고지 보기",
  },
  en: {
    title: "Open-source licenses", intro: "Sources and terms for software and dictionary data used by TOPIQ. Original notices are linked below.",
    dataTitle: "Garu and dictionary data", source: "Project source", notices: "Original license and copyright notices", bundled: "Notices for components bundled with Next.js",
    engine: "Garu engine and package code: Copyright 2026 Yongjin Cho. Apache License 2.0.",
    model: "TOPIQ uses the Garu 0.13.0 engine and model files without modification. Its bundled dictionary data retains the following source-specific terms.",
    mecab: "mecab-ko-dic — Eunjeon project, Yongwoon Lee, Yungho Yu and contributors. Apache-2.0.",
    nikl: "Korean Basic Dictionary — National Institute of Korean Language. Urimalsaem — National Institute of Korean Language and contributors credited by the source. CC BY-SA 2.0 KR.",
    changes: "Garu's selection, normalization, modifications and source records are preserved in models/NOTICE.md and bulk-provenance.json below. Distributed adaptations of the CC-licensed data are subject to ShareAlike.",
    dictionary: "Example-word definitions are provided through the National Institute of Korean Language's Korean Basic Dictionary API. Dictionary results also display attribution, source links and license terms.",
    terms: "CC BY-SA 2.0 KR terms", libraries: "Software", more: "View bundled notices",
  },
  id: {
    title: "Lisensi sumber terbuka", intro: "Sumber dan ketentuan perangkat lunak serta data kamus yang digunakan TOPIQ. Pemberitahuan asli tersedia melalui tautan di bawah.",
    dataTitle: "Garu dan data kamus", source: "Sumber proyek", notices: "Lisensi dan pemberitahuan hak cipta asli", bundled: "Pemberitahuan komponen dalam Next.js",
    engine: "Mesin dan kode paket Garu: Copyright 2026 Yongjin Cho. Apache License 2.0.",
    model: "TOPIQ menggunakan mesin dan model Garu 0.13.0 tanpa modifikasi. Data kamus di dalamnya tetap mengikuti ketentuan masing-masing sumber berikut.",
    mecab: "mecab-ko-dic — Eunjeon project, Yongwoon Lee, Yungho Yu dan kontributor. Apache-2.0.",
    nikl: "Korean Basic Dictionary — National Institute of Korean Language. Urimalsaem — National Institute of Korean Language dan kontributor yang tercantum pada sumber. CC BY-SA 2.0 KR.",
    changes: "Pemilihan, normalisasi, perubahan, dan catatan sumber data Garu disimpan dalam models/NOTICE.md serta bulk-provenance.json di bawah. Adaptasi data berlisensi CC yang dibagikan wajib mengikuti ketentuan BerbagiSerupa.",
    dictionary: "Arti kata dalam contoh disediakan melalui API Korean Basic Dictionary milik National Institute of Korean Language. Hasil kamus juga menampilkan atribusi, tautan sumber, dan ketentuan lisensi.",
    terms: "Ketentuan CC BY-SA 2.0 KR", libraries: "Perangkat lunak", more: "Lihat pemberitahuan komponen",
  },
};

export default function OpenSourceLicenses({ entries, bundled }: { entries: Entry[]; bundled: Document[] }) {
  const { language } = useApp();
  const t = content[language];
  return <main id="main-content" className="licenses-main page-container" tabIndex={-1}>
    <p className="eyebrow">TOPIQ · OPEN SOURCE</p>
    <h1>{t.title}</h1>
    <p className="licenses-intro">{t.intro}</p>
    <section className="licenses-data" aria-labelledby="licenses-data-title">
      <h2 id="licenses-data-title">{t.dataTitle}</h2>
      <p>{t.engine}</p><p>{t.model}</p>
      <ul><li>{t.mecab}</li><li>{t.nikl}</li></ul>
      <p>{t.changes}</p><p>{t.dictionary}</p>
      <a href="https://creativecommons.org/licenses/by-sa/2.0/kr/" target="_blank" rel="noopener noreferrer">{t.terms}</a>
    </section>
    <h2>{t.libraries}</h2>
    <div className="licenses-list">{entries.map(entry => <section className="licenses-entry" key={entry.name}>
      <h3>{entry.name} <span>{entry.version}</span></h3>
      <p>{entry.license}</p>
      <a href={entry.sourceUrl} target="_blank" rel="noopener noreferrer">{t.source}</a>
      <details><summary>{t.notices}</summary><ul>{entry.documents.map(doc => <li key={doc.href}>
        <a href={doc.href} target="_blank" rel="noopener noreferrer">{doc.name}</a>
      </li>)}</ul></details>
    </section>)}</div>
    <section className="licenses-bundled"><h2>{t.bundled}</h2>
      <details><summary>{t.more} ({bundled.length})</summary><ul>{bundled.map(doc => <li key={doc.href}>
        <a href={doc.href} target="_blank" rel="noopener noreferrer">{doc.name}</a>
      </li>)}</ul></details>
    </section>
  </main>;
}
