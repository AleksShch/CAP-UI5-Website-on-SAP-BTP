sap.ui.define([
  'sap/m/FlexBox',
  'sap/m/FlexBoxRenderer'
], function (FlexBox, FlexBoxRenderer) {
  'use strict';

  return FlexBox.extend('job.application.control.BlockMenu', {
    metadata: {
      properties: {
        menuGap: { type: 'string', defaultValue: '1.5rem' },
        fontSize: { type: 'string', defaultValue: '1rem' },
        textColor: { type: 'string', defaultValue: '' },
        textEffect: { type: 'string', defaultValue: 'none' }
      }
    },

    renderer: FlexBoxRenderer,

    setMenuGap: function (value) {
      this.setProperty('menuGap', value, true);
      this._applyAppearance();
      return this;
    },

    setFontSize: function (value) {
      this.setProperty('fontSize', value, true);
      this._applyAppearance();
      return this;
    },

    setTextColor: function (value) {
      this.setProperty('textColor', value, true);
      this._applyAppearance();
      return this;
    },

    setTextEffect: function (value) {
      this.setProperty('textEffect', value, true);
      this._applyAppearance();
      return this;
    },

    onAfterRendering: function () {
      if (FlexBox.prototype.onAfterRendering) FlexBox.prototype.onAfterRendering.apply(this, arguments);
      this._applyAppearance();
    },

    _applyAppearance: function () {
      const element = this.getDomRef();
      if (!element) return;
      const gap = String(this.getMenuGap() || '').trim();
      if (gap) element.style.gap = gap;
      else element.style.removeProperty('gap');

      const fontSize = String(this.getFontSize() || '').trim();
      if (fontSize) element.style.setProperty('--landing-menu-font-size', fontSize);
      else element.style.removeProperty('--landing-menu-font-size');

      const textColor = String(this.getTextColor() || '').trim();
      if (textColor) {
        element.style.setProperty('--landing-menu-text-color', textColor);
        element.setAttribute('data-color-override', 'true');
      } else {
        element.style.removeProperty('--landing-menu-text-color');
        element.removeAttribute('data-color-override');
      }
      element.setAttribute('data-text-effect', String(this.getTextEffect() || 'none'));
    }
  });
});
