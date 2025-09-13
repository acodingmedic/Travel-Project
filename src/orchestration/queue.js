import winston from 'winston';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
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

export class QueueManager extends EventEmitter {
  constructor(eventBus) {
    super();
    this.eventBus = eventBus;
    this.config = getSystemConfig();
    
    // Queue storage
    this.queues = new Map();
    
    // Queue configurations
    this.queueConfigs = {
      'search-requests': {
        name: 'Search Requests',
        priority: 'high',
        maxSize: 1000,
        processingTimeout: 300000, // 5 minutes
        retryAttempts: 3,
        retryDelay: 5000,
        deadLetterQueue: 'search-requests-dlq',
        batchSize: 10,
        concurrency: 5,
        rateLimiting: {
          enabled: true,
          maxPerSecond: 10,
          maxPerMinute: 100
        },
        persistence: true
      },
      
      'candidate-generation': {
        name: 'Candidate Generation',
        priority: 'high',
        maxSize: 500,
        processingTimeout: 120000, // 2 minutes
        retryAttempts: 2,
        retryDelay: 3000,
        deadLetterQueue: 'candidate-generation-dlq',
        batchSize: 5,
        concurrency: 3,
        rateLimiting: {
          enabled: true,
          maxPerSecond: 5,
          maxPerMinute: 50
        },
        persistence: true
      },
      
      'validation-tasks': {
        name: 'Validation Tasks',
        priority: 'medium',
        maxSize: 800,
        processingTimeout: 90000, // 1.5 minutes
        retryAttempts: 2,
        retryDelay: 2000,
        deadLetterQueue: 'validation-tasks-dlq',
        batchSize: 8,
        concurrency: 4,
        rateLimiting: {
          enabled: true,
          maxPerSecond: 8,
          maxPerMinute: 80
        },
        persistence: false
      },
      
      'ranking-tasks': {
        name: 'Ranking Tasks',
        priority: 'medium',
        maxSize: 600,
        processingTimeout: 60000, // 1 minute
        retryAttempts: 2,
        retryDelay: 2000,
        deadLetterQueue: 'ranking-tasks-dlq',
        batchSize: 6,
        concurrency: 3,
        rateLimiting: {
          enabled: true,
          maxPerSecond: 6,
          maxPerMinute: 60
        },
        persistence: false
      },
      
      'selection-tasks': {
        name: 'Selection Tasks',
        priority: 'medium',
        maxSize: 400,
        processingTimeout: 45000, // 45 seconds
        retryAttempts: 2,
        retryDelay: 1500,
        deadLetterQueue: 'selection-tasks-dlq',
        batchSize: 4,
        concurrency: 2,
        rateLimiting: {
          enabled: true,
          maxPerSecond: 4,
          maxPerMinute: 40
        },
        persistence: false
      },
      
      'enrichment-tasks': {
        name: 'Enrichment Tasks',
        priority: 'low',
        maxSize: 300,
        processingTimeout: 180000, // 3 minutes
        retryAttempts: 3,
        retryDelay: 5000,
        deadLetterQueue: 'enrichment-tasks-dlq',
        batchSize: 3,
        concurrency: 2,
        rateLimiting: {
          enabled: true,
          maxPerSecond: 3,
          maxPerMinute: 30
        },
        persistence: true
      },
      
      'output-generation': {
        name: 'Output Generation',
        priority: 'high',
        maxSize: 200,
        processingTimeout: 60000, // 1 minute
        retryAttempts: 2,
        retryDelay: 2000,
        deadLetterQueue: 'output-generation-dlq',
        batchSize: 2,
        concurrency: 2,
        rateLimiting: {
          enabled: true,
          maxPerSecond: 2,
          maxPerMinute: 20
        },
        persistence: true
      },
      
      'booking-requests': {
        name: 'Booking Requests',
        priority: 'critical',
        maxSize: 100,
        processingTimeout: 300000, // 5 minutes
        retryAttempts: 3,
        retryDelay: 10000,
        deadLetterQueue: 'booking-requests-dlq',
        batchSize: 1,
        concurrency: 2,
        rateLimiting: {
          enabled: true,
          maxPerSecond: 1,
          maxPerMinute: 10
        },
        persistence: true
      },
      
      'notifications': {
        name: 'Notifications',
        priority: 'low',
        maxSize: 1000,
        processingTimeout: 30000, // 30 seconds
        retryAttempts: 2,
        retryDelay: 1000,
        deadLetterQueue: 'notifications-dlq',
        batchSize: 10,
        concurrency: 3,
        rateLimiting: {
          enabled: true,
          maxPerSecond: 10,
          maxPerMinute: 100
        },
        persistence: false
      },
      
      'telemetry-events': {
        name: 'Telemetry Events',
        priority: 'low',
        maxSize: 2000,
        processingTimeout: 15000, // 15 seconds
        retryAttempts: 1,
        retryDelay: 500,
        deadLetterQueue: 'telemetry-events-dlq',
        batchSize: 20,
        concurrency: 2,
        rateLimiting: {
          enabled: false
        },
        persistence: false
      }
    };
    
    // Processing state
    this.processors = new Map();
    this.rateLimiters = new Map();
    this.deadLetterQueues = new Map();
    
    // Statistics
    this.queueStats = {
      totalEnqueued: 0,
      totalProcessed: 0,
      totalFailed: 0,
      totalRetried: 0,
      totalDeadLettered: 0,
      averageProcessingTime: 0,
      queueStats: {},
      processingStats: {
        activeProcessors: 0,
        totalProcessors: 0,
        averageConcurrency: 0
      }
    };
    
    // Initialize queue stats
    Object.keys(this.queueConfigs).forEach(queueName => {
      this.queueStats.queueStats[queueName] = {
        enqueued: 0,
        processed: 0,
        failed: 0,
        retried: 0,
        deadLettered: 0,
        currentSize: 0,
        averageWaitTime: 0,
        averageProcessingTime: 0,
        rateLimitHits: 0
      };
    });
    
    this.startTime = Date.now();
  }

