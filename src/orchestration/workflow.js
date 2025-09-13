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

export class WorkflowManager extends EventEmitter {
  constructor(eventBus) {
    super();
    this.eventBus = eventBus;
    this.config = getSystemConfig();
    
    // Active workflows (sagas)
    this.activeWorkflows = new Map();
    
    // Workflow templates
    this.workflowTemplates = {
      travelPlanning: {
        name: 'Travel Planning Workflow',
        description: 'Complete travel planning process from search to booking',
        steps: [
          {
            id: 'initialize',
            name: 'Initialize Search',
            type: 'system',
            timeout: 30000,
            retries: 3,
            dependencies: [],
            outputs: ['search-initialized']
          },
          {
            id: 'generate-candidates',
            name: 'Generate Candidates',
            type: 'swarm',
            swarm: 'CandidateSwarm',
            timeout: 120000,
            retries: 2,
            dependencies: ['initialize'],
            inputs: ['search-initialized'],
            outputs: ['candidates-generated']
          },
          {
            id: 'validate-candidates',
            name: 'Validate Candidates',
            type: 'swarm',
            swarm: 'ValidationSwarm',
            timeout: 90000,
            retries: 2,
            dependencies: ['generate-candidates'],
            inputs: ['candidates-generated'],
            outputs: ['candidates-validated']
          },
          {
            id: 'rank-candidates',
            name: 'Rank Candidates',
            type: 'swarm',
            swarm: 'RankingSwarm',
            timeout: 60000,
            retries: 2,
            dependencies: ['validate-candidates'],
            inputs: ['candidates-validated'],
            outputs: ['candidates-ranked']
          },
          {
            id: 'select-candidates',
            name: 'Select Best Candidates',
            type: 'swarm',
            swarm: 'SelectionSwarm',
            timeout: 45000,
            retries: 2,
            dependencies: ['rank-candidates'],
            inputs: ['candidates-ranked'],
            outputs: ['candidates-selected']
          },
          {
            id: 'enrich-candidates',
            name: 'Enrich Selected Candidates',
            type: 'swarm',
            swarm: 'EnrichmentSwarm',
            timeout: 180000,
            retries: 2,
            dependencies: ['select-candidates'],
            inputs: ['candidates-selected'],
            outputs: ['candidates-enriched']
          },
          {
            id: 'generate-output',
            name: 'Generate Output',
            type: 'swarm',
            swarm: 'OutputSwarm',
            timeout: 60000,
            retries: 2,
            dependencies: ['enrich-candidates'],
            inputs: ['candidates-enriched'],
            outputs: ['output-generated']
          },
          {
            id: 'finalize',
            name: 'Finalize Results',
            type: 'system',
            timeout: 30000,
            retries: 1,
            dependencies: ['generate-output'],
            inputs: ['output-generated'],
            outputs: ['workflow-completed']
          }
        ],
        errorHandling: {
          strategy: 'retry-and-fallback',
          maxRetries: 3,
          fallbackWorkflow: 'simpleTravelPlanning',
          compensationActions: [
            {
              step: 'generate-candidates',
              action: 'use-cached-results',
              condition: 'timeout'
            },
            {
              step: 'enrich-candidates',
              action: 'skip-enrichment',
              condition: 'service-unavailable'
            }
          ]
        },
        sla: {
          maxDuration: 600000, // 10 minutes
          warningThreshold: 480000, // 8 minutes
          criticalThreshold: 540000 // 9 minutes
        }
      },
      
      simpleTravelPlanning: {
        name: 'Simple Travel Planning Workflow',
        description: 'Simplified travel planning for quick results',
        steps: [
          {
            id: 'initialize',
            name: 'Initialize Search',
            type: 'system',
            timeout: 15000,
            retries: 2,
            dependencies: [],
            outputs: ['search-initialized']
          },
          {
            id: 'generate-candidates',
            name: 'Generate Basic Candidates',
            type: 'swarm',
            swarm: 'CandidateSwarm',
            timeout: 60000,
            retries: 1,
            dependencies: ['initialize'],
            inputs: ['search-initialized'],
            outputs: ['candidates-generated'],
            config: { mode: 'fast', limit: 20 }
          },
          {
            id: 'rank-candidates',
            name: 'Quick Ranking',
            type: 'swarm',
            swarm: 'RankingSwarm',
            timeout: 30000,
            retries: 1,
            dependencies: ['generate-candidates'],
            inputs: ['candidates-generated'],
            outputs: ['candidates-ranked'],
            config: { algorithm: 'simple-score' }
          },
          {
            id: 'generate-output',
            name: 'Generate Quick Output',
            type: 'swarm',
            swarm: 'OutputSwarm',
            timeout: 30000,
            retries: 1,
            dependencies: ['rank-candidates'],
            inputs: ['candidates-ranked'],
            outputs: ['output-generated'],
            config: { template: 'quickResults', format: 'json' }
          },
          {
            id: 'finalize',
            name: 'Finalize Results',
            type: 'system',
            timeout: 15000,
            retries: 1,
            dependencies: ['generate-output'],
            inputs: ['output-generated'],
            outputs: ['workflow-completed']
          }
        ],
        sla: {
          maxDuration: 180000, // 3 minutes
          warningThreshold: 120000, // 2 minutes
          criticalThreshold: 150000 // 2.5 minutes
        }
      },
      
      bookingWorkflow: {
        name: 'Booking Workflow',
        description: 'Handle booking process for selected travel options',
        steps: [
          {
            id: 'validate-booking-request',
            name: 'Validate Booking Request',
            type: 'system',
            timeout: 30000,
            retries: 2,
            dependencies: [],
            outputs: ['booking-validated']
          },
          {
            id: 'check-availability',
            name: 'Check Real-time Availability',
            type: 'external',
            service: 'availability-service',
            timeout: 60000,
            retries: 3,
            dependencies: ['validate-booking-request'],
            inputs: ['booking-validated'],
            outputs: ['availability-confirmed']
          },
          {
            id: 'process-payment',
            name: 'Process Payment',
            type: 'external',
            service: 'payment-service',
            timeout: 120000,
            retries: 2,
            dependencies: ['check-availability'],
            inputs: ['availability-confirmed'],
            outputs: ['payment-processed']
          },
          {
            id: 'confirm-booking',
            name: 'Confirm Booking',
            type: 'external',
            service: 'booking-service',
            timeout: 90000,
            retries: 3,
            dependencies: ['process-payment'],
            inputs: ['payment-processed'],
            outputs: ['booking-confirmed']
          },
          {
            id: 'send-confirmation',
            name: 'Send Confirmation',
            type: 'system',
            timeout: 30000,
            retries: 2,
            dependencies: ['confirm-booking'],
            inputs: ['booking-confirmed'],
            outputs: ['confirmation-sent']
          }
        ],
        errorHandling: {
          strategy: 'compensate',
          compensationActions: [
            {
              step: 'process-payment',
              action: 'refund-payment',
              condition: 'booking-failed'
            },
            {
              step: 'confirm-booking',
              action: 'release-hold',
              condition: 'payment-failed'
            }
          ]
        },
        sla: {
          maxDuration: 300000, // 5 minutes
          warningThreshold: 180000, // 3 minutes
          criticalThreshold: 240000 // 4 minutes
        }
      }
    };
    
    // Workflow statistics
    this.workflowStats = {
      totalStarted: 0,
      totalCompleted: 0,
      totalFailed: 0,
      totalCancelled: 0,
      averageDuration: 0,
      templateStats: {},
      errorStats: {
        timeouts: 0,
        retryExhausted: 0,
        systemErrors: 0,
        validationErrors: 0
      }
    };
    
    // Initialize template stats
    Object.keys(this.workflowTemplates).forEach(templateName => {
      this.workflowStats.templateStats[templateName] = {
        started: 0,
        completed: 0,
        failed: 0,
        averageDuration: 0
      };
    });
    
    // Workflow execution context
    this.executionContext = {
      maxConcurrentWorkflows: this.config.orchestration.maxConcurrentSagas || 100,
      cleanupInterval: 300000, // 5 minutes
      maxWorkflowAge: 3600000, // 1 hour
      persistenceEnabled: true
    };
    
    this.startTime = Date.now();
  }

