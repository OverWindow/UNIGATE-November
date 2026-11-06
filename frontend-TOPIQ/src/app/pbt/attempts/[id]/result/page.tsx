import type { Metadata } from "next";
import ExamResult from "@/components/pbt/ExamResult";

export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ExamResult key={id} id={id} examFormat="pbt" />;
}
