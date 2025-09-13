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

export class DecisionEngine extends EventEmitter {
  constructor(eventBus) {
    super();
    this.eventBus = eventBus;
    this.config = getConfig();
    
    // Decision mechanisms
    this.mechanisms = {
      voting: new VotingMechanism(this.eventBus),
      auction: new AuctionMechanism(this.eventBus),
      arbiter: new ArbiterMechanism(this.eventBus),
      consensus: new ConsensusMechanism(this.eventBus),
      ranking: new RankingMechanism(this.eventBus)
    };
    
    // Active decisions
    this.activeDecisions = new Map();
    
    // Decision history
    this.decisionHistory = [];
    
    // Decision templates
    this.decisionTemplates = {
      'candidate-selection': {
        mechanism: 'voting',
        participants: ['candidate-swarm', 'validation-swarm', 'ranking-swarm'],
        criteria: ['quality', 'price', 'availability', 'user-preference'],
        timeout: 30000,
        quorum: 0.67,
        weightingStrategy: 'expertise-based'
      },
      'resource-allocation': {
        mechanism: 'auction',
        participants: ['all-swarms'],
        criteria: ['resource-need', 'priority', 'deadline'],
        timeout: 15000,
        reservePrice: 0,
        bidIncrement: 1
      },
      'conflict-resolution': {
        mechanism: 'arbiter',
        participants: ['conflicting-parties'],
        criteria: ['evidence', 'precedent', 'impact'],
        timeout: 60000,
        arbiterSelection: 'expertise-based'
      },
      'system-configuration': {
        mechanism: 'consensus',
        participants: ['all-holons'],
        criteria: ['system-impact', 'performance', 'security'],
        timeout: 120000,
        consensusThreshold: 0.8
      },
      'priority-ranking': {
        mechanism: 'ranking',
        participants: ['relevant-swarms'],
        criteria: ['urgency', 'importance', 'effort', 'impact'],
        timeout: 20000,
        rankingMethod: 'weighted-score'
      }
    };
    
    // Statistics
    this.statistics = {
      totalDecisions: 0,
      successfulDecisions: 0,
      failedDecisions: 0,
      timeoutDecisions: 0,
      averageDecisionTime: 0,
      mechanismUsage: {
        voting: 0,
        auction: 0,
        arbiter: 0,
        consensus: 0,
        ranking: 0
      }
    };
    
    this.startTime = Date.now();
  }

  async initialize() {
    logger.info('Initializing Decision Engine');
    
    // Initialize all mechanisms
    for (const [name, mechanism] of Object.entries(this.mechanisms)) {
      await mechanism.initialize();
      logger.info(`Initialized ${name} mechanism`);
    }
    
    // Subscribe to events
    this.eventBus.on('decision-request', this.handleDecisionRequest.bind(this));
    this.eventBus.on('decision-vote', this.handleVote.bind(this));
    this.eventBus.on('decision-bid', this.handleBid.bind(this));
    this.eventBus.on('decision-arbitration', this.handleArbitration.bind(this));
    this.eventBus.on('decision-timeout', this.handleTimeout.bind(this));
    
    // Start maintenance tasks
    this.startMaintenanceTasks();
    
    logger.info('Decision Engine initialized');
  }

  startMaintenanceTasks() {
    // Clean up completed decisions
    setInterval(() => {
      this.cleanupCompletedDecisions();
    }, 60 * 1000); // Every minute
    
    // Update statistics
    setInterval(() => {
      this.updateStatistics();
    }, 30 * 1000); // Every 30 seconds
    
    // Health check
    setInterval(() => {
      this.performHealthCheck();
    }, 60 * 1000); // Every minute
  }

