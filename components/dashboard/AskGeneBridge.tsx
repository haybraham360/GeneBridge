"use client";

import { useState } from "react";
import { Info, Send } from "lucide-react";
import { useTranslations } from "next-intl";

export default function AskGeneBridge() {
  const [draft, setDraft] = useState("");
  const [extra, setExtra] = useState<string[]>([]);
  const t = useTranslations("dashboard.askGeneBridge");

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setExtra((m) => [...m, text]);
    setDraft("");
  };

  return (
    <section className="flex flex-col rounded-2xl bg-white px-4 pb-3 pt-4.5 shadow-card">
      <div className="flex items-center justify-between">
        <h2 className="text-[20px] font-extrabold text-ink leading-none">
          {/* Ask GeneBridge */}
          {t("title")}
        </h2>
        <span className="flex items-center gap-1.25 text-[13px] text-neutral-500">
          <Info className="h-4 w-4" strokeWidth={1.6} />
          {/* General education only */}
          {t("badge")}
        </span>
      </div>

      <div className="mt-3.5 flex flex-1 flex-col text-[15px] leading-5">
        {/* user */}
        <div className="flex justify-end">
          <div className="rounded-3xl bg-ink px-4 py-3 font-medium text-white">
            {/* What is sickle cell trait? */}
            {t("q1")}
          </div>
        </div>

        {/* assistant */}
        <div className="mt-2 max-w-91 rounded-lg bg-brand/5 px-4 py-3 text-[15px] leading-5 text-neutral-700">
          {/* Sickle cell trait means a person carries one changed copy of the gene
          for haemoglobin and one typical copy. People with the trait are
          usually healthy. */}
          {t("a1")}
        </div>

        {/* user */}
        <div className="mt-2.5 flex justify-end text-[15px]">
          <div className="rounded-3xl bg-ink px-4 py-3 font-medium text-white">
            {/* Does my result mean our baby will be sick? */}
            {t("q2")}
          </div>
        </div>

        {/* assistant with CTA */}
        <div className="mt-2 max-w-92 rounded-lg border border-[#FADBC8] bg-brand/5 px-3 pb-2.5 pt-2.25 text-[15px] leading-5 text-neutral-700">
          {/* I can&apos;t interpret your personal result. A genetic counsellor can
          explain what it means for you and Khalid. */}
          {t("a2", { partner: "Khalid" })}
          <div>
            <button className="mt-1.75 rounded-full bg-ink px-4 py-2 text-[13px] font-semibold text-white">
              {/* Book a counsellor */}
              {t("book")} 
            </button>
          </div>
        </div>

        {extra.map((text, i) => (
          <div key={i} className="mt-2.5 flex justify-end">
            <div className="rounded-3xl bg-ink px-4 py-3 font-medium text-white">
              {text}
            </div>
          </div>
        ))}
      </div>

      <form className="mt-2.75 flex items-center gap-1.5" onSubmit={send}>
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          // placeholder="Ask a general question"
          placeholder={t("placeholder")}
          className="flex-1 rounded-full border border-neutral-300 bg-white px-4 py-3 text-[15px] placeholder:text-neutral-500 focus:border-brand focus:outline-none"
        />
        <button
          type="submit"
          // aria-label="Send"
          aria-label={t("send")}
          className="flex h-12 w-12 items-center rtl:-scale-x-100 justify-center rounded-full bg-brand text-white"
        >
          <Send className="h-6 w-6" strokeWidth={1.8} />
        </button>
      </form>
    </section>
  );
}
