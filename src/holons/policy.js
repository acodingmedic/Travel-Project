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

export class Policy extends BaseHolon {
  constructor(orchestration) {
    super('Policy', orchestration);
    this.config = getSystemConfig();
    
    // Policy rules
    this.admissionRules = {
      rateLimit: {
        windowMs: 60000, // 1 minute
        maxRequests: 100,
        requests: new Map() // IP -> [timestamps]
      },
      queueLimit: {
        maxQueueSize: 100,
        currentSize: 0
      },
      resourceLimit: {
        maxConcurrentSagas: 50,
        activeSagas: new Set()
      }
    };
    
    // GDPR policies
    this.gdprPolicies = {
      dataMinimization: {
        allowedFields: [
          'destination', 'dates', 'partySize', 'budget', 'preferences',
          'language', 'accessibility', 'dietary'
        ],
        forbiddenFields: [
          'ssn', 'passport', 'creditCard', 'personalId', 'phone', 'email'
        ]
      },
      retention: {
        userPreferences: 90 * 24 * 60 * 60 * 1000, // 90 days
        anonymizedData: 365 * 24 * 60 * 60 * 1000, // 365 days
        auditLogs: 7 * 365 * 24 * 60 * 60 * 1000 // 7 years
      },
      consent: {
        required: ['data_processing', 'affiliate_tracking'],
        optional: ['personalization', 'analytics']
      }
    };
    
    // Security policies
    this.securityPolicies = {
      authentication: {
        tokenExpiry: 3600000, // 1 hour
        refreshThreshold: 300000, // 5 minutes
        maxFailedAttempts: 5
      },
      authorization: {
        roles: ['user', 'admin', 'system'],
        permissions: {
          user: ['read_own_data', 'create_request', 'update_preferences'],
          admin: ['read_all_data', 'manage_system', 'view_audit'],
          system: ['all']
        }
      },
      dataProtection: {
        encryptionRequired: ['pii', 'payment', 'credentials'],
        hashingRequired: ['user_id', 'session_id'],
        redactionRequired: ['logs', 'metrics', 'traces']
      }
    };
    
    // Business rules
    this.businessRules = {
      pricing: {
        maxDriftPercent: 5,
        recheckInterval: 600000, // 10 minutes
        escalationThreshold: 2
      },
      quality: {
        minConfidenceScore: 0.65,
        maxRevisions: 3,
        timeoutMs: 18000
      },
      compliance: {
        requiredLicenses: ['images', 'content'],
        affiliateDisclosure: true,
        safetyWarnings: true
      }
    };
    
    // Policy violations tracking
    this.violations = [];
    this.maxViolations = 1000;
    
    // Circuit breaker states
    this.circuitBreakers = new Map();
  }

  async initialize() {
    await super.initialize();
    
    // Subscribe to policy check events
    this.subscribe('admission-request', this.handleAdmissionRequest.bind(this));
    this.subscribe('gdpr-check', this.handleGDPRCheck.bind(this));
    this.subscribe('security-check', this.handleSecurityCheck.bind(this));
    this.subscribe('business-rule-check', this.handleBusinessRuleCheck.bind(this));
    this.subscribe('policy-violation', this.handlePolicyViolation.bind(this));
    this.subscribe('circuit-breaker-check', this.handleCircuitBreakerCheck.bind(this));
    
    // Start policy maintenance tasks
    this.startPolicyMaintenance();
    
    logger.info('Policy holon initialized');
  }

  startPolicyMaintenance() {
    // Clean up expired rate limit entries every minute
    setInterval(() => {
      this.cleanupRateLimitEntries();
    }, 60000);
    
    // Check circuit breakers every 30 seconds
    setInterval(() => {
      this.checkCircuitBreakers();
    }, 30000);
    
    // Clean up old violations every hour
    setInterval(() => {
      this.cleanupViolations();
    }, 3600000);
  }

  cleanupRateLimitEntries() {
    const now = Date.now();
    const windowMs = this.admissionRules.rateLimit.windowMs;
    
    for (const [ip, timestamps] of this.admissionRules.rateLimit.requests) {
      const validTimestamps = timestamps.filter(ts => now - ts < windowMs);
      
      if (validTimestamps.length === 0) {
        this.admissionRules.rateLimit.requests.delete(ip);
      } else {
        this.admissionRules.rateLimit.requests.set(ip, validTimestamps);
      }
    }
  }