  // Core Decision Methods
  async makeDecision(type, context, options = {}) {
    const decisionId = uuidv4();
    const template = this.decisionTemplates[type] || this.decisionTemplates['candidate-selection'];
    
    const decision = {
      id: decisionId,
      type,
      context,
      template: { ...template, ...options },
      status: 'pending',
      createdAt: Date.now(),
      participants: new Set(),
      responses: new Map(),
      result: null,
      metadata: {
        initiator: options.initiator || 'system',
        priority: options.priority || 'medium',
        tags: options.tags || []
      }
    };
    
    this.activeDecisions.set(decisionId, decision);
    
    logger.info(`Starting decision ${decisionId} of type ${type}`);
    
    try {
      // Select and execute mechanism
      const mechanism = this.mechanisms[decision.template.mechanism];
      if (!mechanism) {
        throw new Error(`Unknown decision mechanism: ${decision.template.mechanism}`);
      }
      
      decision.status = 'active';
      this.statistics.mechanismUsage[decision.template.mechanism]++;
      
      // Set timeout
      const timeoutId = setTimeout(() => {
        this.handleTimeout({ decisionId });
      }, decision.template.timeout);
      
      decision.timeoutId = timeoutId;
      
      // Execute decision mechanism
      const result = await mechanism.execute(decision);
      
      // Clear timeout
      clearTimeout(timeoutId);
      
      // Update decision
      decision.status = 'completed';
      decision.result = result;
      decision.completedAt = Date.now();
      decision.duration = decision.completedAt - decision.createdAt;
      
      // Update statistics
      this.statistics.totalDecisions++;
      this.statistics.successfulDecisions++;
      this.statistics.averageDecisionTime = 
        (this.statistics.averageDecisionTime + decision.duration) / 2;
      
      // Add to history
      this.decisionHistory.push({
        id: decisionId,
        type,
        mechanism: decision.template.mechanism,
        duration: decision.duration,
        result: result.outcome,
        timestamp: decision.completedAt
      });
      
      // Emit completion event
      this.eventBus.emit('decision-completed', {
        decisionId,
        type,
        result,
        duration: decision.duration,
        timestamp: decision.completedAt
      });
      
      logger.info(`Decision ${decisionId} completed with outcome: ${result.outcome}`);
      
      return result;
      
    } catch (error) {
      decision.status = 'failed';
      decision.error = error.message;
      decision.completedAt = Date.now();
      
      this.statistics.totalDecisions++;
      this.statistics.failedDecisions++;
      
      this.eventBus.emit('decision-failed', {
        decisionId,
        type,
        error: error.message,
        timestamp: decision.completedAt
      });
      
      logger.error(`Decision ${decisionId} failed:`, error);
      throw error;
    }
  }

  async getDecisionStatus(decisionId) {
    const decision = this.activeDecisions.get(decisionId);
    if (!decision) {
      return null;
    }
    
    return {
      id: decision.id,
      type: decision.type,
      status: decision.status,
      mechanism: decision.template.mechanism,
      participantCount: decision.participants.size,
      responseCount: decision.responses.size,
      createdAt: decision.createdAt,
      duration: decision.completedAt ? 
        decision.completedAt - decision.createdAt : 
        Date.now() - decision.createdAt,
      result: decision.result
    };
  }

  async cancelDecision(decisionId, reason = 'cancelled') {
    const decision = this.activeDecisions.get(decisionId);
    if (!decision) {
      return false;
    }
    
    if (decision.status === 'completed' || decision.status === 'failed') {
      return false;
    }
    
    // Clear timeout
    if (decision.timeoutId) {
      clearTimeout(decision.timeoutId);
    }
    
    decision.status = 'cancelled';
    decision.cancelReason = reason;
    decision.completedAt = Date.now();
    
    this.eventBus.emit('decision-cancelled', {
      decisionId,
      reason,
      timestamp: decision.completedAt
    });
    
    logger.info(`Decision ${decisionId} cancelled: ${reason}`);
    return true;
  }

  // Event Handlers
  async handleDecisionRequest(event) {
    const { type, context, options, requestId } = event.data;
    
    try {
      const result = await this.makeDecision(type, context, options);
      
      this.eventBus.emit('decision-response', {
        requestId,
        result,
        timestamp: Date.now()
      });
    } catch (error) {
      this.eventBus.emit('decision-error', {
        requestId,
        error: error.message,
        timestamp: Date.now()
      });
    }
  }

  handleVote(event) {
    const { decisionId, participantId, vote } = event.data;
    const decision = this.activeDecisions.get(decisionId);
    
    if (!decision || decision.status !== 'active') {
      return;
    }
    
    if (decision.template.mechanism !== 'voting') {
      return;
    }
    
    this.mechanisms.voting.handleVote(decision, participantId, vote);
  }

  handleBid(event) {
    const { decisionId, participantId, bid } = event.data;
    const decision = this.activeDecisions.get(decisionId);
    
    if (!decision || decision.status !== 'active') {
      return;
    }
    
    if (decision.template.mechanism !== 'auction') {
      return;
    }
    
    this.mechanisms.auction.handleBid(decision, participantId, bid);
  }

  handleArbitration(event) {
    const { decisionId, arbiterId, ruling } = event.data;
    const decision = this.activeDecisions.get(decisionId);
    
    if (!decision || decision.status !== 'active') {
      return;
    }
    
    if (decision.template.mechanism !== 'arbiter') {
      return;
    }
    
    this.mechanisms.arbiter.handleRuling(decision, arbiterId, ruling);
  }

  handleTimeout(event) {
    const { decisionId } = event;
    const decision = this.activeDecisions.get(decisionId);
    
    if (!decision || decision.status !== 'active') {
      return;
    }
    
    decision.status = 'timeout';
    decision.completedAt = Date.now();
    decision.duration = decision.completedAt - decision.createdAt;
    
    this.statistics.totalDecisions++;
    this.statistics.timeoutDecisions++;
    
    this.eventBus.emit('decision-timeout', {
      decisionId,
      type: decision.type,
      timestamp: decision.completedAt
    });
    
    logger.warn(`Decision ${decisionId} timed out`);
  }

