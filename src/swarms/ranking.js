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

export class RankingSwarm extends BaseHolon {
  constructor(orchestration) {
    super('RankingSwarm', orchestration);
    this.config = getConfig();
    
    // Ranking algorithms and weights
    this.rankingAlgorithms = {
      weighted_score: {
        name: 'Weighted Score',
        description: 'Multi-criteria weighted scoring',
        weights: {
          price: 0.25,
          quality: 0.20,
          location: 0.15,
          availability: 0.10,
          reviews: 0.15,
          amenities: 0.10,
          sustainability: 0.05
        }
      },
      collaborative_filtering: {
        name: 'Collaborative Filtering',
        description: 'User similarity-based recommendations',
        enabled: true
      },
      content_based: {
        name: 'Content-Based',
        description: 'Feature similarity matching',
        enabled: true
      },
      popularity_boost: {
        name: 'Popularity Boost',
        description: 'Trending and popular items boost',
        boost_factor: 1.2
      },
      diversity_promotion: {
        name: 'Diversity Promotion',
        description: 'Promote diverse results',
        diversity_weight: 0.1
      }
    };
    
    // User preference profiles (mock data)
    this.userProfiles = new Map();
    
    // Ranking cache for expensive computations
    this.rankingCache = new Map();
    this.cacheTimeout = 300000; // 5 minutes
    
    // Ranking statistics
    this.rankingStats = {
      totalRankings: 0,
      averageRankingTime: 0,
      algorithmUsage: {
        weighted_score: 0,
        collaborative_filtering: 0,
        content_based: 0,
        popularity_boost: 0,
        diversity_promotion: 0
      },
      categoryStats: {
        hotels: { ranked: 0, avgScore: 0 },
        flights: { ranked: 0, avgScore: 0 },
        activities: { ranked: 0, avgScore: 0 },
        restaurants: { ranked: 0, avgScore: 0 },
        cars: { ranked: 0, avgScore: 0 }
      }
    };
    
    // Machine learning models (mock)
    this.mlModels = {
      pricePredictor: 'PricePredictionModel',
      qualityPredictor: 'QualityPredictionModel',
      userPreferenceModel: 'UserPreferenceModel'
    };
  }

  async initialize() {
    await super.initialize();
    
    // Subscribe to ranking events
    this.subscribe('rank-candidates', this.handleRankCandidates.bind(this));
    this.subscribe('update-user-preferences', this.handleUpdateUserPreferences.bind(this));
    this.subscribe('recalculate-rankings', this.handleRecalculateRankings.bind(this));
    this.subscribe('ml-model-updated', this.handleMLModelUpdated.bind(this));
    
    // Initialize user profiles and models
    await this.initializeUserProfiles();
    await this.initializeMLModels();
    
    // Start ranking maintenance
    this.startRankingMaintenance();
    
    logger.info('Ranking swarm initialized');
  }

  async initializeUserProfiles() {
    // Initialize with some mock user profiles
    const mockProfiles = [
      {
        userId: 'user1',
        preferences: {
          budget: 'medium',
          travelStyle: 'comfort',
          priorities: ['price', 'location', 'quality'],
          categories: {
            hotels: { starRating: [3, 4], amenities: ['wifi', 'breakfast'] },
            flights: { class: 'economy', maxLayovers: 1 },
            activities: { types: ['cultural', 'outdoor'], duration: [120, 480] }
          }
        },
        history: {
          bookings: 15,
          avgSpending: 150,
          preferredProviders: ['booking.com', 'expedia']
        }
      },
      {
        userId: 'user2',
        preferences: {
          budget: 'luxury',
          travelStyle: 'premium',
          priorities: ['quality', 'amenities', 'location'],
          categories: {
            hotels: { starRating: [4, 5], amenities: ['spa', 'pool', 'concierge'] },
            flights: { class: 'business', maxLayovers: 0 },
            activities: { types: ['luxury', 'exclusive'], duration: [180, 360] }
          }
        },
        history: {
          bookings: 8,
          avgSpending: 500,
          preferredProviders: ['luxury-travel.com', 'premium-stays']
        }
      }
    ];
    
    mockProfiles.forEach(profile => {
      this.userProfiles.set(profile.userId, profile);
    });
    
    logger.info(`Initialized ${mockProfiles.length} user profiles`);
  }