  async initialize() {
    logger.info('Initializing Workflow Manager');
    
    // Subscribe to workflow events
    this.eventBus.on('start-workflow', this.handleStartWorkflow.bind(this));
    this.eventBus.on('workflow-step-completed', this.handleStepCompleted.bind(this));
    this.eventBus.on('workflow-step-failed', this.handleStepFailed.bind(this));
    this.eventBus.on('cancel-workflow', this.handleCancelWorkflow.bind(this));
    this.eventBus.on('workflow-timeout', this.handleWorkflowTimeout.bind(this));
    
    // Start maintenance tasks
    this.startMaintenanceTasks();
    
    logger.info('Workflow Manager initialized');
  }

  startMaintenanceTasks() {
    // Clean up completed workflows
    setInterval(() => {
      this.cleanupCompletedWorkflows();
    }, this.executionContext.cleanupInterval);
    
    // Monitor workflow SLAs
    setInterval(() => {
      this.monitorWorkflowSLAs();
    }, 30000); // Check every 30 seconds
    
    // Update statistics
    setInterval(() => {
      this.updateWorkflowStatistics();
    }, 60000); // Update every minute
  }

  async startWorkflow(templateName, sagaId, initialData, options = {}) {
    try {
      logger.info(`Starting workflow ${templateName} for saga ${sagaId}`);
      
      // Check concurrent workflow limit
      if (this.activeWorkflows.size >= this.executionContext.maxConcurrentWorkflows) {
        throw new Error('Maximum concurrent workflows reached');
      }
      
      const template = this.workflowTemplates[templateName];
      if (!template) {
        throw new Error(`Unknown workflow template: ${templateName}`);
      }
      
      // Create workflow instance
      const workflow = {
        id: uuidv4(),
        sagaId,
        templateName,
        template,
        status: 'running',
        startTime: Date.now(),
        endTime: null,
        duration: null,
        currentStep: null,
        completedSteps: [],
        failedSteps: [],
        data: { ...initialData },
        context: {
          retryCount: 0,
          errors: [],
          warnings: [],
          stepResults: new Map()
        },
        options,
        slaStatus: 'ok'
      };
      
      // Store workflow
      this.activeWorkflows.set(workflow.id, workflow);
      
      // Update statistics
      this.workflowStats.totalStarted++;
      this.workflowStats.templateStats[templateName].started++;
      
      // Start execution
      await this.executeNextStep(workflow);
      
      // Emit workflow started event
      this.eventBus.emit('workflow-started', {
        workflowId: workflow.id,
        sagaId,
        templateName,
        startTime: workflow.startTime
      });
      
      return workflow.id;
      
    } catch (error) {
      logger.error('Error starting workflow:', error);
      
      this.workflowStats.errorStats.systemErrors++;
      
      this.eventBus.emit('workflow-start-failed', {
        sagaId,
        templateName,
        error: error.message,
        timestamp: Date.now()
      });
      
      throw error;
    }
  }

