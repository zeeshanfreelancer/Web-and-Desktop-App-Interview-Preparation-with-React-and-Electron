// Root application component: restores authentication, starts workspace sync, and routes to the main workspace.
import { useEffect, useState } from "react";
import LanguageTabs from "./components/LanguageTabs";
import UpdateBanner from "./components/UpdateBanner";
import ProfileAccess from "./components/ProfileAccess";
import { profileService } from "./services/profiles";
import { localStorageService } from "./services/localStorage";
import { workspaceSync } from "./services/workspaceSync";

function App() {
  const [profileState, setProfileState] = useState(() => ({ loading: profileService.isConfigured(), user: null }));
  const [restorePrompt, setRestorePrompt] = useState(null);
  const [restoringWorkspace, setRestoringWorkspace] = useState(false);
  const [restoreError, setRestoreError] = useState("");
  const [workspaceRevision, setWorkspaceRevision] = useState(0);
  const activeUserId = profileState.user?.id;

  const startWorkspace = async (user) => {
    localStorageService.setActiveProfile(user.id, false, user.effectivePlan);
    const result = await workspaceSync.start(user.id);
    setRestorePrompt(result.needsRestore ? result : null);
  };

  useEffect(() => {
    if (!profileService.isConfigured()) return;
    profileService.getCurrentUser()
      .then(async (user) => {
        if (user) {
          await startWorkspace(user);
        }
        setProfileState({ loading: false, user });
      })
      .catch(() => setProfileState({ loading: false, user: null }));
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
      await startWorkspace(user);
      setProfileState({ loading: false, user });
    }} />;
  }

  return (
    <div className="min-h-screen bg-blue-100">
      <LanguageTabs
        key={workspaceRevision}
        user={profileState.user}
        onUserUpdated={(user) => {
          localStorageService.setActiveProfile(user.id, false, user.effectivePlan);
          setProfileState({ loading: false, user });
        }}
        onSignOut={() => { workspaceSync.stop(); setProfileState({ loading: false, user: null }); }}
      />
      <UpdateBanner />
      {restorePrompt && <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/55 p-4"><section className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"><h2 className="text-xl font-bold text-gray-900">Load your saved workspace?</h2><p className="mt-2 text-sm text-gray-600">This looks like a new device. We found interview questions and languages saved to your account{restorePrompt.cloudUpdatedAt ? ` on ${new Date(restorePrompt.cloudUpdatedAt).toLocaleString()}` : ""}.</p>{restoreError && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{restoreError}</p>}{restoringWorkspace && <div className="mt-4"><div className="h-2 overflow-hidden rounded-full bg-indigo-100"><div className="h-full w-2/3 animate-pulse bg-indigo-600" /></div><p className="mt-2 text-sm text-indigo-700">Syncing your saved data…</p></div>}<div className="mt-6 flex flex-wrap justify-end gap-3"><button type="button" disabled={restoringWorkspace} onClick={() => setRestorePrompt(null)} className="rounded-lg border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Not now</button><button type="button" disabled={restoringWorkspace} onClick={async () => { setRestoreError(""); setRestoringWorkspace(true); try { await workspaceSync.restoreFromCloud(); setWorkspaceRevision((current) => current + 1); setRestorePrompt(null); } catch (error) { setRestoreError(error.message || "Could not load your saved workspace."); } finally { setRestoringWorkspace(false); } }} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">{restoringWorkspace ? "Syncing…" : "Sync saved data"}</button></div></section></div>}
    </div>
  );
}

export default App;
