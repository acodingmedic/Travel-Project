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

export class GDPRCompliance extends EventEmitter {
  constructor(eventBus) {
    super();
    this.eventBus = eventBus;
    this.config = getConfig();
    
    // Data subject records
    this.dataSubjects = new Map();
    
    // Consent records
    this.consentRecords = new Map();
    
    // Data processing activities
    this.processingActivities = new Map();
    
    // Data retention policies
    this.retentionPolicies = {
      'search-data': {
        purpose: 'Travel search and recommendations',
        legalBasis: 'legitimate-interest',
        retentionPeriod: 90 * 24 * 60 * 60 * 1000, // 90 days
        categories: ['search-criteria', 'preferences', 'results'],
        automated: true
      },
      'booking-data': {
        purpose: 'Travel booking and transaction processing',
        legalBasis: 'contract',
        retentionPeriod: 7 * 365 * 24 * 60 * 60 * 1000, // 7 years
        categories: ['personal-data', 'payment-data', 'booking-details'],
        automated: false
      },
      'user-preferences': {
        purpose: 'Service personalization and improvement',
        legalBasis: 'consent',
        retentionPeriod: 2 * 365 * 24 * 60 * 60 * 1000, // 2 years
        categories: ['preferences', 'behavior-data', 'analytics'],
        automated: true
      },
      'communication-data': {
        purpose: 'Customer communication and support',
        legalBasis: 'legitimate-interest',
        retentionPeriod: 3 * 365 * 24 * 60 * 60 * 1000, // 3 years
        categories: ['email-data', 'support-tickets', 'notifications'],
        automated: true
      },
      'audit-logs': {
        purpose: 'Security monitoring and compliance',
        legalBasis: 'legitimate-interest',
        retentionPeriod: 1 * 365 * 24 * 60 * 60 * 1000, // 1 year
        categories: ['access-logs', 'system-logs', 'security-events'],
        automated: true
      }
    };
    
    // Data categories and sensitivity levels
    this.dataCategories = {
      'personal-data': {
        name: 'Personal Data',
        sensitivity: 'high',
        examples: ['name', 'email', 'phone', 'address'],
        specialCategory: false,
        encryptionRequired: true
      },
      'special-category': {
        name: 'Special Category Data',
        sensitivity: 'critical',
        examples: ['health-data', 'dietary-requirements', 'accessibility-needs'],
        specialCategory: true,
        encryptionRequired: true
      },
      'behavioral-data': {
        name: 'Behavioral Data',
        sensitivity: 'medium',
        examples: ['search-history', 'preferences', 'click-patterns'],
        specialCategory: false,
        encryptionRequired: false
      },
      'technical-data': {
        name: 'Technical Data',
        sensitivity: 'low',
        examples: ['ip-address', 'browser-info', 'device-info'],
        specialCategory: false,
        encryptionRequired: false
      },
      'transaction-data': {
        name: 'Transaction Data',
        sensitivity: 'high',
        examples: ['payment-info', 'booking-details', 'financial-data'],
        specialCategory: false,
        encryptionRequired: true
      }
    };
    
    // Consent types and purposes
    this.consentTypes = {
      'essential': {
        name: 'Essential Services',
        description: 'Required for basic service functionality',
        required: true,
        withdrawable: false,
        purposes: ['service-delivery', 'security', 'legal-compliance']
      },
      'functional': {
        name: 'Functional Enhancements',
        description: 'Improve user experience and service quality',
        required: false,
        withdrawable: true,
        purposes: ['personalization', 'preferences', 'user-experience']
      },
      'analytics': {
        name: 'Analytics and Insights',
        description: 'Help us understand usage patterns and improve services',
        required: false,
        withdrawable: true,
        purposes: ['analytics', 'service-improvement', 'research']
      },
      'marketing': {
        name: 'Marketing Communications',
        description: 'Send promotional offers and travel recommendations',
        required: false,
        withdrawable: true,
        purposes: ['marketing', 'promotions', 'newsletters']
      },
      'third-party': {
        name: 'Third-party Integrations',
        description: 'Share data with travel partners for enhanced services',
        required: false,
        withdrawable: true,
        purposes: ['partner-services', 'booking-fulfillment', 'enhanced-features']
      }
    };
    
    // Data subject rights
    this.dataSubjectRights = {
      'access': {
        name: 'Right of Access',
        description: 'Request access to personal data we hold',
        responseTime: 30 * 24 * 60 * 60 * 1000, // 30 days
        automated: true
      },
      'rectification': {
        name: 'Right to Rectification',
        description: 'Request correction of inaccurate personal data',
        responseTime: 30 * 24 * 60 * 60 * 1000, // 30 days
        automated: false
      },
      'erasure': {
        name: 'Right to Erasure (Right to be Forgotten)',
        description: 'Request deletion of personal data',
        responseTime: 30 * 24 * 60 * 60 * 1000, // 30 days
        automated: true
      },
      'portability': {
        name: 'Right to Data Portability',
        description: 'Request personal data in a portable format',
        responseTime: 30 * 24 * 60 * 60 * 1000, // 30 days
        automated: true
      },
      'restriction': {
        name: 'Right to Restriction of Processing',
        description: 'Request limitation of data processing',
        responseTime: 30 * 24 * 60 * 60 * 1000, // 30 days
        automated: false
      },
      'objection': {
        name: 'Right to Object',
        description: 'Object to processing based on legitimate interests',
        responseTime: 30 * 24 * 60 * 60 * 1000, // 30 days
        automated: false
      },
      'withdraw-consent': {
        name: 'Right to Withdraw Consent',
        description: 'Withdraw previously given consent',
        responseTime: 24 * 60 * 60 * 1000, // 24 hours
        automated: true
      }
    };
    
    // Privacy impact assessments
    this.privacyImpactAssessments = new Map();
    
    // Data breach incidents
    this.dataBreaches = new Map();
    
    // Statistics
    this.complianceStats = {
      totalDataSubjects: 0,
      totalConsentRecords: 0,
      totalProcessingActivities: 0,
      totalDataSubjectRequests: 0,
      totalDataBreaches: 0,
      consentStats: {
        granted: 0,
        withdrawn: 0,
        expired: 0
      },
      requestStats: {
        access: 0,
        rectification: 0,
        erasure: 0,
        portability: 0,
        restriction: 0,
        objection: 0,
        withdrawConsent: 0
      },
      breachStats: {
        reported: 0,
        resolved: 0,
        pending: 0
      }
    };
    
    this.startTime = Date.now();
  }

