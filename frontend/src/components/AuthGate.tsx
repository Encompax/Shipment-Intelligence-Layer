import React, { FormEvent, useMemo, useState } from "react";
import {
  AuthProvider,
  createUserWithEmailAndPassword,
  getAdditionalUserInfo,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
} from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db, googleProvider, microsoftProvider } from "../lib/firebase";
import {
  getPlanOption,
  getProductivitySuiteOption,
  PRODUCTIVITY_SUITE_OPTIONS,
  ProductivitySuite,
  readOnboardingContext,
  WORKSPACE_PLAN_OPTIONS,
  WorkspacePlan,
} from "../lib/onboarding";

type AuthMode = "signin" | "signup";

const redirectTarget = "https://sil.encompax.io";
const defaultWorkspaceId = "workspace-shipment-operations";
const termsUrl = "https://www.encompax.com/terms.html";
const privacyUrl = "https://www.encompax.com/privacy.html";
const faqUrl = "https://www.encompax.com/faq.html";
const helpUrl = "https://www.encompax.com/help.html";

const friendlyAuthError = (authError: unknown) => {
  if (!authError || typeof authError !== "object" || !("code" in authError)) {
    const rawMessage = authError instanceof Error ? authError.message : "Authentication failed.";
    if (/AADSTS7000215|invalid_client|client secret/i.test(rawMessage)) {
      return "Microsoft sign-in is reaching Entra, but Firebase is rejecting the app secret. In Azure, copy the client secret Value, not the Secret ID, then update the Microsoft provider in Firebase Authentication.";
    }
    return rawMessage;
  }

  const code = String(authError.code);
  const rawMessage = authError instanceof Error ? authError.message : "Authentication failed.";

  if (code === "auth/unauthorized-domain") {
    return "This sign-in domain still needs to be authorized in Firebase Authentication.";
  }

  if (code === "auth/operation-not-allowed") {
    return "This sign-in provider is not enabled yet in Firebase Authentication.";
  }

  if (code === "auth/popup-closed-by-user") {
    return "The sign-in window was closed before completion.";
  }

  if (/AADSTS7000215|invalid_client|client secret/i.test(rawMessage)) {
    return "Microsoft sign-in is reaching Entra, but Firebase is rejecting the app secret. In Azure, copy the client secret Value, not the Secret ID, then update the Microsoft provider in Firebase Authentication.";
  }

  return rawMessage;
};

