let CONST;
let isConstantsLoaded = false;
const getMinimalConsts = () => ({
  LOG_LEVELS: {
    ERROR: 3,
    CRITICAL: 4
  },
  IS_PRODUCTION: ('update_url' in chrome.runtime.getManifest()),
  MESSAGE_TYPES: {
    INIT_FAILED: 'INIT_FAILED'
  },
  STORAGE_KEYS: {
    CRITICAL_INIT_FAILURE: 'CRITICAL_INIT_FAILURE'
  }
});
try {
  importScripts('constants.js');
  CONST = self.CONST;
  isConstantsLoaded = true;
} catch (e) {
  CONST = getMinimalConsts();
  console.error('[Section Repeat] CRITICAL: Failed to load constants.js. The extension will be non-functional.', e);
  chrome.storage.local.set({
    [CONST.STORAGE_KEYS.CRITICAL_INIT_FAILURE]: true
  });
  if (chrome.action) {
    chrome.action.disable();
    const criticalErrorTitle = chrome.i18n.getMessage('critical_error_title') || 'Section Repeat: Critical error. Please try reinstalling.';
    chrome.action.setTitle({
      title: criticalErrorTitle
    });
  }
}
class ErrorLogger {
  constructor() {
    this.logs = [];
    this.maxLogs = CONST?.IS_PRODUCTION ? 20 : 100;
  }
  log(level, context, error, details = {}) {
    if (!isConstantsLoaded) return;
    if (CONST.IS_PRODUCTION && level < CONST.LOG_LEVELS.ERROR) return;
    if (level < CONST.CURRENT_LOG_LEVEL) return;
    if (chrome.runtime.lastError && !error) return;
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      context,
      error: error?.message || error
    };
    if (details && Object.keys(details).length > 0) logEntry.details = details;
    if (error?.stack) logEntry.stack = error.stack;
    this.logs.push(logEntry);
    if (this.logs.length > this.maxLogs) this.logs.shift();
    let formattedMessage = error?.message || error;
    if (typeof formattedMessage === 'object') formattedMessage = JSON.stringify(formattedMessage);
    const fullContext = `[Section Repeat][${context}]`;
    const hasDetails = details && Object.keys(details).length > 0;
    if (level >= CONST.LOG_LEVELS.ERROR) {
      hasDetails ? console.error(fullContext, formattedMessage, details) : console.error(fullContext, formattedMessage);
    } else if (level === CONST.LOG_LEVELS.WARNING) {
      hasDetails ? console.warn(fullContext, formattedMessage, details) : console.warn(fullContext, formattedMessage);
    } else if (level === CONST.LOG_LEVELS.INFO) {
      hasDetails ? console.info(fullContext, formattedMessage, details) : console.info(fullContext, formattedMessage);
    } else {
      hasDetails ? console.debug(fullContext, formattedMessage, details) : console.debug(fullContext, formattedMessage);
    }
  }
  debug(context, message, details) {
    this.log(CONST.LOG_LEVELS.DEBUG, context, message, details);
  }
  info(context, message, details) {
    this.log(CONST.LOG_LEVELS.INFO, context, message, details);
  }
  warning(context, message, details) {
    this.log(CONST.LOG_LEVELS.WARNING, context, message, details);
  }
  error(context, error, details) {
    this.log(CONST.LOG_LEVELS.ERROR, context, error, details);
  }
  critical(context, error, details) {
    this.log(CONST.LOG_LEVELS.CRITICAL, context, error, details);
  }
  exportLogs() {
    if (!isConstantsLoaded) return JSON.stringify({
      message: "Constants not loaded."
    });
    if (CONST.IS_PRODUCTION && this.logs.length === 0) return JSON.stringify({
      message: "No error logs available"
    });
    return JSON.stringify(this.logs, null, 2);
  }
}
const logger = new ErrorLogger();