  async executeNextStep(workflow) {
    try {
      // Find next step to execute
      const nextStep = this.findNextStep(workflow);
      
      if (!nextStep) {
        // No more steps - workflow complete
        await this.completeWorkflow(workflow);
        return;
      }
      
      logger.info(`Executing step ${nextStep.id} for workflow ${workflow.id}`);
      
      workflow.currentStep = nextStep.id;
      
      // Set step timeout
      const timeoutId = setTimeout(() => {
        this.handleStepTimeout(workflow, nextStep);
      }, nextStep.timeout);
      
      // Execute step based on type
      let stepResult;
      
      switch (nextStep.type) {
        case 'system':
          stepResult = await this.executeSystemStep(workflow, nextStep);
          break;
        case 'swarm':
          stepResult = await this.executeSwarmStep(workflow, nextStep);
          break;
        case 'external':
          stepResult = await this.executeExternalStep(workflow, nextStep);
          break;
        default:
          throw new Error(`Unknown step type: ${nextStep.type}`);
      }
      
      // Clear timeout
      clearTimeout(timeoutId);
      
      // Handle step completion
      await this.handleStepSuccess(workflow, nextStep, stepResult);
      
    } catch (error) {
      logger.error(`Error executing step ${workflow.currentStep}:`, error);
      await this.handleStepError(workflow, error);
    }
  }

  findNextStep(workflow) {
    const template = workflow.template;
    
    // Find steps that haven't been completed and have all dependencies met
    const availableSteps = template.steps.filter(step => {
      // Skip completed steps
      if (workflow.completedSteps.includes(step.id)) {
        return false;
      }
      
      // Skip failed steps (unless retrying)
      if (workflow.failedSteps.includes(step.id)) {
        return false;
      }
      
      // Check dependencies
      return step.dependencies.every(dep => workflow.completedSteps.includes(dep));
    });
    
    // Return first available step (could be enhanced with priority logic)
    return availableSteps[0] || null;
  }

  async executeSystemStep(workflow, step) {
    logger.info(`Executing system step: ${step.name}`);
    
    switch (step.id) {
      case 'initialize':
        return await this.initializeWorkflow(workflow, step);
      case 'finalize':
        return await this.finalizeWorkflow(workflow, step);
      case 'validate-booking-request':
        return await this.validateBookingRequest(workflow, step);
      case 'send-confirmation':
        return await this.sendConfirmation(workflow, step);
      default:
        throw new Error(`Unknown system step: ${step.id}`);
    }
  }

