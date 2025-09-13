import winston from 'winston';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { getConfig } from '../config/system-config.js';

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

export class StateManager extends EventEmitter {
  constructor(eventBus) {
    super();
    this.eventBus = eventBus;
    this.config = getConfig();
    
    // State storage with namespaces
    this.namespaces = new Map();
    
    // Consistency models
    this.consistencyModels = {
      'strong': {
        name: 'Strong Consistency',
        description: 'All reads receive the most recent write',
        replicationFactor: 3,
        writeQuorum: 2,
        readQuorum: 2,
        maxStaleness: 0
      },
      'eventual': {
        name: 'Eventual Consistency',
        description: 'System will become consistent over time',
        replicationFactor: 3,
        writeQuorum: 1,
        readQuorum: 1,
        maxStaleness: 30000 // 30 seconds
      },
      'weak': {
        name: 'Weak Consistency',
        description: 'No guarantees about when data will be consistent',
        replicationFactor: 1,
        writeQuorum: 1,
        readQuorum: 1,
        maxStaleness: 300000 // 5 minutes
      },
      'session': {
        name: 'Session Consistency',
        description: 'Consistency within a session',
        replicationFactor: 2,
        writeQuorum: 1,
        readQuorum: 1,
        maxStaleness: 60000 // 1 minute
      }
    };
    
    // Default namespace configurations
    this.defaultNamespaceConfig = {
      consistency: 'eventual',
      ttl: 60 * 60 * 1000, // 1 hour
      maxSize: 10000,
      compression: false,
      encryption: false,
      replication: true,
      persistence: false,
      indexing: true,
      versioning: false,
      conflictResolution: 'last-write-wins'
    };
    
    // Predefined namespace configurations
    this.namespaceConfigs = {
      'user-sessions': {
        consistency: 'session',
        ttl: 60 * 60 * 1000, // 1 hour
        maxSize: 50000,
        compression: false,
        encryption: true,
        replication: true,
        persistence: true,
        indexing: true,
        versioning: false,
        conflictResolution: 'last-write-wins'
      },
      'search-cache': {
        consistency: 'weak',
        ttl: 15 * 60 * 1000, // 15 minutes
        maxSize: 100000,
        compression: true,
        encryption: false,
        replication: false,
        persistence: false,
        indexing: true,
        versioning: false,
        conflictResolution: 'last-write-wins'
      },
      'booking-data': {
        consistency: 'strong',
        ttl: 24 * 60 * 60 * 1000, // 24 hours
        maxSize: 10000,
        compression: false,
        encryption: true,
        replication: true,
        persistence: true,
        indexing: true,
        versioning: true,
        conflictResolution: 'manual'
      },
      'candidate-results': {
        consistency: 'eventual',
        ttl: 30 * 60 * 1000, // 30 minutes
        maxSize: 200000,
        compression: true,
        encryption: false,
        replication: true,
        persistence: false,
        indexing: true,
        versioning: false,
        conflictResolution: 'merge'
      },
      'user-preferences': {
        consistency: 'session',
        ttl: 7 * 24 * 60 * 60 * 1000, // 7 days
        maxSize: 25000,
        compression: false,
        encryption: true,
        replication: true,
        persistence: true,
        indexing: true,
        versioning: true,
        conflictResolution: 'merge'
      },
      'system-config': {
        consistency: 'strong',
        ttl: null, // No expiration
        maxSize: 1000,
        compression: false,
        encryption: true,
        replication: true,
        persistence: true,
        indexing: false,
        versioning: true,
        conflictResolution: 'manual'
      },
      'analytics-data': {
        consistency: 'weak',
        ttl: 30 * 24 * 60 * 60 * 1000, // 30 days
        maxSize: 1000000,
        compression: true,
        encryption: false,
        replication: false,
        persistence: true,
        indexing: true,
        versioning: false,
        conflictResolution: 'append'
      },
      'temporary-data': {
        consistency: 'weak',
        ttl: 5 * 60 * 1000, // 5 minutes
        maxSize: 50000,
        compression: false,
        encryption: false,
        replication: false,
        persistence: false,
        indexing: false,
        versioning: false,
        conflictResolution: 'last-write-wins'
      }
    };
    
    // State operations tracking
    this.operations = {
      reads: 0,
      writes: 0,
      deletes: 0,
      evictions: 0,
      expirations: 0,
      conflicts: 0,
      replications: 0
    };
    
    // Performance metrics
    this.metrics = {
      totalKeys: 0,
      totalSize: 0,
      hitRate: 0,
      missRate: 0,
      avgReadTime: 0,
      avgWriteTime: 0,
      memoryUsage: 0,
      networkUsage: 0
    };
    
    // Replication and clustering
    this.replicationNodes = new Map();
    this.clusterNodes = new Set();
    this.nodeId = uuidv4();
    this.isLeader = false;
    
    // Transaction support
    this.transactions = new Map();
    this.locks = new Map();
    
    // Event subscriptions
    this.subscriptions = new Map();
    
    this.startTime = Date.now();
  }

  async initialize() {
    logger.info('Initializing State Manager');
    
    // Initialize default namespaces
    for (const [name, config] of Object.entries(this.namespaceConfigs)) {
      await this.createNamespace(name, config);
    }
    
    // Start maintenance tasks
    this.startMaintenanceTasks();
    
    // Subscribe to events
    this.eventBus.on('state-read-request', this.handleReadRequest.bind(this));
    this.eventBus.on('state-write-request', this.handleWriteRequest.bind(this));
    this.eventBus.on('state-delete-request', this.handleDeleteRequest.bind(this));
    this.eventBus.on('state-subscribe-request', this.handleSubscribeRequest.bind(this));
    this.eventBus.on('cluster-node-joined', this.handleNodeJoined.bind(this));
    this.eventBus.on('cluster-node-left', this.handleNodeLeft.bind(this));
    
    logger.info('State Manager initialized');
  }

