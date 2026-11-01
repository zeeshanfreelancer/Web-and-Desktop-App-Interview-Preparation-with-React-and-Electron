import { useEffect, useState } from "react";
import LanguageTabs from "./components/LanguageTabs";
import UpdateBanner from "./components/UpdateBanner";
import LicenseScreen from "./components/LicenseScreen";
import ProfileAccess from "./components/ProfileAccess";
import { getLicenseStatus, isElectron } from "./utils/electron";
import { profileService } from "./services/profiles";
import { localStorageService } from "./services/localStorage";

function App() {
  const [licenseState, setLicenseState] = useState(() => isElectron()
    ? { loading: true, status: "licensed" }
    : { loading: false, status: "licensed" });
  const [profileState, setProfileState] = useState(() => ({ loading: profileService.isConfigured(), user: null }));

  useEffect(() => {
    if (!profileService.isConfigured()) return;
    profileService.getCurrentUser()
      .then((user) => setProfileState({ loading: false, user }))
      .catch(() => setProfileState({ loading: false, user: null }));
  }, []);

  useEffect(() => {
    if (!isElectron()) return;

    getLicenseStatus()
      .then((result) => {
        setLicenseState({ loading: false, ...result });
      })
      .catch(() => {
        setLicenseState({ loading: false, status: "unlicensed" });
      });
  }, []);

  useEffect(() => {
    if (!isElectron() || licenseState.status !== "licensed") return undefined;

    const checkExpiry = () => {
      getLicenseStatus().then((result) => {
        if (result.status !== "licensed") {
          setLicenseState({ loading: false, ...result });
        }
      });
    };

    const interval = setInterval(checkExpiry, 60_000);
    return () => clearInterval(interval);
  }, [licenseState.status]);

  if (licenseState.loading) {
    return (
      <>
        <div className="min-h-screen bg-blue-100 flex items-center justify-center">
          <p className="text-gray-600">Loading...</p>
        </div>
        <UpdateBanner />
      </>
    );
  }

  if (licenseState.status !== "licensed") {
    return (
      <>
        <LicenseScreen
          status={licenseState.status}
          expiresLabel={licenseState.expiresLabel}
          onActivated={() => {
            getLicenseStatus().then((result) => {
              setLicenseState({ loading: false, ...result });
            });
          }}
        />
        <UpdateBanner />
      </>
    );
  }

  if (!profileService.isConfigured()) {
    return <div className="min-h-screen bg-blue-100 flex items-center justify-center p-4"><div className="max-w-lg rounded-xl bg-white p-8 shadow-lg"><h1 className="text-xl font-bold">Supabase setup required</h1><p className="mt-3 text-sm text-gray-600">{profileService.configurationError}</p><p className="mt-2 text-sm text-gray-600">Then run <code className="rounded bg-gray-100 px-1">supabase/schema.sql</code> in the Supabase SQL Editor.</p></div></div>;
  }

  if (profileState.loading) {
    return <div className="min-h-screen bg-blue-100 flex items-center justify-center text-gray-600">Loading profile...</div>;
  }

  if (!profileState.user) {
    return <ProfileAccess onSignedIn={(user) => {
      localStorageService.setActiveProfile(user.id);
      setProfileState({ loading: false, user });
    }} />;
  }

  return (
    <div className="min-h-screen bg-blue-100">
      <LanguageTabs
        licenseState={licenseState}
        user={profileState.user}
        onSignOut={() => setProfileState({ loading: false, user: null })}
      />
      <UpdateBanner />
    </div>
  );
}

export default App;
