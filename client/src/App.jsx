import { useEffect, useState } from "react";
import LanguageTabs from "./components/LanguageTabs";
import UpdateBanner from "./components/UpdateBanner";
import ProfileAccess from "./components/ProfileAccess";
import { profileService } from "./services/profiles";
import { localStorageService } from "./services/localStorage";
import { workspaceSync } from "./services/workspaceSync";

function App() {
  const [profileState, setProfileState] = useState(() => ({ loading: profileService.isConfigured(), user: null }));
  const activeUserId = profileState.user?.id;

  useEffect(() => {
    if (!profileService.isConfigured()) return;
    profileService.getCurrentUser()
      .then(async (user) => {
        if (user) {
          localStorageService.setActiveProfile(user.id, false, user.effectivePlan);
          await workspaceSync.start(user.id);
        }
        setProfileState({ loading: false, user });
      })
      .catch(() => setProfileState({ loading: false, user: null }));
  }, []);

  useEffect(() => {
    const syncWhenOnline = () => workspaceSync.syncNow();
    window.addEventListener("online", syncWhenOnline);
    return () => window.removeEventListener("online", syncWhenOnline);
  }, []);

  useEffect(() => {
    if (!activeUserId) return undefined;

    const heartbeat = () => {
      if (document.visibilityState === "visible") {
        profileService.touchLastSeen().catch(() => {});
      }
    };

    heartbeat();
    const interval = window.setInterval(heartbeat, 30_000);
    window.addEventListener("visibilitychange", heartbeat);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("visibilitychange", heartbeat);
    };
  }, [activeUserId]);

  useEffect(() => {
    const expiresAt = profileState.user?.freeTrialExpiresAt;
    if (!expiresAt || profileState.user?.effectivePlan !== "trial") return undefined;
    const delay = new Date(expiresAt).getTime() - Date.now();
    if (delay <= 0) return undefined;
    const timeout = window.setTimeout(() => {
      localStorageService.setActiveProfile(profileState.user.id, false, "free");
      setProfileState((current) => current.user ? { ...current, user: { ...current.user, effectivePlan: "free" } } : current);
    }, delay);
    return () => window.clearTimeout(timeout);
  }, [profileState.user?.id, profileState.user?.effectivePlan, profileState.user?.freeTrialExpiresAt]);

  if (!profileService.isConfigured()) {
    return <div className="min-h-screen bg-blue-100 flex items-center justify-center p-4"><div className="max-w-lg rounded-xl bg-white p-8 shadow-lg"><h1 className="text-xl font-bold">Supabase setup required</h1><p className="mt-3 text-sm text-gray-600">{profileService.configurationError}</p><p className="mt-2 text-sm text-gray-600">Then run <code className="rounded bg-gray-100 px-1">supabase/schema.sql</code> in the Supabase SQL Editor.</p></div></div>;
  }

  if (profileState.loading) {
    return <div className="min-h-screen bg-blue-100 flex items-center justify-center text-gray-600">Loading profile...</div>;
  }

  if (!profileState.user) {
    return <ProfileAccess onSignedIn={async (user) => {
      localStorageService.setActiveProfile(user.id, false, user.effectivePlan);
      await workspaceSync.start(user.id);
      setProfileState({ loading: false, user });
    }} />;
  }

  return (
    <div className="min-h-screen bg-blue-100">
      <LanguageTabs
        user={profileState.user}
        onUserUpdated={(user) => {
          localStorageService.setActiveProfile(user.id, false, user.effectivePlan);
          setProfileState({ loading: false, user });
        }}
        onSignOut={() => { workspaceSync.stop(); setProfileState({ loading: false, user: null }); }}
      />
      <UpdateBanner />
    </div>
  );
}

export default App;
