"use client";

import { useTranslation } from "@/lib/i18n/LanguageContext";
import { ScrollReveal } from "@/hooks/useInView";

const Contact = () => {
  const t = useTranslation();
  const form = t.contact.form;

  return (
    <section id="contact" className="overflow-hidden py-16 md:py-20 lg:py-28">
      <div className="container">
        <div className="-mx-4 flex flex-wrap justify-center">
          <div className="w-full px-4 lg:w-7/12 xl:w-8/12">
            <ScrollReveal>
              <div className="border-body-color/[.15] mb-12 rounded-2xl border bg-white/60 p-8 transition hover:-translate-y-0.5 hover:shadow-lg sm:p-[55px] lg:mb-5 lg:p-8 xl:p-[55px]">
                <h2 className="mb-3 text-2xl font-bold text-black sm:text-3xl lg:text-2xl xl:text-3xl">
                  {t.contact.title}
                </h2>
                <p className="text-body-color mb-12 text-base font-medium">
                  {t.contact.description}
                </p>

                <form action="https://formspree.io/f/meelzwyb" method="POST">
                  <div className="-mx-4 flex flex-wrap">
                    <div className="w-full px-4 md:w-1/2">
                      <div className="mb-6">
                        <label
                          htmlFor="name"
                          className="mb-2 block text-sm font-semibold text-black"
                        >
                          {form.name}
                        </label>
                        <input
                          id="name"
                          name="name"
                          type="text"
                          placeholder={form.namePlaceholder}
                          required
                          className="border-body-color/[.15] focus:border-primary w-full rounded-2xl border bg-white/70 px-5 py-3 text-sm text-black outline-hidden transition placeholder:text-black/40"
                        />
                      </div>
                    </div>

                    <div className="w-full px-4 md:w-1/2">
                      <div className="mb-6">
                        <label
                          htmlFor="email"
                          className="mb-2 block text-sm font-semibold text-black"
                        >
                          {form.email}
                        </label>
                        <input
                          id="email"
                          name="email"
                          type="email"
                          placeholder={form.emailPlaceholder}
                          required
                          className="border-body-color/[.15] focus:border-primary w-full rounded-2xl border bg-white/70 px-5 py-3 text-sm text-black outline-hidden transition placeholder:text-black/40"
                        />
                      </div>
                    </div>

                    <div className="w-full px-4 md:w-1/2">
                      <div className="mb-6">
                        <label
                          htmlFor="target"
                          className="mb-2 block text-sm font-semibold text-black"
                        >
                          {form.target}
                        </label>
                        <input
                          id="target"
                          name="target"
                          type="text"
                          placeholder={form.targetPlaceholder}
                          className="border-body-color/[.15] focus:border-primary w-full rounded-2xl border bg-white/70 px-5 py-3 text-sm text-black outline-hidden transition placeholder:text-black/40"
                        />
                      </div>
                    </div>

                    <div className="w-full px-4 md:w-1/2">
                      <div className="mb-6">
                        <label
                          htmlFor="timeline"
                          className="mb-2 block text-sm font-semibold text-black"
                        >
                          {form.timeline}
                        </label>
                        <input
                          id="timeline"
                          name="timeline"
                          type="text"
                          placeholder={form.timelinePlaceholder}
                          className="border-body-color/[.15] focus:border-primary w-full rounded-2xl border bg-white/70 px-5 py-3 text-sm text-black outline-hidden transition placeholder:text-black/40"
                        />
                      </div>
                    </div>

                    <div className="w-full px-4">
                      <div className="mb-8">
                        <label
                          htmlFor="message"
                          className="mb-2 block text-sm font-semibold text-black"
                        >
                          {form.message}
                        </label>
                        <textarea
                          id="message"
                          name="message"
                          rows={6}
                          placeholder={form.messagePlaceholder}
                          required
                          className="border-body-color/[.15] focus:border-primary w-full resize-none rounded-2xl border bg-white/70 px-5 py-3 text-sm text-black outline-hidden transition placeholder:text-black/40"
                        />
                      </div>
                    </div>

                    <input
                      type="hidden"
                      name="_subject"
                      value={form.subject}
                    />

                    <div className="w-full px-4">
                      <div className="flex justify-center">
                        <button
                          type="submit"
                          className="bg-primary hover:bg-primary/90 rounded-2xl px-9 py-4 text-base font-semibold text-white transition"
                        >
                          {form.submit}
                        </button>
                      </div>
                    </div>
                  </div>
                </form>
              </div>
            </ScrollReveal>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Contact;
