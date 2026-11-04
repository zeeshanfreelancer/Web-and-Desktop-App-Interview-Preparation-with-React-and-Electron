import { useState, useEffect, useRef } from "react";
import {
  FiSearch,
  FiEdit2,
  FiTrash2,
  FiCheck,
  FiX,
  FiPlus,
  FiSettings,
  FiUpload,
  FiMenu,
  FiClock,
  FiMessageCircle
} from "react-icons/fi";
import QuestionBoard from "./QuestionBoard";
import AccountDashboard from "./AccountDashboard";
import ChatPage from "./ChatPage";
import { localStorageService } from "../services/localStorage";
import { exportToPDF, exportToWord, exportToJSON, importFromJSON, importFromJSONString } from "../utils/exportImport";
import { isElectron, openJsonFile } from "../utils/electron";

const calculateRemainingTime = (expiresAt, now) => {
  if (!expiresAt) return null;

  const expiry = new Date(expiresAt);
  if (Number.isNaN(expiry.getTime())) return null;

  let remainingMs = expiry.getTime() - now;
  if (remainingMs <= 0) {
    return { expired: true, years: 0, months: 0, days: 0, hours: 0, minutes: 0 };
  }

  const cursor = new Date(now);
  let years = 0;
  let months = 0;

  while (true) {
    const next = new Date(cursor);
    next.setFullYear(next.getFullYear() + 1);
    if (next > expiry) break;
    cursor.setFullYear(cursor.getFullYear() + 1);
    years += 1;
  }

  while (true) {
    const next = new Date(cursor);
    next.setMonth(next.getMonth() + 1);
    if (next > expiry) break;
    cursor.setMonth(cursor.getMonth() + 1);
    months += 1;
  }

  remainingMs = expiry.getTime() - cursor.getTime();
  const days = Math.floor(remainingMs / 86_400_000);
  remainingMs -= days * 86_400_000;
  const hours = Math.floor(remainingMs / 3_600_000);
  remainingMs -= hours * 3_600_000;
  const minutes = Math.floor(remainingMs / 60_000);

  return { expired: false, years, months, days, hours, minutes };
};