function isVideoPage(url) {
  if (!url || !isConstantsLoaded) return false;
  const patterns = CONST.YOUTUBE_VIDEO_URL_PATTERNS;
  try {
    const urlPath = new URL(url).pathname;
    return urlPath.includes(patterns.WATCH) ||
      urlPath.startsWith(patterns.SHORTS) ||
      urlPath.startsWith(patterns.EMBED);
  } catch (e) {
    return false;
  }
}
const STATE_UPDATE_QUEUE_KEY = 'stateUpdateQueue';
const QUEUE_LOCK_KEY = CONST?.LOCK_KEYS?.STATE_QUEUE_PROCESS || 'state_queue_process_lock';
const LOCK_TIMEOUT_MS = CONST?.TIMING?.TIMEOUT?.QUEUE_LOCK || 15000;
async function getQueue() {
  const result = await chrome.storage.session.get(STATE_UPDATE_QUEUE_KEY);
  return result[STATE_UPDATE_QUEUE_KEY] || [];
}
async function setQueue(queue) {
  await chrome.storage.session.set({
    [STATE_UPDATE_QUEUE_KEY]: queue
  });
}
async function enqueueStateUpdate(task) {
  const queue = await getQueue();
  queue.push(task);
  await setQueue(queue);
  processStateUpdateQueue();
}
async function processStateUpdateQueue() {
  const {
    [QUEUE_LOCK_KEY]: currentLock
  } = await chrome.storage.session.get(QUEUE_LOCK_KEY);
  if (currentLock && (Date.now() - currentLock.timestamp < LOCK_TIMEOUT_MS)) {
    logger.debug('processStateUpdateQueue', 'Queue processing is already locked.');
    return;
  }
  const lockId = Date.now();
  await chrome.storage.session.set({
    [QUEUE_LOCK_KEY]: {
      timestamp: lockId
    }
  });
  let queue;
  try {
    queue = await getQueue();
    if (queue.length === 0) {
      await chrome.storage.session.remove(QUEUE_LOCK_KEY);
      return;
    }
    const task = queue.shift();
    await setQueue(queue);
    try {
      const currentTabStates = await getTabStates();
      const newTabStates = await runTask(task, currentTabStates);
      if (newTabStates) {
        await setTabStates(newTabStates);
      }
    } catch (taskError) {
      logger.error('processStateUpdateQueue', 'Task processing failed.', {
        task,
        error: taskError
      });
      const retryCount = (task.retries || 0) + 1;
      if (retryCount <= 3) {
        task.retries = retryCount;
        queue.unshift(task);
        await setQueue(queue);
        logger.warning('processStateUpdateQueue', `Task will be retried (attempt ${retryCount}).`);
      } else {
        logger.critical('processStateUpdateQueue', 'Task failed after max retries and was discarded.', {
          task
        });
        const criticalTasks = [
          CONST.INTERNAL_TASK_TYPES.REPEAT_STATE_CHANGED,
          CONST.INTERNAL_TASK_TYPES.STILL_REPEATING,
          CONST.INTERNAL_TASK_TYPES.NAVIGATED_AWAY
        ];
        if (criticalTasks.includes(task.type)) {
          try {
            const {
              tabId
            } = task.payload;
            const currentStates = await getTabStates();
            if (currentStates.has(tabId.toString())) {
              currentStates.delete(tabId.toString());
              await setTabStates(currentStates);
              logger.warning('processStateUpdateQueue', `Removed inconsistent state for tab ${tabId} after critical task failure.`);
            }
          } catch (cleanupError) {
            logger.error('processStateUpdateQueue', 'Failed to execute cleanup logic after task failure.', {
              task,
              cleanupError
            });
          }
        }
      }
    }
    if (queue.length > 0) {
      setTimeout(processStateUpdateQueue, 50);
    }
  } catch (error) {
    logger.critical('processStateUpdateQueue', 'Outer processing loop error', {
      error
    });
  } finally {
    const {
      [QUEUE_LOCK_KEY]: finalLock
    } = await chrome.storage.session.get(QUEUE_LOCK_KEY);
    if (finalLock && finalLock.timestamp === lockId) {
      await chrome.storage.session.remove(QUEUE_LOCK_KEY);
    }
  }
}
async function runTask(task, currentStates) {
  const {
    type,
    payload
  } = task;
  const newStates = new Map(currentStates);
  switch (type) {
    case CONST.INTERNAL_TASK_TYPES.CONTENT_SCRIPT_INIT_STARTED:
      {
        const {
          tabId
        } = payload;
        const state = newStates.get(tabId.toString()) || {};
        state.status = 'initializing';
        newStates.set(tabId.toString(), state);
        return newStates;
      }
    case CONST.INTERNAL_TASK_TYPES.CONTENT_SCRIPT_READY:
      {
        const {
          tabId
        } = payload;
        const state = newStates.get(tabId.toString()) || {};
        if (state.status === 'initializing') {
          delete state.status;
        }
        newStates.set(tabId.toString(), state);
        return newStates;
      }
    case CONST.INTERNAL_TASK_TYPES.REPEAT_STATE_CHANGED:
      {
        const {
          tabId,
          isRepeating,
          videoId
        } = payload;
        if (isRepeating) {
          newStates.set(tabId.toString(), {
            repeating: true,
            videoId,
            lastSeen: Date.now()
          });
          logger.debug('runTask', 'Tab repeat state SET', {
            tabId,
            videoId
          });
        } else {
          newStates.delete(tabId.toString());
          logger.debug('runTask', 'Tab repeat state REMOVED', {
            tabId
          });
        }
        return newStates;
      }
    case CONST.INTERNAL_TASK_TYPES.TAB_REMOVED:
      {
        const {
          tabId
        } = payload;
        if (newStates.has(tabId.toString())) {
          newStates.delete(tabId.toString());
          logger.debug('runTask', `State for removed tab ${tabId} deleted.`);
          return newStates;
        }
        return null;
      }
    case CONST.INTERNAL_TASK_TYPES.STILL_REPEATING:
      {
        const {
          tabId
        } = payload;
        if (newStates.has(tabId.toString())) {
          const currentState = newStates.get(tabId.toString());
          currentState.lastSeen = Date.now();
          newStates.set(tabId.toString(), currentState);
          return newStates;
        }
        chrome.tabs.sendMessage(tabId, {
            type: CONST.MESSAGE_TYPES.FORCE_STOP_REPEAT
          })
          .catch(e => logger.debug('runTask.still_repeating', `Tab ${tabId} not found for force stop.`));
        return null;
      }
    case CONST.INTERNAL_TASK_TYPES.NAVIGATED_AWAY:
      {
        const {
          tabId
        } = payload;
        if (newStates.has(tabId.toString())) {
          newStates.delete(tabId.toString());
          logger.info('runTask', `Cleared state for tab ${tabId} due to on-site navigation.`);
          return newStates;
        }
        return null;
      }
    case CONST.INTERNAL_TASK_TYPES.SET_FOCUS_MODE:
      {
        const {
          tabId,
          isFocus
        } = payload;
        const state = newStates.get(tabId.toString()) || {};
        state.isFocusMode = isFocus;
        newStates.set(tabId.toString(), state);
        return newStates;
      }
    case CONST.INTERNAL_TASK_TYPES.RECONCILE_TAB_STATES:
      {
        const tabIdPromises = Array.from(newStates.keys()).map(tabIdStr => {
          return chrome.tabs.get(parseInt(tabIdStr, 10))
            .then(tab => ({
              status: 'fulfilled',
              tabId: tabIdStr
            }))
            .catch(() => ({
              status: 'rejected',
              tabId: tabIdStr
            }));
        });
        const results = await Promise.all(tabIdPromises);
        let changed = false;
        for (const result of results) {
          if (result.status === 'rejected') {
            newStates.delete(result.tabId);
            changed = true;
            logger.info('runTask.reconcile', `Removed stale state for closed tab: ${result.tabId}`);
          }
        }
        return changed ? newStates : null;
      }
    case CONST.INTERNAL_TASK_TYPES.CLEAR_STATE_IF_NOT_VIDEO_PAGE:
      {
        const {
          tabId
        } = payload;
        const tabIdStr = tabId.toString();
        if (newStates.has(tabIdStr)) {
          newStates.delete(tabIdStr);
          logger.info('runTask.clear_state', `Grace period ended. Removed state for non-video tab: ${tabId}`);
          return newStates;
        }
        return null;
      }
  }
  return newStates;
}
async function getTabStates() {
  if (!isConstantsLoaded) return new Map();
  const {
    [CONST.STORAGE_KEYS.TAB_STATES]: tabStates = []
  } = await chrome.storage.session.get(CONST.STORAGE_KEYS.TAB_STATES);
  return new Map(tabStates);
}
async function setTabStates(newStates) {
  if (!isConstantsLoaded) return;
  await chrome.storage.session.set({
    [CONST.STORAGE_KEYS.TAB_STATES]: Array.from(newStates.entries())
  });
}
const lockManager = {
  async acquire(key, timeout) {
    if (!isConstantsLoaded) throw new Error("Constants not loaded, cannot acquire lock.");
    timeout = timeout || CONST.TIMING.TIMEOUT.LOCK;
    const lockKey = `${CONST.STORAGE_KEYS.LOCK_PREFIX}${key}`;
    const lockId = Date.now() + Math.random();
    const startTime = Date.now();
    const STALE_LOCK_THRESHOLD = timeout * CONST.TIMING.TIMEOUT.STALE_LOCK_MULTIPLIER;
    while (Date.now() - startTime < timeout) {
      const {
        [lockKey]: existingLock
      } = await chrome.storage.session.get(lockKey);
      const isStale = existingLock && (Date.now() - existingLock.acquiredAt > STALE_LOCK_THRESHOLD);
      if (!existingLock || isStale) {
        if (isStale) logger.warning('lockManager.acquire', 'Overriding stale lock', {
          key
        });
        try {
          await chrome.storage.session.set({
            [lockKey]: {
              acquiredAt: Date.now(),
              id: lockId
            }
          });
          const {
            [lockKey]: confirmedLock
          } = await chrome.storage.session.get(lockKey);
          if (confirmedLock?.id === lockId) return lockId;
        } catch (e) {}
      }
      const delay = CONST.TIMING.TIMEOUT.LOCK_RETRY_DELAY_MS;
      await new Promise(resolve => setTimeout(resolve, delay + Math.random() * delay));
    }
    logger.warning('lockManager.acquire', 'Lock acquisition timed out', {
      key
    });
    throw new Error(`Lock acquisition timed out for key: ${key}`);
  },
  async release(key, lockId) {
    if (!lockId || !isConstantsLoaded) return;
    const lockKey = `${CONST.STORAGE_KEYS.LOCK_PREFIX}${key}`;
    try {
      const {
        [lockKey]: existingLock
      } = await chrome.storage.session.get(lockKey);
      if (existingLock && existingLock.id === lockId) {
        await chrome.storage.session.remove(lockKey);
      }
    } catch (e) {
      logger.critical('lockManager.release.fail', `CRITICAL: Failed to release lock for key: ${key}. Scheduling retry.`, e);
      const RETRY_DATA_KEY = `retry-data:${key}`;
      await chrome.storage.session.set({
        [RETRY_DATA_KEY]: lockId
      });
      try {
        chrome.alarms.create(`retry-release-lock:${key}`, {
          delayInMinutes: CONST.TIMING.TIMEOUT.LOCK_RELEASE_RETRY_DELAY_MIN || 0.1
        });
      } catch (alarmError) {
        logger.critical('lockManager.release.alarm_fail', 'FATAL: Could not schedule lock release retry.', alarmError);
      }
    }
  },
};
async function reconcileStorageAndMetadata() {
  let lockId;
  try {
    lockId = await lockManager.acquire(CONST.LOCK_KEYS.METADATA_ACCESS);
    const allItems = await chrome.storage.local.get(null);
    const originalMetadata = allItems[CONST.STORAGE_KEYS.METADATA] || {};
    const newMetadata = { ...originalMetadata
    };
    const allDataKeys = Object.keys(allItems);
    const sectionKeys = new Set(allDataKeys.filter(k => k.startsWith(CONST.STORAGE_PREFIX) && k !== CONST.STORAGE_KEYS.METADATA));
    const metadataKeys = new Set(Object.keys(newMetadata));
    let metadataWasModified = false;
    const keysToRemove = [];
    for (const metaKey of metadataKeys) {
      if (!sectionKeys.has(metaKey)) {
        delete newMetadata[metaKey];
        metadataWasModified = true;
        logger.warning('reconcile', `Found stale metadata: ${metaKey}. Removing.`);
      }
    }
    for (const sectionKey of sectionKeys) {
      if (!metadataKeys.has(sectionKey)) {
        keysToRemove.push(sectionKey);
        logger.warning('reconcile', `Found orphaned data: ${sectionKey}. Scheduled for removal.`);
      }
    }
    if (keysToRemove.length > 0) {
      await chrome.storage.local.remove(keysToRemove);
    }
    if (metadataWasModified) {
      await chrome.storage.local.set({
        [CONST.STORAGE_KEYS.METADATA]: newMetadata
      });
    }
    if (keysToRemove.length > 0 || metadataWasModified) {
      logger.info('reconcile', 'Storage and metadata reconciliation complete.');
    } else {
      logger.debug('reconcile', 'Storage and metadata are in sync.');
    }
  } catch (e) {
    if (!e.message.includes('Lock acquisition timed out')) {
      logger.error('reconcile', e);
    }
  } finally {
    if (lockId) {
      await lockManager.release(CONST.LOCK_KEYS.METADATA_ACCESS, lockId);
    }
  }
}
async function purgeOldSections(userInitiated = false) {
  let lockId;
  try {
    lockId = await lockManager.acquire(CONST.LOCK_KEYS.STORAGE_PURGE);
    await new Promise(resolve => setTimeout(resolve, 100));
    const bytesInUse = await chrome.storage.local.getBytesInUse(null);
    const usagePercent = (bytesInUse / CONST.STORAGE.MAX_BYTES) * 100;
    const shouldPurge = userInitiated || usagePercent > CONST.STORAGE.WARNING_RATIO * 100;
    if (shouldPurge) {
      const targetRatio = userInitiated ? 0.5 : CONST.STORAGE.TARGET_RATIO;
      await purgeInBatches(targetRatio, userInitiated);
      await processPendingSaves();
      if (userInitiated) {
        await chrome.storage.local.remove([CONST.STORAGE_KEYS.PURGE_REQUIRED, CONST.STORAGE_KEYS.PURGE_USAGE_PERCENT]);
      } else if (usagePercent > CONST.STORAGE.CRITICAL_RATIO * 100) {
        await notifyStorageStateToTabs('critical', usagePercent);
      } else {
        await notifyStorageStateToTabs('warning', usagePercent);
      }
    } else {
      logger.debug('purgeOldSections', 'Storage usage is acceptable', {
        usagePercent: usagePercent.toFixed(1)
      });
    }
    return true;
  } catch (e) {
    if (e.message.includes('Lock acquisition timed out')) {
      logger.debug('purgeOldSections', 'Could not acquire purge lock, scheduling retry.');
      chrome.alarms.create(CONST.ALARM_NAMES.RETRY_PURGE, {
        delayInMinutes: CONST.TIMING.TIMEOUT.PURGE_RETRY_DELAY_MIN
      });
    } else {
      logger.error('purgeOldSections', e);
      chrome.alarms.create(CONST.ALARM_NAMES.RETRY_PURGE, {
        delayInMinutes: CONST.TIMING.TIMEOUT.PURGE_FAIL_RETRY_DELAY_MIN
      });
    }
    return false;
  } finally {
    if (lockId) {
      await lockManager.release(CONST.LOCK_KEYS.STORAGE_PURGE, lockId);
    }
  }
}
async function notifyStorageStateToTabs(level, usagePercent) {
  try {
    const tabs = await chrome.tabs.query({
      url: "*://*.youtube.com/*"
    });
    for (const tab of tabs) {
      chrome.tabs.sendMessage(tab.id, {
        type: CONST.MESSAGE_TYPES.STORAGE_WARNING,
        level: level,
        usage: Math.round(usagePercent),
      }).catch((error) => {
        if (!CONST.IS_PRODUCTION && error && !error.message.includes('Could not establish connection')) {
          logger.debug('notifyStorageStateToTabs.fail', `Failed to send message to tab ${tab.id}`, {
            error: error.message
          });
        }
      });
    }
  } catch (e) {
    logger.warning('notifyStorageStateToTabs', 'Failed to send notification', e);
  }
}
async function purgeInBatches(targetRatio = CONST.STORAGE.TARGET_RATIO, userInitiated = false) {
  const {
    [CONST.STORAGE_KEYS.METADATA]: metadata = {}
  } = await chrome.storage.local.get(CONST.STORAGE_KEYS.METADATA);
  let allKeys = Object.keys(metadata);
  if (allKeys.length === 0) {
    logger.info('purgeInBatches', 'No metadata found. No section data to purge.');
    return;
  }
  logger.info('purgeInBatches', 'Starting batch purge using metadata', {
    totalKeys: allKeys.length,
    targetRatio: (targetRatio * 100).toFixed(0) + '%',
  });
  const now = Date.now();
  const keysToRemove = new Set();
  const validKeys = [];
  allKeys.forEach(key => {
    const item = metadata[key];
    if (!item || !item.updatedAt || (now - item.updatedAt > CONST.SECTION_LIMITS.MAX_AGE_MS)) {
      keysToRemove.add(key);
    } else {
      validKeys.push({
        key,
        updatedAt: item.updatedAt
      });
    }
  });
  validKeys.sort((a, b) => a.updatedAt - b.updatedAt);
  if (validKeys.length > CONST.SECTION_LIMITS.MAX_KEYS) {
    const excessCount = validKeys.length - CONST.SECTION_LIMITS.MAX_KEYS;
    for (let i = 0; i < excessCount; i++) {
      keysToRemove.add(validKeys[i].key);
    }
  }
  const currentBytes = await chrome.storage.local.getBytesInUse(null);
  const targetBytes = CONST.STORAGE.MAX_BYTES * targetRatio;
  let bytesToFree = currentBytes - targetBytes;
  if (bytesToFree > 0) {
    const remainingKeys = validKeys.filter(item => !keysToRemove.has(item.key));
    const sizes = await chrome.storage.local.getBytesInUse(remainingKeys.map(k => k.key));
    for (const item of remainingKeys) {
      if (bytesToFree <= 0) break;
      const itemSize = sizes[item.key] || 0;
      keysToRemove.add(item.key);
      bytesToFree -= itemSize;
    }
  }
  const keysToRemoveArray = Array.from(keysToRemove);
  if (keysToRemoveArray.length > 0) {
    const originalMetadata = { ...metadata
    };
    keysToRemoveArray.forEach(key => delete metadata[key]);
    await chrome.storage.local.set({
      [CONST.STORAGE_KEYS.METADATA]: metadata
    });
    try {
      await chrome.storage.local.remove(keysToRemoveArray);
      const finalBytesInUse = await chrome.storage.local.getBytesInUse(null);
      logger.info('purgeInBatches', 'Purge completed', {
        removedCount: keysToRemoveArray.length,
        newUsage: ((finalBytesInUse / CONST.STORAGE.MAX_BYTES) * 100).toFixed(1) + '%'
      });
      const level = userInitiated ? 'info' : 'purge_success';
      notifyStorageStateToTabs(level, (finalBytesInUse / CONST.STORAGE.MAX_BYTES) * 100);
    } catch (e) {
      logger.error('purgeInBatches', 'Failed during key removal, reverting metadata.', e);
      await chrome.storage.local.set({
        [CONST.STORAGE_KEYS.METADATA]: originalMetadata
      });
    }
  } else {
    logger.info('purgeInBatches', 'No keys needed to be removed based on current policies.');
  }
}
async function processPendingSaves() {
  const allItems = await chrome.storage.local.get(null);
  const pendingKeys = Object.keys(allItems).filter(key => key.startsWith(CONST.STORAGE_KEYS.PENDING_OP_PREFIX));
  if (pendingKeys.length === 0) return;
  logger.info('processPendingSaves', `Found ${pendingKeys.length} pending save operations.`);
  for (const pKey of pendingKeys) {
    const {
      key,
      payload
    } = allItems[pKey];
    try {
      await chrome.storage.local.set({
        [key]: payload
      });
      await chrome.storage.local.remove(pKey);
      logger.info('processPendingSaves', 'Successfully processed and removed pending save.', {
        key
      });
    } catch (e) {
      if (e.message.includes('QUOTA_EXCEEDED')) {
        logger.warning('processPendingSaves', 'Storage still full, could not process pending save.', {
          key
        });
        chrome.alarms.create(CONST.ALARM_NAMES.RETRY_PURGE, {
          delayInMinutes: CONST.TIMING.TIMEOUT.PENDING_SAVE_FAIL_RETRY_MIN
        });
      } else {
        logger.error('processPendingSaves', 'Failed to process pending save.', {
          key,
          error: e.message
        });
      }
    }
  }
}

function bufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
async function _findAndValidateSalt() {
  const {
    [CONST.STORAGE_KEYS.USER_SALT]: userSalt
  } = await chrome.storage.sync.get(CONST.STORAGE_KEYS.USER_SALT);
  if (userSalt && typeof userSalt === 'string') {
    logger.info('setup', 'User salt found in sync storage.');
    await chrome.storage.local.set({
      [CONST.STORAGE_KEYS.SYNC_ENABLED]: true
    });
    return true;
  }
  return false;
}
async function _migrateLegacySalt() {
  const {
    [CONST.STORAGE_KEYS.USER_SALT]: localSalt
  } = await chrome.storage.local.get(CONST.STORAGE_KEYS.USER_SALT);
  if (localSalt) {
    logger.info('setup', 'Found legacy salt in local storage, migrating to sync.');
    const saltToSync = Array.isArray(localSalt) ? bufferToBase64(localSalt) : localSalt;
    await chrome.storage.sync.set({
      [CONST.STORAGE_KEYS.USER_SALT]: saltToSync,
      [CONST.STORAGE_KEYS.SALT_TYPE]: 'crypto_base64'
    });
    await chrome.storage.local.set({
      [CONST.STORAGE_KEYS.SYNC_ENABLED]: true
    });
    await chrome.storage.local.remove(CONST.STORAGE_KEYS.USER_SALT);
    logger.info('setup', 'Successfully migrated salt to sync storage.');
    return true;
  }
  return false;
}
async function _generateAndStoreNewSalt() {
  logger.info('setup', 'No salt found, generating a new user salt.');
  try {
    const saltArray = crypto.getRandomValues(new Uint8Array(16));
    const newSaltBase64 = bufferToBase64(saltArray);
    try {
      await chrome.storage.sync.set({
        [CONST.STORAGE_KEYS.USER_SALT]: newSaltBase64,
        [CONST.STORAGE_KEYS.SALT_TYPE]: 'crypto_base64'
      });
      await chrome.storage.local.set({
        [CONST.STORAGE_KEYS.SYNC_ENABLED]: true
      });
      logger.info('setup', 'New salt saved to sync storage.');
    } catch (syncError) {
      logger.warning('setup', 'Sync storage failed, falling back to local salt.', {
        error: syncError.message
      });
      await chrome.storage.local.set({
        [CONST.STORAGE_KEYS.USER_SALT]: newSaltBase64,
        [CONST.STORAGE_KEYS.SYNC_ENABLED]: false
      });
    }
  } catch (cryptoError) {
    logger.critical('setup.crypto.fail', 'Crypto API failed. Entering session-only mode.', {
      error: cryptoError.message
    });
    await chrome.storage.local.set({
      [CONST.STORAGE_KEYS.SYNC_ENABLED]: false,
      [CONST.STORAGE_KEYS.SETUP_FAILED]: true,
      [CONST.STORAGE_KEYS.SETUP_ERROR_MESSAGE]: cryptoError.message,
      [CONST.STORAGE_KEYS.SETUP_ERROR_TYPE]: CONST.ERROR_TYPES.CRYPTO_API_FAILED
    });
  }
}
async function setupOnInstall(retryCount = 0) {
  const MAX_RETRIES = CONST.TIMING.RETRY.INIT_MAX_ATTEMPTS;
  let lockId;
  try {
    lockId = await lockManager.acquire(CONST.LOCK_KEYS.SALT_SETUP, 10000);
    if (await _findAndValidateSalt()) {} else if (await _migrateLegacySalt()) {} else {
      await _generateAndStoreNewSalt();
    }
    const {
      [CONST.STORAGE_KEYS.SETUP_ERROR_TYPE]: errorType
    } = await chrome.storage.local.get(CONST.STORAGE_KEYS.SETUP_ERROR_TYPE);
    if (errorType !== CONST.ERROR_TYPES.CRYPTO_API_FAILED) {
      await chrome.storage.local.set({
        [CONST.STORAGE_KEYS.SETUP_FAILED]: false,
        [CONST.STORAGE_KEYS.SETUP_ERROR_MESSAGE]: null,
        [CONST.STORAGE_KEYS.SETUP_ERROR_TYPE]: null
      });
    }
  } catch (e) {
    if (e.message.includes('Lock acquisition timed out')) {
      logger.warning('setupOnInstall', 'Could not acquire lock, another setup is likely in progress.');
      return;
    }
    logger.error('onInstalled.setup', e, {
      attempt: retryCount + 1
    });
    if (retryCount >= MAX_RETRIES - 1) {
      logger.critical('onInstalled.setup', 'Setup failed after max retries.');
      const {
        [CONST.STORAGE_KEYS.SETUP_FAILED]: alreadyFailed
      } = await chrome.storage.local.get(CONST.STORAGE_KEYS.SETUP_FAILED);
      if (!alreadyFailed) {
        await chrome.storage.local.set({
          [CONST.STORAGE_KEYS.SETUP_FAILED]: true,
          [CONST.STORAGE_KEYS.SETUP_ERROR_MESSAGE]: e.message,
          [CONST.STORAGE_KEYS.SETUP_ERROR_TYPE]: CONST.ERROR_TYPES.SETUP_UNKNOWN
        });
      }
    } else {
      const delayInMinutes = Math.pow(2, retryCount) * CONST.TIMING.RETRY.SALT_SETUP_BACKOFF_MIN;
      chrome.alarms.create(`${CONST.ALARM_NAMES.RETRY_SALT_SETUP_PREFIX}${retryCount + 1}`, {
        delayInMinutes
      });
    }
  } finally {
    if (lockId) {
      await lockManager.release(CONST.LOCK_KEYS.SALT_SETUP, lockId);
    }
  }
}
let isSetupRunning = false;
chrome.runtime.onInstalled.addListener(async ({
  reason
}) => {
  if (!isConstantsLoaded) return;
  if (isSetupRunning) {
    logger.debug('onInstalled', 'Setup is already in progress.');
    return;
  }
  isSetupRunning = true;
  try {
    await cleanupStaleLocksOnStartup();
    await enqueueStateUpdate({
      type: CONST.INTERNAL_TASK_TYPES.RECONCILE_TAB_STATES
    });
    try {
      chrome.alarms.create(CONST.ALARM_NAMES.PURGE_OLD_SECTIONS, {
        periodInMinutes: CONST.TIMING.INTERVAL.PURGE_PERIOD_MIN
      });
      chrome.alarms.create(CONST.ALARM_NAMES.CLEANUP_MESSAGE_QUEUE, {
        periodInMinutes: CONST.TIMING.INTERVAL.CLEANUP_QUEUE_PERIOD_MIN
      });
      chrome.alarms.create(CONST.ALARM_NAMES.PROCESS_PENDING_SAVES, {
        periodInMinutes: CONST.TIMING.INTERVAL.PROCESS_SAVES_PERIOD_MIN
      });
      chrome.alarms.create(CONST.ALARM_NAMES.RECONCILE_STORAGE, {
        periodInMinutes: CONST.TIMING.INTERVAL.RECONCILE_STORAGE_PERIOD_DAY * 24 * 60
      });
    } catch (e) {
      logger.error('onInstalled.createAlarms', e);
    }
    await purgeOldSections();
    if (reason === 'install') {
      await setTabStates(new Map());
    }
    if (reason === 'install' || reason === 'update') {
      await setupOnInstall();
    }
    processStateUpdateQueue();
  } finally {
    isSetupRunning = false;
  }
});
async function cleanupStaleLocksOnStartup() {
  const allItems = await chrome.storage.session.get(null);
  const lockPrefix = isConstantsLoaded ? CONST.STORAGE_KEYS.LOCK_PREFIX : 'lock_';
  const lockKeys = Object.keys(allItems).filter(key => key.startsWith(lockPrefix));
  if (lockKeys.length > 0) {
    logger.info('cleanupStaleLocksOnStartup', `Found ${lockKeys.length} potential stale locks, removing...`);
    await chrome.storage.session.remove(lockKeys);
  }
}
async function attemptSyncMigration() {
  if (!isConstantsLoaded) return;
  try {
    const {
      [CONST.STORAGE_KEYS.SYNC_ENABLED]: is_sync_enabled,
      [CONST.STORAGE_KEYS.USER_SALT]: localSalt
    } = await chrome.storage.local.get([CONST.STORAGE_KEYS.SYNC_ENABLED, CONST.STORAGE_KEYS.USER_SALT]);
    if (is_sync_enabled === false && localSalt) {
      logger.info('attemptSyncMigration', 'is_sync_enabled is false, attempting to migrate salt to sync storage.');
      await chrome.storage.sync.set({
        sync_test: Date.now()
      });
      await chrome.storage.sync.remove('sync_test');
      const saltToSync = Array.isArray(localSalt) ? bufferToBase64(localSalt) : localSalt;
      await chrome.storage.sync.set({
        [CONST.STORAGE_KEYS.USER_SALT]: saltToSync,
        [CONST.STORAGE_KEYS.SALT_TYPE]: 'crypto_base64'
      });
      await chrome.storage.local.set({
        [CONST.STORAGE_KEYS.SYNC_ENABLED]: true
      });
      await chrome.storage.local.remove(CONST.STORAGE_KEYS.USER_SALT);
      logger.info('attemptSyncMigration', 'Successfully migrated local salt to sync storage.');
    }
  } catch (e) {
    logger.info('attemptSyncMigration', 'Sync storage still unavailable.', {
      error: e.message
    });
  }
}
chrome.runtime.onStartup.addListener(async () => {
  if (!isConstantsLoaded) return;
  await cleanupStaleLocksOnStartup();
  await attemptSyncMigration();
  await enqueueStateUpdate({
    type: CONST.INTERNAL_TASK_TYPES.RECONCILE_TAB_STATES
  });
  logger.info('onStartup', 'Extension started');
  await purgeOldSections().catch(e => logger.error('onStartup.purgeOldSections', e));
  await reconcileStorageAndMetadata().catch(e => logger.error('onStartup.reconcileStorage', e));
  processStateUpdateQueue();
});
async function clearTabStateAfterGracePeriod(tabId) {
  let stillNotVideoPage = true;
  try {
    const currentTab = await chrome.tabs.get(tabId);
    stillNotVideoPage = !currentTab.url || !isVideoPage(currentTab.url);
  } catch (e) {
    stillNotVideoPage = true;
  }
  if (stillNotVideoPage) {
    await enqueueStateUpdate({
      type: CONST.INTERNAL_TASK_TYPES.CLEAR_STATE_IF_NOT_VIDEO_PAGE,
      payload: {
        tabId
      }
    });
  }
}
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (!isConstantsLoaded) return;
  if (alarm.name.startsWith('heartbeat:')) {
    const tabId = parseInt(alarm.name.split(':')[1], 10);
    if (tabId) {
      try {
        await chrome.tabs.sendMessage(tabId, {
          type: CONST.MESSAGE_TYPES.ARE_YOU_STILL_REPEATING
        });
      } catch (e) {
        logger.info('onAlarm.heartbeat', `Tab ${tabId} not responding. Clearing repeat state.`);
        await handleTabRemoved(tabId);
      }
    }
    return;
  }
  if (alarm.name.startsWith(CONST.ALARM_NAMES.REPEAT_CHECK_PREFIX)) {
    const tabIdStr = alarm.name.substring(CONST.ALARM_NAMES.REPEAT_CHECK_PREFIX.length);
    const tabId = parseInt(tabIdStr.split(':')[0], 10);
    if (tabId) {
      chrome.tabs.sendMessage(tabId, {
          type: CONST.MESSAGE_TYPES.EXECUTE_REPEAT_CHECK
        })
        .catch(e => logger.debug('onAlarm.repeat_check', `Tab ${tabId} not found for repeat check.`));
    }
  }
  if (alarm.name === CONST.ALARM_NAMES.PURGE_OLD_SECTIONS) {
    await purgeOldSections();
  }
  if (alarm.name === CONST.ALARM_NAMES.PROCESS_PENDING_SAVES) {
    await processPendingSaves();
  }
  if (alarm.name.startsWith(CONST.ALARM_NAMES.CLEANUP_TAB_PREFIX)) {
    const tabId = parseInt(alarm.name.split(':')[1], 10);
    await clearTabStateAfterGracePeriod(tabId);
  }
});
const navigationUpdateTimers = new Map();
const debouncedUpdateTabStatus = (tabId) => {
  if (navigationUpdateTimers.has(tabId)) {
    clearTimeout(navigationUpdateTimers.get(tabId));
  }
  const timer = setTimeout(async () => {
    try {
      const currentTab = await chrome.tabs.get(tabId);
      if (currentTab && currentTab.url) {
        await updateTabStatus(tabId, currentTab.url);
      }
    } catch (e) {} finally {
      navigationUpdateTimers.delete(tabId);
    }
  }, 150);
  navigationUpdateTimers.set(tabId, timer);
};
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (!isConstantsLoaded || !tab.url) return;
  debouncedUpdateTabStatus(tabId);
});
chrome.tabs.onActivated.addListener((activeInfo) => {
  if (!isConstantsLoaded) return;
  debouncedUpdateTabStatus(activeInfo.tabId);
});
async function updateTabStatus(tabId, url) {
  if (!tabId || !isConstantsLoaded || !url) return;
  try {
    const isVidPage = isVideoPage(url);
    await chrome.storage.session.set({
      [`tab_status_${tabId}`]: isVidPage
    });
    const alarmName = `${CONST.ALARM_NAMES.CLEANUP_TAB_PREFIX}${tabId}`;
    if (isVidPage) {
      chrome.alarms.clear(alarmName);
    } else {
      const tabStates = await getTabStates();
      if (tabStates.has(tabId.toString())) {
        chrome.alarms.create(alarmName, {
          delayInMinutes: CONST.TIMING.TIMEOUT.TAB_CLEANUP_GRACE_PERIOD_MIN
        });
      }
    }
  } catch (e) {
    if (!e.message.toLowerCase().includes('no tab with id')) {
      logger.error('tabs.updateTabStatus', e, {
        tabId
      });
    }
  }
}
async function handleTabRemoved(tabId) {
  if (!isConstantsLoaded) return;
  chrome.alarms.clear(`${CONST.ALARM_NAMES.REPEAT_CHECK_PREFIX}${tabId}`);
  chrome.alarms.clear(`${CONST.ALARM_NAMES.CLEANUP_TAB_PREFIX}${tabId}`);
  await chrome.storage.session.remove(`tab_status_${tabId}`);
  await enqueueStateUpdate({
    type: CONST.INTERNAL_TASK_TYPES.TAB_REMOVED,
    payload: {
      tabId
    }
  });
}
async function handleTabReplaced(addedTabId, removedTabId) {
  await handleTabRemoved(removedTabId);
}
chrome.tabs.onRemoved.addListener(handleTabRemoved);
chrome.tabs.onReplaced.addListener(handleTabReplaced);
async function getUserSaltWithRetry(retries = 3) {
  if (!isConstantsLoaded) return null;
  try {
    for (let i = 0; i < retries; i++) {
      try {
        const result = await chrome.storage.sync.get(CONST.STORAGE_KEYS.USER_SALT);
        if (result.userSalt) {
          await chrome.storage.session.remove('SESSION_ONLY_MODE_ACTIVE');
          return result.userSalt;
        }
        await new Promise(res => setTimeout(res, 100 * (i + 1)));
      } catch (e) {
        logger.warning('getUserSaltWithRetry.sync.fail', e, {
          attempt: i + 1
        });
      }
    }
    const localResult = await chrome.storage.local.get(CONST.STORAGE_KEYS.USER_SALT);
    if (localResult.userSalt) {
      logger.info('getUserSaltWithRetry', 'Using fallback salt from local storage.');
      await chrome.storage.session.remove('SESSION_ONLY_MODE_ACTIVE');
      return localResult.userSalt;
    }
    throw new Error('Could not get user salt from sync or local storage.');
  } catch (e) {
    logger.critical('getUserSaltWithRetry', e.message);
    await chrome.storage.session.set({
      'SESSION_ONLY_MODE_ACTIVE': true
    });
    return null;
  }
}
const sendInitialPayload = async (tabId, retryCount = 0) => {
  const MAX_RETRIES = CONST.TIMING.RETRY.DEFAULT_ATTEMPTS;
  try {
    await chrome.tabs.get(tabId);
    const userSalt = await getUserSaltWithRetry();
    if (!userSalt) {
      logger.warning('sendInitialPayload', 'User salt not available, sending null salt for session-only mode.', {
        tabId
      });
    }
    await chrome.tabs.sendMessage(tabId, {
      type: CONST.MESSAGE_TYPES.INIT_PAYLOAD,
      payload: {
        salt: userSalt
      }
    });
    logger.debug('CONTENT_SCRIPT_READY', 'Initial payload sent successfully', {
      tabId
    });
    await enqueueStateUpdate({
      type: CONST.INTERNAL_TASK_TYPES.CONTENT_SCRIPT_READY,
      payload: {
        tabId
      }
    });
    return true;
  } catch (e) {
    logger.warning('CONTENT_SCRIPT_READY', `Failed to send initial payload (attempt ${retryCount + 1}).`, {
      tabId,
      error: e.message
    });
    if (retryCount < MAX_RETRIES) {
      const delayInMinutes = CONST.TIMING.RETRY.INITIAL_PAYLOAD_RETRY_DELAY_MIN * Math.pow(2, retryCount);
      chrome.alarms.create(`${CONST.ALARM_NAMES.RETRY_SEND_PAYLOAD_PREFIX}${tabId}:${retryCount + 1}`, {
        delayInMinutes
      });
    } else {
      logger.error('CONTENT_SCRIPT_READY', 'Failed after max retries', {
        tabId
      });
      chrome.tabs.sendMessage(tabId, {
        type: CONST.MESSAGE_TYPES.INIT_FAILED,
        payload: {
          reason: e.message
        }
      }).catch(err => logger.warning('sendInitialPayload.fail.notify', `Failed to send INIT_FAILED to tab ${tabId}: ${err.message}`));
    }
    return false;
  }
};