  startMaintenanceTasks() {
    // TTL cleanup
    setInterval(() => {
      this.cleanupExpiredKeys();
    }, 60 * 1000); // Every minute
    
    // Size-based eviction
    setInterval(() => {
      this.performEviction();
    }, 5 * 60 * 1000); // Every 5 minutes
    
    // Metrics update
    setInterval(() => {
      this.updateMetrics();
    }, 30 * 1000); // Every 30 seconds
    
    // Replication sync
    setInterval(() => {
      this.syncReplication();
    }, 10 * 1000); // Every 10 seconds
    
    // Health check
    setInterval(() => {
      this.performHealthCheck();
    }, 60 * 1000); // Every minute
  }

  // Namespace Management
  async createNamespace(name, config = {}) {
    if (this.namespaces.has(name)) {
      throw new Error(`Namespace '${name}' already exists`);
    }
    
    const namespaceConfig = {
      ...this.defaultNamespaceConfig,
      ...config
    };
    
    const namespace = {
      name,
      config: namespaceConfig,
      data: new Map(),
      indexes: new Map(),
      versions: new Map(),
      metadata: {
        createdAt: Date.now(),
        lastAccessed: Date.now(),
        totalReads: 0,
        totalWrites: 0,
        totalDeletes: 0,
        size: 0,
        keyCount: 0
      },
      locks: new Map(),
      subscriptions: new Set()
    };
    
    this.namespaces.set(name, namespace);
    
    logger.info(`Created namespace: ${name}`, namespaceConfig);
    
    this.eventBus.emit('namespace-created', {
      name,
      config: namespaceConfig,
      timestamp: Date.now()
    });
    
    return namespace;
  }

  async deleteNamespace(name) {
    const namespace = this.namespaces.get(name);
    
    if (!namespace) {
      throw new Error(`Namespace '${name}' does not exist`);
    }
    
    // Clear all data
    namespace.data.clear();
    namespace.indexes.clear();
    namespace.versions.clear();
    namespace.locks.clear();
    namespace.subscriptions.clear();
    
    this.namespaces.delete(name);
    
    logger.info(`Deleted namespace: ${name}`);
    
    this.eventBus.emit('namespace-deleted', {
      name,
      timestamp: Date.now()
    });
  }

  getNamespace(name) {
    return this.namespaces.get(name);
  }

  listNamespaces() {
    return Array.from(this.namespaces.keys());
  }

  // Core State Operations
  async get(namespace, key, options = {}) {
    const startTime = Date.now();
    
    try {
      const ns = this.getNamespace(namespace);
      if (!ns) {
        throw new Error(`Namespace '${namespace}' does not exist`);
      }
      
      // Check consistency requirements
      const consistencyModel = this.consistencyModels[ns.config.consistency];
      
      // Handle read quorum for strong consistency
      if (ns.config.consistency === 'strong' && this.clusterNodes.size > 1) {
        return await this.readWithQuorum(namespace, key, consistencyModel.readQuorum, options);
      }
      
      const entry = ns.data.get(key);
      
      if (!entry) {
        this.operations.reads++;
        ns.metadata.totalReads++;
        
        this.eventBus.emit('state-read-miss', {
          namespace,
          key,
          timestamp: Date.now()
        });
        
        return null;
      }
      
      // Check TTL
      if (this.isExpired(entry)) {
        ns.data.delete(key);
        this.operations.expirations++;
        
        this.eventBus.emit('state-key-expired', {
          namespace,
          key,
          timestamp: Date.now()
        });
        
        return null;
      }
      
      // Update access time
      entry.lastAccessed = Date.now();
      entry.accessCount++;
      ns.metadata.lastAccessed = Date.now();
      
      this.operations.reads++;
      ns.metadata.totalReads++;
      
      // Decrypt if needed
      let value = entry.value;
      if (ns.config.encryption && entry.encrypted) {
        value = await this.decrypt(value);
      }
      
      // Decompress if needed
      if (ns.config.compression && entry.compressed) {
        value = await this.decompress(value);
      }
      
      this.eventBus.emit('state-read-hit', {
        namespace,
        key,
        timestamp: Date.now(),
        readTime: Date.now() - startTime
      });
      
      return {
        value,
        metadata: {
          version: entry.version,
          createdAt: entry.createdAt,
          updatedAt: entry.updatedAt,
          lastAccessed: entry.lastAccessed,
          accessCount: entry.accessCount,
          ttl: entry.ttl,
          expiresAt: entry.expiresAt
        }
      };
      
    } catch (error) {
      logger.error(`Error reading key ${key} from namespace ${namespace}:`, error);
      throw error;
    } finally {
      this.metrics.avgReadTime = (this.metrics.avgReadTime + (Date.now() - startTime)) / 2;
    }
  }