const AuthGate: React.FC = () => {
  const onboarding = useMemo(() => readOnboardingContext(), []);
  const [mode, setMode] = useState<AuthMode>(onboarding.intent === "signin" ? "signin" : "signup");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [organization, setOrganization] = useState("");
  const [plan, setPlan] = useState<WorkspacePlan>(onboarding.plan);
  const [productivitySuite, setProductivitySuite] = useState<ProductivitySuite>(onboarding.suite);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selectedPlan = getPlanOption(plan);
  const selectedSuite = getProductivitySuiteOption(productivitySuite);

  const title = useMemo(
    () => (mode === "signup" ? "Create Shipment Intelligence Access" : "Sign In to Shipment Intelligence"),
    [mode]
  );

  async function persistProfile(authMethod: string, isNewAccount: boolean) {
    if (!auth.currentUser) return;

    const userDoc: Record<string, unknown> = {
      uid: auth.currentUser.uid,
      email: auth.currentUser.email,
      displayName: auth.currentUser.displayName || displayName || null,
      organization: organization || null,
      workspaceId: defaultWorkspaceId,
      workspaceName: organization ? `${organization} Shipment Operations` : "Shipment Operations",
      preferredModule: "sil",
      requestedModules: [onboarding.module || "sil"],
      moduleAccess: {
        sil: isNewAccount ? "pending" : "active",
      },
      signupSource: onboarding.source,
      authIntent: mode,
      authMethod,
      legalAcknowledgements: {
        termsAccepted: mode === "signup" ? acceptedTerms : true,
        privacyAccepted: mode === "signup" ? acceptedPrivacy : true,
        acceptedAt: serverTimestamp(),
      },
      intendedPlan: plan,
      productivitySuite,
      recommendedImportMode: selectedSuite.recommendedImportMode,
      onboardingStatus: "captured",
      billingState: "pricing-pending",
      usageGuardrails: {
        monthlyTokenGuardrail: selectedPlan.tokenGuardrail,
        monthlySpendReviewRequired: true,
      },
      adaptiveExperience: {
        uxLearningEnabled: true,
        startingProfile: selectedSuite.value,
        nextStep: "connect-first-datasource",
      },
      lastLoginAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    if (isNewAccount) {
      userDoc.createdAt = serverTimestamp();
    }

    await setDoc(doc(db, "users", auth.currentUser.uid), userDoc, { merge: true });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      if (mode === "signup" && (!acceptedTerms || !acceptedPrivacy)) {
        throw new Error("Please acknowledge the Terms of Use and Data Privacy Notice before creating an account.");
      }

      if (mode === "signup") {
        const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
        if (displayName.trim()) {
          await updateProfile(credential.user, { displayName: displayName.trim() });
        }
        await persistProfile("password", true);
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
        await persistProfile("password", false);
      }
    } catch (authError) {
      setError(friendlyAuthError(authError));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleProviderSignIn(provider: AuthProvider, authMethod: string) {
    setSubmitting(true);
    setError(null);

    try {
      const credential = await signInWithPopup(auth, provider);
      const isNewAccount = getAdditionalUserInfo(credential)?.isNewUser ?? false;
      await persistProfile(authMethod, isNewAccount);
    } catch (authError) {
      setError(friendlyAuthError(authError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-shell">
      <section className="auth-card">
        <div className="auth-copy">
          <p className="auth-eyebrow">SIL | Encompax</p>
          <h1>{title}</h1>
          <p>
            Create your operator access for Shipment Intelligence Layer. This is the first governed module rollout
            under Encompax and the starting point for customer workspace access.
          </p>
          <div className="auth-route">
            <span>Access path</span>
            <strong>Encompax {"->"} SIL {"->"} governed workspace {"->"} module operations</strong>
          </div>
          <div className="auth-route">
            <span>Launch source</span>
            <strong>{onboarding.source}</strong>
          </div>
          <div className="auth-route">
            <span>Current module</span>
            <strong>{redirectTarget}</strong>
          </div>
        </div>

        <div className="auth-panel">
          <div className="auth-tabs">
            <button
              type="button"
              className={mode === "signup" ? "active" : ""}
              onClick={() => setMode("signup")}
            >
              Create account
            </button>
            <button
              type="button"
              className={mode === "signin" ? "active" : ""}
              onClick={() => setMode("signin")}
            >
              Sign in
            </button>
          </div>

          <div className="auth-helper">
            <strong>{selectedPlan.label}</strong>
            <span>{selectedPlan.description}</span>
          </div>

          <div className="auth-provider-grid">
            <button
              type="button"
              className="auth-provider-button"
              disabled={submitting}
              onClick={() => void handleProviderSignIn(googleProvider, "google")}
            >
              Continue with Google
            </button>
            <button
              type="button"
              className="auth-provider-button"
              disabled={submitting}
              onClick={() => void handleProviderSignIn(microsoftProvider, "microsoft")}
            >
              Continue with Microsoft
            </button>
          </div>

          <div className="auth-divider">
            <span>or continue with email</span>
          </div>

          <form className="auth-form" onSubmit={handleSubmit}>
            {mode === "signup" ? (
              <>
                <label>
                  Display name
                  <input
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    placeholder="Brian Richardson"
                  />
                </label>
                <label>
                  Organization
                  <input
                    value={organization}
                    onChange={(event) => setOrganization(event.target.value)}
                    placeholder="Example Organization"
                  />
                </label>
                <label>
                  Intended workspace plan
                  <select value={plan} onChange={(event) => setPlan(event.target.value as WorkspacePlan)}>
                    {WORKSPACE_PLAN_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Primary spreadsheet ecosystem
                  <select
                    value={productivitySuite}
                    onChange={(event) => setProductivitySuite(event.target.value as ProductivitySuite)}
                  >
                    {PRODUCTIVITY_SUITE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="auth-checkbox">
                  <input
                    type="checkbox"
                    checked={acceptedTerms}
                    onChange={(event) => setAcceptedTerms(event.target.checked)}
                    required
                  />
                  <span>
                    I agree to the <a href={termsUrl} target="_blank" rel="noreferrer">Terms of Use</a>.
                  </span>
                </label>
                <label className="auth-checkbox">
                  <input
                    type="checkbox"
                    checked={acceptedPrivacy}
                    onChange={(event) => setAcceptedPrivacy(event.target.checked)}
                    required
                  />
                  <span>
                    I acknowledge the <a href={privacyUrl} target="_blank" rel="noreferrer">Data Privacy Notice</a>.
                  </span>
                </label>
              </>
            ) : null}

            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="operator@company.com"
                required
              />
            </label>

            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Minimum 6 characters"
                minLength={6}
                required
              />
            </label>

            {mode === "signup" ? (
              <p className="auth-inline-note">
                {selectedSuite.description} Billing, usage ceilings, and agent seats remain gated until the account
                completes workspace setup.
              </p>
            ) : null}

            {error ? <p className="auth-error">{error}</p> : null}

            <button type="submit" className="auth-submit" disabled={submitting}>
              {submitting ? "Working..." : mode === "signup" ? "Create SIL account" : "Open SIL workspace"}
            </button>
          </form>

          <p className="auth-note">
            Encompax remains the governance authority. SIL captures plan intent, sign-in provider, and import
            preference now so pricing and adaptive workspace behavior can be added cleanly later.
          </p>
          <p className="auth-note auth-note-links">
            <a href={termsUrl} target="_blank" rel="noreferrer">Terms</a>
            <span>•</span>
            <a href={privacyUrl} target="_blank" rel="noreferrer">Privacy</a>
            <span>•</span>
            <a href={faqUrl} target="_blank" rel="noreferrer">FAQ</a>
            <span>•</span>
            <a href={helpUrl} target="_blank" rel="noreferrer">Help</a>
          </p>
        </div>
      </section>
    </div>
  );
};

export default AuthGate;
