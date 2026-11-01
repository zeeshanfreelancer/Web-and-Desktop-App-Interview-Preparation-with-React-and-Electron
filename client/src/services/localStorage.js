const STORAGE_KEY = 'interview-questions';
const LANGUAGES_KEY = 'interview-languages';
let activeProfileId = null;
let activePlan = "free";
const getStorageKey = (key) => activeProfileId ? `${key}:${activeProfileId}` : key;
const FREE_LANGUAGE_LIMIT = 2;
const FREE_QUESTION_LIMIT = 10;
const isFreePlan = () => activePlan === "free";

let idCounter = 0;

const generateQuestionId = () => {
  idCounter += 1;
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${idCounter}-${Math.random().toString(36).slice(2, 9)}`;
};

const ensureUniqueQuestionIds = (questions) => {
  const seen = new Set();
  let changed = false;

  const normalized = questions.map((question) => {
    const id = question._id || question.id;
    if (id && !seen.has(id)) {
      seen.add(id);
      return question;
    }

    changed = true;
    const newId = generateQuestionId();
    seen.add(newId);
    return { ...question, _id: newId };
  });

  return { questions: normalized, changed };
};

export const localStorageService = {
  setActiveProfile(id, migrateLegacyData = false, plan = "free") {
    activeProfileId = id;
    activePlan = plan;
    if (migrateLegacyData) {
      for (const key of [STORAGE_KEY, LANGUAGES_KEY]) {
        const profileKey = getStorageKey(key);
        if (!localStorage.getItem(profileKey) && localStorage.getItem(key)) {
          localStorage.setItem(profileKey, localStorage.getItem(key));
        }
      }
    }
  },
  getLimits() {
    return isFreePlan()
      ? { isFree: true, languages: FREE_LANGUAGE_LIMIT, questionsPerLanguage: FREE_QUESTION_LIMIT }
      : { isFree: false, languages: null, questionsPerLanguage: null };
  },
  canAddLanguage() {
    return !isFreePlan() || this.getLanguages().length < FREE_LANGUAGE_LIMIT;
  },
  // Questions
  getQuestions(language) {
    try {
      const data = JSON.parse(localStorage.getItem(getStorageKey(STORAGE_KEY)) || '{}');
      const questions = data[language] || [];
      const { questions: uniqueQuestions, changed } = ensureUniqueQuestionIds(questions);

      if (changed) {
        data[language] = uniqueQuestions;
        localStorage.setItem(getStorageKey(STORAGE_KEY), JSON.stringify(data));
      }

      return uniqueQuestions;
    } catch (error) {
      console.error('Error reading questions:', error);
      return [];
    }
  },

  createQuestion(questionData) {
    try {
      const data = JSON.parse(localStorage.getItem(getStorageKey(STORAGE_KEY)) || '{}');
      if (!data[questionData.language]) {
        data[questionData.language] = [];
      }
      if (isFreePlan() && data[questionData.language].length >= FREE_QUESTION_LIMIT) {
        throw new Error(`Free accounts can add up to ${FREE_QUESTION_LIMIT} questions per language. Upgrade your plan for unlimited questions.`);
      }
      
      const newQuestion = {
        ...questionData,
        _id: generateQuestionId(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      data[questionData.language].push(newQuestion);
      localStorage.setItem(getStorageKey(STORAGE_KEY), JSON.stringify(data));
      return newQuestion;
    } catch (error) {
      console.error('Error creating question:', error);
      throw new Error('Failed to create question');
    }
  },

  updateQuestion(id, questionData) {
    try {
      const data = JSON.parse(localStorage.getItem(getStorageKey(STORAGE_KEY)) || '{}');
      
      for (const language in data) {
        const questionIndex = data[language].findIndex(q => q._id === id);
        if (questionIndex !== -1) {
          data[language][questionIndex] = {
            ...data[language][questionIndex],
            ...questionData,
            updatedAt: new Date().toISOString()
          };
          localStorage.setItem(getStorageKey(STORAGE_KEY), JSON.stringify(data));
          return data[language][questionIndex];
        }
      }
      throw new Error('Question not found');
    } catch (error) {
      console.error('Error updating question:', error);
      throw new Error('Failed to update question');
    }
  },

  deleteQuestion(id) {
    try {
      const data = JSON.parse(localStorage.getItem(getStorageKey(STORAGE_KEY)) || '{}');
      
      for (const language in data) {
        const questionIndex = data[language].findIndex(q => q._id === id);
        if (questionIndex !== -1) {
          data[language].splice(questionIndex, 1);
          localStorage.setItem(getStorageKey(STORAGE_KEY), JSON.stringify(data));
          return true;
        }
      }
      throw new Error('Question not found');
    } catch (error) {
      console.error('Error deleting question:', error);
      throw new Error('Failed to delete question');
    }
  },

  reorderQuestions(language, fromIndex, toIndex) {
    try {
      const data = JSON.parse(localStorage.getItem(getStorageKey(STORAGE_KEY)) || '{}');
      const list = [...(data[language] || [])];

      if (
        fromIndex < 0 ||
        fromIndex >= list.length ||
        toIndex < 0 ||
        toIndex >= list.length ||
        fromIndex === toIndex
      ) {
        return list;
      }

      const [moved] = list.splice(fromIndex, 1);
      list.splice(toIndex, 0, moved);
      data[language] = list;
      localStorage.setItem(getStorageKey(STORAGE_KEY), JSON.stringify(data));
      return list;
    } catch (error) {
      console.error('Error reordering questions:', error);
      throw new Error('Failed to reorder questions');
    }
  },

  moveQuestion(id, targetLanguage) {
    try {
      const data = JSON.parse(localStorage.getItem(getStorageKey(STORAGE_KEY)) || '{}');
      let question = null;
      let sourceLanguage = null;

      for (const language in data) {
        const questionIndex = data[language].findIndex(q => q._id === id);
        if (questionIndex !== -1) {
          question = data[language][questionIndex];
          sourceLanguage = language;
          data[language].splice(questionIndex, 1);
          break;
        }
      }

      if (!question) {
        throw new Error('Question not found');
      }

      if (sourceLanguage === targetLanguage) {
        if (!data[targetLanguage]) {
          data[targetLanguage] = [];
        }
        data[targetLanguage].push(question);
        localStorage.setItem(getStorageKey(STORAGE_KEY), JSON.stringify(data));
        return question;
      }

      if (isFreePlan() && (data[targetLanguage] || []).length >= FREE_QUESTION_LIMIT) {
        throw new Error(`Free accounts can keep up to ${FREE_QUESTION_LIMIT} questions per language. Upgrade your plan to move more questions.`);
      }

      if (!data[targetLanguage]) {
        data[targetLanguage] = [];
      }

      const movedQuestion = {
        ...question,
        language: targetLanguage,
        updatedAt: new Date().toISOString()
      };

      data[targetLanguage].push(movedQuestion);
      localStorage.setItem(getStorageKey(STORAGE_KEY), JSON.stringify(data));
      return movedQuestion;
    } catch (error) {
      console.error('Error moving question:', error);
      throw error instanceof Error ? error : new Error('Failed to move question');
    }
  },

  searchQuestions(language, query) {
    try {
      const questions = this.getQuestions(language);
      return questions.filter(q => 
        q.question.toLowerCase().includes(query.toLowerCase()) ||
        q.answer.toLowerCase().includes(query.toLowerCase())
      );
    } catch (error) {
      console.error('Error searching questions:', error);
      return [];
    }
  },

  // Languages
  getLanguages() {
    try {
      const languages = JSON.parse(localStorage.getItem(getStorageKey(LANGUAGES_KEY)) || '[]');
      return languages;
    } catch (error) {
      console.error('Error reading languages:', error);
      return [];
    }
  },

  saveLanguages(languages) {
    try {
      localStorage.setItem(getStorageKey(LANGUAGES_KEY), JSON.stringify(languages));
    } catch (error) {
      console.error('Error saving languages:', error);
    }
  },

  reorderLanguages(fromIndex, toIndex) {
    try {
      const languages = [...this.getLanguages()];

      if (
        fromIndex < 0 ||
        fromIndex >= languages.length ||
        toIndex < 0 ||
        toIndex >= languages.length ||
        fromIndex === toIndex
      ) {
        return languages;
      }

      const [moved] = languages.splice(fromIndex, 1);
      languages.splice(toIndex, 0, moved);
      this.saveLanguages(languages);
      return languages;
    } catch (error) {
      console.error('Error reordering languages:', error);
      throw new Error('Failed to reorder languages');
    }
  },

  deleteLanguage(language) {
    try {
      const languages = this.getLanguages().filter(lang => lang !== language);
      this.saveLanguages(languages);

      const data = JSON.parse(localStorage.getItem(getStorageKey(STORAGE_KEY)) || '{}');
      delete data[language];
      localStorage.setItem(getStorageKey(STORAGE_KEY), JSON.stringify(data));

      return languages;
    } catch (error) {
      console.error('Error deleting language:', error);
      throw new Error('Failed to delete language');
    }
  },

  renameLanguage(oldName, newName) {
    try {
      const trimmed = newName.trim();
      if (!trimmed) throw new Error('Language name cannot be empty');

      const languages = this.getLanguages();
      if (languages.includes(trimmed) && trimmed !== oldName) {
        throw new Error('Language already exists');
      }

      const data = JSON.parse(localStorage.getItem(getStorageKey(STORAGE_KEY)) || '{}');
      if (data[oldName]) {
        data[trimmed] = data[oldName].map(q => ({ ...q, language: trimmed }));
        delete data[oldName];
        localStorage.setItem(getStorageKey(STORAGE_KEY), JSON.stringify(data));
      }

      this.saveLanguages(languages.map(lang => (lang === oldName ? trimmed : lang)));
      return trimmed;
    } catch (error) {
      console.error('Error renaming language:', error);
      throw error instanceof Error ? error : new Error('Failed to rename language');
    }
  },

  importQuestions(parsed) {
    try {
      let totalImported = 0;
      const languages = this.getLanguages();
      const updatedLanguages = [...languages];
      const data = JSON.parse(localStorage.getItem(getStorageKey(STORAGE_KEY)) || '{}');

      const importForLanguage = (language, questions) => {
        if (isFreePlan() && !updatedLanguages.includes(language) && updatedLanguages.length >= FREE_LANGUAGE_LIMIT) {
          throw new Error(`Free accounts can add up to ${FREE_LANGUAGE_LIMIT} languages. Upgrade your plan to import more.`);
        }
        if (!updatedLanguages.includes(language)) {
          updatedLanguages.push(language);
        }
        if (!data[language]) {
          data[language] = [];
        }
        if (isFreePlan() && data[language].length + questions.length > FREE_QUESTION_LIMIT) {
          throw new Error(`Free accounts can keep up to ${FREE_QUESTION_LIMIT} questions per language. Upgrade your plan to import more.`);
        }

        for (const q of questions) {
          data[language].push({
            language,
            question: q.question,
            answer: q.answer ?? '',
            _id: generateQuestionId(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });
          totalImported += 1;
        }
      };

      if (parsed.type === 'multi') {
        for (const [language, questions] of Object.entries(parsed.languages)) {
          if (Array.isArray(questions) && questions.length > 0) {
            importForLanguage(language, questions);
          }
        }
      } else {
        if (!parsed.targetLanguage) {
          throw new Error('Select a language before importing');
        }
        importForLanguage(parsed.targetLanguage, parsed.questions);
      }

      localStorage.setItem(getStorageKey(STORAGE_KEY), JSON.stringify(data));
      this.saveLanguages(updatedLanguages);
      return { totalImported, languages: updatedLanguages };
    } catch (error) {
      console.error('Error importing questions:', error);
      throw error instanceof Error ? error : new Error('Failed to import questions');
    }
  },

  getStorageStatus() {
    try {
      const data = JSON.parse(localStorage.getItem(getStorageKey(STORAGE_KEY)) || '{}');
      const totalQuestions = Object.values(data).reduce((sum, questions) => sum + questions.length, 0);
      const questionsByLanguage = {};
      
      for (const [language, questions] of Object.entries(data)) {
        questionsByLanguage[language] = questions.length;
      }
      
      return {
        connected: true,
        totalQuestions,
        questionsByLanguage,
        storageUsed: JSON.stringify(data).length
      };
    } catch (error) {
      return {
        connected: false,
        error: error.message,
        totalQuestions: 0,
        questionsByLanguage: {}
      };
    }
  }
};
