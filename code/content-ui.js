(function(SectionRepeat) {
  'use strict';
  if (!SectionRepeat) {
    console.error('SectionRepeat namespace not found!');
    return;
  }
  SectionRepeat.ToastQueue = class ToastQueue {
    constructor() {
      this.queue = [];
      this.activeToasts = new Map();
      this.maxToasts = 2;
      this.shadowHost = null;
      this.shadowRoot = null;
      this.containerEl = null;
      this.debounceTimer = null;
      this.isProcessing = false;
      this.initShadowDOM();
    }
    initShadowDOM() {
      this.shadowHost = document.createElement('div');
      this.shadowHost.id = 'section-repeat-toast-host';
      this.shadowRoot = this.shadowHost.attachShadow({
        mode: 'open'
      });
      const styleEl = document.createElement('style');
      const fallbackStyles = `
        :host {
          --sr-toast-bg-light: rgba(25, 25, 25, 0.92);
          --sr-toast-bg-dark: rgba(32, 33, 36, 0.95);
          --sr-toast-border-dark: rgba(255, 255, 255, 0.1);
          --sr-toast-text-color: white;
          --sr-toast-icon-info: #4285f4;
          --sr-toast-icon-success: #1e8e3e;
          --sr-toast-icon-warning: #f9ab00;
          --sr-toast-icon-error: #d93025;
          --sr-toast-interactive-hover-bg: rgba(255, 255, 255, 0.1);
        }
        .toast-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
        }
        .toast {
          display: flex; align-items: center; gap: 10px; padding: 12px 20px;
          max-width: 400px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
          font-family: inherit; font-size: 1.4rem; pointer-events: all;
          background-color: var(--sr-toast-bg-light);
          color: var(--sr-toast-text-color);
          animation: slideIn 0.15s cubic-bezier(0.4, 0, 0.2, 1) forwards;
        }
        .toast.fade-out {
          animation: slideOut 0.2s cubic-bezier(0.4, 0, 0.6, 1) forwards;
        }
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(10px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes slideOut {
          from {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
          to {
            opacity: 0;
            transform: translateY(5px) scale(0.98);
          }
        }
        .toast.info .toast-icon { color: var(--sr-toast-icon-info); }
        .toast.success .toast-icon { color: var(--sr-toast-icon-success); }
        .toast.warning .toast-icon { color: var(--sr-toast-icon-warning); }
        .toast.error .toast-icon { color: var(--sr-toast-icon-error); }
        .toast-icon { width: 18px; height: 18px; flex-shrink: 0; }
        .toast-icon svg { width: 100%; height: 100%; }
        .toast-text { flex: 1; font-weight: 500; }
        .sr-close-btn { display: flex; align-items: center; justify-content: center; flex-shrink: 0; width: 24px; height: 24px; padding: 0; margin-inline-start: 8px; background: transparent; border: none; border-radius: 50%; color: inherit; opacity: 0.7; cursor: pointer; transition: opacity 0.2s, background-color 0.2s; }
        .sr-close-btn:hover, #sr-toast-interactive-btn:hover { background-color: var(--sr-toast-interactive-hover-bg); }
        .sr-close-btn svg { width: 16px; height: 16px; }
        #sr-toast-interactive-btn { margin-inline-start: 10px; padding: 4px 8px; background: transparent; border: 1px solid; border-radius: 4px; color: inherit; font-size: inherit; font-weight: inherit; cursor: pointer; }
        @media (prefers-color-scheme: dark) {
          .toast {
            background-color: var(--sr-toast-bg-dark);
            border: 1px solid var(--sr-toast-border-dark);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .toast { animation: none !important; }
          .toast.fade-out { opacity: 0; }
        }
      `;
      styleEl.textContent = fallbackStyles;
      this.shadowRoot.appendChild(styleEl);
      this.containerEl = document.createElement('div');
      this.containerEl.className = 'toast-container';
      this.containerEl.setAttribute('role', 'region');
      this.containerEl.setAttribute('aria-live', 'polite');
      this.containerEl.setAttribute('aria-atomic', 'true');
      const label = SectionRepeat.helpers.t('aria_toast_container_label');
      this.containerEl.setAttribute('aria-label', label);
      this.shadowRoot.appendChild(this.containerEl);
      document.body.appendChild(this.shadowHost);
    }
    getIcon(type) {
      const {
        State
      } = SectionRepeat;
      if (!State?.CONSTANTS?.ICONS) return '';
      const icons = {
        info: State.CONSTANTS.ICONS.INFO,
        success: State.CONSTANTS.ICONS.SUCCESS,
        warning: State.CONSTANTS.ICONS.WARNING,
        error: State.CONSTANTS.ICONS.ERROR,
        close: State.CONSTANTS.ICONS.CLOSE,
      };
      return icons[type] || icons.info;
    }
    show(message, duration = 3000, type = 'info', options = {}) {
      const toastData = {
        message,
        duration,
        type,
        options,
        id: Date.now() + Math.random()
      };
      this.addToQueue(toastData);
      this.processQueue();
      return toastData.id;
    }
    addToQueue(toast) {
      const isDuplicate = typeof toast.message === 'string' &&
        (this.queue.some(t => t.message === toast.message) ||
          Array.from(this.activeToasts.values()).some(t => t.data.message === toast.message));
      if (!isDuplicate) {
        this.queue.push(toast);
        const maxQueueSize = SectionRepeat.State?.CONSTANTS?.TOAST_QUEUE?.MAX_SIZE || 5;
        if (this.queue.length > maxQueueSize) {
          this.queue.shift();
        }
      }
    }
    processQueue() {
      if (this.isProcessing || this.queue.length === 0 || this.activeToasts.size >= this.maxToasts) {
        return;
      }
      this.isProcessing = true;
      const toast = this.queue.shift();
      this.displayToast(toast);
      this.isProcessing = false;
      if (this.queue.length > 0) {
        SectionRepeat.TimerManager.set(() => this.processQueue(), 200);
      }
    }
    displayToast(toast) {
      const TimerManager = SectionRepeat.TimerManager;
      const toastEl = document.createElement('div');
      toastEl.className = `toast ${toast.type}`;
      toastEl.setAttribute('role', 'alert');
      const iconEl = document.createElement('div');
      iconEl.className = 'toast-icon';
      iconEl.innerHTML = this.getIcon(toast.type);
      const textEl = document.createElement('div');
      textEl.className = 'toast-text';
      textEl.textContent = toast.message;
      toastEl.appendChild(iconEl);
      toastEl.appendChild(textEl);
      const toastId = toast.id;
      let removeTimer = null;
      let handleKeyDown = null;
      let focusTrap = null;

      const closeToastAndRestoreFocus = () => {
        this.removeToast(toastEl, toastId);
        focusTrap?.cleanup();
        if (handleKeyDown) {
          toastEl.removeEventListener('keydown', handleKeyDown);
        }
      };

      if (toast.options.isPermanent || toast.options.isInteractive) {
        handleKeyDown = (e) => {
          if (e.key === 'Escape') {
            closeToastAndRestoreFocus();
          }
        };
        toastEl.setAttribute('tabindex', '-1');
        toastEl.addEventListener('keydown', handleKeyDown);

        if (toast.options.isPermanent) {
          const closeBtn = document.createElement('button');
          closeBtn.className = 'sr-close-btn';
          closeBtn.setAttribute('aria-label', SectionRepeat.helpers.t('aria_toast_close_button'));
          closeBtn.innerHTML = this.getIcon('close');
          closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            closeToastAndRestoreFocus();
          });
          toastEl.appendChild(closeBtn);
        } else if (toast.options.isInteractive && toast.options.actionKey && toast.options.actionCallback) {
          const btn = document.createElement('button');
          btn.id = 'sr-toast-interactive-btn';
          btn.textContent = SectionRepeat.helpers.t(toast.options.actionKey);
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            toast.options.actionCallback();
            closeToastAndRestoreFocus();
          });
          toastEl.appendChild(btn);
        }
        if (toast.options.isInteractive || toast.options.isPermanent) {
          focusTrap = new SectionRepeat.ModalFocusTrap(toastEl);
          focusTrap.init();
        }
      } else {
        removeTimer = TimerManager.set(() => this.removeToast(toastEl, toastId), toast.duration);
        toastEl.addEventListener('click', () => {
          TimerManager.clear(removeTimer);
          this.removeToast(toastEl, toastId);
        });
      }
      this.containerEl.appendChild(toastEl);
      this.activeToasts.set(toastId, {
        data: toast,
        el: toastEl,
        keydownHandler: handleKeyDown
      });
    }
    removeToast(toastEl, toastId) {
      if (!toastEl || !toastEl.parentNode) return;

      const activeToast = this.activeToasts.get(toastId);
      if (activeToast && activeToast.keydownHandler) {
        activeToast.el.removeEventListener('keydown', activeToast.keydownHandler);
      }

      toastEl.classList.add('fade-out');
      SectionRepeat.TimerManager.set(() => {
        if (toastEl.parentNode) toastEl.remove();
        this.activeToasts.delete(toastId);
        this.processQueue();
      }, 200);
    }
    remove(toastId) {
      const activeToast = this.activeToasts.get(toastId);
      if (activeToast) {
        this.removeToast(activeToast.el, toastId);
      }
    }
    cleanup() {
      if (this.debounceTimer) {
        SectionRepeat.TimerManager.clear(this.debounceTimer);
      }
      this.activeToasts.clear();
      if (this.shadowHost?.parentNode) {
        this.shadowHost.remove();
      }
      this.queue = [];
    }
  };
})(window.SectionRepeat);