function LanguageTabs({ user, onUserUpdated, onSignOut }) {
  const [languages, setLanguages] = useState(() => localStorageService.getLanguages());
  const [activeLang, setActiveLang] = useState(() => {
    const initialLanguages = localStorageService.getLanguages();
    return initialLanguages.length > 0 ? initialLanguages[0] : "";
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [searchVisible, setSearchVisible] = useState(false);
  const [newLanguage, setNewLanguage] = useState("");
  const [editingLang, setEditingLang] = useState(null);
  const [editingValue, setEditingValue] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [adminSettingsView, setAdminSettingsView] = useState("dashboard");
  const [questionModalOpen, setQuestionModalOpen] = useState(false);
  const [editorSessionKey, setEditorSessionKey] = useState(0);
  const [selectedQuestionId, setSelectedQuestionId] = useState(null);
  const [editingQuestionText, setEditingQuestionText] = useState("");
  const [editingAnswerText, setEditingAnswerText] = useState("");
  const [exportOptionsOpen, setExportOptionsOpen] = useState(false);
  const [selectedExportFormat, setSelectedExportFormat] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const modalRef = useRef(null);
  const fileInputRef = useRef(null);
  const tabsContainerRef = useRef(null);
  const [draggedLangIndex, setDraggedLangIndex] = useState(null);
  const [dragOverLangIndex, setDragOverLangIndex] = useState(null);

  const canReorderLanguages = languages.length > 1 && editingLang === null;
  const licenseExpiresAt = user?.effectivePlan === "trial" ? user?.freeTrialExpiresAt : user?.subscriptionExpiresAt;
  const remainingLicenseTime = calculateRemainingTime(licenseExpiresAt, currentTime);

  const addLanguage = () => {
    if (!newLanguage.trim() || languages.includes(newLanguage.trim())) return;
    if (!localStorageService.canAddLanguage()) {
      const limits = localStorageService.getLimits();
      alert(`Free accounts can add up to ${limits.languages} languages. Upgrade your plan for unlimited languages.`);
      return;
    }

    const newLanguages = [...languages, newLanguage.trim()];
    setLanguages(newLanguages);
    localStorageService.saveLanguages(newLanguages);
    
    // Auto-select first language if none selected
    if (!activeLang) {
      setActiveLang(newLanguage.trim());
    }
    
    setNewLanguage("");
  };

  const deleteLanguage = (langToDelete) => {
    try {
      const newLanguages = localStorageService.deleteLanguage(langToDelete);
      setLanguages(newLanguages);

      if (activeLang === langToDelete) {
        setActiveLang(newLanguages.length > 0 ? newLanguages[0] : "");
      }

      setSearchTerm("");
    } catch (error) {
      console.error('Failed to delete language:', error);
      alert('Failed to delete language');
    }
  };

  const startEditing = (lang) => {
    setEditingLang(lang);
    setEditingValue(lang);
  };

  const saveEdit = () => {
    const trimmed = editingValue.trim();
    if (!trimmed || (trimmed !== editingLang && languages.includes(trimmed))) {
      setEditingLang(null);
      setEditingValue("");
      return;
    }

    try {
      if (trimmed !== editingLang) {
        localStorageService.renameLanguage(editingLang, trimmed);
        const newLanguages = languages.map(lang =>
          lang === editingLang ? trimmed : lang
        );
        setLanguages(newLanguages);

        if (activeLang === editingLang) {
          setActiveLang(trimmed);
        }
      }
    } catch (error) {
      alert(error.message || 'Failed to rename language');
      return;
    }

    setEditingLang(null);
    setEditingValue("");
  };

  const cancelEdit = () => {
    setEditingLang(null);
    setEditingValue("");
  };

  const openQuestionModal = (questionId) => {
    setEditorSessionKey((key) => key + 1);
    setSelectedQuestionId(questionId);
    setQuestionModalOpen(true);

    // Set initial values
    if (questionId) {
      // This will be handled by QuestionBoard since it has the questions data
    } else {
      // Adding new question
      setEditingQuestionText("");
      setEditingAnswerText("");
    }
  };

  const closeQuestionModal = () => {
    setQuestionModalOpen(false);
    setSelectedQuestionId(null);
    setEditingQuestionText("");
    setEditingAnswerText("");
  };

  const handleExport = (format) => {
    setSelectedExportFormat(format);
    setExportOptionsOpen(true);
  };

  const executeExport = async (scope, format) => {
    let questionsToExport = [];
    let exportName = '';
    let allQuestions = {};
    if (scope === 'current') {
      questionsToExport = questions;
      exportName = activeLang;
    } else {
      for (const lang of languages) {
        try {
          const langQuestions = localStorageService.getQuestions(lang);
          if (langQuestions.length > 0) {
            allQuestions[lang] = langQuestions;
          }
        } catch (err) {
          console.error(`Failed to load questions for ${lang}:`, err);
        }
      }
      
      // Flatten all questions
      questionsToExport = Object.entries(allQuestions).flatMap(([lang, qs]) => 
        qs.map(q => ({ ...q, language: lang }))
      );
      exportName = 'All_Languages';
    }

    if (questionsToExport.length === 0) {
      alert('No questions to export');
      setExportOptionsOpen(false);
      return;
    }

    switch (format) {
      case 'pdf':
        exportToPDF(questionsToExport, exportName, scope === 'all');
        break;
      case 'word':
        exportToWord(questionsToExport, exportName, scope === 'all');
        break;
      case 'json':
        if (scope === 'all') {
          await exportToJSON(allQuestions, exportName, true);
        } else {
          await exportToJSON(questionsToExport, exportName);
        }
        break;
    }
    setExportOptionsOpen(false);
  };

  const applyImport = (parsed) => {
    const targetLanguage =
      parsed.type === 'single'
        ? (parsed.language && languages.includes(parsed.language) ? parsed.language : activeLang)
        : null;

    if (parsed.type === 'single' && !targetLanguage) {
      throw new Error('Add or select a language before importing');
    }

    const { totalImported, languages: updatedLanguages } = localStorageService.importQuestions({
      ...parsed,
      targetLanguage
    });

    setLanguages(updatedLanguages);
    if (updatedLanguages.length > 0 && !updatedLanguages.includes(activeLang)) {
      setActiveLang(updatedLanguages[0]);
    }

    const reloadLang = activeLang && updatedLanguages.includes(activeLang)
      ? activeLang
      : updatedLanguages[0];
    if (reloadLang) {
      setQuestions(localStorageService.getQuestions(reloadLang));
    }

    return totalImported;
  };

  const handleImport = async () => {
    if (isElectron()) {
      try {
        const result = await openJsonFile();
        if (!result) return;

        const parsed = importFromJSONString(result.content);
        const totalImported = applyImport(parsed);
        alert(`Successfully imported ${totalImported} question${totalImported === 1 ? '' : 's'}`);
      } catch (error) {
        alert(`Import failed: ${error.message}`);
      }
      return;
    }

    fileInputRef.current?.click();
  };

  const handleFileImport = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const parsed = await importFromJSON(file);
      const totalImported = applyImport(parsed);
      alert(`Successfully imported ${totalImported} question${totalImported === 1 ? '' : 's'}`);
    } catch (error) {
      alert(`Import failed: ${error.message}`);
    }

    event.target.value = '';
  };

  const openModal = () => {
    setCurrentTime(Date.now());
    setAdminSettingsView("dashboard");
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingLang(null);
    setEditingValue("");
    setExportOptionsOpen(false);
    setSelectedExportFormat(null);
    setDraggedLangIndex(null);
    setDragOverLangIndex(null);
  };

  const handleLanguageDragStart = (index) => {
    if (!canReorderLanguages) return;
    setDraggedLangIndex(index);
  };

  const handleLanguageDragEnd = () => {
    setDraggedLangIndex(null);
    setDragOverLangIndex(null);
  };

  const handleLanguageDragOver = (event, index) => {
    if (!canReorderLanguages || draggedLangIndex === null) return;
    event.preventDefault();
    setDragOverLangIndex(index);
  };

  const handleLanguageDrop = (event, dropIndex) => {
    event.preventDefault();
    if (!canReorderLanguages || draggedLangIndex === null || draggedLangIndex === dropIndex) {
      handleLanguageDragEnd();
      return;
    }

    try {
      const reordered = localStorageService.reorderLanguages(draggedLangIndex, dropIndex);
      setLanguages(reordered);
    } catch (error) {
      console.error('Failed to reorder languages:', error);
    }

    handleLanguageDragEnd();
  };

  // Close modal when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (modalRef.current && !modalRef.current.contains(event.target)) {
        closeModal();
      }
    };

    if (modalOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [modalOpen]);

  useEffect(() => {
    if (!activeLang || !tabsContainerRef.current) return;
    const activeTab = tabsContainerRef.current.querySelector(
      `[data-lang="${CSS.escape(activeLang)}"]`
    );
    activeTab?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [activeLang, languages]);

  useEffect(() => {
    if (!modalOpen || !licenseExpiresAt) return undefined;

    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 60_000);

    return () => clearInterval(interval);
  }, [modalOpen, licenseExpiresAt]);

  if (chatOpen) return <ChatPage user={user} onBack={() => setChatOpen(false)} />;

  return (
    <div className="max-w-6xl mx-auto">

      {/* Navbar */}
      <div className="fixed top-0 left-0 right-0 bg-white shadow-md z-50">
        <div className="max-w-6xl mx-auto px-4 py-2 flex items-center gap-3">
          {/* Scrollable language tabs */}
          <div className="flex-1 min-w-0">
            {languages.length === 0 ? (
              <div className="inline-flex items-center px-4 py-1.5 rounded-full bg-gray-100 text-gray-400 text-sm font-medium">
                No languages yet
              </div>
            ) : (
              <div
                ref={tabsContainerRef}
                className="overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
              >
                <div className="inline-flex items-center gap-1 bg-purple-100 p-1 rounded-full min-w-min">
                  {languages.map((lang) => (
                    <div key={lang} className="flex items-center shrink-0">
                      {editingLang === lang ? (
                        <div className="flex items-center gap-1 px-1">
                          <input
                            type="text"
                            value={editingValue}
                            onChange={(e) => setEditingValue(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && saveEdit()}
                            className="w-28 px-2 py-1 text-sm border rounded-full focus:outline-none focus:ring-1 focus:ring-purple-400"
                            autoFocus
                          />
                          <button
                            onClick={saveEdit}
                            className="p-1 bg-green-600 text-white rounded-full hover:bg-green-700 cursor-pointer"
                          >
                            <FiCheck size={14} />
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="p-1 bg-gray-500 text-white rounded-full hover:bg-gray-600 cursor-pointer"
                          >
                            <FiX size={14} />
                          </button>
                        </div>
                      ) : (
                        <button
                          data-lang={lang}
                          onClick={() => {
                            setActiveLang(lang);
                            setSearchTerm("");
                          }}
                          className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition cursor-pointer ${
                            activeLang === lang
                              ? "bg-white text-purple-600 shadow-sm"
                              : "text-gray-600 hover:text-gray-800"
                          }`}
                        >
                          {lang}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Fixed action buttons */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => languages.length > 0 && openQuestionModal(null)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm ${
                languages.length > 0
                  ? "bg-green-600 text-white hover:bg-green-700 cursor-pointer"
                  : "bg-gray-200 text-gray-400 cursor-not-allowed"
              }`}
              title={languages.length > 0 ? "Add new question" : "Add a language first"}
              disabled={languages.length === 0}
            >
              <FiPlus className="inline" size={18} />
              <span className="hidden sm:inline ml-1.5">Add</span>
            </button>

            <button
              onClick={() => {
                if (languages.length > 0) {
                  const newVisibility = !searchVisible;
                  setSearchVisible(newVisibility);
                  if (!newVisibility) setSearchTerm("");
                }
              }}
              className={`p-2 rounded-lg transition-colors ${
                languages.length > 0
                  ? searchVisible
                    ? "bg-purple-100 text-purple-600 cursor-pointer"
                    : "text-gray-600 hover:bg-gray-100 cursor-pointer"
                  : "text-gray-300 cursor-not-allowed"
              }`}
              title={languages.length > 0 ? "Toggle search" : "Add a language first"}
              disabled={languages.length === 0}
            >
              <FiSearch size={18} />
            </button>

            <button
              onClick={openModal}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 border border-gray-200 hover:border-purple-300 hover:bg-purple-50 hover:text-purple-600 transition-colors cursor-pointer"
              title="Settings"
            >
              <FiSettings size={16} />
              <span className="hidden sm:inline">Settings</span>
            </button>
            <button
              onClick={() => setChatOpen(true)}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-600"
              title="Open chat"
            >
              <FiMessageCircle size={17} />
              <span className="hidden sm:inline">Chat</span>
            </button>
          </div>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleFileImport}
        className="hidden"
      />


      {/* Content with top padding */}
      <div className="pt-16 pb-8">

      {/* Search Box - Only show when languages exist and search is visible */}
      {searchVisible && languages.length > 0 && (
        <div className="mt-6 flex justify-center animate-in slide-in-from-top-2 duration-300">
          <input
            type="text"
            placeholder={`Search ${activeLang} questions...`}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full max-w-md px-4 py-3 border rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
            autoFocus
          />
        </div>
      )}

      {/* Language Management Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div
            ref={modalRef}
            className="bg-white rounded-2xl shadow-2xl w-[96vw] h-[94vh] flex flex-col"
          >
            {/* Modal Header - Fixed, non-scrollable */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200 flex-shrink-0">
              <div><h2 className="text-xl font-bold text-gray-800">Settings & Account</h2><p className="text-sm text-gray-500">Your workspace, profile, plan and access controls in one place.</p></div>
              <button
                onClick={closeModal}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors cursor-pointer"
                title="Close modal"
              >
                <FiX />
              </button>
            </div>

            {user?.role === "admin" && <div className="border-b bg-gray-50 px-6 py-3"><div className="flex flex-wrap gap-2"><button onClick={() => setAdminSettingsView("dashboard")} className={`rounded-lg px-4 py-2 text-sm font-medium ${adminSettingsView === "dashboard" ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-white"}`}>Admin dashboard</button><button onClick={() => setAdminSettingsView("workspace")} className={`rounded-lg px-4 py-2 text-sm font-medium ${adminSettingsView === "workspace" ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-white"}`}>Workspace settings</button></div></div>}

            {/* Account and workspace are visible together on one full-size page. */}
            <div className={user?.role === "admin" ? "min-h-0 flex-1 overflow-y-auto p-6" : "grid min-h-0 flex-1 lg:grid-cols-2"}>
              {user?.role !== "admin" && <aside className="overflow-y-auto border-b border-gray-200 bg-slate-50 p-6 lg:border-b-0 lg:border-r"><AccountDashboard user={user} onUserUpdated={onUserUpdated} onSignOut={onSignOut} /></aside>}
              {user?.role === "admin" && adminSettingsView === "dashboard" && <AccountDashboard user={user} onUserUpdated={onUserUpdated} onSignOut={onSignOut} />}
              {(user?.role !== "admin" || adminSettingsView === "workspace") && <section className="overflow-y-auto p-6">
              {/* License Status */}
              <div className="mb-6 p-4 rounded-xl bg-purple-50 border border-purple-100">
                <div className="flex items-center gap-2 text-purple-700 font-semibold mb-2">
                  <FiClock />
                  <span>License Time Remaining</span>
                </div>

                {user?.role === "admin" ? (
                  <p className="text-sm font-medium text-purple-800">Lifetime administrator access — no expiry.</p>
                ) : licenseExpiresAt ? (
                  remainingLicenseTime?.expired ? (
                    <p className="text-sm text-red-600 font-medium">Expired</p>
                  ) : (
                    <div className="grid grid-cols-5 gap-2 text-center">
                      {[
                        ["Years", remainingLicenseTime?.years ?? 0],
                        ["Months", remainingLicenseTime?.months ?? 0],
                        ["Days", remainingLicenseTime?.days ?? 0],
                        ["Hours", remainingLicenseTime?.hours ?? 0],
                        ["Minutes", remainingLicenseTime?.minutes ?? 0]
                      ].map(([label, value]) => (
                        <div key={label} className="bg-white rounded-lg px-2 py-2 border border-purple-100">
                          <div className="text-lg font-bold text-gray-800">{value}</div>
                          <div className="text-[11px] text-gray-500">{label}</div>
                        </div>
                      ))}
                    </div>
                  )
                ) : (
                  <p className="text-sm text-gray-600">{user?.plan === "free" ? "Free plan: no active trial or subscription." : "Subscription expiry has not been set yet."}</p>
                )}

               {licenseExpiresAt && (
                 <p className="text-xs text-gray-500 mt-3">{user?.effectivePlan === "trial" ? "Trial expires" : "Expires on"} {new Date(licenseExpiresAt).toLocaleString()}</p>
               )}
              </div>

              {/* Add Language Section */}
              <div className="mb-6">
                <div className="flex gap-3">
                  <input
                    type="text"
                    placeholder="Add new language..."
                    value={newLanguage}
                    onChange={(e) => setNewLanguage(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && addLanguage()}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent"
                  />
                  <button
                    onClick={addLanguage}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium transition-colors cursor-pointer"
                  >
                    Add
                  </button>
                </div>
              </div>
              {/* Languages List */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
                  Languages ({languages.length})
                  {canReorderLanguages && (
                    <span className="ml-2 normal-case font-normal text-gray-400">· Drag to reorder</span>
                  )}
                </h3>

                {languages.map((lang, index) => (
                  <div
                    key={lang}
                    onDragOver={(event) => handleLanguageDragOver(event, index)}
                    onDrop={(event) => handleLanguageDrop(event, index)}
                    className={`flex items-center justify-between p-3 rounded-lg transition-colors ${
                      draggedLangIndex === index
                        ? 'bg-purple-50 border border-dashed border-purple-300 opacity-60'
                        : dragOverLangIndex === index && draggedLangIndex !== null && draggedLangIndex !== index
                          ? 'bg-purple-50 border border-purple-400 ring-2 ring-purple-100'
                          : 'bg-gray-50 hover:bg-gray-100'
                    }`}
                  >
                    {editingLang === lang ? (
                      <div className="flex items-center gap-2 flex-1">
                        <input
                          type="text"
                          value={editingValue}
                          onChange={(e) => setEditingValue(e.target.value)}
                          onKeyPress={(e) => e.key === 'Enter' && saveEdit()}
                          className="flex-1 px-3 py-1 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-purple-400"
                          autoFocus
                        />
                        <button
                          onClick={saveEdit}
                          className="px-2 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700 cursor-pointer"
                          title="Save"
                        >
                          ✓
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="px-2 py-1 bg-gray-500 text-white text-xs rounded hover:bg-gray-600 cursor-pointer"
                          title="Cancel"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          {canReorderLanguages && (
                            <div
                              draggable
                              onDragStart={(event) => {
                                handleLanguageDragStart(index);
                                event.dataTransfer.effectAllowed = 'move';
                              }}
                              onDragEnd={handleLanguageDragEnd}
                              className="p-1 text-gray-400 hover:text-gray-600 cursor-grab active:cursor-grabbing rounded hover:bg-gray-200 shrink-0"
                              title="Drag to reorder"
                            >
                              <FiMenu size={16} />
                            </div>
                          )}
                          <span className={`font-medium truncate ${activeLang === lang ? 'text-purple-600' : 'text-gray-700'}`}>
                            {lang}
                            {activeLang === lang && <span className="text-xs text-purple-500 ml-2">(active)</span>}
                          </span>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <button
                            onClick={() => startEditing(lang)}
                            className="px-3 py-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded text-sm font-medium transition-colors cursor-pointer"
                            title="Edit language"
                          >
                            <FiEdit2 className="inline mr-1" /> Edit
                          </button>
                          <button
                            onClick={() => deleteLanguage(lang)}
                            className="px-3 py-1 text-red-600 hover:text-red-800 hover:bg-red-50 rounded text-sm font-medium transition-colors cursor-pointer"
                            title="Delete language"
                          >
                            <FiTrash2 className="inline mr-1" /> Delete
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>

              {/* Import & Export */}
              <div className="mt-8 pt-6 border-t border-gray-200">
                <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-4">
                  Import & Export
                </h3>

                <button
                  onClick={handleImport}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium transition-colors cursor-pointer"
                >
                  <FiUpload /> Import JSON
                </button>

                <div className="mt-4">
                  <p className="text-sm text-gray-500 mb-3">Export questions as</p>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'pdf', label: 'PDF' },
                      { id: 'word', label: 'Word' },
                      { id: 'json', label: 'JSON' },
                    ].map(({ id, label }) => (
                      <button
                        key={id}
                        onClick={() => handleExport(id)}
                        disabled={languages.length === 0}
                        className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                          languages.length === 0
                            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                            : selectedExportFormat === id && exportOptionsOpen
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {exportOptionsOpen && languages.length > 0 && (
                    <div className="mt-3 p-3 bg-blue-50 border border-blue-100 rounded-lg">
                      <p className="text-sm text-gray-600 mb-2">
                        Export {selectedExportFormat?.toUpperCase()} from
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => executeExport('current', selectedExportFormat)}
                          className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 cursor-pointer"
                        >
                          Current Language
                        </button>
                        <button
                          onClick={() => executeExport('all', selectedExportFormat)}
                          className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 cursor-pointer"
                        >
                          All Languages
                        </button>
                      </div>
                      <button
                        onClick={() => {
                          setExportOptionsOpen(false);
                          setSelectedExportFormat(null);
                        }}
                        className="w-full mt-2 px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  )}

                  {languages.length === 0 && (
                    <p className="mt-2 text-xs text-gray-400">Add a language to enable export.</p>
                  )}
                </div>
              </div>
              </section>}
            </div>

          </div>
        </div>
      )}

        {/* Question Board - Show empty state when no languages */}
        {languages.length === 0 ? (
          <div className="w-full max-w-5xl mx-auto bg-white rounded-2xl shadow-lg p-6 m-7">
            <div className="text-center py-12">
              <div className="text-6xl mb-4">📚</div>
              <h2 className="text-2xl font-bold text-gray-800 mb-2">Welcome to Interview Prep!</h2>
              <p className="text-gray-600 mb-6">Start by adding your first programming language to organize your interview questions.</p>
              <button
                onClick={openModal}
                className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium transition-colors shadow-md hover:shadow-lg cursor-pointer"
              >
                <FiPlus className="inline mr-2" /> Add Your First Language
              </button>
            </div>
          </div>
        ) : (
          activeLang && (
            <QuestionBoard
              language={activeLang}
              languages={languages}
              searchTerm={searchTerm}
              questionModalOpen={questionModalOpen}
              editorSessionKey={editorSessionKey}
              selectedQuestionId={selectedQuestionId}
              editingQuestionText={editingQuestionText}
              editingAnswerText={editingAnswerText}
              onOpenQuestionModal={openQuestionModal}
              onCloseQuestionModal={closeQuestionModal}
              onSetEditingQuestionText={setEditingQuestionText}
              onSetEditingAnswerText={setEditingAnswerText}
              onQuestionsUpdate={setQuestions}
            />
          )
        )}
      </div>
    </div>
  );
}

export default LanguageTabs;
