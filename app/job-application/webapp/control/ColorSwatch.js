sap.ui.define([
  'sap/m/Button',
  'sap/m/ButtonRenderer'
], function (Button, ButtonRenderer) {
  'use strict';

  const HEX_COLOR = /^#[0-9a-f]{6}$/i;

  return Button.extend('job.application.control.ColorSwatch', {
    metadata: {
      properties: {
        color: { type: 'string', defaultValue: '' }
      }
    },

    renderer: ButtonRenderer,

    init: function () {
      if (Button.prototype.init) Button.prototype.init.apply(this, arguments);
      this.setType('Transparent');
    },

    setColor: function (value) {
      this.setProperty('color', value, true);
      this._applyColor();
      return this;
    },

    onAfterRendering: function () {
      if (Button.prototype.onAfterRendering) Button.prototype.onAfterRendering.apply(this, arguments);
      this._applyColor();
    },

    _applyColor: function () {
      const inner = this.getDomRef()?.querySelector('.sapMBtnInner');
      if (!inner) return;
      const color = String(this.getColor() || '').trim();
      if (HEX_COLOR.test(color)) {
        inner.style.backgroundColor = color;
        inner.style.backgroundImage = 'none';
      } else {
        inner.style.removeProperty('background-color');
        inner.style.removeProperty('background-image');
      }
    }
  });
});