  async initialize() {
    logger.info('Initializing GDPR Compliance module');
    
    // Subscribe to data processing events
    this.eventBus.on('data-processing-started', this.handleDataProcessingStarted.bind(this));
    this.eventBus.on('data-processing-completed', this.handleDataProcessingCompleted.bind(this));
    this.eventBus.on('consent-request', this.handleConsentRequest.bind(this));
    this.eventBus.on('consent-withdrawal', this.handleConsentWithdrawal.bind(this));
    this.eventBus.on('data-subject-request', this.handleDataSubjectRequest.bind(this));
    this.eventBus.on('data-breach-detected', this.handleDataBreachDetected.bind(this));
    this.eventBus.on('privacy-check', this.handlePrivacyCheck.bind(this));
    
    // Start maintenance tasks
    this.startMaintenanceTasks();
    
    logger.info('GDPR Compliance module initialized');
  }

  startMaintenanceTasks() {
    // Check data retention policies
    setInterval(() => {
      this.enforceDataRetention();
    }, 24 * 60 * 60 * 1000); // Daily
    
    // Monitor consent expiration
    setInterval(() => {
      this.monitorConsentExpiration();
    }, 60 * 60 * 1000); // Hourly
    
    // Update compliance statistics
    setInterval(() => {
      this.updateComplianceStatistics();
    }, 60 * 60 * 1000); // Hourly
    
    // Check data subject request deadlines
    setInterval(() => {
      this.monitorRequestDeadlines();
    }, 60 * 60 * 1000); // Hourly
  }

  // Data Subject Management
  async registerDataSubject(subjectId, personalData, consentData) {
    try {
      logger.info(`Registering data subject: ${subjectId}`);
      
      // Validate personal data
      this.validatePersonalData(personalData);
      
      // Create data subject record
      const dataSubject = {
        id: subjectId,
        personalData: this.encryptSensitiveData(personalData),
        registrationDate: Date.now(),
        lastUpdated: Date.now(),
        consentHistory: [],
        processingActivities: [],
        dataSubjectRequests: [],
        status: 'active',
        dataCategories: this.categorizePersonalData(personalData),
        retentionSchedule: this.calculateRetentionSchedule(personalData)
      };
      
      this.dataSubjects.set(subjectId, dataSubject);
      
      // Process initial consent
      if (consentData) {
        await this.processConsent(subjectId, consentData);
      }
      
      // Update statistics
      this.complianceStats.totalDataSubjects++;
      
      // Emit registration event
      this.eventBus.emit('data-subject-registered', {
        subjectId,
        dataCategories: dataSubject.dataCategories,
        timestamp: Date.now()
      });
      
      return dataSubject.id;
      
    } catch (error) {
      logger.error('Error registering data subject:', error);
      throw error;
    }
  }

  async updateDataSubject(subjectId, updates) {
    const dataSubject = this.dataSubjects.get(subjectId);
    if (!dataSubject) {
      throw new Error(`Data subject ${subjectId} not found`);
    }
    
    logger.info(`Updating data subject: ${subjectId}`);
    
    // Validate updates
    this.validatePersonalData(updates);
    
    // Update personal data
    dataSubject.personalData = {
      ...dataSubject.personalData,
      ...this.encryptSensitiveData(updates)
    };
    
    dataSubject.lastUpdated = Date.now();
    dataSubject.dataCategories = this.categorizePersonalData(dataSubject.personalData);
    
    // Emit update event
    this.eventBus.emit('data-subject-updated', {
      subjectId,
      updates: Object.keys(updates),
      timestamp: Date.now()
    });
  }

  // Consent Management
  async processConsent(subjectId, consentData) {
    try {
      logger.info(`Processing consent for subject: ${subjectId}`);
      
      const consentId = uuidv4();
      const timestamp = Date.now();
      
      // Validate consent data
      this.validateConsentData(consentData);
      
      // Create consent record
      const consentRecord = {
        id: consentId,
        subjectId,
        consentTypes: consentData.consentTypes || [],
        purposes: consentData.purposes || [],
        grantedAt: timestamp,
        expiresAt: consentData.expiresAt || (timestamp + (2 * 365 * 24 * 60 * 60 * 1000)), // 2 years default
        withdrawnAt: null,
        status: 'granted',
        version: consentData.version || '1.0',
        ipAddress: consentData.ipAddress,
        userAgent: consentData.userAgent,
        method: consentData.method || 'explicit',
        evidence: consentData.evidence || {},
        lastUpdated: timestamp
      };
      
      this.consentRecords.set(consentId, consentRecord);
      
      // Update data subject record
      const dataSubject = this.dataSubjects.get(subjectId);
      if (dataSubject) {
        dataSubject.consentHistory.push(consentId);
      }
      
      // Update statistics
      this.complianceStats.totalConsentRecords++;
      this.complianceStats.consentStats.granted++;
      
      // Emit consent granted event
      this.eventBus.emit('consent-granted', {
        consentId,
        subjectId,
        consentTypes: consentRecord.consentTypes,
        purposes: consentRecord.purposes,
        timestamp
      });
      
      return consentId;
      
    } catch (error) {
      logger.error('Error processing consent:', error);
      throw error;
    }
  }

