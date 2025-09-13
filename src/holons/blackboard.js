import winston from 'winston';
import { BaseHolon } from './base-holon.js';
import { getSystemConfig } from '../config/system-config.js';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console()
  ]
});

export class Blackboard extends BaseHolon {
  constructor(orchestration) {
    super('Blackboard', orchestration);
    this.config = getSystemConfig();
    
    // Initialize namespaces based on configuration
    this.namespaces = new Map();
    this.config.state.ns.forEach(ns => {
      this.namespaces.set(ns, new Map());
    });
    
    // TTL management
    this.ttlTimers = new Map();
    this.ttlConfig = this.parseTTLConfig();
    
    // Consistency models
    this.strongConsistency = new Set(this.config.state.consistency.strong);
    this.eventualConsistency = new Set(this.config.state.consistency.eventual);
    
    // Metrics
    this.metrics = {
      reads: 0,
      writes: 0,
      deletes: 0,
      ttlExpiries: 0,
      invalidations: 0,
      namespaceStats: {}
    };
    
    // Initialize namespace stats
    this.config.state.ns.forEach(ns => {
      this.metrics.namespaceStats[ns] = {
        reads: 0,
        writes: 0,
        size: 0
      };
    });
  }

  async initialize() {
    await super.initialize();
    
    // Subscribe to state-related events
    this.subscribe('state-read', this.handleStateRead.bind(this));
    this.subscribe('state-write', this.handleStateWrite.bind(this));
    this.subscribe('state-delete', this.handleStateDelete.bind(this));
    this.subscribe('state-invalidate', this.handleStateInvalidate.bind(this));
    this.subscribe('workflow-complete', this.handleWorkflowComplete.bind(this));
    
    // Start TTL cleanup process
    this.startTTLCleanup();
    
    logger.info('Blackboard holon initialized with namespaces:', Array.from(this.namespaces.keys()));
  }

  parseTTLConfig() {
    const ttlConfig = {};
    
    for (const [key, value] of Object.entries(this.config.state.ttl)) {
      ttlConfig[key] = this.parseTTLValue(value);
    }
    
    return ttlConfig;
  }

  parseTTLValue(ttlString) {
    const match = ttlString.match(/(\d+)(m|h|d)/);
    if (!match) return 300000; // Default 5 minutes
    
    const [, amount, unit] = match;
    const multipliers = { m: 60000, h: 3600000, d: 86400000 };
    
    return parseInt(amount) * multipliers[unit];
  }

  async read(namespace, key, options = {}) {
    if (!this.namespaces.has(namespace)) {
      throw new Error(`Unknown namespace: ${namespace}`);
    }

    const nsData = this.namespaces.get(namespace);
    const value = nsData.get(key);
    
    this.metrics.reads++;
    this.metrics.namespaceStats[namespace].reads++;
    
    if (!value) {
      return null;
    }

    // Check TTL
    if (value.expiresAt && Date.now() > value.expiresAt) {
      await this.delete(namespace, key);
      return null;
    }

    // Update access time for LRU
    value.lastAccessed = Date.now();
    
    logger.debug(`Read from blackboard: ${namespace}:${key}`);
    
    return options.includeMetadata ? value : value.data;
  }

  async write(namespace, key, data, options = {}) {
    if (!this.namespaces.has(namespace)) {
      throw new Error(`Unknown namespace: ${namespace}`);
    }

    const nsData = this.namespaces.get(namespace);
    const now = Date.now();
    
    // Determine TTL
    let expiresAt = null;
    if (options.ttl) {
      expiresAt = now + options.ttl;
    } else {
      // Use configured TTL based on namespace or key pattern
      const ttl = this.determineTTL(namespace, key);
      if (ttl) {
        expiresAt = now + ttl;
      }
    }

    const value = {
      data,
      createdAt: now,
      lastAccessed: now,
      lastModified: now,
      expiresAt,
      version: options.version || 1,
      etag: this.generateETag(data),
      consistency: this.strongConsistency.has(namespace) ? 'strong' : 'eventual'
    };

    // Handle strong consistency
    if (this.strongConsistency.has(namespace)) {
      await this.enforceStrongConsistency(namespace, key, value);
    }

    nsData.set(key, value);
    
    // Set TTL timer if needed
    if (expiresAt) {
      this.setTTLTimer(namespace, key, expiresAt);
    }
    
    this.metrics.writes++;
    this.metrics.namespaceStats[namespace].writes++;
    this.metrics.namespaceStats[namespace].size = nsData.size;
    
    logger.debug(`Write to blackboard: ${namespace}:${key}`, {
      ttl: expiresAt ? expiresAt - now : null,
      consistency: value.consistency
    });
    
    // Emit state change event
    await this.publish('state-changed', {
      namespace,
      key,
      operation: 'write',
      etag: value.etag
    });
    
    return value.etag;
  }