  async set(namespace, key, value, options = {}) {
    const startTime = Date.now();
    
    try {
      const ns = this.getNamespace(namespace);
      if (!ns) {
        throw new Error(`Namespace '${namespace}' does not exist`);
      }
      
      // Check if key is locked
      if (this.isLocked(namespace, key)) {
        throw new Error(`Key '${key}' is locked`);
      }
      
      // Handle write quorum for strong consistency
      const consistencyModel = this.consistencyModels[ns.config.consistency];
      if (ns.config.consistency === 'strong' && this.clusterNodes.size > 1) {
        return await this.writeWithQuorum(namespace, key, value, consistencyModel.writeQuorum, options);
      }
      
      const now = Date.now();
      const ttl = options.ttl || ns.config.ttl;
      const version = options.version || uuidv4();
      
      // Get existing entry for conflict resolution
      const existingEntry = ns.data.get(key);
      
      // Handle versioning conflicts
      if (ns.config.versioning && existingEntry && options.expectedVersion) {
        if (existingEntry.version !== options.expectedVersion) {
          const conflict = await this.resolveConflict(namespace, key, existingEntry, {
            value,
            version,
            timestamp: now
          });
          
          if (!conflict.resolved) {
            throw new Error(`Version conflict for key '${key}'. Expected: ${options.expectedVersion}, Actual: ${existingEntry.version}`);
          }
          
          value = conflict.resolvedValue;
        }
      }
      
      // Compress if needed
      let processedValue = value;
      let compressed = false;
      if (ns.config.compression && this.shouldCompress(value)) {
        processedValue = await this.compress(value);
        compressed = true;
      }
      
      // Encrypt if needed
      let encrypted = false;
      if (ns.config.encryption) {
        processedValue = await this.encrypt(processedValue);
        encrypted = true;
      }
      
      const entry = {
        key,
        value: processedValue,
        originalValue: value, // Keep for conflict resolution
        version,
        createdAt: existingEntry ? existingEntry.createdAt : now,
        updatedAt: now,
        lastAccessed: now,
        accessCount: existingEntry ? existingEntry.accessCount : 0,
        ttl,
        expiresAt: ttl ? now + ttl : null,
        compressed,
        encrypted,
        size: this.calculateSize(processedValue),
        tags: options.tags || [],
        metadata: options.metadata || {}
      };
      
      // Store previous version if versioning is enabled
      if (ns.config.versioning && existingEntry) {
        const versionKey = `${key}:${existingEntry.version}`;
        ns.versions.set(versionKey, existingEntry);
      }
      
      ns.data.set(key, entry);
      
      // Update indexes
      if (ns.config.indexing) {
        await this.updateIndexes(namespace, key, value, options.indexes);
      }
      
      // Update metadata
      ns.metadata.totalWrites++;
      ns.metadata.lastAccessed = now;
      ns.metadata.keyCount = ns.data.size;
      ns.metadata.size += entry.size - (existingEntry ? existingEntry.size : 0);
      
      this.operations.writes++;
      
      // Replicate if needed
      if (ns.config.replication && this.clusterNodes.size > 1) {
        await this.replicateWrite(namespace, key, entry);
      }
      
      // Notify subscribers
      this.notifySubscribers(namespace, key, 'set', { value, metadata: entry });
      
      this.eventBus.emit('state-write-success', {
        namespace,
        key,
        version,
        timestamp: now,
        writeTime: Date.now() - startTime
      });
      
      return {
        version,
        timestamp: now,
        ttl,
        expiresAt: entry.expiresAt
      };
      
    } catch (error) {
      logger.error(`Error writing key ${key} to namespace ${namespace}:`, error);
      throw error;
    } finally {
      this.metrics.avgWriteTime = (this.metrics.avgWriteTime + (Date.now() - startTime)) / 2;
    }
  }

  async delete(namespace, key, options = {}) {
    try {
      const ns = this.getNamespace(namespace);
      if (!ns) {
        throw new Error(`Namespace '${namespace}' does not exist`);
      }
      
      // Check if key is locked
      if (this.isLocked(namespace, key)) {
        throw new Error(`Key '${key}' is locked`);
      }
      
      const entry = ns.data.get(key);
      if (!entry) {
        return false; // Key doesn't exist
      }
      
      // Store in versions if versioning is enabled
      if (ns.config.versioning) {
        const versionKey = `${key}:${entry.version}:deleted`;
        ns.versions.set(versionKey, {
          ...entry,
          deletedAt: Date.now(),
          deletedBy: options.deletedBy || 'system'
        });
      }
      
      // Remove from data
      ns.data.delete(key);
      
      // Remove from indexes
      if (ns.config.indexing) {
        await this.removeFromIndexes(namespace, key);
      }
      
      // Update metadata
      ns.metadata.totalDeletes++;
      ns.metadata.keyCount = ns.data.size;
      ns.metadata.size -= entry.size;
      
      this.operations.deletes++;
      
      // Replicate deletion if needed
      if (ns.config.replication && this.clusterNodes.size > 1) {
        await this.replicateDelete(namespace, key);
      }
      
      // Notify subscribers
      this.notifySubscribers(namespace, key, 'delete', { deletedAt: Date.now() });
      
      this.eventBus.emit('state-delete-success', {
        namespace,
        key,
        timestamp: Date.now()
      });
      
      return true;
      
    } catch (error) {
      logger.error(`Error deleting key ${key} from namespace ${namespace}:`, error);
      throw error;
    }
  }

  async exists(namespace, key) {
    const ns = this.getNamespace(namespace);
    if (!ns) {
      return false;
    }
    
    const entry = ns.data.get(key);
    if (!entry) {
      return false;
    }
    
    // Check if expired
    if (this.isExpired(entry)) {
      ns.data.delete(key);
      this.operations.expirations++;
      return false;
    }
    
    return true;
  }