  async withdrawConsent(subjectId, consentId, reason) {
    const consentRecord = this.consentRecords.get(consentId);
    if (!consentRecord || consentRecord.subjectId !== subjectId) {
      throw new Error(`Consent record ${consentId} not found for subject ${subjectId}`);
    }
    
    if (consentRecord.status === 'withdrawn') {
      throw new Error('Consent already withdrawn');
    }
    
    logger.info(`Withdrawing consent ${consentId} for subject ${subjectId}`);
    
    // Update consent record
    consentRecord.status = 'withdrawn';
    consentRecord.withdrawnAt = Date.now();
    consentRecord.withdrawalReason = reason;
    consentRecord.lastUpdated = Date.now();
    
    // Update statistics
    this.complianceStats.consentStats.withdrawn++;
    
    // Stop related processing activities
    await this.stopProcessingForWithdrawnConsent(consentId);
    
    // Emit consent withdrawn event
    this.eventBus.emit('consent-withdrawn', {
      consentId,
      subjectId,
      reason,
      timestamp: Date.now()
    });
  }

  // Data Processing Activity Tracking
  async startProcessingActivity(activityId, subjectId, purpose, dataCategories, legalBasis) {
    try {
      logger.info(`Starting processing activity: ${activityId}`);
      
      // Validate legal basis
      if (!this.validateLegalBasis(subjectId, purpose, legalBasis)) {
        throw new Error(`Invalid legal basis for processing: ${legalBasis}`);
      }
      
      // Create processing activity record
      const activity = {
        id: activityId,
        subjectId,
        purpose,
        dataCategories,
        legalBasis,
        startTime: Date.now(),
        endTime: null,
        status: 'active',
        consentRequired: legalBasis === 'consent',
        consentIds: [],
        dataTransfers: [],
        retentionPeriod: this.getRetentionPeriod(purpose),
        processingDetails: {
          automated: false,
          profiling: false,
          thirdPartySharing: false
        }
      };
      
      // Check consent if required
      if (activity.consentRequired) {
        const validConsent = this.checkValidConsent(subjectId, purpose);
        if (!validConsent) {
          throw new Error('Valid consent required for processing');
        }
        activity.consentIds = validConsent.map(c => c.id);
      }
      
      this.processingActivities.set(activityId, activity);
      
      // Update data subject record
      const dataSubject = this.dataSubjects.get(subjectId);
      if (dataSubject) {
        dataSubject.processingActivities.push(activityId);
      }
      
      // Update statistics
      this.complianceStats.totalProcessingActivities++;
      
      // Emit processing started event
      this.eventBus.emit('processing-activity-started', {
        activityId,
        subjectId,
        purpose,
        legalBasis,
        timestamp: Date.now()
      });
      
      return activityId;
      
    } catch (error) {
      logger.error('Error starting processing activity:', error);
      throw error;
    }
  }

  async endProcessingActivity(activityId, result) {
    const activity = this.processingActivities.get(activityId);
    if (!activity) {
      throw new Error(`Processing activity ${activityId} not found`);
    }
    
    logger.info(`Ending processing activity: ${activityId}`);
    
    activity.endTime = Date.now();
    activity.status = 'completed';
    activity.result = result;
    activity.duration = activity.endTime - activity.startTime;
    
    // Emit processing completed event
    this.eventBus.emit('processing-activity-completed', {
      activityId,
      subjectId: activity.subjectId,
      purpose: activity.purpose,
      duration: activity.duration,
      timestamp: activity.endTime
    });
  }

  // Data Subject Rights Handling
  async handleDataSubjectRequest(requestType, subjectId, requestData) {
    try {
      logger.info(`Handling ${requestType} request for subject: ${subjectId}`);
      
      const requestId = uuidv4();
      const timestamp = Date.now();
      
      // Validate request
      if (!this.dataSubjectRights[requestType]) {
        throw new Error(`Unknown request type: ${requestType}`);
      }
      
      const rightInfo = this.dataSubjectRights[requestType];
      
      // Create request record
      const request = {
        id: requestId,
        type: requestType,
        subjectId,
        requestData,
        submittedAt: timestamp,
        responseDeadline: timestamp + rightInfo.responseTime,
        status: 'pending',
        automated: rightInfo.automated,
        assignedTo: null,
        response: null,
        completedAt: null,
        evidence: []
      };
      
      // Update data subject record
      const dataSubject = this.dataSubjects.get(subjectId);
      if (dataSubject) {
        dataSubject.dataSubjectRequests.push(requestId);
      }
      
      // Process automated requests immediately
      if (rightInfo.automated) {
        await this.processAutomatedRequest(request);
      } else {
        // Queue for manual processing
        this.eventBus.emit('manual-review-required', {
          requestId,
          requestType,
          subjectId,
          deadline: request.responseDeadline,
          timestamp
        });
      }
      
      // Update statistics
      this.complianceStats.totalDataSubjectRequests++;
      this.complianceStats.requestStats[requestType.replace('-', '')]++;
      
      // Emit request received event
      this.eventBus.emit('data-subject-request-received', {
        requestId,
        requestType,
        subjectId,
        automated: rightInfo.automated,
        deadline: request.responseDeadline,
        timestamp
      });
      
      return requestId;
      
    } catch (error) {
      logger.error('Error handling data subject request:', error);
      throw error;
    }
  }

  async processAutomatedRequest(request) {
    try {
      logger.info(`Processing automated request: ${request.id}`);
      
      let response;
      
      switch (request.type) {
        case 'access':
          response = await this.processAccessRequest(request);
          break;
        case 'erasure':
          response = await this.processErasureRequest(request);
          break;
        case 'portability':
          response = await this.processPortabilityRequest(request);
          break;
        case 'withdraw-consent':
          response = await this.processConsentWithdrawalRequest(request);
          break;
        default:
          throw new Error(`Automated processing not available for ${request.type}`);
      }
      
      // Update request record
      request.status = 'completed';
      request.response = response;
      request.completedAt = Date.now();
      
      // Emit completion event
      this.eventBus.emit('data-subject-request-completed', {
        requestId: request.id,
        requestType: request.type,
        subjectId: request.subjectId,
        response,
        timestamp: request.completedAt
      });
      
    } catch (error) {
      logger.error('Error processing automated request:', error);
      
      request.status = 'failed';
      request.response = { error: error.message };
      request.completedAt = Date.now();
      
      throw error;
    }
  }

