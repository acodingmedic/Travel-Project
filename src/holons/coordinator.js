import { v4 as uuidv4 } from 'uuid';
import winston from 'winston';
import { getSystemConfig } from '../config/system-config.js';
import { BaseHolon } from './base-holon.js';

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

export class Coordinator extends BaseHolon {
  constructor(orchestration) {
    super('Coordinator', orchestration);
    this.config = getSystemConfig();
    this.activeRequests = new Map();
    this.requestMetrics = {
      total: 0,
      accepted: 0,
      rejected: 0,
      errors: 0
    };
  }

  async initialize() {
    await super.initialize();
    
    // Subscribe to relevant events
    this.orchestration.eventBus.subscribe('travel-request', this.handleTravelRequest.bind(this));
    this.orchestration.eventBus.subscribe('revision-request', this.handleRevisionRequest.bind(this));
    this.orchestration.eventBus.subscribe('workflow-complete', this.handleWorkflowComplete.bind(this));
    this.orchestration.eventBus.subscribe('workflow-error', this.handleWorkflowError.bind(this));
    
    logger.info('Coordinator holon initialized');
  }

  async processRequest(requestData, clientId) {
    const startTime = Date.now();
    const sagaId = uuidv4();
    const correlationId = uuidv4();
    
    try {
      // Admission control
      const admissionResult = await this.admissionControl(requestData, clientId);
      if (!admissionResult.admitted) {
        this.requestMetrics.rejected++;
        return {
          success: false,
          error: admissionResult.reason,
          sagaId,
          correlationId
        };
      }

      // Policy validation
      const policyResult = await this.policyValidation(requestData);
      if (!policyResult.valid) {
        this.requestMetrics.rejected++;
        return {
          success: false,
          error: policyResult.reason,
          sagaId,
          correlationId
        };
      }

      // Create saga context
      const sagaContext = {
        sagaId,
        correlationId,
        clientId,
        requestData: this.sanitizeRequest(requestData),
        startTime,
        state: 'ADMIT',
        metadata: {
          userAgent: requestData.userAgent,
          language: requestData.language || 'en',
          gdprConsent: requestData.gdprConsent || false
        }
      };

      // Store active request
      this.activeRequests.set(sagaId, sagaContext);
      this.requestMetrics.total++;
      this.requestMetrics.accepted++;

      // Emit INTENT event to start workflow
      await this.orchestration.eventBus.emit('INTENT', {
        sagaId,
        correlationId,
        data: sagaContext,
        timestamp: new Date().toISOString(),
        source: 'Coordinator'
      });

      logger.info(`Travel request admitted and workflow started`, {
        sagaId,
        correlationId,
        clientId,
        latency: Date.now() - startTime
      });

      return {
        success: true,
        sagaId,
        correlationId,
        status: 'processing',
        estimatedCompletion: this.estimateCompletion(requestData)
      };

    } catch (error) {
      this.requestMetrics.errors++;
      logger.error('Error processing travel request:', {
        error: error.message,
        sagaId,
        correlationId,
        clientId
      });
      
      return {
        success: false,
        error: 'Internal processing error',
        sagaId,
        correlationId
      };
    }
  }

  async admissionControl(requestData, clientId) {
    // Check system load
    const activeRequestCount = this.activeRequests.size;
    if (activeRequestCount > 100) { // Q>100→scale trigger
      return {
        admitted: false,
        reason: 'System overloaded, please try again later'
      };
    }

    // Rate limiting per client
    const clientRequests = Array.from(this.activeRequests.values())
      .filter(req => req.clientId === clientId);
    
    if (clientRequests.length > 3) {
      return {
        admitted: false,
        reason: 'Too many concurrent requests from this client'
      };
    }

    // Basic request validation
    if (!requestData || !requestData.destination) {
      return {
        admitted: false,
        reason: 'Invalid request: destination is required'
      };
    }

    return { admitted: true };
  }

