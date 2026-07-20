export const BETA_CONSENT_VERSIONS = {
  eligibility: "2026-07-17",
  terms: "2026-07-14",
  privacy: "2026-07-16",
  coachingDisclaimer: "2026-07-17",
} as const;

export type BetaConsentSubmission = {
  adult_us_eligibility_confirmed?: boolean;
  terms_accepted?: boolean;
  privacy_acknowledged?: boolean;
  coaching_disclaimer_acknowledged?: boolean;
};

export type BetaConsentRecord = {
  adult_us_eligibility_confirmed_at?: string | null;
  adult_us_eligibility_version?: string | null;
  terms_accepted_at?: string | null;
  terms_version?: string | null;
  privacy_acknowledged_at?: string | null;
  privacy_version?: string | null;
  coaching_disclaimer_acknowledged_at?: string | null;
  coaching_disclaimer_version?: string | null;
};

export function hasRequiredBetaConsentSubmission(
  submission: BetaConsentSubmission | null | undefined
) {
  return Boolean(
    submission?.adult_us_eligibility_confirmed === true &&
      submission.terms_accepted === true &&
      submission.privacy_acknowledged === true &&
      submission.coaching_disclaimer_acknowledged === true
  );
}

export function hasCurrentBetaConsent(record: BetaConsentRecord | null | undefined) {
  return Boolean(
    record?.adult_us_eligibility_confirmed_at &&
      record.adult_us_eligibility_version === BETA_CONSENT_VERSIONS.eligibility &&
      record.terms_accepted_at &&
      record.terms_version === BETA_CONSENT_VERSIONS.terms &&
      record.privacy_acknowledged_at &&
      record.privacy_version === BETA_CONSENT_VERSIONS.privacy &&
      record.coaching_disclaimer_acknowledged_at &&
      record.coaching_disclaimer_version === BETA_CONSENT_VERSIONS.coachingDisclaimer
  );
}
