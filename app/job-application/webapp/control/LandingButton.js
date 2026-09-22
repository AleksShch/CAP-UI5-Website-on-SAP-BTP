sap.ui.define([
  'sap/m/Button',
  'sap/m/ButtonRenderer'
], function (Button, ButtonRenderer) {
  'use strict';

  return Button.extend('job.application.control.LandingButton', {
    metadata: {
      properties: {
        buttonHeight: { type: 'string', defaultValue: '3.25rem' },
        borderRadius: { type: 'string', defaultValue: '0.25rem' }
      }
    },

    renderer: ButtonRenderer,

    setButtonHeight: function (value) {
      this.setProperty('buttonHeight', value, true);
      this._applyButtonHeight();
      return this;
    },

    setBorderRadius: function (value) {
      this.setProperty('borderRadius', value, true);
      this._applyBorderRadius();
      return this;
    },

    onAfterRendering: function () {
      if (Button.prototype.onAfterRendering) Button.prototype.onAfterRendering.apply(this, arguments);
      this._applyButtonHeight();
      this._applyBorderRadius();
    },

    _applyButtonHeight: function () {
      const root = this.getDomRef();
      const inner = root?.querySelector('.sapMBtnInner');
      if (!root || !inner) return;
      const value = String(this.getButtonHeight() || '').trim();
      if (!value || value === 'auto') {
        root.style.removeProperty('height');
        inner.style.removeProperty('height');
        inner.style.removeProperty('min-height');
        return;
      }
      root.style.height = value;
      inner.style.height = value;
      inner.style.minHeight = value;
    },

    _applyBorderRadius: function () {
      const inner = this.getDomRef()?.querySelector('.sapMBtnInner');
      if (!inner) return;
      const value = String(this.getBorderRadius() || '').trim();
      if (value) inner.style.borderRadius = value;
      else inner.style.removeProperty('border-radius');
    }
  });
});