  async executeSwarmStep(workflow, step) {
    logger.info(`Executing swarm step: ${step.name} with ${step.swarm}`);
    
    // Prepare step data
    const stepData = {
      sagaId: workflow.sagaId,
      workflowId: workflow.id,
      stepId: step.id,
      ...workflow.data,
      stepConfig: step.config || {}
    };
    
    // Get input data from previous steps
    if (step.inputs) {
      step.inputs.forEach(inputKey => {
        const inputData = workflow.context.stepResults.get(inputKey);
        if (inputData) {
          stepData[inputKey] = inputData;
        }
      });
    }
    
    // Emit event to trigger swarm execution
    const eventName = this.getSwarmEventName(step.swarm, step.id);
    
    return new Promise((resolve, reject) => {
      // Set up result handler
      const resultHandler = (event) => {
        if (event.sagaId === workflow.sagaId && event.workflowId === workflow.id) {
          this.eventBus.off(`${step.swarm.toLowerCase()}-completed`, resultHandler);
          this.eventBus.off(`${step.swarm.toLowerCase()}-failed`, errorHandler);
          resolve(event.data);
        }
      };
      
      const errorHandler = (event) => {
        if (event.sagaId === workflow.sagaId && event.workflowId === workflow.id) {
          this.eventBus.off(`${step.swarm.toLowerCase()}-completed`, resultHandler);
          this.eventBus.off(`${step.swarm.toLowerCase()}-failed`, errorHandler);
          reject(new Error(event.error));
        }
      };
      
      // Subscribe to result events
      this.eventBus.on(`${step.swarm.toLowerCase()}-completed`, resultHandler);
      this.eventBus.on(`${step.swarm.toLowerCase()}-failed`, errorHandler);
      
      // Emit the swarm execution event
      this.eventBus.emit(eventName, { data: stepData });
    });
  }

  async executeExternalStep(workflow, step) {
    logger.info(`Executing external step: ${step.name} with ${step.service}`);
    
    // Mock external service calls
    switch (step.service) {
      case 'availability-service':
        return await this.callAvailabilityService(workflow, step);
      case 'payment-service':
        return await this.callPaymentService(workflow, step);
      case 'booking-service':
        return await this.callBookingService(workflow, step);
      default:
        throw new Error(`Unknown external service: ${step.service}`);
    }
  }

  getSwarmEventName(swarmName, stepId) {
    const eventMap = {
      'CandidateSwarm': 'generate-candidates',
      'ValidationSwarm': 'validate-candidates',
      'RankingSwarm': 'rank-candidates',
      'SelectionSwarm': 'select-candidates',
      'EnrichmentSwarm': 'enrich-candidates',
      'OutputSwarm': 'generate-output'
    };
    
    return eventMap[swarmName] || stepId;
  }

  async handleStepSuccess(workflow, step, result) {
    logger.info(`Step ${step.id} completed successfully for workflow ${workflow.id}`);
    
    // Mark step as completed
    workflow.completedSteps.push(step.id);
    workflow.currentStep = null;
    
    // Store step results
    if (step.outputs) {
      step.outputs.forEach(outputKey => {
        workflow.context.stepResults.set(outputKey, result);
      });
    }
    
    // Reset retry count for this step
    workflow.context.retryCount = 0;
    
    // Emit step completed event
    this.eventBus.emit('workflow-step-completed', {
      workflowId: workflow.id,
      sagaId: workflow.sagaId,
      stepId: step.id,
      stepName: step.name,
      result,
      timestamp: Date.now()
    });
    
    // Continue with next step
    await this.executeNextStep(workflow);
  }

  async handleStepError(workflow, error) {
    const currentStep = workflow.template.steps.find(s => s.id === workflow.currentStep);
    
    if (!currentStep) {
      logger.error('No current step found for error handling');
      await this.failWorkflow(workflow, error);
      return;
    }
    
    logger.error(`Step ${currentStep.id} failed:`, error);
    
    workflow.context.errors.push({
      stepId: currentStep.id,
      error: error.message,
      timestamp: Date.now(),
      retryCount: workflow.context.retryCount
    });
    
    // Check if we should retry
    if (workflow.context.retryCount < (currentStep.retries || 0)) {
      workflow.context.retryCount++;
      
      logger.info(`Retrying step ${currentStep.id} (attempt ${workflow.context.retryCount})`);
      
      // Wait before retry (exponential backoff)
      const delay = Math.min(1000 * Math.pow(2, workflow.context.retryCount - 1), 30000);
      setTimeout(() => {
        this.executeNextStep(workflow);
      }, delay);
      
      return;
    }
    
    // No more retries - handle step failure
    await this.handleStepFailure(workflow, currentStep, error);
  }

