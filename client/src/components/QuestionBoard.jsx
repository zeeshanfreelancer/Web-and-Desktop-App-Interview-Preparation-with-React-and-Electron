import { useState, useEffect, useCallback } from "react";
import {
  FiEye,
  FiEyeOff,
  FiEdit2,
  FiX,
  FiTrash2,
  FiCheck,
  FiMenu
} from "react-icons/fi";
import { localStorageService } from "../services/localStorage";
import { highlightHtml } from "../utils/highlightSearch";
import { sanitizeRichText } from "../utils/sanitizeRichText";
import RichTextEditor from "./RichTextEditor";

export default function QuestionBoard({
  language,
  languages,
  searchTerm,
  questionModalOpen,
  editorSessionKey,
  selectedQuestionId,
  editingQuestionText,
  editingAnswerText,
  onOpenQuestionModal,
  onCloseQuestionModal,
  onSetEditingQuestionText,
  onSetEditingAnswerText,
  onQuestionsUpdate
}) {
  const [answersVisible, setAnswersVisible] = useState({});
  const [questions, setQuestions] = useState({});
  const [filteredQuestions, setFilteredQuestions] = useState([]);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [originalQuestion, setOriginalQuestion] = useState('');
  const [originalAnswer, setOriginalAnswer] = useState('');
  const [editingLanguage, setEditingLanguage] = useState('');
  const [originalLanguage, setOriginalLanguage] = useState('');
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);

  const canReorder = !searchTerm.trim();

  // Load questions when language changes
  useEffect(() => {
    const loadQuestions = () => {
      if (!language) {
        setFilteredQuestions([]);
        setQuestions({});
        return;
      }

      setFilteredQuestions([]);
      setError(null);
      setIsLoading(true);

      try {
        const fetchedQuestions = localStorageService.getQuestions(language);

        if (!Array.isArray(fetchedQuestions)) {
          setQuestions({ [language]: [] });
          setFilteredQuestions([]);
          onQuestionsUpdate?.([]);
          setIsLoading(false);
          return;
        }

        setQuestions({ [language]: fetchedQuestions });
        setFilteredQuestions(fetchedQuestions);
        onQuestionsUpdate?.(fetchedQuestions);
        setIsLoading(false);
      } catch (err) {
        const errorMessage = `Failed to load questions: ${err?.message || 'Unknown error'}`;
        setError(errorMessage);
        setQuestions({ [language]: [] });
        setFilteredQuestions([]);
        onQuestionsUpdate?.([]);
        setIsLoading(false);
      }
    };

    loadQuestions();
  }, [language]);

  // Filter questions based on search term
  useEffect(() => {
    if (!questions[language]) return;

    if (searchTerm.trim()) {
      const filtered = questions[language].filter(q =>
        q.question.toLowerCase().includes(searchTerm.toLowerCase()) ||
        q.answer.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredQuestions(filtered);
    } else {
      setFilteredQuestions(questions[language]);
    }
  }, [searchTerm, questions, language]);

  // Check for unsaved changes
  useEffect(() => {
    if (selectedQuestionId) {
      const hasChanges =
        editingQuestionText !== originalQuestion ||
        editingAnswerText !== originalAnswer ||
        editingLanguage !== originalLanguage;
      setHasUnsavedChanges(hasChanges);
    } else {
      setHasUnsavedChanges(editingQuestionText.trim() !== '' || editingAnswerText.trim() !== '');
    }
  }, [editingQuestionText, editingAnswerText, editingLanguage, originalQuestion, originalAnswer, originalLanguage, selectedQuestionId]);

  const openQuestionModalForEdit = (questionId) => {
    if (questionId) {
      const question = (questions[language] || []).find(q => (q._id || q.id) === questionId);
      if (question) {
        onSetEditingQuestionText(question.question);
        onSetEditingAnswerText(question.answer);
        setOriginalQuestion(question.question);
        setOriginalAnswer(question.answer);
        setEditingLanguage(language);
        setOriginalLanguage(language);
      }
    } else {
      onSetEditingQuestionText('');
      onSetEditingAnswerText('');
      setOriginalQuestion('');
      setOriginalAnswer('');
      setEditingLanguage(language);
      setOriginalLanguage(language);
    }

    onOpenQuestionModal(questionId);
    setHasUnsavedChanges(false);
  };

  const saveQuestionChanges = () => {
    if (!editingQuestionText.trim()) {
      setError('Question text cannot be empty');
      return;
    }

    try {
      setError(null);

      if (selectedQuestionId) {
        if (editingLanguage !== originalLanguage) {
          localStorageService.moveQuestion(selectedQuestionId, editingLanguage);
        }

        localStorageService.updateQuestion(selectedQuestionId, {
          question: editingQuestionText.trim(),
          answer: editingAnswerText,
          language: editingLanguage
        });
      } else {
        localStorageService.createQuestion({
          language,
          question: editingQuestionText.trim(),
          answer: editingAnswerText
        });
      }

      const updatedQuestions = localStorageService.getQuestions(language);

      setQuestions({ [language]: updatedQuestions || [] });
      setFilteredQuestions(updatedQuestions || []);
      onQuestionsUpdate?.(updatedQuestions || []);

      setOriginalQuestion(editingQuestionText.trim());
      setOriginalAnswer(editingAnswerText);
      setOriginalLanguage(editingLanguage);
      setHasUnsavedChanges(false);

      onCloseQuestionModal();
    } catch (err) {
      const errorMessage = err?.message || 'Failed to save question. Please try again.';
      setError(errorMessage);
      alert(`Error: ${errorMessage}`);
    }
  };

  const deleteQuestionAndAnswer = () => {
    const confirmed = window.confirm('Are you sure you want to delete this question? This action cannot be undone.');
    if (!confirmed) return;

    try {
      localStorageService.deleteQuestion(selectedQuestionId);

      const updatedQuestions = localStorageService.getQuestions(language);
      setQuestions({ [language]: updatedQuestions });
      setFilteredQuestions(updatedQuestions);
      onQuestionsUpdate?.(updatedQuestions);

      onCloseQuestionModal();
    } catch (err) {
      console.error('Failed to delete question:', err);
      setError('Failed to delete question');
    }
  };

  const handleDragStart = (index) => {
    if (!canReorder) return;
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const attemptCloseQuestionModal = useCallback(() => {
    if (hasUnsavedChanges) {
      const confirmed = window.confirm(
        'You have unsaved changes. Are you sure you want to close without saving?'
      );
      if (!confirmed) return;
    }
    onCloseQuestionModal();
  }, [hasUnsavedChanges, onCloseQuestionModal]);

  useEffect(() => {
    const handleEscapeKey = (event) => {
      if (event.key === 'Escape' && questionModalOpen) {
        attemptCloseQuestionModal();
      }
    };

    if (questionModalOpen) {
      document.addEventListener('keydown', handleEscapeKey);
    }

    return () => {
      document.removeEventListener('keydown', handleEscapeKey);
    };
  }, [questionModalOpen, attemptCloseQuestionModal]);

  const handleDragOver = (event, index) => {
    if (!canReorder || draggedIndex === null) return;
    event.preventDefault();
    setDragOverIndex(index);
  };

  const handleDrop = (event, dropIndex) => {
    event.preventDefault();
    if (!canReorder || draggedIndex === null || draggedIndex === dropIndex) {
      handleDragEnd();
      return;
    }

    try {
      const reordered = localStorageService.reorderQuestions(language, draggedIndex, dropIndex);
      setQuestions({ [language]: reordered });
      setFilteredQuestions(reordered);
      onQuestionsUpdate?.(reordered);
    } catch (err) {
      console.error('Failed to reorder questions:', err);
    }

    handleDragEnd();
  };

  if (isLoading) {
    return (
      <div className="w-full bg-white rounded-2xl shadow-lg p-6 m-7">
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
          <div className="ml-3 text-gray-500">Loading questions for {language}...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-lg p-6 m-7">
        <div className="flex flex-col justify-center items-center py-12">
          <div className="text-red-500 font-semibold mb-2">Error</div>
          <div className="text-red-600 text-center">{error}</div>
          <button
            onClick={() => {
              setError(null);
              try {
                const fetchedQuestions = localStorageService.getQuestions(language);
                setQuestions({ [language]: fetchedQuestions || [] });
                setFilteredQuestions(fetchedQuestions || []);
                onQuestionsUpdate?.(fetchedQuestions || []);
              } catch (err) {
                console.error('Failed to reload questions:', err);
              }
            }}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-5xl mx-auto bg-white rounded-2xl shadow-lg p-6 m-7">

      {(questions[language] || []).length === 0 && (
        <p className="text-gray-500 text-center mb-4">
          No questions yet. Add one!
        </p>
      )}

      {/* Questions List */}
      {filteredQuestions.length > 0 && (
        <div className="mb-4 text-sm text-gray-500">
          Showing {filteredQuestions.length} question{filteredQuestions.length !== 1 ? 's' : ''}
          {canReorder && (questions[language] || []).length > 1 && (
            <span className="ml-2 text-gray-400">· Drag to reorder</span>
          )}
        </div>
      )}
      {filteredQuestions.map((q, index) => {
        const trimmedSearch = searchTerm.trim();
        const safeQuestion = sanitizeRichText(q.question);
        const safeAnswer = sanitizeRichText(q.answer);
        const displayQuestion = trimmedSearch
          ? highlightHtml(safeQuestion, trimmedSearch)
          : safeQuestion;
        const displayAnswer = trimmedSearch && safeAnswer
          ? highlightHtml(safeAnswer, trimmedSearch)
          : safeAnswer;

        return (
        <div
          key={q._id || q.id || `question-${index}`}
          onDragOver={(event) => handleDragOver(event, index)}
          onDrop={(event) => handleDrop(event, index)}
          className={`border rounded-xl p-4 mb-4 transition ${
            draggedIndex === index
              ? 'opacity-50 border-dashed border-purple-300'
              : dragOverIndex === index && draggedIndex !== null && draggedIndex !== index
                ? 'border-purple-400 shadow-md ring-2 ring-purple-100'
                : 'hover:shadow-md'
          }`}
        >
          <div className="flex justify-between items-start gap-2">
            {canReorder && (
              <div
                draggable
                onDragStart={(event) => {
                  handleDragStart(index);
                  event.dataTransfer.effectAllowed = 'move';
                }}
                onDragEnd={handleDragEnd}
                className="mt-1 p-1 text-gray-400 hover:text-gray-600 cursor-grab active:cursor-grabbing rounded hover:bg-gray-100 shrink-0"
                title="Drag to reorder"
              >
                <FiMenu size={18} />
              </div>
            )}
            <h3 className="text-lg font-semibold flex-1 min-w-0">
              Q{index + 1}:&nbsp;
              <span 
                dangerouslySetInnerHTML={{ __html: displayQuestion }}
                style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}
                className="[&_ul]:list-disc [&_ul]:ml-6 [&_ol]:list-decimal [&_ol]:ml-6 [&_li]:mb-1 inline [&_.search-highlight]:bg-yellow-200 [&_.search-highlight]:text-yellow-900 [&_.search-highlight]:rounded [&_.search-highlight]:px-0.5"
              />
            </h3>

            <div className="flex gap-1">
              <button
                onClick={() => setAnswersVisible(prev => ({
                  ...prev,
                  [q._id || q.id]: !(prev[q._id || q.id] ?? false)
                }))}
                className="text-gray-600 hover:text-gray-800 p-1 rounded hover:bg-gray-50 transition-colors cursor-pointer"
                title={(answersVisible[q._id || q.id] ?? false) ? "Hide answer" : "Show answer"}
              >
                {(answersVisible[q._id || q.id] ?? false) ? <FiEye /> : <FiEyeOff />}
              </button>
              <button
                onClick={() => openQuestionModalForEdit(q._id || q.id)}
                className="text-gray-600 hover:text-gray-800 p-1 rounded hover:bg-gray-50 transition-colors cursor-pointer"
                title="Edit question"
              >
                <FiEdit2 />
              </button>
            </div>
          </div>

          {(answersVisible[q._id || q.id] ?? false) && (
            <div className="mt-3 p-3 bg-gray-50 rounded-lg border min-h-[60px]">
              {q.answer ? (
                <div 
                  dangerouslySetInnerHTML={{ __html: displayAnswer }} 
                  style={{ 
                    whiteSpace: 'pre-wrap', 
                    wordWrap: 'break-word'
                  }}
                  className="[&_ul]:list-disc [&_ul]:ml-6 [&_ol]:list-decimal [&_ol]:ml-6 [&_li]:mb-1 [&_.search-highlight]:bg-yellow-200 [&_.search-highlight]:text-yellow-900 [&_.search-highlight]:rounded [&_.search-highlight]:px-0.5"
                />
              ) : (
                <span className="text-gray-400 italic">No answer yet...</span>
              )}
            </div>
          )}
        </div>
        );
      })}



      {filteredQuestions.length === 0 && searchTerm && (questions[language] || []).length > 0 && (
  <p className="text-center text-gray-500 mt-6">
    No questions found
  </p>
)}

      {/* Question Management Modal */}
      {questionModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50" onClick={attemptCloseQuestionModal}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-6xl w-full mx-4 max-h-[90vh] overflow-y-auto relative" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="sticky top-0 bg-white flex items-center justify-between p-6 border-b border-gray-200 z-10">
              <h2 className="text-xl font-bold text-gray-800">
                {selectedQuestionId ? 'Manage Question' : 'Add New Question'}
              </h2>
              <div className="flex items-center gap-3">
                {selectedQuestionId && (
                  <button onClick={deleteQuestionAndAnswer} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium transition-colors cursor-pointer">
                    <FiTrash2 className="inline mr-2" /> Delete Question
                  </button>
                )}
                {selectedQuestionId ? (
                  <button 
                    onClick={saveQuestionChanges} 
                    className={`px-4 py-2 rounded-lg font-medium transition-colors cursor-pointer ${
                      hasUnsavedChanges 
                        ? 'bg-green-600 text-white hover:bg-green-700' 
                        : 'bg-gray-200 text-gray-600'
                    }`}
                    disabled={!hasUnsavedChanges}
                  >
                    <FiCheck className="inline mr-2" /> 
                    {hasUnsavedChanges ? 'Save Changes' : 'Saved'}
                  </button>
                ) : (
                  <button onClick={saveQuestionChanges} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium transition-colors cursor-pointer">
                    <FiCheck className="inline mr-2" /> Add Question
                  </button>
                )}
                <button onClick={attemptCloseQuestionModal} className="text-gray-400 hover:text-gray-600 text-2xl leading-none cursor-pointer">
                  <FiX />
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-6">
              {selectedQuestionId && languages.length > 1 && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Language</label>
                  <select
                    value={editingLanguage}
                    onChange={(event) => setEditingLanguage(event.target.value)}
                    className="w-full max-w-xs px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent bg-white"
                  >
                    {languages.map((lang) => (
                      <option key={lang} value={lang}>
                        {lang}
                      </option>
                    ))}
                  </select>
                  {editingLanguage !== originalLanguage && (
                    <p className="mt-2 text-sm text-purple-600">
                      This question will move to {editingLanguage} when saved.
                    </p>
                  )}
                </div>
              )}

              {/* Question Input */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Question</label>
                <RichTextEditor
                  key={`question-${editorSessionKey}`}
                  value={editingQuestionText}
                  onChange={onSetEditingQuestionText}
                  placeholder="Enter your question..."
                  className="min-h-[80px]"
                />
              </div>

              {/* Answer Input */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Answer</label>
                <RichTextEditor
                  key={`answer-${editorSessionKey}`}
                  value={editingAnswerText}
                  onChange={onSetEditingAnswerText}
                  placeholder="Write your answer..."
                  className="min-h-[120px]"
                />
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
