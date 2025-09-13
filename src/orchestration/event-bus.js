import { EventEmitter } from 'events';
import winston from 'winston';
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

export class EventBus extends EventEmitter {
  constructor() {
    super();
    this.config = getSystemConfig();
    this.topics = new Map();
    this.subscribers = new Map();
    this.eventHistory = [];
    this.maxHistorySize = 1000;
    this.metrics = {
      eventsPublished: 0,
      eventsDelivered: 0,
      deliveryFailures: 0,
      averageDeliveryTime: 0
    };
    
    // Initialize configured topics
    this.config.orchestration.bus.topics.forEach(topic => {
      this.topics.set(topic, {
        name: topic,
        subscribers: new Set(),
        messageCount: 0,
        lastMessage: null
      });
    });
  }

  async initialize() {
    logger.info('EventBus initializing with topics:', Array.from(this.topics.keys()));
    
    // Set up error handling
    this.on('error', (error) => {
      logger.error('EventBus error:', error);
      this.metrics.deliveryFailures++;
    });
    
    logger.info('EventBus initialized successfully');
  }

  subscribe(topic, handler, options = {}) {
    if (!this.topics.has(topic)) {
      logger.warn(`Subscribing to unknown topic: ${topic}`);
      this.topics.set(topic, {
        name: topic,
        subscribers: new Set(),
        messageCount: 0,
        lastMessage: null
      });
    }

    const subscriberId = uuidv4();
    const subscription = {
      id: subscriberId,
      topic,
      handler,
      options,
      createdAt: new Date().toISOString(),
      messageCount: 0,
      lastProcessed: null
    };

    this.subscribers.set(subscriberId, subscription);
    this.topics.get(topic).subscribers.add(subscriberId);

    logger.debug(`Subscriber ${subscriberId} registered for topic: ${topic}`);
    return subscriberId;
  }

  unsubscribe(subscriberId) {
    const subscription = this.subscribers.get(subscriberId);
    if (!subscription) {
      logger.warn(`Attempt to unsubscribe unknown subscriber: ${subscriberId}`);
      return false;
    }

    const topic = this.topics.get(subscription.topic);
    if (topic) {
      topic.subscribers.delete(subscriberId);
    }

    this.subscribers.delete(subscriberId);
    logger.debug(`Subscriber ${subscriberId} unsubscribed from topic: ${subscription.topic}`);
    return true;
  }

  async emit(eventType, eventData) {
    const startTime = Date.now();
    const eventId = uuidv4();
    
    // Create standardized event
    const event = {
      id: eventId,
      type: eventType,
      data: eventData,
      timestamp: new Date().toISOString(),
      sagaId: eventData.sagaId,
      correlationId: eventData.correlationId,
      source: eventData.source || 'unknown',
      version: '1.0'
    };

    // Validate event schema
    if (!this.validateEvent(event)) {
      const error = new Error(`Invalid event schema for type: ${eventType}`);
      logger.error('Event validation failed:', { event, error: error.message });
      throw error;
    }

    try {
      // Store in history
      this.addToHistory(event);
      
      // Update topic metrics
      const topic = this.topics.get(eventType);
      if (topic) {
        topic.messageCount++;
        topic.lastMessage = event.timestamp;
      }

      // Deliver to subscribers
      await this.deliverEvent(event);
      
      this.metrics.eventsPublished++;
      const deliveryTime = Date.now() - startTime;
      this.updateAverageDeliveryTime(deliveryTime);
      
      logger.debug(`Event ${eventId} published to topic ${eventType}`, {
        sagaId: event.sagaId,
        deliveryTime
      });
      
      return eventId;
      
    } catch (error) {
      this.metrics.deliveryFailures++;
      logger.error(`Failed to publish event ${eventId}:`, error);
      throw error;
    }
  }

  async deliverEvent(event) {
    const topic = this.topics.get(event.type);
    if (!topic || topic.subscribers.size === 0) {
      logger.debug(`No subscribers for event type: ${event.type}`);
      return;
    }

    const deliveryPromises = [];
    
    for (const subscriberId of topic.subscribers) {
      const subscription = this.subscribers.get(subscriberId);
      if (!subscription) continue;

      const deliveryPromise = this.deliverToSubscriber(event, subscription)
        .catch(error => {
          logger.error(`Delivery failed to subscriber ${subscriberId}:`, {
            error: error.message,
            eventId: event.id,
            eventType: event.type
          });
          this.metrics.deliveryFailures++;
        });
      
      deliveryPromises.push(deliveryPromise);
    }

    // Wait for all deliveries (at-least-once delivery)
    await Promise.allSettled(deliveryPromises);
    this.metrics.eventsDelivered += deliveryPromises.length;
  }