  async handleStepFailure(workflow, step, error) {
    logger.error(`Step ${step.id} failed permanently for workflow ${workflow.id}`);
    
    workflow.failedSteps.push(step.id);
    workflow.currentStep = null;
    workflow.context.retryCount = 0;
    
    // Emit step failed event
    this.eventBus.emit('workflow-step-failed', {
      workflowId: workflow.id,
      sagaId: workflow.sagaId,
      stepId: step.id,
      stepName: step.name,
      error: error.message,
      timestamp: Date.now()
    });
    
    // Check error handling strategy
    const errorHandling = workflow.template.errorHandling;
    
    if (errorHandling) {
      switch (errorHandling.strategy) {
        case 'retry-and-fallback':
          await this.handleRetryAndFallback(workflow, step, error);
          break;
        case 'compensate':
          await this.handleCompensation(workflow, step, error);
          break;
        case 'fail-fast':
          await this.failWorkflow(workflow, error);
          break;
        default:
          await this.failWorkflow(workflow, error);
      }
    } else {
      await this.failWorkflow(workflow, error);
    }
  }

  async handleRetryAndFallback(workflow, step, error) {
    const errorHandling = workflow.template.errorHandling;
    
    // Check for compensation actions
    const compensationAction = errorHandling.compensationActions?.find(action => 
      action.step === step.id && this.matchesCondition(action.condition, error)
    );
    
    if (compensationAction) {
      logger.info(`Applying compensation action: ${compensationAction.action}`);
      await this.executeCompensationAction(workflow, compensationAction);
      
      // Try to continue workflow
      await this.executeNextStep(workflow);
      return;
    }
    
    // Check if we should use fallback workflow
    if (errorHandling.fallbackWorkflow) {
      logger.info(`Switching to fallback workflow: ${errorHandling.fallbackWorkflow}`);
      
      // Cancel current workflow
      workflow.status = 'cancelled';
      
      // Start fallback workflow
      await this.startWorkflow(
        errorHandling.fallbackWorkflow,
        workflow.sagaId,
        workflow.data,
        { ...workflow.options, fallbackFrom: workflow.templateName }
      );
      
      return;
    }
    
    // No fallback available - fail workflow
    await this.failWorkflow(workflow, error);
  }

  async handleCompensation(workflow, step, error) {
    const errorHandling = workflow.template.errorHandling;
    
    // Find compensation actions for this step
    const compensationActions = errorHandling.compensationActions?.filter(action => 
      action.step === step.id && this.matchesCondition(action.condition, error)
    ) || [];
    
    // Execute compensation actions
    for (const action of compensationActions) {
      try {
        logger.info(`Executing compensation action: ${action.action}`);
        await this.executeCompensationAction(workflow, action);
      } catch (compensationError) {
        logger.error('Compensation action failed:', compensationError);
        workflow.context.errors.push({
          type: 'compensation',
          action: action.action,
          error: compensationError.message,
          timestamp: Date.now()
        });
      }
    }
    
    // Fail workflow after compensation
    await this.failWorkflow(workflow, error);
  }

  matchesCondition(condition, error) {
    switch (condition) {
      case 'timeout':
        return error.message.includes('timeout') || error.name === 'TimeoutError';
      case 'service-unavailable':
        return error.message.includes('unavailable') || error.message.includes('503');
      case 'payment-failed':
        return error.message.includes('payment');
      case 'booking-failed':
        return error.message.includes('booking');
      default:
        return true;
    }
  }

  async executeCompensationAction(workflow, action) {
    switch (action.action) {
      case 'use-cached-results':
        return await this.useCachedResults(workflow, action);
      case 'skip-enrichment':
        return await this.skipEnrichment(workflow, action);
      case 'refund-payment':
        return await this.refundPayment(workflow, action);
      case 'release-hold':
        return await this.releaseHold(workflow, action);
      default:
        logger.warn(`Unknown compensation action: ${action.action}`);
    }
  }