  async processAccessRequest(request) {
    const dataSubject = this.dataSubjects.get(request.subjectId);
    if (!dataSubject) {
      throw new Error('Data subject not found');
    }
    
    // Compile all personal data
    const personalData = this.decryptSensitiveData(dataSubject.personalData);
    
    // Get consent history
    const consentHistory = dataSubject.consentHistory.map(consentId => {
      const consent = this.consentRecords.get(consentId);
      return consent ? {
        id: consent.id,
        consentTypes: consent.consentTypes,
        purposes: consent.purposes,
        grantedAt: consent.grantedAt,
        status: consent.status,
        withdrawnAt: consent.withdrawnAt
      } : null;
    }).filter(Boolean);
    
    // Get processing activities
    const processingActivities = dataSubject.processingActivities.map(activityId => {
      const activity = this.processingActivities.get(activityId);
      return activity ? {
        id: activity.id,
        purpose: activity.purpose,
        legalBasis: activity.legalBasis,
        startTime: activity.startTime,
        endTime: activity.endTime,
        status: activity.status
      } : null;
    }).filter(Boolean);
    
    return {
      personalData,
      consentHistory,
      processingActivities,
      dataCategories: dataSubject.dataCategories,
      retentionSchedule: dataSubject.retentionSchedule,
      exportedAt: Date.now()
    };
  }

  async processErasureRequest(request) {
    const dataSubject = this.dataSubjects.get(request.subjectId);
    if (!dataSubject) {
      throw new Error('Data subject not found');
    }
    
    logger.info(`Processing erasure request for subject: ${request.subjectId}`);
    
    // Check if erasure is allowed
    const erasureAllowed = this.checkErasureAllowed(request.subjectId);
    if (!erasureAllowed.allowed) {
      return {
        status: 'denied',
        reason: erasureAllowed.reason,
        timestamp: Date.now()
      };
    }
    
    // Perform erasure
    await this.performDataErasure(request.subjectId);
    
    return {
      status: 'completed',
      erasedAt: Date.now(),
      retainedData: erasureAllowed.retainedData || []
    };
  }

  async processPortabilityRequest(request) {
    const dataSubject = this.dataSubjects.get(request.subjectId);
    if (!dataSubject) {
      throw new Error('Data subject not found');
    }
    
    // Get portable data (structured, commonly used formats)
    const portableData = {
      personalData: this.decryptSensitiveData(dataSubject.personalData),
      preferences: this.getPortablePreferences(request.subjectId),
      searchHistory: this.getPortableSearchHistory(request.subjectId),
      bookingHistory: this.getPortableBookingHistory(request.subjectId)
    };
    
    return {
      format: 'JSON',
      data: portableData,
      exportedAt: Date.now(),
      version: '1.0'
    };
  }

  async processConsentWithdrawalRequest(request) {
    const { consentTypes } = request.requestData;
    
    const withdrawnConsents = [];
    
    for (const consentType of consentTypes) {
      const activeConsents = this.getActiveConsents(request.subjectId, consentType);
      
      for (const consent of activeConsents) {
        await this.withdrawConsent(request.subjectId, consent.id, 'User request');
        withdrawnConsents.push(consent.id);
      }
    }
    
    return {
      withdrawnConsents,
      timestamp: Date.now()
    };
  }

  // Data Breach Management
  async reportDataBreach(breachData) {
    try {
      logger.error('Data breach detected:', breachData);
      
      const breachId = uuidv4();
      const timestamp = Date.now();
      
      const breach = {
        id: breachId,
        type: breachData.type,
        severity: breachData.severity || 'medium',
        description: breachData.description,
        affectedDataCategories: breachData.affectedDataCategories || [],
        affectedSubjects: breachData.affectedSubjects || [],
        detectedAt: timestamp,
        reportedAt: null,
        resolvedAt: null,
        status: 'detected',
        containmentActions: [],
        notificationRequired: this.assessNotificationRequirement(breachData),
        supervisoryAuthorityNotified: false,
        dataSubjectsNotified: false,
        riskAssessment: {
          likelihood: breachData.likelihood || 'medium',
          impact: breachData.impact || 'medium',
          overallRisk: this.calculateBreachRisk(breachData)
        }
      };
      
      this.dataBreaches.set(breachId, breach);
      
      // Update statistics
      this.complianceStats.totalDataBreaches++;
      this.complianceStats.breachStats.reported++;
      
      // Immediate containment if high risk
      if (breach.riskAssessment.overallRisk === 'high') {
        await this.initiateBreachContainment(breachId);
      }
      
      // Schedule notifications if required
      if (breach.notificationRequired) {
        await this.scheduleBreachNotifications(breachId);
      }
      
      // Emit breach detected event
      this.eventBus.emit('data-breach-reported', {
        breachId,
        severity: breach.severity,
        riskLevel: breach.riskAssessment.overallRisk,
        notificationRequired: breach.notificationRequired,
        timestamp
      });
      
      return breachId;
      
    } catch (error) {
      logger.error('Error reporting data breach:', error);
      throw error;
    }
  }

  // Privacy Impact Assessment
  async conductPrivacyImpactAssessment(assessmentData) {
    try {
      logger.info('Conducting Privacy Impact Assessment');
      
      const assessmentId = uuidv4();
      const timestamp = Date.now();
      
      const assessment = {
        id: assessmentId,
        projectName: assessmentData.projectName,
        description: assessmentData.description,
        dataCategories: assessmentData.dataCategories,
        processingPurposes: assessmentData.processingPurposes,
        legalBasis: assessmentData.legalBasis,
        riskAssessment: {
          privacyRisks: assessmentData.privacyRisks || [],
          mitigationMeasures: assessmentData.mitigationMeasures || [],
          residualRisk: assessmentData.residualRisk || 'medium'
        },
        stakeholders: assessmentData.stakeholders || [],
        conductedAt: timestamp,
        conductedBy: assessmentData.conductedBy,
        reviewDate: timestamp + (365 * 24 * 60 * 60 * 1000), // 1 year
        status: 'completed',
        recommendations: assessmentData.recommendations || []
      };
      
      this.privacyImpactAssessments.set(assessmentId, assessment);
      
      // Emit PIA completed event
      this.eventBus.emit('privacy-impact-assessment-completed', {
        assessmentId,
        projectName: assessment.projectName,
        residualRisk: assessment.riskAssessment.residualRisk,
        timestamp
      });
      
      return assessmentId;
      
    } catch (error) {
      logger.error('Error conducting Privacy Impact Assessment:', error);
      throw error;
    }
  }