  // Utility Methods
  cleanupCompletedDecisions() {
    const cutoffTime = Date.now() - (24 * 60 * 60 * 1000); // 24 hours ago
    
    for (const [decisionId, decision] of this.activeDecisions) {
      if (decision.status !== 'active' && decision.completedAt < cutoffTime) {
        this.activeDecisions.delete(decisionId);
      }
    }
  }

  updateStatistics() {
    // Update real-time statistics
    this.eventBus.emit('decision-statistics-updated', {
      statistics: this.statistics,
      activeDecisions: this.activeDecisions.size,
      timestamp: Date.now()
    });
  }

  performHealthCheck() {
    const healthStatus = {
      timestamp: Date.now(),
      status: 'healthy',
      activeDecisions: this.activeDecisions.size,
      statistics: this.statistics,
      mechanisms: {}
    };
    
    // Check mechanism health
    for (const [name, mechanism] of Object.entries(this.mechanisms)) {
      healthStatus.mechanisms[name] = mechanism.getHealthStatus();
    }
    
    // Check for issues
    const issues = [];
    
    if (this.activeDecisions.size > 100) {
      issues.push('too-many-active-decisions');
    }
    
    if (this.statistics.failedDecisions / this.statistics.totalDecisions > 0.1) {
      issues.push('high-failure-rate');
    }
    
    if (issues.length > 0) {
      healthStatus.status = 'degraded';
      healthStatus.issues = issues;
    }
    
    this.eventBus.emit('decision-health-check', healthStatus);
    
    return healthStatus;
  }

  getStatistics() {
    return {
      ...this.statistics,
      activeDecisions: this.activeDecisions.size,
      uptime: Date.now() - this.startTime
    };
  }

  getDecisionHistory(limit = 100) {
    return this.decisionHistory.slice(-limit);
  }

  async shutdown() {
    logger.info('Shutting down Decision Engine');
    
    // Cancel all active decisions
    for (const decisionId of this.activeDecisions.keys()) {
      await this.cancelDecision(decisionId, 'system-shutdown');
    }
    
    // Shutdown all mechanisms
    for (const mechanism of Object.values(this.mechanisms)) {
      await mechanism.shutdown();
    }
    
    // Remove event listeners
    this.eventBus.removeAllListeners('decision-request');
    this.eventBus.removeAllListeners('decision-vote');
    this.eventBus.removeAllListeners('decision-bid');
    this.eventBus.removeAllListeners('decision-arbitration');
    this.eventBus.removeAllListeners('decision-timeout');
    
    logger.info('Decision Engine shutdown complete');
  }
}

// Voting Mechanism
class VotingMechanism extends EventEmitter {
  constructor(eventBus) {
    super();
    this.eventBus = eventBus;
    this.activeVotes = new Map();
  }

  async initialize() {
    logger.info('Initializing Voting Mechanism');
  }

  async execute(decision) {
    const voteId = decision.id;
    const vote = {
      id: voteId,
      decision,
      votes: new Map(),
      startTime: Date.now(),
      status: 'active'
    };
    
    this.activeVotes.set(voteId, vote);
    
    // Invite participants
    await this.inviteParticipants(decision);
    
    // Wait for votes or timeout
    return new Promise((resolve, reject) => {
      const checkCompletion = () => {
        if (this.isVoteComplete(vote)) {
          const result = this.calculateVoteResult(vote);
          this.activeVotes.delete(voteId);
          resolve(result);
        }
      };
      
      // Check periodically
      const interval = setInterval(checkCompletion, 1000);
      
      // Timeout handler
      setTimeout(() => {
        clearInterval(interval);
        if (this.activeVotes.has(voteId)) {
          const result = this.calculateVoteResult(vote, true);
          this.activeVotes.delete(voteId);
          resolve(result);
        }
      }, decision.template.timeout);
    });
  }

  async inviteParticipants(decision) {
    const participants = this.resolveParticipants(decision.template.participants);
    
    for (const participantId of participants) {
      decision.participants.add(participantId);
      
      this.eventBus.emit('vote-invitation', {
        decisionId: decision.id,
        participantId,
        context: decision.context,
        criteria: decision.template.criteria,
        timeout: decision.template.timeout,
        timestamp: Date.now()
      });
    }
  }

  handleVote(decision, participantId, voteData) {
    const vote = this.activeVotes.get(decision.id);
    if (!vote || vote.status !== 'active') {
      return;
    }
    
    if (!decision.participants.has(participantId)) {
      logger.warn(`Unauthorized vote from ${participantId} for decision ${decision.id}`);
      return;
    }
    
    vote.votes.set(participantId, {
      ...voteData,
      timestamp: Date.now(),
      participantId
    });
    
    logger.info(`Received vote from ${participantId} for decision ${decision.id}`);
  }

