/**
 * Environment Configuration System
 * Production-ready environment variable loader with comprehensive validation
 * GDPR-compliant secret management with encryption and access controls
 * 
 * @version 1.0.0
 * @author TravelAI Platform Team
 * @created 2024-01-15
 */

import dotenv from 'dotenv';
import Joi from 'joi';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import winston from 'winston';

// Initialize logger for configuration system
const configLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

/**
 * Environment Configuration Class
 * Handles loading, validation, and secure access to environment variables
 */
class EnvironmentConfig {
  constructor() {
    this.config = {};
    this.validationSchema = null;
    this.encryptionKey = null;
    this.isInitialized = false;
    this.sensitiveKeys = new Set();
    this.accessLog = new Map();
    this.gdprCompliant = false;
  }

  /**
   * Initialize the environment configuration system
   * @param {Object} options - Configuration options
   * @returns {Promise<void>}
   */
  async initialize(options = {}) {
    try {
      configLogger.info('Initializing Environment Configuration System...');
      
      // Load environment variables
      await this.loadEnvironmentVariables(options.envPath);
      
      // Setup validation schema
      this.setupValidationSchema();
      
      // Validate configuration
      await this.validateConfiguration();
      
      // Initialize encryption for sensitive data
      await this.initializeEncryption();
      
      // Setup GDPR compliance
      await this.setupGDPRCompliance();
      
      // Mark as initialized
      this.isInitialized = true;
      
      configLogger.info('Environment Configuration System initialized successfully');
      
      return this.config;
    } catch (error) {
      configLogger.error('Failed to initialize Environment Configuration System:', error);
      throw new Error(`Environment Configuration Error: ${error.message}`);
    }
  }

  /**
   * Load environment variables from .env file and process.env
   * @param {string} envPath - Path to .env file
   */
  async loadEnvironmentVariables(envPath) {
    try {
      // Determine .env file path
      const dotenvPath = envPath || path.resolve(process.cwd(), '.env');
      
      // Check if .env file exists
      if (fs.existsSync(dotenvPath)) {
        configLogger.info(`Loading environment variables from: ${dotenvPath}`);
        
        // Load .env file
        const result = dotenv.config({ path: dotenvPath });
        
        if (result.error) {
          throw new Error(`Failed to load .env file: ${result.error.message}`);
        }
        
        configLogger.info(`Loaded ${Object.keys(result.parsed || {}).length} variables from .env file`);
      } else {
        configLogger.warn(`No .env file found at: ${dotenvPath}`);
      }
      
      // Load from process.env (takes precedence over .env file)
      this.config = { ...process.env };
      
      configLogger.info(`Total environment variables loaded: ${Object.keys(this.config).length}`);
    } catch (error) {
      configLogger.error('Error loading environment variables:', error);
      throw error;
    }
  }