function handleRepeatStateChanged(message, sender) {
  const tabId = sender.tab?.id;
  if (!tabId) return;
  enqueueStateUpdate({
    type: CONST.INTERNAL_TASK_TYPES.REPEAT_STATE_CHANGED,
    payload: {
      tabId,
      isRepeating: !!message.payload,
      videoId: message.videoId,
    }
  });
}

function handleStillRepeating(message, sender) {
  const tabId = sender.tab?.id;
  if (!tabId) return;
  enqueueStateUpdate({
    type: CONST.INTERNAL_TASK_TYPES.STILL_REPEATING,
    payload: {
      tabId
    }
  });
}

function handleNavigatedAwayFromVideo(message, sender) {
  const tabId = sender.tab?.id;
  if (!tabId) return;
  enqueueStateUpdate({
    type: CONST.INTERNAL_TASK_TYPES.NAVIGATED_AWAY,
    payload: {
      tabId
    }
  });
}

function handleSetFocusMode(message, sender) {
  const tabId = sender.tab?.id;
  if (!tabId) return;
  enqueueStateUpdate({
    type: CONST.INTERNAL_TASK_TYPES.SET_FOCUS_MODE,
    payload: {
      tabId,
      isFocus: message.payload.isFocus,
    }
  });
}
async function handleGetTabState(message, sender) {
  if (!sender.tab?.id) throw new Error('no_tab_id');
  const currentTabStates = await getTabStates();
  const tabStatusKey = `tab_status_${sender.tab.id}`;
  const {
    [tabStatusKey]: isVideoPage
  } = await chrome.storage.session.get(tabStatusKey);
  return {
    state: currentTabStates.get(sender.tab.id.toString()) || null,
    isVideoPage: isVideoPage || false
  };
}
async function handleContentScriptReady(message, sender) {
  if (!sender.tab?.id) throw new Error('no_tab_id');
  const tabId = sender.tab.id;
  const allAlarms = await chrome.alarms.getAll();
  for (const alarm of allAlarms) {
    if (alarm.name.startsWith(`${CONST.ALARM_NAMES.RETRY_SEND_PAYLOAD_PREFIX}${tabId}:`)) {
      await chrome.alarms.clear(alarm.name);
    }
  }
  logger.debug('CONTENT_SCRIPT_READY', 'Content script initialized, sending initial payload...', {
    tabId
  });
  await sendInitialPayload(tabId);
  enqueueStateUpdate({
    type: CONST.INTERNAL_TASK_TYPES.CONTENT_SCRIPT_INIT_STARTED,
    payload: {
      tabId
    }
  });
  return {};
}
async function handleReattemptSetup() {
  logger.info('REATTEMPT_SETUP', 'User requested setup re-initialization.');
  await setupOnInstall();
  return {};
}
async function handleForcePurge() {
  logger.warning('FORCE_PURGE', 'Force purge requested by user.');
  const purgeResult = await purgeOldSections(true);
  if (!purgeResult) {
    throw new Error('purge_failed_in_background');
  }
  return {
    purged: true
  };
}
async function handleTriggerImmediatePurge() {
  logger.info('TRIGGER_IMMEDIATE_PURGE', 'Immediate purge requested from content script due to storage pressure.');
  await purgeOldSections(false);
  return {};
}
async function handleLogError(message) {
  logger.error(message.payload.context, message.payload.error);
  return {};
}
async function handleGetStorageInfo() {
  const bytesInUse = await chrome.storage.local.getBytesInUse(null);
  const {
    [CONST.STORAGE_KEYS.SETUP_FAILED]: setup_failed,
    [CONST.STORAGE_KEYS.SETUP_ERROR_MESSAGE]: setup_error_message,
    [CONST.STORAGE_KEYS.SETUP_ERROR_TYPE]: setup_error_type,
    [CONST.STORAGE_KEYS.CRITICAL_INIT_FAILURE]: critical_failure
  } = await chrome.storage.local.get([
    CONST.STORAGE_KEYS.SETUP_FAILED,
    CONST.STORAGE_KEYS.SETUP_ERROR_MESSAGE,
    CONST.STORAGE_KEYS.SETUP_ERROR_TYPE,
    CONST.STORAGE_KEYS.CRITICAL_INIT_FAILURE
  ]);
  return {
    used: bytesInUse,
    max: CONST.STORAGE.MAX_BYTES,
    percent: Math.round((bytesInUse / CONST.STORAGE.MAX_BYTES) * 100),
    setup_failed: !!setup_failed,
    setup_error_message: setup_error_message || null,
    setup_error_type: setup_error_type || null,
    critical_failure: !!critical_failure
  };
}
async function handleGetUserSalt() {
  const userSalt = await getUserSaltWithRetry();
  return {
    salt: userSalt
  };
}
async function handleUpdateMetadata({
  payload
}) {
  const {
    hashedId,
    sectionCount
  } = payload;
  let lockId;
  try {
    lockId = await lockManager.acquire(CONST.LOCK_KEYS.METADATA_ACCESS);
    const storageKey = `${CONST.STORAGE_PREFIX}${hashedId}`;
    const {
      [CONST.STORAGE_KEYS.METADATA]: metadata = {}
    } = await chrome.storage.local.get(CONST.STORAGE_KEYS.METADATA);
    if (sectionCount > 0) {
      metadata[storageKey] = {
        updatedAt: Date.now(),
        sectionCount
      };
    } else {
      delete metadata[storageKey];
    }
    await chrome.storage.local.set({
      [CONST.STORAGE_KEYS.METADATA]: metadata
    });
  } catch (e) {
    logger.error('handleUpdateMetadata', 'Failed to update metadata', e);
  } finally {
    if (lockId) {
      await lockManager.release(CONST.LOCK_KEYS.METADATA_ACCESS, lockId);
    }
  }
  return {};
}
const messageHandlers = {
  [CONST?.MESSAGE_TYPES?.UPDATE_METADATA]: (msg) => {
    handleUpdateMetadata(msg);
    return {};
  },
  [CONST?.MESSAGE_TYPES?.CONTENT_SCRIPT_READY]: handleContentScriptReady,
  [CONST?.MESSAGE_TYPES?.REATTEMPT_SETUP]: handleReattemptSetup,
  [CONST?.MESSAGE_TYPES?.GET_TAB_STATE]: handleGetTabState,
  [CONST?.MESSAGE_TYPES?.FORCE_PURGE]: handleForcePurge,
  [CONST?.MESSAGE_TYPES?.LOG_ERROR]: handleLogError,
  [CONST?.MESSAGE_TYPES?.TRIGGER_IMMEDIATE_PURGE]: handleTriggerImmediatePurge,
  [CONST?.MESSAGE_TYPES?.GET_STORAGE_INFO]: handleGetStorageInfo,
  [CONST?.MESSAGE_TYPES?.GET_USER_SALT]: handleGetUserSalt,
  [CONST?.MESSAGE_TYPES?.GET_CONSTANTS]: () => ({
    constants: CONST
  }),
  [CONST?.MESSAGE_TYPES?.ACQUIRE_LOCK]: (msg) => lockManager.acquire(msg.payload.key, msg.payload.timeout).then(lockId => ({
    lockId
  })),
  [CONST?.MESSAGE_TYPES?.RELEASE_LOCK]: (msg) => lockManager.release(msg.payload.key, msg.payload.id).then(() => ({})),
  [CONST?.MESSAGE_TYPES?.SCHEDULE_REPEAT_CHECK]: (msg, sender) => {
    const tabId = sender.tab?.id;
    if (tabId) {
      chrome.alarms.create(`${CONST.ALARM_NAMES.REPEAT_CHECK_PREFIX}${tabId}`, {
        when: Date.now() + msg.payload.delay
      });
    }
    return {};
  },
  [CONST?.MESSAGE_TYPES?.CANCEL_REPEAT_CHECK]: (msg, sender) => {
    const tabId = sender.tab?.id;
    if (tabId) {
      chrome.alarms.clear(`${CONST.ALARM_NAMES.REPEAT_CHECK_PREFIX}${tabId}`);
    }
    return {};
  },
  [CONST?.MESSAGE_TYPES?.REPEAT_STATE_CHANGED]: (msg, sender) => {
    handleRepeatStateChanged(msg, sender);
    return {};
  },
  [CONST?.MESSAGE_TYPES?.STILL_REPEATING]: (msg, sender) => {
    handleStillRepeating(msg, sender);
    return {};
  },
  [CONST?.MESSAGE_TYPES?.NAVIGATED_AWAY_FROM_VIDEO]: (msg, sender) => {
    handleNavigatedAwayFromVideo(msg, sender);
    return {};
  },
  [CONST?.MESSAGE_TYPES?.SET_FOCUS_MODE]: (msg, sender) => {
    handleSetFocusMode(msg, sender);
    return {
      success: true
    };
  },
  [CONST?.MESSAGE_TYPES?.START_HEARTBEAT_ALARM]: (msg, sender) => {
    if (sender.tab?.id) {
      chrome.alarms.create(`heartbeat:${sender.tab.id}`, {
        periodInMinutes: 0.5
      });
    }
    return {};
  },
  [CONST?.MESSAGE_TYPES?.STOP_HEARTBEAT_ALARM]: (msg, sender) => {
    if (sender.tab?.id) {
      chrome.alarms.clear(`heartbeat:${sender.tab.id}`);
    }
    return {};
  },
};
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!isConstantsLoaded) {
    logger.critical('onMessage', new Error('Received a message but constants are not loaded. Aborting.'), {
      messageType: message.type
    });
    sendResponse({
      success: false,
      error: 'critical_initialization_failure'
    });
    return true;
  }
  (async () => {
    if (sender.tab && sender.tab.id) {
      try {
        await chrome.tabs.get(sender.tab.id);
      } catch (e) {
        await enqueueStateUpdate({
          type: CONST.INTERNAL_TASK_TYPES.RECONCILE_TAB_STATES
        });
        sendResponse({
          success: false,
          reason: 'tab_closed'
        });
        return;
      }
    }
    const handler = messageHandlers[message.type];
    if (handler) {
      try {
        const responseData = await handler(message, sender);
        sendResponse({
          success: true,
          ...responseData
        });
      } catch (error) {
        logger.error('onMessage', error, {
          messageType: message.type
        });
        sendResponse({
          success: false,
          error: error.message
        });
      }
    } else {
      logger.warning('onMessage', 'Unknown message type received.', {
        type: message.type
      });
      sendResponse({
        success: false,
        reason: 'unknown_message_type'
      });
    }
  })();
  return true;
});
processStateUpdateQueue();