  isVoteComplete(vote) {
    const requiredVotes = Math.ceil(vote.decision.participants.size * vote.decision.template.quorum);
    return vote.votes.size >= requiredVotes;
  }

  calculateVoteResult(vote, isTimeout = false) {
    const votes = Array.from(vote.votes.values());
    const weightingStrategy = vote.decision.template.weightingStrategy || 'equal';
    
    // Apply weighting
    const weightedVotes = this.applyWeighting(votes, weightingStrategy);
    
    // Calculate outcome based on vote type
    let outcome;
    if (vote.decision.context.options) {
      // Multiple choice voting
      outcome = this.calculateMultipleChoiceOutcome(weightedVotes);
    } else {
      // Binary or approval voting
      outcome = this.calculateBinaryOutcome(weightedVotes);
    }
    
    return {
      outcome,
      mechanism: 'voting',
      participantCount: vote.decision.participants.size,
      voteCount: vote.votes.size,
      isTimeout,
      confidence: this.calculateConfidence(weightedVotes),
      details: {
        votes: weightedVotes,
        weightingStrategy,
        quorum: vote.decision.template.quorum
      },
      timestamp: Date.now()
    };
  }

  applyWeighting(votes, strategy) {
    switch (strategy) {
      case 'equal':
        return votes.map(vote => ({ ...vote, weight: 1 }));
        
      case 'expertise-based':
        return votes.map(vote => ({
          ...vote,
          weight: this.calculateExpertiseWeight(vote.participantId)
        }));
        
      case 'reputation-based':
        return votes.map(vote => ({
          ...vote,
          weight: this.calculateReputationWeight(vote.participantId)
        }));
        
      default:
        return votes.map(vote => ({ ...vote, weight: 1 }));
    }
  }

  calculateExpertiseWeight(participantId) {
    // Mock implementation - would calculate based on participant expertise
    const expertiseMap = {
      'candidate-swarm': 1.2,
      'validation-swarm': 1.1,
      'ranking-swarm': 1.3,
      'selection-swarm': 1.0,
      'enrichment-swarm': 0.9,
      'output-swarm': 0.8
    };
    
    return expertiseMap[participantId] || 1.0;
  }

  calculateReputationWeight(participantId) {
    // Mock implementation - would calculate based on historical performance
    return Math.random() * 0.5 + 0.75; // 0.75 to 1.25
  }

  calculateMultipleChoiceOutcome(weightedVotes) {
    const optionScores = new Map();
    
    for (const vote of weightedVotes) {
      const option = vote.choice || vote.option;
      const score = (vote.score || 1) * vote.weight;
      
      optionScores.set(option, (optionScores.get(option) || 0) + score);
    }
    
    // Find highest scoring option
    let bestOption = null;
    let bestScore = -Infinity;
    
    for (const [option, score] of optionScores) {
      if (score > bestScore) {
        bestScore = score;
        bestOption = option;
      }
    }
    
    return {
      choice: bestOption,
      score: bestScore,
      allScores: Object.fromEntries(optionScores)
    };
  }

  calculateBinaryOutcome(weightedVotes) {
    let approvalScore = 0;
    let totalWeight = 0;
    
    for (const vote of weightedVotes) {
      const approval = vote.approval !== undefined ? vote.approval : vote.score > 0.5;
      if (approval) {
        approvalScore += vote.weight;
      }
      totalWeight += vote.weight;
    }
    
    const approvalRate = totalWeight > 0 ? approvalScore / totalWeight : 0;
    
    return {
      approved: approvalRate > 0.5,
      approvalRate,
      approvalScore,
      totalWeight
    };
  }

  calculateConfidence(weightedVotes) {
    if (weightedVotes.length === 0) return 0;
    
    // Calculate confidence based on vote distribution and weights
    const totalWeight = weightedVotes.reduce((sum, vote) => sum + vote.weight, 0);
    const avgWeight = totalWeight / weightedVotes.length;
    
    // Higher confidence with more votes and higher weights
    const participationFactor = Math.min(weightedVotes.length / 10, 1);
    const weightFactor = Math.min(avgWeight, 1);
    
    return participationFactor * weightFactor;
  }

  resolveParticipants(participantSpec) {
    if (Array.isArray(participantSpec)) {
      return participantSpec;
    }
    
    if (participantSpec === 'all-swarms') {
      return ['candidate-swarm', 'validation-swarm', 'ranking-swarm', 'selection-swarm', 'enrichment-swarm', 'output-swarm'];
    }
    
    if (participantSpec === 'all-holons') {
      return ['coordinator', 'orchestrator', 'policy', 'telemetry', 'blackboard'];
    }
    
    return [participantSpec];
  }

