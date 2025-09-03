(function() {
  'use strict';
  const STORAGE_PREFIX = 'sr:';
  const PROD_EXTENSION_ID = 'pppgnfkfeciopablcbkjdohiknebahkc';
  const IS_PRODUCTION = ('update_url' in chrome.runtime.getManifest());
  const HOTKEYS = Object.freeze({
    focus: 'KeyW',
    start: 'KeyS',
    end: 'KeyE',
    toggleRepeat: 'KeyR',
    prev: 'KeyA',
    next: 'KeyD',
    clearSections: 'KeyQ',
  });
  const JUMP_KEYS = Object.freeze(['1', '2', '3', '4', '5', '6', '7', '8', '9']);
  const SECTION_COLORS = Object.freeze([
    '#d93025', '#1a73e8', '#f9ab00', '#1e8e3e',
    '#f28b82', '#4285f4', '#ffc107', '#34a853',
  ]);
  const ICONS = Object.freeze({
    INFO: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>',
    SUCCESS: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>',
    WARNING: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>',
    ERROR: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1.41 13.59L12 14.17l-1.41 1.42L9.17 17l-1.41-1.41L10.59 12 7.76 9.17 9.17 7.76 12 10.59l2.83-2.83 1.41 1.41L13.41 12l2.83 2.83-1.42 1.41z"/></svg>',
    CLOSE: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>'
  });
  const SELECTORS = Object.freeze({
    PLAYER: [
      '#movie_player', '[id="movie_player"]', 'ytd-watch-flexy #movie_player',
      '.html5-video-player', 'ytd-player #container', 'div.ytp-player-container',
      '#player-container #movie_player', 'div[class*="player"][class*="container"]',
    ],
    VIDEO: [
      '#movie_player video', 'video.html5-main-video', 'video.video-stream',
      '.html5-video-player video', 'video.html5-video-player', 'video[src*="blob:"]', 'video',
    ],
    PROGRESS_BAR: [
      '#movie_player [role="slider"]',
      '#movie_player .ytp-progress-bar',
      '.ytp-progress-bar', '.ytp-progress-bar-container',
      'div.ytp-progress-bar', '[class*="progress-bar"]',
    ],
    PROGRESS_BAR_CONTAINER: [
      '.ytp-progress-bar-container'
    ],
    CONTROLS: [
      '#movie_player .ytp-chrome-controls', '.ytp-chrome-controls',
      '.ytp-chrome-bottom', 'div.ytp-chrome-controls',
      '.ytp-control-bar-container', '[class*="chrome-controls"]',
    ],
    LIVE_BADGE: [
      '.ytp-live-badge:not([aria-disabled="true"])', '.ytp-live-badge[aria-disabled="false"]',
      'span.ytd-badge-supported-renderer[aria-label*="LIVE"]',
      '.badge-style-type-live-now', '.ytp-live',
    ],
  });
  const YOUTUBE_EVENTS = Object.freeze({
    PAGE_DATA_UPDATED: 'yt-page-data-updated',
    NAVIGATE_START: 'yt-navigate-start',
    NAVIGATE_FINISH: 'yt-navigate-finish',
    PLAYER_UPDATED: 'yt-player-updated',
    PLAYLIST_DATA_UPDATED: 'yt-playlist-data-updated',
    YT_ACTION: 'yt-action',
    LOCATION_CHANGE: 'locationchange'
  });
  const YOUTUBE_VIDEO_URL_PATTERNS = Object.freeze({
    WATCH: '/watch',
    SHORTS: '/shorts/',
    EMBED: '/embed/',
  });
  const MODES = Object.freeze({
    STABLE: 'stable',
    REPEATING: 'repeating',
  });
  const MESSAGE_TYPES = Object.freeze({
    HASH_VIDEO_ID: 'HASH_VIDEO_ID',
    SAVE_DATA_AND_METADATA: 'SAVE_DATA_AND_METADATA',
    INIT_PAYLOAD: 'INIT_PAYLOAD',
    STORAGE_WARNING: 'STORAGE_WARNING',
    FORCE_STOP_REPEAT: 'FORCE_STOP_REPEAT',
    INIT_FAILED: 'INIT_FAILED',
    CONTENT_SCRIPT_READY: 'CONTENT_SCRIPT_READY',
    GET_TAB_STATE: 'GET_TAB_STATE',
    REPEAT_STATE_CHANGED: 'REPEAT_STATE_CHANGED',
    STILL_REPEATING: 'STILL_REPEATING',
    LOG_ERROR: 'LOG_ERROR',
    TRIGGER_IMMEDIATE_PURGE: 'TRIGGER_IMMEDIATE_PURGE',
    NAVIGATED_AWAY_FROM_VIDEO: 'NAVIGATED_AWAY_FROM_VIDEO',
    ACQUIRE_LOCK: 'ACQUIRE_LOCK',
    RELEASE_LOCK: 'RELEASE_LOCK',
    GET_HOTKEYS: 'GET_HOTKEYS',
    GET_STORAGE_INFO: 'GET_STORAGE_INFO',
    FORCE_PURGE: 'FORCE_PURGE',
    REATTEMPT_SETUP: 'REATTEMPT_SETUP',
    GET_CONSTANTS: 'GET_CONSTANTS',
    GET_POPUP_INIT_DATA: 'GET_POPUP_INIT_DATA',
    GET_USER_SALT: 'GET_USER_SALT',
    SCHEDULE_REPEAT_CHECK: 'SCHEDULE_REPEAT_CHECK',
    EXECUTE_REPEAT_CHECK: 'EXECUTE_REPEAT_CHECK',
    CANCEL_REPEAT_CHECK: 'CANCEL_REPEAT_CHECK',
    SET_FOCUS_MODE: 'SET_FOCUS_MODE',
    START_HEARTBEAT_ALARM: 'START_HEARTBEAT_ALARM',
    STOP_HEARTBEAT_ALARM: 'STOP_HEARTBEAT_ALARM',
    ARE_YOU_STILL_REPEATING: 'ARE_YOU_STILL_REPEATING',
  });
  const STORAGE_KEYS = Object.freeze({
    METADATA: `${STORAGE_PREFIX}metadata`,
    USER_SALT: 'userSalt',
    SALT_TYPE: 'salt_type',
    SYNC_ENABLED: 'is_sync_enabled',
    SETUP_FAILED: 'setup_failed',
    SETUP_ERROR_MESSAGE: 'setup_error_message',
    SETUP_ERROR_TYPE: 'setup_error_type',
    ONBOARDING_STATE: 'sr:onboarding_state',
    PURGE_REQUIRED: 'purge_required',
    PURGE_USAGE_PERCENT: 'purge_usage_percent',
    TAB_STATES: 'tabStates',
    PENDING_OP_PREFIX: 'pending_op_',
    LOCK_PREFIX: 'lock_',
    CRITICAL_INIT_FAILURE: 'CRITICAL_INIT_FAILURE',
  });
  const ALARM_NAMES = Object.freeze({
    PURGE_OLD_SECTIONS: 'purgeOldSections',
    VALIDATE_REPEATING_TABS: 'validateRepeatingTabs',
    CLEANUP_MESSAGE_QUEUE: 'cleanupMessageQueue',
    PROCESS_PENDING_SAVES: 'processPendingSaves',
    RECONCILE_STORAGE: 'reconcileStorage',
    RETRY_PURGE: 'retry-purge',
    RETRY_RECONCILE: 'retry-reconcile',
    RETRY_SALT_SETUP_PREFIX: 'retry-salt-setup:',
    RETRY_SEND_PAYLOAD_PREFIX: 'retry-send-initial-payload:',
    RETRY_ON_REMOVED_PREFIX: 'retry-onRemoved:',
    RETRY_ON_REPLACED_PREFIX: 'retry-onReplaced:',
    CLEANUP_TAB_PREFIX: 'cleanup-tab:',
    REPEAT_CHECK_PREFIX: 'repeat-check:'
  });
  const LOCK_KEYS = Object.freeze({
    TAB_STATES: 'tab_states_global_lock',
    STORAGE_PURGE: 'storage_purge_lock',
    SALT_SETUP: 'salt_setup_lock',
    METADATA_ACCESS: 'metadata_access_lock',
    STATE_QUEUE_PROCESS: 'state_queue_process_lock',
  });
  const TIMING = Object.freeze({
    DEBOUNCE: {
      SAVE: 3000,
      SYNC: 10000,
      BADGE: 200,
      TOAST: 500,
      MUTATION: 150,
    },
    TIMEOUT: {
      AUTOPLAY_CHECK: 10000,
      PLAYER_READY: 10000,
      INIT_CONSTANTS: 5000,
      FOCUS_MODE_REDIRECT: 300,
      FOCUS_MODE_RELOAD_FALLBACK: 3000,
      YOUTUBE_API_CHECK: 100,
      YOUTUBE_API_MAX_WAIT: 15000,
      LOCK: 5000,
      QUEUE_LOCK: 15000,
      STALE_LOCK_MULTIPLIER: 1.5,
      STALE_TAB_STATE_MS: 65000,
      EXTENSION_RECONNECT: 2000,
      CONTENT_SCRIPT_RPC: 5000,
      PLAYER_CHECK_DELAY: 500,
      PLAYER_REMOVAL_CHECK: 500,
      REINIT_DELAY: 200,
      PLAYLIST_ITEM_CLICK: 300,
      POPUP_RELOAD_DELAY: 1500,
      POPUP_MESSAGE: 5000,
      POPUP_ERROR_DISPLAY: 5000,
      LOCK_RELEASE_RETRY_DELAY_MIN: 0.1,
      LOCK_RETRY_DELAY_MS: 50,
      TAB_REMOVED_RETRY_DELAY_MIN: 0.2,
      TAB_CLEANUP_GRACE_PERIOD_MIN: 0.2,
      PURGE_RETRY_DELAY_MIN: 1,
      PURGE_FAIL_RETRY_DELAY_MIN: 5,
      PENDING_SAVE_FAIL_RETRY_MIN: 10,
      RECONCILE_RETRY_DELAY_MIN: 1
    },
    RETRY: {
      DEFAULT_ATTEMPTS: 3,
      STATE_UPDATE_ATTEMPTS: 3,
      DEFAULT_DELAY_MS: 200,
      DEFAULT_BACKOFF_MULTIPLIER: 1.5,
      INIT_BASE: 1000,
      INIT_MULTIPLIER: 2,
      INIT_MAX_ATTEMPTS: 3,
      EXTENSION_RECONNECT_MAX: 5,
      HASH_VIDEO_ID_ATTEMPTS: 3,
      SALT_SETUP_BACKOFF_MIN: 0.5,
      INITIAL_PAYLOAD_RETRY_DELAY_MIN: 0.01,
    },
    INTERVAL: {
      DOM_CACHE_CHECK: 1000,
      PURGE_PERIOD_MIN: 60,
      VALIDATE_TABS_PERIOD_MIN: 1,
      CLEANUP_QUEUE_PERIOD_MIN: 3,
      PROCESS_SAVES_PERIOD_MIN: 5,
      RECONCILE_STORAGE_PERIOD_DAY: 1,
      EXTENSION_HEALTH_CHECK: 10000,
      PLAYLIST_CHECK: 10000,
      PLAYLIST_CHECK_BACKGROUND: 15000,
      OVERLAY_UPDATE: 250,
      CONTROLLER_HEALTH_CHECK: 5000,
    },
    ANIMATION: {
      TOAST_FADE: 200,
      INCOMPLETE_PULSE: 2000,
    },
  });
  const TOAST_DURATION = Object.freeze({
    SHORT: 2000,
    MEDIUM: 3000,
    LONG: 4000,
    EXTRA_LONG: 6000,
  });
  const SECTION_LIMITS = Object.freeze({
    MIN_SECTION_SEC: 0.5,
    MAX_SECTIONS_PER_VIDEO: 50,
    MAX_AGE_MS: 30 * 24 * 60 * 60 * 1000,
    MAX_KEYS: 3000,
  });
  const STORAGE = Object.freeze({
    MAX_BYTES: 5 * 1024 * 1024,
    TARGET_RATIO: 0.7,
    WARNING_RATIO: 0.75,
    CRITICAL_RATIO: 0.9,
    PURGE_START_RATIO: 0.75,
    CHUNK_SIZE: 50,
    BATCH_SIZE: 10,
    PURGE_INTERVAL_MINUTES: 60,
    PURGE_BATCH_DELAY_MS: 25,
  });
  const VIDEO_END_DETECTION = Object.freeze({
    THRESHOLD: 0.3,
    SEEK_AWAY_THRESHOLD: 0.3,
    SAFE_OFFSET: 0.2,
    CHECK_START: 1.0,
    AUTO_DETECT: 1.0,
  });
  const REPEAT_BEHAVIOR = Object.freeze({
    RETURN_THRESHOLD: 0.1,
    SECTION_START_TOLERANCE: 0.5,
    MIN_DURATION_FOR_RENDER: 0.1,
  });
  const LIVE_STREAM = Object.freeze({
    DVR_THRESHOLD: 60,
    CHECK_INTERVAL: 5000,
  });
  const TOAST_QUEUE = Object.freeze({
    MAX_SIZE: 5,
    DEBOUNCE_TIME: 500,
  });
  const KEY_QUEUE = Object.freeze({
    STALE_EVENT_THRESHOLD_MS: 5000,
    MAX_SIZE: 10,
  });
  const MESSAGE_QUEUE = Object.freeze({
    MAX_SIZE: 100,
    EXPIRY_MS: 30000,
  });
  const LOG_LEVELS = Object.freeze({
    NONE: -1,
    DEBUG: 0,
    INFO: 1,
    WARNING: 2,
    ERROR: 3,
    CRITICAL: 4,
  });
  const CURRENT_LOG_LEVEL = IS_PRODUCTION ? LOG_LEVELS.ERROR : LOG_LEVELS.DEBUG;
  const CONTEXTS = Object.freeze({
    ENDED_PLAY_ERROR: 'ended.play',
  });
  const DOM_CACHE_CONFIG = Object.freeze({
    BASE_SIZE: 20,
    MULTIPLIER: 10,
    MAX_SIZE: 100,
  });
  const DOM_CACHE = Object.freeze({
    CHECK_INTERVAL: 1000,
    TTL: 30000,
  });
  const RECONNECT_STATE = Object.freeze({
    CONNECTING: 'connecting',
    CONNECTED: 'connected',
    DISCONNECTED: 'disconnected',
    PERMANENTLY_DISCONNECTED: 'permanently_disconnected',
  });
  const ERROR_TYPES = Object.freeze({
    CRYPTO_API_FAILED: 'crypto_api_failed',
    SETUP_UNKNOWN: 'setup_unknown_error',
  });
  const CONST = {
    STORAGE_PREFIX,
    IS_PRODUCTION,
    HOTKEYS,
    JUMP_KEYS,
    SECTION_COLORS,
    ICONS,
    SELECTORS,
    YOUTUBE_EVENTS,
    YOUTUBE_VIDEO_URL_PATTERNS,
    MODES,
    MESSAGE_TYPES,
    STORAGE_KEYS,
    ALARM_NAMES,
    LOCK_KEYS,
    TIMING,
    TOAST_DURATION,
    SECTION_LIMITS,
    STORAGE,
    VIDEO_END_DETECTION,
    REPEAT_BEHAVIOR,
    LIVE_STREAM,
    TOAST_QUEUE,
    KEY_QUEUE,
    MESSAGE_QUEUE,
    LOG_LEVELS,
    CURRENT_LOG_LEVEL,
    DOM_CACHE_CONFIG,
    DOM_CACHE,
    RECONNECT_STATE,
    CONTEXTS,
    ERROR_TYPES,
    DATA_SCHEMA_VERSION: 2,
  };
  const isServiceWorker = typeof WorkerGlobalScope !== 'undefined' && typeof importScripts === 'function';
  const isContentScript = typeof window !== 'undefined' && typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id && !location.href.includes('popup.html');
  const isPopup = typeof window !== 'undefined' && typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id && location.href.includes('popup.html');
  if (isServiceWorker) {
    self.CONST = CONST;
  } else if (isContentScript) {
    const SECTION_REPEAT_NAMESPACE = Symbol.for('SectionRepeat');
    if (!window[SECTION_REPEAT_NAMESPACE]) {
      window[SECTION_REPEAT_NAMESPACE] = {};
    }
    window.SectionRepeat = window[SECTION_REPEAT_NAMESPACE];
    window.SectionRepeat.CONSTANTS = CONST;
  } else if (isPopup) {
    window.CONST = CONST;
  }
})();