  async initializeMLModels() {
    // Mock ML model initialization
    logger.info('Initializing ML models for ranking');
    
    // In production, this would load actual trained models
    this.mlModels.initialized = true;
    this.mlModels.lastUpdated = Date.now();
  }

  startRankingMaintenance() {
    // Clear expired cache entries every 2 minutes
    setInterval(() => {
      this.clearExpiredCache();
    }, 120000);
    
    // Update ranking statistics every 10 minutes
    setInterval(() => {
      this.updateRankingStatistics();
    }, 600000);
  }

  async handleRankCandidates(event) {
    const { 
      sagaId, 
      candidates, 
      userPreferences = {}, 
      rankingOptions = {},
      context = {} 
    } = event.data;
    
    try {
      logger.info(`Starting ranking for saga ${sagaId}`);
      
      const rankingStartTime = Date.now();
      const rankingResults = {
        sagaId,
        startTime: rankingStartTime,
        userPreferences,
        rankingOptions,
        results: {
          hotels: [],
          flights: [],
          activities: [],
          restaurants: [],
          cars: []
        },
        summary: {
          totalCandidates: 0,
          rankedCandidates: 0,
          averageScore: 0,
          algorithmUsed: rankingOptions.algorithm || 'weighted_score'
        }
      };
      
      // Rank each category
      const rankingPromises = [];
      
      Object.keys(candidates).forEach(category => {
        if (candidates[category] && candidates[category].length > 0) {
          rankingPromises.push(
            this.rankCategoryBatch(category, candidates[category], userPreferences, rankingOptions, context)
          );
        }
      });
      
      // Wait for all rankings to complete
      const categoryResults = await Promise.allSettled(rankingPromises);
      
      // Process results
      let totalScore = 0;
      let totalCandidates = 0;
      
      categoryResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          const { category, rankedCandidates, stats } = result.value;
          rankingResults.results[category] = rankedCandidates;
          
          rankingResults.summary.totalCandidates += stats.total;
          rankingResults.summary.rankedCandidates += stats.ranked;
          totalScore += stats.totalScore;
          totalCandidates += stats.ranked;
          
          // Update global stats
          this.updateCategoryStats(category, stats);
          
        } else {
          logger.error('Category ranking failed:', result.reason);
        }
      });
      
      // Calculate average score
      if (totalCandidates > 0) {
        rankingResults.summary.averageScore = totalScore / totalCandidates;
      }
      
      rankingResults.endTime = Date.now();
      rankingResults.duration = rankingResults.endTime - rankingStartTime;
      
      // Update ranking statistics
      this.rankingStats.totalRankings++;
      this.rankingStats.averageRankingTime = 
        (this.rankingStats.averageRankingTime * (this.rankingStats.totalRankings - 1) + rankingResults.duration) / 
        this.rankingStats.totalRankings;
      
      // Publish ranking results
      await this.publish('candidates-ranked', rankingResults);
      
      logger.info(`Ranking completed for saga ${sagaId}`, {
        totalCandidates: rankingResults.summary.totalCandidates,
        rankedCandidates: rankingResults.summary.rankedCandidates,
        averageScore: rankingResults.summary.averageScore.toFixed(3),
        duration: rankingResults.duration
      });
      
    } catch (error) {
      logger.error('Error in candidate ranking:', error);
      
      await this.publish('ranking-failed', {
        sagaId,
        error: error.message,
        timestamp: Date.now()
      });
    }
  }

  async rankCategoryBatch(category, candidates, userPreferences, rankingOptions, context) {
    const algorithm = rankingOptions.algorithm || 'weighted_score';
    const maxResults = rankingOptions.maxResults || 50;
    
    // Check cache first
    const cacheKey = this.generateRankingCacheKey(category, candidates, userPreferences, algorithm);
    const cachedResult = this.rankingCache.get(cacheKey);
    
    if (cachedResult && Date.now() - cachedResult.timestamp < this.cacheTimeout) {
      logger.info(`Using cached ranking for ${category}`);
      return cachedResult.data;
    }
    
    // Perform ranking
    const rankedCandidates = [];
    const stats = { total: candidates.length, ranked: 0, totalScore: 0 };
    
    // Calculate scores for each candidate
    const scoringPromises = candidates.map(candidate => 
      this.calculateCandidateScore(candidate, category, userPreferences, algorithm, context)
    );
    
    const scoringResults = await Promise.allSettled(scoringPromises);
    
    // Process scoring results
    scoringResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        const scoredCandidate = result.value;
        rankedCandidates.push(scoredCandidate);
        stats.ranked++;
        stats.totalScore += scoredCandidate.rankingScore;
      } else {
        logger.error('Candidate scoring failed:', result.reason);
      }
    });
    
    // Sort by ranking score (descending)
    rankedCandidates.sort((a, b) => b.rankingScore - a.rankingScore);
    
    // Apply diversity promotion if enabled
    if (this.rankingAlgorithms.diversity_promotion.enabled) {
      this.applyDiversityPromotion(rankedCandidates, category);
    }
    
    // Limit results
    const finalResults = rankedCandidates.slice(0, maxResults);
    
    // Add ranking metadata
    finalResults.forEach((candidate, index) => {
      candidate.rank = index + 1;
      candidate.rankingMetadata = {
        algorithm,
        category,
        rankedAt: Date.now(),
        totalCandidates: candidates.length
      };
    });
    
    const result = {
      category,
      rankedCandidates: finalResults,
      stats: {
        ...stats,
        ranked: finalResults.length
      }
    };
    
    // Cache the result
    this.rankingCache.set(cacheKey, {
      data: result,
      timestamp: Date.now()
    });
    
    // Update algorithm usage stats
    this.rankingStats.algorithmUsage[algorithm]++;
    
    return result;
  }

  async calculateCandidateScore(candidate, category, userPreferences, algorithm, context) {
    const scoredCandidate = {
      ...candidate,
      rankingScore: 0,
      scoreBreakdown: {},
      rankingAlgorithm: algorithm
    };
    
    try {
      switch (algorithm) {
        case 'weighted_score':
          scoredCandidate.rankingScore = await this.calculateWeightedScore(candidate, category, userPreferences);
          break;
          
        case 'collaborative_filtering':
          scoredCandidate.rankingScore = await this.calculateCollaborativeScore(candidate, category, userPreferences, context);
          break;
          
        case 'content_based':
          scoredCandidate.rankingScore = await this.calculateContentBasedScore(candidate, category, userPreferences);
          break;
          
        case 'hybrid':
          scoredCandidate.rankingScore = await this.calculateHybridScore(candidate, category, userPreferences, context);
          break;
          
        default:
          scoredCandidate.rankingScore = await this.calculateWeightedScore(candidate, category, userPreferences);
      }
      
      // Apply popularity boost if enabled
      if (this.rankingAlgorithms.popularity_boost.enabled) {
        const popularityBoost = this.calculatePopularityBoost(candidate, category);
        scoredCandidate.rankingScore *= popularityBoost;
        scoredCandidate.scoreBreakdown.popularityBoost = popularityBoost;
      }
      
      // Ensure score is within bounds
      scoredCandidate.rankingScore = Math.max(0, Math.min(1, scoredCandidate.rankingScore));
      
      return scoredCandidate;
      
    } catch (error) {
      logger.error('Error calculating candidate score:', error);
      
      scoredCandidate.rankingScore = 0.1; // Fallback score
      scoredCandidate.scoreBreakdown.error = error.message;
      
      return scoredCandidate;
    }
  }

  async calculateWeightedScore(candidate, category, userPreferences) {
    const weights = this.rankingAlgorithms.weighted_score.weights;
    const scores = {};
    let totalScore = 0;
    
    // Price score (inverse - lower price = higher score)
    if (candidate.price) {
      const priceRange = this.getPriceRange(category);
      const normalizedPrice = (candidate.price - priceRange.min) / (priceRange.max - priceRange.min);
      scores.price = 1 - Math.max(0, Math.min(1, normalizedPrice));
      
      // Apply user budget preference
      if (userPreferences.budget) {
        const budgetMultiplier = this.getBudgetMultiplier(userPreferences.budget, candidate.price, category);
        scores.price *= budgetMultiplier;
      }
    } else {
      scores.price = 0.5; // Default score for missing price
    }
    
    // Quality score
    scores.quality = this.calculateQualityScore(candidate, category);
    
    // Location score
    scores.location = this.calculateLocationScore(candidate, category, userPreferences);
    
    // Availability score
    scores.availability = candidate.validationScore || 0.8;
    
    // Reviews score
    scores.reviews = this.calculateReviewsScore(candidate);
    
    // Amenities score
    scores.amenities = this.calculateAmenitiesScore(candidate, category, userPreferences);
    
    // Sustainability score
    scores.sustainability = this.calculateSustainabilityScore(candidate, category);
    
    // Calculate weighted total
    Object.keys(weights).forEach(factor => {
      if (scores[factor] !== undefined) {
        totalScore += scores[factor] * weights[factor];
      }
    });
    
    return Math.max(0, Math.min(1, totalScore));
  }

  async calculateCollaborativeScore(candidate, category, userPreferences, context) {
    // Mock collaborative filtering implementation
    // In production, this would use actual user similarity data
    
    const userId = context.userId || 'anonymous';
    const userProfile = this.userProfiles.get(userId);
    
    if (!userProfile) {
      // Fallback to weighted score for unknown users
      return await this.calculateWeightedScore(candidate, category, userPreferences);
    }
    
    // Find similar users based on preferences and history
    const similarUsers = this.findSimilarUsers(userProfile);
    
    // Calculate score based on similar users' preferences
    let collaborativeScore = 0.5; // Base score
    
    similarUsers.forEach(similarUser => {
      const similarity = this.calculateUserSimilarity(userProfile, similarUser);
      const userScore = this.predictUserScore(similarUser, candidate, category);
      collaborativeScore += similarity * userScore * 0.1;
    });
    
    return Math.max(0, Math.min(1, collaborativeScore));
  }

  async calculateContentBasedScore(candidate, category, userPreferences) {
    // Content-based filtering using feature similarity
    let contentScore = 0.5; // Base score
    
    // Category-specific feature matching
    switch (category) {
      case 'hotels':
        contentScore = this.calculateHotelContentScore(candidate, userPreferences);
        break;
      case 'flights':
        contentScore = this.calculateFlightContentScore(candidate, userPreferences);
        break;
      case 'activities':
        contentScore = this.calculateActivityContentScore(candidate, userPreferences);
        break;
      case 'restaurants':
        contentScore = this.calculateRestaurantContentScore(candidate, userPreferences);
        break;
      case 'cars':
        contentScore = this.calculateCarContentScore(candidate, userPreferences);
        break;
    }
    
    return Math.max(0, Math.min(1, contentScore));
  }

  async calculateHybridScore(candidate, category, userPreferences, context) {
    // Hybrid approach combining multiple algorithms
    const weightedScore = await this.calculateWeightedScore(candidate, category, userPreferences);
    const collaborativeScore = await this.calculateCollaborativeScore(candidate, category, userPreferences, context);
    const contentScore = await this.calculateContentBasedScore(candidate, category, userPreferences);
    
    // Combine scores with weights
    const hybridScore = 
      weightedScore * 0.5 + 
      collaborativeScore * 0.3 + 
      contentScore * 0.2;
    
    return Math.max(0, Math.min(1, hybridScore));
  }

  calculateQualityScore(candidate, category) {
    let qualityScore = 0.5;
    
    // Rating-based quality
    if (candidate.rating) {
      qualityScore = candidate.rating / 5.0;
    }
    
    // Review count boost
    if (candidate.reviewCount) {
      const reviewBoost = Math.min(0.2, Math.log10(candidate.reviewCount) / 10);
      qualityScore += reviewBoost;
    }
    
    // Validation score integration
    if (candidate.validationScore) {
      qualityScore = (qualityScore + candidate.validationScore) / 2;
    }
    
    return Math.max(0, Math.min(1, qualityScore));
  }

  calculateLocationScore(candidate, category, userPreferences) {
    let locationScore = 0.5;
    
    // Distance from city center or preferred location
    if (candidate.location && candidate.location.distanceFromCenter) {
      const distance = candidate.location.distanceFromCenter;
      locationScore = Math.max(0, 1 - (distance / 10)); // Assume 10km max distance
    }
    
    // Neighborhood desirability
    if (candidate.location && candidate.location.neighborhood) {
      const neighborhoodScore = this.getNeighborhoodScore(candidate.location.neighborhood);
      locationScore = (locationScore + neighborhoodScore) / 2;
    }
    
    // Transportation accessibility
    if (candidate.location && candidate.location.transportAccess) {
      const transportScore = candidate.location.transportAccess / 5.0;
      locationScore = (locationScore + transportScore) / 2;
    }
    
    return Math.max(0, Math.min(1, locationScore));
  }

  calculateReviewsScore(candidate) {
    let reviewsScore = 0.5;
    
    if (candidate.reviewCount && candidate.rating) {
      // Combine rating and review count
      const ratingScore = candidate.rating / 5.0;
      const countScore = Math.min(1, Math.log10(candidate.reviewCount + 1) / 3);
      reviewsScore = (ratingScore * 0.7) + (countScore * 0.3);
    }
    
    // Recent reviews boost
    if (candidate.recentReviews) {
      const recentBoost = Math.min(0.1, candidate.recentReviews.length / 50);
      reviewsScore += recentBoost;
    }
    
    return Math.max(0, Math.min(1, reviewsScore));
  }

  calculateAmenitiesScore(candidate, category, userPreferences) {
    let amenitiesScore = 0.5;
    
    if (!candidate.amenities) {
      return amenitiesScore;
    }
    
    // Category-specific amenity scoring
    const categoryAmenities = this.getCategoryAmenities(category);
    const userPreferredAmenities = userPreferences.amenities || [];
    
    let matchedAmenities = 0;
    let totalImportantAmenities = categoryAmenities.length;
    
    categoryAmenities.forEach(amenity => {
      if (candidate.amenities.includes(amenity)) {
        matchedAmenities++;
        
        // Extra boost for user-preferred amenities
        if (userPreferredAmenities.includes(amenity)) {
          matchedAmenities += 0.5;
        }
      }
    });
    
    if (totalImportantAmenities > 0) {
      amenitiesScore = matchedAmenities / totalImportantAmenities;
    }
    
    return Math.max(0, Math.min(1, amenitiesScore));
  }

  calculateSustainabilityScore(candidate, category) {
    let sustainabilityScore = 0.5;
    
    // Green certifications
    if (candidate.certifications) {
      const greenCerts = candidate.certifications.filter(cert => 
        cert.toLowerCase().includes('green') || 
        cert.toLowerCase().includes('eco') ||
        cert.toLowerCase().includes('sustainable')
      );
      sustainabilityScore += greenCerts.length * 0.2;
    }
    
    // Energy efficiency
    if (candidate.energyRating) {
      sustainabilityScore += candidate.energyRating / 10;
    }
    
    // Carbon footprint (lower is better)
    if (candidate.carbonFootprint) {
      const carbonScore = Math.max(0, 1 - (candidate.carbonFootprint / 100));
      sustainabilityScore = (sustainabilityScore + carbonScore) / 2;
    }
    
    return Math.max(0, Math.min(1, sustainabilityScore));
  }

  calculatePopularityBoost(candidate, category) {
    let popularityBoost = 1.0;
    
    // Booking frequency boost
    if (candidate.bookingCount) {
      const bookingBoost = Math.min(0.2, Math.log10(candidate.bookingCount + 1) / 10);
      popularityBoost += bookingBoost;
    }
    
    // Trending boost
    if (candidate.trending) {
      popularityBoost += 0.1;
    }
    
    // Recent popularity
    if (candidate.recentBookings) {
      const recentBoost = Math.min(0.15, candidate.recentBookings / 100);
      popularityBoost += recentBoost;
    }
    
    return Math.min(this.rankingAlgorithms.popularity_boost.boost_factor, popularityBoost);
  }

  applyDiversityPromotion(rankedCandidates, category) {
    const diversityWeight = this.rankingAlgorithms.diversity_promotion.diversity_weight;
    
    // Group candidates by provider/brand
    const providerGroups = new Map();
    
    rankedCandidates.forEach((candidate, index) => {
      const provider = candidate.provider || 'unknown';
      if (!providerGroups.has(provider)) {
        providerGroups.set(provider, []);
      }
      providerGroups.get(provider).push({ candidate, originalIndex: index });
    });
    
    // Apply diversity penalty to over-represented providers
    providerGroups.forEach((candidates, provider) => {
      if (candidates.length > 3) { // More than 3 from same provider
        candidates.slice(3).forEach(({ candidate }) => {
          candidate.rankingScore *= (1 - diversityWeight);
        });
      }
    });
    
    // Re-sort after diversity adjustment
    rankedCandidates.sort((a, b) => b.rankingScore - a.rankingScore);
  }

  // Helper methods
  getPriceRange(category) {
    const ranges = {
      hotels: { min: 20, max: 500 },
      flights: { min: 50, max: 1500 },
      activities: { min: 10, max: 200 },
      restaurants: { min: 15, max: 100 },
      cars: { min: 25, max: 150 }
    };
    
    return ranges[category] || { min: 0, max: 1000 };
  }

  getBudgetMultiplier(budget, price, category) {
    const priceRange = this.getPriceRange(category);
    const normalizedPrice = (price - priceRange.min) / (priceRange.max - priceRange.min);
    
    switch (budget) {
      case 'budget':
        return normalizedPrice < 0.3 ? 1.2 : (normalizedPrice < 0.6 ? 1.0 : 0.7);
      case 'medium':
        return normalizedPrice < 0.2 ? 0.9 : (normalizedPrice < 0.8 ? 1.1 : 0.8);
      case 'luxury':
        return normalizedPrice < 0.5 ? 0.8 : (normalizedPrice < 0.9 ? 1.1 : 1.2);
      default:
        return 1.0;
    }
  }

  getNeighborhoodScore(neighborhood) {
    // Mock neighborhood scoring
    const neighborhoodScores = {
      'downtown': 0.9,
      'city center': 0.9,
      'old town': 0.8,
      'business district': 0.7,
      'residential': 0.6,
      'suburbs': 0.4,
      'airport': 0.3
    };
    
    return neighborhoodScores[neighborhood.toLowerCase()] || 0.5;
  }

  getCategoryAmenities(category) {
    const amenities = {
      hotels: ['wifi', 'breakfast', 'parking', 'pool', 'gym', 'spa', 'restaurant'],
      flights: ['wifi', 'entertainment', 'meals', 'legroom', 'priority boarding'],
      activities: ['guide', 'equipment', 'transport', 'photos', 'refreshments'],
      restaurants: ['wifi', 'parking', 'outdoor seating', 'live music', 'takeaway'],
      cars: ['gps', 'bluetooth', 'air conditioning', 'automatic', 'insurance']
    };
    
    return amenities[category] || [];
  }

  findSimilarUsers(userProfile) {
    // Mock similar user finding
    const similarUsers = [];
    
    this.userProfiles.forEach((profile, userId) => {
      if (userId !== userProfile.userId) {
        const similarity = this.calculateUserSimilarity(userProfile, profile);
        if (similarity > 0.5) {
          similarUsers.push({ ...profile, similarity });
        }
      }
    });
    
    return similarUsers.sort((a, b) => b.similarity - a.similarity).slice(0, 5);
  }

  calculateUserSimilarity(user1, user2) {
    let similarity = 0;
    
    // Budget similarity
    if (user1.preferences.budget === user2.preferences.budget) {
      similarity += 0.3;
    }
    
    // Travel style similarity
    if (user1.preferences.travelStyle === user2.preferences.travelStyle) {
      similarity += 0.2;
    }
    
    // Priority overlap
    const commonPriorities = user1.preferences.priorities.filter(p => 
      user2.preferences.priorities.includes(p)
    );
    similarity += (commonPriorities.length / Math.max(user1.preferences.priorities.length, user2.preferences.priorities.length)) * 0.3;
    
    // Spending similarity
    const spendingDiff = Math.abs(user1.history.avgSpending - user2.history.avgSpending);
    const maxSpending = Math.max(user1.history.avgSpending, user2.history.avgSpending);
    similarity += (1 - (spendingDiff / maxSpending)) * 0.2;
    
    return Math.max(0, Math.min(1, similarity));
  }

  predictUserScore(user, candidate, category) {
    // Mock user score prediction
    let predictedScore = 0.5;
    
    // Based on user preferences
    if (user.preferences.categories[category]) {
      const categoryPrefs = user.preferences.categories[category];
      
      // Price preference
      if (categoryPrefs.priceRange) {
        const [minPrice, maxPrice] = categoryPrefs.priceRange;
        if (candidate.price >= minPrice && candidate.price <= maxPrice) {
          predictedScore += 0.2;
        }
      }
      
      // Feature preferences
      if (categoryPrefs.amenities && candidate.amenities) {
        const matchedAmenities = categoryPrefs.amenities.filter(a => 
          candidate.amenities.includes(a)
        );
        predictedScore += (matchedAmenities.length / categoryPrefs.amenities.length) * 0.3;
      }
    }
    
    return Math.max(0, Math.min(1, predictedScore));
  }

  // Category-specific content scoring methods
  calculateHotelContentScore(candidate, userPreferences) {
    let score = 0.5;
    
    // Star rating preference
    if (userPreferences.starRating && candidate.starRating) {
      const ratingDiff = Math.abs(userPreferences.starRating - candidate.starRating);
      score += Math.max(0, (2 - ratingDiff) / 2) * 0.3;
    }
    
    // Hotel type preference
    if (userPreferences.hotelType && candidate.type) {
      if (userPreferences.hotelType === candidate.type) {
        score += 0.2;
      }
    }
    
    return Math.max(0, Math.min(1, score));
  }

  calculateFlightContentScore(candidate, userPreferences) {
    let score = 0.5;
    
    // Class preference
    if (userPreferences.flightClass && candidate.class) {
      if (userPreferences.flightClass === candidate.class) {
        score += 0.3;
      }
    }
    
    // Layover preference
    if (userPreferences.maxLayovers !== undefined && candidate.layovers !== undefined) {
      if (candidate.layovers <= userPreferences.maxLayovers) {
        score += 0.2;
      }
    }
    
    return Math.max(0, Math.min(1, score));
  }

  calculateActivityContentScore(candidate, userPreferences) {
    let score = 0.5;
    
    // Activity type preference
    if (userPreferences.activityTypes && candidate.type) {
      if (userPreferences.activityTypes.includes(candidate.type)) {
        score += 0.3;
      }
    }
    
    // Duration preference
    if (userPreferences.durationRange && candidate.duration) {
      const [minDuration, maxDuration] = userPreferences.durationRange;
      if (candidate.duration >= minDuration && candidate.duration <= maxDuration) {
        score += 0.2;
      }
    }
    
    return Math.max(0, Math.min(1, score));
  }

  calculateRestaurantContentScore(candidate, userPreferences) {
    let score = 0.5;
    
    // Cuisine preference
    if (userPreferences.cuisines && candidate.cuisine) {
      if (userPreferences.cuisines.includes(candidate.cuisine)) {
        score += 0.3;
      }
    }
    
    // Price range preference
    if (userPreferences.priceRange && candidate.priceRange) {
      if (userPreferences.priceRange === candidate.priceRange) {
        score += 0.2;
      }
    }
    
    return Math.max(0, Math.min(1, score));
  }

  calculateCarContentScore(candidate, userPreferences) {
    let score = 0.5;
    
    // Car type preference
    if (userPreferences.carType && candidate.type) {
      if (userPreferences.carType === candidate.type) {
        score += 0.3;
      }
    }
    
    // Transmission preference
    if (userPreferences.transmission && candidate.transmission) {
      if (userPreferences.transmission === candidate.transmission) {
        score += 0.2;
      }
    }
    
    return Math.max(0, Math.min(1, score));
  }

  generateRankingCacheKey(category, candidates, userPreferences, algorithm) {
    const keyData = {
      category,
      candidateCount: candidates.length,
      candidateIds: candidates.slice(0, 5).map(c => c.id), // First 5 IDs
      userPreferences: JSON.stringify(userPreferences),
      algorithm
    };
    
    return `ranking-${Buffer.from(JSON.stringify(keyData)).toString('base64').slice(0, 32)}`;
  }

  updateCategoryStats(category, stats) {
    if (this.rankingStats.categoryStats[category]) {
      const categoryStats = this.rankingStats.categoryStats[category];
      const totalRanked = categoryStats.ranked + stats.ranked;
      
      categoryStats.avgScore = 
        (categoryStats.avgScore * categoryStats.ranked + stats.totalScore) / totalRanked;
      categoryStats.ranked = totalRanked;
    }
  }

  updateRankingStatistics() {
    // Log current statistics
    logger.info('Ranking statistics update', {
      totalRankings: this.rankingStats.totalRankings,
      averageRankingTime: this.rankingStats.averageRankingTime,
      cacheSize: this.rankingCache.size
    });
  }

  clearExpiredCache() {
    const now = Date.now();
    
    for (const [key, entry] of this.rankingCache) {
      if (now - entry.timestamp > this.cacheTimeout) {
        this.rankingCache.delete(key);
      }
    }
  }

  // Event handlers
  async handleUpdateUserPreferences(event) {
    const { userId, preferences } = event.data;
    
    try {
      if (this.userProfiles.has(userId)) {
        const existingProfile = this.userProfiles.get(userId);
        const updatedProfile = {
          ...existingProfile,
          preferences: {
            ...existingProfile.preferences,
            ...preferences
          },
          lastUpdated: Date.now()
        };
        
        this.userProfiles.set(userId, updatedProfile);
        
        // Clear related cache entries
        this.clearUserRelatedCache(userId);
        
        logger.info(`Updated preferences for user ${userId}`);
        
        await this.publish('user-preferences-updated', {
          userId,
          preferences: updatedProfile.preferences,
          timestamp: Date.now()
        });
        
      } else {
        logger.warn(`User profile not found: ${userId}`);
      }
      
    } catch (error) {
      logger.error('Error updating user preferences:', error);
    }
  }

  async handleRecalculateRankings(event) {
    const { sagaId, reason } = event.data;
    
    try {
      logger.info(`Recalculating rankings for saga ${sagaId}, reason: ${reason}`);
      
      // Clear relevant cache entries
      this.rankingCache.clear();
      
      await this.publish('rankings-recalculated', {
        sagaId,
        reason,
        timestamp: Date.now()
      });
      
    } catch (error) {
      logger.error('Error recalculating rankings:', error);
    }
  }

  async handleMLModelUpdated(event) {
    const { modelType, version } = event.data;
    
    try {
      logger.info(`ML model updated: ${modelType} v${version}`);
      
      // Update model metadata
      this.mlModels[modelType] = {
        version,
        lastUpdated: Date.now()
      };
      
      // Clear cache to force re-ranking with new model
      this.rankingCache.clear();
      
      await this.publish('ml-model-integration-complete', {
        modelType,
        version,
        timestamp: Date.now()
      });
      
    } catch (error) {
      logger.error('Error handling ML model update:', error);
    }
  }

  clearUserRelatedCache(userId) {
    for (const [key, entry] of this.rankingCache) {
      if (key.includes(userId)) {
        this.rankingCache.delete(key);
      }
    }
  }

  // Query methods
  getRankingStats() {
    return {
      ...this.rankingStats,
      cacheSize: this.rankingCache.size,
      userProfiles: this.userProfiles.size,
      mlModelsStatus: this.mlModels
    };
  }

  getRankingAlgorithms() {
    return { ...this.rankingAlgorithms };
  }

  updateRankingAlgorithms(newAlgorithms) {
    this.rankingAlgorithms = {
      ...this.rankingAlgorithms,
      ...newAlgorithms
    };
    
    // Clear cache to apply new algorithms
    this.rankingCache.clear();
    
    logger.info('Ranking algorithms updated');
  }

  getUserProfile(userId) {
    return this.userProfiles.get(userId);
  }

  getCacheStats() {
    return {
      size: this.rankingCache.size,
      timeout: this.cacheTimeout,
      entries: Array.from(this.rankingCache.keys()).slice(0, 10)
    };
  }

  async shutdown() {
    logger.info('Shutting down Ranking swarm');
    
    // Clear all data
    this.rankingCache.clear();
    this.userProfiles.clear();
    
    await super.shutdown();
  }
}