  checkCircuitBreakers() {
    for (const [service, breaker] of this.circuitBreakers) {
      if (breaker.state === 'half-open' && Date.now() - breaker.lastProbe > 15000) {
        // Probe timeout, reset to open
        breaker.state = 'open';
        breaker.lastFailure = Date.now();
        
        logger.warn(`Circuit breaker probe timeout for ${service}`);
      } else if (breaker.state === 'open' && Date.now() - breaker.lastFailure > 120000) {
        // Try half-open after 2 minutes
        breaker.state = 'half-open';
        breaker.lastProbe = Date.now();
        
        logger.info(`Circuit breaker half-open for ${service}`);
      }
    }
  }

  cleanupViolations() {
    const oneDayAgo = Date.now() - 86400000;
    this.violations = this.violations.filter(v => v.timestamp > oneDayAgo);
  }

  // Event handlers
  async handleAdmissionRequest(event) {
    const { sagaId, clientIp, queueSize, activeSagas } = event.data;
    
    try {
      // Check rate limiting
      const rateLimitResult = this.checkRateLimit(clientIp);
      if (!rateLimitResult.allowed) {
        await this.denyAdmission(sagaId, 'rate_limit_exceeded', rateLimitResult);
        return;
      }
      
      // Check queue capacity
      if (queueSize >= this.admissionRules.queueLimit.maxQueueSize) {
        await this.denyAdmission(sagaId, 'queue_full', { queueSize });
        return;
      }
      
      // Check resource limits
      if (activeSagas >= this.admissionRules.resourceLimit.maxConcurrentSagas) {
        await this.denyAdmission(sagaId, 'resource_limit_exceeded', { activeSagas });
        return;
      }
      
      // Admission approved
      this.admissionRules.resourceLimit.activeSagas.add(sagaId);
      
      await this.publish('admission-approved', {
        sagaId,
        timestamp: Date.now(),
        policies: ['rate_limit', 'queue_capacity', 'resource_limit']
      });
      
      logger.debug(`Admission approved for saga ${sagaId}`);
      
    } catch (error) {
      logger.error('Error in admission control:', error);
      await this.denyAdmission(sagaId, 'policy_error', { error: error.message });
    }
  }

  checkRateLimit(clientIp) {
    const now = Date.now();
    const windowMs = this.admissionRules.rateLimit.windowMs;
    const maxRequests = this.admissionRules.rateLimit.maxRequests;
    
    if (!this.admissionRules.rateLimit.requests.has(clientIp)) {
      this.admissionRules.rateLimit.requests.set(clientIp, []);
    }
    
    const timestamps = this.admissionRules.rateLimit.requests.get(clientIp);
    
    // Remove expired timestamps
    const validTimestamps = timestamps.filter(ts => now - ts < windowMs);
    
    if (validTimestamps.length >= maxRequests) {
      return {
        allowed: false,
        reason: 'Rate limit exceeded',
        resetTime: validTimestamps[0] + windowMs,
        currentCount: validTimestamps.length,
        maxRequests
      };
    }
    
    // Add current request
    validTimestamps.push(now);
    this.admissionRules.rateLimit.requests.set(clientIp, validTimestamps);
    
    return {
      allowed: true,
      currentCount: validTimestamps.length,
      maxRequests,
      resetTime: now + windowMs
    };
  }

  async denyAdmission(sagaId, reason, details) {
    await this.recordViolation('admission_denied', {
      sagaId,
      reason,
      details
    });
    
    await this.publish('admission-denied', {
      sagaId,
      reason,
      details,
      timestamp: Date.now()
    });
    
    logger.warn(`Admission denied for saga ${sagaId}: ${reason}`, details);
  }

