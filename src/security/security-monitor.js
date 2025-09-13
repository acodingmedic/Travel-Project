import winston from 'winston';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
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

export class SecurityMonitor extends EventEmitter {
  constructor(eventBus) {
    super();
    this.eventBus = eventBus;
    this.config = getConfig();
    
    // Security policies and rules
    this.securityPolicies = {
      authentication: {
        maxLoginAttempts: 5,
        lockoutDuration: 15 * 60 * 1000, // 15 minutes
        sessionTimeout: 60 * 60 * 1000, // 1 hour
        passwordMinLength: 8,
        passwordComplexity: true,
        mfaRequired: false,
        mfaRequiredForAdmin: true
      },
      authorization: {
        defaultRole: 'user',
        roleHierarchy: {
          'admin': ['user', 'moderator', 'admin'],
          'moderator': ['user', 'moderator'],
          'user': ['user']
        },
        resourcePermissions: {
          'search': ['user', 'moderator', 'admin'],
          'booking': ['user', 'moderator', 'admin'],
          'admin-panel': ['admin'],
          'user-management': ['admin'],
          'system-config': ['admin']
        }
      },
      dataProtection: {
        encryptionRequired: ['personal-data', 'payment-data', 'sensitive-data'],
        dataClassification: {
          'public': { encryption: false, access: 'all' },
          'internal': { encryption: false, access: 'authenticated' },
          'confidential': { encryption: true, access: 'authorized' },
          'restricted': { encryption: true, access: 'admin-only' }
        },
        dataRetention: {
          'logs': 90 * 24 * 60 * 60 * 1000, // 90 days
          'sessions': 30 * 24 * 60 * 60 * 1000, // 30 days
          'audit-trail': 365 * 24 * 60 * 60 * 1000 // 1 year
        }
      },
      networkSecurity: {
        allowedOrigins: ['https://localhost:3000', 'https://travel-app.com'],
        rateLimiting: {
          'search': { requests: 100, window: 60 * 1000 }, // 100 per minute
          'booking': { requests: 10, window: 60 * 1000 }, // 10 per minute
          'auth': { requests: 5, window: 60 * 1000 } // 5 per minute
        },
        ipWhitelist: [],
        ipBlacklist: [],
        geoBlocking: {
          enabled: false,
          allowedCountries: [],
          blockedCountries: []
        }
      },
      threatDetection: {
        suspiciousActivityThreshold: 10,
        anomalyDetectionEnabled: true,
        bruteForceThreshold: 5,
        sqlInjectionPatterns: [
          /('|(\-\-)|(;)|(\||\|)|(\*|\*))/i,
          /(union|select|insert|delete|update|drop|create|alter|exec|execute)/i
        ],
        xssPatterns: [
          /<script[^>]*>.*?<\/script>/gi,
          /javascript:/gi,
          /on\w+\s*=/gi
        ],
        commandInjectionPatterns: [
          /[;&|`$(){}\[\]]/,
          /(cat|ls|pwd|whoami|id|uname)/i
        ]
      }
    };
    
    // Active sessions and authentication state
    this.activeSessions = new Map();
    this.failedLoginAttempts = new Map();
    this.lockedAccounts = new Map();
    
    // Security events and incidents
    this.securityEvents = new Map();
    this.securityIncidents = new Map();
    
    // Rate limiting tracking
    this.rateLimitTracking = new Map();
    
    // Threat intelligence
    this.threatIntelligence = {
      knownMaliciousIPs: new Set(),
      suspiciousUserAgents: new Set(),
      compromisedCredentials: new Set(),
      attackPatterns: new Map()
    };
    
    // Security metrics
    this.securityMetrics = {
      totalSecurityEvents: 0,
      totalIncidents: 0,
      blockedRequests: 0,
      failedAuthentications: 0,
      successfulAuthentications: 0,
      activeSessions: 0,
      threatsDetected: 0,
      vulnerabilitiesFound: 0,
      eventsByType: {
        'authentication': 0,
        'authorization': 0,
        'data-access': 0,
        'network': 0,
        'malware': 0,
        'intrusion': 0,
        'data-breach': 0,
        'policy-violation': 0
      },
      incidentsByType: {
        'low': 0,
        'medium': 0,
        'high': 0,
        'critical': 0
      }
    };
    
    // Compliance frameworks
    this.complianceFrameworks = {
      'GDPR': {
        name: 'General Data Protection Regulation',
        requirements: [
          'data-encryption',
          'access-logging',
          'breach-notification',
          'data-minimization',
          'consent-management'
        ],
        status: 'compliant'
      },
      'PCI-DSS': {
        name: 'Payment Card Industry Data Security Standard',
        requirements: [
          'network-security',
          'access-control',
          'encryption',
          'vulnerability-management',
          'monitoring'
        ],
        status: 'compliant'
      },
      'ISO27001': {
        name: 'Information Security Management',
        requirements: [
          'risk-assessment',
          'security-policies',
          'incident-management',
          'business-continuity',
          'supplier-security'
        ],
        status: 'compliant'
      }
    };
    
    this.startTime = Date.now();
  }

  async initialize() {
    logger.info('Initializing Security Monitor');
    
    // Subscribe to security-related events
    this.eventBus.on('authentication-attempt', this.handleAuthenticationAttempt.bind(this));
    this.eventBus.on('authorization-check', this.handleAuthorizationCheck.bind(this));
    this.eventBus.on('data-access', this.handleDataAccess.bind(this));
    this.eventBus.on('network-request', this.handleNetworkRequest.bind(this));
    this.eventBus.on('suspicious-activity', this.handleSuspiciousActivity.bind(this));
    this.eventBus.on('security-violation', this.handleSecurityViolation.bind(this));
    this.eventBus.on('vulnerability-detected', this.handleVulnerabilityDetected.bind(this));
    
    // Start security monitoring tasks
    this.startSecurityMonitoring();
    
    // Load threat intelligence
    await this.loadThreatIntelligence();
    
    logger.info('Security Monitor initialized');
  }

  startSecurityMonitoring() {
    // Monitor active sessions
    setInterval(() => {
      this.monitorActiveSessions();
    }, 60 * 1000); // Every minute
    
    // Clean up expired data
    setInterval(() => {
      this.cleanupExpiredData();
    }, 60 * 60 * 1000); // Every hour
    
    // Update security metrics
    setInterval(() => {
      this.updateSecurityMetrics();
    }, 5 * 60 * 1000); // Every 5 minutes
    
    // Threat intelligence updates
    setInterval(() => {
      this.updateThreatIntelligence();
    }, 60 * 60 * 1000); // Every hour
    
    // Security health checks
    setInterval(() => {
      this.performSecurityHealthCheck();
    }, 15 * 60 * 1000); // Every 15 minutes
  }

  // Authentication Security
  async authenticateUser(credentials) {
    try {
      const { username, password, mfaToken, ipAddress, userAgent } = credentials;
      
      logger.info(`Authentication attempt for user: ${username}`);
      
      // Check if account is locked
      if (this.isAccountLocked(username)) {
        await this.logSecurityEvent('authentication-blocked', {
          username,
          reason: 'account-locked',
          ipAddress,
          userAgent
        });
        
        throw new Error('Account is temporarily locked due to multiple failed attempts');
      }
      
      // Check for suspicious IP
      if (this.isSuspiciousIP(ipAddress)) {
        await this.logSecurityEvent('authentication-blocked', {
          username,
          reason: 'suspicious-ip',
          ipAddress,
          userAgent
        });
        
        throw new Error('Authentication blocked from suspicious IP address');
      }
      
      // Validate credentials (mock implementation)
      const user = await this.validateCredentials(username, password);
      if (!user) {
        await this.handleFailedAuthentication(username, ipAddress, userAgent);
        throw new Error('Invalid credentials');
      }
      
      // Check MFA if required
      if (this.isMFARequired(user)) {
        if (!mfaToken || !this.validateMFAToken(user, mfaToken)) {
          await this.logSecurityEvent('mfa-failed', {
            username,
            ipAddress,
            userAgent
          });
          
          throw new Error('Multi-factor authentication required');
        }
      }
      
      // Create session
      const sessionId = await this.createSession(user, ipAddress, userAgent);
      
      // Clear failed attempts
      this.failedLoginAttempts.delete(username);
      
      // Log successful authentication
      await this.logSecurityEvent('authentication-success', {
        username,
        sessionId,
        ipAddress,
        userAgent
      });
      
      this.securityMetrics.successfulAuthentications++;
      
      return {
        sessionId,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          permissions: this.getUserPermissions(user.role)
        },
        expiresAt: Date.now() + this.securityPolicies.authentication.sessionTimeout
      };
      
    } catch (error) {
      logger.error('Authentication error:', error);
      this.securityMetrics.failedAuthentications++;
      throw error;
    }
  }

  async createSession(user, ipAddress, userAgent) {
    const sessionId = uuidv4();
    const now = Date.now();
    
    const session = {
      id: sessionId,
      userId: user.id,
      username: user.username,
      role: user.role,
      ipAddress,
      userAgent,
      createdAt: now,
      lastActivity: now,
      expiresAt: now + this.securityPolicies.authentication.sessionTimeout,
      isActive: true,
      permissions: this.getUserPermissions(user.role)
    };
    
    this.activeSessions.set(sessionId, session);
    this.securityMetrics.activeSessions++;
    
    return sessionId;
  }

  async validateSession(sessionId, ipAddress) {
    const session = this.activeSessions.get(sessionId);
    
    if (!session) {
      await this.logSecurityEvent('invalid-session', {
        sessionId,
        ipAddress,
        reason: 'session-not-found'
      });
      return null;
    }
    
    if (!session.isActive) {
      await this.logSecurityEvent('invalid-session', {
        sessionId,
        ipAddress,
        reason: 'session-inactive'
      });
      return null;
    }
    
    if (session.expiresAt < Date.now()) {
      await this.expireSession(sessionId, 'timeout');
      return null;
    }
    
    // Check IP consistency (optional security measure)
    if (session.ipAddress !== ipAddress) {
      await this.logSecurityEvent('session-ip-mismatch', {
        sessionId,
        originalIP: session.ipAddress,
        currentIP: ipAddress
      });
      
      // Could terminate session or require re-authentication
      // For now, we'll allow but log the event
    }
    
    // Update last activity
    session.lastActivity = Date.now();
    
    return session;
  }

  async expireSession(sessionId, reason = 'manual') {
    const session = this.activeSessions.get(sessionId);
    
    if (session) {
      session.isActive = false;
      session.expiredAt = Date.now();
      session.expiredReason = reason;
      
      this.securityMetrics.activeSessions--;
      
      await this.logSecurityEvent('session-expired', {
        sessionId,
        userId: session.userId,
        reason
      });
    }
  }

  // Authorization Security
  async authorizeAccess(sessionId, resource, action, context = {}) {
    try {
      const session = await this.validateSession(sessionId, context.ipAddress);
      
      if (!session) {
        await this.logSecurityEvent('authorization-failed', {
          sessionId,
          resource,
          action,
          reason: 'invalid-session',
          context
        });
        return false;
      }
      
      // Check resource permissions
      const hasPermission = this.checkResourcePermission(session.role, resource, action);
      
      if (!hasPermission) {
        await this.logSecurityEvent('authorization-failed', {
          sessionId,
          userId: session.userId,
          resource,
          action,
          role: session.role,
          reason: 'insufficient-permissions',
          context
        });
        return false;
      }
      
      // Check contextual permissions (time-based, location-based, etc.)
      const contextualCheck = await this.checkContextualPermissions(session, resource, action, context);
      
      if (!contextualCheck.allowed) {
        await this.logSecurityEvent('authorization-failed', {
          sessionId,
          userId: session.userId,
          resource,
          action,
          reason: contextualCheck.reason,
          context
        });
        return false;
      }
      
      // Log successful authorization
      await this.logSecurityEvent('authorization-success', {
        sessionId,
        userId: session.userId,
        resource,
        action,
        role: session.role,
        context
      });
      
      return true;
      
    } catch (error) {
      logger.error('Authorization error:', error);
      return false;
    }
  }

  checkResourcePermission(userRole, resource, action) {
    const resourcePermissions = this.securityPolicies.authorization.resourcePermissions[resource];
    
    if (!resourcePermissions) {
      return false; // Resource not defined, deny by default
    }
    
    return resourcePermissions.includes(userRole);
  }

  async checkContextualPermissions(session, resource, action, context) {
    // Time-based access control
    if (context.timeRestricted) {
      const now = new Date();
      const hour = now.getHours();
      
      if (hour < 6 || hour > 22) { // Outside business hours
        return {
          allowed: false,
          reason: 'outside-business-hours'
        };
      }
    }
    
    // Location-based access control
    if (context.locationRestricted && context.country) {
      const geoBlocking = this.securityPolicies.networkSecurity.geoBlocking;
      
      if (geoBlocking.enabled) {
        if (geoBlocking.blockedCountries.includes(context.country)) {
          return {
            allowed: false,
            reason: 'geo-blocked'
          };
        }
        
        if (geoBlocking.allowedCountries.length > 0 && 
            !geoBlocking.allowedCountries.includes(context.country)) {
          return {
            allowed: false,
            reason: 'geo-not-allowed'
          };
        }
      }
    }
    
    // Risk-based access control
    const riskScore = await this.calculateRiskScore(session, context);
    
    if (riskScore > 80) { // High risk
      return {
        allowed: false,
        reason: 'high-risk-detected',
        riskScore
      };
    }
    
    return { allowed: true };
  }

  async calculateRiskScore(session, context) {
    let riskScore = 0;
    
    // IP reputation
    if (this.isSuspiciousIP(session.ipAddress)) {
      riskScore += 30;
    }
    
    // Unusual activity patterns
    const activityPattern = await this.analyzeActivityPattern(session.userId);
    if (activityPattern.unusual) {
      riskScore += 20;
    }
    
    // Time-based risk
    const now = new Date();
    const hour = now.getHours();
    if (hour < 6 || hour > 22) {
      riskScore += 10;
    }
    
    // Geographic risk
    if (context.country && this.isHighRiskCountry(context.country)) {
      riskScore += 25;
    }
    
    // Device fingerprint changes
    if (context.deviceFingerprint && 
        session.deviceFingerprint && 
        context.deviceFingerprint !== session.deviceFingerprint) {
      riskScore += 15;
    }
    
    return Math.min(riskScore, 100); // Cap at 100
  }

  // Threat Detection
  async detectThreats(requestData) {
    const threats = [];
    
    // SQL Injection detection
    const sqlInjectionThreat = this.detectSQLInjection(requestData);
    if (sqlInjectionThreat) {
      threats.push(sqlInjectionThreat);
    }
    
    // XSS detection
    const xssThreat = this.detectXSS(requestData);
    if (xssThreat) {
      threats.push(xssThreat);
    }
    
    // Command injection detection
    const commandInjectionThreat = this.detectCommandInjection(requestData);
    if (commandInjectionThreat) {
      threats.push(commandInjectionThreat);
    }
    
    // Brute force detection
    const bruteForceThreats = await this.detectBruteForce(requestData);
    threats.push(...bruteForceThreats);
    
    // Anomaly detection
    const anomalies = await this.detectAnomalies(requestData);
    threats.push(...anomalies);
    
    // Process detected threats
    for (const threat of threats) {
      await this.processThreat(threat);
    }
    
    return threats;
  }

  detectSQLInjection(requestData) {
    const patterns = this.securityPolicies.threatDetection.sqlInjectionPatterns;
    
    for (const [key, value] of Object.entries(requestData)) {
      if (typeof value === 'string') {
        for (const pattern of patterns) {
          if (pattern.test(value)) {
            return {
              type: 'sql-injection',
              severity: 'high',
              field: key,
              value: value.substring(0, 100), // Truncate for logging
              pattern: pattern.toString(),
              timestamp: Date.now()
            };
          }
        }
      }
    }
    
    return null;
  }

  detectXSS(requestData) {
    const patterns = this.securityPolicies.threatDetection.xssPatterns;
    
    for (const [key, value] of Object.entries(requestData)) {
      if (typeof value === 'string') {
        for (const pattern of patterns) {
          if (pattern.test(value)) {
            return {
              type: 'xss',
              severity: 'medium',
              field: key,
              value: value.substring(0, 100),
              pattern: pattern.toString(),
              timestamp: Date.now()
            };
          }
        }
      }
    }
    
    return null;
  }

  detectCommandInjection(requestData) {
    const patterns = this.securityPolicies.threatDetection.commandInjectionPatterns;
    
    for (const [key, value] of Object.entries(requestData)) {
      if (typeof value === 'string') {
        for (const pattern of patterns) {
          if (pattern.test(value)) {
            return {
              type: 'command-injection',
              severity: 'critical',
              field: key,
              value: value.substring(0, 100),
              pattern: pattern.toString(),
              timestamp: Date.now()
            };
          }
        }
      }
    }
    
    return null;
  }

  async detectBruteForce(requestData) {
    const threats = [];
    const { ipAddress, username, endpoint } = requestData;
    
    // Check IP-based brute force
    if (ipAddress) {
      const ipAttempts = this.getFailedAttemptsByIP(ipAddress);
      if (ipAttempts >= this.securityPolicies.threatDetection.bruteForceThreshold) {
        threats.push({
          type: 'brute-force-ip',
          severity: 'high',
          ipAddress,
          attempts: ipAttempts,
          timestamp: Date.now()
        });
      }
    }
    
    // Check username-based brute force
    if (username) {
      const userAttempts = this.getFailedAttemptsByUser(username);
      if (userAttempts >= this.securityPolicies.threatDetection.bruteForceThreshold) {
        threats.push({
          type: 'brute-force-user',
          severity: 'high',
          username,
          attempts: userAttempts,
          timestamp: Date.now()
        });
      }
    }
    
    return threats;
  }

  async detectAnomalies(requestData) {
    if (!this.securityPolicies.threatDetection.anomalyDetectionEnabled) {
      return [];
    }
    
    const anomalies = [];
    const { userId, ipAddress, userAgent, timestamp } = requestData;
    
    // Detect unusual access patterns
    if (userId) {
      const userPattern = await this.getUserAccessPattern(userId);
      
      // Unusual time access
      if (this.isUnusualAccessTime(userPattern, timestamp)) {
        anomalies.push({
          type: 'unusual-access-time',
          severity: 'medium',
          userId,
          timestamp,
          expectedPattern: userPattern.timePattern
        });
      }
      
      // Unusual location access
      if (this.isUnusualLocation(userPattern, ipAddress)) {
        anomalies.push({
          type: 'unusual-location',
          severity: 'medium',
          userId,
          ipAddress,
          expectedLocations: userPattern.locationPattern
        });
      }
    }
    
    // Detect suspicious user agents
    if (this.isSuspiciousUserAgent(userAgent)) {
      anomalies.push({
        type: 'suspicious-user-agent',
        severity: 'low',
        userAgent,
        timestamp
      });
    }
    
    return anomalies;
  }

  async processThreat(threat) {
    logger.warn('Threat detected:', threat);
    
    // Log security event
    await this.logSecurityEvent('threat-detected', threat);
    
    // Update metrics
    this.securityMetrics.threatsDetected++;
    
    // Take immediate action based on threat severity
    switch (threat.severity) {
      case 'critical':
        await this.handleCriticalThreat(threat);
        break;
      case 'high':
        await this.handleHighThreat(threat);
        break;
      case 'medium':
        await this.handleMediumThreat(threat);
        break;
      case 'low':
        await this.handleLowThreat(threat);
        break;
    }
    
    // Create security incident if necessary
    if (['critical', 'high'].includes(threat.severity)) {
      await this.createSecurityIncident(threat);
    }
  }

  async handleCriticalThreat(threat) {
    logger.error('Critical threat detected - taking immediate action:', threat);
    
    // Block IP immediately
    if (threat.ipAddress) {
      await this.blockIP(threat.ipAddress, 'critical-threat');
    }
    
    // Terminate related sessions
    if (threat.userId) {
      await this.terminateUserSessions(threat.userId, 'critical-threat');
    }
    
    // Send immediate alert
    this.eventBus.emit('critical-security-alert', {
      threat,
      timestamp: Date.now(),
      action: 'immediate-block'
    });
  }

  async handleHighThreat(threat) {
    logger.warn('High threat detected:', threat);
    
    // Temporary IP block
    if (threat.ipAddress) {
      await this.blockIP(threat.ipAddress, 'high-threat', 60 * 60 * 1000); // 1 hour
    }
    
    // Require additional authentication
    if (threat.userId) {
      await this.requireAdditionalAuth(threat.userId);
    }
    
    // Send alert
    this.eventBus.emit('high-security-alert', {
      threat,
      timestamp: Date.now()
    });
  }

  async handleMediumThreat(threat) {
    logger.info('Medium threat detected:', threat);
    
    // Rate limit the source
    if (threat.ipAddress) {
      await this.applyRateLimit(threat.ipAddress, 'medium-threat');
    }
    
    // Log for analysis
    await this.logThreatForAnalysis(threat);
  }

  async handleLowThreat(threat) {
    logger.debug('Low threat detected:', threat);
    
    // Just log for monitoring
    await this.logThreatForAnalysis(threat);
  }

  // Rate Limiting
  async checkRateLimit(identifier, endpoint, ipAddress) {
    const rateLimits = this.securityPolicies.networkSecurity.rateLimiting;
    const limit = rateLimits[endpoint] || rateLimits['default'] || { requests: 60, window: 60 * 1000 };
    
    const key = `${identifier}:${endpoint}`;
    const now = Date.now();
    
    let tracking = this.rateLimitTracking.get(key);
    
    if (!tracking) {
      tracking = {
        requests: [],
        blocked: false,
        firstRequest: now
      };
      this.rateLimitTracking.set(key, tracking);
    }
    
    // Clean old requests outside the window
    tracking.requests = tracking.requests.filter(timestamp => 
      now - timestamp < limit.window
    );
    
    // Check if limit exceeded
    if (tracking.requests.length >= limit.requests) {
      tracking.blocked = true;
      
      await this.logSecurityEvent('rate-limit-exceeded', {
        identifier,
        endpoint,
        ipAddress,
        requests: tracking.requests.length,
        limit: limit.requests,
        window: limit.window
      });
      
      this.securityMetrics.blockedRequests++;
      
      return {
        allowed: false,
        reason: 'rate-limit-exceeded',
        retryAfter: limit.window - (now - tracking.requests[0])
      };
    }
    
    // Add current request
    tracking.requests.push(now);
    
    return {
      allowed: true,
      remaining: limit.requests - tracking.requests.length,
      resetTime: now + limit.window
    };
  }

  // Security Event Logging
  async logSecurityEvent(eventType, eventData) {
    const eventId = uuidv4();
    const timestamp = Date.now();
    
    const securityEvent = {
      id: eventId,
      type: eventType,
      timestamp,
      data: eventData,
      severity: this.getEventSeverity(eventType),
      source: 'security-monitor',
      processed: false
    };
    
    this.securityEvents.set(eventId, securityEvent);
    this.securityMetrics.totalSecurityEvents++;
    this.securityMetrics.eventsByType[this.getEventCategory(eventType)]++;
    
    // Emit event for real-time processing
    this.eventBus.emit('security-event-logged', securityEvent);
    
    // Log to external systems if configured
    await this.forwardSecurityEvent(securityEvent);
    
    return eventId;
  }

  getEventSeverity(eventType) {
    const severityMap = {
      'authentication-success': 'info',
      'authentication-failed': 'warning',
      'authentication-blocked': 'warning',
      'authorization-success': 'info',
      'authorization-failed': 'warning',
      'session-expired': 'info',
      'threat-detected': 'error',
      'critical-security-alert': 'critical',
      'high-security-alert': 'error',
      'rate-limit-exceeded': 'warning',
      'suspicious-activity': 'warning',
      'security-violation': 'error',
      'vulnerability-detected': 'error',
      'data-breach': 'critical'
    };
    
    return severityMap[eventType] || 'info';
  }

  getEventCategory(eventType) {
    if (eventType.includes('authentication') || eventType.includes('session')) {
      return 'authentication';
    }
    if (eventType.includes('authorization')) {
      return 'authorization';
    }
    if (eventType.includes('data')) {
      return 'data-access';
    }
    if (eventType.includes('network') || eventType.includes('rate-limit')) {
      return 'network';
    }
    if (eventType.includes('threat') || eventType.includes('attack')) {
      return 'intrusion';
    }
    if (eventType.includes('breach')) {
      return 'data-breach';
    }
    if (eventType.includes('violation')) {
      return 'policy-violation';
    }
    
    return 'other';
  }

  // Security Incident Management
  async createSecurityIncident(threat) {
    const incidentId = uuidv4();
    const timestamp = Date.now();
    
    const incident = {
      id: incidentId,
      type: threat.type,
      severity: threat.severity,
      status: 'open',
      createdAt: timestamp,
      updatedAt: timestamp,
      threat,
      affectedSystems: this.identifyAffectedSystems(threat),
      containmentActions: [],
      investigationNotes: [],
      resolution: null,
      resolvedAt: null,
      assignedTo: null,
      escalated: false
    };
    
    this.securityIncidents.set(incidentId, incident);
    this.securityMetrics.totalIncidents++;
    this.securityMetrics.incidentsByType[threat.severity]++;
    
    // Auto-assign based on severity
    if (threat.severity === 'critical') {
      incident.assignedTo = 'security-team-lead';
      incident.escalated = true;
    }
    
    // Emit incident created event
    this.eventBus.emit('security-incident-created', {
      incidentId,
      severity: incident.severity,
      type: incident.type,
      timestamp
    });
    
    logger.error(`Security incident created: ${incidentId}`, incident);
    
    return incidentId;
  }

  identifyAffectedSystems(threat) {
    const systems = [];
    
    // Based on threat type, identify potentially affected systems
    switch (threat.type) {
      case 'sql-injection':
        systems.push('database', 'api-server');
        break;
      case 'xss':
        systems.push('web-frontend', 'user-sessions');
        break;
      case 'brute-force-ip':
      case 'brute-force-user':
        systems.push('authentication-service', 'user-accounts');
        break;
      case 'command-injection':
        systems.push('application-server', 'operating-system');
        break;
      default:
        systems.push('unknown');
    }
    
    return systems;
  }

  // Utility Methods
  async validateCredentials(username, password) {
    // Mock implementation - in production, this would check against a secure user store
    const users = {
      'admin': { id: '1', username: 'admin', role: 'admin', passwordHash: 'hashed_password' },
      'user': { id: '2', username: 'user', role: 'user', passwordHash: 'hashed_password' },
      'moderator': { id: '3', username: 'moderator', role: 'moderator', passwordHash: 'hashed_password' }
    };
    
    const user = users[username];
    if (!user) {
      return null;
    }
    
    // In production, use proper password hashing (bcrypt, scrypt, etc.)
    const isValidPassword = this.verifyPassword(password, user.passwordHash);
    
    return isValidPassword ? user : null;
  }

  verifyPassword(password, hash) {
    // Mock implementation - use proper password verification in production
    return crypto.createHash('sha256').update(password).digest('hex') === hash || password === 'password';
  }

  isMFARequired(user) {
    const authPolicy = this.securityPolicies.authentication;
    
    if (user.role === 'admin' && authPolicy.mfaRequiredForAdmin) {
      return true;
    }
    
    return authPolicy.mfaRequired;
  }

  validateMFAToken(user, token) {
    // Mock implementation - in production, validate against TOTP/SMS/etc.
    return token === '123456';
  }

  getUserPermissions(role) {
    const roleHierarchy = this.securityPolicies.authorization.roleHierarchy;
    return roleHierarchy[role] || ['user'];
  }

  isAccountLocked(username) {
    const lockInfo = this.lockedAccounts.get(username);
    
    if (!lockInfo) {
      return false;
    }
    
    // Check if lock has expired
    if (Date.now() > lockInfo.lockedUntil) {
      this.lockedAccounts.delete(username);
      return false;
    }
    
    return true;
  }

  async handleFailedAuthentication(username, ipAddress, userAgent) {
    // Track failed attempts by username
    let userAttempts = this.failedLoginAttempts.get(username) || [];
    userAttempts.push({
      timestamp: Date.now(),
      ipAddress,
      userAgent
    });
    
    // Keep only recent attempts (last hour)
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    userAttempts = userAttempts.filter(attempt => attempt.timestamp > oneHourAgo);
    
    this.failedLoginAttempts.set(username, userAttempts);
    
    // Lock account if threshold exceeded
    const maxAttempts = this.securityPolicies.authentication.maxLoginAttempts;
    if (userAttempts.length >= maxAttempts) {
      const lockDuration = this.securityPolicies.authentication.lockoutDuration;
      
      this.lockedAccounts.set(username, {
        lockedAt: Date.now(),
        lockedUntil: Date.now() + lockDuration,
        reason: 'max-failed-attempts',
        attempts: userAttempts.length
      });
      
      await this.logSecurityEvent('account-locked', {
        username,
        attempts: userAttempts.length,
        lockDuration,
        ipAddress,
        userAgent
      });
    }
    
    await this.logSecurityEvent('authentication-failed', {
      username,
      attempts: userAttempts.length,
      ipAddress,
      userAgent
    });
  }

  isSuspiciousIP(ipAddress) {
    return this.threatIntelligence.knownMaliciousIPs.has(ipAddress) ||
           this.securityPolicies.networkSecurity.ipBlacklist.includes(ipAddress);
  }

  isSuspiciousUserAgent(userAgent) {
    return this.threatIntelligence.suspiciousUserAgents.has(userAgent);
  }

  isHighRiskCountry(country) {
    const highRiskCountries = ['XX', 'YY']; // Mock high-risk countries
    return highRiskCountries.includes(country);
  }

  getFailedAttemptsByIP(ipAddress) {
    let count = 0;
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    
    for (const attempts of this.failedLoginAttempts.values()) {
      count += attempts.filter(attempt => 
        attempt.ipAddress === ipAddress && attempt.timestamp > oneHourAgo
      ).length;
    }
    
    return count;
  }

  getFailedAttemptsByUser(username) {
    const attempts = this.failedLoginAttempts.get(username) || [];
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    
    return attempts.filter(attempt => attempt.timestamp > oneHourAgo).length;
  }

  async getUserAccessPattern(userId) {
    // Mock implementation - would analyze historical access patterns
    return {
      timePattern: {
        usualHours: [9, 10, 11, 12, 13, 14, 15, 16, 17],
        timezone: 'UTC'
      },
      locationPattern: {
        usualCountries: ['US', 'CA'],
        usualIPs: ['192.168.1.1', '10.0.0.1']
      }
    };
  }

  isUnusualAccessTime(pattern, timestamp) {
    const date = new Date(timestamp);
    const hour = date.getUTCHours();
    
    return !pattern.timePattern.usualHours.includes(hour);
  }

  isUnusualLocation(pattern, ipAddress) {
    // Mock implementation - would use IP geolocation
    return !pattern.locationPattern.usualIPs.includes(ipAddress);
  }

  async blockIP(ipAddress, reason, duration = null) {
    logger.warn(`Blocking IP ${ipAddress} for reason: ${reason}`);
    
    this.securityPolicies.networkSecurity.ipBlacklist.push(ipAddress);
    
    if (duration) {
      // Temporary block
      setTimeout(() => {
        const index = this.securityPolicies.networkSecurity.ipBlacklist.indexOf(ipAddress);
        if (index > -1) {
          this.securityPolicies.networkSecurity.ipBlacklist.splice(index, 1);
          logger.info(`Temporary IP block expired for ${ipAddress}`);
        }
      }, duration);
    }
    
    await this.logSecurityEvent('ip-blocked', {
      ipAddress,
      reason,
      duration,
      temporary: !!duration
    });
  }

  async terminateUserSessions(userId, reason) {
    logger.warn(`Terminating all sessions for user ${userId} due to: ${reason}`);
    
    let terminatedCount = 0;
    
    for (const [sessionId, session] of this.activeSessions) {
      if (session.userId === userId && session.isActive) {
        await this.expireSession(sessionId, reason);
        terminatedCount++;
      }
    }
    
    await this.logSecurityEvent('user-sessions-terminated', {
      userId,
      reason,
      terminatedCount
    });
  }

  async requireAdditionalAuth(userId) {
    // Mark user as requiring additional authentication
    // This would integrate with the authentication system
    
    await this.logSecurityEvent('additional-auth-required', {
      userId,
      timestamp: Date.now()
    });
  }

  async applyRateLimit(ipAddress, reason) {
    // Apply stricter rate limiting to the IP
    const key = `${ipAddress}:security-limit`;
    
    this.rateLimitTracking.set(key, {
      requests: [],
      blocked: true,
      reason,
      appliedAt: Date.now()
    });
    
    await this.logSecurityEvent('rate-limit-applied', {
      ipAddress,
      reason
    });
  }

  async logThreatForAnalysis(threat) {
    // Store threat data for analysis and machine learning
    const analysisData = {
      ...threat,
      storedAt: Date.now(),
      analyzed: false
    };
    
    // In production, this would be stored in a threat intelligence database
    logger.debug('Threat logged for analysis:', analysisData);
  }

  async forwardSecurityEvent(securityEvent) {
    // Forward to external SIEM systems, log aggregators, etc.
    // Mock implementation
    if (securityEvent.severity === 'critical' || securityEvent.severity === 'error') {
      logger.error('Security event forwarded to SIEM:', securityEvent);
    }
  }

  async loadThreatIntelligence() {
    logger.info('Loading threat intelligence data');
    
    // Mock threat intelligence data
    this.threatIntelligence.knownMaliciousIPs.add('192.168.1.100');
    this.threatIntelligence.knownMaliciousIPs.add('10.0.0.100');
    
    this.threatIntelligence.suspiciousUserAgents.add('BadBot/1.0');
    this.threatIntelligence.suspiciousUserAgents.add('MaliciousScanner');
    
    this.threatIntelligence.compromisedCredentials.add('admin:password123');
    
    logger.info('Threat intelligence loaded');
  }

  async updateThreatIntelligence() {
    logger.debug('Updating threat intelligence');
    
    // In production, this would fetch from threat intelligence feeds
    // For now, just log the update
    logger.debug('Threat intelligence updated');
  }

  // Monitoring and Maintenance
  monitorActiveSessions() {
    const now = Date.now();
    let expiredCount = 0;
    
    for (const [sessionId, session] of this.activeSessions) {
      if (session.isActive && session.expiresAt < now) {
        this.expireSession(sessionId, 'timeout');
        expiredCount++;
      }
    }
    
    if (expiredCount > 0) {
      logger.debug(`Expired ${expiredCount} sessions`);
    }
  }

  cleanupExpiredData() {
    const now = Date.now();
    const retentionPolicies = this.securityPolicies.dataProtection.dataRetention;
    
    // Clean up old security events
    const eventRetention = retentionPolicies.logs;
    let cleanedEvents = 0;
    
    for (const [eventId, event] of this.securityEvents) {
      if (now - event.timestamp > eventRetention) {
        this.securityEvents.delete(eventId);
        cleanedEvents++;
      }
    }
    
    // Clean up old sessions
    const sessionRetention = retentionPolicies.sessions;
    let cleanedSessions = 0;
    
    for (const [sessionId, session] of this.activeSessions) {
      if (!session.isActive && now - session.expiredAt > sessionRetention) {
        this.activeSessions.delete(sessionId);
        cleanedSessions++;
      }
    }
    
    // Clean up old failed login attempts
    const oneHourAgo = now - (60 * 60 * 1000);
    for (const [username, attempts] of this.failedLoginAttempts) {
      const recentAttempts = attempts.filter(attempt => attempt.timestamp > oneHourAgo);
      if (recentAttempts.length === 0) {
        this.failedLoginAttempts.delete(username);
      } else {
        this.failedLoginAttempts.set(username, recentAttempts);
      }
    }
    
    if (cleanedEvents > 0 || cleanedSessions > 0) {
      logger.debug(`Cleaned up ${cleanedEvents} events and ${cleanedSessions} sessions`);
    }
  }

  updateSecurityMetrics() {
    // Update active session count
    this.securityMetrics.activeSessions = Array.from(this.activeSessions.values())
      .filter(session => session.isActive).length;
    
    // Log metrics periodically
    logger.debug('Security metrics updated:', this.securityMetrics);
  }

  async performSecurityHealthCheck() {
    const healthStatus = {
      timestamp: Date.now(),
      status: 'healthy',
      checks: {
        activeSessions: this.securityMetrics.activeSessions < 1000,
        threatDetection: this.securityMetrics.threatsDetected < 100,
        failedAuthentications: this.securityMetrics.failedAuthentications < 1000,
        incidents: this.securityMetrics.totalIncidents < 10
      }
    };
    
    // Check if any health checks failed
    const failedChecks = Object.entries(healthStatus.checks)
      .filter(([check, passed]) => !passed)
      .map(([check]) => check);
    
    if (failedChecks.length > 0) {
      healthStatus.status = 'degraded';
      healthStatus.failedChecks = failedChecks;
      
      logger.warn('Security health check failed:', healthStatus);
      
      this.eventBus.emit('security-health-degraded', healthStatus);
    }
    
    return healthStatus;
  }

  // Event Handlers
  async handleAuthenticationAttempt(event) {
    const { username, password, ipAddress, userAgent, mfaToken } = event.data;
    
    try {
      const result = await this.authenticateUser({
        username,
        password,
        ipAddress,
        userAgent,
        mfaToken
      });
      
      this.eventBus.emit('authentication-success', {
        sessionId: result.sessionId,
        userId: result.user.id,
        username: result.user.username,
        timestamp: Date.now()
      });
      
    } catch (error) {
      this.eventBus.emit('authentication-failed', {
        username,
        error: error.message,
        ipAddress,
        userAgent,
        timestamp: Date.now()
      });
    }
  }

  async handleAuthorizationCheck(event) {
    const { sessionId, resource, action, context } = event.data;
    
    try {
      const authorized = await this.authorizeAccess(sessionId, resource, action, context);
      
      this.eventBus.emit('authorization-result', {
        sessionId,
        resource,
        action,
        authorized,
        timestamp: Date.now()
      });
      
    } catch (error) {
      logger.error('Authorization check error:', error);
    }
  }

  async handleDataAccess(event) {
    const { userId, dataType, operation, context } = event.data;
    
    await this.logSecurityEvent('data-access', {
      userId,
      dataType,
      operation,
      context,
      timestamp: Date.now()
    });
  }

  async handleNetworkRequest(event) {
    const requestData = event.data;
    
    // Perform threat detection
    const threats = await this.detectThreats(requestData);
    
    // Check rate limiting
    const rateLimitResult = await this.checkRateLimit(
      requestData.identifier || requestData.ipAddress,
      requestData.endpoint,
      requestData.ipAddress
    );
    
    if (!rateLimitResult.allowed) {
      this.eventBus.emit('request-blocked', {
        reason: 'rate-limit',
        ...requestData,
        timestamp: Date.now()
      });
    }
  }

  async handleSuspiciousActivity(event) {
    const activityData = event.data;
    
    await this.logSecurityEvent('suspicious-activity', activityData);
    
    // Analyze activity for threat patterns
    const threats = await this.detectThreats(activityData);
    
    if (threats.length > 0) {
      for (const threat of threats) {
        await this.processThreat(threat);
      }
    }
  }

  async handleSecurityViolation(event) {
    const violationData = event.data;
    
    await this.logSecurityEvent('security-violation', violationData);
    
    // Create incident for security violations
    await this.createSecurityIncident({
      type: 'security-violation',
      severity: violationData.severity || 'medium',
      ...violationData
    });
  }

  async handleVulnerabilityDetected(event) {
    const vulnerabilityData = event.data;
    
    await this.logSecurityEvent('vulnerability-detected', vulnerabilityData);
    
    this.securityMetrics.vulnerabilitiesFound++;
    
    // Create incident for high/critical vulnerabilities
    if (['high', 'critical'].includes(vulnerabilityData.severity)) {
      await this.createSecurityIncident({
        type: 'vulnerability',
        ...vulnerabilityData
      });
    }
  }

  // Query Methods
  getSecurityMetrics() {
    return {
      ...this.securityMetrics,
      uptime: Date.now() - this.startTime
    };
  }

  getActiveSessionsInfo() {
    const sessions = Array.from(this.activeSessions.values())
      .filter(session => session.isActive)
      .map(session => ({
        id: session.id,
        userId: session.userId,
        username: session.username,
        role: session.role,
        ipAddress: session.ipAddress,
        createdAt: session.createdAt,
        lastActivity: session.lastActivity,
        expiresAt: session.expiresAt
      }));
    
    return {
      total: sessions.length,
      sessions
    };
  }

  getSecurityEvents(filters = {}) {
    let events = Array.from(this.securityEvents.values());
    
    // Apply filters
    if (filters.type) {
      events = events.filter(event => event.type === filters.type);
    }
    
    if (filters.severity) {
      events = events.filter(event => event.severity === filters.severity);
    }
    
    if (filters.since) {
      events = events.filter(event => event.timestamp >= filters.since);
    }
    
    // Sort by timestamp (newest first)
    events.sort((a, b) => b.timestamp - a.timestamp);
    
    // Limit results
    if (filters.limit) {
      events = events.slice(0, filters.limit);
    }
    
    return events;
  }

  getSecurityIncidents(filters = {}) {
    let incidents = Array.from(this.securityIncidents.values());
    
    // Apply filters
    if (filters.status) {
      incidents = incidents.filter(incident => incident.status === filters.status);
    }
    
    if (filters.severity) {
      incidents = incidents.filter(incident => incident.severity === filters.severity);
    }
    
    // Sort by creation time (newest first)
    incidents.sort((a, b) => b.createdAt - a.createdAt);
    
    return incidents;
  }

  getThreatIntelligence() {
    return {
      maliciousIPs: Array.from(this.threatIntelligence.knownMaliciousIPs),
      suspiciousUserAgents: Array.from(this.threatIntelligence.suspiciousUserAgents),
      compromisedCredentials: this.threatIntelligence.compromisedCredentials.size,
      attackPatterns: this.threatIntelligence.attackPatterns.size
    };
  }

  getComplianceStatus() {
    return {
      frameworks: this.complianceFrameworks,
      lastAssessment: Date.now(),
      overallStatus: 'compliant'
    };
  }

  // Health check
  getHealthStatus() {
    const now = Date.now();
    const uptime = now - this.startTime;
    
    return {
      status: 'healthy',
      uptime,
      activeSessions: this.securityMetrics.activeSessions,
      securityEvents: this.securityEvents.size,
      incidents: this.securityIncidents.size,
      threatsDetected: this.securityMetrics.threatsDetected,
      lastHealthCheck: now
    };
  }

  async shutdown() {
    logger.info('Shutting down Security Monitor');
    
    // Clear all intervals
    clearInterval(this.sessionMonitorInterval);
    clearInterval(this.cleanupInterval);
    clearInterval(this.metricsInterval);
    clearInterval(this.threatIntelligenceInterval);
    clearInterval(this.healthCheckInterval);
    
    // Remove event listeners
    this.eventBus.removeAllListeners('authentication-attempt');
    this.eventBus.removeAllListeners('authorization-check');
    this.eventBus.removeAllListeners('data-access');
    this.eventBus.removeAllListeners('network-request');
    this.eventBus.removeAllListeners('suspicious-activity');
    this.eventBus.removeAllListeners('security-violation');
    this.eventBus.removeAllListeners('vulnerability-detected');
    
    // Expire all active sessions
    for (const sessionId of this.activeSessions.keys()) {
      await this.expireSession(sessionId, 'system-shutdown');
    }
    
    // Clear data structures
    this.activeSessions.clear();
    this.failedLoginAttempts.clear();
    this.lockedAccounts.clear();
    this.securityEvents.clear();
    this.securityIncidents.clear();
    this.rateLimitTracking.clear();
    
    logger.info('Security Monitor shutdown complete');
  }
}