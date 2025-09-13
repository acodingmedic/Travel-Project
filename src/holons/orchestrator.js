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

export class Orchestrator extends BaseHolon {
  constructor(orchestration) {
    super('Orchestrator', orchestration);
    this.config = getSystemConfig();
    this.activeWorkflows = new Map();
    this.workflowTemplates = new Map();
    this.metrics = {
      workflowsStarted: 0,
      workflowsCompleted: 0,
      workflowsFailed: 0,
      averageWorkflowTime: 0,
      stateTransitions: 0
    };
    
    this.initializeWorkflowTemplates();
  }

  async initialize() {
    await super.initialize();
    
    // Subscribe to workflow events
    this.subscribe('INTENT', this.handleIntentEvent.bind(this));
    this.subscribe('CANDIDATES', this.handleCandidatesEvent.bind(this));
    this.subscribe('AVAILABILITY', this.handleAvailabilityEvent.bind(this));
    this.subscribe('CONSTRAINTS', this.handleConstraintsEvent.bind(this));
    this.subscribe('SELECTION_PROP', this.handleSelectionProposalEvent.bind(this));
    this.subscribe('SELECTION_CONF', this.handleSelectionConfirmationEvent.bind(this));
    this.subscribe('ITINERARY', this.handleItineraryEvent.bind(this));
    this.subscribe('REVISION', this.handleRevisionEvent.bind(this));
    this.subscribe('FALLBACK', this.handleFallbackEvent.bind(this));
    this.subscribe('OUTPUT', this.handleOutputEvent.bind(this));
    
    logger.info('Orchestrator holon initialized');
  }

  initializeWorkflowTemplates() {
    // CREATE saga workflow
    this.workflowTemplates.set('CREATE', {
      name: 'CREATE',
      states: ['ADMIT', 'GEN', 'VERIFY', 'RANK', 'SELECT', 'ENRICH', 'BUILD', 'FINAL_VERIFY', 'PACKAGE', 'DONE'],
      transitions: {
        'ADMIT': ['GEN'],
        'GEN': ['VERIFY'],
        'VERIFY': ['RANK', 'GEN'], // Can loop back for regeneration
        'RANK': ['SELECT'],
        'SELECT': ['ENRICH'],
        'ENRICH': ['BUILD'],
        'BUILD': ['FINAL_VERIFY'],
        'FINAL_VERIFY': ['PACKAGE', 'BUILD'], // Can loop back for rebuild
        'PACKAGE': ['DONE']
      },
      timeouts: {
        'ADMIT': 2000,
        'GEN': 8000,
        'VERIFY': 3000,
        'RANK': 2000,
        'SELECT': 1000,
        'ENRICH': 4000,
        'BUILD': 3000,
        'FINAL_VERIFY': 2000,
        'PACKAGE': 1000
      }
    });

    // REVISE saga workflow
    this.workflowTemplates.set('REVISE', {
      name: 'REVISE',
      states: ['ADMIT', 'ANALYZE', 'GEN', 'VERIFY', 'RANK', 'SELECT', 'ENRICH', 'BUILD', 'FINAL_VERIFY', 'PACKAGE', 'DONE'],
      transitions: {
        'ADMIT': ['ANALYZE'],
        'ANALYZE': ['GEN'],
        'GEN': ['VERIFY'],
        'VERIFY': ['RANK', 'GEN'],
        'RANK': ['SELECT'],
        'SELECT': ['ENRICH'],
        'ENRICH': ['BUILD'],
        'BUILD': ['FINAL_VERIFY'],
        'FINAL_VERIFY': ['PACKAGE', 'BUILD'],
        'PACKAGE': ['DONE']
      },
      timeouts: {
        'ADMIT': 1000,
        'ANALYZE': 2000,
        'GEN': 4000, // Faster for revisions
        'VERIFY': 2000,
        'RANK': 1000,
        'SELECT': 500,
        'ENRICH': 2000,
        'BUILD': 2000,
        'FINAL_VERIFY': 1000,
        'PACKAGE': 500
      }
    });
  }

