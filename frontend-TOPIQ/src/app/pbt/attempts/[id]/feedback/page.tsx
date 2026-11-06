import type { Metadata } from "next";
import ExamFeedback from "@/components/pbt/ExamFeedback";

export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ExamFeedback key={id} id={id} examFormat="pbt" />;
}
