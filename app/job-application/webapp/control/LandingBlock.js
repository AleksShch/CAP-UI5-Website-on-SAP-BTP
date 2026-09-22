sap.ui.define([
  'sap/m/FlexBox',
  'sap/m/FlexBoxRenderer'
], function (FlexBox, FlexBoxRenderer) {
  'use strict';

  return FlexBox.extend('job.application.control.LandingBlock', {
    metadata: {
      properties: {
        backgroundEnabled: { type: 'boolean', defaultValue: false },
        backgroundImage: { type: 'string', defaultValue: '' },
        backgroundFit: { type: 'string', defaultValue: 'cover' },
        backgroundCrop: { type: 'string', defaultValue: 'auto' },
        blockHeight: { type: 'string', defaultValue: '30rem' },
        contentWidth: { type: 'string', defaultValue: '84rem' },
        paddingTop: { type: 'string', defaultValue: 'auto' },
        paddingRight: { type: 'string', defaultValue: 'auto' },
        paddingBottom: { type: 'string', defaultValue: 'auto' },
        paddingLeft: { type: 'string', defaultValue: 'auto' }
      }
    },

    renderer: FlexBoxRenderer,

    setBackgroundEnabled: function (value) {
      this.setProperty('backgroundEnabled', value, true);
      this._applyBlockStyles();
      return this;
    },

    setBackgroundImage: function (value) {
      this.setProperty('backgroundImage', value, true);
      this._applyBlockStyles();
      return this;
    },

    setBackgroundFit: function (value) {
      this.setProperty('backgroundFit', value, true);
      this._applyBlockStyles();
      return this;
    },

    setBackgroundCrop: function (value) {
      this.setProperty('backgroundCrop', value, true);
      this._applyBlockStyles();
      return this;
    },

    setBlockHeight: function (value) {
      this.setProperty('blockHeight', value, true);
      this._applyBlockStyles();
      return this;
    },

    setContentWidth: function (value) {
      this.setProperty('contentWidth', value, true);
      this._applyBlockStyles();
      return this;
    },

    setPaddingTop: function (value) {
      this.setProperty('paddingTop', value, true);
      this._applyBlockStyles();
      return this;
    },

    setPaddingRight: function (value) {
      this.setProperty('paddingRight', value, true);
      this._applyBlockStyles();
      return this;
    },

    setPaddingBottom: function (value) {
      this.setProperty('paddingBottom', value, true);
      this._applyBlockStyles();
      return this;
    },

    setPaddingLeft: function (value) {
      this.setProperty('paddingLeft', value, true);
      this._applyBlockStyles();
      return this;
    },

    onAfterRendering: function () {
      if (FlexBox.prototype.onAfterRendering) {
        FlexBox.prototype.onAfterRendering.apply(this, arguments);
      }

      this._applyBlockStyles();
    },

    _applyBlockStyles: function () {
      const element = this.getDomRef();
      if (!element) return;
      this._applyHorizontalPadding(element);

      const blockHeight = String(this.getBlockHeight() || '').trim();
      if (blockHeight === 'auto') {
        element.style.height = 'auto';
        element.style.minHeight = '1rem';
        this._resetCompactHeight(element);
      } else if (blockHeight) {
        element.style.height = blockHeight;
        element.style.minHeight = '1rem';
        this._fitPaddingToHeight(element);
      } else {
        element.style.removeProperty('height');
        element.style.removeProperty('min-height');
        this._resetCompactHeight(element);
      }

      const contentWidth = String(this.getContentWidth() || '').trim();
      if (contentWidth === 'auto') {
        element.style.width = 'auto';
        element.style.maxWidth = 'none';
      } else if (contentWidth) {
        element.style.width = '100%';
        element.style.maxWidth = contentWidth;
      } else {
        element.style.removeProperty('width');
        element.style.removeProperty('max-width');
      }

      const imageUrl = String(this.getBackgroundImage() || '').trim();
      if (!this.getBackgroundEnabled() || !imageUrl) {
        element.style.removeProperty('background-image');
        element.style.removeProperty('background-size');
        element.style.removeProperty('background-position');
        element.style.removeProperty('background-repeat');
        return;
      }

      element.style.backgroundImage = `url(${JSON.stringify(imageUrl)})`;
      const backgroundSize = {
        cropHeight: '100% auto',
        cropWidth: 'auto 100%'
      }[this.getBackgroundCrop()];
      element.style.backgroundSize = backgroundSize || (this.getBackgroundFit() === 'contain' ? 'contain' : 'cover');
      element.style.backgroundPosition = 'center center';
      element.style.backgroundRepeat = 'no-repeat';
    },

    _fitPaddingToHeight: function (element) {
      this._applyVerticalPadding(element);
      element.removeAttribute('data-compact-height');

      const computedStyle = window.getComputedStyle(element);
      const paddingTop = Number.parseFloat(computedStyle.paddingTop) || 0;
      const paddingBottom = Number.parseFloat(computedStyle.paddingBottom) || 0;
      const defaultPadding = paddingTop + paddingBottom;
      if (!defaultPadding) return;

      element.style.paddingTop = '0px';
      element.style.paddingBottom = '0px';
      const configuredHeight = element.getBoundingClientRect().height;
      if (!Number.isFinite(configuredHeight) || configuredHeight >= defaultPadding) {
        this._applyVerticalPadding(element);
        return;
      }

      const scale = Math.max(0, configuredHeight / defaultPadding);
      element.style.paddingTop = `${paddingTop * scale}px`;
      element.style.paddingBottom = `${paddingBottom * scale}px`;
      element.setAttribute('data-compact-height', 'true');
    },

    _resetCompactHeight: function (element) {
      this._applyVerticalPadding(element);
      element.removeAttribute('data-compact-height');
    },

    _applyVerticalPadding: function (element) {
      this._setPaddingStyle(element, 'padding-top', this.getPaddingTop());
      this._setPaddingStyle(element, 'padding-bottom', this.getPaddingBottom());
    },

    _applyHorizontalPadding: function (element) {
      this._setPaddingStyle(element, 'padding-right', this.getPaddingRight());
      this._setPaddingStyle(element, 'padding-left', this.getPaddingLeft());
    },

    _setPaddingStyle: function (element, property, value) {
      const normalized = String(value || '').trim();
      if (!normalized || normalized === 'auto') element.style.removeProperty(property);
      else element.style.setProperty(property, normalized);
    }
  });
});
