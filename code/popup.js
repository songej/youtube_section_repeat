const KEY_CODES = {
  ARROW_DOWN: 'ArrowDown',
  ARROW_UP: 'ArrowUp',
  HOME: 'Home',
  END: 'End',
  ENTER: 'Enter',
  SPACE: ' ',
  ESCAPE: 'Escape',
  TAB: 'Tab'
};

class GridFocusManager {
  constructor(container) {
    this.container = container;
    this.focusableElements = null;
    this.firstFocusable = null;
    this.lastFocusable = null;
    this.handleKeyDown = this.handleKeyDown.bind(this);
  }
  init() {
    this.updateFocusableElements();
    if (this.firstFocusable) {
      this.container.addEventListener('keydown', this.handleKeyDown);
    }
  }
  updateFocusableElements() {
    this.focusableElements = this.container.querySelectorAll(
      '[data-focusable], button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (this.focusableElements.length > 0) {
      this.firstFocusable = this.focusableElements[0];
      this.lastFocusable = this.focusableElements[this.focusableElements.length - 1];
    }
  }
  handleKeyDown(e) {
    if (e.key !== KEY_CODES.TAB) return;
    const isShiftPressed = e.shiftKey;
    const activeElement = document.activeElement;
    if (Array.from(this.focusableElements).indexOf(activeElement) === -1) return;

    if (isShiftPressed) {
      if (activeElement === this.firstFocusable) {
        this.lastFocusable.focus();
        e.preventDefault();
      }
    } else {
      if (activeElement === this.lastFocusable) {
        this.firstFocusable.focus();
        e.preventDefault();
      }
    }
  }
  cleanup() {
    this.container.removeEventListener('keydown', this.handleKeyDown);
  }
}

function formatKeyCode(code) {
  const keyMappings = {
    'ArrowUp': chrome.i18n.getMessage('popup_shortcut_key_arrow_up'),
    'ArrowDown': chrome.i18n.getMessage('popup_shortcut_key_arrow_down'),
    'ArrowLeft': chrome.i18n.getMessage('popup_shortcut_key_arrow_left'),
    'ArrowRight': chrome.i18n.getMessage('popup_shortcut_key_arrow_right'),
    'Space': chrome.i18n.getMessage('popup_shortcut_key_space'),
  };

  if (keyMappings[code]) {
    return keyMappings[code];
  }

  if (code.startsWith('Key')) return code.substring(3);
  if (code.startsWith('Digit')) return code.substring(5);

  return code;
}


