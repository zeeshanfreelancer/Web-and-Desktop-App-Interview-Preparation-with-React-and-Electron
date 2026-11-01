import { useEffect, useState } from "react";
import LanguageTabs from "./components/LanguageTabs";
import UpdateBanner from "./components/UpdateBanner";
import LicenseScreen from "./components/LicenseScreen";
import ProfileAccess from "./components/ProfileAccess";
import { getLicenseStatus, isElectron } from "./utils/electron";
import { profileService } from "./services/profiles";
import { localStorageService } from "./services/localStorage";

function App() {
  const [licenseState, setLicenseState] = useState({ loading: true, status: "licensed" });
  const [profileState, setProfileState] = useState({ loading: true, user: null, needsSetup: false });

  useEffect(() => {
    setProfileState({ loading: false, user: null, needsSetup: profileService.getProfiles().length === 0 });
  }, []);

  useEffect(() => {
    if (!isElectron()) {
      setLicenseState({ loading: false, status: "licensed" });
      return;
    }

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

  if (profileState.loading) {
    return <div className="min-h-screen bg-blue-100 flex items-center justify-center text-gray-600">Loading profile...</div>;
  }

  if (!profileState.user) {
    return <ProfileAccess needsSetup={profileState.needsSetup} onSignedIn={(user, isNewAdmin) => {
      localStorageService.setActiveProfile(user.id, isNewAdmin);
      setProfileState({ loading: false, user, needsSetup: false });
    }} />;
  }

  return (
    <div className="min-h-screen bg-blue-100">
      <LanguageTabs
        licenseState={licenseState}
        user={profileState.user}
        onUserUpdated={(user) => setProfileState((state) => ({ ...state, user }))}
        onSignOut={() => setProfileState((state) => ({ ...state, user: null }))}
      />
      <UpdateBanner />
    </div>
  );
}

export default App;