  async initialize() {
    logger.info('Initializing Queue Manager');
    
    // Initialize all queues
    for (const [queueName, config] of Object.entries(this.queueConfigs)) {
      await this.initializeQueue(queueName, config);
    }
    
    // Subscribe to queue events
    this.eventBus.on('enqueue-message', this.handleEnqueueMessage.bind(this));
    this.eventBus.on('process-queue', this.handleProcessQueue.bind(this));
    this.eventBus.on('pause-queue', this.handlePauseQueue.bind(this));
    this.eventBus.on('resume-queue', this.handleResumeQueue.bind(this));
    this.eventBus.on('clear-queue', this.handleClearQueue.bind(this));
    
    // Start maintenance tasks
    this.startMaintenanceTasks();
    
    logger.info('Queue Manager initialized');
  }

  async initializeQueue(queueName, config) {
    logger.info(`Initializing queue: ${queueName}`);
    
    // Create queue structure
    const queue = {
      name: queueName,
      config,
      messages: [],
      processing: new Map(),
      paused: false,
      created: Date.now(),
      lastProcessed: null,
      processingStats: {
        totalProcessed: 0,
        totalFailed: 0,
        averageProcessingTime: 0,
        lastProcessingTime: null
      }
    };
    
    this.queues.set(queueName, queue);
    
    // Initialize rate limiter if enabled
    if (config.rateLimiting?.enabled) {
      this.rateLimiters.set(queueName, {
        tokens: config.rateLimiting.maxPerSecond,
        maxTokens: config.rateLimiting.maxPerSecond,
        refillRate: config.rateLimiting.maxPerSecond,
        lastRefill: Date.now(),
        minuteTokens: config.rateLimiting.maxPerMinute,
        maxMinuteTokens: config.rateLimiting.maxPerMinute,
        minuteWindow: Date.now()
      });
    }
    
    // Initialize dead letter queue
    if (config.deadLetterQueue) {
      const dlqConfig = {
        ...config,
        name: config.deadLetterQueue,
        priority: 'low',
        retryAttempts: 0,
        deadLetterQueue: null,
        rateLimiting: { enabled: false }
      };
      
      const dlq = {
        name: config.deadLetterQueue,
        config: dlqConfig,
        messages: [],
        processing: new Map(),
        paused: false,
        created: Date.now(),
        lastProcessed: null,
        processingStats: {
          totalProcessed: 0,
          totalFailed: 0,
          averageProcessingTime: 0,
          lastProcessingTime: null
        }
      };
      
      this.deadLetterQueues.set(config.deadLetterQueue, dlq);
    }
    
    // Start queue processor
    await this.startQueueProcessor(queueName);
  }

