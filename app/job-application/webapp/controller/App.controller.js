sap.ui.define([
  'sap/ui/core/mvc/Controller',
  'sap/m/MessageBox',
  'sap/m/MessageToast',
  'sap/m/Dialog',
  'sap/m/Button',
  'sap/m/Input',
  'sap/m/Label',
  'sap/m/VBox',
  'sap/m/Text',
  'sap/m/TextArea',
  'sap/m/StepInput',
  'sap/m/Select',
  'sap/m/CheckBox',
  'sap/ui/core/Item',
  'sap/ui/core/Fragment'
], function (Controller, MessageBox, MessageToast, Dialog, Button, Input, Label, VBox, Text, TextArea, StepInput, Select, CheckBox, Item, Fragment) {
  'use strict';

  const PUBLIC_PAGES_URL = '/odata/v4/landing/Pages?$orderby=sortOrder';
  const PUBLIC_BLOCKS_URL = '/odata/v4/landing/Blocks';
  const PUBLIC_THEMES_URL = '/odata/v4/landing/Themes?$orderby=name';
  const ADMIN_LANDING_ROOT = '/odata/v4/landing-admin/';
  const ADMIN_SAVE_URL = '/odata/v4/landing-admin/saveBlocks';
  const ADMIN_CREATE_PAGE_URL = '/odata/v4/landing-admin/createPage';
  const ADMIN_DELETE_PAGE_URL = '/odata/v4/landing-admin/deletePage';
  const ADMIN_SET_HOME_PAGE_URL = '/odata/v4/landing-admin/setHomePage';
  const ADMIN_AI_MODELS_URL = '/odata/v4/landing-admin/getAiModels';
  const ADMIN_GENERATE_BLOCKS_URL = '/odata/v4/landing-admin/generateBlocks';
  const ADMIN_COPY_BLOCK_URL = '/odata/v4/landing-admin/copyBlock';
  const ADMIN_CREATE_THEME_URL = '/odata/v4/landing-admin/createTheme';
  const ADMIN_DELETE_THEME_URL = '/odata/v4/landing-admin/deleteTheme';
  const ADMIN_IMAGES_URL = '/odata/v4/landing-admin/Images';
  const PUBLIC_IMAGES_URL = '/odata/v4/landing/Images';
  const HEX_COLOR = /^#[0-9a-f]{6}$/i;
  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const THEME_COLOR_FIELDS = [
    'backgroundColor', 'textColor', 'headingColor', 'accentColor', 'linkColor',
    'buttonBackgroundColor', 'buttonTextColor', 'buttonBorderColor', 'borderColor', 'overlayColor'
  ];
  const BUILTIN_THEME_TEMPLATES = [
    {
      key: 'light', textKey: 'themeLight', backgroundColor: '#FFFFFF', textColor: '#102A43',
      headingColor: '#102A43', accentColor: '#1B9C8F', linkColor: '#0A6ED1',
      buttonBackgroundColor: '#0A6ED1', buttonTextColor: '#FFFFFF', buttonBorderColor: '#0A6ED1',
      borderColor: '#D5E2EC', overlayColor: '#04121F', overlayOpacity: 45
    },
    {
      key: 'dark', textKey: 'themeDark', backgroundColor: '#0D2438', textColor: '#FFFFFF',
      headingColor: '#FFFFFF', accentColor: '#66E0D1', linkColor: '#66E0D1',
      buttonBackgroundColor: '#0A6ED1', buttonTextColor: '#FFFFFF', buttonBorderColor: '#0A6ED1',
      borderColor: '#27445C', overlayColor: '#04121F', overlayOpacity: 55
    },
    {
      key: 'accent', textKey: 'themeAccent', backgroundColor: '#E9F5FF', textColor: '#102A43',
      headingColor: '#102A43', accentColor: '#1B9C8F', linkColor: '#0A6ED1',
      buttonBackgroundColor: '#0A6ED1', buttonTextColor: '#FFFFFF', buttonBorderColor: '#0A6ED1',
      borderColor: '#BFD9E8', overlayColor: '#04121F', overlayOpacity: 40
    }
  ];

  return Controller.extend('job.application.controller.App', {
    onInit: function () {
      this._resumeFile = null;
      this._attachmentFiles = [];
      this._landingSnapshot = null;

      const path = window.location.pathname.replace(/\/+$/, '') || '/';
      const isSearch = path === '/search';
      const isAdmin = path === '/admin';
      const isStaticEntryPoint = /^\/job-application\/webapp(?:\/index\.html)?$/.test(path);
      this._requestedSlug = !isSearch && !isAdmin && path !== '/' && !isStaticEntryPoint ? path.slice(1) : '';
      const ui = this.getView().getModel('ui');
      ui.setProperty('/isSearch', isSearch);
      ui.setProperty('/isLanding', !isSearch);
      ui.setProperty('/isAdmin', isAdmin);
      ui.setProperty('/showEditButton', isAdmin);

      this._onHashChange = () => {
        if (window.location.hash && ui.getProperty('/isLanding')) {
          this._scrollToBlockTagWhenRendered(window.location.hash);
        }
      };
      this._onDocumentAnchorClick = (event) => {
        const anchor = event.target?.closest?.('a[href]');
        if (!anchor) return;
        const blockTag = this._currentPageBlockTag(anchor.href);
        if (!blockTag) return;

        event.preventDefault();
        if (!this._scrollToBlockTag(blockTag)) {
          MessageToast.show(this.getResourceBundle().getText('blockTargetNotFound'));
        }
      };
      window.addEventListener('hashchange', this._onHashChange);
      document.addEventListener('click', this._onDocumentAnchorClick);

      if (isSearch) this._loadCaptcha();
      else this._loadLanding();
    },

    formatAlignItems: function (alignment) {
      return { left: 'Start', center: 'Center', right: 'End' }[alignment] || 'Start';
    },

    formatButtonJustify: function (buttonAlignment, textAlignment) {
      const alignment = buttonAlignment === 'inherit' || !buttonAlignment ? textAlignment : buttonAlignment;
      return { left: 'Start', center: 'Center', right: 'End' }[alignment] || 'Start';
    },

    formatMenuDirection: function (orientation) {
      return orientation === 'vertical' ? 'Column' : 'Row';
    },

    formatMenuColor: function (menuTextColor, themeId) {
      const ownColor = String(menuTextColor || '').trim();
      if (HEX_COLOR.test(ownColor)) return ownColor.toUpperCase();
      const landing = this.getView().getModel('landing');
      const template = (landing.getProperty('/themeTemplates') || []).find((theme) => (
        theme.key === themeId || theme.ID === themeId
      ));
      if (HEX_COLOR.test(template?.linkColor || '')) return template.linkColor.toUpperCase();
      return '#0A6ED1';
    },

    formatCanSubmit: function (consent, recipientEmail) {
      return consent === true && EMAIL_PATTERN.test(String(recipientEmail || '').trim());
    },

    onNavigateHome: function () {
      window.location.assign('/');
    },

    onNavigateSearch: function () {
      window.location.assign('/search');
    },

    onLanguageChange: function (event) {
      const language = event.getSource().getSelectedKey();
      if (!['de', 'en'].includes(language)) return;

      const form = this.getView().getModel('form');
      const landing = this.getView().getModel('landing');
      const currentCountry = form.getProperty('/country');
      const currentOutputLanguage = landing.getProperty('/aiDraft/outputLanguage');
      this.getOwnerComponent().setLanguage(language);
      const bundle = this.getOwnerComponent().getModel('i18n').getResourceBundle();

      if (['Deutschland', 'Germany'].includes(currentCountry)) {
        form.setProperty('/country', bundle.getText('defaultCountry'));
      }
      if (['Deutsch', 'English'].includes(currentOutputLanguage)) {
        landing.setProperty('/aiDraft/outputLanguage', bundle.getText('aiDefaultOutputLanguage'));
      }
      form.setProperty('/captchaLabel', bundle.getText('captchaAnswerLabel'));
      this._destroyLocalizedDialogs();
      this._setThemeOptions(landing.getProperty('/themes') || []);
      this._setBlocks(landing.getProperty('/blocks') || []);
    },

    onPageChange: async function (event) {
      await this._selectPage(event.getParameter('selectedItem')?.getKey());
    },

    onOpenCreatePage: function () {
      this.getView().getModel('landing').setProperty('/pageDraft', {
        title: '',
        slug: '',
        copyCurrentPage: false
      });
      this._getCreatePageDialog().open();
    },

    onOpenCopyPage: function () {
      const landing = this.getView().getModel('landing');
      const currentPage = landing.getProperty('/currentPage');
      if (!currentPage) return;

      const pages = landing.getProperty('/pages') || [];
      const usedSlugs = new Set(pages.map((page) => page.slug));
      const baseSlug = `${currentPage.slug || 'seite'}-copy`.slice(0, 80);
      let slug = baseSlug;
      let number = 2;
      while (usedSlugs.has(slug)) {
        const suffix = `-${number}`;
        slug = `${baseSlug.slice(0, 80 - suffix.length)}${suffix}`;
        number += 1;
      }

      landing.setProperty('/pageDraft', {
        title: this.getResourceBundle().getText('pageCopyTitle', [currentPage.title]),
        slug,
        copyCurrentPage: true
      });
      this._getCreatePageDialog().open();
    },

    onOpenAiGenerator: async function () {
      const landing = this.getView().getModel('landing');
      const dialog = this._getAiGeneratorDialog();
      landing.setProperty('/aiDraft', {
        prompt: '',
        outputLanguage: this.getResourceBundle().getText('aiDefaultOutputLanguage'),
        blockCount: 4,
        placement: 'replace',
        textModel: '',
        imageModel: ''
      });
      landing.setProperty('/aiImageModelHint', this.getResourceBundle().getText(
        'aiImageModelHint',
        [this.getResourceBundle().getText('aiBalanceLoading')]
      ));
      dialog.open();
      dialog.setBusy(true);
      try {
        const result = await this._adminAction(ADMIN_AI_MODELS_URL, {});
        const textModels = Array.isArray(result.textModels) ? result.textModels : [];
        const imageModels = Array.isArray(result.imageModels) ? result.imageModels : [];
        if (!textModels.length) throw new Error(this.getResourceBundle().getText('aiNoTextModels'));
        landing.setProperty('/aiTextModels', textModels);
        landing.setProperty('/aiImageModels', [
          { id: '', label: this.getResourceBundle().getText('aiNoImageModel') },
          ...imageModels
        ]);
        const balance = Number(result.openRouterBalance);
        const balanceText = result.openRouterBalanceAvailable && Number.isFinite(balance)
          ? `${new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 }).format(balance)} USD`
          : this.getResourceBundle().getText('aiBalanceUnavailable');
        landing.setProperty('/aiImageModelHint', this.getResourceBundle().getText('aiImageModelHint', [balanceText]));
        landing.setProperty('/aiDraft/textModel',
          textModels.some((model) => model.id === result.defaultTextModel)
            ? result.defaultTextModel
            : textModels[0].id
        );
        landing.setProperty('/aiDraft/imageModel',
          imageModels.some((model) => model.id === result.defaultImageModel)
            ? result.defaultImageModel
            : ''
        );
      } catch (error) {
        dialog.close();
        MessageBox.error(error.message);
      } finally {
        dialog.setBusy(false);
      }
    },

    onCancelAiGenerator: function () {
      this._aiGeneratorDialog?.close();
    },

    onGenerateAiBlocks: async function () {
      const landing = this.getView().getModel('landing');
      const ui = this.getView().getModel('ui');
      const draft = landing.getProperty('/aiDraft') || {};
      const prompt = String(draft.prompt || '').trim();
      const outputLanguage = String(draft.outputLanguage || '').trim()
        || this.getResourceBundle().getText('aiDefaultOutputLanguage');
      const textModel = String(draft.textModel || '').trim();
      const imageModel = String(draft.imageModel || '').trim();
      const blockCount = Number(draft.blockCount);
      if (prompt.length < 10) {
        MessageBox.warning(this.getResourceBundle().getText('aiPromptRequired'));
        return;
      }
      if (!Number.isInteger(blockCount) || blockCount < 1 || blockCount > 8) {
        MessageBox.warning(this.getResourceBundle().getText('aiBlockCountInvalid'));
        return;
      }
      if (!textModel) {
        MessageBox.warning(this.getResourceBundle().getText('aiTextModelRequired'));
        return;
      }

      ui.setProperty('/busy', true);
      this._aiGeneratorDialog.setBusy(true);
      try {
        const result = await this._adminAction(ADMIN_GENERATE_BLOCKS_URL, {
          pageId: landing.getProperty('/currentPageId'),
          prompt,
          outputLanguage,
          blockCount,
          placement: draft.placement === 'append' ? 'append' : 'replace',
          textModel,
          imageModel
        });
        const generated = Array.isArray(result.value) ? result.value : [];
        if (!generated.length) throw new Error(this.getResourceBundle().getText('aiNoBlocks'));

        const currentBlocks = this._clone(landing.getProperty('/blocks') || []);
        this._landingSnapshot = currentBlocks;
        const blocks = draft.placement === 'append' ? [...currentBlocks, ...generated] : generated;
        this._setBlocks(blocks);
        ui.setProperty('/editMode', true);
        ui.setProperty('/showEditButton', false);
        this._aiGeneratorDialog.close();
        MessageToast.show(this.getResourceBundle().getText('aiBlocksGenerated', [generated.length]));
      } catch (error) {
        MessageBox.error(error.message);
      } finally {
        this._aiGeneratorDialog.setBusy(false);
        ui.setProperty('/busy', false);
      }
    },

    onCancelCreatePage: function () {
      this._createPageDialog?.close();
    },

    onCreatePage: async function () {
      const landing = this.getView().getModel('landing');
      const draft = landing.getProperty('/pageDraft') || {};
      if (!String(draft.title || '').trim() || !String(draft.slug || '').trim()) {
        MessageBox.warning(this.getResourceBundle().getText('pageFieldsRequired'));
        return;
      }

      const ui = this.getView().getModel('ui');
      ui.setProperty('/busy', true);
      try {
        const result = await this._adminAction(ADMIN_CREATE_PAGE_URL, {
          title: draft.title,
          slug: draft.slug,
          copySourcePageId: draft.copyCurrentPage ? landing.getProperty('/currentPageId') : null
        });
        const pages = [...(landing.getProperty('/pages') || []), result].sort((a, b) => a.sortOrder - b.sortOrder);
        landing.setProperty('/pages', pages);
        this._createPageDialog.close();
        await this._selectPage(result.ID);
        MessageToast.show(this.getResourceBundle().getText('pageCreated'));
      } catch (error) {
        MessageBox.error(error.message);
      } finally {
        ui.setProperty('/busy', false);
      }
    },

    onDeletePage: function () {
      const page = this.getView().getModel('landing').getProperty('/currentPage');
      if (!page || page.isHome) return;
      MessageBox.confirm(this.getResourceBundle().getText('deletePageConfirm', [page.title]), {
        emphasizedAction: MessageBox.Action.DELETE,
        actions: [MessageBox.Action.DELETE, MessageBox.Action.CANCEL],
        onClose: async (action) => {
          if (action !== MessageBox.Action.DELETE) return;
          await this._deleteCurrentPage(page.ID);
        }
      });
    },

    onSetHomePage: function (event) {
      if (!event.getParameter('selected')) return;
      event.getSource().setSelected(false);
      const landing = this.getView().getModel('landing');
      const currentPage = landing.getProperty('/currentPage');
      if (!currentPage || currentPage.isHome) return;

      MessageBox.confirm(this.getResourceBundle().getText('homePageChangeConfirm', [currentPage.title]), {
        emphasizedAction: MessageBox.Action.OK,
        actions: [MessageBox.Action.OK, MessageBox.Action.CANCEL],
        onClose: (action) => {
          if (action === MessageBox.Action.OK) this._setHomePage(currentPage);
        }
      });
    },

    _setHomePage: async function (currentPage) {
      const landing = this.getView().getModel('landing');
      const ui = this.getView().getModel('ui');
      ui.setProperty('/busy', true);
      try {
        await this._adminAction(ADMIN_SET_HOME_PAGE_URL, { pageId: currentPage.ID });
        const pages = (landing.getProperty('/pages') || []).map((page) => ({
          ...page,
          isHome: page.ID === currentPage.ID
        }));
        landing.setProperty('/pages', pages);
        landing.setProperty('/currentPage', { ...currentPage, isHome: true });
        MessageToast.show(this.getResourceBundle().getText('homePageChanged', [currentPage.title]));
      } catch (error) {
        landing.updateBindings(true);
        MessageBox.error(error.message);
      } finally {
        ui.setProperty('/busy', false);
      }
    },

    onEnterEditMode: function () {
      const blocks = this.getView().getModel('landing').getProperty('/blocks') || [];
      this._landingSnapshot = this._clone(blocks);
      const ui = this.getView().getModel('ui');
      ui.setProperty('/editMode', true);
      ui.setProperty('/showEditButton', false);
    },

    onCancelLandingEdit: function () {
      if (this._landingSnapshot) {
        this._setBlocks(this._clone(this._landingSnapshot));
      }
      this._finishLandingEdit();
      MessageToast.show(this.getResourceBundle().getText('changesCancelled'));
    },

    onOpenBlockEditor: function (event) {
      const context = event.getSource().getBindingContext('landing');
      if (!context) return;

      const block = context.getObject();
      if (!block?.ID) return;
      if (this._editedBlockId && this._editedBlockId !== block.ID) {
        if (this.getView().getModel('ui').getProperty('/themeEditorOpen')) this.onCancelTheme();
        this._restoreBlockEditorSnapshot();
      }
      if (this._editedBlockId !== block.ID || !this._blockEditorSnapshot) {
        this._blockEditorSnapshot = { ID: block.ID, block: this._clone(block) };
      }
      this._editedBlockId = block.ID;
      this.byId('blockEditorPanel').bindElement({ path: context.getPath(), model: 'landing' });
      this.getView().getModel('ui').setProperty('/blockEditorOpen', true);
    },

    onSaveBlockEditor: function () {
      if (this.getView().getModel('ui').getProperty('/themeEditorOpen')) this.onCancelTheme();
      const blockPath = this._editedBlockPath();
      const landing = this.getView().getModel('landing');
      const block = blockPath ? landing.getProperty(blockPath) : null;
      if (block) {
        block._menuItems = this._parseMenuItems(block.menuItems);
        this._decorateBlockTheme(block);
        landing.updateBindings(true);
        this._scheduleNestedLayout();
      }
      this._blockEditorSnapshot = null;
      this.onCloseBlockEditor();
      MessageToast.show(this.getResourceBundle().getText('blockChangesSaved'));
    },

    onCancelBlockEditor: function () {
      if (this.getView().getModel('ui').getProperty('/themeEditorOpen')) this.onCancelTheme();
      this._restoreBlockEditorSnapshot();
      this.onCloseBlockEditor();
      MessageToast.show(this.getResourceBundle().getText('blockChangesCancelled'));
    },

    onCloseBlockEditor: function () {
      if (this.getView().getModel('ui').getProperty('/themeEditorOpen')) this.onCancelTheme();
      this.getView().getModel('ui').setProperty('/blockEditorOpen', false);
      this.byId('blockEditorPanel')?.unbindElement('landing');
      this._blockEditorSnapshot = null;
      this._editedBlockId = null;
    },

    onThemeChange: function (event) {
      const source = event.getSource();
      const context = source.getBindingContext('landing');
      if (!context) return;
      const selectedKey = event.getParameter('selectedItem')?.getKey();
      const landing = this.getView().getModel('landing');
      const blockPath = this._editedBlockPath() || context.getPath();
      const block = landing.getProperty(blockPath);
      if (!block) return;

      if (selectedKey === '__create__') {
        this._themeTargetPath = blockPath;
        source.setSelectedKey(block.theme || 'light');
        this._openThemeEditor();
        return;
      }

      landing.setProperty(`${blockPath}/theme`, selectedKey || 'light');
      this._decorateBlockTheme(block);
      landing.updateBindings(true);
      this._scheduleNestedLayout();
    },

    onCreateTheme: async function () {
      const landing = this.getView().getModel('landing');
      const draft = landing.getProperty('/themeDraft') || {};
      if (!String(draft.name || '').trim()) {
        MessageBox.warning(this.getResourceBundle().getText('themeNameRequired'));
        return;
      }
      if (THEME_COLOR_FIELDS.some((field) => !HEX_COLOR.test(String(draft[field] || '').trim()))) {
        MessageBox.warning(this.getResourceBundle().getText('themeColorInvalid'));
        return;
      }

      const ui = this.getView().getModel('ui');
      ui.setProperty('/busy', true);
      try {
        const theme = await this._adminAction(ADMIN_CREATE_THEME_URL, { theme: draft });
        const themes = [...(landing.getProperty('/themes') || []), theme].sort((a, b) => a.name.localeCompare(b.name));
        landing.setProperty('/themes', themes);
        this._setThemeOptions(themes);
        if (this._themeTargetPath) {
          landing.setProperty(`${this._themeTargetPath}/theme`, theme.ID);
          this._decorateBlockTheme(landing.getProperty(this._themeTargetPath));
          landing.updateBindings(true);
          this._scheduleNestedLayout();
        }
        this._themePreviewSnapshot = null;
        this._lastValidThemePreview = null;
        this._themeTargetPath = null;
        ui.setProperty('/themeEditorOpen', false);
        MessageToast.show(this.getResourceBundle().getText('themeCreated'));
      } catch (error) {
        MessageBox.error(error.message);
      } finally {
        ui.setProperty('/busy', false);
      }
    },

    onThemeTemplateChange: function (event) {
      const landing = this.getView().getModel('landing');
      const selectedKey = event.getParameter('selectedItem')?.getKey() || 'light';
      const template = (landing.getProperty('/themeTemplates') || []).find((item) => item.key === selectedKey);
      if (!template) return;

      const name = landing.getProperty('/themeDraft/name') || '';
      landing.setProperty('/themeTemplateKey', selectedKey);
      landing.setProperty('/themeDraft', { name, ...this._themeColors(template) });
      this._lastValidThemePreview = this._themeColors(template);
      this._previewThemeDraft();
    },

    onThemeDraftChange: function (event) {
      const binding = event.getSource().getBinding('value');
      const value = event.getParameter('value');
      if (binding && value !== undefined) {
        this.getView().getModel('landing').setProperty(binding.getPath(), value);
      }
      this._previewThemeDraft();
    },

    onOpenColorPicker: async function (event) {
      const binding = event.getSource().getBinding('color');
      if (!binding) return;
      const landing = this.getView().getModel('landing');
      const targetPath = binding.getResolvedPath?.() || binding.getPath();
      const currentColor = String(landing.getProperty(targetPath) || '').trim();
      await this._openColorPicker(targetPath, currentColor);
    },

    onOpenMenuColorPicker: async function (event) {
      const source = event.getSource();
      const contextPath = source.getBindingContext('landing')?.getPath();
      if (!contextPath) return;
      await this._openColorPicker(`${contextPath}/menuTextColor`, source.getColor());
    },

    _openColorPicker: async function (targetPath, currentColor) {
      this._colorPickerTargetPath = targetPath;

      if (!this._colorPickerDialog) {
        this._colorPickerDialog = await Fragment.load({
          id: this.getView().getId(),
          name: 'job.application.view.ColorPickerDialog',
          controller: this
        });
        this.getView().addDependent(this._colorPickerDialog);
      }
      this.byId('themeColorPicker').setColorString(HEX_COLOR.test(currentColor) ? currentColor : '#FFFFFF');
      this._colorPickerDialog.open();
    },

    onApplyColorPicker: function () {
      if (!this._colorPickerTargetPath) return;
      const color = this._selectedPickerHex();
      if (!color) {
        MessageBox.warning(this.getResourceBundle().getText('themeColorInvalid'));
        return;
      }
      this.getView().getModel('landing').setProperty(this._colorPickerTargetPath, color);
      if (this._colorPickerTargetPath.startsWith('/themeDraft/')) this._previewThemeDraft();
      this._colorPickerDialog.close();
      this._colorPickerTargetPath = null;
    },

    onCancelColorPicker: function () {
      this._colorPickerDialog?.close();
      this._colorPickerTargetPath = null;
    },

    onColorPickerAfterClose: function () {
      this._colorPickerTargetPath = null;
    },

    onDeleteThemeTemplate: function () {
      const landing = this.getView().getModel('landing');
      const themeId = landing.getProperty('/themeTemplateKey');
      const theme = (landing.getProperty('/themes') || []).find((item) => item.ID === themeId);
      if (!theme) return;

      if ((landing.getProperty('/blocks') || []).some((block) => block.theme === themeId)) {
        MessageBox.warning(this.getResourceBundle().getText('themeDeleteInUse'));
        return;
      }

      MessageBox.confirm(this.getResourceBundle().getText('themeDeleteConfirm', [theme.name]), {
        emphasizedAction: MessageBox.Action.DELETE,
        actions: [MessageBox.Action.DELETE, MessageBox.Action.CANCEL],
        onClose: async (action) => {
          if (action !== MessageBox.Action.DELETE) return;
          await this._deleteThemeTemplate(themeId);
        }
      });
    },

    onCancelTheme: function () {
      this._restoreThemePreview();
      this.getView().getModel('ui').setProperty('/themeEditorOpen', false);
      this._themeTargetPath = null;
    },

    onAddBlock: function () {
      const model = this.getView().getModel('landing');
      const blocks = model.getProperty('/blocks') || [];
      const blockTag = this._nextBlockTag(blocks);
      const bundle = this.getResourceBundle();
      blocks.push({
        ID: this._uuid(),
        sortOrder: (blocks.length + 1) * 10,
        blockTag,
        imageUrl: '',
        imageAlt: '',
        imageWidth: '44%',
        imageHeight: '24rem',
        imagePosition: 'left',
        imageFit: 'cover',
        blockHeight: '30rem',
        contentWidth: '84rem',
        paddingTop: 'auto',
        paddingRight: 'auto',
        paddingBottom: 'auto',
        paddingLeft: 'auto',
        backgroundCrop: 'auto',
        blockWidth: 'full',
        parentBlockId: '',
        nestedX: 25,
        nestedY: 25,
        nestedWidth: 50,
        nestedHeight: 50,
        transparentBackground: false,
        textHtml: bundle.getText('newBlockTextHtml'),
        textAlign: 'left',
        menuItems: '',
        menuOrientation: 'horizontal',
        menuGap: '1.5rem',
        menuFontSize: '1rem',
        menuTextColor: '',
        menuTextEffect: 'none',
        _menuItems: [],
        buttonText: bundle.getText('newBlockButtonText'),
        buttonUrl: '/search',
        buttonType: 'Emphasized',
        buttonWidth: '13rem',
        buttonHeight: '3.25rem',
        buttonBorderRadius: '0.25rem',
        buttonAlign: 'inherit',
        theme: 'light'
      });
      this._setBlocks(blocks);
    },

    onDeleteBlock: function (event) {
      const index = this._contextIndex(event.getSource());
      if (index < 0) return;
      const blocks = this.getView().getModel('landing').getProperty('/blocks') || [];
      const removedId = blocks[index]?.ID;
      blocks.splice(index, 1);
      blocks.forEach((block) => {
        if (block.parentBlockId === removedId) block.parentBlockId = '';
      });
      this._setBlocks(blocks);
    },

    onOpenCopyBlock: function (event) {
      const context = event.getSource().getBindingContext('landing');
      const block = context?.getObject();
      if (!block) return;

      const landing = this.getView().getModel('landing');
      const currentPageId = landing.getProperty('/currentPageId');
      const targetPages = (landing.getProperty('/pages') || []).filter((page) => page.ID !== currentPageId);
      if (!targetPages.length) {
        MessageBox.information(this.getResourceBundle().getText('copyBlockNoTarget'));
        return;
      }

      const index = this._contextIndex(event.getSource());
      this._blockCopyDraft = this._serializeBlock(block, Math.max(0, index));
      landing.setProperty('/copyPageOptions', targetPages);
      landing.setProperty('/copyTargetPageId', targetPages[0].ID);
      this._getCopyBlockDialog().open();
    },

    onCancelCopyBlock: function () {
      this._copyBlockDialog?.close();
      this._blockCopyDraft = null;
    },

    onCopyBlock: async function () {
      const landing = this.getView().getModel('landing');
      const targetPageId = landing.getProperty('/copyTargetPageId');
      const targetPage = (landing.getProperty('/copyPageOptions') || []).find((page) => page.ID === targetPageId);
      if (!targetPageId || !targetPage || !this._blockCopyDraft) return;

      const ui = this.getView().getModel('ui');
      ui.setProperty('/busy', true);
      try {
        await this._adminAction(ADMIN_COPY_BLOCK_URL, {
          sourcePageId: landing.getProperty('/currentPageId'),
          targetPageId,
          block: this._blockCopyDraft
        });
        const pages = (landing.getProperty('/pages') || []).map((page) => (
          page.ID === targetPageId ? { ...page, revision: (page.revision || 0) + 1 } : page
        ));
        landing.setProperty('/pages', pages);
        this._copyBlockDialog.close();
        this._blockCopyDraft = null;
        MessageToast.show(this.getResourceBundle().getText('copyBlockSuccess', [targetPage.title]));
      } catch (error) {
        MessageBox.error(error.message);
      } finally {
        ui.setProperty('/busy', false);
      }
    },

    onParentBlockChange: function (event) {
      const source = event.getSource();
      const index = this._contextIndex(source);
      if (index < 0) return;

      const model = this.getView().getModel('landing');
      const blocks = model.getProperty('/blocks') || [];
      const block = blocks[index];
      const parentBlockId = source.getSelectedKey();
      if (parentBlockId && this._createsParentCycle(block.ID, parentBlockId, blocks)) {
        model.setProperty(`/blocks/${index}/parentBlockId`, '');
        source.setSelectedKey('');
        MessageBox.warning(this.getResourceBundle().getText('parentBlockCycleError'));
      } else {
        model.setProperty(`/blocks/${index}/parentBlockId`, parentBlockId || '');
      }
      this._scheduleNestedLayout();
    },

    onNestedGeometryChange: function () {
      this._scheduleNestedLayout();
    },

    onMoveBlockUp: function (event) {
      this._moveBlock(this._contextIndex(event.getSource()), -1);
    },

    onMoveBlockDown: function (event) {
      this._moveBlock(this._contextIndex(event.getSource()), 1);
    },

    onBlockDrop: function (event) {
      const dragged = event.getParameter('draggedControl');
      const dropped = event.getParameter('droppedControl');
      const from = this._contextIndex(dragged);
      const originalTarget = this._contextIndex(dropped);
      if (from < 0 || originalTarget < 0 || from === originalTarget) return;

      const blocks = this.getView().getModel('landing').getProperty('/blocks') || [];
      const [block] = blocks.splice(from, 1);
      let target = originalTarget;
      if (from < originalTarget) target -= 1;
      if (event.getParameter('dropPosition') === 'After') target += 1;
      blocks.splice(Math.max(0, target), 0, block);
      this._setBlocks(blocks);
    },

    onLandingButtonPress: function (event) {
      const block = event.getSource().getBindingContext('landing')?.getObject();
      this._navigateLandingTarget(block?.buttonUrl);
    },

    onBlockMenuItemPress: function (event) {
      const menuItem = event.getSource().getBindingContext('landing')?.getObject();
      this._navigateLandingTarget(menuItem?.target);
    },

    onMenuItemsChange: function (event) {
      const source = event.getSource();
      const index = this._contextIndex(source);
      if (index < 0) return;
      const value = event.getParameter('value') || '';
      const model = this.getView().getModel('landing');
      model.setProperty(`/blocks/${index}/menuItems`, value);
      model.setProperty(`/blocks/${index}/_menuItems`, this._parseMenuItems(value));
    },

    _navigateLandingTarget: function (value) {
      const target = String(value || '').trim();
      if (!target) return;
      const blockTag = this._currentPageBlockTag(target);
      if (this.getView().getModel('ui').getProperty('/editMode') && !blockTag) return;
      if (blockTag) {
        if (!this._scrollToBlockTag(blockTag)) {
          MessageToast.show(this.getResourceBundle().getText('blockTargetNotFound'));
        }
      } else if (target.startsWith('/')) window.location.assign(target);
      else window.open(target, '_blank', 'noopener,noreferrer');
    },

    onBlockImageUpload: async function (event) {
      const uploader = event.getSource();
      const index = this._contextIndex(uploader);
      const file = event.getParameter('files')?.[0];
      if (index < 0 || !file) return;

      const ui = this.getView().getModel('ui');
      const landing = this.getView().getModel('landing');
      ui.setProperty('/busy', true);
      try {
        const imageUrl = await this._uploadLandingImage(file);
        landing.setProperty(`/blocks/${index}/imageUrl`, imageUrl);
        if (!landing.getProperty(`/blocks/${index}/imageAlt`)) {
          landing.setProperty(`/blocks/${index}/imageAlt`, file.name);
        }
        MessageToast.show(this.getResourceBundle().getText('imageUploadSuccess'));
      } catch (error) {
        MessageBox.error(error.message);
      } finally {
        if (typeof uploader.clear === 'function') uploader.clear();
        ui.setProperty('/busy', false);
      }
    },

    onSaveLanding: async function () {
      const ui = this.getView().getModel('ui');
      const landing = this.getView().getModel('landing');
      const blocks = (landing.getProperty('/blocks') || []).map((block, index) => this._serializeBlock(block, index));
      ui.setProperty('/busy', true);

      try {
        const result = await this._adminAction(ADMIN_SAVE_URL, {
          pageId: landing.getProperty('/currentPageId'),
          expectedRevision: landing.getProperty('/revision') || 0,
          blocks
        });
        const savedBlocks = Array.isArray(result.value) ? result.value : blocks;
        this._setBlocks(savedBlocks.sort((a, b) => a.sortOrder - b.sortOrder));
        const newRevision = (landing.getProperty('/revision') || 0) + 1;
        landing.setProperty('/revision', newRevision);
        landing.setProperty('/currentPage/revision', newRevision);
        const currentPageId = landing.getProperty('/currentPageId');
        const pages = (landing.getProperty('/pages') || []).map((page) => (
          page.ID === currentPageId ? { ...page, revision: newRevision } : page
        ));
        landing.setProperty('/pages', pages);
        this._landingSnapshot = this._clone(savedBlocks);
        this._finishLandingEdit();
        MessageToast.show(this.getResourceBundle().getText('landingSaved'));
      } catch (error) {
        MessageBox.error(error.message);
      } finally {
        ui.setProperty('/busy', false);
      }
    },

    onResumeChange: function (event) {
      this._resumeFile = event.getParameter('files')?.[0] || null;
      const model = this.getView().getModel('form');
      model.setProperty('/resumeName', this._resumeFile?.name || '');
      model.setProperty('/canAnalyze', Boolean(this._resumeFile));
    },

    onAttachmentsChange: function (event) {
      this._attachmentFiles = Array.from(event.getParameter('files') || []);
      this.getView().getModel('form').setProperty('/attachmentNames', this._attachmentFiles.map((file) => file.name).join(', '));
    },

    onUploadError: function () {
      MessageBox.error(this.getResourceBundle().getText('uploadError'));
    },

    onCaptchaRefresh: function () {
      this._loadCaptcha(true);
    },

    onAnalyze: async function () {
      if (!this._resumeFile) return;
      const model = this.getView().getModel('form');
      const data = new FormData();
      data.append('resume', this._resumeFile);
      model.setProperty('/busy', true);

      try {
        const response = await fetch('/api/resume/analyze', { method: 'POST', body: data });
        const result = await this._responseJson(response);
        Object.entries(result.fields || {}).forEach(([key, value]) => {
          if (value) model.setProperty(`/${key}`, value);
        });
        const warnings = result.meta?.warnings || [];
        MessageToast.show(warnings.length ? warnings.join(' ') : this.getResourceBundle().getText('analysisSuccess'));
      } catch (error) {
        MessageBox.error(error.message);
      } finally {
        model.setProperty('/busy', false);
      }
    },

    onSubmit: async function () {
      const model = this.getView().getModel('form');
      const fields = model.getData();
      if (
        !this._resumeFile
        || !fields.firstName
        || !fields.lastName
        || !fields.email
        || !fields.consent
        || !EMAIL_PATTERN.test(String(fields.recipientEmail || '').trim())
      ) {
        MessageBox.warning(this.getResourceBundle().getText('requiredError'));
        return;
      }
      if (!fields.captchaId || String(fields.captchaAnswer || '').trim() === '') {
        MessageBox.warning(this.getResourceBundle().getText('captchaRequired'));
        return;
      }

      const data = new FormData();
      data.append('resume', this._resumeFile);
      this._attachmentFiles.forEach((file) => data.append('attachments', file));
      data.append('fields', JSON.stringify({
        company: fields.company,
        jobTitle: fields.jobTitle,
        firstName: fields.firstName,
        lastName: fields.lastName,
        email: fields.email,
        phone: fields.phone,
        street: fields.street,
        postalCode: fields.postalCode,
        city: fields.city,
        country: fields.country,
        linkedIn: fields.linkedIn,
        currentTitle: fields.currentTitle,
        skills: fields.skills,
        languages: fields.languages,
        coverLetter: fields.coverLetter,
        consent: fields.consent,
        recipientEmail: String(fields.recipientEmail || '').trim()
      }));
      model.setProperty('/busy', true);

      try {
        const response = await fetch('/api/applications/submit', {
          method: 'POST',
          headers: {
            'X-Captcha-Id': fields.captchaId,
            'X-Captcha-Answer': String(fields.captchaAnswer).trim()
          },
          body: data
        });
        const result = await this._responseJson(response);
        MessageBox.success(this.getResourceBundle().getText('submitSuccess', [result.applicationId]));
      } catch (error) {
        MessageBox.error(error.message);
      } finally {
        await this._loadCaptcha(false);
        model.setProperty('/busy', false);
      }
    },

    _loadLanding: async function () {
      const ui = this.getView().getModel('ui');
      ui.setProperty('/busy', true);
      try {
        const [pagesResponse, themesResponse] = await Promise.all([
          fetch(PUBLIC_PAGES_URL, { cache: 'no-store' }),
          fetch(PUBLIC_THEMES_URL, { cache: 'no-store' })
        ]);
        const [pagesResult, themesResult] = await Promise.all([
          this._responseJson(pagesResponse),
          this._responseJson(themesResponse)
        ]);
        const pages = Array.isArray(pagesResult.value) ? pagesResult.value.sort((a, b) => a.sortOrder - b.sortOrder) : [];
        const themes = Array.isArray(themesResult.value) ? themesResult.value.sort((a, b) => a.name.localeCompare(b.name)) : [];
        const selected = this._requestedSlug
          ? pages.find((page) => page.slug === this._requestedSlug)
          : pages.find((page) => page.isHome);
        if (!selected) throw new Error(this.getResourceBundle().getText('pageNotFound'));
        const landing = this.getView().getModel('landing');
        landing.setProperty('/pages', pages);
        landing.setProperty('/themes', themes);
        this._setThemeOptions(themes);
        await this._selectPage(selected.ID);
      } catch (error) {
        MessageBox.error(error.message);
      } finally {
        ui.setProperty('/busy', false);
      }
    },

    _selectPage: async function (pageId) {
      if (!pageId) return;
      const landing = this.getView().getModel('landing');
      const page = (landing.getProperty('/pages') || []).find((item) => item.ID === pageId);
      if (!page) return;
      const ui = this.getView().getModel('ui');
      ui.setProperty('/busy', true);
      try {
        const filter = encodeURIComponent(`page_ID eq ${page.ID}`);
        const response = await fetch(`${PUBLIC_BLOCKS_URL}?$filter=${filter}&$orderby=sortOrder`, { cache: 'no-store' });
        const result = await this._responseJson(response);
        const blocks = Array.isArray(result.value) ? result.value.sort((a, b) => a.sortOrder - b.sortOrder) : [];
        landing.setProperty('/currentPageId', page.ID);
        landing.setProperty('/currentPage', this._clone(page));
        landing.setProperty('/revision', page.revision || 0);
        this._setBlocks(blocks);
        if (window.location.hash) this._scrollToBlockTagWhenRendered(window.location.hash);
        this._landingSnapshot = null;
      } catch (error) {
        MessageBox.error(error.message);
      } finally {
        ui.setProperty('/busy', false);
      }
    },

    _deleteCurrentPage: async function (pageId) {
      const ui = this.getView().getModel('ui');
      const landing = this.getView().getModel('landing');
      ui.setProperty('/busy', true);
      try {
        await this._adminAction(ADMIN_DELETE_PAGE_URL, { pageId });
        const pages = (landing.getProperty('/pages') || []).filter((page) => page.ID !== pageId);
        landing.setProperty('/pages', pages);
        await this._selectPage(pages.find((page) => page.isHome)?.ID || pages[0]?.ID);
        MessageToast.show(this.getResourceBundle().getText('pageDeleted'));
      } catch (error) {
        MessageBox.error(error.message);
      } finally {
        ui.setProperty('/busy', false);
      }
    },

    _adminCsrfToken: async function () {
      const csrfResponse = await fetch(ADMIN_LANDING_ROOT, {
        headers: { 'X-CSRF-Token': 'Fetch' },
        credentials: 'same-origin'
      });
      if (!csrfResponse.ok) await this._responseJson(csrfResponse);
      return csrfResponse.headers.get('x-csrf-token');
    },

    _adminAction: async function (url, body) {
      const csrfToken = await this._adminCsrfToken();
      const headers = { 'Content-Type': 'application/json' };
      if (csrfToken) headers['X-CSRF-Token'] = csrfToken;

      const response = await fetch(url, {
        method: 'POST',
        credentials: 'same-origin',
        headers,
        body: JSON.stringify(body)
      });
      return this._responseJson(response);
    },

    _uploadLandingImage: async function (file) {
      const extension = String(file.name || '').split('.').pop().toLowerCase();
      const mimeType = {
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        webp: 'image/webp'
      }[extension];
      if (!mimeType || file.size < 1 || file.size > 5 * 1024 * 1024) {
        throw new Error(this.getResourceBundle().getText('uploadError'));
      }

      const imageId = this._uuid();
      await this._adminAction(ADMIN_IMAGES_URL, {
        ID: imageId,
        fileName: file.name,
        mimeType,
        sizeBytes: file.size
      });

      const csrfToken = await this._adminCsrfToken();
      const headers = { 'Content-Type': mimeType };
      if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
      const response = await fetch(`${ADMIN_IMAGES_URL}(${encodeURIComponent(imageId)})/content`, {
        method: 'PUT',
        credentials: 'same-origin',
        headers,
        body: file
      });
      if (!response.ok) await this._responseJson(response);
      return `${PUBLIC_IMAGES_URL}(${encodeURIComponent(imageId)})/content`;
    },

    _openThemeEditor: function () {
      const landing = this.getView().getModel('landing');
      this._themeTargetPath = this._editedBlockPath() || this._themeTargetPath;
      const templates = landing.getProperty('/themeTemplates') || [];
      const currentTheme = this._themeTargetPath ? landing.getProperty(`${this._themeTargetPath}/theme`) : 'light';
      const template = templates.find((item) => item.key === currentTheme) || templates[0] || BUILTIN_THEME_TEMPLATES[0];
      const targetBlock = this._themeTargetPath ? landing.getProperty(this._themeTargetPath) : null;
      this._themePreviewSnapshot = targetBlock ? {
        path: this._themeTargetPath,
        customTheme: targetBlock._customTheme ? this._clone(targetBlock._customTheme) : null
      } : null;
      this._lastValidThemePreview = this._themeColors(template);
      landing.setProperty('/themeTemplateKey', template.key);
      landing.setProperty('/themeDraft', { name: '', ...this._themeColors(template) });

      this.getView().getModel('ui').setProperty('/themeEditorOpen', true);
    },

    _getCreatePageDialog: function () {
      if (this._createPageDialog) return this._createPageDialog;
      const bundle = this.getResourceBundle();
      this._createPageDialog = new Dialog({
        title: bundle.getText('createPage'),
        contentWidth: '28rem',
        content: new VBox({
          items: [
            new Label({ text: bundle.getText('pageTitle'), required: true }),
            new Input({ value: '{landing>/pageDraft/title}', placeholder: bundle.getText('pageTitlePlaceholder') }),
            new Label({ text: bundle.getText('pageSlug'), required: true }).addStyleClass('sapUiSmallMarginTop'),
            new Input({ value: '{landing>/pageDraft/slug}', placeholder: 'team' }),
            new Text({ text: bundle.getText('pageSlugHint'), wrapping: true }).addStyleClass('sapUiTinyMarginTop'),
            new CheckBox({
              text: bundle.getText('copyCurrentPage'),
              selected: '{landing>/pageDraft/copyCurrentPage}'
            }).addStyleClass('sapUiSmallMarginTop'),
            new Text({ text: bundle.getText('copyCurrentPageHint'), wrapping: true }).addStyleClass('sapUiTinyMarginBegin')
          ]
        }).addStyleClass('sapUiSmallMargin'),
        beginButton: new Button({
          text: bundle.getText('createPage'),
          type: 'Emphasized',
          press: this.onCreatePage.bind(this)
        }),
        endButton: new Button({
          text: bundle.getText('cancelChanges'),
          press: this.onCancelCreatePage.bind(this)
        })
      });
      this.getView().addDependent(this._createPageDialog);
      return this._createPageDialog;
    },

    _getAiGeneratorDialog: function () {
      if (this._aiGeneratorDialog) return this._aiGeneratorDialog;
      const bundle = this.getResourceBundle();
      const placementSelect = new Select({
        width: '100%',
        selectedKey: '{landing>/aiDraft/placement}',
        items: [
          new Item({ key: 'replace', text: bundle.getText('aiPlacementReplace') }),
          new Item({ key: 'append', text: bundle.getText('aiPlacementAppend') })
        ]
      });
      const textModelSelect = new Select({
        width: '100%',
        selectedKey: '{landing>/aiDraft/textModel}'
      });
      textModelSelect.bindItems({
        path: 'landing>/aiTextModels',
        template: new Item({ key: '{landing>id}', text: '{landing>label}' }),
        templateShareable: false
      });
      const imageModelSelect = new Select({
        width: '100%',
        selectedKey: '{landing>/aiDraft/imageModel}'
      });
      imageModelSelect.bindItems({
        path: 'landing>/aiImageModels',
        template: new Item({ key: '{landing>id}', text: '{landing>label}' }),
        templateShareable: false
      });
      this._aiGeneratorDialog = new Dialog({
        title: bundle.getText('aiDialogTitle'),
        contentWidth: '57rem',
        busyIndicatorDelay: 0,
        content: new VBox({
          items: [
            new Text({ text: bundle.getText('aiDialogHint'), wrapping: true }),
            new Label({ text: bundle.getText('aiTextModel'), required: true }).addStyleClass('sapUiSmallMarginTop'),
            textModelSelect,
            new Label({ text: bundle.getText('aiImageModel') }).addStyleClass('sapUiSmallMarginTop'),
            imageModelSelect,
            new Text({ text: '{landing>/aiImageModelHint}', wrapping: true }).addStyleClass('sapUiTinyMarginTop'),
            new Label({ text: bundle.getText('aiPrompt'), required: true }).addStyleClass('sapUiSmallMarginTop'),
            new TextArea({
              value: '{landing>/aiDraft/prompt}',
              rows: 14,
              growing: true,
              growingMaxLines: 24,
              width: '100%',
              placeholder: bundle.getText('aiPromptPlaceholder')
            }),
            new Label({ text: bundle.getText('aiOutputLanguage'), required: true }).addStyleClass('sapUiSmallMarginTop'),
            new Input({
              value: '{landing>/aiDraft/outputLanguage}',
              placeholder: bundle.getText('aiOutputLanguagePlaceholder')
            }),
            new Label({ text: bundle.getText('aiBlockCount') }).addStyleClass('sapUiSmallMarginTop'),
            new StepInput({ value: '{landing>/aiDraft/blockCount}', min: 1, max: 8, step: 1, width: '10rem' }),
            new Label({ text: bundle.getText('aiPlacement') }).addStyleClass('sapUiSmallMarginTop'),
            placementSelect
          ]
        }).addStyleClass('sapUiSmallMargin'),
        beginButton: new Button({
          text: bundle.getText('generateAiAction'),
          icon: 'sap-icon://ai',
          type: 'Emphasized',
          press: this.onGenerateAiBlocks.bind(this)
        }),
        endButton: new Button({
          text: bundle.getText('cancelChanges'),
          press: this.onCancelAiGenerator.bind(this)
        })
      });
      this.getView().addDependent(this._aiGeneratorDialog);
      return this._aiGeneratorDialog;
    },

    _getCopyBlockDialog: function () {
      if (this._copyBlockDialog) return this._copyBlockDialog;
      const bundle = this.getResourceBundle();
      const pageSelect = new Select({
        width: '100%',
        selectedKey: '{landing>/copyTargetPageId}'
      });
      pageSelect.bindItems({
        path: 'landing>/copyPageOptions',
        template: new Item({ key: '{landing>ID}', text: '{landing>title}' }),
        templateShareable: false
      });

      this._copyBlockDialog = new Dialog({
        title: bundle.getText('copyBlockTitle'),
        contentWidth: '28rem',
        content: new VBox({
          items: [
            new Label({ text: bundle.getText('copyBlockTargetPage'), labelFor: pageSelect }),
            pageSelect,
            new Text({ text: bundle.getText('copyBlockHint'), wrapping: true }).addStyleClass('sapUiTinyMarginTop')
          ]
        }).addStyleClass('sapUiSmallMargin'),
        beginButton: new Button({
          text: bundle.getText('copyBlockAction'),
          icon: 'sap-icon://copy',
          type: 'Emphasized',
          press: this.onCopyBlock.bind(this)
        }),
        endButton: new Button({
          text: bundle.getText('cancelChanges'),
          press: this.onCancelCopyBlock.bind(this)
        })
      });
      this.getView().addDependent(this._copyBlockDialog);
      return this._copyBlockDialog;
    },

    onExit: function () {
      window.removeEventListener('hashchange', this._onHashChange);
      document.removeEventListener('click', this._onDocumentAnchorClick);
      this._createPageDialog?.destroy();
      this._aiGeneratorDialog?.destroy();
      this._copyBlockDialog?.destroy();
      this._colorPickerDialog?.destroy();
    },

    _destroyLocalizedDialogs: function () {
      ['_createPageDialog', '_aiGeneratorDialog', '_copyBlockDialog'].forEach((property) => {
        this[property]?.destroy();
        this[property] = null;
      });
    },

    _loadCaptcha: async function (showError) {
      const model = this.getView().getModel('form');
      model.setProperty('/captchaId', '');
      model.setProperty('/captchaImage', '');
      model.setProperty('/captchaLabel', this.getResourceBundle().getText('captchaAnswerLabel'));
      model.setProperty('/captchaAnswer', '');

      try {
        const response = await fetch('/api/captcha', { cache: 'no-store' });
        const captcha = await this._responseJson(response);
        model.setProperty('/captchaId', captcha.id);
        model.setProperty('/captchaImage', captcha.image);
      } catch (error) {
        model.setProperty('/captchaLabel', this.getResourceBundle().getText('captchaUnavailable'));
        if (showError) MessageBox.error(error.message);
      }
    },

    _moveBlock: function (index, offset) {
      const blocks = this.getView().getModel('landing').getProperty('/blocks') || [];
      const target = index + offset;
      if (index < 0 || target < 0 || target >= blocks.length) return;
      [blocks[index], blocks[target]] = [blocks[target], blocks[index]];
      this._setBlocks(blocks);
    },

    _setBlocks: function (blocks) {
      const usedTags = new Set();
      blocks.forEach((block, index) => {
        block.sortOrder = (index + 1) * 10;
        let blockTag = this._normalizeBlockTag(block.blockTag);
        if (!blockTag || usedTags.has(blockTag)) blockTag = this._nextBlockTag(blocks, usedTags);
        block.blockTag = blockTag;
        usedTags.add(blockTag);
        block.menuOrientation = block.menuOrientation === 'vertical' ? 'vertical' : 'horizontal';
        block.menuGap = block.menuGap || '1.5rem';
        block.menuFontSize = block.menuFontSize || '1rem';
        block.menuTextColor = block.menuTextColor || '';
        block.menuTextEffect = ['shadow', 'outline', 'glow'].includes(block.menuTextEffect) ? block.menuTextEffect : 'none';
        block.buttonType = block.buttonType === 'Positive' ? 'Success' : block.buttonType;
        if (![
          'Emphasized', 'Default', 'Transparent', 'Attention', 'Success', 'Negative',
          'Critical', 'Neutral', 'Accept', 'Reject'
        ].includes(block.buttonType)) block.buttonType = 'Emphasized';
        block._menuItems = this._parseMenuItems(block.menuItems);
        this._decorateBlockTheme(block);
      });
      const landing = this.getView().getModel('landing');
      landing.setProperty('/blocks', [...blocks]);
      landing.setProperty('/parentOptions', [
        { ID: '', label: this.getResourceBundle().getText('parentBlockNone') },
        ...blocks.map((block, index) => ({
          ID: block.ID,
          label: `${this.getResourceBundle().getText('blockTitle')} ${index + 1}`
        }))
      ]);
      if (this.getView().getModel('ui').getProperty('/blockEditorOpen')) {
        const editorIndex = blocks.findIndex((block) => block.ID === this._editedBlockId);
        if (editorIndex >= 0) {
          this.byId('blockEditorPanel').bindElement({ path: `/blocks/${editorIndex}`, model: 'landing' });
        } else {
          this.onCloseBlockEditor();
        }
      }
      this._scheduleNestedLayout();
    },

    _setThemeOptions: function (themes) {
      const bundle = this.getResourceBundle();
      const templates = [
        ...BUILTIN_THEME_TEMPLATES.map((theme) => ({ ...theme, text: bundle.getText(theme.textKey) })),
        ...themes.map((theme) => ({ ...theme, key: theme.ID, text: theme.name }))
      ];
      const landing = this.getView().getModel('landing');
      landing.setProperty('/themeTemplates', templates);
      landing.setProperty('/themeOptions', [
        ...templates.map((theme) => ({ key: theme.key, text: theme.text })),
        { key: '__create__', text: bundle.getText('themeCreateNew') }
      ]);
    },

    _deleteThemeTemplate: async function (themeId) {
      const landing = this.getView().getModel('landing');
      const ui = this.getView().getModel('ui');
      ui.setProperty('/busy', true);
      try {
        await this._adminAction(ADMIN_DELETE_THEME_URL, { themeId });
        const themes = (landing.getProperty('/themes') || []).filter((theme) => theme.ID !== themeId);
        landing.setProperty('/themes', themes);
        this._setThemeOptions(themes);

        const template = (landing.getProperty('/themeTemplates') || []).find((item) => item.key === 'light');
        const name = landing.getProperty('/themeDraft/name') || '';
        landing.setProperty('/themeTemplateKey', 'light');
        landing.setProperty('/themeDraft', { name, ...this._themeColors(template) });
        this._lastValidThemePreview = this._themeColors(template);
        this._previewThemeDraft();
        MessageToast.show(this.getResourceBundle().getText('themeDeleted'));
      } catch (error) {
        MessageBox.error(error.message);
      } finally {
        ui.setProperty('/busy', false);
      }
    },

    _themeColors: function (theme) {
      const colors = {};
      THEME_COLOR_FIELDS.forEach((field) => { colors[field] = theme[field]; });
      colors.overlayOpacity = theme.overlayOpacity;
      return colors;
    },

    _selectedPickerHex: function () {
      const picker = this.byId('themeColorPicker');
      const rgb = picker?.getRGB?.() || {};
      const values = [rgb.r ?? rgb.red ?? rgb.R, rgb.g ?? rgb.green ?? rgb.G, rgb.b ?? rgb.blue ?? rgb.B]
        .map((value) => Number(value));
      if (values.every((value) => Number.isFinite(value) && value >= 0 && value <= 255)) {
        return `#${values.map((value) => Math.round(value).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
      }

      const colorString = String(picker?.getColorString?.() || '').trim();
      if (HEX_COLOR.test(colorString)) return colorString.toUpperCase();
      const match = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i.exec(colorString);
      if (!match) return '';
      const components = match.slice(1, 4).map(Number);
      if (components.some((value) => value > 255)) return '';
      return `#${components.map((value) => value.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
    },

    _previewThemeDraft: function () {
      if (!this._themeTargetPath) return;
      const landing = this.getView().getModel('landing');
      const block = landing.getProperty(this._themeTargetPath);
      if (!block) return;

      const draft = landing.getProperty('/themeDraft') || {};
      const previous = this._lastValidThemePreview || {};
      const preview = {};
      THEME_COLOR_FIELDS.forEach((field) => {
        const value = String(draft[field] || '').trim();
        preview[field] = HEX_COLOR.test(value) ? value.toUpperCase() : previous[field];
      });
      const opacity = Number(draft.overlayOpacity);
      preview.overlayOpacity = Number.isFinite(opacity) ? Math.min(100, Math.max(0, opacity)) : previous.overlayOpacity;
      this._lastValidThemePreview = preview;
      landing.setProperty(`${this._themeTargetPath}/_customTheme`, preview);
      this.byId('landingBlocks')?.applyNestedLayout();
    },

    _restoreThemePreview: function () {
      const snapshot = this._themePreviewSnapshot;
      if (!snapshot) return;
      const landing = this.getView().getModel('landing');
      if (landing.getProperty(snapshot.path)) {
        landing.setProperty(`${snapshot.path}/_customTheme`, snapshot.customTheme);
        this.byId('landingBlocks')?.applyNestedLayout();
      }
      this._themePreviewSnapshot = null;
      this._lastValidThemePreview = null;
    },

    _decorateBlockTheme: function (block) {
      if (!block) return;
      const themes = this.getView().getModel('landing').getProperty('/themes') || [];
      block._customTheme = themes.find((theme) => theme.ID === block.theme) || null;
    },

    _createsParentCycle: function (blockId, parentBlockId, blocks) {
      const byId = new Map(blocks.map((block) => [block.ID, block]));
      const visited = new Set([blockId]);
      let currentId = parentBlockId;
      while (currentId) {
        if (visited.has(currentId)) return true;
        visited.add(currentId);
        currentId = byId.get(currentId)?.parentBlockId || '';
      }
      return false;
    },

    _editedBlockPath: function () {
      const panelPath = this.byId('blockEditorPanel')?.getBindingContext('landing')?.getPath();
      if (panelPath) return panelPath;
      const blocks = this.getView().getModel('landing').getProperty('/blocks') || [];
      const index = blocks.findIndex((block) => block.ID === this._editedBlockId);
      return index >= 0 ? `/blocks/${index}` : '';
    },

    _restoreBlockEditorSnapshot: function () {
      const snapshot = this._blockEditorSnapshot;
      if (!snapshot?.ID || !snapshot.block) return;
      const landing = this.getView().getModel('landing');
      const blocks = landing.getProperty('/blocks') || [];
      const index = blocks.findIndex((block) => block.ID === snapshot.ID);
      if (index < 0) return;
      const restoredBlock = this._clone(snapshot.block);
      restoredBlock._menuItems = this._parseMenuItems(restoredBlock.menuItems);
      this._decorateBlockTheme(restoredBlock);
      blocks[index] = restoredBlock;
      landing.setProperty('/blocks', [...blocks]);
      landing.updateBindings(true);
      this._scheduleNestedLayout();
    },

    _scheduleNestedLayout: function () {
      window.setTimeout(() => this.byId('landingBlocks')?.applyNestedLayout(), 0);
    },

    _contextIndex: function (control) {
      const path = control?.getBindingContext('landing')?.getPath() || '';
      const value = Number(path.split('/').pop());
      return Number.isInteger(value) ? value : -1;
    },

    _serializeBlock: function (block, index) {
      const keys = [
        'ID', 'blockTag', 'imageUrl', 'imageAlt', 'imageWidth', 'imageHeight', 'imagePosition',
        'imageFit', 'blockHeight', 'contentWidth', 'paddingTop', 'paddingRight', 'paddingBottom',
        'paddingLeft', 'backgroundCrop', 'blockWidth', 'parentBlockId',
        'nestedX', 'nestedY', 'nestedWidth', 'nestedHeight', 'transparentBackground',
        'textHtml', 'textAlign', 'menuItems', 'menuOrientation', 'menuGap',
        'menuFontSize', 'menuTextColor', 'menuTextEffect',
        'buttonText', 'buttonUrl', 'buttonType',
        'buttonWidth', 'buttonHeight', 'buttonBorderRadius', 'buttonAlign', 'theme'
      ];
      const result = { sortOrder: (index + 1) * 10 };
      keys.forEach((key) => { result[key] = block[key] ?? ''; });
      result.parentBlockId = block.parentBlockId || null;
      return result;
    },

    _parseMenuItems: function (value) {
      return String(value || '')
        .split(/\r?\n/)
        .slice(0, 30)
        .map((line, index) => {
          const [rawLabel, ...targetParts] = line.split('|');
          const label = String(rawLabel || '').trim();
          if (!label) return null;
          const submittedTarget = targetParts.join('|').trim();
          return {
            label: label.slice(0, 120),
            target: submittedTarget || this._normalizeBlockTag(label) || `#menu-item-${index + 1}`
          };
        })
        .filter(Boolean);
    },

    _normalizeBlockTag: function (value) {
      const normalized = String(value || '')
        .trim()
        .replace(/^#+/, '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/-{2,}/g, '-')
        .replace(/^[-_]+|[-_]+$/g, '')
        .slice(0, 80);
      return normalized ? `#${normalized}` : '';
    },

    _nextBlockTag: function (blocks, reservedTags = new Set()) {
      const usedTags = new Set([
        ...reservedTags,
        ...(blocks || []).map((block) => this._normalizeBlockTag(block.blockTag)).filter(Boolean)
      ]);
      let number = 1;
      while (usedTags.has(`#block-${number}`)) number += 1;
      return `#block-${number}`;
    },

    _currentPageBlockTag: function (target) {
      try {
        const targetUrl = new URL(target, window.location.href);
        const isCurrentPage = targetUrl.origin === window.location.origin
          && targetUrl.pathname === window.location.pathname
          && targetUrl.search === window.location.search;
        return isCurrentPage ? targetUrl.hash : '';
      } catch {
        return '';
      }
    },

    _scrollToBlockTag: function (target, updateUrl = true) {
      const blockTag = this._normalizeBlockTag(target);
      if (!blockTag) return false;
      const item = (this.byId('landingBlocks')?.getItems() || []).find((candidate) => (
        this._normalizeBlockTag(candidate.getBindingContext('landing')?.getProperty('blockTag')) === blockTag
      ));
      const element = item?.getDomRef() || Array.from(
        this.byId('landingBlocks')?.getDomRef()?.querySelectorAll('[data-block-tag]') || []
      ).find((candidate) => this._normalizeBlockTag(candidate.getAttribute('data-block-tag')) === blockTag);
      if (!element) return false;
      if (updateUrl && window.location.hash !== blockTag) {
        window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${blockTag}`);
      }
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return true;
    },

    _scrollToBlockTagWhenRendered: function (target) {
      let attempts = 0;
      const scroll = () => {
        attempts += 1;
        if (!this._scrollToBlockTag(target, false) && attempts < 5) window.setTimeout(scroll, 50);
      };
      window.setTimeout(scroll, 0);
    },

    _finishLandingEdit: function () {
      this.onCloseBlockEditor();
      const ui = this.getView().getModel('ui');
      ui.setProperty('/editMode', false);
      ui.setProperty('/showEditButton', ui.getProperty('/isAdmin'));
    },

    _clone: function (value) {
      return JSON.parse(JSON.stringify(value));
    },

    _uuid: function () {
      if (window.crypto?.randomUUID) return window.crypto.randomUUID();
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
        const random = Math.random() * 16 | 0;
        return (character === 'x' ? random : (random & 0x3 | 0x8)).toString(16);
      });
    },

    _responseJson: async function (response) {
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error?.message || this.getResourceBundle().getText('serverError'));
      return body;
    },

    getResourceBundle: function () {
      return this.getView().getModel('i18n').getResourceBundle();
    }
  });
});