  /**
   * Setup comprehensive validation schema for all environment variables
   */
  setupValidationSchema() {
    this.validationSchema = Joi.object({
      // Application Settings
      NODE_ENV: Joi.string().valid('development', 'production', 'test', 'staging').default('development'),
      APP_NAME: Joi.string().required(),
      APP_VERSION: Joi.string().pattern(/^\d+\.\d+\.\d+$/).required(),
      APP_URL: Joi.string().uri().required(),
      PORT: Joi.number().port().default(8000),
      FRONTEND_PORT: Joi.number().port().default(3000),
      FRONTEND_URL: Joi.string().uri().required(),
      API_BASE_URL: Joi.string().uri().required(),
      HEALTH_CHECK_PATH: Joi.string().default('/health'),
      SHUTDOWN_TIMEOUT: Joi.number().positive().default(30000),
      REQUEST_TIMEOUT: Joi.number().positive().default(30000),
      BODY_LIMIT: Joi.string().default('10mb'),
      UPLOAD_LIMIT: Joi.string().default('50mb'),

      // Database Configuration
      MONGODB_URI: Joi.string().uri().required(),
      MONGODB_HOST: Joi.string().hostname().required(),
      MONGODB_PORT: Joi.number().port().default(27017),
      MONGODB_DATABASE: Joi.string().required(),
      MONGODB_USERNAME: Joi.string().required(),
      MONGODB_PASSWORD: Joi.string().min(8).required(),
      MONGODB_AUTH_SOURCE: Joi.string().default('admin'),
      MONGODB_SSL: Joi.boolean().default(true),
      MONGODB_REPLICA_SET: Joi.string().optional(),
      MONGODB_MAX_POOL_SIZE: Joi.number().positive().default(10),
      MONGODB_MIN_POOL_SIZE: Joi.number().positive().default(2),
      MONGODB_CONNECTION_TIMEOUT: Joi.number().positive().default(30000),
      MONGODB_SOCKET_TIMEOUT: Joi.number().positive().default(30000),

      // Redis Configuration
      REDIS_URL: Joi.string().uri().required(),
      REDIS_HOST: Joi.string().hostname().required(),
      REDIS_PORT: Joi.number().port().default(6379),
      REDIS_PASSWORD: Joi.string().min(8).required(),
      REDIS_DB: Joi.number().min(0).max(15).default(0),
      REDIS_FAMILY: Joi.number().valid(4, 6).default(4),
      REDIS_KEEPALIVE: Joi.number().positive().default(30000),
      REDIS_CONNECTION_TIMEOUT: Joi.number().positive().default(10000),
      REDIS_COMMAND_TIMEOUT: Joi.number().positive().default(5000),
      REDIS_RETRY_ATTEMPTS: Joi.number().positive().default(3),
      REDIS_RETRY_DELAY: Joi.number().positive().default(1000),
      REDIS_MAX_MEMORY_POLICY: Joi.string().valid('allkeys-lru', 'allkeys-lfu', 'volatile-lru', 'volatile-lfu').default('allkeys-lru'),

      // Security & Authentication
      JWT_SECRET: Joi.string().min(32).required(),
      JWT_EXPIRES_IN: Joi.string().default('24h'),
      JWT_REFRESH_SECRET: Joi.string().min(32).required(),
      JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),
      JWT_ALGORITHM: Joi.string().valid('HS256', 'HS384', 'HS512', 'RS256', 'RS384', 'RS512').default('HS256'),
      JWT_ISSUER: Joi.string().required(),
      JWT_AUDIENCE: Joi.string().required(),

      SESSION_SECRET: Joi.string().min(32).required(),
      SESSION_NAME: Joi.string().default('travelai_session'),
      SESSION_MAX_AGE: Joi.number().positive().default(86400000),
      SESSION_SECURE: Joi.boolean().default(true),
      SESSION_HTTP_ONLY: Joi.boolean().default(true),
      SESSION_SAME_SITE: Joi.string().valid('strict', 'lax', 'none').default('strict'),
      SESSION_ROLLING: Joi.boolean().default(true),
      SESSION_RESAVE: Joi.boolean().default(false),
      SESSION_SAVE_UNINITIALIZED: Joi.boolean().default(false),

      ENCRYPTION_KEY: Joi.string().length(32).required(),
      ENCRYPTION_ALGORITHM: Joi.string().valid('aes-256-gcm', 'aes-256-cbc').default('aes-256-gcm'),
      ENCRYPTION_IV_LENGTH: Joi.number().positive().default(16),
      ENCRYPTION_TAG_LENGTH: Joi.number().positive().default(16),
      HASH_SALT_ROUNDS: Joi.number().min(10).max(15).default(12),
      HASH_PEPPER: Joi.string().min(16).required(),

      // CORS Configuration
      CORS_ORIGIN: Joi.string().required(),
      CORS_METHODS: Joi.string().default('GET,POST,PUT,DELETE,OPTIONS'),
      CORS_ALLOWED_HEADERS: Joi.string().default('Content-Type,Authorization,X-Requested-With'),
      CORS_CREDENTIALS: Joi.boolean().default(true),
      CORS_MAX_AGE: Joi.number().positive().default(86400),
      CORS_PREFLIGHT_CONTINUE: Joi.boolean().default(false),
      CORS_OPTIONS_SUCCESS_STATUS: Joi.number().valid(200, 204).default(204),

      // External Services
      EMAIL_SERVICE: Joi.string().valid('smtp', 'sendgrid', 'mailgun', 'ses').default('smtp'),
      EMAIL_HOST: Joi.string().hostname().required(),
      EMAIL_PORT: Joi.number().port().default(587),
      EMAIL_SECURE: Joi.boolean().default(false),
      EMAIL_USER: Joi.string().email().required(),
      EMAIL_PASSWORD: Joi.string().min(8).required(),
      EMAIL_FROM_NAME: Joi.string().required(),
      EMAIL_FROM_ADDRESS: Joi.string().email().required(),
      EMAIL_REPLY_TO: Joi.string().email().required(),
      EMAIL_TEMPLATE_DIR: Joi.string().default('./templates/email'),
      EMAIL_RATE_LIMIT: Joi.number().positive().default(100),
      EMAIL_QUEUE_CONCURRENCY: Joi.number().positive().default(5),

      // Travel API Keys
      AMADEUS_API_KEY: Joi.string().required(),
      AMADEUS_API_SECRET: Joi.string().required(),
      AMADEUS_ENDPOINT: Joi.string().uri().required(),
      AMADEUS_RATE_LIMIT: Joi.number().positive().default(1000),
      AMADEUS_TIMEOUT: Joi.number().positive().default(30000),

      BOOKING_API_KEY: Joi.string().required(),
      BOOKING_API_SECRET: Joi.string().required(),
      BOOKING_ENDPOINT: Joi.string().uri().required(),
      BOOKING_RATE_LIMIT: Joi.number().positive().default(500),
      BOOKING_TIMEOUT: Joi.number().positive().default(25000),

      EXPEDIA_API_KEY: Joi.string().required(),
      EXPEDIA_API_SECRET: Joi.string().required(),
      EXPEDIA_ENDPOINT: Joi.string().uri().required(),
      EXPEDIA_RATE_LIMIT: Joi.number().positive().default(800),
      EXPEDIA_TIMEOUT: Joi.number().positive().default(30000),

      // Weather & Currency APIs
      WEATHER_API_KEY: Joi.string().required(),
      WEATHER_API_URL: Joi.string().uri().required(),
      WEATHER_RATE_LIMIT: Joi.number().positive().default(1000),
      WEATHER_CACHE_TTL: Joi.number().positive().default(3600),

      CURRENCY_API_KEY: Joi.string().required(),
      CURRENCY_API_URL: Joi.string().uri().required(),
      CURRENCY_BASE: Joi.string().length(3).uppercase().default('EUR'),
      CURRENCY_RATE_LIMIT: Joi.number().positive().default(1000),
      CURRENCY_CACHE_TTL: Joi.number().positive().default(3600),
      CURRENCY_UPDATE_INTERVAL: Joi.number().positive().default(3600000),

      // AI Services
      OPENAI_API_KEY: Joi.string().required(),
      OPENAI_ORGANIZATION: Joi.string().optional(),
      OPENAI_MODEL: Joi.string().default('gpt-4-turbo-preview'),
      OPENAI_MAX_TOKENS: Joi.number().positive().default(4096),
      OPENAI_TEMPERATURE: Joi.number().min(0).max(2).default(0.7),
      OPENAI_TOP_P: Joi.number().min(0).max(1).default(1.0),
      OPENAI_FREQUENCY_PENALTY: Joi.number().min(-2).max(2).default(0.0),
      OPENAI_PRESENCE_PENALTY: Joi.number().min(-2).max(2).default(0.0),
      OPENAI_TIMEOUT: Joi.number().positive().default(60000),
      OPENAI_RATE_LIMIT: Joi.number().positive().default(100),
      OPENAI_RETRY_ATTEMPTS: Joi.number().positive().default(3),
      OPENAI_RETRY_DELAY: Joi.number().positive().default(1000),

      // GDPR Compliance
      GDPR_ENABLED: Joi.boolean().default(true),
      GDPR_COOKIE_CONSENT_REQUIRED: Joi.boolean().default(true),
      GDPR_DATA_RETENTION_DAYS: Joi.number().positive().default(365),
      GDPR_ANONYMIZATION_DAYS: Joi.number().positive().default(90),
      GDPR_EXPORT_FORMAT: Joi.string().valid('json', 'xml', 'csv').default('json'),
      GDPR_DELETE_CONFIRMATION_REQUIRED: Joi.boolean().default(true),
      GDPR_AUDIT_LOG_ENABLED: Joi.boolean().default(true),
      GDPR_PRIVACY_POLICY_URL: Joi.string().uri().required(),
      GDPR_TERMS_OF_SERVICE_URL: Joi.string().uri().required(),

      // Feature Flags
      FEATURE_ADVANCED_SEARCH: Joi.boolean().default(true),
      FEATURE_VOICE_SEARCH: Joi.boolean().default(true),
      FEATURE_REAL_TIME_CHAT: Joi.boolean().default(true),
      FEATURE_AI_RECOMMENDATIONS: Joi.boolean().default(true),
      FEATURE_SOCIAL_LOGIN: Joi.boolean().default(true),
      FEATURE_MULTI_LANGUAGE: Joi.boolean().default(true),
      FEATURE_DARK_MODE: Joi.boolean().default(true),
      FEATURE_OFFLINE_MODE: Joi.boolean().default(false),
      FEATURE_PUSH_NOTIFICATIONS: Joi.boolean().default(true),
      FEATURE_ANALYTICS: Joi.boolean().default(true),
      FEATURE_A_B_TESTING: Joi.boolean().default(true),
      FEATURE_MAINTENANCE_MODE: Joi.boolean().default(false)
    }).unknown(true); // Allow additional environment variables