  async handleIntentEvent(event) {
    const { sagaId, correlationId, data } = event;
    
    try {
      // Determine workflow type
      const workflowType = data.revisions && data.revisions.length > 0 ? 'REVISE' : 'CREATE';
      
      // Create workflow instance
      const workflow = await this.createWorkflowInstance(sagaId, correlationId, workflowType, data);
      
      // Start workflow
      await this.startWorkflow(workflow);
      
      logger.info(`Workflow ${workflowType} started for saga ${sagaId}`);
      
    } catch (error) {
      logger.error(`Failed to handle INTENT event for saga ${sagaId}:`, error);
      await this.handleWorkflowError(sagaId, 'INTENT', error);
    }
  }

  async createWorkflowInstance(sagaId, correlationId, workflowType, data) {
    const template = this.workflowTemplates.get(workflowType);
    if (!template) {
      throw new Error(`Unknown workflow type: ${workflowType}`);
    }

    const workflow = {
      sagaId,
      correlationId,
      type: workflowType,
      currentState: template.states[0],
      states: [...template.states],
      transitions: { ...template.transitions },
      timeouts: { ...template.timeouts },
      data,
      startTime: Date.now(),
      stateHistory: [],
      retryCount: 0,
      maxRetries: this.config.orchestration.retries.max || 3,
      status: 'active'
    };

    this.activeWorkflows.set(sagaId, workflow);
    this.metrics.workflowsStarted++;
    
    return workflow;
  }

  async startWorkflow(workflow) {
    await this.transitionToState(workflow, workflow.currentState);
  }

  async transitionToState(workflow, newState) {
    const previousState = workflow.currentState;
    
    // Validate transition
    if (previousState && !this.isValidTransition(workflow, previousState, newState)) {
      throw new Error(`Invalid transition from ${previousState} to ${newState}`);
    }

    // Update workflow state
    workflow.currentState = newState;
    workflow.stateHistory.push({
      state: newState,
      timestamp: new Date().toISOString(),
      previousState
    });
    
    this.metrics.stateTransitions++;
    
    logger.debug(`Workflow ${workflow.sagaId} transitioned to state: ${newState}`);
    
    // Set timeout for this state
    const timeout = workflow.timeouts[newState];
    if (timeout) {
      setTimeout(() => {
        this.handleStateTimeout(workflow.sagaId, newState);
      }, timeout);
    }
    
    // Execute state logic
    await this.executeStateLogic(workflow, newState);
  }

  isValidTransition(workflow, fromState, toState) {
    const validTransitions = workflow.transitions[fromState] || [];
    return validTransitions.includes(toState);
  }

  async executeStateLogic(workflow, state) {
    try {
      switch (state) {
        case 'ADMIT':
          await this.executeAdmitState(workflow);
          break;
        case 'GEN':
          await this.executeGenerateState(workflow);
          break;
        case 'VERIFY':
          await this.executeVerifyState(workflow);
          break;
        case 'RANK':
          await this.executeRankState(workflow);
          break;
        case 'SELECT':
          await this.executeSelectState(workflow);
          break;
        case 'ENRICH':
          await this.executeEnrichState(workflow);
          break;
        case 'BUILD':
          await this.executeBuildState(workflow);
          break;
        case 'FINAL_VERIFY':
          await this.executeFinalVerifyState(workflow);
          break;
        case 'PACKAGE':
          await this.executePackageState(workflow);
          break;
        case 'DONE':
          await this.executeCompleteState(workflow);
          break;
        case 'ANALYZE':
          await this.executeAnalyzeState(workflow);
          break;
        default:
          logger.warn(`Unknown state: ${state} for workflow ${workflow.sagaId}`);
      }
    } catch (error) {
      logger.error(`Error executing state ${state} for workflow ${workflow.sagaId}:`, error);
      await this.handleWorkflowError(workflow.sagaId, state, error);
    }
  }

  async executeAdmitState(workflow) {
    // Validate and admit the request
    await this.publish('workflow-state-change', {
      sagaId: workflow.sagaId,
      state: 'ADMIT',
      data: workflow.data
    });
    
    // Auto-transition to next state
    await this.transitionToState(workflow, 'GEN');
  }

