import React, { Suspense, lazy, useEffect, useState } from "react";
import { User, onAuthStateChanged, signOut } from "firebase/auth";
import { auth, consumeEncompaxLaunchCode } from "./lib/firebase";
import AuthGate from "./components/AuthGate";
import { getSilUserProfile, SilUserProfile } from "./lib/userProfile";
import EncompaxLoader from "./components/EncompaxLoader";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const PostSignupSetup = lazy(() => import("./components/PostSignupSetup"));
const PartnerWorkspace = lazy(() => import("./pages/PartnerWorkspace"));

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<SilUserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribe = () => {};
    let active = true;

    const subscribe = () => {
      unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
        if (!active) return;
      setUser(nextUser);

      if (!nextUser) {
        setProfile(null);
        setLoading(false);
        return;
      }

      try {
        const nextProfile = await getSilUserProfile(nextUser.uid);
        setProfile(nextProfile);
      } catch (error) {
        console.error("Failed to load SIL user profile", error);
        setProfile(null);
      } finally {
        setLoading(false);
      }
      });
    };

    void consumeEncompaxLaunchCode()
      .catch((error) => console.error("Encompax module launch failed", error))
      .finally(() => {
        if (active) subscribe();
      });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  if (loading) {
    return <EncompaxLoader fullScreen label="Preparing SIL" detail="Connecting your workspace" />;
  }

  if (!user) {
    return <AuthGate />;
  }

  if (!profile?.setupCompleted) {
    return <Suspense fallback={<EncompaxLoader fullScreen label="Preparing setup" detail="Loading your organization" />}><PostSignupSetup profile={profile} user={user} onComplete={setProfile} /></Suspense>;
  }

  if (profile.userType === "partner_user") {
    return <Suspense fallback={<EncompaxLoader fullScreen label="Opening partner workspace" detail="Loading authorized work" />}>
      <PartnerWorkspace
        partnerName={profile.organization || "Partner organization"}
        clientName={profile.partnerRelationship?.clientOrganizationName || "Client organization"}
        currentUserName={user.displayName || user.email || "Partner operator"}
        currentUserEmail={user.email || ""}
        accessScopes={profile.partnerRelationship?.accessScopes || []}
        onSignOut={() => signOut(auth)}
      />
    </Suspense>;
  }

  return <Suspense fallback={<EncompaxLoader fullScreen label="Opening SIL" detail="Loading your operations workspace" />}>
    <Dashboard
      currentUserName={user.displayName || user.email || "Operator"}
      currentUserEmail={user.email || ""}
      workspaceName={profile?.workspaceName || "Shipment Operations"}
      organizationName={profile?.organization || profile?.workspaceName || "Shipment Operations"}
      onSignOut={() => signOut(auth)}
    />
  </Suspense>;
};

export default App;