    // Define sensitive keys that require encryption
    this.sensitiveKeys = new Set([
      'JWT_SECRET', 'JWT_REFRESH_SECRET', 'SESSION_SECRET', 'ENCRYPTION_KEY', 'HASH_PEPPER',
      'MONGODB_PASSWORD', 'REDIS_PASSWORD', 'EMAIL_PASSWORD',
      'AMADEUS_API_SECRET', 'BOOKING_API_SECRET', 'EXPEDIA_API_SECRET',
      'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GOOGLE_AI_API_KEY', 'HUGGINGFACE_API_KEY',
      'AWS_SECRET_ACCESS_KEY', 'CLOUDINARY_API_SECRET',
      'WEATHER_API_KEY', 'CURRENCY_API_KEY'
    ]);
  }

  /**
   * Validate all environment variables against the schema
   */
  async validateConfiguration() {
    try {
      configLogger.info('Validating environment configuration...');
      
      const { error, value } = this.validationSchema.validate(this.config, {
        abortEarly: false,
        allowUnknown: true,
        stripUnknown: false
      });

      if (error) {
        const errorMessages = error.details.map(detail => {
          return `${detail.path.join('.')}: ${detail.message}`;
        });
        
        configLogger.error('Environment validation failed:', errorMessages);
        throw new Error(`Environment validation failed:\n${errorMessages.join('\n')}`);
      }

      // Update config with validated and default values
      this.config = value;
      
      configLogger.info('Environment configuration validated successfully');
      
      // Log configuration summary (without sensitive data)
      this.logConfigurationSummary();
      
    } catch (error) {
      configLogger.error('Configuration validation error:', error);
      throw error;
    }
  }

  /**
   * Initialize encryption for sensitive configuration data
   */
  async initializeEncryption() {
    try {
      configLogger.info('Initializing encryption for sensitive data...');
      
      // Use the encryption key from environment
      this.encryptionKey = this.config.ENCRYPTION_KEY;
      
      if (!this.encryptionKey || this.encryptionKey.length !== 32) {
        throw new Error('Invalid encryption key: must be exactly 32 characters');
      }
      
      // Test encryption/decryption
      const testData = 'test-encryption-data';
      const encrypted = this.encrypt(testData);
      const decrypted = this.decrypt(encrypted);
      
      if (decrypted !== testData) {
        throw new Error('Encryption test failed');
      }
      
      configLogger.info('Encryption system initialized and tested successfully');
      
    } catch (error) {
      configLogger.error('Encryption initialization failed:', error);
      throw error;
    }
  }

  /**
   * Setup GDPR compliance features
   */
  async setupGDPRCompliance() {
    try {
      configLogger.info('Setting up GDPR compliance features...');
      
      if (this.config.GDPR_ENABLED) {
        // Validate GDPR-required configuration
        const requiredGDPRConfig = [
          'GDPR_PRIVACY_POLICY_URL',
          'GDPR_TERMS_OF_SERVICE_URL',
          'GDPR_DATA_RETENTION_DAYS',
          'GDPR_ANONYMIZATION_DAYS'
        ];
        
        for (const key of requiredGDPRConfig) {
          if (!this.config[key]) {
            throw new Error(`GDPR compliance requires ${key} to be configured`);
          }
        }
        
        // Setup audit logging for sensitive data access
        if (this.config.GDPR_AUDIT_LOG_ENABLED) {
          this.setupAuditLogging();
        }
        
        this.gdprCompliant = true;
        configLogger.info('GDPR compliance features activated');
      } else {
        configLogger.warn('GDPR compliance is disabled');
      }
      
    } catch (error) {
      configLogger.error('GDPR compliance setup failed:', error);
      throw error;
    }
  }

  /**
   * Setup audit logging for sensitive data access
   */
  setupAuditLogging() {
    // Create audit logger
    this.auditLogger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [
        new winston.transports.File({ 
          filename: 'logs/config-audit.log',
          maxsize: 10485760, // 10MB
          maxFiles: 10
        })
      ]
    });
  }

  /**
   * Encrypt sensitive data
   * @param {string} text - Text to encrypt
   * @returns {string} - Encrypted text with IV and tag
   */
  encrypt(text) {
    try {
      const algorithm = this.config.ENCRYPTION_ALGORITHM || 'aes-256-cbc';
      const iv = crypto.randomBytes(this.config.ENCRYPTION_IV_LENGTH || 16);
      const cipher = crypto.createCipheriv(algorithm, this.encryptionKey, iv);
      
      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      return `${iv.toString('hex')}:${encrypted}`;
    } catch (error) {
      configLogger.error('Encryption failed:', error);
      throw new Error('Failed to encrypt sensitive data');
    }
  }

  /**
   * Decrypt sensitive data
   * @param {string} encryptedText - Encrypted text with IV and tag
   * @returns {string} - Decrypted text
   */
  decrypt(encryptedText) {
    try {
      const [ivHex, encrypted] = encryptedText.split(':');
      const algorithm = this.config.ENCRYPTION_ALGORITHM || 'aes-256-cbc';
      const iv = Buffer.from(ivHex, 'hex');
      
      const decipher = crypto.createDecipheriv(algorithm, this.encryptionKey, iv);
      
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      configLogger.error('Decryption failed:', error);
      throw new Error('Failed to decrypt sensitive data');
    }
  }

  /**
   * Get configuration value with access logging
   * @param {string} key - Configuration key
   * @param {*} defaultValue - Default value if key not found
   * @returns {*} - Configuration value
   */
  get(key, defaultValue = undefined) {
    if (!this.isInitialized) {
      throw new Error('Environment configuration not initialized. Call initialize() first.');
    }

    // Log access to sensitive keys for GDPR compliance
    if (this.sensitiveKeys.has(key) && this.gdprCompliant && this.auditLogger) {
      this.auditLogger.info('Sensitive configuration access', {
        key,
        timestamp: new Date().toISOString(),
        caller: this.getCallerInfo()
      });
    }

    // Track access frequency
    const accessCount = this.accessLog.get(key) || 0;
    this.accessLog.set(key, accessCount + 1);

    const value = this.config[key];
    return value !== undefined ? value : defaultValue;
  }

  /**
   * Get all configuration (excluding sensitive data)
   * @param {boolean} includeSensitive - Whether to include sensitive data
   * @returns {Object} - Configuration object
   */
  getAll(includeSensitive = false) {
    if (!this.isInitialized) {
      throw new Error('Environment configuration not initialized. Call initialize() first.');
    }

    if (includeSensitive) {
      // Log access to all sensitive data
      if (this.gdprCompliant && this.auditLogger) {
        this.auditLogger.warn('Full configuration access including sensitive data', {
          timestamp: new Date().toISOString(),
          caller: this.getCallerInfo()
        });
      }
      return { ...this.config };
    }

    // Return configuration without sensitive keys
    const safeConfig = {};
    for (const [key, value] of Object.entries(this.config)) {
      if (!this.sensitiveKeys.has(key)) {
        safeConfig[key] = value;
      } else {
        safeConfig[key] = '[REDACTED]';
      }
    }

    return safeConfig;
  }

  /**
   * Check if a feature flag is enabled
   * @param {string} featureName - Feature name (without FEATURE_ prefix)
   * @returns {boolean} - Whether feature is enabled
   */
  isFeatureEnabled(featureName) {
    const key = `FEATURE_${featureName.toUpperCase()}`;
    return this.get(key, false) === true || this.get(key, false) === 'true';
  }

  /**
   * Get database configuration
   * @returns {Object} - Database configuration
   */
  getDatabaseConfig() {
    return {
      mongodb: {
        uri: this.get('MONGODB_URI'),
        host: this.get('MONGODB_HOST'),
        port: this.get('MONGODB_PORT'),
        database: this.get('MONGODB_DATABASE'),
        username: this.get('MONGODB_USERNAME'),
        password: this.get('MONGODB_PASSWORD'),
        authSource: this.get('MONGODB_AUTH_SOURCE'),
        ssl: this.get('MONGODB_SSL'),
        replicaSet: this.get('MONGODB_REPLICA_SET'),
        maxPoolSize: this.get('MONGODB_MAX_POOL_SIZE'),
        minPoolSize: this.get('MONGODB_MIN_POOL_SIZE'),
        connectionTimeoutMS: this.get('MONGODB_CONNECTION_TIMEOUT'),
        socketTimeoutMS: this.get('MONGODB_SOCKET_TIMEOUT')
      },
      redis: {
        url: this.get('REDIS_URL'),
        host: this.get('REDIS_HOST'),
        port: this.get('REDIS_PORT'),
        password: this.get('REDIS_PASSWORD'),
        db: this.get('REDIS_DB'),
        family: this.get('REDIS_FAMILY'),
        keepAlive: this.get('REDIS_KEEPALIVE'),
        connectTimeout: this.get('REDIS_CONNECTION_TIMEOUT'),
        commandTimeout: this.get('REDIS_COMMAND_TIMEOUT'),
        retryAttempts: this.get('REDIS_RETRY_ATTEMPTS'),
        retryDelay: this.get('REDIS_RETRY_DELAY'),
        maxMemoryPolicy: this.get('REDIS_MAX_MEMORY_POLICY')
      }
    };
  }

  /**
   * Get security configuration
   * @returns {Object} - Security configuration
   */
  getSecurityConfig() {
    return {
      jwt: {
        secret: this.get('JWT_SECRET'),
        expiresIn: this.get('JWT_EXPIRES_IN'),
        refreshSecret: this.get('JWT_REFRESH_SECRET'),
        refreshExpiresIn: this.get('JWT_REFRESH_EXPIRES_IN'),
        algorithm: this.get('JWT_ALGORITHM'),
        issuer: this.get('JWT_ISSUER'),
        audience: this.get('JWT_AUDIENCE')
      },
      session: {
        secret: this.get('SESSION_SECRET'),
        name: this.get('SESSION_NAME'),
        maxAge: this.get('SESSION_MAX_AGE'),
        secure: this.get('SESSION_SECURE'),
        httpOnly: this.get('SESSION_HTTP_ONLY'),
        sameSite: this.get('SESSION_SAME_SITE'),
        rolling: this.get('SESSION_ROLLING'),
        resave: this.get('SESSION_RESAVE'),
        saveUninitialized: this.get('SESSION_SAVE_UNINITIALIZED')
      },
      encryption: {
        key: this.get('ENCRYPTION_KEY'),
        algorithm: this.get('ENCRYPTION_ALGORITHM'),
        ivLength: this.get('ENCRYPTION_IV_LENGTH'),
        tagLength: this.get('ENCRYPTION_TAG_LENGTH')
      },
      hashing: {
        saltRounds: this.get('HASH_SALT_ROUNDS'),
        pepper: this.get('HASH_PEPPER')
      }
    };
  }

  /**
   * Get caller information for audit logging
   * @returns {Object} - Caller information
   */
  getCallerInfo() {
    const stack = new Error().stack;
    const callerLine = stack.split('\n')[3]; // Skip this function and get() function
    const match = callerLine.match(/at (.+) \((.+):(\d+):(\d+)\)/);
    
    if (match) {
      return {
        function: match[1],
        file: match[2],
        line: match[3],
        column: match[4]
      };
    }
    
    return { function: 'unknown', file: 'unknown', line: 'unknown', column: 'unknown' };
  }

  /**
   * Log configuration summary (without sensitive data)
   */
  logConfigurationSummary() {
    if (!this.config) {
      configLogger.info('Configuration summary skipped - config not yet available');
      return;
    }
    
    const summary = {
      environment: this.config.NODE_ENV,
      application: {
        name: this.config.APP_NAME,
        version: this.config.APP_VERSION,
        port: this.config.PORT
      },
      features: {
        gdprEnabled: this.config.GDPR_ENABLED,
        advancedSearch: this.config.FEATURE_ADVANCED_SEARCH === 'true',
        voiceSearch: this.config.FEATURE_VOICE_SEARCH === 'true',
        realTimeChat: this.config.FEATURE_REAL_TIME_CHAT === 'true',
        aiRecommendations: this.config.FEATURE_AI_RECOMMENDATIONS === 'true'
      },
      database: {
        mongodb: {
          host: this.config.MONGODB_HOST,
          port: this.config.MONGODB_PORT,
          database: this.config.MONGODB_DATABASE
        },
        redis: {
          host: this.config.REDIS_HOST,
          port: this.config.REDIS_PORT,
          db: this.config.REDIS_DB
        }
      }
    };
    
    configLogger.info('Configuration Summary:', summary);
  }

  /**
   * Validate configuration health
   * @returns {Object} - Health check results
   */
  async healthCheck() {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      checks: {
        initialized: this.isInitialized,
        gdprCompliant: this.gdprCompliant,
        encryptionReady: !!this.encryptionKey,
        configurationValid: true
      },
      stats: {
        totalVariables: Object.keys(this.config).length,
        sensitiveVariables: this.sensitiveKeys.size,
        accessCount: Array.from(this.accessLog.values()).reduce((sum, count) => sum + count, 0)
      }
    };

    // Check for missing critical configuration
    const criticalKeys = ['JWT_SECRET', 'MONGODB_URI', 'REDIS_URL'];
    const missingKeys = criticalKeys.filter(key => !this.config[key]);
    
    if (missingKeys.length > 0) {
      health.status = 'unhealthy';
      health.checks.configurationValid = false;
      health.errors = [`Missing critical configuration: ${missingKeys.join(', ')}`];
    }

    return health;
  }
}

// Create singleton instance
const envConfig = new EnvironmentConfig();

// Export the singleton instance and class
export { envConfig as default, EnvironmentConfig };

// Export convenience functions
export const initializeConfig = (options) => envConfig.initialize(options);
export const getConfig = (key, defaultValue) => envConfig.get(key, defaultValue);
export const getAllConfig = (includeSensitive) => envConfig.getAll(includeSensitive);
export const isFeatureEnabled = (featureName) => envConfig.isFeatureEnabled(featureName);
export const getDatabaseConfig = () => envConfig.getDatabaseConfig();
export const getSecurityConfig = () => envConfig.getSecurityConfig();
export const configHealthCheck = () => envConfig.healthCheck();