  async startQueueProcessor(queueName) {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }
    
    const config = queue.config;
    const processorId = uuidv4();
    
    const processor = {
      id: processorId,
      queueName,
      concurrency: config.concurrency,
      batchSize: config.batchSize,
      active: true,
      processing: 0,
      totalProcessed: 0,
      startTime: Date.now(),
      lastActivity: Date.now()
    };
    
    this.processors.set(processorId, processor);
    this.queueStats.processingStats.totalProcessors++;
    
    // Start processing loop
    this.processQueueLoop(processorId);
    
    logger.info(`Started processor ${processorId} for queue ${queueName}`);
  }

  async processQueueLoop(processorId) {
    const processor = this.processors.get(processorId);
    if (!processor || !processor.active) {
      return;
    }
    
    const queue = this.queues.get(processor.queueName);
    if (!queue || queue.paused) {
      // Wait and retry
      setTimeout(() => this.processQueueLoop(processorId), 1000);
      return;
    }
    
    try {
      // Check rate limiting
      if (!this.checkRateLimit(processor.queueName)) {
        this.queueStats.queueStats[processor.queueName].rateLimitHits++;
        setTimeout(() => this.processQueueLoop(processorId), 100);
        return;
      }
      
      // Get messages to process
      const messages = this.getMessagesForProcessing(queue, processor.batchSize);
      
      if (messages.length === 0) {
        // No messages to process, wait and retry
        setTimeout(() => this.processQueueLoop(processorId), 1000);
        return;
      }
      
      // Process messages concurrently
      const processingPromises = messages.map(message => 
        this.processMessage(queue, message, processorId)
      );
      
      processor.processing += messages.length;
      this.queueStats.processingStats.activeProcessors++;
      
      await Promise.allSettled(processingPromises);
      
      processor.processing -= messages.length;
      processor.totalProcessed += messages.length;
      processor.lastActivity = Date.now();
      
      if (processor.processing === 0) {
        this.queueStats.processingStats.activeProcessors--;
      }
      
    } catch (error) {
      logger.error(`Error in processing loop for ${processorId}:`, error);
    }
    
    // Continue processing
    setImmediate(() => this.processQueueLoop(processorId));
  }

  getMessagesForProcessing(queue, batchSize) {
    const availableMessages = queue.messages.filter(msg => 
      !queue.processing.has(msg.id) && 
      (!msg.delayUntil || msg.delayUntil <= Date.now())
    );
    
    // Sort by priority and timestamp
    availableMessages.sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      const aPriority = priorityOrder[a.priority] || 2;
      const bPriority = priorityOrder[b.priority] || 2;
      
      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }
      
      return a.timestamp - b.timestamp;
    });
    
    return availableMessages.slice(0, batchSize);
  }

  async processMessage(queue, message, processorId) {
    const startTime = Date.now();
    
    try {
      logger.debug(`Processing message ${message.id} from queue ${queue.name}`);
      
      // Mark message as processing
      queue.processing.set(message.id, {
        processorId,
        startTime,
        attempts: message.attempts + 1
      });
      
      message.attempts++;
      message.lastAttempt = startTime;
      
      // Set processing timeout
      const timeoutId = setTimeout(() => {
        this.handleMessageTimeout(queue, message);
      }, queue.config.processingTimeout);
      
      // Process the message
      const result = await this.executeMessage(queue, message);
      
      // Clear timeout
      clearTimeout(timeoutId);
      
      // Handle successful processing
      await this.handleMessageSuccess(queue, message, result, startTime);
      
    } catch (error) {
      logger.error(`Error processing message ${message.id}:`, error);
      await this.handleMessageError(queue, message, error, startTime);
    }
  }

  async executeMessage(queue, message) {
    // Emit processing event
    this.eventBus.emit('message-processing', {
      queueName: queue.name,
      messageId: message.id,
      messageType: message.type,
      data: message.data,
      timestamp: Date.now()
    });
    
    // Route message based on type
    switch (message.type) {
      case 'search-request':
        return await this.processSearchRequest(message);
      case 'candidate-generation':
        return await this.processCandidateGeneration(message);
      case 'validation-task':
        return await this.processValidationTask(message);
      case 'ranking-task':
        return await this.processRankingTask(message);
      case 'selection-task':
        return await this.processSelectionTask(message);
      case 'enrichment-task':
        return await this.processEnrichmentTask(message);
      case 'output-generation':
        return await this.processOutputGeneration(message);
      case 'booking-request':
        return await this.processBookingRequest(message);
      case 'notification':
        return await this.processNotification(message);
      case 'telemetry-event':
        return await this.processTelemetryEvent(message);
      default:
        throw new Error(`Unknown message type: ${message.type}`);
    }
  }

  async handleMessageSuccess(queue, message, result, startTime) {
    const processingTime = Date.now() - startTime;
    
    logger.debug(`Message ${message.id} processed successfully in ${processingTime}ms`);
    
    // Remove from processing and queue
    queue.processing.delete(message.id);
    const messageIndex = queue.messages.findIndex(m => m.id === message.id);
    if (messageIndex >= 0) {
      queue.messages.splice(messageIndex, 1);
    }
    
    // Update statistics
    this.updateProcessingStats(queue, processingTime, true);
    this.queueStats.totalProcessed++;
    this.queueStats.queueStats[queue.name].processed++;
    this.queueStats.queueStats[queue.name].currentSize = queue.messages.length;
    
    // Emit success event
    this.eventBus.emit('message-processed', {
      queueName: queue.name,
      messageId: message.id,
      messageType: message.type,
      result,
      processingTime,
      attempts: message.attempts,
      timestamp: Date.now()
    });
  }

  async handleMessageError(queue, message, error, startTime) {
    const processingTime = Date.now() - startTime;
    
    logger.error(`Message ${message.id} processing failed:`, error);
    
    // Remove from processing
    queue.processing.delete(message.id);
    
    // Update statistics
    this.updateProcessingStats(queue, processingTime, false);
    this.queueStats.totalFailed++;
    this.queueStats.queueStats[queue.name].failed++;
    
    // Check if we should retry
    if (message.attempts < queue.config.retryAttempts) {
      // Schedule retry
      message.delayUntil = Date.now() + queue.config.retryDelay;
      message.errors.push({
        error: error.message,
        timestamp: Date.now(),
        attempt: message.attempts
      });
      
      this.queueStats.totalRetried++;
      this.queueStats.queueStats[queue.name].retried++;
      
      logger.info(`Scheduling retry for message ${message.id} (attempt ${message.attempts + 1})`);
      
      this.eventBus.emit('message-retry-scheduled', {
        queueName: queue.name,
        messageId: message.id,
        messageType: message.type,
        attempt: message.attempts,
        maxAttempts: queue.config.retryAttempts,
        retryDelay: queue.config.retryDelay,
        timestamp: Date.now()
      });
      
    } else {
      // Move to dead letter queue
      await this.moveToDeadLetterQueue(queue, message, error);
    }
  }

  async moveToDeadLetterQueue(queue, message, error) {
    logger.warn(`Moving message ${message.id} to dead letter queue`);
    
    // Remove from main queue
    const messageIndex = queue.messages.findIndex(m => m.id === message.id);
    if (messageIndex >= 0) {
      queue.messages.splice(messageIndex, 1);
    }
    
    // Add final error
    message.errors.push({
      error: error.message,
      timestamp: Date.now(),
      attempt: message.attempts,
      final: true
    });
    
    // Move to dead letter queue if configured
    if (queue.config.deadLetterQueue) {
      const dlq = this.deadLetterQueues.get(queue.config.deadLetterQueue);
      if (dlq) {
        message.deadLetteredAt = Date.now();
        message.originalQueue = queue.name;
        dlq.messages.push(message);
      }
    }
    
    // Update statistics
    this.queueStats.totalDeadLettered++;
    this.queueStats.queueStats[queue.name].deadLettered++;
    this.queueStats.queueStats[queue.name].currentSize = queue.messages.length;
    
    // Emit dead letter event
    this.eventBus.emit('message-dead-lettered', {
      queueName: queue.name,
      messageId: message.id,
      messageType: message.type,
      deadLetterQueue: queue.config.deadLetterQueue,
      attempts: message.attempts,
      errors: message.errors,
      timestamp: Date.now()
    });
  }

  handleMessageTimeout(queue, message) {
    logger.warn(`Message ${message.id} timed out in queue ${queue.name}`);
    
    // Remove from processing
    queue.processing.delete(message.id);
    
    // Handle as error
    this.handleMessageError(queue, message, new Error('Processing timeout'), message.lastAttempt);
  }

  checkRateLimit(queueName) {
    const rateLimiter = this.rateLimiters.get(queueName);
    if (!rateLimiter) {
      return true; // No rate limiting
    }
    
    const now = Date.now();
    
    // Refill tokens based on time passed
    const timePassed = now - rateLimiter.lastRefill;
    const tokensToAdd = Math.floor(timePassed / 1000) * rateLimiter.refillRate;
    
    if (tokensToAdd > 0) {
      rateLimiter.tokens = Math.min(rateLimiter.maxTokens, rateLimiter.tokens + tokensToAdd);
      rateLimiter.lastRefill = now;
    }
    
    // Check minute window
    if (now - rateLimiter.minuteWindow >= 60000) {
      rateLimiter.minuteTokens = rateLimiter.maxMinuteTokens;
      rateLimiter.minuteWindow = now;
    }
    
    // Check if we have tokens available
    if (rateLimiter.tokens > 0 && rateLimiter.minuteTokens > 0) {
      rateLimiter.tokens--;
      rateLimiter.minuteTokens--;
      return true;
    }
    
    return false;
  }

  updateProcessingStats(queue, processingTime, success) {
    const stats = queue.processingStats;
    
    if (success) {
      stats.totalProcessed++;
      
      // Update average processing time
      stats.averageProcessingTime = 
        (stats.averageProcessingTime * (stats.totalProcessed - 1) + processingTime) / 
        stats.totalProcessed;
    } else {
      stats.totalFailed++;
    }
    
    stats.lastProcessingTime = processingTime;
    queue.lastProcessed = Date.now();
    
    // Update global stats
    if (success) {
      this.queueStats.averageProcessingTime = 
        (this.queueStats.averageProcessingTime * (this.queueStats.totalProcessed - 1) + processingTime) / 
        this.queueStats.totalProcessed;
    }
    
    // Update queue-specific stats
    const queueStats = this.queueStats.queueStats[queue.name];
    if (success) {
      queueStats.averageProcessingTime = 
        (queueStats.averageProcessingTime * (queueStats.processed - 1) + processingTime) / 
        queueStats.processed;
    }
  }

  // Message processing implementations
  async processSearchRequest(message) {
    logger.info(`Processing search request: ${message.id}`);
    
    // Emit search request event
    this.eventBus.emit('start-workflow', {
      data: {
        templateName: 'travelPlanning',
        sagaId: message.data.sagaId,
        data: message.data,
        options: message.options || {}
      }
    });
    
    return {
      status: 'workflow-started',
      sagaId: message.data.sagaId,
      timestamp: Date.now()
    };
  }

  async processCandidateGeneration(message) {
    logger.info(`Processing candidate generation: ${message.id}`);
    
    // Emit candidate generation event
    this.eventBus.emit('generate-candidates', { data: message.data });
    
    return {
      status: 'candidates-generation-started',
      sagaId: message.data.sagaId,
      timestamp: Date.now()
    };
  }

  async processValidationTask(message) {
    logger.info(`Processing validation task: ${message.id}`);
    
    // Emit validation event
    this.eventBus.emit('validate-candidates', { data: message.data });
    
    return {
      status: 'validation-started',
      sagaId: message.data.sagaId,
      timestamp: Date.now()
    };
  }

  async processRankingTask(message) {
    logger.info(`Processing ranking task: ${message.id}`);
    
    // Emit ranking event
    this.eventBus.emit('rank-candidates', { data: message.data });
    
    return {
      status: 'ranking-started',
      sagaId: message.data.sagaId,
      timestamp: Date.now()
    };
  }

  async processSelectionTask(message) {
    logger.info(`Processing selection task: ${message.id}`);
    
    // Emit selection event
    this.eventBus.emit('select-candidates', { data: message.data });
    
    return {
      status: 'selection-started',
      sagaId: message.data.sagaId,
      timestamp: Date.now()
    };
  }

  async processEnrichmentTask(message) {
    logger.info(`Processing enrichment task: ${message.id}`);
    
    // Emit enrichment event
    this.eventBus.emit('enrich-candidates', { data: message.data });
    
    return {
      status: 'enrichment-started',
      sagaId: message.data.sagaId,
      timestamp: Date.now()
    };
  }

  async processOutputGeneration(message) {
    logger.info(`Processing output generation: ${message.id}`);
    
    // Emit output generation event
    this.eventBus.emit('generate-output', { data: message.data });
    
    return {
      status: 'output-generation-started',
      sagaId: message.data.sagaId,
      timestamp: Date.now()
    };
  }

  async processBookingRequest(message) {
    logger.info(`Processing booking request: ${message.id}`);
    
    // Start booking workflow
    this.eventBus.emit('start-workflow', {
      data: {
        templateName: 'bookingWorkflow',
        sagaId: message.data.sagaId,
        data: message.data,
        options: message.options || {}
      }
    });
    
    return {
      status: 'booking-workflow-started',
      sagaId: message.data.sagaId,
      timestamp: Date.now()
    };
  }

  async processNotification(message) {
    logger.info(`Processing notification: ${message.id}`);
    
    // Mock notification processing
    await new Promise(resolve => setTimeout(resolve, 100));
    
    return {
      status: 'notification-sent',
      recipient: message.data.recipient,
      type: message.data.type,
      timestamp: Date.now()
    };
  }

  async processTelemetryEvent(message) {
    logger.debug(`Processing telemetry event: ${message.id}`);
    
    // Emit telemetry event
    this.eventBus.emit('telemetry-data', { data: message.data });
    
    return {
      status: 'telemetry-processed',
      eventType: message.data.eventType,
      timestamp: Date.now()
    };
  }

  // Public API methods
  async enqueueMessage(queueName, messageType, data, options = {}) {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }
    
    // Check queue size limit
    if (queue.messages.length >= queue.config.maxSize) {
      throw new Error(`Queue ${queueName} is full (${queue.config.maxSize} messages)`);
    }
    
    // Create message
    const message = {
      id: uuidv4(),
      type: messageType,
      data,
      priority: options.priority || queue.config.priority,
      timestamp: Date.now(),
      enqueueTime: Date.now(),
      attempts: 0,
      maxAttempts: queue.config.retryAttempts,
      errors: [],
      delayUntil: options.delay ? Date.now() + options.delay : null,
      ttl: options.ttl ? Date.now() + options.ttl : null,
      metadata: options.metadata || {},
      options
    };
    
    // Add to queue
    queue.messages.push(message);
    
    // Update statistics
    this.queueStats.totalEnqueued++;
    this.queueStats.queueStats[queueName].enqueued++;
    this.queueStats.queueStats[queueName].currentSize = queue.messages.length;
    
    logger.debug(`Enqueued message ${message.id} to queue ${queueName}`);
    
    // Emit enqueue event
    this.eventBus.emit('message-enqueued', {
      queueName,
      messageId: message.id,
      messageType,
      priority: message.priority,
      timestamp: message.timestamp
    });
    
    return message.id;
  }

  async pauseQueue(queueName) {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }
    
    queue.paused = true;
    
    logger.info(`Queue ${queueName} paused`);
    
    this.eventBus.emit('queue-paused', {
      queueName,
      timestamp: Date.now()
    });
  }

  async resumeQueue(queueName) {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }
    
    queue.paused = false;
    
    logger.info(`Queue ${queueName} resumed`);
    
    this.eventBus.emit('queue-resumed', {
      queueName,
      timestamp: Date.now()
    });
  }

  async clearQueue(queueName) {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }
    
    const clearedCount = queue.messages.length;
    queue.messages = [];
    queue.processing.clear();
    
    // Update statistics
    this.queueStats.queueStats[queueName].currentSize = 0;
    
    logger.info(`Cleared ${clearedCount} messages from queue ${queueName}`);
    
    this.eventBus.emit('queue-cleared', {
      queueName,
      clearedCount,
      timestamp: Date.now()
    });
  }

  // Event handlers
  async handleEnqueueMessage(event) {
    const { queueName, messageType, data, options } = event.data;
    
    try {
      await this.enqueueMessage(queueName, messageType, data, options);
    } catch (error) {
      logger.error('Error handling enqueue message event:', error);
    }
  }

  async handleProcessQueue(event) {
    const { queueName } = event.data;
    
    try {
      await this.resumeQueue(queueName);
    } catch (error) {
      logger.error('Error handling process queue event:', error);
    }
  }

  async handlePauseQueue(event) {
    const { queueName } = event.data;
    
    try {
      await this.pauseQueue(queueName);
    } catch (error) {
      logger.error('Error handling pause queue event:', error);
    }
  }

  async handleResumeQueue(event) {
    const { queueName } = event.data;
    
    try {
      await this.resumeQueue(queueName);
    } catch (error) {
      logger.error('Error handling resume queue event:', error);
    }
  }

  async handleClearQueue(event) {
    const { queueName } = event.data;
    
    try {
      await this.clearQueue(queueName);
    } catch (error) {
      logger.error('Error handling clear queue event:', error);
    }
  }

  // Maintenance tasks
  startMaintenanceTasks() {
    // Clean up expired messages
    setInterval(() => {
      this.cleanupExpiredMessages();
    }, 60000); // Every minute
    
    // Update statistics
    setInterval(() => {
      this.updateQueueStatistics();
    }, 30000); // Every 30 seconds
    
    // Monitor queue health
    setInterval(() => {
      this.monitorQueueHealth();
    }, 60000); // Every minute
    
    // Cleanup inactive processors
    setInterval(() => {
      this.cleanupInactiveProcessors();
    }, 300000); // Every 5 minutes
  }

  cleanupExpiredMessages() {
    const now = Date.now();
    let totalCleaned = 0;
    
    for (const [queueName, queue] of this.queues) {
      const initialLength = queue.messages.length;
      
      queue.messages = queue.messages.filter(message => {
        if (message.ttl && message.ttl < now) {
          return false; // Remove expired message
        }
        return true;
      });
      
      const cleaned = initialLength - queue.messages.length;
      if (cleaned > 0) {
        totalCleaned += cleaned;
        this.queueStats.queueStats[queueName].currentSize = queue.messages.length;
        
        logger.info(`Cleaned ${cleaned} expired messages from queue ${queueName}`);
      }
    }
    
    if (totalCleaned > 0) {
      logger.info(`Total expired messages cleaned: ${totalCleaned}`);
    }
  }

  updateQueueStatistics() {
    // Update processing stats
    const activeProcessors = Array.from(this.processors.values()).filter(p => p.active).length;
    this.queueStats.processingStats.activeProcessors = activeProcessors;
    
    // Calculate average concurrency
    const totalProcessing = Array.from(this.processors.values())
      .reduce((sum, p) => sum + p.processing, 0);
    this.queueStats.processingStats.averageConcurrency = 
      this.queueStats.processingStats.totalProcessors > 0 ? 
      totalProcessing / this.queueStats.processingStats.totalProcessors : 0;
    
    // Update queue-specific wait times
    for (const [queueName, queue] of this.queues) {
      const queueStats = this.queueStats.queueStats[queueName];
      
      if (queue.messages.length > 0) {
        const totalWaitTime = queue.messages.reduce((sum, msg) => {
          return sum + (Date.now() - msg.enqueueTime);
        }, 0);
        
        queueStats.averageWaitTime = totalWaitTime / queue.messages.length;
      } else {
        queueStats.averageWaitTime = 0;
      }
    }
  }

  monitorQueueHealth() {
    for (const [queueName, queue] of this.queues) {
      const config = queue.config;
      const stats = this.queueStats.queueStats[queueName];
      
      // Check queue size
      if (queue.messages.length > config.maxSize * 0.8) {
        this.eventBus.emit('queue-health-warning', {
          queueName,
          issue: 'high-queue-size',
          currentSize: queue.messages.length,
          maxSize: config.maxSize,
          utilization: (queue.messages.length / config.maxSize) * 100,
          timestamp: Date.now()
        });
      }
      
      // Check processing rate
      if (stats.averageWaitTime > config.processingTimeout * 0.5) {
        this.eventBus.emit('queue-health-warning', {
          queueName,
          issue: 'high-wait-time',
          averageWaitTime: stats.averageWaitTime,
          threshold: config.processingTimeout * 0.5,
          timestamp: Date.now()
        });
      }
      
      // Check error rate
      const errorRate = stats.processed > 0 ? (stats.failed / stats.processed) * 100 : 0;
      if (errorRate > 10) { // 10% error rate threshold
        this.eventBus.emit('queue-health-warning', {
          queueName,
          issue: 'high-error-rate',
          errorRate,
          threshold: 10,
          totalProcessed: stats.processed,
          totalFailed: stats.failed,
          timestamp: Date.now()
        });
      }
    }
  }

  cleanupInactiveProcessors() {
    const now = Date.now();
    const inactivityThreshold = 300000; // 5 minutes
    
    let cleanedCount = 0;
    
    for (const [processorId, processor] of this.processors) {
      if (!processor.active || (now - processor.lastActivity) > inactivityThreshold) {
        processor.active = false;
        this.processors.delete(processorId);
        cleanedCount++;
        
        logger.info(`Cleaned up inactive processor ${processorId}`);
      }
    }
    
    if (cleanedCount > 0) {
      this.queueStats.processingStats.totalProcessors -= cleanedCount;
      logger.info(`Cleaned up ${cleanedCount} inactive processors`);
    }
  }

  // Query methods
  getQueueStatus(queueName) {
    const queue = this.queues.get(queueName);
    if (!queue) {
      return null;
    }
    
    const stats = this.queueStats.queueStats[queueName];
    
    return {
      name: queueName,
      config: queue.config,
      currentSize: queue.messages.length,
      processing: queue.processing.size,
      paused: queue.paused,
      stats,
      created: queue.created,
      lastProcessed: queue.lastProcessed
    };
  }

  getAllQueueStatuses() {
    const statuses = {};
    
    for (const queueName of this.queues.keys()) {
      statuses[queueName] = this.getQueueStatus(queueName);
    }
    
    return statuses;
  }

  getProcessorStatuses() {
    return Array.from(this.processors.values()).map(processor => ({
      id: processor.id,
      queueName: processor.queueName,
      active: processor.active,
      processing: processor.processing,
      totalProcessed: processor.totalProcessed,
      uptime: Date.now() - processor.startTime,
      lastActivity: processor.lastActivity
    }));
  }

  getOverallStatistics() {
    return {
      ...this.queueStats,
      totalQueues: this.queues.size,
      totalProcessors: this.processors.size,
      uptime: Date.now() - this.startTime
    };
  }

  getDeadLetterQueueStatus(dlqName) {
    const dlq = this.deadLetterQueues.get(dlqName);
    if (!dlq) {
      return null;
    }
    
    return {
      name: dlqName,
      currentSize: dlq.messages.length,
      messages: dlq.messages.map(msg => ({
        id: msg.id,
        type: msg.type,
        originalQueue: msg.originalQueue,
        attempts: msg.attempts,
        deadLetteredAt: msg.deadLetteredAt,
        errors: msg.errors
      }))
    };
  }

  async shutdown() {
    logger.info('Shutting down Queue Manager');
    
    // Stop all processors
    for (const processor of this.processors.values()) {
      processor.active = false;
    }
    
    // Wait for current processing to complete
    const maxWaitTime = 30000; // 30 seconds
    const startTime = Date.now();
    
    while (this.queueStats.processingStats.activeProcessors > 0 && 
           (Date.now() - startTime) < maxWaitTime) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Clear all processors
    this.processors.clear();
    
    // Update final statistics
    this.updateQueueStatistics();
    
    logger.info('Queue Manager shutdown complete');
  }
}