  async handleGDPRCheck(event) {
    const { sagaId, userData, operation, consent } = event.data;
    
    try {
      const gdprResult = this.validateGDPRCompliance(userData, operation, consent);
      
      if (gdprResult.compliant) {
        await this.publish('gdpr-compliant', {
          sagaId,
          operation,
          sanitizedData: gdprResult.sanitizedData,
          timestamp: Date.now()
        });
        
        // Emit telemetry event
        await this.publish('gdpr-request', {
          type: operation,
          compliant: true
        });
        
      } else {
        await this.recordViolation('gdpr_violation', {
          sagaId,
          operation,
          violations: gdprResult.violations
        });
        
        await this.publish('gdpr-violation', {
          sagaId,
          operation,
          violations: gdprResult.violations,
          timestamp: Date.now()
        });
        
        // Emit telemetry event
        await this.publish('gdpr-request', {
          type: operation,
          compliant: false
        });
      }
      
    } catch (error) {
      logger.error('Error in GDPR check:', error);
      await this.recordViolation('gdpr_error', {
        sagaId,
        operation,
        error: error.message
      });
    }
  }

  validateGDPRCompliance(userData, operation, consent) {
    const violations = [];
    const sanitizedData = { ...userData };
    
    // Check data minimization
    const dataMinResult = this.checkDataMinimization(userData);
    if (!dataMinResult.compliant) {
      violations.push(...dataMinResult.violations);
      // Remove forbidden fields
      dataMinResult.forbiddenFields.forEach(field => {
        delete sanitizedData[field];
      });
    }
    
    // Check consent requirements
    const consentResult = this.checkConsent(operation, consent);
    if (!consentResult.compliant) {
      violations.push(...consentResult.violations);
    }
    
    // Check retention policies
    const retentionResult = this.checkRetentionPolicy(operation, userData);
    if (!retentionResult.compliant) {
      violations.push(...retentionResult.violations);
    }
    
    return {
      compliant: violations.length === 0,
      violations,
      sanitizedData
    };
  }

  checkDataMinimization(userData) {
    const violations = [];
    const forbiddenFields = [];
    
    // Check for forbidden fields
    this.gdprPolicies.dataMinimization.forbiddenFields.forEach(field => {
      if (userData.hasOwnProperty(field)) {
        violations.push(`Forbidden field present: ${field}`);
        forbiddenFields.push(field);
      }
    });
    
    // Check for unnecessary fields
    Object.keys(userData).forEach(field => {
      if (!this.gdprPolicies.dataMinimization.allowedFields.includes(field) &&
          !this.gdprPolicies.dataMinimization.forbiddenFields.includes(field)) {
        violations.push(`Unnecessary field: ${field}`);
      }
    });
    
    return {
      compliant: violations.length === 0,
      violations,
      forbiddenFields
    };
  }

  checkConsent(operation, consent) {
    const violations = [];
    
    // Check required consents
    this.gdprPolicies.consent.required.forEach(consentType => {
      if (!consent || !consent[consentType]) {
        violations.push(`Missing required consent: ${consentType}`);
      }
    });
    
    // Validate consent format
    if (consent) {
      Object.keys(consent).forEach(consentType => {
        if (typeof consent[consentType] !== 'boolean') {
          violations.push(`Invalid consent format for: ${consentType}`);
        }
      });
    }
    
    return {
      compliant: violations.length === 0,
      violations
    };
  }

  checkRetentionPolicy(operation, userData) {
    const violations = [];
    
    // Check if data has retention metadata
    if (userData.createdAt) {
      const age = Date.now() - new Date(userData.createdAt).getTime();
      const retentionLimit = this.gdprPolicies.retention.userPreferences;
      
      if (age > retentionLimit) {
        violations.push(`Data exceeds retention period: ${Math.floor(age / (24 * 60 * 60 * 1000))} days`);
      }
    }
    
    return {
      compliant: violations.length === 0,
      violations
    };
  }

  async handleSecurityCheck(event) {
    const { sagaId, token, operation, clientIp } = event.data;
    
    try {
      const securityResult = this.validateSecurity(token, operation, clientIp);
      
      if (securityResult.authorized) {
        await this.publish('security-authorized', {
          sagaId,
          operation,
          userId: securityResult.userId,
          role: securityResult.role,
          timestamp: Date.now()
        });
      } else {
        await this.recordViolation('security_violation', {
          sagaId,
          operation,
          clientIp,
          violations: securityResult.violations
        });
        
        await this.publish('security-denied', {
          sagaId,
          operation,
          violations: securityResult.violations,
          timestamp: Date.now()
        });
      }
      
    } catch (error) {
      logger.error('Error in security check:', error);
      await this.recordViolation('security_error', {
        sagaId,
        operation,
        error: error.message
      });
    }
  }

