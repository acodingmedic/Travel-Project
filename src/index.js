import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import http from 'http';\nimport https from 'https';\nimport fs from 'fs';
import { Server } from 'socket.io';
import winston from 'winston';

// Environment Configuration - Initialize first
import envConfig, { initializeConfig, getConfig } from './config/env-config.js';

// Import core holonic components
import { Coordinator } from './holons/coordinator.js';
import { Orchestrator } from './holons/orchestrator.js';
import { Blackboard } from './holons/blackboard.js';
import { Telemetry } from './holons/telemetry.js';
import { Policy } from './holons/policy.js';

// Import orchestration layer
import { EventBus } from './orchestration/event-bus.js';
import { QueueManager } from './orchestration/queue-manager.js';
import { WorkflowEngine } from './orchestration/workflow-engine.js';

// Import frontend routes
import { frontendRoutes } from './frontend/routes.js';

// Configure logging
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

class HolonicTravelPlanner {
  constructor() {
    this.app = express();
        const useHttps = (process.env.NODE_ENV === 'production') && process.env.SSL_KEY_PATH && process.env.SSL_CERT_PATH;
    if (useHttps) {
      try {
        const key = fs.readFileSync(process.env.SSL_KEY_PATH);
        const cert = fs.readFileSync(process.env.SSL_CERT_PATH);
        this.server = https.createServer({ key, cert }, this.app);
      } catch (err) {
        logger.warn('Failed to initialize HTTPS, falling back to HTTP:', err.message);
        this.server = http.createServer(this.app);
      }
    } else {
      this.server = http.createServer(this.app);
    }
    this.io = new Server(this.server, {
      cors: {
        origin: process.env.FRONTEND_URL || "http://localhost:3000",
        methods: ["GET", "POST"]
      }
    });
    
    this.port = process.env.PORT || 8080;
    this.holons = {};
    this.orchestration = {};
    this.configInitialized = false;
  }

  /**
   * Initialize environment configuration and validate all settings
   */
  async initializeConfiguration() {
    try {
      console.log('ðŸ”§ Initializing Environment Configuration System...');
      
      // Initialize environment configuration
      await initializeConfig();
      
      // Validate critical configuration
      const healthCheck = await envConfig.healthCheck();
      if (healthCheck.status !== 'healthy') {
        throw new Error(`Configuration health check failed: ${JSON.stringify(healthCheck.errors)}`);
      }
      
      console.log('âœ… Environment Configuration System initialized successfully');
      console.log(`ðŸ“Š Configuration Summary:`);
      console.log(`   - Environment: ${getConfig('NODE_ENV')}`);
      console.log(`   - Application: ${getConfig('APP_NAME')} v${getConfig('APP_VERSION')}`);
      console.log(`   - Port: ${getConfig('PORT')}`);
      console.log(`   - GDPR Compliance: ${getConfig('GDPR_ENABLED') ? 'Enabled' : 'Disabled'}`);
      console.log(`   - Total Variables: ${healthCheck.stats.totalVariables}`);
      console.log(`   - Sensitive Variables: ${healthCheck.stats.sensitiveVariables}`);
      
      this.configInitialized = true;
      
    } catch (error) {
      console.error('âŒ Failed to initialize environment configuration:', error);
      throw error;
    }
  }

  async initialize() {
    try {
      logger.info('Initializing Holonic Travel Planner...');
      
      // Initialize configuration first
      if (!this.configInitialized) {
        await this.initializeConfiguration();
      }
      
      // Setup middleware
      this.setupMiddleware();
      
      // Initialize orchestration layer
      await this.initializeOrchestration();
      
      // Initialize persistent holons
      await this.initializeHolons();
      
      // Setup routes
      this.setupRoutes();
      
      // Setup WebSocket handlers
      this.setupWebSocket();
      
      logger.info('Holonic Travel Planner initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Holonic Travel Planner:', error);
      throw error;
    }
  }

  setupMiddleware() {
    this.app.use(helmet());
    this.app.use(cors());
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));
    
    // Request logging
    this.app.use((req, res, next) => {
      logger.info(`${req.method} ${req.path}`, {
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
      next();
    });
  }

  async initializeOrchestration() {
    this.orchestration.eventBus = new EventBus();
    this.orchestration.queueManager = new QueueManager(this.orchestration.eventBus);
    this.orchestration.workflowEngine = new WorkflowEngine(
      this.orchestration.eventBus,
      this.orchestration.queueManager
    );
    
    await this.orchestration.eventBus.initialize();
    await this.orchestration.queueManager.initialize();
    await this.orchestration.workflowEngine.initialize();
  }

  async initializeHolons() {
    // Initialize persistent holons
    this.holons.coordinator = new Coordinator(this.orchestration);
    this.holons.orchestrator = new Orchestrator(this.orchestration);
    this.holons.blackboard = new Blackboard(this.orchestration);
    this.holons.telemetry = new Telemetry(this.orchestration);
    this.holons.policy = new Policy(this.orchestration);
    
    // Initialize all holons
    for (const [name, holon] of Object.entries(this.holons)) {
      await holon.initialize();
      logger.info(`Initialized holon: ${name}`);
    }
  }

  setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
      });
    });
    
    // API routes
    this.app.use('/', frontendRoutes);
    
    // Serve static files for frontend
    this.app.use(express.static('public'));
  }

  setupWebSocket() {
    this.io.on('connection', (socket) => {
      logger.info(`Client connected: ${socket.id}`);
      
      socket.on('travel-request', async (data) => {
        try {
          const result = await this.holons.coordinator.processRequest(data, socket.id);
          socket.emit('travel-response', result);
        } catch (error) {
          logger.error('Error processing travel request:', error);
          socket.emit('error', { message: 'Failed to process travel request' });
        }
      });
      
      socket.on('disconnect', () => {
        logger.info(`Client disconnected: ${socket.id}`);
      });
    });
  }

  async start() {
    await this.initialize();
    
    this.server.listen(this.port, () => {
      logger.info(`Holonic Travel Planner running on port ${this.port}`);
      console.log(`ðŸš€ Server ready at http://localhost:${this.port}`);
    });
  }

  async shutdown() {
    logger.info('Shutting down Holonic Travel Planner...');
    
    // Graceful shutdown of holons
    for (const [name, holon] of Object.entries(this.holons)) {
      await holon.shutdown();
      logger.info(`Shutdown holon: ${name}`);
    }
    
    // Shutdown orchestration
    await this.orchestration.workflowEngine.shutdown();
    await this.orchestration.queueManager.shutdown();
    await this.orchestration.eventBus.shutdown();
    
    this.server.close();
    logger.info('Holonic Travel Planner shutdown complete');
  }
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await app.shutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  await app.shutdown();
  process.exit(0);
});

// Start the application
const app = new HolonicTravelPlanner();
app.start().catch((error) => {
  logger.error('Failed to start application:', error);
  process.exit(1);
});

export default app;