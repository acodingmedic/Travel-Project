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

export class EnhancedEventBus extends EventEmitter {
  constructor() {
    super();
    this.config = getConfig();
    
    // Event schemas for validation
    this.eventSchemas = new Map();
    
    // Event middleware
    this.middleware = [];
    
    // Event filters
    this.filters = new Map();
    
    // Event transformers
    this.transformers = new Map();
    
    // Event routing
    this.routes = new Map();
    
    // Event persistence
    this.eventStore = [];
    this.maxStoredEvents = 10000;
    
    // Event metrics
    this.metrics = {
      totalEvents: 0,
      successfulEvents: 0,
      failedEvents: 0,
      filteredEvents: 0,
      transformedEvents: 0,
      routedEvents: 0,
      averageProcessingTime: 0,
      eventsByType: new Map(),
      errorsByType: new Map()
    };
    
    // Event queues for different priorities
    this.eventQueues = {
      critical: [],
      high: [],
      medium: [],
      low: []
    };
    
    // Processing state
    this.isProcessing = false;
    this.processingQueue = [];
    
    // Error handling
    this.errorHandlers = new Map();
    this.deadLetterQueue = [];
    
    // Event subscriptions with metadata
    this.subscriptions = new Map();
    
    // Event patterns for pattern matching
    this.patterns = new Map();
    
    // Circuit breaker for event processing
    this.circuitBreaker = {
      isOpen: false,
      failureCount: 0,
      lastFailureTime: null,
      threshold: 10,
      timeout: 30000 // 30 seconds
    };
    
    this.startTime = Date.now();
    
    // Initialize default schemas
    this.initializeDefaultSchemas();
    
    // Start processing
    this.startEventProcessing();
  }

