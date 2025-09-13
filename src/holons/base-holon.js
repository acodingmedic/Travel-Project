import { EventEmitter } from 'events';
import winston from 'winston';

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

export class BaseHolon extends EventEmitter {
  constructor(name, orchestration) {
    super();
    this.name = name;
    this.orchestration = orchestration;
    this.status = 'initializing';
    this.startTime = Date.now();
    this.metrics = {
      messagesProcessed: 0,
      errorsEncountered: 0,
      averageProcessingTime: 0,
      lastActivity: null
    };
    this.subscriptions = new Set();
  }

  async initialize() {
    try {
      this.status = 'active';
      logger.info(`${this.name} holon initialized`);
      this.emit('initialized');
    } catch (error) {
      this.status = 'error';
      logger.error(`Failed to initialize ${this.name} holon:`, error);
      throw error;
    }
  }

  async processMessage(message) {
    const startTime = Date.now();
    
    try {
      this.metrics.lastActivity = new Date().toISOString();
      
      // Override in subclasses
      await this.handleMessage(message);
      
      this.metrics.messagesProcessed++;
      const processingTime = Date.now() - startTime;
      this.updateAverageProcessingTime(processingTime);
      
      logger.debug(`${this.name} processed message`, {
        messageType: message.type,
        processingTime,
        sagaId: message.sagaId
      });
      
    } catch (error) {
      this.metrics.errorsEncountered++;
      logger.error(`${this.name} error processing message:`, {
        error: error.message,
        messageType: message.type,
        sagaId: message.sagaId
      });
      throw error;
    }
  }

  async handleMessage(message) {
    // Override in subclasses
    logger.warn(`${this.name} received unhandled message:`, message.type);
  }

  updateAverageProcessingTime(newTime) {
    if (this.metrics.averageProcessingTime === 0) {
      this.metrics.averageProcessingTime = newTime;
    } else {
      // Exponential moving average
      this.metrics.averageProcessingTime = 
        (this.metrics.averageProcessingTime * 0.9) + (newTime * 0.1);
    }
  }

  subscribe(eventType, handler) {
    if (this.orchestration && this.orchestration.eventBus) {
      this.orchestration.eventBus.subscribe(eventType, handler);
      this.subscriptions.add(eventType);
    }
  }

  async publish(eventType, data, options = {}) {
    if (this.orchestration && this.orchestration.eventBus) {
      const { v4: uuidv4 } = await import('uuid');
      
      await this.orchestration.eventBus.emit(eventType, {
        ...data,
        source: this.name,
        timestamp: new Date().toISOString(),
        sagaId: options.sagaId || uuidv4(),
        correlationId: options.correlationId || uuidv4(),
        spanId: options.spanId || uuidv4()
      });
    }
  }

  async enqueue(queueName, task) {
    if (this.orchestration && this.orchestration.queueManager) {
      await this.orchestration.queueManager.enqueue(queueName, {
        ...task,
        source: this.name,
        timestamp: new Date().toISOString()
      });
    }
  }

  getStatus() {
    return {
      name: this.name,
      status: this.status,
      uptime: Date.now() - this.startTime,
      metrics: { ...this.metrics },
      subscriptions: Array.from(this.subscriptions)
    };
  }

  getHealth() {
    const uptime = Date.now() - this.startTime;
    const errorRate = this.metrics.messagesProcessed > 0 
      ? (this.metrics.errorsEncountered / this.metrics.messagesProcessed) * 100 
      : 0;
    
    let healthStatus = 'healthy';
    if (this.status === 'error') {
      healthStatus = 'unhealthy';
    } else if (errorRate > 5) {
      healthStatus = 'degraded';
    }
    
    return {
      name: this.name,
      status: healthStatus,
      uptime,
      errorRate,
      lastActivity: this.metrics.lastActivity,
      averageProcessingTime: this.metrics.averageProcessingTime
    };
  }

  async shutdown() {
    try {
      this.status = 'shutting_down';
      
      // Unsubscribe from all events
      if (this.orchestration && this.orchestration.eventBus) {
        for (const eventType of this.subscriptions) {
          this.orchestration.eventBus.unsubscribe(eventType);
        }
      }
      
      this.subscriptions.clear();
      this.status = 'shutdown';
      
      logger.info(`${this.name} holon shutdown complete`);
      this.emit('shutdown');
      
    } catch (error) {
      logger.error(`Error shutting down ${this.name} holon:`, error);
      throw error;
    }
  }

  // Utility methods for common holon operations
  async waitForCondition(condition, timeout = 5000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      if (await condition()) {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    return false;
  }

  async retry(operation, maxRetries = 3, baseDelay = 200) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        if (attempt === maxRetries) {
          break;
        }
        
        // Exponential backoff with jitter
        const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 100;
        await new Promise(resolve => setTimeout(resolve, delay));
        
        logger.warn(`${this.name} retry attempt ${attempt}/${maxRetries}:`, {
          error: error.message,
          nextDelay: delay
        });
      }
    }
    
    throw lastError;
  }

  // Circuit breaker pattern
  createCircuitBreaker(operation, options = {}) {
    const {
      failureThreshold = 5,
      resetTimeout = 60000,
      monitoringPeriod = 10000
    } = options;
    
    let state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    let failures = 0;
    let lastFailureTime = null;
    let successes = 0;
    
    return async (...args) => {
      if (state === 'OPEN') {
        if (Date.now() - lastFailureTime > resetTimeout) {
          state = 'HALF_OPEN';
          successes = 0;
        } else {
          throw new Error('Circuit breaker is OPEN');
        }
      }
      
      try {
        const result = await operation(...args);
        
        if (state === 'HALF_OPEN') {
          successes++;
          if (successes >= 3) {
            state = 'CLOSED';
            failures = 0;
          }
        }
        
        return result;
        
      } catch (error) {
        failures++;
        lastFailureTime = Date.now();
        
        if (state === 'HALF_OPEN' || failures >= failureThreshold) {
          state = 'OPEN';
        }
        
        throw error;
      }
    };
  }
}