  async keys(namespace, pattern = '*', options = {}) {
    const ns = this.getNamespace(namespace);
    if (!ns) {
      return [];
    }
    
    let keys = Array.from(ns.data.keys());
    
    // Apply pattern matching
    if (pattern !== '*') {
      const regex = this.patternToRegex(pattern);
      keys = keys.filter(key => regex.test(key));
    }
    
    // Filter expired keys
    keys = keys.filter(key => {
      const entry = ns.data.get(key);
      if (this.isExpired(entry)) {
        ns.data.delete(key);
        this.operations.expirations++;
        return false;
      }
      return true;
    });
    
    // Apply limit
    if (options.limit) {
      keys = keys.slice(0, options.limit);
    }
    
    return keys;
  }

  // Advanced Operations
  async mget(namespace, keys) {
    const results = new Map();
    
    for (const key of keys) {
      try {
        const result = await this.get(namespace, key);
        results.set(key, result);
      } catch (error) {
        results.set(key, { error: error.message });
      }
    }
    
    return results;
  }

  async mset(namespace, entries, options = {}) {
    const results = new Map();
    
    for (const [key, value] of entries) {
      try {
        const result = await this.set(namespace, key, value, options);
        results.set(key, result);
      } catch (error) {
        results.set(key, { error: error.message });
      }
    }
    
    return results;
  }

  async increment(namespace, key, delta = 1, options = {}) {
    const ns = this.getNamespace(namespace);
    if (!ns) {
      throw new Error(`Namespace '${namespace}' does not exist`);
    }
    
    // Lock the key for atomic operation
    await this.lock(namespace, key);
    
    try {
      const current = await this.get(namespace, key);
      const currentValue = current ? (typeof current.value === 'number' ? current.value : 0) : 0;
      const newValue = currentValue + delta;
      
      await this.set(namespace, key, newValue, options);
      
      return newValue;
    } finally {
      await this.unlock(namespace, key);
    }
  }

  async expire(namespace, key, ttl) {
    const ns = this.getNamespace(namespace);
    if (!ns) {
      throw new Error(`Namespace '${namespace}' does not exist`);
    }
    
    const entry = ns.data.get(key);
    if (!entry) {
      return false;
    }
    
    entry.ttl = ttl;
    entry.expiresAt = Date.now() + ttl;
    
    return true;
  }

  async persist(namespace, key) {
    const ns = this.getNamespace(namespace);
    if (!ns) {
      throw new Error(`Namespace '${namespace}' does not exist`);
    }
    
    const entry = ns.data.get(key);
    if (!entry) {
      return false;
    }
    
    entry.ttl = null;
    entry.expiresAt = null;
    
    return true;
  }

  async ttl(namespace, key) {
    const ns = this.getNamespace(namespace);
    if (!ns) {
      return -2; // Key doesn't exist
    }
    
    const entry = ns.data.get(key);
    if (!entry) {
      return -2; // Key doesn't exist
    }
    
    if (!entry.expiresAt) {
      return -1; // Key exists but has no expiration
    }
    
    const remaining = entry.expiresAt - Date.now();
    return remaining > 0 ? remaining : 0;
  }

  // Transaction Support
  async beginTransaction(options = {}) {
    const transactionId = uuidv4();
    const transaction = {
      id: transactionId,
      operations: [],
      locks: new Set(),
      createdAt: Date.now(),
      timeout: options.timeout || 30000, // 30 seconds
      isolation: options.isolation || 'read-committed'
    };
    
    this.transactions.set(transactionId, transaction);
    
    // Set timeout
    setTimeout(() => {
      if (this.transactions.has(transactionId)) {
        this.rollbackTransaction(transactionId);
      }
    }, transaction.timeout);
    
    return transactionId;
  }

  async addToTransaction(transactionId, operation) {
    const transaction = this.transactions.get(transactionId);
    if (!transaction) {
      throw new Error(`Transaction ${transactionId} not found`);
    }
    
    transaction.operations.push({
      ...operation,
      timestamp: Date.now()
    });
  }

  async commitTransaction(transactionId) {
    const transaction = this.transactions.get(transactionId);
    if (!transaction) {
      throw new Error(`Transaction ${transactionId} not found`);
    }
    
    try {
      // Acquire all locks
      for (const operation of transaction.operations) {
        if (operation.type === 'set' || operation.type === 'delete') {
          await this.lock(operation.namespace, operation.key);
          transaction.locks.add(`${operation.namespace}:${operation.key}`);
        }
      }
      
      // Execute all operations
      const results = [];
      for (const operation of transaction.operations) {
        let result;
        switch (operation.type) {
          case 'get':
            result = await this.get(operation.namespace, operation.key, operation.options);
            break;
          case 'set':
            result = await this.set(operation.namespace, operation.key, operation.value, operation.options);
            break;
          case 'delete':
            result = await this.delete(operation.namespace, operation.key, operation.options);
            break;
          default:
            throw new Error(`Unknown operation type: ${operation.type}`);
        }
        results.push(result);
      }
      
      // Release locks
      for (const lockKey of transaction.locks) {
        const [namespace, key] = lockKey.split(':');
        await this.unlock(namespace, key);
      }
      
      this.transactions.delete(transactionId);
      
      this.eventBus.emit('transaction-committed', {
        transactionId,
        operationCount: transaction.operations.length,
        timestamp: Date.now()
      });
      
      return results;
      
    } catch (error) {
      await this.rollbackTransaction(transactionId);
      throw error;
    }
  }