  async executeGenerateState(workflow) {
    // Trigger candidate generation
    await this.enqueue('heavy-llm', {
      type: 'generate-candidates',
      sagaId: workflow.sagaId,
      data: workflow.data
    });
    
    // Wait for CANDIDATES event
  }

  async executeVerifyState(workflow) {
    // Trigger verification
    await this.enqueue('verify', {
      type: 'verify-candidates',
      sagaId: workflow.sagaId,
      data: workflow.data
    });
    
    // Wait for AVAILABILITY event
  }

  async executeRankState(workflow) {
    // Trigger ranking
    await this.enqueue('fast-io', {
      type: 'rank-candidates',
      sagaId: workflow.sagaId,
      data: workflow.data
    });
    
    // Wait for CONSTRAINTS event
  }

  async executeSelectState(workflow) {
    // Trigger selection
    await this.enqueue('fast-io', {
      type: 'select-candidates',
      sagaId: workflow.sagaId,
      data: workflow.data
    });
    
    // Wait for SELECTION_PROP event
  }

  async executeEnrichState(workflow) {
    // Trigger enrichment
    await this.enqueue('background', {
      type: 'enrich-selections',
      sagaId: workflow.sagaId,
      data: workflow.data
    });
    
    // Wait for enrichment completion
  }

  async executeBuildState(workflow) {
    // Trigger itinerary building
    await this.enqueue('fast-io', {
      type: 'build-itinerary',
      sagaId: workflow.sagaId,
      data: workflow.data
    });
    
    // Wait for ITINERARY event
  }

  async executeFinalVerifyState(workflow) {
    // Final verification
    await this.enqueue('verify', {
      type: 'final-verify',
      sagaId: workflow.sagaId,
      data: workflow.data
    });
    
    // Auto-transition after verification
    setTimeout(() => {
      this.transitionToState(workflow, 'PACKAGE');
    }, 1000);
  }

  async executePackageState(workflow) {
    // Package final output
    await this.enqueue('finalize', {
      type: 'package-output',
      sagaId: workflow.sagaId,
      data: workflow.data
    });
    
    // Wait for OUTPUT event
  }

  async executeCompleteState(workflow) {
    // Mark workflow as complete
    workflow.status = 'completed';
    workflow.endTime = Date.now();
    
    const totalTime = workflow.endTime - workflow.startTime;
    this.updateAverageWorkflowTime(totalTime);
    this.metrics.workflowsCompleted++;
    
    await this.publish('workflow-complete', {
      sagaId: workflow.sagaId,
      totalTime,
      stateTransitions: workflow.stateHistory.length
    });
    
    // Clean up
    this.activeWorkflows.delete(workflow.sagaId);
    
    logger.info(`Workflow completed for saga ${workflow.sagaId}`, {
      totalTime,
      stateTransitions: workflow.stateHistory.length
    });
  }

  async executeAnalyzeState(workflow) {
    // Analyze revision requirements
    await this.enqueue('fast-io', {
      type: 'analyze-revision',
      sagaId: workflow.sagaId,
      data: workflow.data
    });
    
    // Auto-transition to generation
    setTimeout(() => {
      this.transitionToState(workflow, 'GEN');
    }, 500);
  }

  // Event handlers for workflow progression
  async handleCandidatesEvent(event) {
    const workflow = this.activeWorkflows.get(event.sagaId);
    if (workflow && workflow.currentState === 'GEN') {
      await this.transitionToState(workflow, 'VERIFY');
    }
  }

  async handleAvailabilityEvent(event) {
    const workflow = this.activeWorkflows.get(event.sagaId);
    if (workflow && workflow.currentState === 'VERIFY') {
      await this.transitionToState(workflow, 'RANK');
    }
  }

  async handleConstraintsEvent(event) {
    const workflow = this.activeWorkflows.get(event.sagaId);
    if (workflow && workflow.currentState === 'RANK') {
      await this.transitionToState(workflow, 'SELECT');
    }
  }

  async handleSelectionProposalEvent(event) {
    const workflow = this.activeWorkflows.get(event.sagaId);
    if (workflow && workflow.currentState === 'SELECT') {
      await this.transitionToState(workflow, 'ENRICH');
    }
  }

