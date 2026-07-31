import React, { useEffect, useState } from "react";
import { User, onAuthStateChanged, signOut } from "firebase/auth";
import { auth, consumeEncompaxLaunchCode } from "./lib/firebase";
import Dashboard from "./pages/Dashboard";
import AuthGate from "./components/AuthGate";
import PostSignupSetup from "./components/PostSignupSetup";
import { getSilUserProfile, SilUserProfile } from "./lib/userProfile";

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
    return (
      <div className="auth-shell">
        <section className="auth-card auth-loading-card">
          <p className="auth-eyebrow">SIL | Encompax</p>
          <h1>Preparing workspace access</h1>
          <p>Checking your session and loading the authenticated module shell.</p>
        </section>
      </div>
    );
  }

  if (!user) {
    return <AuthGate />;
  }

  if (!profile?.setupCompleted) {
    return <PostSignupSetup profile={profile} user={user} onComplete={setProfile} />;
  }

  return (
    <Dashboard
      currentUserName={user.displayName || user.email || "Operator"}
      currentUserEmail={user.email || ""}
      workspaceName={profile?.workspaceName || "Shipment Operations"}
      organizationName={profile?.organization || profile?.workspaceName || "Shipment Operations"}
      onSignOut={() => signOut(auth)}
    />
  );
};

export default App;