  validateSecurity(token, operation, clientIp) {
    const violations = [];
    
    // Validate token (simplified)
    if (!token) {
      violations.push('Missing authentication token');
      return { authorized: false, violations };
    }
    
    // Decode token (simplified - in production use proper JWT validation)
    let decodedToken;
    try {
      decodedToken = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    } catch (error) {
      violations.push('Invalid token format');
      return { authorized: false, violations };
    }
    
    // Check token expiry
    if (decodedToken.exp && decodedToken.exp * 1000 < Date.now()) {
      violations.push('Token expired');
      return { authorized: false, violations };
    }
    
    // Check authorization
    const role = decodedToken.role || 'user';
    const permissions = this.securityPolicies.authorization.permissions[role] || [];
    
    if (!permissions.includes(operation) && !permissions.includes('all')) {
      violations.push(`Insufficient permissions for operation: ${operation}`);
      return { authorized: false, violations };
    }
    
    return {
      authorized: true,
      userId: decodedToken.sub,
      role,
      violations: []
    };
  }

  async handleBusinessRuleCheck(event) {
    const { sagaId, rule, data } = event.data;
    
    try {
      const ruleResult = this.validateBusinessRule(rule, data);
      
      if (ruleResult.valid) {
        await this.publish('business-rule-passed', {
          sagaId,
          rule,
          result: ruleResult.result,
          timestamp: Date.now()
        });
      } else {
        await this.recordViolation('business_rule_violation', {
          sagaId,
          rule,
          violations: ruleResult.violations
        });
        
        await this.publish('business-rule-failed', {
          sagaId,
          rule,
          violations: ruleResult.violations,
          escalate: ruleResult.escalate,
          timestamp: Date.now()
        });
      }
      
    } catch (error) {
      logger.error('Error in business rule check:', error);
      await this.recordViolation('business_rule_error', {
        sagaId,
        rule,
        error: error.message
      });
    }
  }

  validateBusinessRule(rule, data) {
    const violations = [];
    let escalate = false;
    let result = null;
    
    switch (rule) {
      case 'price_drift':
        result = this.checkPriceDrift(data);
        if (result.driftPercent > this.businessRules.pricing.maxDriftPercent) {
          violations.push(`Price drift exceeds threshold: ${result.driftPercent}%`);
          escalate = true;
        }
        break;
        
      case 'confidence_score':
        if (data.confidence < this.businessRules.quality.minConfidenceScore) {
          violations.push(`Confidence score too low: ${data.confidence}`);
        }
        result = { confidence: data.confidence };
        break;
        
      case 'timeout_check':
        if (data.duration > this.businessRules.quality.timeoutMs) {
          violations.push(`Operation timeout: ${data.duration}ms`);
          escalate = true;
        }
        result = { duration: data.duration };
        break;
        
      case 'revision_limit':
        if (data.revisionCount > this.businessRules.quality.maxRevisions) {
          violations.push(`Too many revisions: ${data.revisionCount}`);
        }
        result = { revisionCount: data.revisionCount };
        break;
        
      case 'license_check':
        result = this.checkLicenseCompliance(data);
        if (!result.compliant) {
          violations.push(...result.violations);
        }
        break;
        
      default:
        violations.push(`Unknown business rule: ${rule}`);
    }
    
    return {
      valid: violations.length === 0,
      violations,
      escalate,
      result
    };
  }

  checkPriceDrift(data) {
    const { originalPrice, currentPrice } = data;
    const driftPercent = Math.abs((currentPrice - originalPrice) / originalPrice) * 100;
    
    return {
      originalPrice,
      currentPrice,
      driftPercent,
      threshold: this.businessRules.pricing.maxDriftPercent
    };
  }

  checkLicenseCompliance(data) {
    const violations = [];
    const { images, content } = data;
    
    // Check image licenses
    if (images) {
      images.forEach((image, index) => {
        if (!image.license || !image.license.valid) {
          violations.push(`Image ${index} missing valid license`);
        }
      });
    }
    
    // Check content licenses
    if (content) {
      content.forEach((item, index) => {
        if (!item.license || !item.license.valid) {
          violations.push(`Content ${index} missing valid license`);
        }
      });
    }
    
    return {
      compliant: violations.length === 0,
      violations
    };
  }