  // Event Handlers
  async handleDataProcessingStarted(event) {
    const { activityId, subjectId, purpose, dataCategories, legalBasis } = event.data;
    
    try {
      await this.startProcessingActivity(activityId, subjectId, purpose, dataCategories, legalBasis);
    } catch (error) {
      logger.error('Error handling data processing started event:', error);
    }
  }

  async handleDataProcessingCompleted(event) {
    const { activityId, result } = event.data;
    
    try {
      await this.endProcessingActivity(activityId, result);
    } catch (error) {
      logger.error('Error handling data processing completed event:', error);
    }
  }

  async handleConsentRequest(event) {
    const { subjectId, consentData } = event.data;
    
    try {
      await this.processConsent(subjectId, consentData);
    } catch (error) {
      logger.error('Error handling consent request event:', error);
    }
  }

  async handleConsentWithdrawal(event) {
    const { subjectId, consentId, reason } = event.data;
    
    try {
      await this.withdrawConsent(subjectId, consentId, reason);
    } catch (error) {
      logger.error('Error handling consent withdrawal event:', error);
    }
  }

  async handleDataSubjectRequest(event) {
    const { requestType, subjectId, requestData } = event.data;
    
    try {
      await this.handleDataSubjectRequest(requestType, subjectId, requestData);
    } catch (error) {
      logger.error('Error handling data subject request event:', error);
    }
  }

  async handleDataBreachDetected(event) {
    const breachData = event.data;
    
    try {
      await this.reportDataBreach(breachData);
    } catch (error) {
      logger.error('Error handling data breach detected event:', error);
    }
  }

  async handlePrivacyCheck(event) {
    const { subjectId, purpose, dataCategories } = event.data;
    
    try {
      const privacyCheckResult = await this.performPrivacyCheck(subjectId, purpose, dataCategories);
      
      this.eventBus.emit('privacy-check-completed', {
        subjectId,
        purpose,
        result: privacyCheckResult,
        timestamp: Date.now()
      });
    } catch (error) {
      logger.error('Error handling privacy check event:', error);
    }
  }

  // Utility Methods
  validatePersonalData(personalData) {
    if (!personalData || typeof personalData !== 'object') {
      throw new Error('Invalid personal data format');
    }
    
    // Check for required fields
    const requiredFields = ['email'];
    for (const field of requiredFields) {
      if (!personalData[field]) {
        throw new Error(`Required field missing: ${field}`);
      }
    }
    
    // Validate email format
    if (personalData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(personalData.email)) {
      throw new Error('Invalid email format');
    }
    
    return true;
  }

  validateConsentData(consentData) {
    if (!consentData || typeof consentData !== 'object') {
      throw new Error('Invalid consent data format');
    }
    
    if (!consentData.consentTypes || !Array.isArray(consentData.consentTypes)) {
      throw new Error('Consent types must be provided as an array');
    }
    
    // Validate consent types
    for (const consentType of consentData.consentTypes) {
      if (!this.consentTypes[consentType]) {
        throw new Error(`Unknown consent type: ${consentType}`);
      }
    }
    
    return true;
  }

  validateLegalBasis(subjectId, purpose, legalBasis) {
    const validBases = ['consent', 'contract', 'legal-obligation', 'vital-interests', 'public-task', 'legitimate-interest'];
    
    if (!validBases.includes(legalBasis)) {
      return false;
    }
    
    // Check if consent is available when required
    if (legalBasis === 'consent') {
      const validConsent = this.checkValidConsent(subjectId, purpose);
      return validConsent && validConsent.length > 0;
    }
    
    return true;
  }

  checkValidConsent(subjectId, purpose) {
    const dataSubject = this.dataSubjects.get(subjectId);
    if (!dataSubject) {
      return null;
    }
    
    const validConsents = [];
    
    for (const consentId of dataSubject.consentHistory) {
      const consent = this.consentRecords.get(consentId);
      
      if (consent && 
          consent.status === 'granted' && 
          consent.expiresAt > Date.now() && 
          consent.purposes.includes(purpose)) {
        validConsents.push(consent);
      }
    }
    
    return validConsents;
  }

  categorizePersonalData(personalData) {
    const categories = [];
    
    // Check each data category
    for (const [categoryName, categoryInfo] of Object.entries(this.dataCategories)) {
      const hasDataInCategory = categoryInfo.examples.some(example => 
        personalData.hasOwnProperty(example)
      );
      
      if (hasDataInCategory) {
        categories.push(categoryName);
      }
    }
    
    return categories;
  }

  encryptSensitiveData(data) {
    // Mock encryption - in production, use proper encryption
    const encrypted = {};
    
    for (const [key, value] of Object.entries(data)) {
      const category = this.findDataCategory(key);
      
      if (category && this.dataCategories[category].encryptionRequired) {
        encrypted[key] = `encrypted:${Buffer.from(JSON.stringify(value)).toString('base64')}`;
      } else {
        encrypted[key] = value;
      }
    }
    
    return encrypted;
  }

  decryptSensitiveData(encryptedData) {
    // Mock decryption - in production, use proper decryption
    const decrypted = {};
    
    for (const [key, value] of Object.entries(encryptedData)) {
      if (typeof value === 'string' && value.startsWith('encrypted:')) {
        const encryptedValue = value.substring(10);
        decrypted[key] = JSON.parse(Buffer.from(encryptedValue, 'base64').toString());
      } else {
        decrypted[key] = value;
      }
    }
    
    return decrypted;
  }