  async delete(namespace, key) {
    if (!this.namespaces.has(namespace)) {
      throw new Error(`Unknown namespace: ${namespace}`);
    }

    const nsData = this.namespaces.get(namespace);
    const existed = nsData.delete(key);
    
    if (existed) {
      // Clear TTL timer
      const timerKey = `${namespace}:${key}`;
      if (this.ttlTimers.has(timerKey)) {
        clearTimeout(this.ttlTimers.get(timerKey));
        this.ttlTimers.delete(timerKey);
      }
      
      this.metrics.deletes++;
      this.metrics.namespaceStats[namespace].size = nsData.size;
      
      logger.debug(`Deleted from blackboard: ${namespace}:${key}`);
      
      // Emit state change event
      await this.publish('state-changed', {
        namespace,
        key,
        operation: 'delete'
      });
    }
    
    return existed;
  }

  async invalidate(namespace, pattern) {
    if (!this.namespaces.has(namespace)) {
      throw new Error(`Unknown namespace: ${namespace}`);
    }

    const nsData = this.namespaces.get(namespace);
    const keysToDelete = [];
    
    // Find keys matching pattern
    for (const key of nsData.keys()) {
      if (this.matchesPattern(key, pattern)) {
        keysToDelete.push(key);
      }
    }
    
    // Delete matching keys
    for (const key of keysToDelete) {
      await this.delete(namespace, key);
    }
    
    this.metrics.invalidations++;
    
    logger.info(`Invalidated ${keysToDelete.length} keys in ${namespace} matching pattern: ${pattern}`);
    
    return keysToDelete.length;
  }

  matchesPattern(key, pattern) {
    // Simple pattern matching - in production, use proper regex or glob
    if (pattern.includes('*')) {
      const regexPattern = pattern.replace(/\*/g, '.*');
      return new RegExp(regexPattern).test(key);
    }
    return key === pattern;
  }

  determineTTL(namespace, key) {
    // Check specific key patterns first
    for (const [pattern, ttl] of Object.entries(this.ttlConfig)) {
      if (key.includes(pattern) || namespace === pattern) {
        return ttl;
      }
    }
    
    // Default TTL based on namespace
    const defaultTTLs = {
      'candidates': 300000, // 5 minutes
      'selections': 1800000, // 30 minutes
      'media': 86400000, // 24 hours
      'cache': 3600000 // 1 hour
    };
    
    return defaultTTLs[namespace] || null;
  }

  setTTLTimer(namespace, key, expiresAt) {
    const timerKey = `${namespace}:${key}`;
    const delay = expiresAt - Date.now();
    
    if (delay > 0) {
      const timer = setTimeout(async () => {
        await this.delete(namespace, key);
        this.metrics.ttlExpiries++;
        logger.debug(`TTL expired for ${namespace}:${key}`);
      }, delay);
      
      this.ttlTimers.set(timerKey, timer);
    }
  }

  generateETag(data) {
    // Simple ETag generation - in production, use proper hashing
    const dataString = JSON.stringify(data);
    return Buffer.from(dataString).toString('base64').slice(0, 16);
  }

  async enforceStrongConsistency(namespace, key, value) {
    // For strong consistency, we ensure immediate propagation
    // In a distributed system, this would involve consensus protocols
    
    // For now, just emit immediate consistency event
    await this.publish('strong-consistency-write', {
      namespace,
      key,
      etag: value.etag,
      timestamp: value.lastModified
    });
  }

  startTTLCleanup() {
    // Periodic cleanup of expired entries
    setInterval(() => {
      this.performTTLCleanup();
    }, 60000); // Every minute
  }

  performTTLCleanup() {
    const now = Date.now();
    let cleanedCount = 0;
    
    for (const [namespace, nsData] of this.namespaces) {
      const keysToDelete = [];
      
      for (const [key, value] of nsData) {
        if (value.expiresAt && now > value.expiresAt) {
          keysToDelete.push(key);
        }
      }
      
      for (const key of keysToDelete) {
        nsData.delete(key);
        const timerKey = `${namespace}:${key}`;
        if (this.ttlTimers.has(timerKey)) {
          clearTimeout(this.ttlTimers.get(timerKey));
          this.ttlTimers.delete(timerKey);
        }
        cleanedCount++;
      }
      
      this.metrics.namespaceStats[namespace].size = nsData.size;
    }
    
    if (cleanedCount > 0) {
      this.metrics.ttlExpiries += cleanedCount;
      logger.debug(`TTL cleanup removed ${cleanedCount} expired entries`);
    }
  }