  getHealthStatus() {
    return {
      status: 'healthy',
      activeVotes: this.activeVotes.size
    };
  }

  async shutdown() {
    this.activeVotes.clear();
  }
}

// Auction Mechanism
class AuctionMechanism extends EventEmitter {
  constructor(eventBus) {
    super();
    this.eventBus = eventBus;
    this.activeAuctions = new Map();
  }

  async initialize() {
    logger.info('Initializing Auction Mechanism');
  }

  async execute(decision) {
    const auctionId = decision.id;
    const auction = {
      id: auctionId,
      decision,
      bids: new Map(),
      currentHighestBid: decision.template.reservePrice || 0,
      currentWinner: null,
      startTime: Date.now(),
      status: 'active'
    };
    
    this.activeAuctions.set(auctionId, auction);
    
    // Invite bidders
    await this.inviteBidders(decision);
    
    // Wait for bids or timeout
    return new Promise((resolve) => {
      setTimeout(() => {
        const result = this.finalizeAuction(auction);
        this.activeAuctions.delete(auctionId);
        resolve(result);
      }, decision.template.timeout);
    });
  }

  async inviteBidders(decision) {
    const bidders = this.resolveParticipants(decision.template.participants);
    
    for (const bidderId of bidders) {
      decision.participants.add(bidderId);
      
      this.eventBus.emit('auction-invitation', {
        decisionId: decision.id,
        bidderId,
        context: decision.context,
        reservePrice: decision.template.reservePrice,
        bidIncrement: decision.template.bidIncrement,
        timeout: decision.template.timeout,
        timestamp: Date.now()
      });
    }
  }

  handleBid(decision, bidderId, bidData) {
    const auction = this.activeAuctions.get(decision.id);
    if (!auction || auction.status !== 'active') {
      return;
    }
    
    if (!decision.participants.has(bidderId)) {
      logger.warn(`Unauthorized bid from ${bidderId} for auction ${decision.id}`);
      return;
    }
    
    const bidAmount = bidData.amount;
    const minBid = auction.currentHighestBid + (decision.template.bidIncrement || 1);
    
    if (bidAmount < minBid) {
      logger.warn(`Bid ${bidAmount} from ${bidderId} is below minimum ${minBid}`);
      return;
    }
    
    // Update auction state
    auction.currentHighestBid = bidAmount;
    auction.currentWinner = bidderId;
    
    auction.bids.set(bidderId, {
      ...bidData,
      timestamp: Date.now(),
      bidderId
    });
    
    // Notify other bidders
    this.eventBus.emit('auction-bid-update', {
      decisionId: decision.id,
      currentHighestBid: auction.currentHighestBid,
      currentWinner: auction.currentWinner,
      timestamp: Date.now()
    });
    
    logger.info(`New highest bid ${bidAmount} from ${bidderId} for auction ${decision.id}`);
  }

  finalizeAuction(auction) {
    auction.status = 'completed';
    
    const result = {
      outcome: {
        winner: auction.currentWinner,
        winningBid: auction.currentHighestBid,
        totalBids: auction.bids.size
      },
      mechanism: 'auction',
      participantCount: auction.decision.participants.size,
      bidCount: auction.bids.size,
      details: {
        allBids: Array.from(auction.bids.values()),
        reservePrice: auction.decision.template.reservePrice,
        bidIncrement: auction.decision.template.bidIncrement
      },
      timestamp: Date.now()
    };
    
    // Notify winner
    if (auction.currentWinner) {
      this.eventBus.emit('auction-won', {
        decisionId: auction.id,
        winner: auction.currentWinner,
        winningBid: auction.currentHighestBid,
        timestamp: Date.now()
      });
    }
    
    return result;
  }

  resolveParticipants(participantSpec) {
    // Same as voting mechanism
    if (Array.isArray(participantSpec)) {
      return participantSpec;
    }
    
    if (participantSpec === 'all-swarms') {
      return ['candidate-swarm', 'validation-swarm', 'ranking-swarm', 'selection-swarm', 'enrichment-swarm', 'output-swarm'];
    }
    
    return [participantSpec];
  }

  getHealthStatus() {
    return {
      status: 'healthy',
      activeAuctions: this.activeAuctions.size
    };
  }

  async shutdown() {
    this.activeAuctions.clear();
  }
}

// Arbiter Mechanism
class ArbiterMechanism extends EventEmitter {
  constructor(eventBus) {
    super();
    this.eventBus = eventBus;
    this.activeArbitrations = new Map();
    this.arbiters = new Map();
  }

