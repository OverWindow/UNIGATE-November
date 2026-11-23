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
    { ...labels.general, email: "overwindow@unigate.kr", refundHref: null, body: null },
    { ...labels.refund, email: billingEmail, refundHref: localizedPath("/settings/refunds", language), body: orderLine },
  ];

  return (
    <>
      <Link className="text-link mb-4" href={localizedPath("/settings", language)}>
        <ArrowLeft size={16} aria-hidden="true" />{landingContent[language].footer.settings}
      </Link>
      <h1 className="section-heading">{labels.title}</h1>
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {contacts.map(({ title, description, email, refundHref, body }) => (
          <section key={email} id={refundHref ? "refund-inquiry" : undefined} tabIndex={refundHref ? -1 : undefined}
            className="flex flex-col items-start rounded-xl border border-slate-200 p-5 sm:p-6">
            <h2 className="text-xl font-semibold">{title}</h2>
            <div className="mb-1 mt-2 space-y-2 leading-relaxed text-muted">
              <p>{description}</p>
              {refundHref && <>
                <p>{labels.refund.emailGuidance}</p>
                <p>{body ? labels.refund.orderIncluded : labels.refund.includeOrder}</p>
                {body && <p className="select-all break-words">{body}</p>}
              </>}
            </div>
            <CopyEmailAddress email={email} language={language} />
            <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 pt-4">
              <a className="button button-primary" aria-label={`${labels.compose} · ${title}`}
                href={`mailto:${email}?subject=${encodeURIComponent(`[TOPIQ] ${title}`)}${body ? `&body=${encodeURIComponent(body)}` : ""}`}>{labels.compose}</a>
              {refundHref && <Link className="text-link" href={refundHref}>{labels.refundsLink}</Link>}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