  findDataCategory(fieldName) {
    for (const [categoryName, categoryInfo] of Object.entries(this.dataCategories)) {
      if (categoryInfo.examples.includes(fieldName)) {
        return categoryName;
      }
    }
    return null;
  }

  calculateRetentionSchedule(personalData) {
    const schedule = {};
    
    for (const [key, value] of Object.entries(personalData)) {
      const category = this.findDataCategory(key);
      
      if (category) {
        // Find applicable retention policy
        for (const [policyName, policy] of Object.entries(this.retentionPolicies)) {
          if (policy.categories.includes(category)) {
            schedule[key] = {
              policy: policyName,
              retentionPeriod: policy.retentionPeriod,
              deleteAt: Date.now() + policy.retentionPeriod,
              automated: policy.automated
            };
            break;
          }
        }
      }
    }
    
    return schedule;
  }

  getRetentionPeriod(purpose) {
    // Map purposes to retention policies
    const purposePolicyMap = {
      'travel-search': 'search-data',
      'booking': 'booking-data',
      'personalization': 'user-preferences',
      'communication': 'communication-data',
      'analytics': 'user-preferences',
      'security': 'audit-logs'
    };
    
    const policyName = purposePolicyMap[purpose];
    const policy = this.retentionPolicies[policyName];
    
    return policy ? policy.retentionPeriod : (365 * 24 * 60 * 60 * 1000); // Default 1 year
  }

  checkErasureAllowed(subjectId) {
    const dataSubject = this.dataSubjects.get(subjectId);
    if (!dataSubject) {
      return { allowed: false, reason: 'Data subject not found' };
    }
    
    // Check for legal obligations that prevent erasure
    const activeBookings = this.getActiveBookings(subjectId);
    if (activeBookings.length > 0) {
      return {
        allowed: false,
        reason: 'Active bookings exist - legal obligation to retain data',
        retainedData: ['booking-data', 'transaction-data']
      };
    }
    
    // Check for ongoing legal proceedings
    const legalHolds = this.getLegalHolds(subjectId);
    if (legalHolds.length > 0) {
      return {
        allowed: false,
        reason: 'Data subject to legal hold',
        retainedData: legalHolds
      };
    }
    
    return { allowed: true };
  }

  async performDataErasure(subjectId) {
    logger.info(`Performing data erasure for subject: ${subjectId}`);
    
    const dataSubject = this.dataSubjects.get(subjectId);
    if (!dataSubject) {
      throw new Error('Data subject not found');
    }
    
    // Mark data subject as erased
    dataSubject.status = 'erased';
    dataSubject.erasedAt = Date.now();
    
    // Clear personal data (keep minimal record for compliance)
    dataSubject.personalData = {
      id: dataSubject.id,
      erasedAt: dataSubject.erasedAt,
      retentionReason: 'compliance-record'
    };
    
    // Stop all processing activities
    for (const activityId of dataSubject.processingActivities) {
      const activity = this.processingActivities.get(activityId);
      if (activity && activity.status === 'active') {
        activity.status = 'stopped';
        activity.endTime = Date.now();
        activity.stopReason = 'data-erasure';
      }
    }
    
    // Withdraw all active consents
    for (const consentId of dataSubject.consentHistory) {
      const consent = this.consentRecords.get(consentId);
      if (consent && consent.status === 'granted') {
        consent.status = 'withdrawn';
        consent.withdrawnAt = Date.now();
        consent.withdrawalReason = 'data-erasure';
      }
    }
    
    // Emit erasure completed event
    this.eventBus.emit('data-erasure-completed', {
      subjectId,
      erasedAt: dataSubject.erasedAt,
      timestamp: Date.now()
    });
  }

  // Mock methods for demonstration
  getActiveBookings(subjectId) {
    // Mock implementation - would query booking system
    return [];
  }

  getLegalHolds(subjectId) {
    // Mock implementation - would query legal system
    return [];
  }

  getPortablePreferences(subjectId) {
    // Mock implementation - would query preferences system
    return {};
  }

  getPortableSearchHistory(subjectId) {
    // Mock implementation - would query search history
    return [];
  }

  getPortableBookingHistory(subjectId) {
    // Mock implementation - would query booking history
    return [];
  }

  getActiveConsents(subjectId, consentType) {
    const dataSubject = this.dataSubjects.get(subjectId);
    if (!dataSubject) {
      return [];
    }
    
    const activeConsents = [];
    
    for (const consentId of dataSubject.consentHistory) {
      const consent = this.consentRecords.get(consentId);
      
      if (consent && 
          consent.status === 'granted' && 
          consent.expiresAt > Date.now() && 
          consent.consentTypes.includes(consentType)) {
        activeConsents.push(consent);
      }
    }
    
    return activeConsents;
  }

  assessNotificationRequirement(breachData) {
    // High risk breaches require notification
    const riskLevel = this.calculateBreachRisk(breachData);
    return riskLevel === 'high';
  }

  calculateBreachRisk(breachData) {
    const likelihood = breachData.likelihood || 'medium';
    const impact = breachData.impact || 'medium';
    
    const riskMatrix = {
      'low-low': 'low',
      'low-medium': 'low',
      'low-high': 'medium',
      'medium-low': 'low',
      'medium-medium': 'medium',
      'medium-high': 'high',
      'high-low': 'medium',
      'high-medium': 'high',
      'high-high': 'high'
    };
    
    return riskMatrix[`${likelihood}-${impact}`] || 'medium';
  }

  async initiateBreachContainment(breachId) {
    const breach = this.dataBreaches.get(breachId);
    if (!breach) {
      return;
    }
    
    logger.warn(`Initiating breach containment for: ${breachId}`);
    
    // Mock containment actions
    breach.containmentActions.push({
      action: 'system-isolation',
      timestamp: Date.now(),
      status: 'completed'
    });
    
    breach.status = 'contained';
  }

