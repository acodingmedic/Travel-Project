import winston from 'winston';
import { BaseHolon } from '../holons/base-holon.js';
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

export class SelectionSwarm extends BaseHolon {
  constructor(orchestration) {
    super('SelectionSwarm', orchestration);
    this.config = getConfig();
    
    // Selection strategies and rules
    this.selectionStrategies = {
      top_ranked: {
        name: 'Top Ranked',
        description: 'Select highest ranked candidates',
        enabled: true
      },
      budget_optimized: {
        name: 'Budget Optimized',
        description: 'Optimize for budget constraints',
        enabled: true
      },
      balanced_portfolio: {
        name: 'Balanced Portfolio',
        description: 'Balance quality, price, and diversity',
        enabled: true
      },
      user_preference_weighted: {
        name: 'User Preference Weighted',
        description: 'Weight selection based on user preferences',
        enabled: true
      },
      risk_minimized: {
        name: 'Risk Minimized',
        description: 'Minimize booking and availability risks',
        enabled: true
      }
    };
    
    // Business rules and constraints
    this.businessRules = {
      budget: {
        enforceHardLimit: true,
        allowOverage: 0.05, // 5% overage allowed
        prioritizeUnderBudget: true
      },
      availability: {
        requireConfirmedAvailability: true,
        maxUnavailableItems: 1,
        fallbackStrategy: 'substitute'
      },
      quality: {
        minRatingThreshold: 3.0,
        minReviewCount: 5,
        qualityOverPrice: false
      },
      diversity: {
        maxSameProvider: 2,
        encourageProviderDiversity: true,
        diversityWeight: 0.15
      },
      compliance: {
        requireGDPRCompliance: true,
        requireValidLicenses: true,
        blockNonCompliant: true
      },
      risk: {
        maxHighRiskItems: 1,
        riskFactors: ['new_provider', 'low_reviews', 'price_volatility'],
        riskThreshold: 0.7
      }
    };
    
    // Selection cache and statistics
    this.selectionCache = new Map();
    this.cacheTimeout = 180000; // 3 minutes
    
    this.selectionStats = {
      totalSelections: 0,
      averageSelectionTime: 0,
      strategyUsage: {
        top_ranked: 0,
        budget_optimized: 0,
        balanced_portfolio: 0,
        user_preference_weighted: 0,
        risk_minimized: 0
      },
      ruleViolations: {
        budget: 0,
        availability: 0,
        quality: 0,
        diversity: 0,
        compliance: 0,
        risk: 0
      },
      categoryStats: {
        hotels: { selected: 0, avgScore: 0, avgPrice: 0 },
        flights: { selected: 0, avgScore: 0, avgPrice: 0 },
        activities: { selected: 0, avgScore: 0, avgPrice: 0 },
        restaurants: { selected: 0, avgScore: 0, avgPrice: 0 },
        cars: { selected: 0, avgScore: 0, avgPrice: 0 }
      }
    };
    
    // Risk assessment models
    this.riskModels = {
      provider: new Map(),
      pricing: new Map(),
      availability: new Map()
    };
  }

  async initialize() {
    await super.initialize();
    
    // Subscribe to selection events
    this.subscribe('select-candidates', this.handleSelectCandidates.bind(this));
    this.subscribe('apply-business-rules', this.handleApplyBusinessRules.bind(this));
    this.subscribe('optimize-selection', this.handleOptimizeSelection.bind(this));
    this.subscribe('validate-selection', this.handleValidateSelection.bind(this));
    this.subscribe('update-business-rules', this.handleUpdateBusinessRules.bind(this));
    
    // Initialize risk models
    await this.initializeRiskModels();
    
    // Start selection maintenance
    this.startSelectionMaintenance();
    
    logger.info('Selection swarm initialized');
  }

  async initializeRiskModels() {
    // Initialize provider risk scores (mock data)
    const providerRisks = [
      { provider: 'booking.com', risk: 0.1 },
      { provider: 'expedia', risk: 0.15 },
      { provider: 'hotels.com', risk: 0.2 },
      { provider: 'airbnb', risk: 0.25 },
      { provider: 'local-provider-1', risk: 0.6 },
      { provider: 'new-provider', risk: 0.8 }
    ];
    
    providerRisks.forEach(({ provider, risk }) => {
      this.riskModels.provider.set(provider, risk);
    });
    
    logger.info(`Initialized risk models for ${providerRisks.length} providers`);
  }

