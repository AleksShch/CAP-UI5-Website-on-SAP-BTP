sap.ui.define([
  'sap/m/Panel',
  'sap/m/PanelRenderer'
], function (Panel, PanelRenderer) {
  'use strict';

  return Panel.extend('job.application.control.FloatingPanel', {
    renderer: PanelRenderer,

    init: function () {
      if (Panel.prototype.init) Panel.prototype.init.apply(this, arguments);
      this._onDragStartBound = this._onDragStart.bind(this);
      this._onDragMoveBound = this._onDragMove.bind(this);
      this._onDragEndBound = this._onDragEnd.bind(this);
    },

    onBeforeRendering: function () {
      this._detachDragHandle();
      if (Panel.prototype.onBeforeRendering) Panel.prototype.onBeforeRendering.apply(this, arguments);
    },

    onAfterRendering: function () {
      if (Panel.prototype.onAfterRendering) Panel.prototype.onAfterRendering.apply(this, arguments);

      const element = this.getDomRef();
      const handle = element?.querySelector('.blockEditorDragHandle');
      if (handle) {
        this._dragHandle = handle;
        handle.addEventListener('pointerdown', this._onDragStartBound);
      }

      if (this._floatingPosition && element) {
        this._applyPosition(element, this._floatingPosition.left, this._floatingPosition.top);
      }
    },

    exit: function () {
      this._detachDragHandle();
      this._detachDocumentDragEvents();
      if (Panel.prototype.exit) Panel.prototype.exit.apply(this, arguments);
    },

    _onDragStart: function (event) {
      if (event.button !== 0 || event.target.closest('.sapMBtn, button, a, input, select, textarea')) return;

      const element = this.getDomRef();
      if (!element) return;
      const rect = element.getBoundingClientRect();
      this._dragOffset = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
      };
      this._dragHandle?.setPointerCapture?.(event.pointerId);
      document.addEventListener('pointermove', this._onDragMoveBound);
      document.addEventListener('pointerup', this._onDragEndBound, { once: true });
      document.addEventListener('pointercancel', this._onDragEndBound, { once: true });
      element.setAttribute('data-dragging', 'true');
      event.preventDefault();
    },

    _onDragMove: function (event) {
      const element = this.getDomRef();
      if (!element || !this._dragOffset) return;
      this._applyPosition(element, event.clientX - this._dragOffset.x, event.clientY - this._dragOffset.y);
    },

    _onDragEnd: function () {
      this.getDomRef()?.removeAttribute('data-dragging');
      this._dragOffset = null;
      this._detachDocumentDragEvents();
    },

    _applyPosition: function (element, requestedLeft, requestedTop) {
      const rect = element.getBoundingClientRect();
      const maxLeft = Math.max(0, window.innerWidth - rect.width);
      const maxTop = Math.max(0, window.innerHeight - Math.min(rect.height, window.innerHeight));
      const left = Math.min(maxLeft, Math.max(0, requestedLeft));
      const top = Math.min(maxTop, Math.max(0, requestedTop));
      element.style.left = `${left}px`;
      element.style.top = `${top}px`;
      element.style.right = 'auto';
      element.style.transform = 'none';
      this._floatingPosition = { left, top };
    },

    _detachDragHandle: function () {
      this._dragHandle?.removeEventListener('pointerdown', this._onDragStartBound);
      this._dragHandle = null;
    },

    _detachDocumentDragEvents: function () {
      document.removeEventListener('pointermove', this._onDragMoveBound);
      document.removeEventListener('pointerup', this._onDragEndBound);
      document.removeEventListener('pointercancel', this._onDragEndBound);
    }
  });
});