  async completeWorkflow(workflow) {
    logger.info(`Completing workflow ${workflow.id}`);
    
    workflow.status = 'completed';
    workflow.endTime = Date.now();
    workflow.duration = workflow.endTime - workflow.startTime;
    
    // Update statistics
    this.workflowStats.totalCompleted++;
    this.workflowStats.templateStats[workflow.templateName].completed++;
    
    const templateStats = this.workflowStats.templateStats[workflow.templateName];
    templateStats.averageDuration = 
      (templateStats.averageDuration * (templateStats.completed - 1) + workflow.duration) / 
      templateStats.completed;
    
    // Emit completion event
    this.eventBus.emit('workflow-completed', {
      workflowId: workflow.id,
      sagaId: workflow.sagaId,
      templateName: workflow.templateName,
      duration: workflow.duration,
      completedSteps: workflow.completedSteps,
      timestamp: workflow.endTime
    });
    
    logger.info(`Workflow ${workflow.id} completed in ${workflow.duration}ms`);
  }

  async failWorkflow(workflow, error) {
    logger.error(`Failing workflow ${workflow.id}:`, error);
    
    workflow.status = 'failed';
    workflow.endTime = Date.now();
    workflow.duration = workflow.endTime - workflow.startTime;
    
    // Update statistics
    this.workflowStats.totalFailed++;
    this.workflowStats.templateStats[workflow.templateName].failed++;
    this.workflowStats.errorStats.systemErrors++;
    
    // Emit failure event
    this.eventBus.emit('workflow-failed', {
      workflowId: workflow.id,
      sagaId: workflow.sagaId,
      templateName: workflow.templateName,
      error: error.message,
      duration: workflow.duration,
      completedSteps: workflow.completedSteps,
      failedSteps: workflow.failedSteps,
      timestamp: workflow.endTime
    });
  }

  async cancelWorkflow(workflowId, reason = 'User cancelled') {
    const workflow = this.activeWorkflows.get(workflowId);
    
    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }
    
    logger.info(`Cancelling workflow ${workflowId}: ${reason}`);
    
    workflow.status = 'cancelled';
    workflow.endTime = Date.now();
    workflow.duration = workflow.endTime - workflow.startTime;
    
    // Update statistics
    this.workflowStats.totalCancelled++;
    