  async rollbackTransaction(transactionId) {
    const transaction = this.transactions.get(transactionId);
    if (!transaction) {
      return;
    }
    
    // Release all locks
    for (const lockKey of transaction.locks) {
      const [namespace, key] = lockKey.split(':');
      await this.unlock(namespace, key);
    }
    
    this.transactions.delete(transactionId);
    
    this.eventBus.emit('transaction-rolled-back', {
      transactionId,
      operationCount: transaction.operations.length,
      timestamp: Date.now()
    });
  }

  // Locking
  async lock(namespace, key, timeout = 10000) {
    const lockKey = `${namespace}:${key}`;
    const lockId = uuidv4();
    
    const lock = {
      id: lockId,
      namespace,
      key,
      acquiredAt: Date.now(),
      expiresAt: Date.now() + timeout,
      owner: this.nodeId
    };
    
    // Wait for lock to be available
    while (this.locks.has(lockKey)) {
      const existingLock = this.locks.get(lockKey);
      if (existingLock.expiresAt < Date.now()) {
        this.locks.delete(lockKey);
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    this.locks.set(lockKey, lock);
    
    // Auto-release lock after timeout
    setTimeout(() => {
      if (this.locks.get(lockKey)?.id === lockId) {
        this.locks.delete(lockKey);
      }
    }, timeout);
    
    return lockId;
  }

  async unlock(namespace, key, lockId = null) {
    const lockKey = `${namespace}:${key}`;
    const lock = this.locks.get(lockKey);
    
    if (!lock) {
      return false;
    }
    
    if (lockId && lock.id !== lockId) {
      throw new Error('Lock ID mismatch');
    }
    
    this.locks.delete(lockKey);
    return true;
  }

  isLocked(namespace, key) {
    const lockKey = `${namespace}:${key}`;
    const lock = this.locks.get(lockKey);
    
    if (!lock) {
      return false;
    }
    
    if (lock.expiresAt < Date.now()) {
      this.locks.delete(lockKey);
      return false;
    }
    
    return true;
  }

  // Subscriptions
  async subscribe(namespace, pattern, callback, options = {}) {
    const subscriptionId = uuidv4();
    const subscription = {
      id: subscriptionId,
      namespace,
      pattern,
      callback,
      options,
      createdAt: Date.now(),
      eventCount: 0
    };
    
    this.subscriptions.set(subscriptionId, subscription);
    
    const ns = this.getNamespace(namespace);
    if (ns) {
      ns.subscriptions.add(subscriptionId);
    }
    
    return subscriptionId;
  }

  async unsubscribe(subscriptionId) {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) {
      return false;
    }
    
    const ns = this.getNamespace(subscription.namespace);
    if (ns) {
      ns.subscriptions.delete(subscriptionId);
    }
    
    this.subscriptions.delete(subscriptionId);
    return true;
  }

  notifySubscribers(namespace, key, operation, data) {
    const ns = this.getNamespace(namespace);
    if (!ns) {
      return;
    }
    
    for (const subscriptionId of ns.subscriptions) {
      const subscription = this.subscriptions.get(subscriptionId);
      if (!subscription) {
        continue;
      }
      
      // Check if key matches pattern
      const regex = this.patternToRegex(subscription.pattern);
      if (!regex.test(key)) {
        continue;
      }
      
      // Call callback
      try {
        subscription.callback({
          namespace,
          key,
          operation,
          data,
          timestamp: Date.now()
        });
        subscription.eventCount++;
      } catch (error) {
        logger.error('Error in subscription callback:', error);
      }
    }
  }

  // Indexing
  async updateIndexes(namespace, key, value, customIndexes = []) {
    const ns = this.getNamespace(namespace);
    if (!ns) {
      return;
    }
    
    // Remove old indexes
    await this.removeFromIndexes(namespace, key);
    
    // Add new indexes
    const indexes = [...this.getDefaultIndexes(value), ...customIndexes];
    
    for (const index of indexes) {
      const indexKey = `${index.field}:${index.value}`;
      
      if (!ns.indexes.has(indexKey)) {
        ns.indexes.set(indexKey, new Set());
      }
      
      ns.indexes.get(indexKey).add(key);
    }
  }

  async removeFromIndexes(namespace, key) {
    const ns = this.getNamespace(namespace);
    if (!ns) {
      return;
    }
    
    // Remove key from all indexes
    for (const [indexKey, keySet] of ns.indexes) {
      keySet.delete(key);
      if (keySet.size === 0) {
        ns.indexes.delete(indexKey);
      }
    }
  }

  getDefaultIndexes(value) {
    const indexes = [];
    
    if (typeof value === 'object' && value !== null) {
      // Index common fields
      const indexableFields = ['type', 'category', 'status', 'userId', 'id'];
      
      for (const field of indexableFields) {
        if (value[field] !== undefined) {
          indexes.push({
            field,
            value: String(value[field])
          });
        }
      }
    }
    
    return indexes;
  }

  async query(namespace, indexField, indexValue, options = {}) {
    const ns = this.getNamespace(namespace);
    if (!ns) {
      return [];
    }
    
    const indexKey = `${indexField}:${indexValue}`;
    const keySet = ns.indexes.get(indexKey);
    
    if (!keySet) {
      return [];
    }
    
    let keys = Array.from(keySet);
    
    // Apply limit
    if (options.limit) {
      keys = keys.slice(0, options.limit);
    }
    
    // Get values
    const results = [];
    for (const key of keys) {
      try {
        const result = await this.get(namespace, key);
        if (result) {
          results.push({ key, ...result });
        }
      } catch (error) {
        logger.error(`Error querying key ${key}:`, error);
      }
    }
    
    return results;
  }

  // Consistency and Replication
  async readWithQuorum(namespace, key, quorum, options) {
    const nodes = Array.from(this.clusterNodes);
    const responses = [];
    
    // Read from multiple nodes
    const readPromises = nodes.slice(0, quorum).map(async (nodeId) => {
      try {
        return await this.readFromNode(nodeId, namespace, key, options);
      } catch (error) {
        return { error: error.message, nodeId };
      }
    });
    
    const results = await Promise.all(readPromises);
    
    // Find consensus
    const validResults = results.filter(r => !r.error);
    
    if (validResults.length < quorum) {
      throw new Error(`Failed to achieve read quorum (${validResults.length}/${quorum})`);
    }
    
    // Return the most recent version
    return validResults.reduce((latest, current) => {
      if (!latest || current.metadata.updatedAt > latest.metadata.updatedAt) {
        return current;
      }
      return latest;
    });
  }

  async writeWithQuorum(namespace, key, value, quorum, options) {
    const nodes = Array.from(this.clusterNodes);
    
    // Write to multiple nodes
    const writePromises = nodes.slice(0, quorum).map(async (nodeId) => {
      try {
        return await this.writeToNode(nodeId, namespace, key, value, options);
      } catch (error) {
        return { error: error.message, nodeId };
      }
    });
    
    const results = await Promise.all(writePromises);
    
    // Check if quorum was achieved
    const successfulWrites = results.filter(r => !r.error);
    
    if (successfulWrites.length < quorum) {
      throw new Error(`Failed to achieve write quorum (${successfulWrites.length}/${quorum})`);
    }
    
    return successfulWrites[0]; // Return first successful result
  }

  async readFromNode(nodeId, namespace, key, options) {
    // Mock implementation - would make network call to node
    if (nodeId === this.nodeId) {
      return await this.get(namespace, key, options);
    }
    
    // Simulate network call
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          value: `mock-value-from-${nodeId}`,
          metadata: {
            version: uuidv4(),
            updatedAt: Date.now() - Math.random() * 10000
          }
        });
      }, Math.random() * 100);
    });
  }

  async writeToNode(nodeId, namespace, key, value, options) {
    // Mock implementation - would make network call to node
    if (nodeId === this.nodeId) {
      return await this.set(namespace, key, value, options);
    }
    
    // Simulate network call
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          version: uuidv4(),
          timestamp: Date.now()
        });
      }, Math.random() * 100);
    });
  }

  async replicateWrite(namespace, key, entry) {
    const replicationNodes = Array.from(this.clusterNodes)
      .filter(nodeId => nodeId !== this.nodeId);
    
    const replicationPromises = replicationNodes.map(async (nodeId) => {
      try {
        await this.writeToNode(nodeId, namespace, key, entry.originalValue, {
          version: entry.version,
          ttl: entry.ttl
        });
        this.operations.replications++;
      } catch (error) {
        logger.error(`Replication failed to node ${nodeId}:`, error);
      }
    });
    
    await Promise.allSettled(replicationPromises);
  }

  async replicateDelete(namespace, key) {
    const replicationNodes = Array.from(this.clusterNodes)
      .filter(nodeId => nodeId !== this.nodeId);
    
    const replicationPromises = replicationNodes.map(async (nodeId) => {
      try {
        await this.deleteFromNode(nodeId, namespace, key);
        this.operations.replications++;
      } catch (error) {
        logger.error(`Delete replication failed to node ${nodeId}:`, error);
      }
    });
    
    await Promise.allSettled(replicationPromises);
  }

  async deleteFromNode(nodeId, namespace, key) {
    // Mock implementation
    if (nodeId === this.nodeId) {
      return await this.delete(namespace, key);
    }
    
    return new Promise((resolve) => {
      setTimeout(() => resolve(true), Math.random() * 50);
    });
  }

  async syncReplication() {
    // Sync with other nodes to ensure consistency
    for (const nodeId of this.clusterNodes) {
      if (nodeId === this.nodeId) continue;
      
      try {
        await this.syncWithNode(nodeId);
      } catch (error) {
        logger.error(`Sync failed with node ${nodeId}:`, error);
      }
    }
  }

  async syncWithNode(nodeId) {
    // Mock implementation - would compare versions and sync differences
    logger.debug(`Syncing with node ${nodeId}`);
  }

  // Conflict Resolution
  async resolveConflict(namespace, key, existingEntry, newEntry) {
    const ns = this.getNamespace(namespace);
    const strategy = ns.config.conflictResolution;
    
    switch (strategy) {
      case 'last-write-wins':
        return {
          resolved: true,
          resolvedValue: newEntry.value,
          strategy: 'last-write-wins'
        };
        
      case 'first-write-wins':
        return {
          resolved: true,
          resolvedValue: existingEntry.originalValue,
          strategy: 'first-write-wins'
        };
        
      case 'merge':
        const mergedValue = await this.mergeValues(existingEntry.originalValue, newEntry.value);
        return {
          resolved: true,
          resolvedValue: mergedValue,
          strategy: 'merge'
        };
        
      case 'manual':
        this.operations.conflicts++;
        
        this.eventBus.emit('conflict-detected', {
          namespace,
          key,
          existingEntry,
          newEntry,
          timestamp: Date.now()
        });
        
        return {
          resolved: false,
          reason: 'manual-resolution-required'
        };
        
      case 'append':
        const appendedValue = this.appendValues(existingEntry.originalValue, newEntry.value);
        return {
          resolved: true,
          resolvedValue: appendedValue,
          strategy: 'append'
        };
        
      default:
        throw new Error(`Unknown conflict resolution strategy: ${strategy}`);
    }
  }

  async mergeValues(existing, incoming) {
    // Simple merge strategy for objects
    if (typeof existing === 'object' && typeof incoming === 'object' && 
        existing !== null && incoming !== null) {
      return { ...existing, ...incoming };
    }
    
    // For arrays, concatenate
    if (Array.isArray(existing) && Array.isArray(incoming)) {
      return [...existing, ...incoming];
    }
    
    // For primitives, use incoming value
    return incoming;
  }

  appendValues(existing, incoming) {
    if (Array.isArray(existing)) {
      return [...existing, incoming];
    }
    
    return [existing, incoming];
  }

  // Utility Methods
  isExpired(entry) {
    return entry.expiresAt && entry.expiresAt <= Date.now();
  }

  shouldCompress(value) {
    const serialized = JSON.stringify(value);
    return serialized.length > 1024; // Compress if larger than 1KB
  }

  async compress(value) {
    // Mock compression - in production use zlib or similar
    const serialized = JSON.stringify(value);
    return `compressed:${serialized.length}:${serialized}`;
  }

  async decompress(compressedValue) {
    // Mock decompression
    if (typeof compressedValue === 'string' && compressedValue.startsWith('compressed:')) {
      const parts = compressedValue.split(':');
      return JSON.parse(parts.slice(2).join(':'));
    }
    return compressedValue;
  }

  async encrypt(value) {
    // Mock encryption - in production use proper encryption
    const serialized = JSON.stringify(value);
    return `encrypted:${Buffer.from(serialized).toString('base64')}`;
  }

  async decrypt(encryptedValue) {
    // Mock decryption
    if (typeof encryptedValue === 'string' && encryptedValue.startsWith('encrypted:')) {
      const base64Data = encryptedValue.substring('encrypted:'.length);
      const serialized = Buffer.from(base64Data, 'base64').toString();
      return JSON.parse(serialized);
    }
    return encryptedValue;
  }

  calculateSize(value) {
    return JSON.stringify(value).length;
  }

  patternToRegex(pattern) {
    // Convert glob pattern to regex
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regexPattern = escaped.replace(/\\\*/g, '.*').replace(/\\\?/g, '.');
    return new RegExp(`^${regexPattern}$`);
  }

  // Maintenance
  cleanupExpiredKeys() {
    let totalExpired = 0;
    
    for (const [namespaceName, namespace] of this.namespaces) {
      let expiredCount = 0;
      
      for (const [key, entry] of namespace.data) {
        if (this.isExpired(entry)) {
          namespace.data.delete(key);
          
          // Remove from indexes
          if (namespace.config.indexing) {
            this.removeFromIndexes(namespaceName, key);
          }
          
          expiredCount++;
          this.operations.expirations++;
        }
      }
      
      if (expiredCount > 0) {
        namespace.metadata.keyCount = namespace.data.size;
        totalExpired += expiredCount;
        
        logger.debug(`Expired ${expiredCount} keys from namespace ${namespaceName}`);
      }
    }
    
    if (totalExpired > 0) {
      this.eventBus.emit('keys-expired', {
        count: totalExpired,
        timestamp: Date.now()
      });
    }
  }

  performEviction() {
    for (const [namespaceName, namespace] of this.namespaces) {
      const maxSize = namespace.config.maxSize;
      const currentSize = namespace.data.size;
      
      if (currentSize > maxSize) {
        const evictionCount = Math.ceil(currentSize * 0.1); // Evict 10%
        
        // Get least recently used keys
        const entries = Array.from(namespace.data.entries())
          .sort((a, b) => a[1].lastAccessed - b[1].lastAccessed)
          .slice(0, evictionCount);
        
        for (const [key] of entries) {
          namespace.data.delete(key);
          
          // Remove from indexes
          if (namespace.config.indexing) {
            this.removeFromIndexes(namespaceName, key);
          }
          
          this.operations.evictions++;
        }
        
        namespace.metadata.keyCount = namespace.data.size;
        
        logger.debug(`Evicted ${evictionCount} keys from namespace ${namespaceName}`);
        
        this.eventBus.emit('keys-evicted', {
          namespace: namespaceName,
          count: evictionCount,
          timestamp: Date.now()
        });
      }
    }
  }

  updateMetrics() {
    let totalKeys = 0;
    let totalSize = 0;
    
    for (const namespace of this.namespaces.values()) {
      totalKeys += namespace.data.size;
      totalSize += namespace.metadata.size;
    }
    
    this.metrics.totalKeys = totalKeys;
    this.metrics.totalSize = totalSize;
    
    // Calculate hit/miss rates
    const totalReads = this.operations.reads;
    if (totalReads > 0) {
      this.metrics.hitRate = ((totalReads - this.operations.reads) / totalReads) * 100;
      this.metrics.missRate = 100 - this.metrics.hitRate;
    }
    
    // Memory usage (approximate)
    this.metrics.memoryUsage = totalSize * 1.5; // Account for overhead
  }

  performHealthCheck() {
    const healthStatus = {
      timestamp: Date.now(),
      status: 'healthy',
      metrics: this.metrics,
      operations: this.operations,
      namespaces: this.namespaces.size,
      activeLocks: this.locks.size,
      activeTransactions: this.transactions.size,
      subscriptions: this.subscriptions.size,
      clusterNodes: this.clusterNodes.size
    };
    
    // Check for issues
    const issues = [];
    
    if (this.metrics.memoryUsage > 1000000000) { // 1GB
      issues.push('high-memory-usage');
    }
    
    if (this.locks.size > 1000) {
      issues.push('too-many-locks');
    }
    
    if (this.transactions.size > 100) {
      issues.push('too-many-transactions');
    }
    
    if (issues.length > 0) {
      healthStatus.status = 'degraded';
      healthStatus.issues = issues;
    }
    
    this.eventBus.emit('state-health-check', healthStatus);
    
    return healthStatus;
  }

  // Event Handlers
  async handleReadRequest(event) {
    const { namespace, key, options, requestId } = event.data;
    
    try {
      const result = await this.get(namespace, key, options);
      
      this.eventBus.emit('state-read-response', {
        requestId,
        result,
        timestamp: Date.now()
      });
    } catch (error) {
      this.eventBus.emit('state-read-error', {
        requestId,
        error: error.message,
        timestamp: Date.now()
      });
    }
  }

  async handleWriteRequest(event) {
    const { namespace, key, value, options, requestId } = event.data;
    
    try {
      const result = await this.set(namespace, key, value, options);
      
      this.eventBus.emit('state-write-response', {
        requestId,
        result,
        timestamp: Date.now()
      });
    } catch (error) {
      this.eventBus.emit('state-write-error', {
        requestId,
        error: error.message,
        timestamp: Date.now()
      });
    }
  }

  async handleDeleteRequest(event) {
    const { namespace, key, options, requestId } = event.data;
    
    try {
      const result = await this.delete(namespace, key, options);
      
      this.eventBus.emit('state-delete-response', {
        requestId,
        result,
        timestamp: Date.now()
      });
    } catch (error) {
      this.eventBus.emit('state-delete-error', {
        requestId,
        error: error.message,
        timestamp: Date.now()
      });
    }
  }

  async handleSubscribeRequest(event) {
    const { namespace, pattern, requestId } = event.data;
    
    try {
      const subscriptionId = await this.subscribe(namespace, pattern, (eventData) => {
        this.eventBus.emit('state-subscription-event', {
          subscriptionId,
          eventData,
          timestamp: Date.now()
        });
      });
      
      this.eventBus.emit('state-subscribe-response', {
        requestId,
        subscriptionId,
        timestamp: Date.now()
      });
    } catch (error) {
      this.eventBus.emit('state-subscribe-error', {
        requestId,
        error: error.message,
        timestamp: Date.now()
      });
    }
  }

  handleNodeJoined(event) {
    const { nodeId } = event.data;
    this.clusterNodes.add(nodeId);
    
    logger.info(`Node joined cluster: ${nodeId}`);
    
    // Trigger rebalancing if needed
    this.eventBus.emit('cluster-rebalance-needed', {
      nodeId,
      action: 'joined',
      timestamp: Date.now()
    });
  }

  handleNodeLeft(event) {
    const { nodeId } = event.data;
    this.clusterNodes.delete(nodeId);
    
    logger.info(`Node left cluster: ${nodeId}`);
    
    // Trigger rebalancing if needed
    this.eventBus.emit('cluster-rebalance-needed', {
      nodeId,
      action: 'left',
      timestamp: Date.now()
    });
  }

  // Query Methods
  getNamespaceInfo(namespace) {
    const ns = this.getNamespace(namespace);
    if (!ns) {
      return null;
    }
    
    return {
      name: ns.name,
      config: ns.config,
      metadata: ns.metadata,
      keyCount: ns.data.size,
      indexCount: ns.indexes.size,
      subscriptionCount: ns.subscriptions.size
    };
  }

  getMetrics() {
    return {
      ...this.metrics,
      operations: this.operations,
      uptime: Date.now() - this.startTime,
      namespaces: this.namespaces.size,
      activeLocks: this.locks.size,
      activeTransactions: this.transactions.size,
      subscriptions: this.subscriptions.size,
      clusterNodes: this.clusterNodes.size
    };
  }

  getHealthStatus() {
    return this.performHealthCheck();
  }

  async shutdown() {
    logger.info('Shutting down State Manager');
    
    // Rollback all active transactions
    for (const transactionId of this.transactions.keys()) {
      await this.rollbackTransaction(transactionId);
    }
    
    // Release all locks
    this.locks.clear();
    
    // Clear all subscriptions
    this.subscriptions.clear();
    
    // Remove event listeners
    this.eventBus.removeAllListeners('state-read-request');
    this.eventBus.removeAllListeners('state-write-request');
    this.eventBus.removeAllListeners('state-delete-request');
    this.eventBus.removeAllListeners('state-subscribe-request');
    this.eventBus.removeAllListeners('cluster-node-joined');
    this.eventBus.removeAllListeners('cluster-node-left');
    
    // Clear all namespaces
    for (const namespace of this.namespaces.values()) {
      namespace.data.clear();
      namespace.indexes.clear();
      namespace.versions.clear();
      namespace.locks.clear();
      namespace.subscriptions.clear();
    }
    
    this.namespaces.clear();
    
    logger.info('State Manager shutdown complete');
  }
}