  startSelectionMaintenance() {
    // Clear expired cache entries every 2 minutes
    setInterval(() => {
      this.clearExpiredCache();
    }, 120000);
    
    // Update selection statistics every 5 minutes
    setInterval(() => {
      this.updateSelectionStatistics();
    }, 300000);
  }

  async handleSelectCandidates(event) {
    const { 
      sagaId, 
      rankedCandidates, 
      selectionCriteria = {},
      userPreferences = {},
      budget = {},
      context = {} 
    } = event.data;
    
    try {
      logger.info(`Starting selection for saga ${sagaId}`);
      
      const selectionStartTime = Date.now();
      const strategy = selectionCriteria.strategy || 'balanced_portfolio';
      
      const selectionResults = {
        sagaId,
        strategy,
        startTime: selectionStartTime,
        selectionCriteria,
        userPreferences,
        budget,
        results: {
          hotels: [],
          flights: [],
          activities: [],
          restaurants: [],
          cars: []
        },
        summary: {
          totalCandidates: 0,
          selectedCandidates: 0,
          totalBudget: budget.total || 0,
          usedBudget: 0,
          remainingBudget: 0,
          ruleViolations: [],
          qualityScore: 0,
          riskScore: 0
        }
      };
      
      // Check cache first
      const cacheKey = this.generateSelectionCacheKey(rankedCandidates, selectionCriteria, userPreferences, budget);
      const cachedResult = this.selectionCache.get(cacheKey);
      
      if (cachedResult && Date.now() - cachedResult.timestamp < this.cacheTimeout) {
        logger.info(`Using cached selection for saga ${sagaId}`);
        
        const cachedSelection = { ...cachedResult.data, sagaId, startTime: selectionStartTime };
        cachedSelection.endTime = Date.now();
        cachedSelection.duration = cachedSelection.endTime - selectionStartTime;
        
        await this.publish('candidates-selected', cachedSelection);
        return;
      }
      
      // Perform selection for each category
      const selectionPromises = [];
      
      Object.keys(rankedCandidates).forEach(category => {
        if (rankedCandidates[category] && rankedCandidates[category].length > 0) {
          selectionPromises.push(
            this.selectCategoryBatch(
              category, 
              rankedCandidates[category], 
              strategy, 
              selectionCriteria, 
              userPreferences, 
              budget,
              context
            )
          );
        }
      });
      
      // Wait for all selections to complete
      const categoryResults = await Promise.allSettled(selectionPromises);
      
      // Process results
      let totalUsedBudget = 0;
      let totalQualityScore = 0;
      let totalRiskScore = 0;
      let selectedCount = 0;
      
      categoryResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          const { category, selectedCandidates, stats } = result.value;
          selectionResults.results[category] = selectedCandidates;
          
          selectionResults.summary.totalCandidates += stats.totalCandidates;
          selectionResults.summary.selectedCandidates += stats.selectedCount;
          totalUsedBudget += stats.usedBudget;
          totalQualityScore += stats.totalQualityScore;
          totalRiskScore += stats.totalRiskScore;
          selectedCount += stats.selectedCount;
          
          // Collect rule violations
          if (stats.ruleViolations && stats.ruleViolations.length > 0) {
            selectionResults.summary.ruleViolations.push(...stats.ruleViolations);
          }
          
          // Update category stats
          this.updateCategoryStats(category, stats);
          
        } else {
          logger.error('Category selection failed:', result.reason);
          selectionResults.summary.ruleViolations.push(`Category selection failed: ${result.reason.message}`);
        }
      });
      
      // Calculate summary metrics
      selectionResults.summary.usedBudget = totalUsedBudget;
      selectionResults.summary.remainingBudget = Math.max(0, selectionResults.summary.totalBudget - totalUsedBudget);
      
      if (selectedCount > 0) {
        selectionResults.summary.qualityScore = totalQualityScore / selectedCount;
        selectionResults.summary.riskScore = totalRiskScore / selectedCount;
      }
      
      // Apply cross-category optimization
      await this.applyCrossCategoryOptimization(selectionResults, budget, selectionCriteria);
      
      // Final validation
      const validationResult = await this.validateFinalSelection(selectionResults, budget, selectionCriteria);
      selectionResults.validation = validationResult;
      
      selectionResults.endTime = Date.now();
      selectionResults.duration = selectionResults.endTime - selectionStartTime;
      
      // Cache the result
      this.selectionCache.set(cacheKey, {
        data: {
          strategy: selectionResults.strategy,
          results: selectionResults.results,
          summary: selectionResults.summary,
          validation: selectionResults.validation
        },
        timestamp: Date.now()
      });
      
      // Update statistics
      this.selectionStats.totalSelections++;
      this.selectionStats.averageSelectionTime = 
        (this.selectionStats.averageSelectionTime * (this.selectionStats.totalSelections - 1) + selectionResults.duration) / 
        this.selectionStats.totalSelections;
      this.selectionStats.strategyUsage[strategy]++;
      
      // Publish selection results
      await this.publish('candidates-selected', selectionResults);
      
      logger.info(`Selection completed for saga ${sagaId}`, {
        strategy,
        selectedCandidates: selectionResults.summary.selectedCandidates,
        usedBudget: selectionResults.summary.usedBudget,
        qualityScore: selectionResults.summary.qualityScore.toFixed(3),
        riskScore: selectionResults.summary.riskScore.toFixed(3),
        duration: selectionResults.duration
      });
      
    } catch (error) {
      logger.error('Error in candidate selection:', error);
      
      await this.publish('selection-failed', {
        sagaId,
        error: error.message,
        timestamp: Date.now()
      });
    }
  }

  async selectCategoryBatch(category, candidates, strategy, selectionCriteria, userPreferences, budget, context) {
    const categoryBudget = budget[category] || (budget.total / 5); // Equal distribution if not specified
    const maxItems = selectionCriteria.maxItems?.[category] || 3;
    
    const stats = {
      totalCandidates: candidates.length,
      selectedCount: 0,
      usedBudget: 0,
      totalQualityScore: 0,
      totalRiskScore: 0,
      ruleViolations: []
    };
    
    // Apply strategy-specific selection
    let selectedCandidates = [];
    
    switch (strategy) {
      case 'top_ranked':
        selectedCandidates = await this.selectTopRanked(candidates, maxItems, categoryBudget);
        break;
        
      case 'budget_optimized':
        selectedCandidates = await this.selectBudgetOptimized(candidates, maxItems, categoryBudget, userPreferences);
        break;
        
      case 'balanced_portfolio':
        selectedCandidates = await this.selectBalancedPortfolio(candidates, maxItems, categoryBudget, userPreferences);
        break;
        
      case 'user_preference_weighted':
        selectedCandidates = await this.selectUserPreferenceWeighted(candidates, maxItems, categoryBudget, userPreferences);
        break;
        
      case 'risk_minimized':
        selectedCandidates = await this.selectRiskMinimized(candidates, maxItems, categoryBudget, userPreferences);
        break;
        
      default:
        selectedCandidates = await this.selectBalancedPortfolio(candidates, maxItems, categoryBudget, userPreferences);
    }
    
    // Apply business rules
    const ruleFilteredCandidates = await this.applyBusinessRules(selectedCandidates, category, categoryBudget, userPreferences);
    
    // Calculate statistics
    ruleFilteredCandidates.forEach((candidate, index) => {
      candidate.selectionRank = index + 1;
      candidate.selectionStrategy = strategy;
      candidate.selectedAt = Date.now();
      
      stats.selectedCount++;
      stats.usedBudget += candidate.price || 0;
      stats.totalQualityScore += candidate.rankingScore || 0;
      stats.totalRiskScore += this.calculateCandidateRisk(candidate, category);
    });
    
    // Check for rule violations
    const violations = this.checkRuleViolations(ruleFilteredCandidates, category, categoryBudget);
    stats.ruleViolations = violations;
    
    return {
      category,
      selectedCandidates: ruleFilteredCandidates,
      stats
    };
  }

  async selectTopRanked(candidates, maxItems, budget) {
    // Simple top-N selection based on ranking score
    const sortedCandidates = [...candidates].sort((a, b) => b.rankingScore - a.rankingScore);
    
    const selected = [];
    let usedBudget = 0;
    
    for (const candidate of sortedCandidates) {
      if (selected.length >= maxItems) break;
      
      const price = candidate.price || 0;
      if (usedBudget + price <= budget) {
        selected.push({ ...candidate });
        usedBudget += price;
      }
    }
    
    return selected;
  }

  async selectBudgetOptimized(candidates, maxItems, budget, userPreferences) {
    // Optimize for best value within budget
    const candidatesWithValue = candidates.map(candidate => ({
      ...candidate,
      valueScore: this.calculateValueScore(candidate, budget)
    }));
    
    // Sort by value score
    candidatesWithValue.sort((a, b) => b.valueScore - a.valueScore);
    
    const selected = [];
    let usedBudget = 0;
    
    for (const candidate of candidatesWithValue) {
      if (selected.length >= maxItems) break;
      
      const price = candidate.price || 0;
      if (usedBudget + price <= budget) {
        selected.push({ ...candidate });
        usedBudget += price;
      }
    }
    
    // If budget allows, try to add more items
    if (selected.length < maxItems && usedBudget < budget * 0.9) {
      const remaining = candidatesWithValue.filter(c => !selected.find(s => s.id === c.id));
      
      for (const candidate of remaining) {
        if (selected.length >= maxItems) break;
        
        const price = candidate.price || 0;
        if (usedBudget + price <= budget) {
          selected.push({ ...candidate });
          usedBudget += price;
        }
      }
    }
    
    return selected;
  }

  async selectBalancedPortfolio(candidates, maxItems, budget, userPreferences) {
    // Balance quality, price, and diversity
    const portfolioScore = candidates.map(candidate => ({
      ...candidate,
      portfolioScore: this.calculatePortfolioScore(candidate, candidates, userPreferences)
    }));
    
    // Sort by portfolio score
    portfolioScore.sort((a, b) => b.portfolioScore - a.portfolioScore);
    
    const selected = [];
    let usedBudget = 0;
    const providerCounts = new Map();
    
    for (const candidate of portfolioScore) {
      if (selected.length >= maxItems) break;
      
      const price = candidate.price || 0;
      const provider = candidate.provider || 'unknown';
      
      // Check budget constraint
      if (usedBudget + price > budget) continue;
      
      // Check diversity constraint
      const providerCount = providerCounts.get(provider) || 0;
      if (providerCount >= this.businessRules.diversity.maxSameProvider) continue;
      
      selected.push({ ...candidate });
      usedBudget += price;
      providerCounts.set(provider, providerCount + 1);
    }
    
    return selected;
  }

  async selectUserPreferenceWeighted(candidates, maxItems, budget, userPreferences) {
    // Weight selection heavily based on user preferences
    const preferenceWeighted = candidates.map(candidate => ({
      ...candidate,
      preferenceScore: this.calculatePreferenceScore(candidate, userPreferences)
    }));
    
    // Sort by preference score
    preferenceWeighted.sort((a, b) => b.preferenceScore - a.preferenceScore);
    
    const selected = [];
    let usedBudget = 0;
    
    for (const candidate of preferenceWeighted) {
      if (selected.length >= maxItems) break;
      
      const price = candidate.price || 0;
      if (usedBudget + price <= budget) {
        selected.push({ ...candidate });
        usedBudget += price;
      }
    }
    
    return selected;
  }

  async selectRiskMinimized(candidates, maxItems, budget, userPreferences) {
    // Minimize risk while maintaining quality
    const riskAssessed = candidates.map(candidate => ({
      ...candidate,
      riskScore: this.calculateCandidateRisk(candidate),
      riskAdjustedScore: candidate.rankingScore * (1 - this.calculateCandidateRisk(candidate))
    }));
    
    // Sort by risk-adjusted score
    riskAssessed.sort((a, b) => b.riskAdjustedScore - a.riskAdjustedScore);
    
    const selected = [];
    let usedBudget = 0;
    let highRiskCount = 0;
    
    for (const candidate of riskAssessed) {
      if (selected.length >= maxItems) break;
      
      const price = candidate.price || 0;
      if (usedBudget + price > budget) continue;
      
      // Check risk constraints
      if (candidate.riskScore > this.businessRules.risk.riskThreshold) {
        if (highRiskCount >= this.businessRules.risk.maxHighRiskItems) continue;
        highRiskCount++;
      }
      
      selected.push({ ...candidate });
      usedBudget += price;
    }
    
    return selected;
  }

  async applyBusinessRules(candidates, category, budget, userPreferences) {
    let filteredCandidates = [...candidates];
    
    // Apply budget rules
    if (this.businessRules.budget.enforceHardLimit) {
      const maxBudget = budget * (1 + this.businessRules.budget.allowOverage);
      let currentBudget = 0;
      
      filteredCandidates = filteredCandidates.filter(candidate => {
        const price = candidate.price || 0;
        if (currentBudget + price <= maxBudget) {
          currentBudget += price;
          return true;
        }
        return false;
      });
    }
    
    // Apply quality rules
    if (this.businessRules.quality.minRatingThreshold) {
      filteredCandidates = filteredCandidates.filter(candidate => 
        (candidate.rating || 0) >= this.businessRules.quality.minRatingThreshold
      );
    }
    
    if (this.businessRules.quality.minReviewCount) {
      filteredCandidates = filteredCandidates.filter(candidate => 
        (candidate.reviewCount || 0) >= this.businessRules.quality.minReviewCount
      );
    }
    
    // Apply availability rules
    if (this.businessRules.availability.requireConfirmedAvailability) {
      filteredCandidates = filteredCandidates.filter(candidate => 
        candidate.availabilityConfirmed !== false
      );
    }
    
    // Apply compliance rules
    if (this.businessRules.compliance.requireGDPRCompliance) {
      filteredCandidates = filteredCandidates.filter(candidate => 
        candidate.gdprCompliant !== false
      );
    }
    
    if (this.businessRules.compliance.requireValidLicenses) {
      filteredCandidates = filteredCandidates.filter(candidate => 
        !candidate.images || candidate.images.every(img => img.license && img.license.valid)
      );
    }
    
    // Apply risk rules
    const riskThreshold = this.businessRules.risk.riskThreshold;
    let highRiskCount = 0;
    
    filteredCandidates = filteredCandidates.filter(candidate => {
      const riskScore = this.calculateCandidateRisk(candidate, category);
      
      if (riskScore > riskThreshold) {
        if (highRiskCount < this.businessRules.risk.maxHighRiskItems) {
          highRiskCount++;
          return true;
        }
        return false;
      }
      
      return true;
    });
    
    return filteredCandidates;
  }

  calculateValueScore(candidate, budget) {
    const price = candidate.price || 1;
    const quality = candidate.rankingScore || 0.5;
    
    // Value = Quality / (Price / Budget)
    const normalizedPrice = price / budget;
    return quality / Math.max(0.1, normalizedPrice);
  }

  calculatePortfolioScore(candidate, allCandidates, userPreferences) {
    let portfolioScore = candidate.rankingScore || 0.5;
    
    // Quality component (40%)
    const qualityScore = candidate.rankingScore || 0.5;
    portfolioScore = qualityScore * 0.4;
    
    // Price component (30%)
    const avgPrice = allCandidates.reduce((sum, c) => sum + (c.price || 0), 0) / allCandidates.length;
    const priceScore = avgPrice > 0 ? Math.max(0, 1 - (candidate.price || 0) / avgPrice) : 0.5;
    portfolioScore += priceScore * 0.3;
    
    // Diversity component (20%)
    const provider = candidate.provider || 'unknown';
    const providerCount = allCandidates.filter(c => c.provider === provider).length;
    const diversityScore = Math.max(0, 1 - (providerCount - 1) * 0.2);
    portfolioScore += diversityScore * 0.2;
    
    // User preference component (10%)
    const preferenceScore = this.calculatePreferenceScore(candidate, userPreferences);
    portfolioScore += preferenceScore * 0.1;
    
    return Math.max(0, Math.min(1, portfolioScore));
  }

  calculatePreferenceScore(candidate, userPreferences) {
    let preferenceScore = 0.5;
    
    // Budget preference
    if (userPreferences.budget && candidate.price) {
      const budgetMatch = this.matchesBudgetPreference(candidate.price, userPreferences.budget);
      preferenceScore += budgetMatch * 0.3;
    }
    
    // Category-specific preferences
    if (userPreferences.categories) {
      // This would be expanded based on the specific category
      preferenceScore += 0.2; // Placeholder
    }
    
    // Amenity preferences
    if (userPreferences.amenities && candidate.amenities) {
      const matchedAmenities = userPreferences.amenities.filter(a => 
        candidate.amenities.includes(a)
      ).length;
      
      if (userPreferences.amenities.length > 0) {
        preferenceScore += (matchedAmenities / userPreferences.amenities.length) * 0.3;
      }
    }
    
    return Math.max(0, Math.min(1, preferenceScore));
  }

  calculateCandidateRisk(candidate, category) {
    let riskScore = 0;
    
    // Provider risk
    const provider = candidate.provider || 'unknown';
    const providerRisk = this.riskModels.provider.get(provider) || 0.5;
    riskScore += providerRisk * 0.4;
    
    // Review-based risk
    const reviewCount = candidate.reviewCount || 0;
    const rating = candidate.rating || 3;
    
    if (reviewCount < 10) {
      riskScore += 0.3; // High risk for low review count
    } else if (reviewCount < 50) {
      riskScore += 0.1; // Medium risk
    }
    
    if (rating < 3.5) {
      riskScore += 0.2; // Risk for low ratings
    }
    
    // Price volatility risk
    if (candidate.priceVolatility && candidate.priceVolatility > 0.2) {
      riskScore += candidate.priceVolatility * 0.2;
    }
    
    // Availability risk
    if (candidate.availabilityScore && candidate.availabilityScore < 0.8) {
      riskScore += (0.8 - candidate.availabilityScore) * 0.1;
    }
    
    return Math.max(0, Math.min(1, riskScore));
  }

  matchesBudgetPreference(price, budgetPreference) {
    switch (budgetPreference) {
      case 'budget':
        return price < 100 ? 1 : (price < 200 ? 0.5 : 0);
      case 'medium':
        return price >= 100 && price <= 300 ? 1 : 0.3;
      case 'luxury':
        return price > 200 ? 1 : (price > 100 ? 0.5 : 0);
      default:
        return 0.5;
    }
  }

  checkRuleViolations(candidates, category, budget) {
    const violations = [];
    
    // Check budget violations
    const totalPrice = candidates.reduce((sum, c) => sum + (c.price || 0), 0);
    if (totalPrice > budget * (1 + this.businessRules.budget.allowOverage)) {
      violations.push(`Budget exceeded: ${totalPrice} > ${budget}`);
      this.selectionStats.ruleViolations.budget++;
    }
    
    // Check quality violations
    const lowQualityCandidates = candidates.filter(c => 
      (c.rating || 0) < this.businessRules.quality.minRatingThreshold
    );
    
    if (lowQualityCandidates.length > 0) {
      violations.push(`${lowQualityCandidates.length} candidates below quality threshold`);
      this.selectionStats.ruleViolations.quality++;
    }
    
    // Check diversity violations
    const providerCounts = new Map();
    candidates.forEach(c => {
      const provider = c.provider || 'unknown';
      providerCounts.set(provider, (providerCounts.get(provider) || 0) + 1);
    });
    
    const maxSameProvider = this.businessRules.diversity.maxSameProvider;
    for (const [provider, count] of providerCounts) {
      if (count > maxSameProvider) {
        violations.push(`Too many candidates from ${provider}: ${count} > ${maxSameProvider}`);
        this.selectionStats.ruleViolations.diversity++;
        break;
      }
    }
    
    return violations;
  }

  async applyCrossCategoryOptimization(selectionResults, budget, selectionCriteria) {
    // Optimize across categories to better utilize budget and improve overall quality
    const totalUsedBudget = selectionResults.summary.usedBudget;
    const totalBudget = selectionResults.summary.totalBudget;
    const remainingBudget = totalBudget - totalUsedBudget;
    
    if (remainingBudget > totalBudget * 0.1) { // If more than 10% budget remaining
      // Try to upgrade selections or add more items
      await this.optimizeBudgetUtilization(selectionResults, remainingBudget, selectionCriteria);
    }
    
    // Balance quality across categories
    await this.balanceQualityAcrossCategories(selectionResults);
    
    // Ensure diversity across the entire selection
    await this.ensureOverallDiversity(selectionResults);
  }

  async optimizeBudgetUtilization(selectionResults, remainingBudget, selectionCriteria) {
    // Find opportunities to upgrade or add items within remaining budget
    const categories = Object.keys(selectionResults.results);
    
    for (const category of categories) {
      const selectedItems = selectionResults.results[category];
      
      if (selectedItems.length > 0) {
        // Try to find better alternatives within budget
        const lowestScoreItem = selectedItems.reduce((min, item) => 
          (item.rankingScore || 0) < (min.rankingScore || 0) ? item : min
        );
        
        // This would involve checking if there are better alternatives
        // For now, we'll just log the optimization opportunity
        logger.info(`Optimization opportunity in ${category}: ${remainingBudget} budget remaining`);
      }
    }
  }

  async balanceQualityAcrossCategories(selectionResults) {
    // Ensure no category has significantly lower quality than others
    const categoryScores = {};
    
    Object.keys(selectionResults.results).forEach(category => {
      const items = selectionResults.results[category];
      if (items.length > 0) {
        const avgScore = items.reduce((sum, item) => sum + (item.rankingScore || 0), 0) / items.length;
        categoryScores[category] = avgScore;
      }
    });
    
    const scores = Object.values(categoryScores);
    if (scores.length > 1) {
      const avgScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;
      const minScore = Math.min(...scores);
      
      if (avgScore - minScore > 0.2) { // Significant quality imbalance
        logger.warn('Quality imbalance detected across categories', categoryScores);
        // In a full implementation, this would trigger rebalancing
      }
    }
  }

  async ensureOverallDiversity(selectionResults) {
    // Check provider diversity across all categories
    const allProviders = new Map();
    
    Object.values(selectionResults.results).forEach(categoryItems => {
      categoryItems.forEach(item => {
        const provider = item.provider || 'unknown';
        allProviders.set(provider, (allProviders.get(provider) || 0) + 1);
      });
    });
    
    const totalItems = Object.values(selectionResults.results)
      .reduce((sum, items) => sum + items.length, 0);
    
    // Check if any provider dominates the selection
    for (const [provider, count] of allProviders) {
      if (count / totalItems > 0.5) { // More than 50% from one provider
        logger.warn(`Provider ${provider} dominates selection: ${count}/${totalItems} items`);
        // In a full implementation, this would trigger rebalancing
      }
    }
  }

  async validateFinalSelection(selectionResults, budget, selectionCriteria) {
    const validation = {
      isValid: true,
      warnings: [],
      errors: [],
      recommendations: []
    };
    
    // Validate budget compliance
    if (selectionResults.summary.usedBudget > selectionResults.summary.totalBudget) {
      validation.errors.push('Selection exceeds total budget');
      validation.isValid = false;
    }
    
    // Validate minimum items per category
    Object.keys(selectionResults.results).forEach(category => {
      const items = selectionResults.results[category];
      const minItems = selectionCriteria.minItems?.[category] || 0;
      
      if (items.length < minItems) {
        validation.warnings.push(`${category} has fewer items than requested: ${items.length} < ${minItems}`);
      }
    });
    
    // Validate quality thresholds
    if (selectionResults.summary.qualityScore < 0.6) {
      validation.warnings.push('Overall quality score is below recommended threshold');
    }
    
    // Validate risk levels
    if (selectionResults.summary.riskScore > 0.7) {
      validation.warnings.push('Overall risk score is above recommended threshold');
    }
    
    // Generate recommendations
    if (selectionResults.summary.remainingBudget > selectionResults.summary.totalBudget * 0.2) {
      validation.recommendations.push('Consider upgrading selections or adding more items with remaining budget');
    }
    
    return validation;
  }

  generateSelectionCacheKey(rankedCandidates, selectionCriteria, userPreferences, budget) {
    const keyData = {
      candidateCounts: Object.keys(rankedCandidates).reduce((acc, category) => {
        acc[category] = rankedCandidates[category].length;
        return acc;
      }, {}),
      selectionCriteria: JSON.stringify(selectionCriteria),
      userPreferences: JSON.stringify(userPreferences),
      budget: JSON.stringify(budget)
    };
    
    return `selection-${Buffer.from(JSON.stringify(keyData)).toString('base64').slice(0, 32)}`;
  }

  updateCategoryStats(category, stats) {
    if (this.selectionStats.categoryStats[category]) {
      const categoryStats = this.selectionStats.categoryStats[category];
      const totalSelected = categoryStats.selected + stats.selectedCount;
      
      if (totalSelected > 0) {
        categoryStats.avgScore = 
          (categoryStats.avgScore * categoryStats.selected + stats.totalQualityScore) / totalSelected;
        categoryStats.avgPrice = 
          (categoryStats.avgPrice * categoryStats.selected + stats.usedBudget) / totalSelected;
      }
      
      categoryStats.selected = totalSelected;
    }
  }

  updateSelectionStatistics() {
    logger.info('Selection statistics update', {
      totalSelections: this.selectionStats.totalSelections,
      averageSelectionTime: this.selectionStats.averageSelectionTime,
      cacheSize: this.selectionCache.size,
      ruleViolations: this.selectionStats.ruleViolations
    });
  }

  clearExpiredCache() {
    const now = Date.now();
    
    for (const [key, entry] of this.selectionCache) {
      if (now - entry.timestamp > this.cacheTimeout) {
        this.selectionCache.delete(key);
      }
    }
  }

  // Event handlers
  async handleApplyBusinessRules(event) {
    const { sagaId, candidates, category, rules } = event.data;
    
    try {
      const filteredCandidates = await this.applyBusinessRules(
        candidates, 
        category, 
        rules.budget || 1000, 
        rules.userPreferences || {}
      );
      
      await this.publish('business-rules-applied', {
        sagaId,
        category,
        originalCount: candidates.length,
        filteredCount: filteredCandidates.length,
        filteredCandidates,
        timestamp: Date.now()
      });
      
    } catch (error) {
      logger.error('Error applying business rules:', error);
      
      await this.publish('business-rules-failed', {
        sagaId,
        category,
        error: error.message,
        timestamp: Date.now()
      });
    }
  }

  async handleOptimizeSelection(event) {
    const { sagaId, selectionResults, optimizationCriteria } = event.data;
    
    try {
      // Apply optimization based on criteria
      await this.applyCrossCategoryOptimization(
        selectionResults, 
        optimizationCriteria.budget || {}, 
        optimizationCriteria.selectionCriteria || {}
      );
      
      await this.publish('selection-optimized', {
        sagaId,
        optimizedResults: selectionResults,
        timestamp: Date.now()
      });
      
    } catch (error) {
      logger.error('Error optimizing selection:', error);
      
      await this.publish('selection-optimization-failed', {
        sagaId,
        error: error.message,
        timestamp: Date.now()
      });
    }
  }

  async handleValidateSelection(event) {
    const { sagaId, selectionResults, validationCriteria } = event.data;
    
    try {
      const validation = await this.validateFinalSelection(
        selectionResults,
        validationCriteria.budget || {},
        validationCriteria.selectionCriteria || {}
      );
      
      await this.publish('selection-validated', {
        sagaId,
        validation,
        timestamp: Date.now()
      });
      
    } catch (error) {
      logger.error('Error validating selection:', error);
      
      await this.publish('selection-validation-failed', {
        sagaId,
        error: error.message,
        timestamp: Date.now()
      });
    }
  }

  async handleUpdateBusinessRules(event) {
    const { newRules, reason } = event.data;
    
    try {
      this.businessRules = {
        ...this.businessRules,
        ...newRules
      };
      
      // Clear cache to apply new rules
      this.selectionCache.clear();
      
      logger.info('Business rules updated', { reason });
      
      await this.publish('business-rules-updated', {
        newRules: this.businessRules,
        reason,
        timestamp: Date.now()
      });
      
    } catch (error) {
      logger.error('Error updating business rules:', error);
    }
  }

  // Query methods
  getSelectionStats() {
    return {
      ...this.selectionStats,
      cacheSize: this.selectionCache.size,
      businessRules: this.businessRules
    };
  }

  getBusinessRules() {
    return { ...this.businessRules };
  }

  getSelectionStrategies() {
    return { ...this.selectionStrategies };
  }

  updateSelectionStrategies(newStrategies) {
    this.selectionStrategies = {
      ...this.selectionStrategies,
      ...newStrategies
    };
    
    logger.info('Selection strategies updated');
  }

  getRiskModels() {
    return {
      provider: Object.fromEntries(this.riskModels.provider),
      pricing: Object.fromEntries(this.riskModels.pricing),
      availability: Object.fromEntries(this.riskModels.availability)
    };
  }

  updateRiskModel(modelType, updates) {
    if (this.riskModels[modelType]) {
      Object.entries(updates).forEach(([key, value]) => {
        this.riskModels[modelType].set(key, value);
      });
      
      logger.info(`Risk model updated: ${modelType}`);
    }
  }

  getCacheStats() {
    return {
      size: this.selectionCache.size,
      timeout: this.cacheTimeout,
      entries: Array.from(this.selectionCache.keys()).slice(0, 10)
    };
  }

  async shutdown() {
    logger.info('Shutting down Selection swarm');
    
    // Clear all data
    this.selectionCache.clear();
    this.riskModels.provider.clear();
    this.riskModels.pricing.clear();
    this.riskModels.availability.clear();
    
    await super.shutdown();
  }
}