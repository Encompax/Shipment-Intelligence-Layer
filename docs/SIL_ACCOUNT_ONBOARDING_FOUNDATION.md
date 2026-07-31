# SIL Account Onboarding Foundation

## Current first-step flow

1. Public visitor lands on `www.encompax.com`
2. Visitor chooses `Start SIL Access`
3. Visitor arrives on `sil.encompax.io` with onboarding context in the URL
4. SIL auth captures:
   - sign-in method
   - intended rollout plan
   - organization name
   - preferred spreadsheet ecosystem
5. SIL persists the onboarding record into Firebase before workspace activity begins

## Why plan intent is captured before billing

- We need account setup to work now, even before pricing pages and upgrades are finalized.
- Capturing plan intent early lets us add:
  - token guardrails
  - usage-based billing
  - agent seat controls
  - upgrade prompts
  without changing the user identity model later.

## Initial metadata captured per user

- `authMethod`
- `signupSource`
- `preferredModule`
- `intendedPlan`
- `productivitySuite`
- `recommendedImportMode`
- `usageGuardrails.monthlyTokenGuardrail`
- `adaptiveExperience.uxLearningEnabled`

## Spreadsheet intake direction

- `microsoft` means bias import mapping toward Excel-shaped CSV exports
- `google` means bias import mapping toward Google Sheets export patterns
- `mixed` keeps intake neutral until real customer files reveal the right defaults

## Next implementation steps

1. Add Firebase Auth provider configuration for Google and Microsoft in the Firebase console
2. Create a post-signup workspace setup step for:
   - company profile
   - first datasource
   - first CSV upload
3. Introduce pricing pages and upgrade controls using the stored `intendedPlan`
4. Add per-workspace usage accounting before enabling agent-heavy workflows