  async handleSelectionConfirmationEvent(event) {
    const workflow = this.activeWorkflows.get(event.sagaId);
    if (workflow && workflow.currentState === 'ENRICH') {
      await this.transitionToState(workflow, 'BUILD');
    }
  }

  async handleItineraryEvent(event) {
    const workflow = this.activeWorkflows.get(event.sagaId);
    if (workflow && workflow.currentState === 'BUILD') {
      await this.transitionToState(workflow, 'FINAL_VERIFY');
    }
  }

  async handleRevisionEvent(event) {
    const workflow = this.activeWorkflows.get(event.sagaId);
    if (workflow) {
      // Handle revision by creating new REVISE workflow
      const reviseWorkflow = await this.createWorkflowInstance(
        event.sagaId + '_rev_' + Date.now(),
        event.correlationId,
        'REVISE',
        event.data
      );
      
      await this.startWorkflow(reviseWorkflow);
    }
  }

  async handleFallbackEvent(event) {
    const workflow = this.activeWorkflows.get(event.sagaId);
    if (workflow) {
      // Implement fallback logic
      logger.warn(`Fallback triggered for workflow ${event.sagaId}`);
      await this.executeFallbackStrategy(workflow, event.data);
    }
  }

  async handleOutputEvent(event) {
    const workflow = this.activeWorkflows.get(event.sagaId);
    if (workflow && workflow.currentState === 'PACKAGE') {
      await this.transitionToState(workflow, 'DONE');
    }
  }

  async handleStateTimeout(sagaId, state) {
    const workflow = this.activeWorkflows.get(sagaId);
    if (!workflow || workflow.currentState !== state) {
      return; // State has already changed
    }

    logger.warn(`State timeout for workflow ${sagaId} in state ${state}`);
    
    // Implement timeout handling
    if (workflow.retryCount < workflow.maxRetries) {
      workflow.retryCount++;
      logger.info(`Retrying state ${state} for workflow ${sagaId} (attempt ${workflow.retryCount})`);
      await this.executeStateLogic(workflow, state);
    } else {
      await this.handleWorkflowError(sagaId, state, new Error(`State timeout: ${state}`));
    }
  }

  async handleWorkflowError(sagaId, state, error) {
    const workflow = this.activeWorkflows.get(sagaId);
    if (workflow) {
      workflow.status = 'failed';
      workflow.error = {
        state,
        message: error.message,
        timestamp: new Date().toISOString()
      };
      
      this.metrics.workflowsFailed++;
      
      await this.publish('workflow-error', {
        sagaId,
        state,
        error: error.message
      });
      
      this.activeWorkflows.delete(sagaId);
    }
  }

  async executeFallbackStrategy(workflow, fallbackData) {
    // Implement fallback strategies: cache→alt→scrape→omit
    logger.info(`Executing fallback strategy for workflow ${workflow.sagaId}`);
    
    // For now, just transition to next state
    const nextStates = workflow.transitions[workflow.currentState] || [];
    if (nextStates.length > 0) {
      await this.transitionToState(workflow, nextStates[0]);
    }
  }

  updateAverageWorkflowTime(newTime) {
    if (this.metrics.averageWorkflowTime === 0) {
      this.metrics.averageWorkflowTime = newTime;
    } else {
      this.metrics.averageWorkflowTime = 
        (this.metrics.averageWorkflowTime * 0.9) + (newTime * 0.1);
    }
  }

  getMetrics() {
    return {
      ...this.metrics,
      activeWorkflows: this.activeWorkflows.size,
      workflowTypes: Array.from(this.workflowTemplates.keys()),
      successRate: this.metrics.workflowsStarted > 0 
        ? (this.metrics.workflowsCompleted / this.metrics.workflowsStarted) * 100 
        : 0
    };
  }

  async shutdown() {
    logger.info('Shutting down Orchestrator holon');
    
    // Cancel all active workflows
    for (const [sagaId, workflow] of this.activeWorkflows) {
      workflow.status = 'cancelled';
      await this.publish('workflow-cancelled', { sagaId });
    }
    
    this.activeWorkflows.clear();
    await super.shutdown();
  }
}