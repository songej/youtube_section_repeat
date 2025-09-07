(function(SectionRepeat) {
  'use strict';
  if (!SectionRepeat) {
    console.error('SectionRepeat namespace not found!');
    return;
  }
  class ModalFocusTrap {
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
        setTimeout(() => this.firstFocusable.focus(), 50);
      }
    }
    updateFocusableElements() {
      const root = this.container.shadowRoot || this.container;
      this.focusableElements = root.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (this.focusableElements.length > 0) {
        this.firstFocusable = this.focusableElements[0];
        this.lastFocusable = this.focusableElements[this.focusableElements.length - 1];
      }
    }
    handleKeyDown(e) {
      if (e.key !== 'Tab') return;
      const isShiftPressed = e.shiftKey;
      if (isShiftPressed) {
        if (document.activeElement === this.firstFocusable || this.container.shadowRoot?.activeElement === this.firstFocusable) {
          this.lastFocusable.focus();
          e.preventDefault();
        }
      } else {
        if (document.activeElement === this.lastFocusable || this.container.shadowRoot?.activeElement === this.lastFocusable) {
          this.firstFocusable.focus();
          e.preventDefault();
        }
      }
    }
    cleanup() {
      this.container.removeEventListener('keydown', this.handleKeyDown);
    }
  }
  SectionRepeat.ModalFocusTrap = ModalFocusTrap;
  class SectionDataManager {
    constructor(videoId) {
      this.videoId = videoId;
      this.sections = [];
      this.completedSections = [];
      this.saveTimer = null;
      this.abortCtrl = new AbortController();
      this.onSectionsAutoPurged = null;
    }
    getSections() {
      return this.sections;
    }
    getCompletedSections() {
      return this.completedSections;
    }
    updateSections(newSections) {
      this.sections = newSections;
      this._updateCompletedSections();
    }
    _updateCompletedSections() {
      this.sections = this.sections.filter(s => s.start != null);
      this.completedSections = this.sections.filter(s => s.end != null);
    }
    async #updateMetadata(sectionCount) {
      const {
        helpers,
        logger,
        State
      } = SectionRepeat;
      if (!this.videoId) return;
      try {
        const hashedId = await helpers.hashVideoId(this.videoId);
        if (!hashedId) return false;
        await helpers.retryAsync(() => helpers.sendMessage({
          type: State.CONSTANTS.MESSAGE_TYPES.UPDATE_METADATA,
          payload: {
            hashedId,
            sectionCount
          }
        }), {
          context: 'updateMetadata',
          shouldRetry: (e) => !e.message?.includes('Extension context invalidated')
        });
        return true;
      } catch (e) {
        logger.error('updateMetadata', 'Failed to send metadata update after retries', e);
        throw e;
      }
    }
    async loadData() {
      const {
        State,
        logger,
        helpers
      } = SectionRepeat;
      if (this.abortCtrl.signal.aborted) return [];
      if (!chrome?.storage?.local) {
        logger.warning('loadData', 'Chrome storage API not available');
        this.updateSections([]);
        return [];
      }
      try {
        const hashedId = await helpers.hashVideoId(this.videoId);
        if (this.abortCtrl.signal.aborted || !hashedId) {
          this.updateSections([]);
          if (!hashedId) logger.info('loadData', 'Aborting load due to unavailable hash. Session-only mode.');
          return [];
        }
        const storageKey = `${State.CONSTANTS.STORAGE_PREFIX}${hashedId}`;
        const localData = await chrome.storage.local.get(storageKey);
        if (this.abortCtrl.signal.aborted) return this.sections;
        const storedData = localData[storageKey];
        if (storedData) {
          if (!Array.isArray(storedData.sections)) {
            logger.warning('loadData', `Corrupted section data found (not an array) for video ${this.videoId}. Resetting sections.`);
            this.updateSections([]);
            await this.clearAllDataForCurrentVideo();
            return [];
          }
          if (storedData.v === State.CONSTANTS.DATA_SCHEMA_VERSION) {
            this.updateSections(storedData.sections);
          } else {
            logger.warning('loadData', `Found incompatible data version: ${storedData.v || 'N/A'}. Automatically clearing for seamless experience.`);
            await this.clearAllDataForCurrentVideo();
            if (helpers && State?.controller) {
              State.controller.toast(
                helpers.t('toast_info_legacy_data_cleared'),
                State.CONSTANTS.TOAST_DURATION.MEDIUM,
                'info'
              );
            }
            this.updateSections([]);
          }
        } else {
          this.updateSections([]);
        }
      } catch (e) {
        logger.error('loadData', 'Failed to load section data', e);
        if (helpers && State?.controller) {
          const errorKey = e instanceof SectionRepeat.CryptoError ?
            'popup_error_setup_crypto_failed' :
            'popup_error_connection_failed';
          State.controller.toast(
            helpers.t(errorKey),
            State.CONSTANTS.TOAST_DURATION.LONG,
            'error'
          );
        }
      }
      return this.sections;
    }
    async persist(immediate = false) {
      const {
        State,
        TimerManager,
        logger,
        helpers
      } = SectionRepeat;
      const persistLogic = async () => {
        if (this.abortCtrl.signal.aborted) return;
        let hashedId, key, payloadToSave;
        try {
          if (!chrome?.storage?.local) throw new Error('Storage API not available');
          hashedId = await helpers.hashVideoId(this.videoId);
          if (this.abortCtrl.signal.aborted || !hashedId) {
            if (!hashedId) logger.info('persist', 'Aborting persist due to unavailable hash.');
            return;
          }
          key = `${State.CONSTANTS.STORAGE_PREFIX}${hashedId}`;
          let sectionsToSave = [...this.sections];
          const maxSections = State.CONSTANTS.SECTION_LIMITS.MAX_SECTIONS_PER_VIDEO;
          if (sectionsToSave.length > maxSections) {
            const incompleteSection = sectionsToSave.find(s => s.end == null);
            let completedSections = sectionsToSave.filter(s => s.end != null);
            const removedCount = completedSections.length - (incompleteSection ? maxSections - 1 : maxSections);
            if (removedCount > 0) {
              completedSections.splice(0, removedCount);
              if (this.onSectionsAutoPurged) {
                this.onSectionsAutoPurged(removedCount, maxSections);
              }
            }
            sectionsToSave = incompleteSection ? [...completedSections, incompleteSection] : completedSections;
          }
          payloadToSave = {
            sections: sectionsToSave,
            updatedAt: Date.now(),
            v: State.CONSTANTS.DATA_SCHEMA_VERSION
          };
          await chrome.storage.local.set({
            [key]: payloadToSave
          });
          await this.#updateMetadata(sectionsToSave.filter(s => s.end != null).length);
        } catch (err) {
          if (err.message?.includes('QUOTA_EXCEEDED')) {
            logger.warning('persist', 'QUOTA_EXCEEDED. Saving as pending and requesting purge.');
            const pendingKey = `${State.CONSTANTS.STORAGE_KEYS.PENDING_OP_PREFIX}${hashedId}`;
            try {
              await chrome.storage.local.set({
                [pendingKey]: {
                  key: key,
                  payload: payloadToSave
                }
              });
            } catch (innerErr) {
              logger.critical('persist', 'Failed to even save pending operation.', innerErr);
              if (State.controller) {
                State.controller.toast(
                  helpers.t('toast_error_final_save_failed'),
                  State.CONSTANTS.TOAST_DURATION.LONG,
                  'error'
                );
              }
            }
            helpers.sendMessage({
              type: State.CONSTANTS.MESSAGE_TYPES.TRIGGER_IMMEDIATE_PURGE
            }).catch(e => logger.error('persist.purge', e));
          } else if (!err.message?.includes('Extension context invalidated')) {
            logger.critical('persist', err);
          }
          throw err;
        }
      };
      TimerManager.clear(this.saveTimer);
      if (immediate) {
        return persistLogic();
      } else {
        this.saveTimer = TimerManager.set(persistLogic, State.CONSTANTS.TIMING.DEBOUNCE.SAVE);
        return Promise.resolve();
      }
    }
    async clearAllDataForCurrentVideo() {
      const {
        helpers,
        State,
        logger
      } = SectionRepeat;
      let lockId;
      try {
        const hashedId = await helpers.hashVideoId(this.videoId);
        if (!hashedId) throw new Error("Hashed ID is null, cannot clear sections.");
        const lockResponse = await helpers.sendMessage({
          type: State.CONSTANTS.MESSAGE_TYPES.ACQUIRE_LOCK,
          payload: {
            key: State.CONSTANTS.LOCK_KEYS.METADATA_ACCESS
          }
        });
        lockId = lockResponse?.success ? lockResponse.lockId : null;
        if (!lockId) {
          const lockError = new Error('Failed to acquire metadata lock for clearing sections.');
          lockError.name = 'LockError';
          throw lockError;
        }
        const key = `${State.CONSTANTS.STORAGE_PREFIX}${hashedId}`;
        const {
          [State.CONSTANTS.STORAGE_KEYS.METADATA]: metadata = {}
        } = await chrome.storage.local.get(State.CONSTANTS.STORAGE_KEYS.METADATA);
        const metadataExisted = !!metadata[key];
        if (metadataExisted) {
          delete metadata[key];
          await chrome.storage.local.set({
            [State.CONSTANTS.STORAGE_KEYS.METADATA]: metadata
          });
        }
        await chrome.storage.local.remove(key);
        this.updateSections([]);
      } catch (e) {
        if (e.name !== 'LockError') {
          logger.error('clearAllDataForCurrentVideo', `Failed to clear sections and update metadata: ${e.message}`, {
            error: e.message,
            stack: e.stack
          });
        }
        throw e;
      } finally {
        if (lockId) {
          helpers.sendMessage({
            type: State.CONSTANTS.MESSAGE_TYPES.RELEASE_LOCK,
            payload: {
              key: State.CONSTANTS.LOCK_KEYS.METADATA_ACCESS,
              id: lockId
            }
          }).catch(err => logger.warning('clearAllDataForCurrentVideo', 'Failed to release lock', err));
        }
      }
    }
    flushPendingSaves() {
      SectionRepeat.TimerManager.clear(this.saveTimer);
      this.persist(true);
    }
    cleanup() {
      this.abortCtrl.abort();
      this.flushPendingSaves();
    }
  }
  class SectionUIManager {
    constructor(playerEl, videoEl) {
      this.playerEl = playerEl;
      this.videoEl = videoEl;
      this.overlayEl = null;
      this.toastQueue = new SectionRepeat.ToastQueue();
      this.overlayHashCache = '';
      this.overlayErrorLogged = false;
      this._incompleteSectionEl = null;
      this.dialogHost = null;
      this.focusTrap = null;
      this.barContainer = SectionRepeat.helpers.qSel(SectionRepeat.State.CONSTANTS.SELECTORS.PROGRESS_BAR_CONTAINER, this.playerEl);
    }
    get incompleteSectionEl() {
      if (this._incompleteSectionEl && !this._incompleteSectionEl.isConnected) {
        this._incompleteSectionEl = null;
      }
      return this._incompleteSectionEl;
    }
    set incompleteSectionEl(el) {
      this._incompleteSectionEl = el;
    }
    toast(msg, duration, type = 'info', options = {}) {
      const State = SectionRepeat.State;
      duration = duration || State?.CONSTANTS?.TOAST_DURATION?.SHORT || 3000;
      this.toastQueue.show(msg, duration, type, options);
    }
    updateOverlay(sections, currentIdx = -1, force = false) {
      const {
        State,
        helpers,
        logger
      } = SectionRepeat;
      if (!this.playerEl || !this.playerEl.isConnected) {
        return;
      }
      if (!this.videoEl || !this.videoEl.duration) return;
      if (!this.barContainer || !this.barContainer.isConnected) {
        this.barContainer = helpers.qSel(State.CONSTANTS.SELECTORS.PROGRESS_BAR_CONTAINER, this.playerEl);
      }
      if (!this.barContainer) {
        if (!this.overlayErrorLogged) {
          logger.warning('updateOverlay', 'Progress bar container not found.');
          this.overlayErrorLogged = true;
        }
        return;
      }
      if (!this.overlayEl) {
        this.overlayEl = document.createElement('div');
        this.overlayEl.className = 'yt-section-overlay';
        this.overlayEl.setAttribute('role', 'group');
        this.barContainer.appendChild(this.overlayEl);
        force = true;
      }
      const newStructuralHash = sections.map(({
        start,
        end
      }) => `${start}:${end || 'null'}`).join('|') + `|${currentIdx}`;
      if (!force && this.overlayHashCache === newStructuralHash) {
        if (this.incompleteSectionEl) {
          const incompleteSection = sections.find(s => s.end == null);
          if (incompleteSection) {
            const width = (Math.max(this.videoEl.currentTime, incompleteSection.start + 0.1) - incompleteSection.start) / this.videoEl.duration * 100;
            this.incompleteSectionEl.style.setProperty('--section-width', `${width}%`);
          }
        }
        return;
      }
      this.overlayHashCache = newStructuralHash;
      this._updateOverlayAria(sections, currentIdx);
      this._synchronizeSectionElements(sections, currentIdx);
      this.incompleteSectionEl = this.overlayEl.querySelector('.incomplete-section');
    }
    _updateOverlayAria(sections, currentIdx) {
      const {
        helpers
      } = SectionRepeat;
      const t = helpers.t;
      const completedSections = sections.filter(s => s.end != null);
      const incompleteSections = sections.filter(s => s.end == null);
      const totalSections = completedSections.length;
      const incompleteCount = incompleteSections.length;
      let label;
      if (totalSections === 0 && incompleteCount === 0) {
        label = t('aria_overlay_desc_no_sections');
      } else if (currentIdx !== -1) {
        if (incompleteCount > 0) {
          label = t('aria_overlay_desc_full_state', [totalSections.toString(), incompleteCount.toString(), (currentIdx + 1).toString()]);
        } else {
          label = t('aria_overlay_desc_with_repeating', [totalSections.toString(), (currentIdx + 1).toString()]);
        }
      } else if (incompleteCount > 0) {
        label = t('aria_overlay_desc_with_incomplete', [totalSections.toString(), incompleteCount.toString()]);
      } else {
        label = totalSections === 1 ?
          t('aria_overlay_desc_singular') :
          t('aria_overlay_desc_plural', [totalSections.toString()]);
      }
      if (this.overlayEl && this.overlayEl.getAttribute('aria-label') !== label) {
        this.overlayEl.setAttribute('aria-label', label);
      }
    }
    _synchronizeSectionElements(sections, currentIdx) {
      const sectionIndicesInDom = new Set();
      sections.forEach((section, index) => {
        let sectionEl = this.overlayEl.querySelector(`[data-section-index="${index}"]`);
        if (!sectionEl) {
          sectionEl = document.createElement('div');
          sectionEl.dataset.sectionIndex = index;
          this.overlayEl.appendChild(sectionEl);
        }
        const isComplete = section.end != null;
        const isActive = currentIdx === index && isComplete;
        sectionEl.className = isComplete ? 'section' : 'incomplete-section';
        if (isActive) {
          sectionEl.classList.add('is-active');
        }
        this._updateSectionElementStyle(sectionEl, section, index, isComplete, isActive);
        sectionIndicesInDom.add(index.toString());
      });
      Array.from(this.overlayEl.children).forEach(el => {
        const index = el.dataset.sectionIndex;
        if (index && !sectionIndicesInDom.has(index)) {
          el.remove();
        }
      });
    }
    _updateSectionElementStyle(sectionEl, section, index, isComplete, isActive) {
      const {
        CONSTANTS
      } = SectionRepeat.State;
      const left = (section.start / this.videoEl.duration) * 100;
      const width = ((isComplete ? section.end : Math.max(this.videoEl.currentTime, section.start + 0.1)) - section.start) / this.videoEl.duration * 100;
      const background = CONSTANTS.SECTION_COLORS[index % CONSTANTS.SECTION_COLORS.length] ?? '#d93025';
      if (isComplete) {
        sectionEl.classList.toggle('is-active', isActive);
      }
      const style = sectionEl.style;
      style.setProperty('--section-left', `${left}%`);
      style.setProperty('--section-width', `${width}%`);
      style.setProperty('--section-bg', background);
    }
    showCriticalErrorDialog() {
      const {
        helpers
      } = SectionRepeat;
      const t = helpers.t;
      if (this.dialogHost && this.dialogHost.isConnected) return;
      const dialogHost = document.createElement('div');
      dialogHost.id = 'section-repeat-dialog-host';
      this.dialogHost = dialogHost;
      const shadowRoot = dialogHost.attachShadow({
        mode: 'open'
      });
      const styleSheet = new CSSStyleSheet();
      styleSheet.replaceSync(`
        .dialog-overlay { position: fixed; inset: 0; background-color: rgba(0,0,0,0.75); display: flex; align-items: center; justify-content: center; z-index: 10000; }
        .dialog-box { background-color: #fff; color: #202124; padding: 20px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.2); max-width: 400px; text-align: center; display: flex; flex-direction: column; gap: 16px; }
        .dialog-box p { margin: 0; font-size: 16px; line-height: 1.5; }
        .dialog-buttons { display: flex; gap: 12px; justify-content: flex-end; margin-top: 8px; }
        .dialog-btn { padding: 8px 16px; border-radius: 4px; border: none; font-weight: 500; cursor: pointer; font-size: 14px; }
        .dialog-btn.confirm { background-color: #d93025; color: white; }
        @media (prefers-color-scheme: dark) {
          .dialog-box { background-color: #2d2d2d; color: #e8eaed; border: 1px solid rgba(255, 255, 255, 0.1); }
          .dialog-btn.confirm { background-color: #ea4335; }
        }
      `);
      shadowRoot.adoptedStyleSheets = [styleSheet];
      const dialogOverlay = document.createElement('div');
      dialogOverlay.className = 'dialog-overlay';
      dialogOverlay.id = 'sr-critical-error-dialog';
      dialogOverlay.innerHTML = `
        <div class="dialog-box" role="alertdialog" aria-labelledby="sr-dialog-desc" aria-modal="true">
          <p id="sr-dialog-desc">${t('dialog_critical_error_dom_changed')}</p>
          <div class="dialog-buttons">
            <button id="sr-dialog-reload-btn" class="dialog-btn confirm">${t('toast_action_reload')}</button>
          </div>
        </div>
      `;
      shadowRoot.appendChild(dialogOverlay);
      document.body.appendChild(dialogHost);
      const previouslyFocused = document.activeElement;
      this.focusTrap = new SectionRepeat.ModalFocusTrap(dialogHost);
      this.focusTrap.init();
      const reloadBtn = shadowRoot.getElementById('sr-dialog-reload-btn');
      reloadBtn.onclick = () => {
        this.focusTrap.cleanup();
        if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
          previouslyFocused.focus();
        }
        location.reload();
      };
    }
    cleanup() {
      this.toastQueue?.cleanup();
      if (this.overlayEl) {
        this.overlayEl.remove();
        this.overlayEl = null;
      }
      if (this.focusTrap) {
        this.focusTrap.cleanup();
        this.focusTrap = null;
      }
      const dialog = this.dialogHost;
      if (dialog) dialog.remove();
    }
  }
  class SectionRepeatManager {
    constructor(videoEl, dataManager, uiManager) {
      this.videoEl = videoEl;
      this.dataManager = dataManager;
      this.uiManager = uiManager;
      this.mode = SectionRepeat.State.CONSTANTS.MODES.STABLE;
      this.currentIdx = -1;
      this.repeatHeartbeatInterval = null;
      this.abortCtrl = new AbortController();
      this.isPausedByVisibility = false;
      this.checkRepeatState = this.checkRepeatState.bind(this);
      this.isNavigating = false;
    }
    _enterRepeatMode(index) {
      this.mode = SectionRepeat.State.CONSTANTS.MODES.REPEATING;
      this.currentIdx = index;
      this.uiManager.updateOverlay(this.dataManager.getSections(), this.currentIdx, true);
    }
    _exitRepeatMode() {
      this.mode = SectionRepeat.State.CONSTANTS.MODES.STABLE;
      this.currentIdx = -1;
      if (this.abortCtrl.signal.aborted) {
        return;
      }
      this.uiManager.updateOverlay(this.dataManager.getSections(), -1, true);
    }
    toggleRepeat() {
      if (this.mode === SectionRepeat.State.CONSTANTS.MODES.REPEATING) {
        this.stopRepeat();
      } else if (this.dataManager.getCompletedSections().length > 0) {
        const isFirstTime = this.currentIdx === -1;
        this.startRepeat(isFirstTime ? 0 : this.currentIdx);
      }
    }
    async navigateSections(direction) {
      if (this.isNavigating) return;
      const completedSections = this.dataManager.getCompletedSections();
      if (completedSections.length === 0) return;
      this.isNavigating = true;
      try {
        let nextIdx = this.currentIdx === -1 ? 0 : this.currentIdx;
        nextIdx += (direction === 'prev' ? -1 : 1);
        nextIdx = (nextIdx + completedSections.length) % completedSections.length;
        await this.startRepeat(nextIdx, true);
      } finally {
        this.isNavigating = false;
      }
    }
    jumpToSection(index) {
      const completedSections = this.dataManager.getCompletedSections();
      if (index < 0 || index >= completedSections.length) return;
      this.currentIdx = index;
      if (this.mode === SectionRepeat.State.CONSTANTS.MODES.REPEATING) {
        this.startRepeat(index);
      } else {
        this.videoEl.currentTime = completedSections[index].start;
        this.uiManager.toast(SectionRepeat.helpers.t('toast_info_jumped_to_section', [(index + 1).toString()]), SectionRepeat.State.CONSTANTS.TOAST_DURATION.SHORT, 'info');
        this.uiManager.updateOverlay(this.dataManager.getSections(), this.currentIdx, true);
      }
    }
    checkRepeatState() {
      const {
        State,
        helpers,
        logger
      } = SectionRepeat;
      if (this.abortCtrl.signal.aborted || this.mode !== State.CONSTANTS.MODES.REPEATING) return;
      const section = this.dataManager.getCompletedSections()[this.currentIdx];
      if (!section) {
        this.stopRepeat(false);
        return;
      }
      const currentTime = this.videoEl.currentTime;
      if (currentTime < section.start - 0.1 || currentTime >= section.end) {
        this.videoEl.currentTime = section.start;
      }
      const POLLING_INTERVAL_MS = 100;
      const timeUntilEnd = section.end - this.videoEl.currentTime;
      const nextCheckDelay = Math.max(POLLING_INTERVAL_MS, (timeUntilEnd - 0.15) * 1000);
      helpers.sendMessage({
        type: State.CONSTANTS.MESSAGE_TYPES.SCHEDULE_REPEAT_CHECK,
        payload: {
          delay: nextCheckDelay
        }
      }).catch(e => logger.error('scheduleNextCheck.fail', e));
    }
    async startRepeat(index, isNavigation = false) {
      const {
        State,
        logger,
        helpers
      } = SectionRepeat;
      const t = helpers.t;
      const completedSections = this.dataManager.getCompletedSections();
      if (index < 0 || index >= completedSections.length) {
        this.stopRepeat(false);
        return;
      }
      this._enterRepeatMode(index);
      const targetSection = completedSections[index];
      if (!targetSection) return;
      this.videoEl.pause();
      if (this.videoEl.currentTime < targetSection.start || this.videoEl.currentTime >= targetSection.end) {
        this.videoEl.currentTime = targetSection.start;
      }
      try {
        await this.videoEl.play();
      } catch (e) {
        if (e.name !== 'AbortError') {
          logger.error('startRepeat.play', e);
        }
      }
      const message = t('aria_overlay_desc_with_repeating', [completedSections.length.toString(), (index + 1).toString()]);
      helpers.announceToScreenReader(message);
      if (isNavigation) {
        const toastMessage = t('toast_info_repeating_navigation', [(index + 1).toString(), completedSections.length.toString()]);
        this.uiManager.toast(toastMessage, State.CONSTANTS.TOAST_DURATION.MEDIUM, 'info');
      }
      this.checkRepeatState();
      helpers.sendMessage({
        type: State.CONSTANTS.MESSAGE_TYPES.REPEAT_STATE_CHANGED,
        payload: true,
        videoId: this.dataManager.videoId,
      }).catch(e => logger.error('startRepeat.syncState', e));
      helpers.sendMessage({
        type: State.CONSTANTS.MESSAGE_TYPES.START_HEARTBEAT_ALARM
      }).catch(e => logger.error('startRepeat.startHeartbeat', e));
    }
    stopRepeat(showToast = true) {
      const {
        State,
        helpers,
        logger
      } = SectionRepeat;
      if (this.mode !== State.CONSTANTS.MODES.REPEATING) return;
      helpers.sendMessage({
        type: State.CONSTANTS.MESSAGE_TYPES.CANCEL_REPEAT_CHECK
      }).catch(e => logger.warning('stopRepeat.cancelAlarm', e));
      helpers.sendMessage({
        type: State.CONSTANTS.MESSAGE_TYPES.STOP_HEARTBEAT_ALARM
      }).catch(e => logger.warning('stopRepeat.stopHeartbeat', e));
      this._exitRepeatMode();
      if (showToast) {
        this.uiManager.toast(helpers.t('toast_info_repeat_stopped'), State.CONSTANTS.TOAST_DURATION.SHORT, 'info');
      }
      helpers.sendMessage({
        type: State.CONSTANTS.MESSAGE_TYPES.REPEAT_STATE_CHANGED,
        payload: false,
        videoId: this.dataManager.videoId,
      }).catch(e => logger.warning('stopRepeat.syncState', e));
    }
    pauseTimers() {
      if (this.mode !== SectionRepeat.State.CONSTANTS.MODES.REPEATING || this.isPausedByVisibility) return;
      this.isPausedByVisibility = true;
      SectionRepeat.helpers.sendMessage({
        type: SectionRepeat.State.CONSTANTS.MESSAGE_TYPES.CANCEL_REPEAT_CHECK
      }).catch(e => SectionRepeat.logger.warning('pauseTimers.cancelAlarm', e));
      SectionRepeat.TimerManager.clear(this.repeatHeartbeatInterval, 'interval');
    }
    resumeTimers() {
      if (!this.isPausedByVisibility) return;
      this.isPausedByVisibility = false;
      if (this.mode === SectionRepeat.State.CONSTANTS.MODES.REPEATING) {
        this.startRepeat(this.currentIdx);
      }
    }
    cleanup() {
      this.abortCtrl.abort();
      this.stopRepeat(false);
    }
  }
  SectionRepeat.SectionController = class SectionController {
    constructor(playerEl) {
      const {
        State,
        helpers
      } = SectionRepeat;
      this.playerEl = playerEl;
      this.videoEl = helpers.qSel(State.CONSTANTS.SELECTORS.VIDEO, this.playerEl);
      this.abortCtrl = new AbortController();
      this.isLive = false;
      this.endHandled = false;
      this.isNonPlaylistView = false;
      this.validityCheckInterval = null;
      this.isHealthy = false;
      this.isLive = this.detectLiveStream();
      this.timeUpdateHandler = helpers.throttle(() => {
        if (document.hidden || this.abortCtrl.signal.aborted || this.isLive) return;
        if (!this.isHealthy) return;
        const video = this.videoEl;
        const timeUntilEnd = video.duration - video.currentTime;
        if (!this.endHandled && video.duration > 0 && timeUntilEnd < 0.25) {
          this.handleVideoEnd();
        }
        this.uiManager.updateOverlay(this.dataManager.getSections(), this.repeatManager.currentIdx);
      }, 250);
      this.isTimeUpdateListenerActive = false;
      this.startSection = this.debounce(this._startSection, 200);
      this.endSection = this.debounce(this._endSection, 200);
      this.toggleRepeat = this.debounce(this._toggleRepeat, 200);
      this.clearSections = this.debounce(this._clearSections, 400);
      this.navigateSections = this.throttle(this._navigateSections, 150);
    }
    debounce(func, delay) {
      let timeout;
      return (...args) => {
        if (!this.isHealthy) return;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), delay);
      };
    }
    throttle(func, limit) {
      let inThrottle;
      return (...args) => {
        if (!this.isHealthy) return;
        if (!inThrottle) {
          func.apply(this, args);
          inThrottle = true;
          setTimeout(() => inThrottle = false, limit);
        }
      };
    }
    detectLiveStream() {
      try {
        const playerResponse = window.ytInitialPlayerResponse || document.getElementById('movie_player')?.getPlayerResponse();
        if (playerResponse?.videoDetails?.isLive) {
          return true;
        }
      } catch (e) {
        SectionRepeat.logger.debug('detectLiveStream', 'Failed to get player response, falling back to DOM check.', e);
      }
      const {
        helpers,
        State
      } = SectionRepeat;
      const liveBadge = helpers.qSel(State.CONSTANTS.SELECTORS.LIVE_BADGE, this.playerEl);
      return !!(liveBadge && liveBadge.isConnected && liveBadge.offsetParent !== null);
    }
    _runHealthCheck() {
      const {
        State,
        helpers,
        logger
      } = SectionRepeat;
      const essentialSelectors = {
        video: State.CONSTANTS.SELECTORS.VIDEO,
        controls: State.CONSTANTS.SELECTORS.CONTROLS,
        progressBar: State.CONSTANTS.SELECTORS.PROGRESS_BAR,
      };
      for (const [key, selectors] of Object.entries(essentialSelectors)) {
        const element = helpers.qSel(selectors, this.playerEl);
        if (!element || element.offsetParent === null) {
          logger.error('HealthCheck.fail', `Essential element not found or not visible: ${key}`);
          this.isHealthy = false;
          return false;
        }
      }
      return true;
    }
    startHealthCheckRecovery() {
      const {
        State,
        logger
      } = SectionRepeat;
      logger.warning('HealthCheck.recovery', 'Starting health check recovery observer.');
      const recoveryObserverKey = `controller-health-recovery-${this.videoId}`;
      const playerContainer = this.playerEl.parentElement || document.body;
      let recoveryAttempts = 0;
      const maxRecoveryAttempts = 3;
      const recoveryTimeout = SectionRepeat.TimerManager.set(() => {
        State.unifiedObserver.unregister(recoveryObserverKey);
        this.uiManager.showCriticalErrorDialog();
      }, 30000);
      State.unifiedObserver.register(recoveryObserverKey, playerContainer, () => {
        recoveryAttempts++;
        if (this._runHealthCheck()) {
          logger.info('HealthCheck.recovery', 'Health check passed. Re-initializing controller.');
          State.unifiedObserver.unregister(recoveryObserverKey);
          SectionRepeat.TimerManager.clear(recoveryTimeout);
          this.init(this.videoId).catch(e => logger.error('HealthCheck.recovery.reinit', e));
        } else if (recoveryAttempts >= maxRecoveryAttempts) {
          State.unifiedObserver.unregister(recoveryObserverKey);
          SectionRepeat.TimerManager.clear(recoveryTimeout);
          this.uiManager.showCriticalErrorDialog();
        }
      }, {
        subtree: true,
        childList: true
      });
      this.abortCtrl.signal.addEventListener('abort', () => {
        State.unifiedObserver.unregister(recoveryObserverKey);
        SectionRepeat.TimerManager.clear(recoveryTimeout);
      });
    }
    async _checkOnboardingHints() {
      const {
        helpers,
        State
      } = SectionRepeat;
      const t = helpers.t;
      const ONBOARDING_KEY = State.CONSTANTS.STORAGE_KEYS.ONBOARDING_STATE;
      const {
        [ONBOARDING_KEY]: onboardingState
      } = await chrome.storage.local.get(ONBOARDING_KEY);
      const currentState = onboardingState || {
        s_hint_count: 0,
        w_hint_count: 0,
        has_used_s: false,
        has_used_w: false
      };
      if (this.isNonPlaylistView === false && !currentState.has_used_w && currentState.w_hint_count < 3) {
        this.uiManager.toast(t('toast_info_playlist_hint'), State.CONSTANTS.TOAST_DURATION.EXTRA_LONG, 'info');
        currentState.w_hint_count++;
        await chrome.storage.local.set({
          [ONBOARDING_KEY]: currentState
        });
      } else if (!currentState.has_used_s && currentState.s_hint_count < 3) {
        this.uiManager.toast(t('toast_info_sectioning_hint'), State.CONSTANTS.TOAST_DURATION.EXTRA_LONG, 'info');
        currentState.s_hint_count++;
        await chrome.storage.local.set({
          [ONBOARDING_KEY]: currentState
        });
      }
    }
    async init(videoId) {
      const {
        State,
        logger,
        helpers
      } = SectionRepeat;
      this.endHandled = false;
      if (this.abortCtrl.signal.aborted) return;
      this.uiManager = new SectionUIManager(this.playerEl, this.videoEl);
      if (!this._runHealthCheck()) {
        this.uiManager.showCriticalErrorDialog();
        this.startHealthCheckRecovery();
        return;
      }
      this.videoId = videoId;
      this.dataManager = new SectionDataManager(videoId);
      this.repeatManager = new SectionRepeatManager(this.videoEl, this.dataManager, this.uiManager);
      this.isNonPlaylistView = !new URLSearchParams(location.search).has('list');
      this.dataManager.onSectionsAutoPurged = (removedCount, maxSections) => {
        this.uiManager.toast(
          helpers.t('toast_warning_sections_auto_purged', [maxSections.toString(), removedCount.toString()]),
          State.CONSTANTS.TOAST_DURATION.LONG,
          'warning'
        );
      };
      if (this.isLive) {
        this.uiManager.toast(helpers.t('toast_warning_live_stream_unsupported'), State.CONSTANTS.TOAST_DURATION.LONG, 'warning');
        return;
      }
      try {
        await State.initializationPromise;
        if (this.abortCtrl.signal.aborted) return;
        const initialSections = await this.dataManager.loadData();
        if (this.abortCtrl.signal.aborted) return;
        this.bindEvents();
        this.updateListenerState();
        this.uiManager.updateOverlay(initialSections, -1, true);
        const loadedSectionCount = this.dataManager.getCompletedSections().length;
        if (loadedSectionCount > 0) {
          const msgKey = loadedSectionCount === 1 ? 'toast_info_loaded_singular' : 'toast_info_loaded_plural';
          this.uiManager.toast(helpers.t(msgKey, [loadedSectionCount]), State.CONSTANTS.TOAST_DURATION.MEDIUM, 'success');
        } else {
          await this._checkOnboardingHints();
        }
        const res = await helpers.sendMessage({
          type: State.CONSTANTS.MESSAGE_TYPES.GET_TAB_STATE
        });
        if (res?.success && res.state?.repeating && res.state.videoId === this.videoId) {
          this.repeatManager.startRepeat(0);
        }
        this.isHealthy = true;
      } catch (e) {
        this.isHealthy = false;
        logger.critical('init', 'Initialization promise failed', e);
        if (this.uiManager) {
          this.uiManager.toast(
            helpers.t('toast_error_player_init_failed'),
            State.CONSTANTS.TOAST_DURATION.LONG,
            'error'
          );
        }
      }
    }
    updateListenerState() {
      const shouldBeActive = this.dataManager.getSections().length > 0;
      if (shouldBeActive && !this.isTimeUpdateListenerActive) {
        this.videoEl.addEventListener('timeupdate', this.timeUpdateHandler, {
          signal: this.abortCtrl.signal,
          passive: true
        });
        this.isTimeUpdateListenerActive = true;
      } else if (!shouldBeActive && this.isTimeUpdateListenerActive) {
        this.videoEl.removeEventListener('timeupdate', this.timeUpdateHandler);
        this.isTimeUpdateListenerActive = false;
      }
    }
    bindEvents() {
      const {
        signal
      } = this.abortCtrl;
      this.videoEl.addEventListener('ended', (e) => this.handleVideoEnd(e), {
        signal
      });
      this.videoEl.addEventListener('seeked', () => {
        if (!this.isHealthy) return;
        if (this.endHandled && this.videoEl.duration - this.videoEl.currentTime > 0.3) {
          this.endHandled = false;
        }
      }, {
        signal,
        passive: true
      });
      const toggleAnimationClass = (shouldPause) => {
        if (!this.isHealthy) return;
        const incompleteEl = this.uiManager?.incompleteSectionEl;
        if (incompleteEl) {
          incompleteEl.classList.toggle('paused-animation', shouldPause);
        }
      };
      this.videoEl.addEventListener('pause', () => toggleAnimationClass(true), {
        signal,
        passive: true
      });
      this.videoEl.addEventListener('playing', () => toggleAnimationClass(false), {
        signal,
        passive: true
      });
    }
    handleVideoEnd(e) {
      if (!this.isHealthy) return;
      if (this.endHandled) return;
      if (!SectionRepeat.State.isFullyInitialized) {
        SectionRepeat.logger.warning('handleVideoEnd', 'Ignored because extension is not fully initialized.');
        return;
      }
      this.endHandled = true;
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      this.videoEl.pause();
      const {
        State,
        helpers
      } = SectionRepeat;
      const t = helpers.t;
      const lastSection = this.dataManager.getSections().at(-1);
      if (lastSection && lastSection.end == null) {
        if (this.videoEl.duration - lastSection.start >= State.CONSTANTS.SECTION_LIMITS.MIN_SECTION_SEC) {
          lastSection.end = this.videoEl.duration;
          this.dataManager.updateSections(this.dataManager.getSections());
          this.dataManager.persist();
          this.uiManager.toast(t('toast_info_incomplete_section_autocompleted'), State.CONSTANTS.TOAST_DURATION.MEDIUM, 'info');
        }
      }
      if (this.dataManager.getCompletedSections().length > 0) {
        this.repeatManager.startRepeat(0);
      } else if (this.isNonPlaylistView) {
        this.videoEl.currentTime = 0;
        const ONBOARDING_KEY = State.CONSTANTS.STORAGE_KEYS.ONBOARDING_STATE;
        chrome.storage.local.get(ONBOARDING_KEY, (result) => {
          const onboardingState = result[ONBOARDING_KEY] || {};
          if (!onboardingState.has_seen_autorepeat_toast) {
            this.uiManager.toast(t('toast_info_autorepeat_video'), State.CONSTANTS.TOAST_DURATION.LONG, 'info');
            onboardingState.has_seen_autorepeat_toast = true;
            chrome.storage.local.set({
              [ONBOARDING_KEY]: onboardingState
            });
          }
        });
        SectionRepeat.TimerManager.set(() => {
          if (!this.abortCtrl.signal.aborted) {
            this.videoEl.play().catch(e => {});
          }
        }, 50);
      }
    }
    startValidityChecks() {}
    async _startSection() {
      if (!this.repeatManager || !this.dataManager) {
        SectionRepeat.logger.warning('startSection', 'Called on a non-initialized controller.');
        return;
      }
      this.repeatManager.stopRepeat(false);
      const {
        State,
        helpers
      } = SectionRepeat;
      try {
        const ONBOARDING_KEY = State.CONSTANTS.STORAGE_KEYS.ONBOARDING_STATE;
        const {
          [ONBOARDING_KEY]: onboardingState
        } = await chrome.storage.local.get(ONBOARDING_KEY);
        if (onboardingState && onboardingState.has_used_s === false) {
          onboardingState.has_used_s = true;
          await chrome.storage.local.set({
            [ONBOARDING_KEY]: onboardingState
          });
        }
        const sections = this.dataManager.getSections();
        const currentTime = this.videoEl.currentTime;
        const incompleteSection = sections.find(s => s.end == null);
        if (incompleteSection) {
          incompleteSection.start = currentTime;
        } else {
          sections.push({
            start: currentTime
          });
        }
        this.dataManager.updateSections(sections);
        await this.dataManager.persist(true);
        this.updateListenerState();
        this.uiManager.toast(helpers.t('toast_info_section_start_set'), State.CONSTANTS.TOAST_DURATION.SHORT, 'success');
        this.uiManager.updateOverlay(sections, -1, true);
      } catch (e) {
        const errorKey = e instanceof SectionRepeat.CryptoError ?
          'popup_error_setup_crypto_failed' :
          'popup_error_connection_failed';
        this.uiManager.toast(SectionRepeat.helpers.t(errorKey), State.CONSTANTS.TOAST_DURATION.MEDIUM, 'error');
      }
    }
    async _endSection() {
      const {
        State,
        helpers
      } = SectionRepeat;
      try {
        const sections = this.dataManager.getSections();
        const currentTime = this.videoEl.currentTime;
        const last = sections.at(-1);
        if (!last || last.start == null) return;
        if (currentTime - last.start < State.CONSTANTS.SECTION_LIMITS.MIN_SECTION_SEC) {
          const lastSection = sections.at(-1);
          if (lastSection && lastSection.end == null) {
            sections.pop();
          }
          this.dataManager.updateSections(sections);
          this.uiManager.updateOverlay(sections, -1, true);
          return;
        }
        if (last.end != null) {
          sections.push({
            start: last.end,
            end: currentTime
          });
        } else {
          last.end = currentTime;
        }
        this.dataManager.updateSections(sections);
        await this.dataManager.persist(true);
        this.updateListenerState();
        const newCount = this.dataManager.getCompletedSections().length;
        this.uiManager.toast(helpers.t('toast_success_section_added', [newCount]), State.CONSTANTS.TOAST_DURATION.MEDIUM, 'success');
        this.uiManager.updateOverlay(sections, newCount - 1, true);
      } catch (e) {
        const errorKey = e instanceof SectionRepeat.CryptoError ?
          'popup_error_setup_crypto_failed' :
          'popup_error_connection_failed';
        this.uiManager.toast(helpers.t(errorKey), State.CONSTANTS.TOAST_DURATION.MEDIUM, 'error');
      }
    }
    async _clearSections() {
      await SectionRepeat.State.initializationPromise;
      this.repeatManager.stopRepeat(false);
      try {
        await this.dataManager.clearAllDataForCurrentVideo();
        this.updateListenerState();
        this.uiManager.toast(SectionRepeat.helpers.t('toast_success_sections_cleared'), SectionRepeat.State.CONSTANTS.TOAST_DURATION.SHORT, 'info');
        this.uiManager.updateOverlay([], -1, true);
      } catch (e) {
        const errorMsgKey = e.name === 'LockError' ? 'toast_error_action_locked' : (e.message.includes('crypto') ? 'popup_error_setup_crypto_failed' : 'popup_storage_purge_failed');
        const errorToastType = e.name === 'LockError' ? 'warning' : 'error';
        SectionRepeat.logger.warning('clearSections', `Operation failed: ${e.message}`);
        this.uiManager.toast(SectionRepeat.helpers.t(errorMsgKey), SectionRepeat.State.CONSTANTS.TOAST_DURATION.MEDIUM, errorToastType);
      }
    }
    flushPendingSaves() {
      if (!this.isHealthy) return;
      this.dataManager?.flushPendingSaves();
    }
    _toggleRepeat() {
      if (!this.isHealthy) return;
      this.repeatManager.toggleRepeat();
    }
    _navigateSections(direction) {
      if (!this.isHealthy) return;
      this.repeatManager.navigateSections(direction);
    }
    jumpToSection(index) {
      if (!this.isHealthy) return;
      this.repeatManager.jumpToSection(index);
    }
    toast(msg, duration, type, options) {
      this.uiManager.toast(msg, duration, type, options);
    }
    onVisibilityChange(isHidden) {
      if (!this.isHealthy) return;
      if (isHidden) {
        this.repeatManager?.pauseTimers();
      } else {
        this.repeatManager?.resumeTimers();
      }
    }
    stopRepeat(showToast = true) {
      if (!this.isHealthy) return;
      this.repeatManager.stopRepeat(showToast);
    }
    cleanup() {
      this.abortCtrl.abort();
      this.uiManager?.cleanup();
      if (this.isTimeUpdateListenerActive) {
        this.videoEl.removeEventListener('timeupdate', this.timeUpdateHandler);
        this.isTimeUpdateListenerActive = false;
      }
      SectionRepeat.TimerManager.clear(this.validityCheckInterval, 'interval');
      this.dataManager?.cleanup();
      this.repeatManager?.cleanup();
      SectionRepeat.logger.debug('cleanup', 'Controller and all managers cleaned up');
    }
  };
  SectionRepeat.NavigationManager = class NavigationManager {
    constructor() {
      this.initPromise = null;
      this.initRetryCount = 0;
      this.maxRetries = 5;
      this.playerReinitTimer = null;
      this.lastKnownVideoId = null;
      this.eventListeners = [];
      this.videoChangeObserver = null;
      this.lastObservedVideoEl = null;
      this.lastVideoSrc = null;
      this.isBackgroundTab = document.hidden;
      this.reinitTimer = null;
      this.healthCheckInterval = null;
    }
    _requestReinitialization(event = null) {
      const State = SectionRepeat.State;
      const TimerManager = SectionRepeat.TimerManager;
      TimerManager.clear(this.reinitTimer);
      this.reinitTimer = TimerManager.set(() => {
        this.runInitialization(event);
      }, State.CONSTANTS.TIMING.DEBOUNCE.MUTATION);
    }
    init() {
      const YOUTUBE_EVENTS = SectionRepeat.State.CONSTANTS.YOUTUBE_EVENTS;
      this.visibilityChangeHandler = () => {
        this.isBackgroundTab = document.hidden;
        SectionRepeat.State.controller?.onVisibilityChange(document.hidden);
        if (!document.hidden) {
          this.runSafetyCheck();
        }
      };
      document.addEventListener('visibilitychange', this.visibilityChangeHandler);
      this.addEventListener(document, YOUTUBE_EVENTS.PAGE_DATA_UPDATED, () => this._requestReinitialization());
      this.addEventListener(document.body, YOUTUBE_EVENTS.NAVIGATE_START, () => {
        SectionRepeat.State?.elementCache?.invalidate();
        if (SectionRepeat.State.controller) {
          SectionRepeat.State.controller.flushPendingSaves();
          SectionRepeat.State.controller.abortCtrl.abort();
          SectionRepeat.State.controller.cleanup();
          SectionRepeat.State.controller = null;
        }
        this.lastKnownVideoId = null;
        this.lastVideoSrc = null;
      });
      this.addEventListener(document.body, YOUTUBE_EVENTS.NAVIGATE_FINISH, (e) => {
        this._requestReinitialization(e);
      });
      this.addEventListener(document, YOUTUBE_EVENTS.PLAYER_UPDATED, () => this._requestReinitialization());
      this.addEventListener(document, YOUTUBE_EVENTS.PLAYLIST_DATA_UPDATED, () => this.handlePlaylistChange());
      this.addEventListener(document, YOUTUBE_EVENTS.YT_ACTION, (e) => {
        if (e.detail?.actionName === 'yt-playlist-set-selected-action' || e.detail?.actionName === 'yt-service-request-completed-action') {
          SectionRepeat.TimerManager.set(() => this.handlePlaylistChange(), SectionRepeat.State.CONSTANTS.TIMING.DEBOUNCE.MUTATION);
        }
      });
      this.setupVideoChangeObserver();
      this.setupHistoryChangeDetection();
      this.waitForYouTubeAPI().then(() => {
        this._requestReinitialization();
        this.setupPlayerObserver();
      });
    }
    runSafetyCheck() {
      const {
        State,
        helpers
      } = SectionRepeat;
      if (!helpers.isVideoPage(window.location.href)) {
        if (State.controller) {
          State.controller.cleanup();
          State.controller = null;
        }
        return;
      }
      const currentVideoId = helpers.getVideoIdFromUrl(window.location.href);
      if (currentVideoId && (!State.controller || State.controller.videoId !== currentVideoId)) {
        SectionRepeat.logger.warning('SafetyCheck', 'State mismatch detected on visibility change! Forcing re-initialization.', {
          controllerId: State.controller?.videoId,
          currentId: currentVideoId,
        });
        this._requestReinitialization();
      }
    }
    setupHistoryChangeDetection() {
      this.popStateHandler = () => this._requestReinitialization();
      this.addEventListener(window, 'popstate', this.popStateHandler);
    }
    setupVideoChangeObserver() {
      const State = SectionRepeat.State;
      const helpers = SectionRepeat.helpers;
      const CONSTANTS = State.CONSTANTS;
      const observeVideo = () => {
        const video = helpers.qSel(CONSTANTS.SELECTORS.VIDEO);
        if (!video) {
          this.observeVideoTimeout = setTimeout(observeVideo, 500);
          return;
        }
        if (this.lastObservedVideoEl === video) return;
        if (this.videoChangeObserver) {
          this.videoChangeObserver.disconnect();
        }
        this.lastVideoSrc = video.src;
        this.videoChangeObserver = new MutationObserver((mutations) => {
          for (const mutation of mutations) {
            if (mutation.type === 'attributes' && mutation.attributeName === 'src') {
              const newSrc = video.src;
              if (newSrc && newSrc !== this.lastVideoSrc) {
                this.lastVideoSrc = newSrc;
                SectionRepeat.logger.info('MutationObserver', 'Video src changed, triggering re-initialization.');
                this._requestReinitialization();
              }
            }
          }
        });
        this.videoChangeObserver.observe(video, {
          attributes: true,
          attributeFilter: ['src']
        });
        this.lastObservedVideoEl = video;
      };
      observeVideo();
    }
    handleVideoChange(newVideoId) {
      const State = SectionRepeat.State;
      const TimerManager = SectionRepeat.TimerManager;
      const logger = SectionRepeat.logger;
      if (!newVideoId || newVideoId === this.lastKnownVideoId) return;
      logger.info('handleVideoChange', 'Video changed, preparing reinitialization.', {
        from: this.lastKnownVideoId,
        to: newVideoId
      });
      this.lastKnownVideoId = newVideoId;
      if (State.controller && State.controller.videoId !== newVideoId) {
        State.controller.abortCtrl.abort();
        State.controller.cleanup();
        State.controller = null;
      }
      TimerManager.clear(this.playerReinitTimer);
      this.playerReinitTimer = TimerManager.set(() => this._requestReinitialization(), State.CONSTANTS.TIMING.TIMEOUT.FOCUS_MODE_REDIRECT);
    }
    addEventListener(target, event, handler) {
      this.eventListeners = this.eventListeners.filter(listener => {
        if (listener.target === target && listener.event === event) {
          listener.target.removeEventListener(listener.event, listener.handler);
          return false;
        }
        return true;
      });
      this.eventListeners.push({
        target,
        event,
        handler
      });
      target.addEventListener(event, handler, {
        passive: true
      });
    }
    handlePlaylistChange() {
      const videoId = SectionRepeat.helpers.getVideoIdFromUrl(window.location.href);
      if (videoId && videoId !== this.lastKnownVideoId) {
        this.handleVideoChange(videoId);
      }
    }
    async waitForYouTubeAPI() {
      const State = SectionRepeat.State;
      const TimerManager = SectionRepeat.TimerManager;
      const CONSTANTS = State.CONSTANTS;
      return new Promise((resolve) => {
        const checkInterval = CONSTANTS.TIMING.TIMEOUT.YOUTUBE_API_CHECK;
        const maxWait = CONSTANTS.TIMING.TIMEOUT.YOUTUBE_API_MAX_WAIT;
        const maxChecks = Math.floor(maxWait / checkInterval);
        let checkCount = 0;
        const checkAPI = () => {
          checkCount++;
          const hasYtAPI = !!(window.ytInitialData || window.ytcfg);
          const hasYtPlayer = !!(window.ytInitialPlayerResponse || document.querySelector('#movie_player'));
          if (hasYtAPI || hasYtPlayer || checkCount >= maxChecks) {
            resolve();
            return;
          }
          TimerManager.set(checkAPI, checkInterval);
        };
        checkAPI();
      });
    }
    handlePageUpdate() {
      const videoId = SectionRepeat.helpers.getVideoIdFromUrl(window.location.href);
      if (!videoId) return;
      if (videoId !== this.lastKnownVideoId) {
        this.handleVideoChange(videoId);
      } else if (!SectionRepeat.State.controller || !SectionRepeat.State.controller.playerEl?.isConnected) {
        this._requestReinitialization();
      }
    }
    checkAndReinitialize() {
      const State = SectionRepeat.State;
      const helpers = SectionRepeat.helpers;
      const currentVideoId = helpers.getVideoIdFromUrl(window.location.href);
      if (!currentVideoId) return;
      if (State.controller?.videoId === currentVideoId && State.controller?.playerEl?.isConnected) return;
      const playerEl = helpers.qSel(State.CONSTANTS.SELECTORS.PLAYER);
      if (playerEl && State.controller?.playerEl === playerEl) return;
      if (State.controller) {
        State.controller.abortCtrl.abort();
        State.controller.cleanup();
        State.controller = null;
      }
      this._requestReinitialization();
    }
    setupPlayerObserver() {
      const State = SectionRepeat.State;
      const TimerManager = SectionRepeat.TimerManager;
      const CONSTANTS = State.CONSTANTS;
      const ytdApp = document.querySelector('ytd-app') || document.body;
      let playerChangeTimer = null;
      State.unifiedObserver.register('navigation-player', ytdApp, (mutations) => {
        const hasPlayerMutation = mutations.some(m => m.type === 'childList' && [...m.addedNodes, ...m.removedNodes].some(n => n.nodeType === 1 && (n.id === 'movie_player' || n.querySelector?.('#movie_player'))));
        if (hasPlayerMutation) {
          TimerManager.clear(playerChangeTimer);
          playerChangeTimer = TimerManager.set(() => {
            this._requestReinitialization();
          }, CONSTANTS.TIMING.TIMEOUT.FOCUS_MODE_REDIRECT);
        }
      }, {
        subtree: true,
        filter: (mutation) => (mutation.type === 'childList' && (mutation.target.id === 'player-container' || mutation.target.tagName === 'YTD-PLAYER'))
      });
    }
    async runInitialization(event = null) {
      await SectionRepeat.State.initializationPromise;
      if (this.initPromise) return;
      let currentUrl = event?.detail?.response?.url || window.location.href;
      if (typeof currentUrl === 'string' && currentUrl.startsWith('/')) {
        currentUrl = window.location.origin + currentUrl;
      }
      if (currentUrl.includes('/shorts/')) {
        if (SectionRepeat.State.controller) {
          SectionRepeat.State.controller.cleanup();
          SectionRepeat.State.controller = null;
        }
        return;
      }
      const videoId = SectionRepeat.helpers.getVideoIdFromUrl(currentUrl);
      if (!videoId) {
        if (SectionRepeat.State.controller) {
          SectionRepeat.State.controller.abortCtrl.abort();
          SectionRepeat.State.controller.cleanup();
          SectionRepeat.State.controller = null;
          SectionRepeat.helpers.sendMessage({
            type: SectionRepeat.State.CONSTANTS.MESSAGE_TYPES.NAVIGATED_AWAY_FROM_VIDEO
          }).catch(e => SectionRepeat.logger.warning('runInitialization.navAway', e));
        }
        return;
      }
      if (SectionRepeat.State.controller?.videoId === videoId && SectionRepeat.State.controller?.playerEl?.isConnected) {
        return;
      }
      this.initPromise = this.findAndSetupPlayer(videoId).catch(e => {
        const logger = SectionRepeat.logger;
        const TimerManager = SectionRepeat.TimerManager;
        const State = SectionRepeat.State;
        if (e.message.includes('User navigated')) return;
        if (this.initRetryCount < this.maxRetries) {
          this.initRetryCount++;
          logger?.warning('runInitialization', `Retrying player setup (${this.initRetryCount}/${this.maxRetries})`, {
            error: e.message,
            stack: e.stack
          });
          TimerManager.set(() => {
            this.initPromise = null;
            this._requestReinitialization(event);
          }, State.CONSTANTS.TIMING.RETRY.INIT_BASE * Math.pow(State.CONSTANTS.TIMING.RETRY.INIT_MULTIPLIER, this.initRetryCount));
        } else {
          logger?.critical('runInitialization', 'Player initialization failed after max retries.', {
            error: e.message,
            stack: e.stack
          });
          const uiManager = State.controller?.uiManager || new SectionUIManager(document.body, null);
          uiManager.showCriticalErrorDialog();
        }
      }).finally(() => {
        this.initPromise = null;
      });
    }
    async findAndSetupPlayer(videoId) {
      if (SectionRepeat.State.controller) {
        SectionRepeat.State.controller.abortCtrl.abort();
        SectionRepeat.State.controller.cleanup();
        SectionRepeat.State.controller = null;
      }
      const playerEl = await this.waitForPlayerReady(videoId);
      const currentVideoId = SectionRepeat.helpers.getVideoIdFromUrl(window.location.href);
      if (currentVideoId !== videoId) {
        throw new Error('User navigated to a different video during player setup.');
      }
      SectionRepeat.initializeController(playerEl, videoId);
      this.initRetryCount = 0;
    }
    waitForPlayerReady(expectedVideoId) {
      const State = SectionRepeat.State;
      const TimerManager = SectionRepeat.TimerManager;
      const helpers = SectionRepeat.helpers;
      const CONSTANTS = State.CONSTANTS;
      return new Promise((resolve, reject) => {
        const maxChecks = 120;
        let checkCount = 0;
        const checkPlayer = () => {
          checkCount++;
          if (helpers.getVideoIdFromUrl(window.location.href) !== expectedVideoId) {
            return reject(new Error('User navigated to a different video'));
          }
          const playerEl = helpers.qSel(CONSTANTS.SELECTORS.PLAYER);
          const videoEl = playerEl ? helpers.qSel(CONSTANTS.SELECTORS.VIDEO, playerEl) : null;
          if (playerEl && videoEl && playerEl.offsetParent !== null && (videoEl.readyState >= 2 || videoEl.duration > 0 || (videoEl.src && videoEl.src.startsWith('blob:')))) {
            return resolve(playerEl);
          }
          if (checkCount >= maxChecks) {
            return reject(new Error('Player readiness check timed out after extended period'));
          }
          TimerManager.set(checkPlayer, CONSTANTS.TIMING.TIMEOUT.PLAYER_CHECK_DELAY);
        };
        checkPlayer();
      });
    }
    cleanup() {
      SectionRepeat.TimerManager.clear(this.healthCheckInterval, 'interval');
      SectionRepeat.State.unifiedObserver?.unregister('navigation-player');
      SectionRepeat.TimerManager.clear(this.playerReinitTimer);
      if (this.videoChangeObserver) {
        this.videoChangeObserver.disconnect();
        this.videoChangeObserver = null;
      }
      document.removeEventListener('visibilitychange', this.visibilityChangeHandler);
      if (this.popStateHandler) {
        window.removeEventListener('popstate', this.popStateHandler);
      }
      this.eventListeners.forEach(listener => {
        if (listener.target && typeof listener.target.removeEventListener === 'function') {
          listener.target.removeEventListener(listener.event, listener.handler);
        }
      });
      this.eventListeners = [];
    }
  };
  SectionRepeat.InitializationManager = class InitializationManager {
    constructor() {
      this.retryCount = 0;
      this.maxRetries = 3;
      this.initializationTimeout = null;
    }
    async initialize() {
      const State = SectionRepeat.State;
      const TimerManager = SectionRepeat.TimerManager;
      const helpers = SectionRepeat.helpers;
      try {
        await helpers.sendMessage({
          type: State.CONSTANTS.MESSAGE_TYPES.CONTENT_SCRIPT_READY
        });
        this.initializationTimeout = TimerManager.set(() => {
          if (!State.userSalt) {
            SectionRepeat.logger.warning('initialize', 'Initialization timed out. Retrying...');
            this.retryWithBackoff();
          }
        }, State.CONSTANTS?.TIMING?.TIMEOUT?.INIT_CONSTANTS || 5000);
      } catch (e) {
        SectionRepeat.logger.error('initialize.readyMessage', e);
        await this.retryWithBackoff();
      }
    }
    async retryWithBackoff() {
      const TimerManager = SectionRepeat.TimerManager;
      const logger = SectionRepeat.logger;
      this.maxRetries = SectionRepeat.State.CONSTANTS.TIMING.RETRY.INIT_MAX_ATTEMPTS;
      if (this.retryCount >= this.maxRetries) {
        logger.critical('retryWithBackoff', 'Max retries for initialization exceeded.');
        return;
      }
      this.retryCount++;
      const delay = Math.pow(2, this.retryCount - 1) * 1000;
      await new Promise(resolve => TimerManager.set(resolve, delay));
      await this.initialize();
    }
    handleInitialPayload(payload) {
      const State = SectionRepeat.State;
      const TimerManager = SectionRepeat.TimerManager;
      const logger = SectionRepeat.logger;
      const helpers = SectionRepeat.helpers;
      TimerManager.clear(this.initializationTimeout);
      State.userSalt = payload.salt;
      this.maxRetries = State.CONSTANTS?.TIMING?.RETRY?.INIT_MAX_ATTEMPTS || 3;
      const cacheSize = helpers.getCacheSize();
      const cacheTTL = State.CONSTANTS?.DOM_CACHE?.TTL || 30000;
      State.elementCache = new SectionRepeat.LRUCache(cacheSize, cacheTTL);
      State.unifiedObserver = new SectionRepeat.UnifiedObserverManager();
      State.navigationManager = new SectionRepeat.NavigationManager();
      State.navigationManager.init();
      TimerManager.set(() => {
        if (State.elementCache) State.elementCache.cleanup();
      }, cacheTTL, 'interval');
      State.isFullyInitialized = true;
      logger.info('handleInitialPayload', 'Section & Repeat is fully initialized and ready.');
      if (State.resolveInitialization) {
        State.resolveInitialization();
      }
    }
  };
})(window.SectionRepeat);
