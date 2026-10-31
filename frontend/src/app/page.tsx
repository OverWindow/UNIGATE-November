import AboutSectionOne from "@/components/About/AboutSectionOne";
import ScrollUp from "@/components/Common/ScrollUp";
import Contact from "@/components/Contact";
import Features from "@/components/Features";
import Hero from "@/components/Hero";
import Partners from "@/components/Partners";
import Pricing from "@/components/Pricing";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "UNIGATE - Pendidikan Bahasa Korea untuk Keberhasilan Transfer",
  description:
    "Kami menyediakan layanan pembelajaran bahasa Korea online yang terintegrasi dengan program diploma di perguruan tinggi vokasi Indonesia untuk mempersiapkan mahasiswa melanjutkan studi ke universitas di Korea melalui jalur transfer.",
};

export default function Home() {
  return (
    <>
      <ScrollUp />
      <Hero />
      <Features />
      <AboutSectionOne />
      <Pricing />
      <Partners />
      <Contact />
    </>
  );
}
