import test from "node:test";
import assert from "node:assert/strict";
import {
  BETA_CONSENT_VERSIONS,
  hasCurrentBetaConsent,
  hasRequiredBetaConsentSubmission,
} from "../lib/beta-consent.ts";

test("requires every onboarding consent to be explicitly true", () => {
  const completeSubmission = {
    adult_us_eligibility_confirmed: true,
    terms_accepted: true,
    privacy_acknowledged: true,
    coaching_disclaimer_acknowledged: true,
  };

  assert.equal(hasRequiredBetaConsentSubmission(completeSubmission), true);
  assert.equal(
    hasRequiredBetaConsentSubmission({
      ...completeSubmission,
      privacy_acknowledged: false,
    }),
    false
  );
  assert.equal(hasRequiredBetaConsentSubmission(undefined), false);
});

test("requires timestamps for the current policy versions", () => {
  const currentConsent = {
    adult_us_eligibility_confirmed_at: "2026-07-17T17:00:00.000Z",
    adult_us_eligibility_version: BETA_CONSENT_VERSIONS.eligibility,
    terms_accepted_at: "2026-07-17T17:00:00.000Z",
    terms_version: BETA_CONSENT_VERSIONS.terms,
    privacy_acknowledged_at: "2026-07-17T17:00:00.000Z",
    privacy_version: BETA_CONSENT_VERSIONS.privacy,
    coaching_disclaimer_acknowledged_at: "2026-07-17T17:00:00.000Z",
    coaching_disclaimer_version: BETA_CONSENT_VERSIONS.coachingDisclaimer,
  };

  assert.equal(hasCurrentBetaConsent(currentConsent), true);
  assert.equal(hasCurrentBetaConsent({ ...currentConsent, terms_version: "outdated" }), false);
  assert.equal(hasCurrentBetaConsent({ ...currentConsent, privacy_acknowledged_at: null }), false);
});