  async policyValidation(requestData) {
    // GDPR compliance check
    if (!requestData.gdprConsent) {
      return {
        valid: false,
        reason: 'GDPR consent is required'
      };
    }

    // Budget validation
    if (requestData.budget && requestData.budget < 50) {
      return {
        valid: false,
        reason: 'Minimum budget of €50 is required'
      };
    }

    // Date validation
    if (requestData.dates) {
      const startDate = new Date(requestData.dates.start);
      const endDate = new Date(requestData.dates.end);
      const now = new Date();
      
      if (startDate < now) {
        return {
          valid: false,
          reason: 'Start date cannot be in the past'
        };
      }
      
      if (endDate <= startDate) {
        return {
          valid: false,
          reason: 'End date must be after start date'
        };
      }
    }

    return { valid: true };
  }

  sanitizeRequest(requestData) {
    // Remove PII and sensitive data, keep only necessary fields
    const sanitized = {
      destination: requestData.destination,
      dates: requestData.dates,
      party: {
        adults: requestData.party?.adults || 1,
        children: requestData.party?.children || 0
      },
      budget: requestData.budget,
      preferences: requestData.preferences || {},
      language: requestData.language || 'en',
      gdprConsent: requestData.gdprConsent || false
    };

    // Hash any user identifiers
    if (requestData.userId) {
      sanitized.userHash = this.hashUserId(requestData.userId);
    }

    return sanitized;
  }

  hashUserId(userId) {
    // Simple hash for demo - in production use proper crypto
    return Buffer.from(userId).toString('base64').slice(0, 16);
  }

  estimateCompletion(requestData) {
    // Base estimation logic
    let estimatedSeconds = 12; // Base time
    
    // Add complexity factors
    if (requestData.preferences && Object.keys(requestData.preferences).length > 3) {
      estimatedSeconds += 3;
    }
    
    if (requestData.party && requestData.party.adults > 2) {
      estimatedSeconds += 2;
    }
    
    return new Date(Date.now() + estimatedSeconds * 1000).toISOString();
  }

  async handleTravelRequest(event) {
    // Handle direct travel requests from event bus
    logger.info('Handling travel request event', { sagaId: event.sagaId });
  }

  async handleRevisionRequest(event) {
    const { sagaId, revisionData } = event.data;
    
    if (!this.activeRequests.has(sagaId)) {
      logger.warn('Revision request for unknown saga', { sagaId });
      return;
    }

    const sagaContext = this.activeRequests.get(sagaId);
    sagaContext.revisions = sagaContext.revisions || [];
    sagaContext.revisions.push({
      timestamp: new Date().toISOString(),
      data: revisionData
    });

    // Emit REVISION event
    await this.orchestration.eventBus.emit('REVISION', {
      sagaId,
      correlationId: sagaContext.correlationId,
      data: { sagaContext, revisionData },
      timestamp: new Date().toISOString(),
      source: 'Coordinator'
    });

    logger.info('Revision request processed', { sagaId });
  }

  async handleWorkflowComplete(event) {
    const { sagaId } = event.data;
    
    if (this.activeRequests.has(sagaId)) {
      const sagaContext = this.activeRequests.get(sagaId);
      const totalTime = Date.now() - sagaContext.startTime;
      
      logger.info('Workflow completed', {
        sagaId,
        totalTime,
        p95Target: this.config.nfr.latency_p95
      });
      
      this.activeRequests.delete(sagaId);
    }
  }

  async handleWorkflowError(event) {
    const { sagaId, error } = event.data;
    
    if (this.activeRequests.has(sagaId)) {
      logger.error('Workflow error', {
        sagaId,
        error: error.message
      });
      
      this.requestMetrics.errors++;
      this.activeRequests.delete(sagaId);
    }
  }

  getMetrics() {
    return {
      ...this.requestMetrics,
      activeRequests: this.activeRequests.size,
      acceptanceRate: this.requestMetrics.total > 0 
        ? (this.requestMetrics.accepted / this.requestMetrics.total) * 100 
        : 0
    };
  }

  async shutdown() {
    logger.info('Shutting down Coordinator holon');
    
    // Cancel all active requests
    for (const [sagaId, context] of this.activeRequests) {
      await this.orchestration.eventBus.emit('workflow-cancel', {
        sagaId,
        reason: 'System shutdown'
      });
    }
    
    this.activeRequests.clear();
    await super.shutdown();
  }
}