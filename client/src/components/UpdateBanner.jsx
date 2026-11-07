// Electron-only update notification and download/install controls.
import { useEffect, useState } from "react";
import { FiDownload, FiRefreshCw, FiX } from "react-icons/fi";
import {
  isElectron,
  checkForUpdates,
  downloadUpdate,
  installUpdate,
  onUpdateAvailable,
  onUpdateDownloadProgress,
  onUpdateDownloaded,
  onUpdateError
} from "../utils/electron";

export default function UpdateBanner() {
  const [visible, setVisible] = useState(false);
  const [version, setVersion] = useState("");
  const [status, setStatus] = useState("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isElectron()) return;

    const unsubAvailable = onUpdateAvailable((info) => {
      setVersion(info?.version ?? "");
      setStatus("available");
      setVisible(true);
      setError("");
    });

    const unsubProgress = onUpdateDownloadProgress((info) => {
      setStatus("downloading");
      setVisible(true);
      setProgress(Math.round(info?.percent ?? 0));
    });

    const unsubDownloaded = onUpdateDownloaded((info) => {
      setVersion(info?.version ?? version);
      setStatus("downloaded");
      setVisible(true);
      setProgress(100);
    });

    const unsubError = onUpdateError((message) => {
      console.warn("Update error:", message);
    });

    checkForUpdates();

    return () => {
      unsubAvailable?.();
      unsubProgress?.();
      unsubDownloaded?.();
      unsubError?.();
    };
  }, []);

  if (!isElectron() || !visible) return null;

  const handleDownload = async () => {
    setError("");
    setStatus("downloading");
    try {
      await downloadUpdate();
    } catch (err) {
      setError(err?.message || "Failed to download update");
      setStatus("error");
    }
  };

  const handleInstall = () => {
    installUpdate();
  };

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[min(92vw,520px)]">
      <div className="bg-white border border-purple-200 shadow-xl rounded-xl px-4 py-3 flex items-center gap-3">
        <div className="flex-1 min-w-0">
          {status === "available" && (
            <p className="text-sm text-gray-800">
              Update available{version ? `: v${version}` : ""}. Download the latest version.
            </p>
          )}
          {status === "downloading" && (
            <div>
              <p className="text-sm text-gray-800 mb-1">Downloading update… {progress}%</p>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-purple-600 transition-all duration-200"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}
          {status === "downloaded" && (
            <p className="text-sm text-gray-800">
              Update ready{version ? ` (v${version})` : ""}. Restart to install.
            </p>
          )}
          {status === "error" && (
            <p className="text-sm text-red-600">{error || "Update check failed."}</p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {status === "available" && (
            <button
              onClick={handleDownload}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 cursor-pointer"
            >
              <FiDownload size={14} /> Update
            </button>
          )}
          {status === "downloaded" && (
            <button
              onClick={handleInstall}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 cursor-pointer"
            >
              <FiRefreshCw size={14} /> Restart
            </button>
          )}
          {status === "error" && (
            <button
              onClick={() => {
                setError("");
                setStatus("idle");
                checkForUpdates();
              }}
              className="px-3 py-1.5 bg-gray-100 text-gray-700 text-sm rounded-lg hover:bg-gray-200 cursor-pointer"
            >
              Retry
            </button>
          )}
          <button
            onClick={() => setVisible(false)}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 cursor-pointer"
            title="Dismiss"
          >
            <FiX size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
