(function() {
  'use strict';
  const SectionRepeat = window.SectionRepeat || {};
  window.SectionRepeat = SectionRepeat;

  class CryptoError extends Error {
    constructor(message) {
      super(message);
      this.name = 'CryptoError';
    }
  }
  SectionRepeat.CryptoError = CryptoError;

  SectionRepeat.LRUCache = class LRUCache {
    constructor(maxSize = 20, ttl = 30000) {
      this.elementCache = new WeakMap();
      this.metadata = new Map();
      this.maxSize = maxSize;
      this.ttl = ttl;
    }
    get(key) {
      const meta = this.metadata.get(key);
      if (!meta) return null;
      if (Date.now() - meta.timestamp > this.ttl) {
        this.metadata.delete(key);
        return null;
      }
      const element = meta.weakKey ? this.elementCache.get(meta.weakKey) : meta.value;
      if (element && element.nodeType && !element.isConnected) {
        this.metadata.delete(key);
        return null;
      }
      this.metadata.delete(key);
      this.metadata.set(key, meta);
      return element;
    }
    set(key, value) {
      if (this.metadata.size >= this.maxSize && !this.metadata.has(key)) {
        const firstKey = this.metadata.keys().next().value;
        this.metadata.delete(firstKey);
      }
      if (value && value.nodeType) {
        const weakKey = {
          key
        };
        this.elementCache.set(weakKey, value);
        this.metadata.set(key, {
          weakKey,
          timestamp: Date.now()
        });
      } else {
        this.metadata.set(key, {
          value,
          timestamp: Date.now()
        });
      }
    }
    clear() {
      this.metadata.clear();
    }
    has(key) {
      const meta = this.metadata.get(key);
      if (!meta) return false;
      if (Date.now() - meta.timestamp > this.ttl) {
        this.metadata.delete(key);
        return false;
      }
      return true;
    }
    delete(key) {
      return this.metadata.delete(key);
    }
    cleanup() {
      const now = Date.now();
      this.metadata.forEach((meta, key) => {
        if (now - meta.timestamp > this.ttl) {
          this.metadata.delete(key);
        }
      });
    }
    invalidate() {
      this.clear();
    }
  };
  SectionRepeat.UnifiedObserverManager = class UnifiedObserverManager {
    constructor() {
      this.callbacks = new Map();
      this.observer = null;
      this.observedNodes = new Map();
      this.observeConfigs = new WeakMap();
      this.pendingMutations = [];
      this.processTimer = null;
      this.useIdleCallback = 'requestIdleCallback' in window;
      this.batchSize = 50;
      this.debounceDelay = SectionRepeat.State?.CONSTANTS?.TIMING.DEBOUNCE.MUTATION || 150;
      this.nodeKeys = new WeakMap();
      this.nextKey = 0;
    }
    init() {
      if (this.observer) return;
      this.observer = new MutationObserver((mutations) => {
        const MAX_PENDING_MUTATIONS = this.batchSize * 2;
        const spaceLeft = MAX_PENDING_MUTATIONS - this.pendingMutations.length;
        if (spaceLeft > 0) {
          this.pendingMutations.push(...mutations.slice(0, spaceLeft));
        }
        if (this.processTimer) return;
        if (this.useIdleCallback) {
          this.processTimer = requestIdleCallback(() => {
            this.processMutations();
            this.processTimer = null;
          }, {
            timeout: this.debounceDelay
          });
        } else {
          this.processTimer = SectionRepeat.TimerManager.set(() => {
            this.processMutations();
            this.processTimer = null;
          }, this.debounceDelay);
        }
      });
    }
    processMutations() {
      const mutations = this.pendingMutations.splice(0, this.batchSize);
      const uniqueMutations = this.deduplicateMutations(mutations);
      const callbacksToExecute = new Map();
      uniqueMutations.forEach(mutation => {
        this.callbacks.forEach((callback, key) => {
          if (callback.target && !callback.target.contains(mutation.target)) return;
          if (callback.filter && !callback.filter(mutation)) return;
          if (!callbacksToExecute.has(key)) callbacksToExecute.set(key, []);
          callbacksToExecute.get(key).push(mutation);
        });
      });
      callbacksToExecute.forEach((mutations, key) => {
        const callback = this.callbacks.get(key);
        if (callback && mutations.length > 0) {
          try {
            callback.handler(mutations);
          } catch (e) {
            console.error(`[SectionRepeat] Observer callback error for ${key}:`, e);
          }
        }
      });
      if (this.pendingMutations.length > 0) {
        SectionRepeat.TimerManager.set(() => this.processMutations(), this.debounceDelay);
      }
    }
    deduplicateMutations(mutations) {
      const seen = new Map();
      return mutations.filter(mutation => {
        const targetKey = this.getTargetKey(mutation.target);
        const key = `${mutation.type}-${targetKey}-${mutation.attributeName || ''}`;
        if (!seen.has(key) || mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0) {
          seen.set(key, true);
          return true;
        }
        return false;
      });
    }
    register(key, target, callback, options = {}) {
      if (!this.observer) this.init();
      if (this.callbacks.has(key)) this.unregister(key);
      const targetKey = this.getTargetKey(target);
      if (this.observedNodes.has(targetKey)) {
        this.observedNodes.get(targetKey).count++;
      } else {
        const observeOptions = {
          childList: true,
          subtree: true,
          ...options
        };
        try {
          this.observer.observe(target, observeOptions);
          this.observedNodes.set(targetKey, {
            count: 1,
            target
          });
        } catch (e) {}
      }
      this.callbacks.set(key, {
        handler: callback,
        filter: options.filter,
        target: target
      });
    }
    unregister(key) {
      const callback = this.callbacks.get(key);
      if (callback) this.decrementTargetRef(callback.target);
      this.callbacks.delete(key);
      if (this.callbacks.size === 0 && this.observer) {
        this.observer.disconnect();
        this.observedNodes.clear();
      }
    }
    decrementTargetRef(target) {
      const targetKey = this.getTargetKey(target);
      const nodeInfo = this.observedNodes.get(targetKey);
      if (nodeInfo) {
        nodeInfo.count--;
        if (nodeInfo.count <= 0) this.observedNodes.delete(targetKey);
      }
    }
    getTargetKey(target) {
      if (target.id) return target.id;
      if (this.nodeKeys.has(target)) {
        return this.nodeKeys.get(target);
      }
      const newKey = `sr-observed-${this.nextKey++}`;
      this.nodeKeys.set(target, newKey);
      return newKey;
    }
    cleanup() {
      if (this.processTimer) {
        this.useIdleCallback ? cancelIdleCallback(this.processTimer) : SectionRepeat.TimerManager.clear(this.processTimer);
        this.processTimer = null;
      }
      if (this.observer) {
        this.observer.disconnect();
        this.observer = null;
      }
      this.callbacks.clear();
      this.observedNodes.clear();
      this.pendingMutations = [];
    }
  };
  SectionRepeat.TimerManager = {
    activeTimers: new Map(),
    set(callback, delay, type = 'timeout') {
      let id;
      if (type === 'timeout') {
        id = setTimeout(() => {
          this.activeTimers.delete(id);
          callback();
        }, delay);
      } else {
        id = setInterval(callback, delay);
      }
      this.activeTimers.set(id, type);
      return id;
    },
    clear(id, type = 'timeout') {
      if (!id) return;
      const storedType = this.activeTimers.get(id) || type;
      this.activeTimers.delete(id);
      storedType === 'timeout' ? clearTimeout(id) : clearInterval(id);
    },
    clearAll() {
      this.activeTimers.forEach((type, id) => {
        type === 'timeout' ? clearTimeout(id) : clearInterval(id);
      });
      this.activeTimers.clear();
    }
  };
  SectionRepeat.ErrorLogger = class ErrorLogger {
    constructor() {
      this.contextPrefix = 'content';
    }
    log(level, context, message, details = {}) {
      const State = SectionRepeat.State;
      const LOG_LEVELS = State?.CONSTANTS?.LOG_LEVELS || {
        ERROR: 3
      };
      if (State?.CONSTANTS?.IS_PRODUCTION && level < LOG_LEVELS.ERROR) return;
      if (level < (State?.CONSTANTS?.CURRENT_LOG_LEVEL ?? LOG_LEVELS.ERROR)) return;
      const fullContext = `[SectionRepeat][${this.contextPrefix}][${context}]`;
      let formattedMessage = message;
      if (message instanceof Error) {
        formattedMessage = `Error: ${message.message}${message.stack ? `\nStack: ${message.stack}` : ''}`;
      } else if (typeof message === 'object' && message !== null) {
        formattedMessage = JSON.stringify(message);
      }
      const hasDetails = details && Object.keys(details).length > 0;
      const levels = {
        0: 'debug',
        1: 'info',
        2: 'warn',
        3: 'error',
        4: 'error'
      };
      const method = console[levels[level]] || console.log;
      hasDetails ? method(fullContext, formattedMessage, details) : method(fullContext, formattedMessage);
    }
    debug(context, message, details) {
      this.log(0, context, message, details);
    }
    info(context, message, details) {
      this.log(1, context, message, details);
    }
    warning(context, message, details) {
      this.log(2, context, message, details);
    }
    error(context, error, details) {
      this.log(3, context, error, { ...details,
        stack: error?.stack
      });
    }
    critical(context, error, details) {
      this.log(4, context, error, { ...details,
        stack: error?.stack
      });
    }
  };
  SectionRepeat.ExtensionConnectionManager = class ExtensionConnectionManager {
    constructor() {
      this.state = 'connected';
      this.maxRetries = 5;
      this.retryCount = 0;
      this.reconnectPromise = null;
      this.reconnectBackoff = [1000, 2000, 4000, 8000, 16000];
    }
    isValid() {
      try {
        const isValid = !!(chrome && chrome.runtime && chrome.runtime.id);
        if (isValid) {
          this.state = 'connected';
          this.retryCount = 0;
        }
        return isValid;
      } catch (e) {
        return false;
      }
    }
    async reconnect() {
      if (this.reconnectPromise) return this.reconnectPromise;
      if (this.state === 'permanently_disconnected') return false;
      this.state = 'reconnecting';
      SectionRepeat.logger?.info('ExtensionConnectionManager', 'Attempting to reconnect...');
      this.reconnectPromise = this._performReconnect().finally(() => {
        this.reconnectPromise = null;
      });
      return this.reconnectPromise;
    }
    async _performReconnect() {
      for (let i = 0; i < this.maxRetries; i++) {
        if (this.isValid()) {
          this.state = 'connected';
          SectionRepeat.logger?.info('ExtensionConnectionManager', 'Reconnected successfully.', {
            attempts: i + 1
          });
          SectionRepeat.State.controller?.toast(SectionRepeat.helpers.t('toast_success_reconnected'), 3000, 'success');
          return true;
        }
        const delay = this.reconnectBackoff[Math.min(i, this.reconnectBackoff.length - 1)];
        await new Promise(resolve => SectionRepeat.TimerManager.set(resolve, delay));
      }
      this.showReloadPrompt();
      this.state = 'permanently_disconnected';
      return false;
    }
    showReloadPrompt() {
      if (!SectionRepeat.State.controller || !SectionRepeat.State.controller.toastQueue) return;
      const helpers = SectionRepeat.helpers;
      SectionRepeat.State.controller.toastQueue.show(
        helpers.t('toast_reload_prompt'),
        999999,
        'error', {
          isPermanent: true,
          isInteractive: true,
          actionKey: 'toast_action_reload',
          actionCallback: () => location.reload(),
          focusInside: true
        }
      );
    }
    _sendMessagePromise(message) {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) {
            return reject(chrome.runtime.lastError);
          }
          resolve(response);
        });
      });
    }
    async sendMessage(message, requireResponse = false) {
      if (this.state === 'permanently_disconnected') {
        SectionRepeat.logger?.warning('sendMessage', 'Extension permanently disconnected, message dropped.', {
          type: message.type
        });
        return null;
      }
      if (!this.isValid()) {
        const reconnected = await this.reconnect();
        if (!reconnected) return null;
      }
      try {
        if (requireResponse) {
          const timeout = SectionRepeat.State.CONSTANTS.TIMING.TIMEOUT.CONTENT_SCRIPT_RPC;
          return await Promise.race([
            this._sendMessagePromise(message),
            new Promise((_resolve, reject) => SectionRepeat.TimerManager.set(() => reject(new Error('timeout')), timeout))
          ]);
        } else {
          this._sendMessagePromise(message).catch(e => {
            if (e.message?.includes('Extension context invalidated')) {
              this.state = 'disconnected';
              this.reconnect();
            }
          });
          return null;
        }
      } catch (e) {
        if (e.message?.includes('Extension context invalidated')) {
          this.state = 'disconnected';
          this.reconnect();
        }
        return null;
      }
    }
  };

  async function hashStringWithSalt(input, salt) {
    const encoder = new TextEncoder();
    const data = encoder.encode(input + salt);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const result = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return result;
  }

  SectionRepeat.helpers = {
    async sendMessage(message, retries) {
      const State = SectionRepeat.State;
      const finalRetries = retries ?? State?.CONSTANTS?.TIMING?.RETRY?.DEFAULT_ATTEMPTS ?? 2;
      const timeout = State?.CONSTANTS?.TIMING?.TIMEOUT?.POPUP_MESSAGE || 5000;
      const delay = State?.CONSTANTS?.TIMING?.RETRY?.DEFAULT_DELAY_MS || 200;
      const backoff = State?.CONSTANTS?.TIMING?.RETRY?.DEFAULT_BACKOFF_MULTIPLIER || 1.5;
      for (let i = 0; i <= finalRetries; i++) {
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
          if (i === finalRetries) {
            SectionRepeat.logger.error('helpers.sendMessage', 'Message sending failed after retries.', {
              error: e.message,
              type: message.type
            });
            throw e;
          }
          await new Promise(res => setTimeout(res, delay * Math.pow(backoff, i)));
        }
      }
    },
    throttle(func, limit) {
      let inThrottle;
      let lastResult;
      return function() {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
          inThrottle = true;
          SectionRepeat.TimerManager.set(() => (inThrottle = false), limit);
          lastResult = func.apply(context, args);
        }
        return lastResult;
      };
    },
    async retryAsync(asyncFn, options = {}) {
      const State = SectionRepeat.State;
      const {
        maxRetries = State?.CONSTANTS?.TIMING?.RETRY?.DEFAULT_ATTEMPTS ?? 3,
          initialDelay = State?.CONSTANTS?.TIMING?.RETRY?.DEFAULT_DELAY_MS ?? 500,
          backoff = State?.CONSTANTS?.TIMING?.RETRY?.DEFAULT_BACKOFF_MULTIPLIER ?? 2,
          context = 'default',
          shouldRetry = (e) => true,
      } = options;
      for (let i = 0; i < maxRetries; i++) {
        try {
          return await asyncFn();
        } catch (e) {
          if (!shouldRetry(e) || i === maxRetries - 1) {
            throw e;
          }
          SectionRepeat.logger?.warning(`helpers.retryAsync.${context}`, `Attempt ${i + 1} failed. Retrying...`, {
            error: e.message
          });
          const delay = initialDelay * Math.pow(backoff, i);
          await new Promise(res => SectionRepeat.TimerManager.set(res, delay));
        }
      }
    },
    getDeviceMemoryBasedCacheSize() {
      const config = SectionRepeat.State?.CONSTANTS?.DOM_CACHE_CONFIG;
      if (!config) return 20;
      try {
        if (
          typeof navigator !== 'undefined' &&
          navigator &&
          'deviceMemory' in navigator &&
          typeof navigator.deviceMemory === 'number'
        ) {
          const memory = navigator.deviceMemory || 2;
          return Math.min(config.MAX_SIZE, Math.max(config.BASE_SIZE, Math.floor(memory * config.MULTIPLIER)));
        }
      } catch (e) {}
      return config.BASE_SIZE;
    },
    getCacheSize() {
      return this.getDeviceMemoryBasedCacheSize();
    },
    t(key, substitutions) {
      try {
        return chrome?.i18n?.getMessage(key, substitutions) ?? key;
      } catch (e) {
        SectionRepeat.logger?.warning('helpers.t', `Failed to get message for key: ${key}`, {
          error: e.message
        });
        return key;
      }
    },
    qSel(selectors, root = document) {
      if (root !== document && !root.isConnected) return null;
      const selectorList = Array.isArray(selectors) ? selectors : [selectors];
      const selectorKey = `${root === document ? 'doc' : 'el'}_${[...selectorList].sort().join('||')}`;
      const cached = SectionRepeat.State?.elementCache?.get(selectorKey);
      if (cached && cached.isConnected) return cached;
      for (const sel of selectorList) {
        try {
          const el = root.querySelector(sel);
          if (el) {
            SectionRepeat.State?.elementCache?.set(selectorKey, el);
            return el;
          }
        } catch (e) {
          SectionRepeat.logger?.warning('qSel.failure', `Selector failed: "${sel}"`, {
            error: e.message
          });
        }
      }
      return null;
    },
    shouldIgnoreKeyEvent(e) {
      const {
        target
      } = e;
      return (
        e.ctrlKey || e.metaKey || e.altKey ||
        /^(INPUT|TEXTAREA)$/i.test(target?.tagName) || target?.isContentEditable
      );
    },
    getVideoIdFromUrl(url) {
      if (!url) return null;
      try {
        const urlObj = new URL(url);
        let videoId;
        const PATTERNS = SectionRepeat.State?.CONSTANTS?.YOUTUBE_VIDEO_URL_PATTERNS;
        if (urlObj.hostname === 'youtu.be') {
          videoId = urlObj.pathname.substring(1, 12);
        } else if (PATTERNS && urlObj.pathname.startsWith(PATTERNS.SHORTS)) {
          videoId = urlObj.pathname.split(PATTERNS.SHORTS)[1]?.substring(0, 11);
        } else if (PATTERNS && urlObj.pathname.startsWith(PATTERNS.EMBED)) {
          videoId = urlObj.pathname.split(PATTERNS.EMBED)[1]?.substring(0, 11);
        } else {
          videoId = urlObj.searchParams.get('v');
        }
        return videoId?.length === 11 ? videoId : null;
      } catch (e) {
        return null;
      }
    },
    isVideoPage(url) {
      if (!url) return false;
      const State = SectionRepeat.State;
      const PATTERNS = State?.CONSTANTS?.YOUTUBE_VIDEO_URL_PATTERNS;
      if (!PATTERNS) return false;
      try {
        const urlPath = new URL(url).pathname;
        return urlPath.includes(PATTERNS.WATCH) ||
          urlPath.startsWith(PATTERNS.SHORTS) ||
          urlPath.startsWith(PATTERNS.EMBED);
      } catch (e) {
        return false;
      }
    },
    announceToScreenReader(message) {
      if (SectionRepeat.State.globalAriaAnnouncer) {
        SectionRepeat.State.globalAriaAnnouncer.textContent = message;
      }
    },
    async hashVideoId(videoId) {
      const {
        State
      } = SectionRepeat;
      if (!State.userSalt) {
        throw new SectionRepeat.CryptoError('User salt not available for hashing.');
      }
      return hashStringWithSalt(videoId, State.userSalt);
    }
  };
})();