  async initialize() {
    logger.info('Initializing Arbiter Mechanism');
    
    // Register default arbiters
    this.registerArbiter('system-arbiter', {
      expertise: ['system-configuration', 'resource-allocation'],
      reputation: 1.0,
      availability: true
    });
    
    this.registerArbiter('policy-arbiter', {
      expertise: ['policy-conflicts', 'compliance'],
      reputation: 0.9,
      availability: true
    });
  }

  registerArbiter(arbiterId, profile) {
    this.arbiters.set(arbiterId, {
      id: arbiterId,
      ...profile,
      casesHandled: 0,
      successRate: 1.0,
      registeredAt: Date.now()
    });
  }

  async execute(decision) {
    const arbitrationId = decision.id;
    
    // Select arbiter
    const arbiter = this.selectArbiter(decision);
    if (!arbiter) {
      throw new Error('No suitable arbiter available');
    }
    
    const arbitration = {
      id: arbitrationId,
      decision,
      arbiter,
      evidence: new Map(),
      ruling: null,
      startTime: Date.now(),
      status: 'active'
    };
    
    this.activeArbitrations.set(arbitrationId, arbitration);
    
    // Request evidence from participants
    await this.requestEvidence(decision, arbitration);
    
    // Wait for ruling or timeout
    return new Promise((resolve) => {
      setTimeout(() => {
        const result = this.finalizeArbitration(arbitration);
        this.activeArbitrations.delete(arbitrationId);
        resolve(result);
      }, decision.template.timeout);
    });
  }

  selectArbiter(decision) {
    const availableArbiters = Array.from(this.arbiters.values())
      .filter(arbiter => arbiter.availability);
    
    if (availableArbiters.length === 0) {
      return null;
    }
    
    // Select based on expertise and reputation
    const scoredArbiters = availableArbiters.map(arbiter => {
      let score = arbiter.reputation * arbiter.successRate;
      
      // Bonus for relevant expertise
      const hasRelevantExpertise = arbiter.expertise.some(exp => 
        decision.type.includes(exp) || decision.context.domain === exp
      );
      
      if (hasRelevantExpertise) {
        score *= 1.5;
      }
      
      return { arbiter, score };
    });
    
    // Select highest scoring arbiter
    scoredArbiters.sort((a, b) => b.score - a.score);
    return scoredArbiters[0].arbiter;
  }

  async requestEvidence(decision, arbitration) {
    for (const participantId of decision.participants) {
      this.eventBus.emit('arbitration-evidence-request', {
        decisionId: decision.id,
        arbitrationId: arbitration.id,
        participantId,
        arbiter: arbitration.arbiter.id,
        context: decision.context,
        timeout: decision.template.timeout * 0.7, // 70% of total time for evidence
        timestamp: Date.now()
      });
    }
  }

  handleRuling(decision, arbiterId, rulingData) {
    const arbitration = this.activeArbitrations.get(decision.id);
    if (!arbitration || arbitration.status !== 'active') {
      return;
    }
    
    if (arbitration.arbiter.id !== arbiterId) {
      logger.warn(`Unauthorized ruling from ${arbiterId} for arbitration ${decision.id}`);
      return;
    }
    
    arbitration.ruling = {
      ...rulingData,
      timestamp: Date.now(),
      arbiterId
    };
    
    arbitration.status = 'ruled';
    
    logger.info(`Arbitration ruling received from ${arbiterId} for decision ${decision.id}`);
  }

  finalizeArbitration(arbitration) {
    const arbiter = arbitration.arbiter;
    arbiter.casesHandled++;
    
    let outcome;
    if (arbitration.ruling) {
      outcome = arbitration.ruling.decision;
      // Update arbiter success rate based on ruling acceptance (mock)
      arbiter.successRate = (arbiter.successRate * 0.9) + (0.1 * Math.random());
    } else {
      outcome = 'no-ruling';
      arbiter.successRate *= 0.95; // Slight penalty for no ruling
    }
    
    const result = {
      outcome,
      mechanism: 'arbiter',
      arbiter: arbiter.id,
      ruling: arbitration.ruling,
      evidenceCount: arbitration.evidence.size,
      details: {
        arbiterProfile: arbiter,
        evidence: Array.from(arbitration.evidence.values()),
        selectionCriteria: arbitration.decision.template.arbiterSelection
      },
      timestamp: Date.now()
    };
    
    return result;
  }

  getHealthStatus() {
    return {
      status: 'healthy',
      activeArbitrations: this.activeArbitrations.size,
      availableArbiters: Array.from(this.arbiters.values()).filter(a => a.availability).length
    };
  }

  async shutdown() {
    this.activeArbitrations.clear();
    this.arbiters.clear();
  }
}

// Consensus Mechanism
class ConsensusMechanism extends EventEmitter {
  constructor(eventBus) {
    super();
    this.eventBus = eventBus;
    this.activeConsensus = new Map();
  }

