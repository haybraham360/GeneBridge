"use client";

import { useTranslations } from "next-intl";
import { accountTypes, type AccountType } from "@/lib/onboarding/steps";
import { OptionCards } from "./OptionCards";

export type FacilityError = "invalid" | "required" | "rateLimited" | "generic";

type AccountTypeStepProps = {
  value: AccountType | null;
  onChange: (value: AccountType) => void;
  onSubmit: () => void;
  facilityCode: string;
  onFacilityCodeChange: (code: string) => void;
  error: FacilityError | null;
  pending: boolean;
};

/**
 * Step 1. Asks who is signing up, which decides the dashboard they get.
 * "Health professional" asks for the facility code; the role is granted only
 * after the server checks it (joinAsProfessional).
 */
export function AccountTypeStep({
  value,
  onChange,
  onSubmit,
  facilityCode,
  onFacilityCodeChange,
  error,
  pending,
}: AccountTypeStepProps) {
  const t = useTranslations("onboarding.steps.welcome");
  const tCommon = useTranslations("onboarding");

  const options = accountTypes.map((type) => ({
    value: type,
    label: t(`options.${type}.label`),
    sub: t(`options.${type}.sub`),
  }));

  const errorText =
    error === "invalid"
      ? t("facility.invalid")
      : error === "required"
        ? t("facility.required")
        : error === "rateLimited"
          ? t("facility.rateLimited")
          : error === "generic"
            ? tCommon("saveError")
            : null;

  return (
    <>
      <p id="account-type-question" className="text-[15px] font-bold">
        {t("question")}
      </p>
      <OptionCards
        options={options}
        value={value}
        onChange={onChange}
        onSubmit={onSubmit}
        labelledBy="account-type-question"
        disabled={pending}
      />

      {value === "professional" ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!pending) onSubmit();
          }}
          className="flex flex-col gap-2"
          noValidate
        >
          <label htmlFor="facility-code" className="text-sm font-bold">
            {t("facility.label")}
          </label>
          <input
            id="facility-code"
            name="facility-code"
            type="text"
            // Codes read left to right in every language.
            dir="ltr"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            value={facilityCode}
            onChange={(event) => onFacilityCodeChange(event.target.value)}
            placeholder={t("facility.placeholder")}
            aria-invalid={Boolean(errorText) || undefined}
            aria-describedby={errorText ? "facility-code-error facility-code-hint" : "facility-code-hint"}
            className="min-h-[52px] rounded-input border border-line-strong bg-surface px-4 text-start text-base text-ink placeholder:text-muted/60 focus-visible:border-ink"
          />
          <p id="facility-code-hint" className="text-sm text-muted">
            {t("facility.hint")}
          </p>
          {errorText ? (
            <p id="facility-code-error" role="alert" className="text-sm font-semibold text-danger">
              {errorText}
            </p>
          ) : null}
        </form>
      ) : null}
    </>
  );
}