  async scheduleBreachNotifications(breachId) {
    const breach = this.dataBreaches.get(breachId);
    if (!breach) {
      return;
    }
    
    logger.info(`Scheduling breach notifications for: ${breachId}`);
    
    // Schedule supervisory authority notification (72 hours)
    setTimeout(() => {
      this.notifySupervisoryAuthority(breachId);
    }, 72 * 60 * 60 * 1000);
    
    // Schedule data subject notifications if high risk
    if (breach.riskAssessment.overallRisk === 'high') {
      setTimeout(() => {
        this.notifyDataSubjects(breachId);
      }, 24 * 60 * 60 * 1000); // 24 hours
    }
  }

  async notifySupervisoryAuthority(breachId) {
    const breach = this.dataBreaches.get(breachId);
    if (!breach) {
      return;
    }
    
    logger.info(`Notifying supervisory authority for breach: ${breachId}`);
    
    breach.supervisoryAuthorityNotified = true;
    breach.reportedAt = Date.now();
    
    this.eventBus.emit('supervisory-authority-notified', {
      breachId,
      timestamp: Date.now()
    });
  }

  async notifyDataSubjects(breachId) {
    const breach = this.dataBreaches.get(breachId);
    if (!breach) {
      return;
    }
    
    logger.info(`Notifying data subjects for breach: ${breachId}`);
    
    breach.dataSubjectsNotified = true;
    
    this.eventBus.emit('data-subjects-notified', {
      breachId,
      affectedSubjects: breach.affectedSubjects.length,
      timestamp: Date.now()
    });
  }

  async performPrivacyCheck(subjectId, purpose, dataCategories) {
    logger.debug(`Performing privacy check for subject: ${subjectId}`);
    
    const checks = {
      consentValid: false,
      legalBasisValid: false,
      dataMinimized: false,
      retentionCompliant: false,
      securityMeasures: false,
      overallCompliant: false
    };
    
    // Check consent validity
    const validConsent = this.checkValidConsent(subjectId, purpose);
    checks.consentValid = validConsent && validConsent.length > 0;
    
    // Check legal basis
    checks.legalBasisValid = this.validateLegalBasis(subjectId, purpose, 'legitimate-interest');
    
    // Check data minimization
    checks.dataMinimized = this.checkDataMinimization(dataCategories, purpose);
    
    // Check retention compliance
    checks.retentionCompliant = this.checkRetentionCompliance(subjectId, purpose);
    
    // Check security measures
    checks.securityMeasures = this.checkSecurityMeasures(dataCategories);
    
    // Overall compliance
    checks.overallCompliant = Object.values(checks).every(check => check === true);
    
    return checks;
  }

  checkDataMinimization(dataCategories, purpose) {
    // Mock implementation - would check if data categories are necessary for purpose
    return true;
  }

  checkRetentionCompliance(subjectId, purpose) {
    // Mock implementation - would check if retention periods are appropriate
    return true;
  }

  checkSecurityMeasures(dataCategories) {
    // Mock implementation - would check if appropriate security measures are in place
    return true;
  }

  async stopProcessingForWithdrawnConsent(consentId) {
    logger.info(`Stopping processing for withdrawn consent: ${consentId}`);
    
    // Find and stop related processing activities
    for (const [activityId, activity] of this.processingActivities) {
      if (activity.consentIds.includes(consentId) && activity.status === 'active') {
        activity.status = 'stopped';
        activity.endTime = Date.now();
        activity.stopReason = 'consent-withdrawn';
        
        this.eventBus.emit('processing-activity-stopped', {
          activityId,
          reason: 'consent-withdrawn',
          consentId,
          timestamp: Date.now()
        });
      }
    }
  }

  // Maintenance methods
  async enforceDataRetention() {
    logger.info('Enforcing data retention policies');
    
    const now = Date.now();
    let deletedCount = 0;
    
    for (const [subjectId, dataSubject] of this.dataSubjects) {
      if (dataSubject.status === 'erased') {
        continue;
      }
      
      // Check retention schedule
      for (const [field, schedule] of Object.entries(dataSubject.retentionSchedule)) {
        if (schedule.automated && schedule.deleteAt <= now) {
          // Delete expired data
          delete dataSubject.personalData[field];
          delete dataSubject.retentionSchedule[field];
          deletedCount++;
          
          logger.info(`Deleted expired data field ${field} for subject ${subjectId}`);
        }
      }
    }
    
    if (deletedCount > 0) {
      logger.info(`Data retention enforcement completed: ${deletedCount} fields deleted`);
    }
  }

  async monitorConsentExpiration() {
    logger.debug('Monitoring consent expiration');
    
    const now = Date.now();
    const warningThreshold = 30 * 24 * 60 * 60 * 1000; // 30 days
    
    for (const [consentId, consent] of this.consentRecords) {
      if (consent.status === 'granted') {
        const timeToExpiry = consent.expiresAt - now;
        
        if (timeToExpiry <= 0) {
          // Consent expired
          consent.status = 'expired';
          consent.expiredAt = now;
          
          this.complianceStats.consentStats.expired++;
          
          // Stop related processing
          await this.stopProcessingForWithdrawnConsent(consentId);
          
          this.eventBus.emit('consent-expired', {
            consentId,
            subjectId: consent.subjectId,
            timestamp: now
          });
          
        } else if (timeToExpiry <= warningThreshold) {
          // Consent expiring soon
          this.eventBus.emit('consent-expiring-soon', {
            consentId,
            subjectId: consent.subjectId,
            expiresAt: consent.expiresAt,
            daysRemaining: Math.ceil(timeToExpiry / (24 * 60 * 60 * 1000)),
            timestamp: now
          });
        }
      }
    }
  }

