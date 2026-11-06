"use client";

import { Camera, CircleCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, type FormEvent } from "react";
import { buttonClasses } from "@/components/ui/Button";
import { Link } from "@/i18n/navigation";

export type ClaimError = "notFound" | "rateLimited" | "generic";

type ConnectResultStepProps = {
  code: string;
  onCodeChange: (code: string) => void;
  onConnect: () => void;
  connected: boolean;
  error: ClaimError | null;
  pending: boolean;
};

/**
 * Step 6. Reference number, or photograph or upload the report (task 12).
 * Once connected it only says "Result connected." and shows nothing about
 * the result itself.
 */
export function ConnectResultStep({
  code,
  onCodeChange,
  onConnect,
  connected,
  error,
  pending,
}: ConnectResultStepProps) {
  const t = useTranslations("onboarding.steps.connect");
  const tCommon = useTranslations("onboarding");
  const inputRef = useRef<HTMLInputElement>(null);

  if (connected) {
    return (
      <p
        role="status"
        className="flex items-center gap-2.5 rounded-tile bg-success-tint p-4 text-[15px] font-bold text-success-text"
      >
        <CircleCheck
          aria-hidden="true"
          className="size-5 flex-none"
          strokeWidth={2}
        />
        {t("connected")}
      </p>
    );
  }

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!pending && code.trim()) onConnect();
  };

  const errorText =
    error === "notFound"
      ? t("notFound")
      : error === "rateLimited"
        ? t("rateLimited")
        : error === "generic"
          ? tCommon("saveError")
          : null;

  return (
    <>
      <form onSubmit={submit} className="flex flex-col gap-2" noValidate>
        <label htmlFor="reference" className="text-sm font-bold">
          {t("label")}
        </label>
        <div className="flex flex-wrap gap-2.5">
          <input
            ref={inputRef}
            id="reference"
            name="reference"
            type="text"
            // Reference numbers read left to right in every language.
            dir="ltr"
            inputMode="text"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            value={code}
            onChange={(event) => {
              onCodeChange(event.target.value);
            }}
            placeholder={t("placeholder")}
            aria-invalid={Boolean(errorText) || undefined}
            aria-describedby={errorText ? "reference-error" : undefined}
            className="min-h-[52px] min-w-0 flex-[1_1_220px] rounded-input border border-line-strong bg-surface px-4 text-start text-base text-ink placeholder:text-muted/60 focus-visible:border-ink"
          />
          <button
            type="submit"
            disabled={pending || !code.trim()}
            aria-busy={pending || undefined}
            className={buttonClasses(
              "dark",
              "md",
              "flex-[0_0_auto] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-none",
            )}
          >
            {pending ? t("connecting") : t("connect")}
          </button>
        </div>
        {errorText ? (
          <p
            id="reference-error"
            role="alert"
            className="text-sm font-semibold text-danger"
          >
            {errorText}
          </p>
        ) : null}
      </form>

      {/* Task 12: read the report itself. Onboarding resumes here afterwards. */}
      <Link
        href="/dashboard/scan?from=onboarding"
        className={buttonClasses(
          "ghost",
          "md",
          "w-full hover:translate-y-0 hover:shadow-none",
        )}
      >
        <Camera aria-hidden="true" className="size-5" strokeWidth={2} />
        {t("photo")}
      </Link>
    </>
  );
}