  // Event handlers
  async handleStateRead(event) {
    const { namespace, key, sagaId } = event.data;
    const value = await this.read(namespace, key);
    
    await this.publish('state-read-response', {
      sagaId,
      namespace,
      key,
      value,
      found: value !== null
    });
  }

  async handleStateWrite(event) {
    const { namespace, key, data, options, sagaId } = event.data;
    const etag = await this.write(namespace, key, data, options);
    
    await this.publish('state-write-response', {
      sagaId,
      namespace,
      key,
      etag,
      success: true
    });
  }

  async handleStateDelete(event) {
    const { namespace, key, sagaId } = event.data;
    const deleted = await this.delete(namespace, key);
    
    await this.publish('state-delete-response', {
      sagaId,
      namespace,
      key,
      deleted,
      success: true
    });
  }

  async handleStateInvalidate(event) {
    const { namespace, pattern, reason } = event.data;
    
    // Check invalidation rules from config
    const shouldInvalidate = this.shouldInvalidate(namespace, pattern, reason);
    
    if (shouldInvalidate) {
      const count = await this.invalidate(namespace, pattern);
      logger.info(`Invalidated ${count} entries due to: ${reason}`);
    }
  }

  shouldInvalidate(namespace, pattern, reason) {
    const invalidationRules = this.config.state.invalidate;
    
    // Check specific invalidation rules
    for (const [rule, condition] of Object.entries(invalidationRules)) {
      if (reason.includes(rule)) {
        return this.evaluateInvalidationCondition(condition, reason);
      }
    }
    
    return false;
  }

  evaluateInvalidationCondition(condition, reason) {
    // Simple condition evaluation - in production, use proper rule engine
    if (condition.includes('price drift')) {
      const match = reason.match(/price drift>(\d+)%/);
      if (match) {
        const driftPercent = parseInt(match[1]);
        const threshold = parseInt(condition.match(/>(\d+)%/)[1]);
        return driftPercent > threshold;
      }
    }
    
    return true; // Default to invalidate
  }

  async handleWorkflowComplete(event) {
    const { sagaId } = event.data;
    
    // Clean up workflow-specific data
    await this.invalidate('user_input', `*${sagaId}*`);
    await this.invalidate('candidates', `*${sagaId}*`);
    
    logger.debug(`Cleaned up workflow data for saga: ${sagaId}`);
  }

  // Query and utility methods
  async query(namespace, filter = {}) {
    if (!this.namespaces.has(namespace)) {
      throw new Error(`Unknown namespace: ${namespace}`);
    }

    const nsData = this.namespaces.get(namespace);
    const results = [];
    
    for (const [key, value] of nsData) {
      // Check TTL
      if (value.expiresAt && Date.now() > value.expiresAt) {
        continue;
      }
      
      // Apply filters
      if (this.matchesFilter(key, value, filter)) {
        results.push({
          key,
          data: value.data,
          metadata: {
            createdAt: value.createdAt,
            lastModified: value.lastModified,
            etag: value.etag
          }
        });
      }
    }
    
    return results;
  }

  matchesFilter(key, value, filter) {
    if (filter.keyPattern && !this.matchesPattern(key, filter.keyPattern)) {
      return false;
    }
    
    if (filter.createdAfter && value.createdAt < filter.createdAfter) {
      return false;
    }
    
    if (filter.createdBefore && value.createdAt > filter.createdBefore) {
      return false;
    }
    
    return true;
  }

  getNamespaceStats(namespace) {
    if (!this.namespaces.has(namespace)) {
      throw new Error(`Unknown namespace: ${namespace}`);
    }

    const nsData = this.namespaces.get(namespace);
    const stats = {
      size: nsData.size,
      ...this.metrics.namespaceStats[namespace]
    };
    
    // Calculate memory usage estimate
    let memoryUsage = 0;
    for (const value of nsData.values()) {
      memoryUsage += JSON.stringify(value).length;
    }
    stats.memoryUsage = memoryUsage;
    
    return stats;
  }

  getMetrics() {
    return {
      ...this.metrics,
      totalEntries: Array.from(this.namespaces.values())
        .reduce((sum, nsData) => sum + nsData.size, 0),
      activeTTLTimers: this.ttlTimers.size,
      namespaces: Array.from(this.namespaces.keys())
    };
  }

  async shutdown() {
    logger.info('Shutting down Blackboard holon');
    
    // Clear all TTL timers
    for (const timer of this.ttlTimers.values()) {
      clearTimeout(timer);
    }
    this.ttlTimers.clear();
    
    // Clear all data
    for (const nsData of this.namespaces.values()) {
      nsData.clear();
    }
    
    await super.shutdown();
  }
}