  initializeDefaultSchemas() {
    // Base event schema
    this.registerSchema('base-event', {
      type: 'object',
      required: ['type', 'data', 'timestamp'],
      properties: {
        type: { type: 'string' },
        data: { type: 'object' },
        timestamp: { type: 'number' },
        id: { type: 'string' },
        source: { type: 'string' },
        priority: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
        tags: { type: 'array', items: { type: 'string' } },
        metadata: { type: 'object' }
      }
    });
    
    // Search event schema
    this.registerSchema('search-request', {
      type: 'object',
      required: ['type', 'data'],
      properties: {
        type: { type: 'string', const: 'search-request' },
        data: {
          type: 'object',
          required: ['query', 'requestId'],
          properties: {
            query: { type: 'object' },
            requestId: { type: 'string' },
            userId: { type: 'string' },
            sessionId: { type: 'string' },
            preferences: { type: 'object' },
            filters: { type: 'object' }
          }
        }
      }
    });
    
    // Candidate event schema
    this.registerSchema('candidates-generated', {
      type: 'object',
      required: ['type', 'data'],
      properties: {
        type: { type: 'string', const: 'candidates-generated' },
        data: {
          type: 'object',
          required: ['candidates', 'requestId'],
          properties: {
            candidates: { type: 'array' },
            requestId: { type: 'string' },
            source: { type: 'string' },
            count: { type: 'number' },
            processingTime: { type: 'number' }
          }
        }
      }
    });
    
    // Error event schema
    this.registerSchema('error-occurred', {
      type: 'object',
      required: ['type', 'data'],
      properties: {
        type: { type: 'string', const: 'error-occurred' },
        data: {
          type: 'object',
          required: ['error', 'source'],
          properties: {
            error: { type: 'string' },
            source: { type: 'string' },
            stack: { type: 'string' },
            context: { type: 'object' },
            severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] }
          }
        }
      }
    });
    
    // System event schema
    this.registerSchema('system-event', {
      type: 'object',
      required: ['type', 'data'],
      properties: {
        type: { type: 'string', pattern: '^system-' },
        data: {
          type: 'object',
          required: ['action'],
          properties: {
            action: { type: 'string' },
            component: { type: 'string' },
            status: { type: 'string' },
            details: { type: 'object' }
          }
        }
      }
    });
  }

  // Schema Management
  registerSchema(eventType, schema) {
    this.eventSchemas.set(eventType, schema);
    logger.debug(`Registered schema for event type: ${eventType}`);
  }

  validateEvent(event) {
    // Check base schema first
    const baseSchema = this.eventSchemas.get('base-event');
    if (!this.validateAgainstSchema(event, baseSchema)) {
      return { valid: false, error: 'Event does not match base schema' };
    }
    
    // Check specific schema if available
    const specificSchema = this.eventSchemas.get(event.type);
    if (specificSchema && !this.validateAgainstSchema(event, specificSchema)) {
      return { valid: false, error: `Event does not match schema for type: ${event.type}` };
    }
    
    return { valid: true };
  }

  validateAgainstSchema(data, schema) {
    // Simple schema validation - in production use ajv or similar
    try {
      if (schema.type === 'object') {
        if (typeof data !== 'object' || data === null) {
          return false;
        }
        
        // Check required properties
        if (schema.required) {
          for (const prop of schema.required) {
            if (!(prop in data)) {
              return false;
            }
          }
        }
        
        // Check property types
        if (schema.properties) {
          for (const [prop, propSchema] of Object.entries(schema.properties)) {
            if (prop in data) {
              if (!this.validateAgainstSchema(data[prop], propSchema)) {
                return false;
              }
            }
          }
        }
      }
      
      if (schema.type === 'string') {
        if (typeof data !== 'string') {
          return false;
        }
        
        if (schema.const && data !== schema.const) {
          return false;
        }
        
        if (schema.pattern && !new RegExp(schema.pattern).test(data)) {
          return false;
        }
        
        if (schema.enum && !schema.enum.includes(data)) {
          return false;
        }
      }
      
      if (schema.type === 'number') {
        if (typeof data !== 'number') {
          return false;
        }
      }
      
      if (schema.type === 'array') {
        if (!Array.isArray(data)) {
          return false;
        }
        
        if (schema.items) {
          for (const item of data) {
            if (!this.validateAgainstSchema(item, schema.items)) {
              return false;
            }
          }
        }
      }
      
      return true;
    } catch (error) {
      logger.error('Schema validation error:', error);
      return false;
    }
  }

  // Enhanced Event Emission
  emitEvent(type, data, options = {}) {
    const event = this.createEvent(type, data, options);
    return this.processEvent(event);
  }

  createEvent(type, data, options = {}) {
    const event = {
      id: options.id || uuidv4(),
      type,
      data,
      timestamp: options.timestamp || Date.now(),
      source: options.source || 'unknown',
      priority: options.priority || 'medium',
      tags: options.tags || [],
      metadata: options.metadata || {},
      retryCount: 0,
      maxRetries: options.maxRetries || 3
    };
    
    return event;
  }

  async processEvent(event) {
    const startTime = Date.now();
    
    try {
      // Validate event
      const validation = this.validateEvent(event);
      if (!validation.valid) {
        throw new Error(`Event validation failed: ${validation.error}`);
      }
      
      // Check circuit breaker
      if (this.circuitBreaker.isOpen) {
        if (Date.now() - this.circuitBreaker.lastFailureTime > this.circuitBreaker.timeout) {
          this.circuitBreaker.isOpen = false;
          this.circuitBreaker.failureCount = 0;
          logger.info('Circuit breaker closed - resuming event processing');
        } else {
          throw new Error('Circuit breaker is open - event processing suspended');
        }
      }
      
      // Apply middleware
      let processedEvent = event;
      for (const middleware of this.middleware) {
        processedEvent = await middleware(processedEvent);
        if (!processedEvent) {
          logger.debug(`Event ${event.id} filtered out by middleware`);
          this.metrics.filteredEvents++;
          return false;
        }
      }
      
      // Apply filters
      if (!this.applyFilters(processedEvent)) {
        logger.debug(`Event ${event.id} filtered out`);
        this.metrics.filteredEvents++;
        return false;
      }
      
      // Apply transformers
      processedEvent = await this.applyTransformers(processedEvent);
      
      // Store event if persistence is enabled
      if (this.config.eventPersistence) {
        this.storeEvent(processedEvent);
      }
      
      // Route event
      await this.routeEvent(processedEvent);
      
      // Emit to listeners
      await this.emitToListeners(processedEvent);
      
      // Update metrics
      this.updateMetrics(processedEvent, Date.now() - startTime, true);
      
      return true;
      
    } catch (error) {
      await this.handleEventError(event, error);
      this.updateMetrics(event, Date.now() - startTime, false);
      return false;
    }
  }

  // Middleware Management
  use(middleware) {
    if (typeof middleware !== 'function') {
      throw new Error('Middleware must be a function');
    }
    
    this.middleware.push(middleware);
    logger.debug('Added event middleware');
  }

  // Filter Management
  addFilter(name, filterFn) {
    this.filters.set(name, filterFn);
    logger.debug(`Added event filter: ${name}`);
  }

  removeFilter(name) {
    return this.filters.delete(name);
  }

  applyFilters(event) {
    for (const [name, filterFn] of this.filters) {
      try {
        if (!filterFn(event)) {
          logger.debug(`Event ${event.id} filtered by ${name}`);
          return false;
        }
      } catch (error) {
        logger.error(`Filter ${name} error:`, error);
        // Continue with other filters
      }
    }
    return true;
  }

  // Transformer Management
  addTransformer(name, transformerFn) {
    this.transformers.set(name, transformerFn);
    logger.debug(`Added event transformer: ${name}`);
  }

  removeTransformer(name) {
    return this.transformers.delete(name);
  }

  async applyTransformers(event) {
    let transformedEvent = event;
    
    for (const [name, transformerFn] of this.transformers) {
      try {
        const result = await transformerFn(transformedEvent);
        if (result) {
          transformedEvent = result;
          this.metrics.transformedEvents++;
          logger.debug(`Event ${event.id} transformed by ${name}`);
        }
      } catch (error) {
        logger.error(`Transformer ${name} error:`, error);
        // Continue with original event
      }
    }
    
    return transformedEvent;
  }

  // Routing Management
  addRoute(pattern, handler) {
    if (!this.routes.has(pattern)) {
      this.routes.set(pattern, []);
    }
    
    this.routes.get(pattern).push(handler);
    logger.debug(`Added event route for pattern: ${pattern}`);
  }

  removeRoute(pattern, handler) {
    const handlers = this.routes.get(pattern);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
        if (handlers.length === 0) {
          this.routes.delete(pattern);
        }
        return true;
      }
    }
    return false;
  }

  async routeEvent(event) {
    for (const [pattern, handlers] of this.routes) {
      if (this.matchesPattern(event, pattern)) {
        for (const handler of handlers) {
          try {
            await handler(event);
            this.metrics.routedEvents++;
          } catch (error) {
            logger.error(`Route handler error for pattern ${pattern}:`, error);
          }
        }
      }
    }
  }

  matchesPattern(event, pattern) {
    // Simple pattern matching - can be enhanced
    if (pattern === '*') {
      return true;
    }
    
    if (pattern.startsWith('type:')) {
      const expectedType = pattern.substring(5);
      return event.type === expectedType || event.type.startsWith(expectedType);
    }
    
    if (pattern.startsWith('source:')) {
      const expectedSource = pattern.substring(7);
      return event.source === expectedSource;
    }
    
    if (pattern.startsWith('tag:')) {
      const expectedTag = pattern.substring(4);
      return event.tags && event.tags.includes(expectedTag);
    }
    
    if (pattern.startsWith('priority:')) {
      const expectedPriority = pattern.substring(9);
      return event.priority === expectedPriority;
    }
    
    // Regex pattern
    if (pattern.startsWith('/') && pattern.endsWith('/')) {
      const regex = new RegExp(pattern.slice(1, -1));
      return regex.test(event.type);
    }
    
    return event.type === pattern;
  }

  // Enhanced Subscription Management
  subscribe(eventType, listener, options = {}) {
    const subscriptionId = uuidv4();
    const subscription = {
      id: subscriptionId,
      eventType,
      listener,
      options,
      createdAt: Date.now(),
      eventCount: 0,
      lastEventAt: null,
      active: true
    };
    
    this.subscriptions.set(subscriptionId, subscription);
    
    // Add to EventEmitter
    super.on(eventType, listener);
    
    logger.debug(`Added subscription ${subscriptionId} for event type: ${eventType}`);
    
    return subscriptionId;
  }

  unsubscribe(subscriptionId) {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) {
      return false;
    }
    
    // Remove from EventEmitter
    super.removeListener(subscription.eventType, subscription.listener);
    
    // Remove from subscriptions
    this.subscriptions.delete(subscriptionId);
    
    logger.debug(`Removed subscription ${subscriptionId}`);
    return true;
  }

  // Pattern-based subscriptions
  subscribePattern(pattern, listener, options = {}) {
    const patternId = uuidv4();
    const patternSub = {
      id: patternId,
      pattern,
      listener,
      options,
      createdAt: Date.now(),
      eventCount: 0,
      lastEventAt: null,
      active: true
    };
    
    this.patterns.set(patternId, patternSub);
    
    logger.debug(`Added pattern subscription ${patternId} for pattern: ${pattern}`);
    
    return patternId;
  }

  unsubscribePattern(patternId) {
    const removed = this.patterns.delete(patternId);
    if (removed) {
      logger.debug(`Removed pattern subscription ${patternId}`);
    }
    return removed;
  }

  async emitToListeners(event) {
    // Emit to regular listeners
    super.emit(event.type, event);
    
    // Emit to pattern listeners
    for (const [patternId, patternSub] of this.patterns) {
      if (patternSub.active && this.matchesPattern(event, patternSub.pattern)) {
        try {
          await patternSub.listener(event);
          patternSub.eventCount++;
          patternSub.lastEventAt = Date.now();
        } catch (error) {
          logger.error(`Pattern listener error for ${patternId}:`, error);
        }
      }
    }
    
    // Update subscription metrics
    for (const subscription of this.subscriptions.values()) {
      if (subscription.eventType === event.type) {
        subscription.eventCount++;
        subscription.lastEventAt = Date.now();
      }
    }
  }

  // Event Storage
  storeEvent(event) {
    this.eventStore.push({
      ...event,
      storedAt: Date.now()
    });
    
    // Maintain max size
    if (this.eventStore.length > this.maxStoredEvents) {
      this.eventStore.shift();
    }
  }

  getStoredEvents(filter = {}) {
    let events = [...this.eventStore];
    
    if (filter.type) {
      events = events.filter(e => e.type === filter.type);
    }
    
    if (filter.source) {
      events = events.filter(e => e.source === filter.source);
    }
    
    if (filter.since) {
      events = events.filter(e => e.timestamp >= filter.since);
    }
    
    if (filter.limit) {
      events = events.slice(-filter.limit);
    }
    
    return events;
  }

  // Priority Queue Processing
  startEventProcessing() {
    setInterval(() => {
      this.processEventQueues();
    }, 100); // Process every 100ms
  }

  async processEventQueues() {
    if (this.isProcessing) {
      return;
    }
    
    this.isProcessing = true;
    
    try {
      // Process in priority order
      const priorities = ['critical', 'high', 'medium', 'low'];
      
      for (const priority of priorities) {
        const queue = this.eventQueues[priority];
        
        while (queue.length > 0) {
          const event = queue.shift();
          await this.processEvent(event);
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  queueEvent(event) {
    const priority = event.priority || 'medium';
    this.eventQueues[priority].push(event);
  }

  // Error Handling
  addErrorHandler(eventType, handler) {
    if (!this.errorHandlers.has(eventType)) {
      this.errorHandlers.set(eventType, []);
    }
    
    this.errorHandlers.get(eventType).push(handler);
    logger.debug(`Added error handler for event type: ${eventType}`);
  }

  async handleEventError(event, error) {
    logger.error(`Event processing error for ${event.type}:`, error);
    
    // Update circuit breaker
    this.circuitBreaker.failureCount++;
    this.circuitBreaker.lastFailureTime = Date.now();
    
    if (this.circuitBreaker.failureCount >= this.circuitBreaker.threshold) {
      this.circuitBreaker.isOpen = true;
      logger.warn('Circuit breaker opened due to high failure rate');
    }
    
    // Try specific error handlers
    const handlers = this.errorHandlers.get(event.type) || [];
    const globalHandlers = this.errorHandlers.get('*') || [];
    
    for (const handler of [...handlers, ...globalHandlers]) {
      try {
        await handler(event, error);
      } catch (handlerError) {
        logger.error('Error handler failed:', handlerError);
      }
    }
    
    // Retry logic
    if (event.retryCount < event.maxRetries) {
      event.retryCount++;
      
      // Exponential backoff
      const delay = Math.pow(2, event.retryCount) * 1000;
      
      setTimeout(() => {
        logger.info(`Retrying event ${event.id} (attempt ${event.retryCount})`);
        this.processEvent(event);
      }, delay);
    } else {
      // Send to dead letter queue
      this.deadLetterQueue.push({
        event,
        error: error.message,
        timestamp: Date.now()
      });
      
      logger.warn(`Event ${event.id} sent to dead letter queue after ${event.retryCount} retries`);
    }
  }

  // Metrics and Monitoring
  updateMetrics(event, processingTime, success) {
    this.metrics.totalEvents++;
    
    if (success) {
      this.metrics.successfulEvents++;
    } else {
      this.metrics.failedEvents++;
      
      // Track errors by type
      const errorCount = this.metrics.errorsByType.get(event.type) || 0;
      this.metrics.errorsByType.set(event.type, errorCount + 1);
    }
    
    // Update average processing time
    this.metrics.averageProcessingTime = 
      (this.metrics.averageProcessingTime + processingTime) / 2;
    
    // Track events by type
    const typeCount = this.metrics.eventsByType.get(event.type) || 0;
    this.metrics.eventsByType.set(event.type, typeCount + 1);
  }

  getMetrics() {
    return {
      ...this.metrics,
      uptime: Date.now() - this.startTime,
      activeSubscriptions: this.subscriptions.size,
      patternSubscriptions: this.patterns.size,
      storedEvents: this.eventStore.length,
      deadLetterQueueSize: this.deadLetterQueue.length,
      circuitBreakerStatus: this.circuitBreaker.isOpen ? 'open' : 'closed',
      queueSizes: {
        critical: this.eventQueues.critical.length,
        high: this.eventQueues.high.length,
        medium: this.eventQueues.medium.length,
        low: this.eventQueues.low.length
      }
    };
  }

  // Health Check
  getHealthStatus() {
    const metrics = this.getMetrics();
    const issues = [];
    
    // Check failure rate
    const failureRate = metrics.totalEvents > 0 ? 
      metrics.failedEvents / metrics.totalEvents : 0;
    
    if (failureRate > 0.1) {
      issues.push('high-failure-rate');
    }
    
    // Check circuit breaker
    if (this.circuitBreaker.isOpen) {
      issues.push('circuit-breaker-open');
    }
    
    // Check queue sizes
    const totalQueueSize = Object.values(metrics.queueSizes)
      .reduce((sum, size) => sum + size, 0);
    
    if (totalQueueSize > 1000) {
      issues.push('high-queue-backlog');
    }
    
    // Check dead letter queue
    if (metrics.deadLetterQueueSize > 100) {
      issues.push('high-dead-letter-queue');
    }
    
    return {
      status: issues.length === 0 ? 'healthy' : 'degraded',
      issues,
      metrics,
      timestamp: Date.now()
    };
  }

  // Utility Methods
  clearEventStore() {
    this.eventStore = [];
    logger.info('Event store cleared');
  }

  clearDeadLetterQueue() {
    const count = this.deadLetterQueue.length;
    this.deadLetterQueue = [];
    logger.info(`Cleared ${count} events from dead letter queue`);
    return count;
  }

  getDeadLetterEvents() {
    return [...this.deadLetterQueue];
  }

  reprocessDeadLetterEvent(index) {
    if (index >= 0 && index < this.deadLetterQueue.length) {
      const deadEvent = this.deadLetterQueue.splice(index, 1)[0];
      deadEvent.event.retryCount = 0; // Reset retry count
      
      logger.info(`Reprocessing dead letter event ${deadEvent.event.id}`);
      return this.processEvent(deadEvent.event);
    }
    
    return false;
  }

  // Batch Operations
  emitBatch(events) {
    const results = [];
    
    for (const eventData of events) {
      try {
        const result = this.emitEvent(eventData.type, eventData.data, eventData.options);
        results.push({ success: true, result });
      } catch (error) {
        results.push({ success: false, error: error.message });
      }
    }
    
    return results;
  }

  // Event Replay
  replayEvents(filter = {}, targetListener = null) {
    const events = this.getStoredEvents(filter);
    
    logger.info(`Replaying ${events.length} events`);
    
    for (const event of events) {
      if (targetListener) {
        try {
          targetListener(event);
        } catch (error) {
          logger.error('Event replay error:', error);
        }
      } else {
        // Re-emit the event
        this.processEvent(event);
      }
    }
    
    return events.length;
  }

  // Cleanup and Shutdown
  async shutdown() {
    logger.info('Shutting down Enhanced Event Bus');
    
    // Process remaining events in queues
    await this.processEventQueues();
    
    // Clear all data structures
    this.eventSchemas.clear();
    this.middleware = [];
    this.filters.clear();
    this.transformers.clear();
    this.routes.clear();
    this.subscriptions.clear();
    this.patterns.clear();
    this.errorHandlers.clear();
    
    // Clear queues
    Object.values(this.eventQueues).forEach(queue => queue.length = 0);
    
    // Clear storage
    this.eventStore = [];
    this.deadLetterQueue = [];
    
    // Remove all listeners
    this.removeAllListeners();
    
    logger.info('Enhanced Event Bus shutdown complete');
  }
}

// Event Builder Helper
export class EventBuilder {
  constructor(type) {
    this.event = {
      type,
      data: {},
      timestamp: Date.now(),
      priority: 'medium',
      tags: [],
      metadata: {}
    };
  }

  withData(data) {
    this.event.data = { ...this.event.data, ...data };
    return this;
  }

  withSource(source) {
    this.event.source = source;
    return this;
  }

  withPriority(priority) {
    this.event.priority = priority;
    return this;
  }

  withTags(...tags) {
    this.event.tags = [...this.event.tags, ...tags];
    return this;
  }

  withMetadata(metadata) {
    this.event.metadata = { ...this.event.metadata, ...metadata };
    return this;
  }

  withId(id) {
    this.event.id = id;
    return this;
  }

  withTimestamp(timestamp) {
    this.event.timestamp = timestamp;
    return this;
  }

  build() {
    return { ...this.event };
  }
}

// Event Middleware Examples
export const eventMiddleware = {
  // Logging middleware
  logger: (event) => {
    logger.debug(`Processing event: ${event.type}`, {
      id: event.id,
      source: event.source,
      priority: event.priority
    });
    return event;
  },
  
  // Rate limiting middleware
  rateLimiter: (maxEventsPerSecond = 100) => {
    const eventCounts = new Map();
    
    return (event) => {
      const now = Date.now();
      const windowStart = Math.floor(now / 1000) * 1000;
      
      const key = `${event.source || 'unknown'}:${windowStart}`;
      const count = eventCounts.get(key) || 0;
      
      if (count >= maxEventsPerSecond) {
        logger.warn(`Rate limit exceeded for source: ${event.source}`);
        return null; // Filter out event
      }
      
      eventCounts.set(key, count + 1);
      
      // Cleanup old entries
      for (const [k] of eventCounts) {
        const [, timestamp] = k.split(':');
        if (parseInt(timestamp) < now - 5000) { // 5 seconds ago
          eventCounts.delete(k);
        }
      }
      
      return event;
    };
  },
  
  // Enrichment middleware
  enricher: (event) => {
    event.metadata.processedAt = Date.now();
    event.metadata.nodeId = process.env.NODE_ID || 'unknown';
    event.metadata.version = '1.0.0';
    return event;
  },
  
  // Deduplication middleware
  deduplicator: (windowMs = 5000) => {
    const seenEvents = new Map();
    
    return (event) => {
      const key = `${event.type}:${JSON.stringify(event.data)}`;
      const now = Date.now();
      
      if (seenEvents.has(key)) {
        const lastSeen = seenEvents.get(key);
        if (now - lastSeen < windowMs) {
          logger.debug(`Duplicate event filtered: ${event.id}`);
          return null;
        }
      }
      
      seenEvents.set(key, now);
      
      // Cleanup old entries
      for (const [k, timestamp] of seenEvents) {
        if (now - timestamp > windowMs * 2) {
          seenEvents.delete(k);
        }
      }
      
      return event;
    };
  }
};

// Export default instance
export default new EnhancedEventBus();