  async handleCircuitBreakerCheck(event) {
    const { service, operation, success, duration } = event.data;
    
    if (!this.circuitBreakers.has(service)) {
      this.circuitBreakers.set(service, {
        state: 'closed',
        failures: 0,
        successes: 0,
        lastFailure: null,
        lastProbe: null
      });
    }
    
    const breaker = this.circuitBreakers.get(service);
    
    if (success) {
      breaker.successes++;
      
      if (breaker.state === 'half-open') {
        // Success in half-open state, close the circuit
        breaker.state = 'closed';
        breaker.failures = 0;
        
        await this.publish('circuit-breaker-closed', {
          service,
          timestamp: Date.now()
        });
        
        logger.info(`Circuit breaker closed for ${service}`);
      }
    } else {
      breaker.failures++;
      breaker.lastFailure = Date.now();
      
      // Check if we should open the circuit
      const errorRate = breaker.failures / (breaker.failures + breaker.successes);
      const shouldOpen = errorRate > 0.03 || // 3% error rate
                        (duration && duration > 5000); // 5s timeout
      
      if (shouldOpen && breaker.state === 'closed') {
        breaker.state = 'open';
        
        await this.publish('circuit-breaker-opened', {
          service,
          errorRate,
          duration,
          timestamp: Date.now()
        });
        
        logger.warn(`Circuit breaker opened for ${service}`, {
          errorRate,
          failures: breaker.failures,
          successes: breaker.successes
        });
      }
    }
  }

  async recordViolation(type, details) {
    const violation = {
      id: `violation-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      timestamp: Date.now(),
      details
    };
    
    this.violations.push(violation);
    
    // Maintain violations array size
    if (this.violations.length > this.maxViolations) {
      this.violations.shift();
    }
    
    // Emit violation event
    await this.publish('policy-violation', violation);
    
    // Emit audit event
    await this.publish('audit-event', {
      action: 'policy_violation',
      type,
      details,
      timestamp: Date.now()
    });
    
    logger.warn(`Policy violation recorded: ${type}`, details);
  }

  async handlePolicyViolation(event) {
    // This handles violations from other components
    await this.recordViolation(event.data.type, event.data.details);
  }

  // Query methods
  getAdmissionStats() {
    return {
      rateLimit: {
        activeIPs: this.admissionRules.rateLimit.requests.size,
        windowMs: this.admissionRules.rateLimit.windowMs,
        maxRequests: this.admissionRules.rateLimit.maxRequests
      },
      queue: {
        currentSize: this.admissionRules.queueLimit.currentSize,
        maxSize: this.admissionRules.queueLimit.maxQueueSize
      },
      resources: {
        activeSagas: this.admissionRules.resourceLimit.activeSagas.size,
        maxSagas: this.admissionRules.resourceLimit.maxConcurrentSagas
      }
    };
  }

  getViolations(filters = {}) {
    let violations = [...this.violations];
    
    if (filters.type) {
      violations = violations.filter(v => v.type === filters.type);
    }
    
    if (filters.since) {
      violations = violations.filter(v => v.timestamp > filters.since);
    }
    
    return violations.slice(-100); // Return last 100 violations
  }

  getCircuitBreakerStatus() {
    const status = {};
    
    for (const [service, breaker] of this.circuitBreakers) {
      status[service] = {
        state: breaker.state,
        failures: breaker.failures,
        successes: breaker.successes,
        errorRate: breaker.failures / (breaker.failures + breaker.successes) || 0,
        lastFailure: breaker.lastFailure,
        lastProbe: breaker.lastProbe
      };
    }
    
    return status;
  }

  async releaseSaga(sagaId) {
    this.admissionRules.resourceLimit.activeSagas.delete(sagaId);
    
    await this.publish('saga-released', {
      sagaId,
      timestamp: Date.now()
    });
  }

  async shutdown() {
    logger.info('Shutting down Policy holon');
    
    // Clear all data
    this.admissionRules.rateLimit.requests.clear();
    this.admissionRules.resourceLimit.activeSagas.clear();
    this.violations = [];
    this.circuitBreakers.clear();
    
    await super.shutdown();
  }
}