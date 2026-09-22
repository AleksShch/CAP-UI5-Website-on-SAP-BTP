sap.ui.define([
  'sap/ui/core/UIComponent',
  'sap/ui/model/json/JSONModel',
  'sap/ui/model/resource/ResourceModel',
  'sap/base/i18n/Localization'
], function (UIComponent, JSONModel, ResourceModel, Localization) {
  'use strict';

  const LANGUAGE_STORAGE_KEY = 'job.application.language';
  const SUPPORTED_LANGUAGES = ['de', 'en'];

  function storedLanguage() {
    try {
      const language = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
      return SUPPORTED_LANGUAGES.includes(language) ? language : 'de';
    } catch {
      return 'de';
    }
  }

  function createI18nModel(language) {
    return new ResourceModel({
      bundleName: 'job.application.i18n.i18n',
      bundleLocale: language,
      supportedLocales: SUPPORTED_LANGUAGES,
      fallbackLocale: 'de'
    });
  }

  return UIComponent.extend('job.application.Component', {
    metadata: { manifest: 'json' },

    init: function () {
      const language = storedLanguage();
      Localization.setLanguage(language);
      UIComponent.prototype.init.apply(this, arguments);
      this.setModel(createI18nModel(language), 'i18n');
      this.setModel(new JSONModel({
        language,
        isLanding: true,
        isSearch: false,
        isAdmin: false,
        showEditButton: false,
        editMode: false,
        blockEditorOpen: false,
        themeEditorOpen: false,
        busy: false
      }), 'ui');
      this.setModel(new JSONModel({
        pages: [],
        currentPage: null,
        currentPageId: '',
        blocks: [],
        parentOptions: [],
        themes: [],
        themeOptions: [],
        themeTemplates: [],
        themeTemplateKey: 'light',
        themeDraft: {},
        revision: 0,
        pageDraft: { title: '', slug: '', copyCurrentPage: false },
        aiTextModels: [],
        aiImageModels: [],
        aiImageModelHint: '',
        aiDraft: {
          prompt: '',
          outputLanguage: language === 'en' ? 'English' : 'Deutsch',
          blockCount: 4,
          placement: 'replace',
          textModel: '',
          imageModel: ''
        }
      }), 'landing');
      this.setModel(new JSONModel({
        company: '',
        jobTitle: '',
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        street: '',
        postalCode: '',
        city: '',
        country: language === 'en' ? 'Germany' : 'Deutschland',
        linkedIn: '',
        currentTitle: '',
        skills: '',
        languages: '',
        coverLetter: '',
        consent: false,
        recipientEmail: '',
        resumeName: '',
        attachmentNames: '',
        captchaId: '',
        captchaImage: '',
        captchaLabel: '',
        captchaAnswer: '',
        canAnalyze: false,
        busy: false
      }), 'form');
    },

    setLanguage: function (language) {
      const normalizedLanguage = SUPPORTED_LANGUAGES.includes(language) ? language : 'de';
      Localization.setLanguage(normalizedLanguage);
      this.setModel(createI18nModel(normalizedLanguage), 'i18n');
      this.getModel('ui')?.setProperty('/language', normalizedLanguage);
      try {
        window.localStorage.setItem(LANGUAGE_STORAGE_KEY, normalizedLanguage);
      } catch {
        // The selected language still applies for the current session.
      }
    }
  });
});