  async initialize() {
    logger.info('Initializing Consensus Mechanism');
  }

  async execute(decision) {
    const consensusId = decision.id;
    const consensus = {
      id: consensusId,
      decision,
      proposals: new Map(),
      agreements: new Map(),
      currentProposal: null,
      round: 1,
      startTime: Date.now(),
      status: 'active'
    };
    
    this.activeConsensus.set(consensusId, consensus);
    
    // Start consensus process
    await this.startConsensusRound(consensus);
    
    // Wait for consensus or timeout
    return new Promise((resolve) => {
      const checkConsensus = () => {
        if (this.hasReachedConsensus(consensus)) {
          const result = this.finalizeConsensus(consensus);
          this.activeConsensus.delete(consensusId);
          resolve(result);
        } else if (Date.now() - consensus.startTime > decision.template.timeout) {
          const result = this.finalizeConsensus(consensus, true);
          this.activeConsensus.delete(consensusId);
          resolve(result);
        }
      };
      
      const interval = setInterval(checkConsensus, 2000);
      
      setTimeout(() => {
        clearInterval(interval);
        checkConsensus();
      }, decision.template.timeout);
    });
  }

  async startConsensusRound(consensus) {
    const participants = this.resolveParticipants(consensus.decision.template.participants);
    
    for (const participantId of participants) {
      consensus.decision.participants.add(participantId);
      
      this.eventBus.emit('consensus-round-start', {
        decisionId: consensus.id,
        participantId,
        round: consensus.round,
        context: consensus.decision.context,
        currentProposal: consensus.currentProposal,
        timestamp: Date.now()
      });
    }
  }

  hasReachedConsensus(consensus) {
    const threshold = consensus.decision.template.consensusThreshold || 0.8;
    const requiredAgreements = Math.ceil(consensus.decision.participants.size * threshold);
    
    return consensus.agreements.size >= requiredAgreements;
  }

  finalizeConsensus(consensus, isTimeout = false) {
    const result = {
      outcome: consensus.currentProposal || 'no-consensus',
      mechanism: 'consensus',
      participantCount: consensus.decision.participants.size,
      agreementCount: consensus.agreements.size,
      rounds: consensus.round,
      isTimeout,
      consensusReached: !isTimeout && this.hasReachedConsensus(consensus),
      details: {
        proposals: Array.from(consensus.proposals.values()),
        agreements: Array.from(consensus.agreements.values()),
        threshold: consensus.decision.template.consensusThreshold
      },
      timestamp: Date.now()
    };
    
    return result;
  }

  resolveParticipants(participantSpec) {
    // Same as other mechanisms
    if (Array.isArray(participantSpec)) {
      return participantSpec;
    }
    
    if (participantSpec === 'all-holons') {
      return ['coordinator', 'orchestrator', 'policy', 'telemetry', 'blackboard'];
    }
    
    return [participantSpec];
  }

  getHealthStatus() {
    return {
      status: 'healthy',
      activeConsensus: this.activeConsensus.size
    };
  }

  async shutdown() {
    this.activeConsensus.clear();
  }
}

// Ranking Mechanism
class RankingMechanism extends EventEmitter {
  constructor(eventBus) {
    super();
    this.eventBus = eventBus;
    this.activeRankings = new Map();
  }

  async initialize() {
    logger.info('Initializing Ranking Mechanism');
  }

  async execute(decision) {
    const rankingId = decision.id;
    const ranking = {
      id: rankingId,
      decision,
      rankings: new Map(),
      startTime: Date.now(),
      status: 'active'
    };
    
    this.activeRankings.set(rankingId, ranking);
    
    // Request rankings from participants
    await this.requestRankings(decision);
    
    // Wait for rankings or timeout
    return new Promise((resolve) => {
      setTimeout(() => {
        const result = this.calculateFinalRanking(ranking);
        this.activeRankings.delete(rankingId);
        resolve(result);
      }, decision.template.timeout);
    });
  }

  async requestRankings(decision) {
    const participants = this.resolveParticipants(decision.template.participants);
    
    for (const participantId of participants) {
      decision.participants.add(participantId);
      
      this.eventBus.emit('ranking-request', {
        decisionId: decision.id,
        participantId,
        context: decision.context,
        criteria: decision.template.criteria,
        method: decision.template.rankingMethod,
        timestamp: Date.now()
      });
    }
  }