class PopupManager {
  constructor() {
    this.CONSTS = null;
    this.lastFocusedRowIndex = -1;
    this.initialTimeout = 5000;
    this.mainUiTrap = null;
    this.dialogTrap = null;
  }
  async sendMessage(message, retries = 2) {
    // content-utils.js의 견고한 재시도 및 타임아웃 로직으로 교체
    const timeout = this.CONSTS?.TIMING?.TIMEOUT?.POPUP_MESSAGE || 5000;
    const delay = this.CONSTS?.TIMING?.RETRY?.DEFAULT_DELAY_MS || 200;
    const backoff = this.CONSTS?.TIMING?.RETRY?.DEFAULT_BACKOFF_MULTIPLIER || 1.5;

    for (let i = 0; i <= retries; i++) {
      try {
        if (!chrome.runtime?.id) {
          throw new Error("Extension context invalidated.");
        }
        const response = await Promise.race([
          new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(message, (response) => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
              } else {
                resolve(response);
              }
            });
          }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Response timeout')), timeout)
          )
        ]);
        return response;
      } catch (e) {
        if (i === retries) {
          console.error('[Section Repeat] Popup failed to send message or connect:', e);
          const isTimeout = e.message.includes('timeout');
          const errorMessage = isTimeout ?
            chrome.i18n.getMessage("popup_error_connection_timeout") :
            chrome.i18n.getMessage("popup_error_connection_failed");
          this.showPopupError(errorMessage, true);
          throw e;
        }
        await new Promise(res => setTimeout(res, delay * Math.pow(backoff, i)));
      }
    }
  }
  populatei18n() {
    const uiLocale = chrome.i18n.getUILanguage();
    document.documentElement.lang = uiLocale;
    // RTL 처리는 popup.html의 dir="auto"에 위임
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.dataset.i18n;
      let message = chrome.i18n.getMessage(key) || `__${key}__`;
      if (el.hasAttribute('aria-label')) {
        el.setAttribute('aria-label', message);
      } else {
        el.textContent = message;
      }
    });
    document.querySelectorAll('[data-i18n-attrs]').forEach((el) => {
      const attrs = el.dataset.i18nAttrs.split(';');
      attrs.forEach(attr => {
        const [attrName, key] = attr.split(':');
        const message = chrome.i18n.getMessage(key);
        if (message) {
          el.setAttribute(attrName, message);
        }
      });
    });
  }

  populateHotkeys() {
    if (this.CONSTS && this.CONSTS.HOTKEYS) {
      for (const [action, code] of Object.entries(this.CONSTS.HOTKEYS)) {
        const el = document.getElementById(action);
        if (el) {
          const formattedKey = formatKeyCode(code);
          el.textContent = formattedKey;
          el.classList.remove('loading');

          try {
            const row = el.closest('[role="row"]');
            const actionCell = row.querySelector('[role="gridcell"][aria-describedby="header-action"]');
            if (actionCell) {
              const actionText = actionCell.textContent;
              const fullLabel = chrome.i18n.getMessage('aria_popup_shortcut_row_label', [formattedKey, actionText]);
              el.setAttribute('aria-label', fullLabel);
            }
          } catch (e) {}
        }
      }
    } else {
      const errorText = chrome.i18n.getMessage('popup_hotkey_error_placeholder') || '-';
      document.querySelectorAll('.hotkey-placeholder.loading').forEach(el => {
        el.classList.remove('loading');
        el.textContent = errorText;
        el.style.color = 'var(--toast-icon-error)';
        el.style.backgroundColor = 'transparent';
      });
    }
  }

  showPopupError(message, isCritical = false) {
    const errorContainer = document.getElementById('popup-error-container');
    if (!errorContainer) return;

    const previouslyFocusedElement = document.activeElement;

    while (errorContainer.firstChild) {
      errorContainer.removeChild(errorContainer.firstChild);
    }
    errorContainer.appendChild(document.createTextNode(message));
    errorContainer.classList.remove('hidden');

    let timeoutId = null;
    let handleKeydown;

    const closeAndCleanup = () => {
      errorContainer.classList.add('hidden');
      if (timeoutId) clearTimeout(timeoutId);
      if (handleKeydown) document.removeEventListener('keydown', handleKeydown);

      if (previouslyFocusedElement && typeof previouslyFocusedElement.focus === 'function') {
        previouslyFocusedElement.focus();
      }
    };

    if (!isCritical) {
      const displayTime = this.CONSTS?.TIMING?.TIMEOUT?.POPUP_ERROR_DISPLAY || 5000;
      timeoutId = setTimeout(closeAndCleanup, displayTime);
    }

    handleKeydown = (e) => {
      if (e.key === KEY_CODES.ESCAPE) {
        closeAndCleanup();
      }
    };

    const closeButton = document.createElement('button');
    closeButton.innerHTML = `<svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>`;
    closeButton.className = 'sr-close-btn popup-error-close-btn';
    closeButton.setAttribute('aria-label', chrome.i18n.getMessage('aria_toast_close_button'));
    closeButton.onclick = closeAndCleanup;

    errorContainer.appendChild(closeButton);
    document.addEventListener('keydown', handleKeydown);

    closeButton.focus();
  }
  checkStorageStatus(storageInfo) {
    if (storageInfo.setup_failed) {
      return 'critical-error';
    }
    if (storageInfo.setup_error_type === this.CONSTS.ERROR_TYPES.CRYPTO_API_FAILED) {
      return 'session-only';
    }
    return 'ok';
  }
  displaySessionOnlyWarningUI() {
    const container = document.getElementById('storage-status-container');
    if (!container) return;
    const warningEl = document.createElement('div');
    warningEl.className = 'storage-warning';
    warningEl.textContent = chrome.i18n.getMessage('popup_warning_session_only_mode_detailed');
    container.innerHTML = '';
    container.appendChild(warningEl);
  }
  displayStorageWarningUI(storageInfo) {
    const container = document.getElementById('storage-status-container');
    if (!container) return;
    container.innerHTML = '';
    if (storageInfo.percent > 90) {
      const warningEl = document.createElement('div');
      warningEl.className = 'storage-warning';
      warningEl.textContent = chrome.i18n.getMessage('popup_storage_warning_message', [storageInfo.percent]);
      const purgeButton = document.createElement('button');
      purgeButton.className = 'button-primary';
      purgeButton.textContent = chrome.i18n.getMessage('popup_storage_purge_button');
      purgeButton.setAttribute('aria-label', chrome.i18n.getMessage('aria_popup_storage_purge_button_label'));
      purgeButton.setAttribute('data-focusable', '');
      purgeButton.onclick = () => this.showPurgeConfirmDialog();
      container.appendChild(warningEl);
      container.appendChild(purgeButton);
    }
  }
  showPurgeConfirmDialog() {
    const dialog = document.getElementById('purge-confirm-dialog');
    const confirmBtn = document.getElementById('dialog-confirm-btn');
    const cancelBtn = document.getElementById('dialog-cancel-btn');
    const mainUi = document.getElementById('main-ui');
    const previouslyFocusedElement = document.activeElement;

    if (this.dialogTrap) this.dialogTrap.cleanup();
    this.dialogTrap = new GridFocusManager(dialog);
    this.dialogTrap.init();

    const closeDialog = () => {
      dialog.classList.add('hidden');
      mainUi.removeAttribute('aria-hidden');
      confirmBtn.removeEventListener('click', handleConfirm);
      cancelBtn.removeEventListener('click', closeDialog);
      if (this.dialogTrap) {
        this.dialogTrap.cleanup();
        this.dialogTrap = null;
      }
      document.removeEventListener('keydown', handleEsc);
      previouslyFocusedElement?.focus();
    };

    const handleConfirm = async () => {
      try {
        const response = await this.sendMessage({
          type: this.CONSTS.MESSAGE_TYPES.FORCE_PURGE
        });
        if (response?.success && response.purged) {
          this.showPopupError(chrome.i18n.getMessage('popup_storage_purge_completed'), false);
        } else {
          throw new Error(response?.error || 'Purge failed in background.');
        }
      } catch (e) {
        const errorMessage = e.message === 'lock_busy' ?
          chrome.i18n.getMessage('toast_error_action_locked') :
          chrome.i18n.getMessage('popup_storage_purge_failed');
        this.showPopupError(errorMessage, true);
      } finally {
        closeDialog();
      }
    };

    const handleEsc = (e) => {
      if (e.key === KEY_CODES.ESCAPE) closeDialog();
    };

    confirmBtn.addEventListener('click', handleConfirm);
    cancelBtn.addEventListener('click', closeDialog);
    document.addEventListener('keydown', handleEsc);

    mainUi.setAttribute('aria-hidden', 'true');
    dialog.classList.remove('hidden');
    confirmBtn.focus();
  }

  renderUI(state, data = {}) {
    if (!this.CONSTS) {
      console.error("[Section Repeat] CRITICAL: Constants not loaded. Cannot render UI.");
      this.displayCriticalFailureUI(
        chrome.i18n.getMessage("dialog_critical_error_guidance_with_reinstall")
      );
      return;
    }

    document.getElementById('main-ui').classList.add('hidden');
    document.getElementById('inactive-ui').classList.add('hidden');
    document.getElementById('error-ui').classList.add('hidden');

    if (this.mainUiTrap) {
      this.mainUiTrap.cleanup();
      this.mainUiTrap = null;
    }

    switch (state) {
      case 'active':
        if (data.storageInfo === undefined || data.showSessionOnlyWarning === undefined) {
          console.error("renderUI 'active' state requires 'storageInfo' and 'showSessionOnlyWarning'");
          this.renderUI('critical-error', {
            errorMessage: 'Internal popup error.',
            errorType: 'unknown'
          });
          return;
        }
        const mainUi = document.getElementById('main-ui');
        mainUi.classList.remove('hidden');

        if (data.showSessionOnlyWarning) {
          this.displaySessionOnlyWarningUI();
        } else if (data.storageInfo?.percent > 90) {
          this.displayStorageWarningUI(data.storageInfo);
        }
        this.initializeGridNavigation();

        this.mainUiTrap = new GridFocusManager(document.body);
        this.mainUiTrap.init();
        document.getElementById('extension-title')?.focus();
        break;
      case 'inactive':
        const inactiveUI = document.getElementById('inactive-ui');
        inactiveUI.classList.remove('hidden');
        const inactiveNote = document.getElementById('inactive-note');
        if (inactiveNote) {
          inactiveNote.textContent = chrome.i18n.getMessage('popup_note_inactive');
        }
        break;
      case 'critical-error':
        if (!data.errorMessage || !data.errorType) {
          console.error("renderUI 'critical-error' state requires 'errorMessage' and 'errorType'");
          data = {
            errorMessage: 'An unknown error occurred.',
            errorType: 'unknown'
          };
        }
        const errorUi = document.getElementById('error-ui');
        errorUi.classList.remove('hidden');
        const retryBtn = document.getElementById('retry-setup-btn');
        retryBtn.onclick = async () => {
          retryBtn.disabled = true;
          retryBtn.textContent = chrome.i18n.getMessage('popup_button_retrying');
          try {
            await this.sendMessage({
              type: this.CONSTS.MESSAGE_TYPES.REATTEMPT_SETUP
            });
            await this.initialize();
          } catch (e) {
            this.showPopupError(chrome.i18n.getMessage('popup_error_connection_failed'), true);
          } finally {
            retryBtn.disabled = false;
            retryBtn.textContent = chrome.i18n.getMessage('popup_button_retry_setup');
          }
        };
        const detailsEl = errorUi.querySelector('.error-details');
        if (detailsEl) {
          let messageKey = 'popup_error_setup_unknown';
          if (data.errorType === this.CONSTS.ERROR_TYPES.CRYPTO_API_FAILED) {
            messageKey = 'popup_error_setup_crypto_failed';
          }
          detailsEl.textContent = chrome.i18n.getMessage(messageKey) || data.errorMessage;
        }
        this.mainUiTrap = new GridFocusManager(errorUi);
        this.mainUiTrap.init();
        retryBtn?.focus();
        break;
      case 'critical-failure':
        if (!data.errorMessage) {
          console.error("renderUI 'critical-failure' state requires 'errorMessage'");
          data.errorMessage = 'A critical error occurred. Please reinstall the extension.';
        }
        this.displayCriticalFailureUI(data.errorMessage);
        break;
    }
  }

  displayCriticalFailureUI(message) {
    document.getElementById('main-ui')?.classList.add('hidden');
    document.getElementById('inactive-ui')?.classList.add('hidden');
    document.getElementById('error-ui')?.classList.add('hidden');

    const criticalErrorContainer = document.createElement('div');
    criticalErrorContainer.id = 'critical-error-ui';
    criticalErrorContainer.style.padding = '16px';
    criticalErrorContainer.innerHTML = `
      <h3 data-i18n="ext_name"></h3>
      <p class="error-advice">${message}</p>
    `;
    document.body.appendChild(criticalErrorContainer);

    this.populatei18n();
    document.body.classList.remove('loading');
    document.body.removeAttribute('aria-busy');
  }
  initializeGridNavigation() {
    const grid = document.getElementById('shortcuts-grid');
    if (!grid) return;
    grid.addEventListener('keydown', (e) => {
      this.handleGridNavigation(e);
    });
    grid.addEventListener('focusin', () => {
      const rows = grid.querySelectorAll('.grid-row');
      let rowToActivate = null;
      const activeId = grid.getAttribute('aria-activedescendant');
      if (activeId && (rowToActivate = document.getElementById(activeId))) {} else if (this.lastFocusedRowIndex > -1 && rows[this.lastFocusedRowIndex]) {
        rowToActivate = rows[this.lastFocusedRowIndex];
      } else if (rows.length > 0) {
        rowToActivate = rows[0];
        this.lastFocusedRowIndex = 0;
      }
      if (rowToActivate) {
        rows.forEach(r => r.classList.remove('focused'));
        rowToActivate.classList.add('focused');
        grid.setAttribute('aria-activedescendant', rowToActivate.id);
        this.announceRow(rowToActivate);
      }
    });
    grid.addEventListener('focusout', () => {
      const activeId = grid.getAttribute('aria-activedescendant');
      if (activeId && document.getElementById(activeId)) {
        document.getElementById(activeId).classList.remove('focused');
      }
    });
  }
  handleGridNavigation(e) {
    const grid = document.getElementById('shortcuts-grid');
    const rows = Array.from(grid.querySelectorAll('.grid-row'));
    if (rows.length === 0) return;
    let currentIndex = rows.findIndex(row => row.classList.contains('focused'));
    if (currentIndex === -1) currentIndex = this.lastFocusedRowIndex;
    let nextIndex = currentIndex;
    switch (e.key) {
      case KEY_CODES.ARROW_DOWN:
        e.preventDefault();
        nextIndex = currentIndex === -1 ? 0 : Math.min(rows.length - 1, currentIndex + 1);
        break;
      case KEY_CODES.ARROW_UP:
        e.preventDefault();
        nextIndex = currentIndex === -1 ? rows.length - 1 : Math.max(0, currentIndex - 1);
        break;
      case KEY_CODES.HOME:
        e.preventDefault();
        nextIndex = 0;
        break;
      case KEY_CODES.END:
        e.preventDefault();
        nextIndex = rows.length - 1;
        break;
      case KEY_CODES.ENTER:
      case KEY_CODES.SPACE:
        if (currentIndex >= 0) {
          e.preventDefault();
          this.announceRow(rows[currentIndex], true);
        }
        return;
      default:
        return;
    }
    if (currentIndex !== nextIndex) {
      if (currentIndex >= 0 && rows[currentIndex]) {
        rows[currentIndex].classList.remove('focused');
      }
      const nextRow = rows[nextIndex];
      nextRow.classList.add('focused');
      grid.setAttribute('aria-activedescendant', nextRow.id);
      this.announceRow(nextRow);
      this.lastFocusedRowIndex = nextIndex;
    }
  }
  announceRow(row, verbose = false) {
    const key = row.querySelector('code')?.textContent || '';
    const action = row.querySelector('[role="gridcell"]:last-child')?.textContent || '';
    const announcer = document.getElementById('row-announcer');
    if (!announcer) return;
    const messageKey = verbose ? 'aria_popup_shortcut_row_activated' : 'aria_popup_shortcut_row_label';
    const message = chrome.i18n.getMessage(messageKey, [key, action]);
    announcer.textContent = message;
  }
  async initialize() {
    document.body.classList.add('loading');
    document.body.setAttribute('aria-busy', 'true');
    this.populatei18n();
    try {
      // background 스크립트에서 상수 객체를 비동기적으로 요청
      const response = await this.sendMessage({
        type: 'GET_CONSTANTS'
      });
      if (response && response.constants) {
        this.CONSTS = response.constants;
      } else {
        throw new Error("Failed to get constants from background script.");
      }

      this.populateHotkeys();

      if (chrome.storage && chrome.storage.local) {
        const {
          CRITICAL_INIT_FAILURE
        } = await chrome.storage.local.get('CRITICAL_INIT_FAILURE');
        if (CRITICAL_INIT_FAILURE) {
          const errorMessage = chrome.i18n.getMessage("dialog_critical_error_guidance_with_reinstall");
          this.renderUI('critical-failure', {
            errorMessage
          });
          return;
        }
      }
      const storageInfo = (await this.sendMessage({
        type: this.CONSTS.MESSAGE_TYPES.GET_STORAGE_INFO
      })) || {
        success: false
      };
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true
      });
      let isVideoPage = false;
      if (tab?.id) {
        const {
          [`tab_status_${tab.id}`]: tabStatus
        } = await chrome.storage.session.get(`tab_status_${tab.id}`);
        isVideoPage = !!tabStatus;
      }

      if (!document.body.isConnected) {
        return;
      }

      if (isVideoPage) {
        const setupStatus = this.checkStorageStatus(storageInfo);
        if (setupStatus === 'critical-error') {
          this.renderUI('critical-error', {
            errorMessage: storageInfo.setup_error_message,
            errorType: storageInfo.setup_error_type
          });
        } else {
          const {
            SESSION_ONLY_MODE_ACTIVE = false
          } = await chrome.storage.session.get('SESSION_ONLY_MODE_ACTIVE');
          this.renderUI('active', {
            storageInfo,
            showSessionOnlyWarning: SESSION_ONLY_MODE_ACTIVE
          });
        }
      } else {
        this.renderUI('inactive');
      }
    } catch (error) {
      if (!document.body.isConnected) {
        return;
      }
      this.renderUI('critical-error', {
        errorMessage: error.message,
        errorType: 'unknown'
      });
      try {
        if (this.CONSTS?.MESSAGE_TYPES?.LOG_ERROR) {
          await this.sendMessage({
            type: this.CONSTS.MESSAGE_TYPES.LOG_ERROR,
            payload: {
              context: 'popup.initialize.critical',
              error: {
                message: error.message,
                stack: error.stack
              }
            }
          });
        }
      } catch (e) {}
    } finally {
      if (!document.body.isConnected) {
        return;
      }
      document.body.classList.remove('loading');
      document.body.removeAttribute('aria-busy');
    }
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const popupManager = new PopupManager();
  try {
    await popupManager.initialize();
  } catch (e) {
    console.error("Popup initialization failed critically.", e);
    document.body.innerHTML = '';
    document.body.classList.remove('loading');
    document.body.removeAttribute('aria-busy');

    const errorUi = document.createElement('div');
    errorUi.style.cssText = 'padding: 16px; text-align: center;';

    const title = document.createElement('h3');
    title.textContent = chrome.i18n.getMessage('ext_name');

    const message = document.createElement('p');
    message.textContent = chrome.i18n.getMessage('dialog_critical_error_guidance_with_reinstall');

    errorUi.appendChild(title);
    errorUi.appendChild(message);
    document.body.appendChild(errorUi);
  }
});