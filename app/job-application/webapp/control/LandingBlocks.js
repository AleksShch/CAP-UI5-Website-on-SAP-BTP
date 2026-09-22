sap.ui.define([
  'sap/m/VBox',
  'sap/m/FlexBoxRenderer'
], function (VBox, FlexBoxRenderer) {
  'use strict';

  function percentage(value, fallback, minimum) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(100, Math.max(minimum, number));
  }

  function directBlockElement(shellElement) {
    return Array.from(shellElement?.children || []).find((element) => element.classList.contains('landingBlock')) || null;
  }

  function directToolbarElement(shellElement) {
    return Array.from(shellElement?.children || []).find((element) => element.classList.contains('blockMoveToolbar')) || null;
  }

  function clamp(value, maximum) {
    return Math.min(Math.max(0, maximum), Math.max(0, value));
  }

  function overlayColor(hexColor, opacity) {
    const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hexColor || ''));
    if (!match) return 'rgba(4, 18, 31, 0.45)';
    const alpha = Math.min(100, Math.max(0, Number(opacity) || 0)) / 100;
    return `rgba(${parseInt(match[1], 16)}, ${parseInt(match[2], 16)}, ${parseInt(match[3], 16)}, ${alpha})`;
  }

  function applyTheme(element, theme) {
    const properties = [
      '--landing-theme-background', '--landing-theme-text', '--landing-theme-heading',
      '--landing-theme-accent', '--landing-theme-link', '--landing-theme-button-background',
      '--landing-theme-button-text', '--landing-theme-button-border', '--landing-theme-border',
      '--landing-theme-overlay'
    ];
    properties.forEach((property) => element.style.removeProperty(property));
    element.removeAttribute('data-custom-theme');
    if (!theme) return;

    element.setAttribute('data-custom-theme', 'true');
    element.style.setProperty('--landing-theme-background', theme.backgroundColor);
    element.style.setProperty('--landing-theme-text', theme.textColor);
    element.style.setProperty('--landing-theme-heading', theme.headingColor);
    element.style.setProperty('--landing-theme-accent', theme.accentColor);
    element.style.setProperty('--landing-theme-link', theme.linkColor);
    element.style.setProperty('--landing-theme-button-background', theme.buttonBackgroundColor);
    element.style.setProperty('--landing-theme-button-text', theme.buttonTextColor);
    element.style.setProperty('--landing-theme-button-border', theme.buttonBorderColor);
    element.style.setProperty('--landing-theme-border', theme.borderColor);
    element.style.setProperty('--landing-theme-overlay', overlayColor(theme.overlayColor, theme.overlayOpacity));
  }

  return VBox.extend('job.application.control.LandingBlocks', {
    renderer: FlexBoxRenderer,

    onBeforeRendering: function () {
      this._detachToolbarDragging();
      if (VBox.prototype.onBeforeRendering) VBox.prototype.onBeforeRendering.apply(this, arguments);
    },

    onAfterRendering: function () {
      if (VBox.prototype.onAfterRendering) VBox.prototype.onAfterRendering.apply(this, arguments);
      this._attachToolbarDragging();
      this.applyNestedLayout();
    },

    applyNestedLayout: function () {
      const container = this.getDomRef();
      if (!container) return;

      const records = this.getItems().map((item) => ({
        item,
        element: item.getDomRef(),
        block: item.getBindingContext('landing')?.getObject()
      })).filter((record) => record.element && record.block?.ID);
      const byId = new Map(records.map((record) => [record.block.ID, record]));

      records.forEach(({ element, block }) => {
        container.appendChild(element);
        applyTheme(element, block._customTheme);
        element.removeAttribute('data-is-nested');
        element.style.removeProperty('position');
        element.style.removeProperty('left');
        element.style.removeProperty('top');
        element.style.removeProperty('width');
        element.style.removeProperty('height');
        element.style.removeProperty('z-index');
      });

      const depthOf = (record, visited = new Set()) => {
        const parentId = record.block.parentBlockId;
        if (!parentId || visited.has(parentId)) return 0;
        const parent = byId.get(parentId);
        if (!parent) return 0;
        visited.add(parentId);
        return 1 + depthOf(parent, visited);
      };

      const hasValidParentChain = (record) => {
        const visited = new Set([record.block.ID]);
        let parentId = record.block.parentBlockId;
        while (parentId) {
          if (visited.has(parentId)) return false;
          const parent = byId.get(parentId);
          if (!parent) return false;
          visited.add(parentId);
          parentId = parent.block.parentBlockId;
        }
        return true;
      };

      records.forEach((record) => {
        const parentId = record.block.parentBlockId;
        const parent = parentId && parentId !== record.block.ID ? byId.get(parentId) : null;
        if (!parent || !hasValidParentChain(record)) return;

        const parentBlockElement = directBlockElement(parent.element);
        if (!parentBlockElement) return;

        const x = percentage(record.block.nestedX, 25, 0);
        const y = percentage(record.block.nestedY, 25, 0);
        const width = Math.min(percentage(record.block.nestedWidth, 50, 1), 100 - x);
        const height = Math.min(percentage(record.block.nestedHeight, 50, 1), 100 - y);

        record.element.setAttribute('data-is-nested', 'true');
        record.element.style.position = 'absolute';
        record.element.style.left = `${x}%`;
        record.element.style.top = `${y}%`;
        record.element.style.width = `${Math.max(1, width)}%`;
        record.element.style.height = `${Math.max(1, height)}%`;
        record.element.style.zIndex = String(10 + depthOf(record));
        parentBlockElement.appendChild(record.element);
      });

      this._applyToolbarPositions(records);
    },

    _blockRecords: function () {
      return this.getItems().map((item) => ({
        item,
        element: item.getDomRef(),
        block: item.getBindingContext('landing')?.getObject()
      })).filter((record) => record.element && record.block?.ID);
    },

    _attachToolbarDragging: function () {
      const container = this.getDomRef();
      if (!container) return;

      this._toolbarPointerDown = this._onToolbarPointerDown.bind(this);
      container.addEventListener('pointerdown', this._toolbarPointerDown, true);
      this._toolbarEventContainer = container;
      if (window.MutationObserver) {
        this._toolbarObserver = new window.MutationObserver(() => this._applyToolbarPositions());
        this._toolbarObserver.observe(container, { childList: true, subtree: true });
      }
    },

    _detachToolbarDragging: function () {
      this._stopToolbarDrag();
      if (this._toolbarEventContainer && this._toolbarPointerDown) {
        this._toolbarEventContainer.removeEventListener('pointerdown', this._toolbarPointerDown, true);
      }
      this._toolbarObserver?.disconnect();
      this._toolbarEventContainer = null;
      this._toolbarPointerDown = null;
      this._toolbarObserver = null;
    },

    _applyToolbarPositions: function (records = this._blockRecords()) {
      this._toolbarPositions ||= new Map();
      const currentBlockIds = new Set(records.map(({ block }) => block.ID));
      Array.from(this._toolbarPositions.keys()).forEach((blockId) => {
        if (!currentBlockIds.has(blockId)) this._toolbarPositions.delete(blockId);
      });

      records.forEach(({ element: shell, block }) => {
        const toolbar = directToolbarElement(shell);
        if (!toolbar) return;

        if (toolbar.dataset.toolbarBlockId && toolbar.dataset.toolbarBlockId !== block.ID) {
          toolbar.style.removeProperty('left');
          toolbar.style.removeProperty('top');
          toolbar.style.removeProperty('right');
        }
        toolbar.dataset.toolbarBlockId = block.ID;
        const savedPosition = this._toolbarPositions.get(block.ID);
        if (savedPosition) this._placeToolbar(shell, toolbar, savedPosition.left, savedPosition.top);
      });
    },

    _onToolbarPointerDown: function (event) {
      const target = event.composedPath?.().find((element) => element?.nodeType === 1) || event.target;
      const toolbar = target?.closest?.('.blockMoveToolbar');
      const shell = toolbar?.closest?.('.landingBlockShell');
      const dragHandle = target?.closest?.('.blockToolbarDragHandle, .blockToolbarDragTitle');
      if (!toolbar || !shell || !dragHandle || (event.button !== undefined && event.button !== 0)) return;

      const blockKey = toolbar.dataset.toolbarBlockId || toolbar.id || shell.id;
      if (!blockKey) return;

      event.preventDefault();
      event.stopPropagation();
      this._stopToolbarDrag();

      const shellRect = shell.getBoundingClientRect();
      const toolbarRect = toolbar.getBoundingClientRect();
      this._activeToolbarDrag = {
        pointerId: event.pointerId,
        shell,
        toolbar,
        blockKey,
        previousDraggable: shell.getAttribute('draggable'),
        startPointerX: event.clientX,
        startPointerY: event.clientY,
        startLeft: toolbarRect.left - shellRect.left,
        startTop: toolbarRect.top - shellRect.top
      };

      toolbar.dataset.toolbarDragging = 'true';
      toolbar.style.right = 'auto';
      shell.setAttribute('draggable', 'false');
      try {
        toolbar.setPointerCapture?.(event.pointerId);
      } catch (_error) {
        // Window listeners below still keep the drag active in older browsers.
      }
      this._toolbarPointerMove = this._onToolbarPointerMove.bind(this);
      this._toolbarPointerUp = this._stopToolbarDrag.bind(this);
      window.addEventListener('pointermove', this._toolbarPointerMove, { passive: false });
      window.addEventListener('pointerup', this._toolbarPointerUp);
      window.addEventListener('pointercancel', this._toolbarPointerUp);
    },

    _onToolbarPointerMove: function (event) {
      const drag = this._activeToolbarDrag;
      if (!drag || event.pointerId !== drag.pointerId) return;
      event.preventDefault();
      const position = this._placeToolbar(
        drag.shell,
        drag.toolbar,
        drag.startLeft + event.clientX - drag.startPointerX,
        drag.startTop + event.clientY - drag.startPointerY
      );
      this._toolbarPositions.set(drag.blockKey, position);
    },

    _stopToolbarDrag: function (event) {
      const drag = this._activeToolbarDrag;
      if (event && drag && event.pointerId !== drag.pointerId) return;
      if (this._toolbarPointerMove) window.removeEventListener('pointermove', this._toolbarPointerMove);
      if (this._toolbarPointerUp) {
        window.removeEventListener('pointerup', this._toolbarPointerUp);
        window.removeEventListener('pointercancel', this._toolbarPointerUp);
      }
      if (drag) {
        try {
          if (drag.toolbar.hasPointerCapture?.(drag.pointerId)) drag.toolbar.releasePointerCapture(drag.pointerId);
        } catch (_error) {
          // The browser can release capture automatically before pointerup is handled.
        }
        drag.toolbar.removeAttribute('data-toolbar-dragging');
        if (drag.previousDraggable === null) drag.shell.removeAttribute('draggable');
        else drag.shell.setAttribute('draggable', drag.previousDraggable);
      }
      this._activeToolbarDrag = null;
      this._toolbarPointerMove = null;
      this._toolbarPointerUp = null;
    },

    _placeToolbar: function (shell, toolbar, requestedLeft, requestedTop) {
      const shellRect = shell.getBoundingClientRect();
      const toolbarRect = toolbar.getBoundingClientRect();
      const left = clamp(requestedLeft, shellRect.width - toolbarRect.width);
      const top = clamp(requestedTop, shellRect.height - toolbarRect.height);
      toolbar.style.left = `${left}px`;
      toolbar.style.top = `${top}px`;
      toolbar.style.right = 'auto';
      return { left, top };
    }
  });
});
