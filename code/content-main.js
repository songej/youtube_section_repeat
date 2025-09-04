(() => {
  'use strict';
  // 전역 심볼 대신 고유 속성을 사용하여 중복 실행을 방지하고 격리 수준을 높입니다.
  const INIT_FLAG = '__SECTION_REPEAT_INITIALIZED_V2__';
  if (window.hasOwnProperty(INIT_FLAG)) {
    return;
  }
  Object.defineProperty(window, INIT_FLAG, {
    value: true,
    writable: false,
    configurable: false
  });

  const SectionRepeat = window.SectionRepeat || {};
  window.SectionRepeat = SectionRepeat;
  SectionRepeat.CONSTANTS = SectionRepeat.CONSTANTS || {};

  let resolveInitializationPromise;
  const initializationPromise = new Promise(resolve => {
    resolveInitializationPromise = resolve;
  });
  SectionRepeat.State = SectionRepeat.State || {
    CONSTANTS: SectionRepeat.CONSTANTS,
    controller: null,
    globalAriaAnnouncer: null,
    messageListenerRegistered: false,
    navigationManager: null,
    initManager: null,
    elementCache: null,
    extensionHealthCheckTimer: null,
    unifiedObserver: null,
    messageHandlers: new Map(),
    isFullyInitialized: false,
    userSalt: null,
    initializationPromise: initializationPromise,
    resolveInitialization: resolveInitializationPromise,
  };
  const State = SectionRepeat.State;
  SectionRepeat.helpers = SectionRepeat.helpers || {};
  const helpers = SectionRepeat.helpers;
  if (!SectionRepeat.logger && SectionRepeat.ErrorLogger) {
    SectionRepeat.logger = new SectionRepeat.ErrorLogger();
  }
  if (!SectionRepeat.extensionConnection && SectionRepeat.ExtensionConnectionManager) {
    SectionRepeat.extensionConnection = new SectionRepeat.ExtensionConnectionManager();
  }

  let hasShownSlowInitToast = false;
  let slowInitToastId = null; // 토스트 ID 저장을 위한 변수 추가

  const initializeController = function(playerEl, videoId) {
    const logger = SectionRepeat.logger;
    if (!videoId || !playerEl || !State.CONSTANTS) {
      logger?.error('initializeController', 'Missing required parameters or constants for initialization.');
      return;
    }
    if (!playerEl.isConnected) {
      logger?.warning('initializeController', 'Attempted to initialize on a disconnected player element.');
      return;
    }
    if (State.controller && State.controller.videoId === videoId && State.controller.playerEl === playerEl) {
      return;
    }
    if (State.controller) {
      State.controller.cleanup();
    }

    hasShownSlowInitToast = false;
    slowInitToastId = null;

    State.controller = new SectionRepeat.SectionController(playerEl);
    State.controller.init(videoId).catch(e => {
      if (!e.message?.includes('Extension context invalidated')) {
        logger?.error('initializeController.init', `Controller initialization failed: ${e.message}`, {
          error: e.message,
          stack: e.stack
        });
      } else {
        logger?.warning('initializeController.init', 'Initialization skipped, context was invalidated. Please reload the tab.');
      }
      if (State.controller) {
        State.controller.cleanup();
        State.controller = null;
      }
    });
  };
  SectionRepeat.initializeController = initializeController;
  const keydownQueue = [];
  const handleKeyDown = function(e) {
    const logger = SectionRepeat.logger;
    if (!State.isFullyInitialized) {
      const now = performance.now();
      const {
        KEY_QUEUE,
        TOAST_DURATION
      } = State.CONSTANTS;

      if (!hasShownSlowInitToast) {
        const tempToastQueue = new SectionRepeat.ToastQueue();
        // show 메서드가 반환하는 ID를 저장
        slowInitToastId = tempToastQueue.show(
          helpers.t('toast_warn_initialization_slow'),
          999999, // 닫히지 않도록 긴 시간 설정
          'warning'
        );
        hasShownSlowInitToast = true;
      }

      const lastEvent = keydownQueue[keydownQueue.length - 1];
      if (lastEvent && lastEvent.event.code === e.code) {
        return;
      }
      if (keydownQueue.length < (KEY_QUEUE?.MAX_SIZE || 5)) {
        keydownQueue.push({
          event: e,
          timestamp: now
        });
      }
      return;
    }
    if (!State.CONSTANTS?.HOTKEYS || !State.controller || State.controller.isLive || helpers?.shouldIgnoreKeyEvent(e)) {
      return;
    }
    const code = e.code;
    const {
      HOTKEYS,
      JUMP_KEYS
    } = State.CONSTANTS;
    const jumpKeyIndex = JUMP_KEYS.indexOf(e.key);
    if (jumpKeyIndex !== -1) {
      State.controller.jumpToSection(jumpKeyIndex);
      return;
    }
    switch (code) {
      case HOTKEYS.focus:
        handleFocusMode();
        break;
      case HOTKEYS.start:
        State.controller.startSection();
        break;
      case HOTKEYS.end:
        State.controller.endSection();
        break;
      case HOTKEYS.toggleRepeat:
        State.controller.toggleRepeat();
        break;
      case HOTKEYS.prev:
        State.controller.navigateSections('prev');
        break;
      case HOTKEYS.next:
        State.controller.navigateSections('next');
        break;
      case HOTKEYS.clearSections:
        State.controller.clearSections();
        break;
    }
  };
  SectionRepeat.handleKeyDown = handleKeyDown;
  async function handleFocusMode() {
    if (!State.CONSTANTS) return;
    const t = helpers.t;
    const url = new URL(location.href);

    const ONBOARDING_KEY = State.CONSTANTS.STORAGE_KEYS.ONBOARDING_STATE;
    const {
      [ONBOARDING_KEY]: onboardingState
    } = await chrome.storage.local.get(ONBOARDING_KEY);
    if (onboardingState && onboardingState.has_used_w === false) {
      onboardingState.has_used_w = true;
      await chrome.storage.local.set({
        [ONBOARDING_KEY]: onboardingState
      });
    }

    if (!url.searchParams.has('list')) {
      State.controller?.toast(t('toast_info_focus_mode_already'), State.CONSTANTS.TOAST_DURATION.SHORT, 'info');
      return;
    }

    State.controller?.toast(t('toast_info_focus_mode_entering'), State.CONSTANTS.TOAST_DURATION.SHORT, 'success');
    document.body.classList.add('loading');

    try {
      const response = await helpers.sendMessage({
        type: State.CONSTANTS.MESSAGE_TYPES.SET_FOCUS_MODE,
        payload: {
          isFocus: true
        }
      });

      if (response && response.success) {
        url.searchParams.delete('list');
        url.searchParams.delete('index');
        url.searchParams.delete('pp');
        location.href = url.href;
      } else {
        throw new Error('Failed to set focus mode in background.');
      }
    } catch (error) {
      document.body.classList.remove('loading');
      State.controller?.toast(t('toast_error_focus_mode_failed'), State.CONSTANTS.TOAST_DURATION.MEDIUM, 'error');
      SectionRepeat.logger?.error('handleFocusMode', 'Could not enter focus mode.', error);
    }
  }
  async function checkAndApplyPendingSave() {
    const logger = SectionRepeat.logger;
    const t = helpers.t;
    try {
      if (!State.controller || !State.controller.videoId) return;
      const currentVideoId = State.controller.videoId;
      const hashedId = await helpers.hashVideoId(currentVideoId);
      if (!hashedId) return;
      const pendingKey = `${State.CONSTANTS.STORAGE_KEYS.PENDING_OP_PREFIX}${hashedId}`;
      const result = await chrome.storage.local.get(pendingKey);
      const pendingSaveOperation = result[pendingKey];
      if (pendingSaveOperation && pendingSaveOperation.key) {
        logger.info('checkAndApplyPendingSave', 'Found pending save operation for this video. Attempting to save now.');
        await chrome.storage.local.set({
          [pendingSaveOperation.key]: pendingSaveOperation.payload
        });
        await chrome.storage.local.remove(pendingKey);
        logger.info('checkAndApplyPendingSave', 'Pending save operation completed successfully.');
        State.controller.toast(t('toast_success_pending_save_applied'), State.CONSTANTS.TOAST_DURATION.MEDIUM, 'success');
      }
    } catch (e) {
      if (e.message.includes('QUOTA_EXCEEDED')) {
        logger.warning('checkAndApplyPendingSave', 'Could not apply pending save, storage is likely still full.');
      } else {
        logger.error('checkAndApplyPendingSave', 'Failed to apply pending save.', e);
      }
    }
  }

  function processKeydownQueue() {
    const now = performance.now();
    const staleThreshold = State.CONSTANTS?.KEY_QUEUE?.STALE_EVENT_THRESHOLD_MS || 2500;
    while (keydownQueue.length > 0) {
      const {
        event,
        timestamp
      } = keydownQueue.shift();
      if (now - timestamp > staleThreshold) {
        SectionRepeat.logger?.warning('processKeydownQueue', 'Stale keydown event ignored.', {
          code: event.code
        });

        if (!hasShownSlowInitToast && State.controller) {
          State.controller.toast(
            helpers.t('toast_warn_initialization_slow'),
            State.CONSTANTS.TOAST_DURATION.MEDIUM,
            'warning'
          );
          hasShownSlowInitToast = true;
        }
        continue;
      }
      handleKeyDown(event);
    }
  }

  function setupMessageHandlers() {
    const t = helpers?.t || ((key) => key);
    State.messageHandlers.set(State.CONSTANTS.MESSAGE_TYPES.INIT_PAYLOAD, (message) => {
      if (State.initManager) {
        State.initManager.handleInitialPayload(message.payload, slowInitToastId);
        checkAndApplyPendingSave();
        processKeydownQueue();
      }
    });
    State.messageHandlers.set(State.CONSTANTS.MESSAGE_TYPES.STORAGE_WARNING, (message) => {
      if (State.controller && State.CONSTANTS) {
        const keyMap = {
          critical: 'toast_error_storage_critical',
          warning: 'toast_warning_storage_level',
          info: 'toast_success_storage_cleaned',
          purge_success: 'popup_storage_purge_completed'
        };
        const msgKey = keyMap[message.level] || 'toast_warning_storage_level';
        const toastType = {
          critical: 'error',
          info: 'success',
          warning: 'warning',
          purge_success: 'info'
        } [message.level] || 'info';
        const substitutions = (message.level === 'info' || message.level === 'warning' || message.level === 'critical') ? [message.usage] : undefined;
        State.controller.toast(t(msgKey, substitutions), State.CONSTANTS.TOAST_DURATION.LONG, toastType);
      }
      if (message.level === 'info' || message.level === 'purge_success') {
        checkAndApplyPendingSave();
      }
    });
    State.messageHandlers.set(State.CONSTANTS.MESSAGE_TYPES.FORCE_STOP_REPEAT, () => {
      if (State.controller) {
        State.controller.stopRepeat(false);
        State.controller.toast(helpers.t('toast_warning_repeat_stopped_unexpectedly'), State.CONSTANTS.TOAST_DURATION.MEDIUM, 'warning');
      }
    });
    State.messageHandlers.set(State.CONSTANTS.MESSAGE_TYPES.EXECUTE_REPEAT_CHECK, () => {
      State.controller?.repeatManager?.checkRepeatState();
    });
    State.messageHandlers.set(State.CONSTANTS.MESSAGE_TYPES.ARE_YOU_STILL_REPEATING, () => {});
    State.messageHandlers.set(State.CONSTANTS.MESSAGE_TYPES.INIT_FAILED, (message) => {
      const logger = SectionRepeat.logger;
      logger.critical('InitFailed', 'Initialization failed from background', {
        reason: message.payload.reason
      });
      if (State.controller) {
        State.controller.cleanup();
      }
      if (State.initManager?.keydownHandler) {
        document.removeEventListener('keydown', State.initManager.keydownHandler);
      }
      const toastQueue = State.controller?.toastQueue || new SectionRepeat.ToastQueue();
      toastQueue.show(t('toast_error_player_init_failed'), 999999, 'error', {
        isPermanent: true,
        isInteractive: true,
        actionKey: 'toast_action_reload',
        actionCallback: () => location.reload(),
        focusInside: true
      });
      State.isFullyInitialized = false;
    });
  }

  function createGlobalAriaAnnouncer() {
    if (State.globalAriaAnnouncer) return;
    const announcer = document.createElement('div');
    announcer.id = 'section-repeat-global-announcer';
    announcer.className = 'visually-hidden';
    announcer.setAttribute('aria-live', 'polite');
    announcer.setAttribute('aria-atomic', 'true');
    document.body.appendChild(announcer);
    State.globalAriaAnnouncer = announcer;
  }
  SectionRepeat.handleBeforeUnload = () => {
    if (State.controller) {
      State.controller.flushPendingSaves();
      State.controller.cleanup();
      State.controller = null;
    }
    State.navigationManager?.cleanup();
    SectionRepeat.TimerManager.clearAll();
    State.unifiedObserver?.cleanup();
    State.elementCache?.clear();
    if (State.globalAriaAnnouncer) State.globalAriaAnnouncer.remove();
    SectionRepeat.TimerManager.clear(State.extensionHealthCheckTimer, 'interval');
    window.removeEventListener('beforeunload', SectionRepeat.handleBeforeUnload);
  };
  const initialize = () => {
    State.initManager = new SectionRepeat.InitializationManager();
    State.initManager.initialize();
  };

  const preInitialize = () => {
    if (!SectionRepeat.InitializationManager) {
      SectionRepeat.logger.critical('init', "Critical component 'InitializationManager' not found!");
      return;
    }
    if (!State.messageListenerRegistered && chrome?.runtime?.onMessage) {
      State.messageListenerRegistered = true;
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        const handler = State.messageHandlers.get(message.type);
        if (handler) {
          const result = handler(message, sendResponse);
          if (result === true) {
            return true;
          }
        }
        return false;
      });
    }
    createGlobalAriaAnnouncer();
    initialize();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', preInitialize);
  } else {
    preInitialize();
  }
})();