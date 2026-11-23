import RefundSettings from "@/components/credits/RefundSettings";
import { paymentHistoryContent } from "@/lib/credits-content";
import { requestLanguage } from "@/lib/seo";
import "../../credits/credits.css";

export async function generateMetadata() {
  const language = await requestLanguage();
  return { title: `${paymentHistoryContent[language].refundTitle} | TOPIQ` };
}

export default function RefundsPage() {
  return <RefundSettings />;
}
