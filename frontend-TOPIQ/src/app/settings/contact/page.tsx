import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { contactContent } from "@/lib/contact-content";
import { billingEmail, paymentHistoryContent } from "@/lib/credits-content";
import { landingContent } from "@/lib/landing-content";
import { localizedPath } from "@/lib/locale-path";
import { requestLanguage } from "@/lib/seo";
import CopyEmailAddress from "./CopyEmailAddress";

export async function generateMetadata() {
  const language = await requestLanguage();
  return { title: `${contactContent[language].title} | TOPIQ` };
}

export default async function ContactPage({ searchParams }: PageProps<"/settings/contact">) {
  const [language, { order }] = await Promise.all([requestLanguage(), searchParams]);
  const labels = contactContent[language];
  const orderLine = typeof order === "string" && /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(order)
    ? `${paymentHistoryContent[language].inquiry.order}: ${order}` : null;
  const contacts = [
    { ...labels.general, email: "overwindow@unigate.kr", refund: false, body: null },
    { ...labels.refund, email: billingEmail, refund: true, body: orderLine },
  ];

  return (
    <>
      <Link className="text-link mb-4" href={localizedPath("/settings", language)}>
        <ArrowLeft size={16} aria-hidden="true" />{landingContent[language].footer.settings}
      </Link>
      <h1 className="section-heading">{labels.title}</h1>
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {contacts.map(({ title, description, email, refund, body }) => (
          <section key={email} id={refund ? "refund-inquiry" : undefined} tabIndex={refund ? -1 : undefined}
            className="flex flex-col items-start rounded-xl border border-slate-200 p-5 sm:p-6">
            <h2 className="text-xl font-semibold">{title}</h2>
            <div className="mb-1 mt-2 space-y-2 leading-relaxed text-muted">
              <p>{description}</p>
              {refund && <>
                <p>{labels.refund.emailGuidance}</p>
                <p>{body ? labels.refund.orderIncluded : labels.refund.includeOrder}</p>
                {body && <p className="select-all break-words">{body}</p>}
              </>}
            </div>
            <CopyEmailAddress email={email} language={language} />
          </section>
        ))}
      </div>
    </>
  );
}