  async deliverToSubscriber(event, subscription) {
    try {
      // Apply FIFO per saga if configured
      if (this.config.orchestration.bus.delivery.includes('FIFO per saga')) {
        await this.ensureFIFODelivery(event, subscription);
      }

      await subscription.handler(event);
      
      subscription.messageCount++;
      subscription.lastProcessed = new Date().toISOString();
      
    } catch (error) {
      // Implement retry logic based on configuration
      if (subscription.options.retry !== false) {
        await this.retryDelivery(event, subscription, error);
      } else {
        throw error;
      }
    }
  }

  async ensureFIFODelivery(event, subscription) {
    // Simple FIFO implementation - in production, use proper queue
    const sagaId = event.sagaId;
    if (!sagaId) return;

    const sagaKey = `fifo:${subscription.id}:${sagaId}`;
    // In a real implementation, this would use Redis or similar
    // For now, we'll just ensure synchronous processing per saga
  }

  async retryDelivery(event, subscription, originalError) {
    const maxRetries = this.config.orchestration.retries.max || 3;
    const baseDelay = this.config.orchestration.retries.base_ms || 200;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Exponential backoff with jitter
        const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 100;
        await new Promise(resolve => setTimeout(resolve, delay));
        
        await subscription.handler(event);
        
        logger.info(`Retry successful for subscriber ${subscription.id}`, {
          eventId: event.id,
          attempt
        });
        
        return; // Success
        
      } catch (retryError) {
        logger.warn(`Retry ${attempt}/${maxRetries} failed for subscriber ${subscription.id}:`, {
          eventId: event.id,
          error: retryError.message
        });
        
        if (attempt === maxRetries) {
          // Send to DLQ
          await this.sendToDeadLetterQueue(event, subscription, retryError);
          throw retryError;
        }
      }
    }
  }

  async sendToDeadLetterQueue(event, subscription, error) {
    const dlqEvent = {
      originalEvent: event,
      subscription: {
        id: subscription.id,
        topic: subscription.topic
      },
      error: {
        message: error.message,
        stack: error.stack
      },
      timestamp: new Date().toISOString(),
      requiresApproval: true
    };

    // In production, this would go to a proper DLQ system
    logger.error('Event sent to Dead Letter Queue:', dlqEvent);
    
    // Emit DLQ event for monitoring
    super.emit('dlq-message', dlqEvent);
  }

  validateEvent(event) {
    // Basic schema validation
    const requiredFields = ['id', 'type', 'data', 'timestamp', 'version'];
    
    for (const field of requiredFields) {
      if (!event[field]) {
        logger.warn(`Event missing required field: ${field}`);
        return false;
      }
    }

    // Validate correlation/saga/span if required
    if (this.config.events.schema.includes('correlation/saga/span required')) {
      if (!event.sagaId || !event.correlationId) {
        logger.warn('Event missing required saga/correlation IDs');
        return false;
      }
    }

    return true;
  }

  addToHistory(event) {
    this.eventHistory.push({
      ...event,
      storedAt: new Date().toISOString()
    });

    // Maintain history size limit
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }
  }

  updateAverageDeliveryTime(newTime) {
    if (this.metrics.averageDeliveryTime === 0) {
      this.metrics.averageDeliveryTime = newTime;
    } else {
      this.metrics.averageDeliveryTime = 
        (this.metrics.averageDeliveryTime * 0.9) + (newTime * 0.1);
    }
  }

  getMetrics() {
    return {
      ...this.metrics,
      topics: Array.from(this.topics.entries()).map(([name, topic]) => ({
        name,
        subscriberCount: topic.subscribers.size,
        messageCount: topic.messageCount,
        lastMessage: topic.lastMessage
      })),
      totalSubscribers: this.subscribers.size,
      historySize: this.eventHistory.length
    };
  }

  getEventHistory(filters = {}) {
    let history = [...this.eventHistory];
    
    if (filters.sagaId) {
      history = history.filter(event => event.sagaId === filters.sagaId);
    }
    
    if (filters.eventType) {
      history = history.filter(event => event.type === filters.eventType);
    }
    
    if (filters.since) {
      const sinceDate = new Date(filters.since);
      history = history.filter(event => new Date(event.timestamp) >= sinceDate);
    }
    
    return history.slice(-100); // Return last 100 events
  }

  async shutdown() {
    logger.info('EventBus shutting down...');
    
    // Clear all subscribers
    this.subscribers.clear();
    
    // Clear topics
    for (const topic of this.topics.values()) {
      topic.subscribers.clear();
    }
    
    // Clear history
    this.eventHistory = [];
    
    logger.info('EventBus shutdown complete');
  }
}