    // Emit cancellation event
    this.eventBus.emit('workflow-cancelled', {
      workflowId: workflow.id,
      sagaId: workflow.sagaId,
      templateName: workflow.templateName,
      reason,
      duration: workflow.duration,
      timestamp: workflow.endTime
    });
  }

  // System step implementations
  async initializeWorkflow(workflow, step) {
    logger.info(`Initializing workflow for saga ${workflow.sagaId}`);
    
    // Validate input data
    if (!workflow.data.searchCriteria) {
      throw new Error('Search criteria required');
    }
    
    // Initialize workflow context
    workflow.context.initialized = true;
    workflow.context.initializationTime = Date.now();
    
    return {
      status: 'initialized',
      sagaId: workflow.sagaId,
      searchCriteria: workflow.data.searchCriteria,
      timestamp: Date.now()
    };
  }

  async finalizeWorkflow(workflow, step) {
    logger.info(`Finalizing workflow for saga ${workflow.sagaId}`);
    
    // Get final results from step results
    const outputData = workflow.context.stepResults.get('output-generated');
    
    if (!outputData) {
      throw new Error('No output data available for finalization');
    }
    
    // Prepare final results
    const finalResults = {
      sagaId: workflow.sagaId,
      workflowId: workflow.id,
      results: outputData,
      metadata: {
        templateName: workflow.templateName,
        duration: Date.now() - workflow.startTime,
        completedSteps: workflow.completedSteps.length,
        totalSteps: workflow.template.steps.length,
        finalizedAt: Date.now()
      }
    };
    
    return finalResults;
  }

  async validateBookingRequest(workflow, step) {
    logger.info(`Validating booking request for saga ${workflow.sagaId}`);
    
    const bookingData = workflow.data.bookingRequest;
    
    if (!bookingData) {
      throw new Error('Booking request data required');
    }
    
    // Mock validation
    const validation = {
      isValid: true,
      validatedFields: ['customer', 'selections', 'payment'],
      warnings: [],
      timestamp: Date.now()
    };
    
    return validation;
  }

  async sendConfirmation(workflow, step) {
    logger.info(`Sending confirmation for saga ${workflow.sagaId}`);
    
    const bookingConfirmation = workflow.context.stepResults.get('booking-confirmed');
    
    if (!bookingConfirmation) {
      throw new Error('No booking confirmation available');
    }
    
    // Mock confirmation sending
    const confirmation = {
      confirmationId: `CONF-${Date.now()}`,
      bookingReference: bookingConfirmation.bookingReference,
      sentTo: workflow.data.customer?.email,
      sentAt: Date.now(),
      status: 'sent'
    };
    
    return confirmation;
  }

  // External service implementations (mocked)
  async callAvailabilityService(workflow, step) {
    logger.info('Calling availability service');
    
    // Mock availability check
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    return {
      available: true,
      holdExpiry: Date.now() + (15 * 60 * 1000), // 15 minutes
      confirmationRequired: true,
      timestamp: Date.now()
    };
  }

  async callPaymentService(workflow, step) {
    logger.info('Calling payment service');
    
    // Mock payment processing
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    return {
      transactionId: `TXN-${Date.now()}`,
      status: 'completed',
      amount: workflow.data.totalAmount || 1000,
      currency: workflow.data.currency || 'USD',
      timestamp: Date.now()
    };
  }

  async callBookingService(workflow, step) {
    logger.info('Calling booking service');
    
    // Mock booking confirmation
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    return {
      bookingReference: `BK-${Date.now()}`,
      status: 'confirmed',
      confirmationNumber: `CONF-${Date.now()}`,
      timestamp: Date.now()
    };
  }

  // Compensation action implementations
  async useCachedResults(workflow, action) {
    logger.info('Using cached results as compensation');
    
    // Mock cached results
    const cachedResults = {
      source: 'cache',
      data: { candidates: [] },
      timestamp: Date.now()
    };
    
    workflow.context.stepResults.set('candidates-generated', cachedResults);
    return cachedResults;
  }

  async skipEnrichment(workflow, action) {
    logger.info('Skipping enrichment as compensation');
    
    // Use candidates without enrichment
    const selectedCandidates = workflow.context.stepResults.get('candidates-selected');
    
    if (selectedCandidates) {
      workflow.context.stepResults.set('candidates-enriched', {
        ...selectedCandidates,
        enriched: false,
        enrichmentSkipped: true,
        timestamp: Date.now()
      });
    }
    
    return { enrichmentSkipped: true };
  }

  async refundPayment(workflow, action) {
    logger.info('Processing payment refund as compensation');
    
    const paymentData = workflow.context.stepResults.get('payment-processed');
    
    if (paymentData) {
      // Mock refund processing
      return {
        refundId: `REF-${Date.now()}`,
        originalTransactionId: paymentData.transactionId,
        amount: paymentData.amount,
        status: 'refunded',
        timestamp: Date.now()
      };
    }
    
    return { refundSkipped: true, reason: 'No payment to refund' };
  }

  async releaseHold(workflow, action) {
    logger.info('Releasing availability hold as compensation');
    
    const availabilityData = workflow.context.stepResults.get('availability-confirmed');
    
    if (availabilityData) {
      // Mock hold release
      return {
        holdReleased: true,
        originalHoldExpiry: availabilityData.holdExpiry,
        releasedAt: Date.now()
      };
    }
    
    return { holdReleaseSkipped: true, reason: 'No hold to release' };
  }

  // Event handlers
  async handleStartWorkflow(event) {
    const { templateName, sagaId, data, options } = event.data;
    
    try {
      await this.startWorkflow(templateName, sagaId, data, options);
    } catch (error) {
      logger.error('Error handling start workflow event:', error);
    }
  }

  async handleStepCompleted(event) {
    // This is handled internally by executeNextStep
    logger.debug('Step completed event received:', event.data);
  }

  async handleStepFailed(event) {
    // This is handled internally by handleStepError
    logger.debug('Step failed event received:', event.data);
  }

  async handleCancelWorkflow(event) {
    const { workflowId, reason } = event.data;
    
    try {
      await this.cancelWorkflow(workflowId, reason);
    } catch (error) {
      logger.error('Error handling cancel workflow event:', error);
    }
  }

  async handleWorkflowTimeout(event) {
    const { workflowId } = event.data;
    
    const workflow = this.activeWorkflows.get(workflowId);
    if (workflow) {
      logger.warn(`Workflow ${workflowId} timed out`);
      
      this.workflowStats.errorStats.timeouts++;
      
      await this.failWorkflow(workflow, new Error('Workflow timeout'));
    }
  }

  handleStepTimeout(workflow, step) {
    logger.warn(`Step ${step.id} timed out for workflow ${workflow.id}`);
    
    this.workflowStats.errorStats.timeouts++;
    
    this.handleStepError(workflow, new Error(`Step ${step.id} timed out`));
  }

  // Maintenance methods
  cleanupCompletedWorkflows() {
    const now = Date.now();
    const maxAge = this.executionContext.maxWorkflowAge;
    
    let cleanedCount = 0;
    
    for (const [workflowId, workflow] of this.activeWorkflows) {
      if (['completed', 'failed', 'cancelled'].includes(workflow.status)) {
        const age = now - (workflow.endTime || workflow.startTime);
        
        if (age > maxAge) {
          this.activeWorkflows.delete(workflowId);
          cleanedCount++;
        }
      }
    }
    
    if (cleanedCount > 0) {
      logger.info(`Cleaned up ${cleanedCount} completed workflows`);
    }
  }

  monitorWorkflowSLAs() {
    const now = Date.now();
    
    for (const [workflowId, workflow] of this.activeWorkflows) {
      if (workflow.status !== 'running') continue;
      
      const duration = now - workflow.startTime;
      const sla = workflow.template.sla;
      
      if (!sla) continue;
      
      let newSlaStatus = 'ok';
      
      if (duration > sla.maxDuration) {
        newSlaStatus = 'exceeded';
        
        // Timeout the workflow
        this.eventBus.emit('workflow-timeout', {
          workflowId: workflow.id,
          sagaId: workflow.sagaId,
          duration,
          maxDuration: sla.maxDuration
        });
        
      } else if (duration > sla.criticalThreshold) {
        newSlaStatus = 'critical';
      } else if (duration > sla.warningThreshold) {
        newSlaStatus = 'warning';
      }
      
      if (newSlaStatus !== workflow.slaStatus) {
        workflow.slaStatus = newSlaStatus;
        
        this.eventBus.emit('workflow-sla-status-changed', {
          workflowId: workflow.id,
          sagaId: workflow.sagaId,
          oldStatus: workflow.slaStatus,
          newStatus: newSlaStatus,
          duration,
          timestamp: now
        });
      }
    }
  }

  updateWorkflowStatistics() {
    // Calculate overall average duration
    const completedWorkflows = Array.from(this.activeWorkflows.values())
      .filter(w => w.status === 'completed' && w.duration);
    
    if (completedWorkflows.length > 0) {
      const totalDuration = completedWorkflows.reduce((sum, w) => sum + w.duration, 0);
      this.workflowStats.averageDuration = totalDuration / completedWorkflows.length;
    }
    
    logger.debug('Workflow statistics updated', {
      active: this.activeWorkflows.size,
      totalStarted: this.workflowStats.totalStarted,
      totalCompleted: this.workflowStats.totalCompleted,
      totalFailed: this.workflowStats.totalFailed,
      averageDuration: Math.round(this.workflowStats.averageDuration)
    });
  }

  // Query methods
  getWorkflowStatus(workflowId) {
    const workflow = this.activeWorkflows.get(workflowId);
    
    if (!workflow) {
      return null;
    }
    
    return {
      id: workflow.id,
      sagaId: workflow.sagaId,
      templateName: workflow.templateName,
      status: workflow.status,
      currentStep: workflow.currentStep,
      completedSteps: workflow.completedSteps,
      failedSteps: workflow.failedSteps,
      startTime: workflow.startTime,
      endTime: workflow.endTime,
      duration: workflow.duration,
      slaStatus: workflow.slaStatus,
      errorCount: workflow.context.errors.length
    };
  }

  getWorkflowsBySaga(sagaId) {
    return Array.from(this.activeWorkflows.values())
      .filter(w => w.sagaId === sagaId)
      .map(w => this.getWorkflowStatus(w.id));
  }

  getActiveWorkflows() {
    return Array.from(this.activeWorkflows.values())
      .filter(w => w.status === 'running')
      .map(w => this.getWorkflowStatus(w.id));
  }

  getWorkflowStatistics() {
    return {
      ...this.workflowStats,
      activeWorkflows: this.activeWorkflows.size,
      runningWorkflows: Array.from(this.activeWorkflows.values()).filter(w => w.status === 'running').length,
      uptime: Date.now() - this.startTime
    };
  }

  getWorkflowTemplates() {
    return Object.keys(this.workflowTemplates).map(name => ({
      name,
      description: this.workflowTemplates[name].description,
      steps: this.workflowTemplates[name].steps.length,
      sla: this.workflowTemplates[name].sla
    }));
  }

  async shutdown() {
    logger.info('Shutting down Workflow Manager');
    
    // Cancel all active workflows
    const activeWorkflowIds = Array.from(this.activeWorkflows.keys());
    
    for (const workflowId of activeWorkflowIds) {
      try {
        await this.cancelWorkflow(workflowId, 'System shutdown');
      } catch (error) {
        logger.error(`Error cancelling workflow ${workflowId}:`, error);
      }
    }
    
    // Clear all workflows
    this.activeWorkflows.clear();
    
    // Update final statistics
    this.updateWorkflowStatistics();
    
    logger.info('Workflow Manager shutdown complete');
  }
}