  calculateFinalRanking(ranking) {
    const method = ranking.decision.template.rankingMethod || 'weighted-score';
    const rankings = Array.from(ranking.rankings.values());
    
    let finalRanking;
    switch (method) {
      case 'weighted-score':
        finalRanking = this.calculateWeightedScore(rankings);
        break;
      case 'borda-count':
        finalRanking = this.calculateBordaCount(rankings);
        break;
      case 'condorcet':
        finalRanking = this.calculateCondorcet(rankings);
        break;
      default:
        finalRanking = this.calculateSimpleAverage(rankings);
    }
    
    return {
      outcome: finalRanking,
      mechanism: 'ranking',
      participantCount: ranking.decision.participants.size,
      rankingCount: ranking.rankings.size,
      method,
      details: {
        individualRankings: rankings,
        criteria: ranking.decision.template.criteria
      },
      timestamp: Date.now()
    };
  }

  calculateWeightedScore(rankings) {
    const itemScores = new Map();
    
    for (const ranking of rankings) {
      const weight = ranking.weight || 1;
      
      for (const [item, score] of Object.entries(ranking.scores || {})) {
        itemScores.set(item, (itemScores.get(item) || 0) + (score * weight));
      }
    }
    
    // Sort by score
    const sortedItems = Array.from(itemScores.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([item, score]) => ({ item, score }));
    
    return {
      ranking: sortedItems,
      winner: sortedItems[0]?.item,
      scores: Object.fromEntries(itemScores)
    };
  }

  calculateBordaCount(rankings) {
    const itemPoints = new Map();
    
    for (const ranking of rankings) {
      const orderedItems = ranking.order || [];
      const maxPoints = orderedItems.length;
      
      orderedItems.forEach((item, index) => {
        const points = maxPoints - index;
        itemPoints.set(item, (itemPoints.get(item) || 0) + points);
      });
    }
    
    // Sort by points
    const sortedItems = Array.from(itemPoints.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([item, points]) => ({ item, points }));
    
    return {
      ranking: sortedItems,
      winner: sortedItems[0]?.item,
      points: Object.fromEntries(itemPoints)
    };
  }

  calculateCondorcet(rankings) {
    // Simplified Condorcet method
    const items = new Set();
    rankings.forEach(ranking => {
      (ranking.order || []).forEach(item => items.add(item));
    });
    
    const itemArray = Array.from(items);
    const pairwiseWins = new Map();
    
    // Initialize pairwise comparison matrix
    for (const item of itemArray) {
      pairwiseWins.set(item, new Map());
      for (const opponent of itemArray) {
        if (item !== opponent) {
          pairwiseWins.get(item).set(opponent, 0);
        }
      }
    }
    
    // Count pairwise preferences
    for (const ranking of rankings) {
      const order = ranking.order || [];
      for (let i = 0; i < order.length; i++) {
        for (let j = i + 1; j < order.length; j++) {
          const winner = order[i];
          const loser = order[j];
          pairwiseWins.get(winner).set(loser, pairwiseWins.get(winner).get(loser) + 1);
        }
      }
    }
    
    // Find Condorcet winner (beats all others in pairwise comparisons)
    let condorcetWinner = null;
    for (const item of itemArray) {
      const wins = pairwiseWins.get(item);
      const beatsAll = Array.from(wins.values()).every(count => count > rankings.length / 2);
      if (beatsAll) {
        condorcetWinner = item;
        break;
      }
    }
    
    return {
      ranking: itemArray.map(item => ({ item, wins: Array.from(pairwiseWins.get(item).values()).reduce((a, b) => a + b, 0) })),
      winner: condorcetWinner,
      pairwiseWins: Object.fromEntries(
        Array.from(pairwiseWins.entries()).map(([item, wins]) => [
          item, Object.fromEntries(wins)
        ])
      )
    };
  }

  calculateSimpleAverage(rankings) {
    const itemScores = new Map();
    const itemCounts = new Map();
    
    for (const ranking of rankings) {
      for (const [item, score] of Object.entries(ranking.scores || {})) {
        itemScores.set(item, (itemScores.get(item) || 0) + score);
        itemCounts.set(item, (itemCounts.get(item) || 0) + 1);
      }
    }
    
    // Calculate averages
    const averageScores = new Map();
    for (const [item, totalScore] of itemScores) {
      const count = itemCounts.get(item);
      averageScores.set(item, totalScore / count);
    }
    
    // Sort by average score
    const sortedItems = Array.from(averageScores.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([item, avgScore]) => ({ item, avgScore }));
    
    return {
      ranking: sortedItems,
      winner: sortedItems[0]?.item,
      averageScores: Object.fromEntries(averageScores)
    };
  }

  resolveParticipants(participantSpec) {
    if (Array.isArray(participantSpec)) {
      return participantSpec;
    }
    
    if (participantSpec === 'relevant-swarms') {
      return ['ranking-swarm', 'validation-swarm', 'selection-swarm'];
    }
    
    return [participantSpec];
  }

  getHealthStatus() {
    return {
      status: 'healthy',
      activeRankings: this.activeRankings.size
    };
  }

  async shutdown() {
    this.activeRankings.clear();
  }
}