  updateComplianceStatistics() {
    // Update active counts
    this.complianceStats.totalDataSubjects = this.dataSubjects.size;
    this.complianceStats.totalConsentRecords = this.consentRecords.size;
    this.complianceStats.totalProcessingActivities = this.processingActivities.size;
    
    // Update breach stats
    let reportedBreaches = 0;
    let resolvedBreaches = 0;
    let pendingBreaches = 0;
    
    for (const breach of this.dataBreaches.values()) {
      if (breach.status === 'reported') reportedBreaches++;
      else if (breach.status === 'resolved') resolvedBreaches++;
      else pendingBreaches++;
    }
    
    this.complianceStats.breachStats = {
      reported: reportedBreaches,
      resolved: resolvedBreaches,
      pending: pendingBreaches
    };
  }

  monitorRequestDeadlines() {
    const now = Date.now();
    const warningThreshold = 7 * 24 * 60 * 60 * 1000; // 7 days
    
    for (const dataSubject of this.dataSubjects.values()) {
      for (const requestId of dataSubject.dataSubjectRequests) {
        // Mock request lookup - would query request system
        const request = { 
          id: requestId, 
          status: 'pending', 
          responseDeadline: now + (15 * 24 * 60 * 60 * 1000) 
        };
        
        if (request.status === 'pending') {
          const timeToDeadline = request.responseDeadline - now;
          
          if (timeToDeadline <= 0) {
            // Deadline passed
            this.eventBus.emit('request-deadline-exceeded', {
              requestId,
              subjectId: dataSubject.id,
              deadline: request.responseDeadline,
              timestamp: now
            });
          } else if (timeToDeadline <= warningThreshold) {
            // Deadline approaching
            this.eventBus.emit('request-deadline-approaching', {
              requestId,
              subjectId: dataSubject.id,
              deadline: request.responseDeadline,
              daysRemaining: Math.ceil(timeToDeadline / (24 * 60 * 60 * 1000)),
              timestamp: now
            });
          }
        }
      }
    }
  }

  // Query methods
  getComplianceStatistics() {
    return {
      ...this.complianceStats,
      uptime: Date.now() - this.startTime
    };
  }

  getDataSubjectInfo(subjectId) {
    const dataSubject = this.dataSubjects.get(subjectId);
    if (!dataSubject) {
      return null;
    }
    
    return {
      id: dataSubject.id,
      status: dataSubject.status,
      registrationDate: dataSubject.registrationDate,
      lastUpdated: dataSubject.lastUpdated,
      dataCategories: dataSubject.dataCategories,
      consentCount: dataSubject.consentHistory.length,
      processingActivityCount: dataSubject.processingActivities.length,
      requestCount: dataSubject.dataSubjectRequests.length
    };
  }

  getConsentInfo(consentId) {
    const consent = this.consentRecords.get(consentId);
    if (!consent) {
      return null;
    }
    
    return {
      id: consent.id,
      subjectId: consent.subjectId,
      consentTypes: consent.consentTypes,
      purposes: consent.purposes,
      status: consent.status,
      grantedAt: consent.grantedAt,
      expiresAt: consent.expiresAt,
      withdrawnAt: consent.withdrawnAt
    };
  }

  getProcessingActivityInfo(activityId) {
    const activity = this.processingActivities.get(activityId);
    if (!activity) {
      return null;
    }
    
    return {
      id: activity.id,
      subjectId: activity.subjectId,
      purpose: activity.purpose,
      legalBasis: activity.legalBasis,
      status: activity.status,
      startTime: activity.startTime,
      endTime: activity.endTime,
      duration: activity.duration
    };
  }

  getDataBreachInfo(breachId) {
    const breach = this.dataBreaches.get(breachId);
    if (!breach) {
      return null;
    }
    
    return {
      id: breach.id,
      type: breach.type,
      severity: breach.severity,
      status: breach.status,
      detectedAt: breach.detectedAt,
      reportedAt: breach.reportedAt,
      resolvedAt: breach.resolvedAt,
      affectedSubjects: breach.affectedSubjects.length,
      riskLevel: breach.riskAssessment.overallRisk,
      notificationRequired: breach.notificationRequired
    };
  }

  getPrivacyImpactAssessmentInfo(assessmentId) {
    const assessment = this.privacyImpactAssessments.get(assessmentId);
    if (!assessment) {
      return null;
    }
    
    return {
      id: assessment.id,
      projectName: assessment.projectName,
      conductedAt: assessment.conductedAt,
      conductedBy: assessment.conductedBy,
      status: assessment.status,
      residualRisk: assessment.riskAssessment.residualRisk,
      reviewDate: assessment.reviewDate
    };
  }

  // Health check
  getHealthStatus() {
    const now = Date.now();
    const uptime = now - this.startTime;
    
    return {
      status: 'healthy',
      uptime,
      dataSubjects: this.dataSubjects.size,
      consentRecords: this.consentRecords.size,
      processingActivities: this.processingActivities.size,
      dataBreaches: this.dataBreaches.size,
      privacyAssessments: this.privacyImpactAssessments.size,
      lastHealthCheck: now
    };
  }

  async shutdown() {
    logger.info('Shutting down GDPR Compliance module');
    
    // Clear all intervals
    clearInterval(this.retentionInterval);
    clearInterval(this.consentMonitorInterval);
    clearInterval(this.statsInterval);
    clearInterval(this.deadlineMonitorInterval);
    
    // Remove event listeners
    this.eventBus.removeAllListeners('data-processing-started');
    this.eventBus.removeAllListeners('data-processing-completed');
    this.eventBus.removeAllListeners('consent-request');
    this.eventBus.removeAllListeners('consent-withdrawal');
    this.eventBus.removeAllListeners('data-subject-request');
    this.eventBus.removeAllListeners('data-breach-detected');
    this.eventBus.removeAllListeners('privacy-check');
    
    // Clear data structures
    this.dataSubjects.clear();
    this.consentRecords.clear();
    this.processingActivities.clear();
    this.dataBreaches.clear();
    this.privacyImpactAssessments.clear();
    
    logger.info('GDPR Compliance module shutdown complete');
  }
}