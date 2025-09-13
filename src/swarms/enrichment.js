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

export class EnrichmentSwarm extends BaseHolon {
  constructor(orchestration) {
    super('EnrichmentSwarm', orchestration);
    this.config = getConfig();
    
    // Enrichment services and providers
    this.enrichmentServices = {
      weather: {
        name: 'Weather Service',
        enabled: true,
        timeout: 5000,
        cache: new Map(),
        cacheTimeout: 1800000 // 30 minutes
      },
      maps: {
        name: 'Maps & Location Service',
        enabled: true,
        timeout: 3000,
        cache: new Map(),
        cacheTimeout: 3600000 // 1 hour
      },
      reviews: {
        name: 'Reviews Aggregation Service',
        enabled: true,
        timeout: 4000,
        cache: new Map(),
        cacheTimeout: 1800000 // 30 minutes
      },
      images: {
        name: 'Image Enhancement Service',
        enabled: true,
        timeout: 6000,
        cache: new Map(),
        cacheTimeout: 7200000 // 2 hours
      },
      pricing: {
        name: 'Dynamic Pricing Service',
        enabled: true,
        timeout: 3000,
        cache: new Map(),
        cacheTimeout: 300000 // 5 minutes
      },
      availability: {
        name: 'Real-time Availability Service',
        enabled: true,
        timeout: 4000,
        cache: new Map(),
        cacheTimeout: 180000 // 3 minutes
      },
      social: {
        name: 'Social Media Insights',
        enabled: true,
        timeout: 5000,
        cache: new Map(),
        cacheTimeout: 3600000 // 1 hour
      },
      sustainability: {
        name: 'Sustainability Metrics',
        enabled: true,
        timeout: 3000,
        cache: new Map(),
        cacheTimeout: 7200000 // 2 hours
      }
    };
    
    // Enrichment statistics
    this.enrichmentStats = {
      totalEnrichments: 0,
      averageEnrichmentTime: 0,
      serviceStats: {
        weather: { requests: 0, successes: 0, failures: 0, avgTime: 0 },
        maps: { requests: 0, successes: 0, failures: 0, avgTime: 0 },
        reviews: { requests: 0, successes: 0, failures: 0, avgTime: 0 },
        images: { requests: 0, successes: 0, failures: 0, avgTime: 0 },
        pricing: { requests: 0, successes: 0, failures: 0, avgTime: 0 },
        availability: { requests: 0, successes: 0, failures: 0, avgTime: 0 },
        social: { requests: 0, successes: 0, failures: 0, avgTime: 0 },
        sustainability: { requests: 0, successes: 0, failures: 0, avgTime: 0 }
      },
      categoryStats: {
        hotels: { enriched: 0, avgEnrichmentScore: 0 },
        flights: { enriched: 0, avgEnrichmentScore: 0 },
        activities: { enriched: 0, avgEnrichmentScore: 0 },
        restaurants: { enriched: 0, avgEnrichmentScore: 0 },
        cars: { enriched: 0, avgEnrichmentScore: 0 }
      },
      cacheStats: {
        hits: 0,
        misses: 0,
        hitRate: 0
      }
    };
    
    // Enrichment rules and priorities
    this.enrichmentRules = {
      priority: {
        high: ['pricing', 'availability', 'weather'],
        medium: ['reviews', 'maps', 'images'],
        low: ['social', 'sustainability']
      },
      required: ['pricing', 'availability'],
      optional: ['weather', 'reviews', 'maps', 'images', 'social', 'sustainability'],
      fallback: {
        enabled: true,
        maxRetries: 2,
        retryDelay: 1000
      },
      quality: {
        minEnrichmentScore: 0.6,
        requiredFields: ['location', 'pricing', 'availability'],
        optionalFields: ['weather', 'reviews', 'images', 'sustainability']
      }
    };
    
    // External service configurations (mock)
    this.externalServices = {
      weatherAPI: {
        baseUrl: 'https://api.weather.com/v1',
        apiKey: (process.env.OPENWEATHER_API_KEY || process.env.WEATHER_API_KEY || ''),
        rateLimit: 1000, // requests per hour
        currentUsage: 0
      },
      mapsAPI: {
        baseUrl: 'https://maps.googleapis.com/maps/api',
        apiKey: (process.env.GOOGLE_MAPS_API_KEY || process.env.MAPS_API_KEY || ''),
        rateLimit: 2500,
        currentUsage: 0
      },
      reviewsAPI: {
        baseUrl: 'https://api.reviews.com/v2',
        apiKey: (process.env.REVIEWS_API_KEY || ''),
        rateLimit: 500,
        currentUsage: 0
      }
    };
  }

  async initialize() {
    await super.initialize();
    
    // Subscribe to enrichment events
    this.subscribe('enrich-candidates', this.handleEnrichCandidates.bind(this));
    this.subscribe('enrich-single-candidate', this.handleEnrichSingleCandidate.bind(this));
    this.subscribe('update-enrichment-data', this.handleUpdateEnrichmentData.bind(this));
    this.subscribe('refresh-external-data', this.handleRefreshExternalData.bind(this));
    this.subscribe('validate-enrichment', this.handleValidateEnrichment.bind(this));
    
    // Start enrichment maintenance
    this.startEnrichmentMaintenance();
    
    logger.info('Enrichment swarm initialized');
  }

  startEnrichmentMaintenance() {
    // Clear expired cache entries every 5 minutes
    setInterval(() => {
      this.clearExpiredCaches();
    }, 300000);
    
    // Update enrichment statistics every 10 minutes
    setInterval(() => {
      this.updateEnrichmentStatistics();
    }, 600000);
    
    // Reset rate limit counters every hour
    setInterval(() => {
      this.resetRateLimitCounters();
    }, 3600000);
  }

  async handleEnrichCandidates(event) {
    const { 
      sagaId, 
      selectedCandidates, 
      enrichmentLevel = 'standard',
      userContext = {},
      travelDates = {},
      location = {} 
    } = event.data;
    
    try {
      logger.info(`Starting enrichment for saga ${sagaId}`);
      
      const enrichmentStartTime = Date.now();
      
      const enrichmentResults = {
        sagaId,
        enrichmentLevel,
        startTime: enrichmentStartTime,
        userContext,
        travelDates,
        location,
        results: {
          hotels: [],
          flights: [],
          activities: [],
          restaurants: [],
          cars: []
        },
        summary: {
          totalCandidates: 0,
          enrichedCandidates: 0,
          enrichmentScore: 0,
          servicesUsed: [],
          cacheHits: 0,
          cacheMisses: 0,
          errors: []
        }
      };
      
      // Process enrichment for each category
      const enrichmentPromises = [];
      
      Object.keys(selectedCandidates.results).forEach(category => {
        const candidates = selectedCandidates.results[category];
        
        if (candidates && candidates.length > 0) {
          enrichmentPromises.push(
            this.enrichCategoryBatch(
              category, 
              candidates, 
              enrichmentLevel, 
              userContext, 
              travelDates, 
              location
            )
          );
        }
      });
      
      // Wait for all enrichments to complete
      const categoryResults = await Promise.allSettled(enrichmentPromises);
      
      // Process results
      let totalEnrichmentScore = 0;
      let totalEnrichedCount = 0;
      const allServicesUsed = new Set();
      let totalCacheHits = 0;
      let totalCacheMisses = 0;
      
      categoryResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          const { category, enrichedCandidates, stats } = result.value;
          enrichmentResults.results[category] = enrichedCandidates;
          
          enrichmentResults.summary.totalCandidates += stats.totalCandidates;
          enrichmentResults.summary.enrichedCandidates += stats.enrichedCount;
          totalEnrichmentScore += stats.totalEnrichmentScore;
          totalEnrichedCount += stats.enrichedCount;
          
          stats.servicesUsed.forEach(service => allServicesUsed.add(service));
          totalCacheHits += stats.cacheHits;
          totalCacheMisses += stats.cacheMisses;
          
          if (stats.errors && stats.errors.length > 0) {
            enrichmentResults.summary.errors.push(...stats.errors);
          }
          
          // Update category stats
          this.updateCategoryEnrichmentStats(category, stats);
          
        } else {
          logger.error('Category enrichment failed:', result.reason);
          enrichmentResults.summary.errors.push(`Category enrichment failed: ${result.reason.message}`);
        }
      });
      
      // Calculate summary metrics
      if (totalEnrichedCount > 0) {
        enrichmentResults.summary.enrichmentScore = totalEnrichmentScore / totalEnrichedCount;
      }
      
      enrichmentResults.summary.servicesUsed = Array.from(allServicesUsed);
      enrichmentResults.summary.cacheHits = totalCacheHits;
      enrichmentResults.summary.cacheMisses = totalCacheMisses;
      
      // Apply post-enrichment processing
      await this.applyPostEnrichmentProcessing(enrichmentResults, userContext, travelDates);
      
      enrichmentResults.endTime = Date.now();
      enrichmentResults.duration = enrichmentResults.endTime - enrichmentStartTime;
      
      // Update statistics
      this.enrichmentStats.totalEnrichments++;
      this.enrichmentStats.averageEnrichmentTime = 
        (this.enrichmentStats.averageEnrichmentTime * (this.enrichmentStats.totalEnrichments - 1) + enrichmentResults.duration) / 
        this.enrichmentStats.totalEnrichments;
      
      this.enrichmentStats.cacheStats.hits += totalCacheHits;
      this.enrichmentStats.cacheStats.misses += totalCacheMisses;
      this.enrichmentStats.cacheStats.hitRate = 
        this.enrichmentStats.cacheStats.hits / (this.enrichmentStats.cacheStats.hits + this.enrichmentStats.cacheStats.misses);
      
      // Publish enrichment results
      await this.publish('candidates-enriched', enrichmentResults);
      
      logger.info(`Enrichment completed for saga ${sagaId}`, {
        enrichmentLevel,
        enrichedCandidates: enrichmentResults.summary.enrichedCandidates,
        enrichmentScore: enrichmentResults.summary.enrichmentScore.toFixed(3),
        servicesUsed: enrichmentResults.summary.servicesUsed.length,
        cacheHitRate: (totalCacheHits / (totalCacheHits + totalCacheMisses)).toFixed(3),
        duration: enrichmentResults.duration
      });
      
    } catch (error) {
      logger.error('Error in candidate enrichment:', error);
      
      await this.publish('enrichment-failed', {
        sagaId,
        error: error.message,
        timestamp: Date.now()
      });
    }
  }

  async enrichCategoryBatch(category, candidates, enrichmentLevel, userContext, travelDates, location) {
    const stats = {
      totalCandidates: candidates.length,
      enrichedCount: 0,
      totalEnrichmentScore: 0,
      servicesUsed: [],
      cacheHits: 0,
      cacheMisses: 0,
      errors: []
    };
    
    const enrichedCandidates = [];
    
    // Determine enrichment services based on level and category
    const servicesToUse = this.determineEnrichmentServices(category, enrichmentLevel);
    stats.servicesUsed = servicesToUse;
    
    // Process each candidate
    for (const candidate of candidates) {
      try {
        const enrichedCandidate = await this.enrichSingleCandidate(
          candidate, 
          category, 
          servicesToUse, 
          userContext, 
          travelDates, 
          location
        );
        
        // Calculate enrichment score
        const enrichmentScore = this.calculateEnrichmentScore(enrichedCandidate, servicesToUse);
        enrichedCandidate.enrichmentScore = enrichmentScore;
        enrichedCandidate.enrichedAt = Date.now();
        enrichedCandidate.enrichmentLevel = enrichmentLevel;
        enrichedCandidate.servicesUsed = servicesToUse;
        
        enrichedCandidates.push(enrichedCandidate);
        
        stats.enrichedCount++;
        stats.totalEnrichmentScore += enrichmentScore;
        
        // Track cache usage
        if (enrichedCandidate._cacheStats) {
          stats.cacheHits += enrichedCandidate._cacheStats.hits || 0;
          stats.cacheMisses += enrichedCandidate._cacheStats.misses || 0;
          delete enrichedCandidate._cacheStats; // Clean up
        }
        
      } catch (error) {
        logger.error(`Error enriching candidate ${candidate.id}:`, error);
        stats.errors.push(`Candidate ${candidate.id}: ${error.message}`);
        
        // Add candidate with minimal enrichment
        const minimalEnriched = {
          ...candidate,
          enrichmentScore: 0.1,
          enrichedAt: Date.now(),
          enrichmentLevel: 'minimal',
          enrichmentError: error.message
        };
        
        enrichedCandidates.push(minimalEnriched);
      }
    }
    
    return {
      category,
      enrichedCandidates,
      stats
    };
  }

  determineEnrichmentServices(category, enrichmentLevel) {
    const baseServices = this.enrichmentRules.required;
    let additionalServices = [];
    
    switch (enrichmentLevel) {
      case 'minimal':
        additionalServices = [];
        break;
        
      case 'standard':
        additionalServices = ['weather', 'reviews', 'maps'];
        break;
        
      case 'premium':
        additionalServices = ['weather', 'reviews', 'maps', 'images', 'social'];
        break;
        
      case 'comprehensive':
        additionalServices = this.enrichmentRules.optional;
        break;
        
      default:
        additionalServices = ['weather', 'reviews'];
    }
    
    // Category-specific service adjustments
    if (category === 'hotels') {
      additionalServices.push('images', 'reviews');
    } else if (category === 'flights') {
      additionalServices = additionalServices.filter(s => s !== 'images');
      additionalServices.push('weather');
    } else if (category === 'activities') {
      additionalServices.push('weather', 'social');
    } else if (category === 'restaurants') {
      additionalServices.push('reviews', 'social');
    } else if (category === 'cars') {
      additionalServices = additionalServices.filter(s => !['images', 'social'].includes(s));
    }
    
    return [...new Set([...baseServices, ...additionalServices])]
      .filter(service => this.enrichmentServices[service]?.enabled);
  }

  async enrichSingleCandidate(candidate, category, servicesToUse, userContext, travelDates, location) {
    const enrichedCandidate = { ...candidate };
    const cacheStats = { hits: 0, misses: 0 };
    
    // Enrich with each service
    const enrichmentPromises = servicesToUse.map(async (service) => {
      try {
        const serviceStartTime = Date.now();
        const enrichmentData = await this.callEnrichmentService(
          service, 
          candidate, 
          category, 
          userContext, 
          travelDates, 
          location
        );
        
        const serviceTime = Date.now() - serviceStartTime;
        
        // Update service statistics
        const serviceStats = this.enrichmentStats.serviceStats[service];
        serviceStats.requests++;
        
        if (enrichmentData) {
          serviceStats.successes++;
          serviceStats.avgTime = (serviceStats.avgTime * (serviceStats.successes - 1) + serviceTime) / serviceStats.successes;
          
          // Apply enrichment data
          this.applyEnrichmentData(enrichedCandidate, service, enrichmentData);
          
          if (enrichmentData._fromCache) {
            cacheStats.hits++;
          } else {
            cacheStats.misses++;
          }
        } else {
          serviceStats.failures++;
        }
        
      } catch (error) {
        logger.error(`Enrichment service ${service} failed for candidate ${candidate.id}:`, error);
        this.enrichmentStats.serviceStats[service].failures++;
      }
    });
    
    // Wait for all enrichment services to complete
    await Promise.allSettled(enrichmentPromises);
    
    enrichedCandidate._cacheStats = cacheStats;
    
    return enrichedCandidate;
  }

  async callEnrichmentService(service, candidate, category, userContext, travelDates, location) {
    const serviceConfig = this.enrichmentServices[service];
    
    if (!serviceConfig.enabled) {
      return null;
    }
    
    // Generate cache key
    const cacheKey = this.generateServiceCacheKey(service, candidate, category, travelDates, location);
    
    // Check cache first
    const cachedData = serviceConfig.cache.get(cacheKey);
    if (cachedData && Date.now() - cachedData.timestamp < serviceConfig.cacheTimeout) {
      return { ...cachedData.data, _fromCache: true };
    }
    
    // Call service with timeout
    try {
      const enrichmentData = await Promise.race([
        this.performServiceEnrichment(service, candidate, category, userContext, travelDates, location),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error(`Service ${service} timeout`)), serviceConfig.timeout)
        )
      ]);
      
      // Cache the result
      if (enrichmentData) {
        serviceConfig.cache.set(cacheKey, {
          data: enrichmentData,
          timestamp: Date.now()
        });
      }
      
      return enrichmentData;
      
    } catch (error) {
      logger.error(`Service ${service} failed:`, error);
      return null;
    }
  }

  async performServiceEnrichment(service, candidate, category, userContext, travelDates, location) {
    // Mock service implementations - in production these would call real APIs
    
    switch (service) {
      case 'weather':
        return await this.enrichWithWeather(candidate, travelDates, location);
        
      case 'maps':
        return await this.enrichWithMaps(candidate, location);
        
      case 'reviews':
        return await this.enrichWithReviews(candidate, category);
        
      case 'images':
        return await this.enrichWithImages(candidate, category);
        
      case 'pricing':
        return await this.enrichWithPricing(candidate, category, travelDates);
        
      case 'availability':
        return await this.enrichWithAvailability(candidate, category, travelDates);
        
      case 'social':
        return await this.enrichWithSocial(candidate, category);
        
      case 'sustainability':
        return await this.enrichWithSustainability(candidate, category);
        
      default:
        return null;
    }
  }

  async enrichWithWeather(candidate, travelDates, location) {
    // Mock weather enrichment
    await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));
    
    const weatherData = {
      forecast: {
        temperature: {
          min: 15 + Math.random() * 20,
          max: 25 + Math.random() * 15,
          unit: 'celsius'
        },
        conditions: ['sunny', 'partly-cloudy', 'cloudy', 'rainy'][Math.floor(Math.random() * 4)],
        humidity: 40 + Math.random() * 40,
        windSpeed: Math.random() * 20,
        precipitation: Math.random() * 10
      },
      alerts: [],
      seasonality: {
        season: this.determineSeason(travelDates.start),
        touristSeason: ['low', 'medium', 'high'][Math.floor(Math.random() * 3)]
      }
    };
    
    // Add weather-based recommendations
    if (weatherData.forecast.conditions === 'rainy') {
      weatherData.recommendations = ['Pack umbrella', 'Consider indoor activities'];
    } else if (weatherData.forecast.temperature.max > 30) {
      weatherData.recommendations = ['Stay hydrated', 'Seek shade during midday'];
    }
    
    return weatherData;
  }

  async enrichWithMaps(candidate, location) {
    // Mock maps and location enrichment
    await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 150));
    
    return {
      coordinates: {
        latitude: candidate.latitude || (40.7128 + (Math.random() - 0.5) * 0.1),
        longitude: candidate.longitude || (-74.0060 + (Math.random() - 0.5) * 0.1)
      },
      address: {
        formatted: candidate.address || '123 Example St, City, Country',
        components: {
          street: '123 Example St',
          city: 'City',
          country: 'Country',
          postalCode: '12345'
        }
      },
      nearbyPOIs: [
        { name: 'Central Park', distance: Math.random() * 2000, type: 'park' },
        { name: 'Museum', distance: Math.random() * 1500, type: 'culture' },
        { name: 'Restaurant District', distance: Math.random() * 800, type: 'dining' }
      ],
      transportation: {
        nearestSubway: { name: 'Metro Station', distance: Math.random() * 500 },
        nearestBusStop: { name: 'Bus Stop', distance: Math.random() * 200 },
        walkingScore: Math.floor(Math.random() * 100),
        transitScore: Math.floor(Math.random() * 100)
      },
      accessibility: {
        wheelchairAccessible: Math.random() > 0.3,
        elevatorAccess: Math.random() > 0.4,
        parkingAvailable: Math.random() > 0.5
      }
    };
  }

  async enrichWithReviews(candidate, category) {
    // Mock reviews enrichment
    await new Promise(resolve => setTimeout(resolve, 150 + Math.random() * 250));
    
    const reviewCount = Math.floor(Math.random() * 500) + 10;
    const avgRating = 3 + Math.random() * 2;
    
    return {
      aggregatedRating: {
        average: avgRating,
        count: reviewCount,
        distribution: {
          5: Math.floor(reviewCount * 0.4),
          4: Math.floor(reviewCount * 0.3),
          3: Math.floor(reviewCount * 0.2),
          2: Math.floor(reviewCount * 0.08),
          1: Math.floor(reviewCount * 0.02)
        }
      },
      recentReviews: [
        {
          rating: Math.floor(Math.random() * 5) + 1,
          text: 'Great experience, highly recommended!',
          author: 'Anonymous User',
          date: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
          verified: Math.random() > 0.3
        },
        {
          rating: Math.floor(Math.random() * 5) + 1,
          text: 'Good value for money, clean and comfortable.',
          author: 'Travel Expert',
          date: new Date(Date.now() - Math.random() * 60 * 24 * 60 * 60 * 1000).toISOString(),
          verified: Math.random() > 0.3
        }
      ],
      sentiment: {
        positive: 0.6 + Math.random() * 0.3,
        neutral: 0.1 + Math.random() * 0.2,
        negative: 0.05 + Math.random() * 0.15
      },
      keywords: ['clean', 'comfortable', 'friendly staff', 'good location', 'value for money'],
      trustScore: Math.random() * 0.3 + 0.7
    };
  }

  async enrichWithImages(candidate, category) {
    // Mock image enrichment
    await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 400));
    
    const imageCount = Math.floor(Math.random() * 10) + 3;
    const images = [];
    
    for (let i = 0; i < imageCount; i++) {
      images.push({
        url: `https://example.com/images/${category}/${candidate.id}/${i}.jpg`,
        thumbnail: `https://example.com/images/${category}/${candidate.id}/${i}_thumb.jpg`,
        caption: `${category} image ${i + 1}`,
        type: ['exterior', 'interior', 'amenity', 'view'][Math.floor(Math.random() * 4)],
        quality: Math.random() * 0.3 + 0.7,
        license: {
          type: 'commercial',
          valid: true,
          attribution: 'Provider Images'
        }
      });
    }
    
    return {
      images,
      imageAnalysis: {
        totalImages: imageCount,
        qualityScore: Math.random() * 0.3 + 0.7,
        diversityScore: Math.random() * 0.4 + 0.6,
        professionalPhotos: Math.floor(imageCount * (0.5 + Math.random() * 0.4)),
        userPhotos: Math.floor(imageCount * (0.1 + Math.random() * 0.3))
      },
      virtualTour: {
        available: Math.random() > 0.7,
        url: Math.random() > 0.7 ? `https://example.com/tours/${candidate.id}` : null
      }
    };
  }

  async enrichWithPricing(candidate, category, travelDates) {
    // Mock dynamic pricing enrichment
    await new Promise(resolve => setTimeout(resolve, 80 + Math.random() * 120));
    
    const basePrice = candidate.price || 100;
    const priceVariation = 0.8 + Math.random() * 0.4; // Â±20% variation
    
    return {
      dynamicPricing: {
        current: basePrice * priceVariation,
        base: basePrice,
        currency: 'USD',
        lastUpdated: Date.now()
      },
      priceHistory: {
        last7Days: Array.from({ length: 7 }, (_, i) => ({
          date: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          price: basePrice * (0.9 + Math.random() * 0.2)
        })),
        trend: ['increasing', 'decreasing', 'stable'][Math.floor(Math.random() * 3)]
      },
      priceBreakdown: {
        base: basePrice * 0.8,
        taxes: basePrice * 0.15,
        fees: basePrice * 0.05
      },
      discounts: {
        available: Math.random() > 0.6,
        amount: Math.random() > 0.6 ? Math.floor(basePrice * 0.1) : 0,
        type: 'early-booking',
        validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      },
      priceAlerts: {
        enabled: true,
        threshold: basePrice * 0.9
      }
    };
  }

  async enrichWithAvailability(candidate, category, travelDates) {
    // Mock availability enrichment
    await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));
    
    const isAvailable = Math.random() > 0.1; // 90% availability rate
    
    return {
      availability: {
        status: isAvailable ? 'available' : 'limited',
        confirmed: Math.random() > 0.2,
        lastChecked: Date.now(),
        remainingInventory: isAvailable ? Math.floor(Math.random() * 20) + 1 : 0
      },
      bookingWindow: {
        minAdvanceBooking: Math.floor(Math.random() * 3), // days
        maxAdvanceBooking: 365,
        instantBooking: Math.random() > 0.4,
        cancellationPolicy: {
          type: ['flexible', 'moderate', 'strict'][Math.floor(Math.random() * 3)],
          freeUntil: Math.floor(Math.random() * 7) + 1 // days before
        }
      },
      demandIndicators: {
        popularityScore: Math.random(),
        bookingVelocity: Math.random() * 10,
        competitorAvailability: Math.random() > 0.3 ? 'high' : 'low'
      },
      alternatives: isAvailable ? [] : [
        {
          id: `alt-${candidate.id}-1`,
          name: `Alternative to ${candidate.name}`,
          similarity: 0.8 + Math.random() * 0.2,
          available: true
        }
      ]
    };
  }

  async enrichWithSocial(candidate, category) {
    // Mock social media insights
    await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 300));
    
    return {
      socialMetrics: {
        mentions: Math.floor(Math.random() * 1000),
        sentiment: {
          positive: 0.5 + Math.random() * 0.4,
          neutral: 0.2 + Math.random() * 0.3,
          negative: 0.05 + Math.random() * 0.2
        },
        trending: Math.random() > 0.8,
        influencerMentions: Math.floor(Math.random() * 10)
      },
      socialProof: {
        checkIns: Math.floor(Math.random() * 500),
        photos: Math.floor(Math.random() * 200),
        recommendations: Math.floor(Math.random() * 50),
        shares: Math.floor(Math.random() * 100)
      },
      trendingHashtags: [
        `#${category}`,
        '#travel',
        '#vacation',
        '#wanderlust'
      ],
      userGeneratedContent: {
        available: Math.random() > 0.4,
        quality: Math.random() * 0.4 + 0.6,
        quantity: Math.floor(Math.random() * 50)
      }
    };
  }

  async enrichWithSustainability(candidate, category) {
    // Mock sustainability metrics
    await new Promise(resolve => setTimeout(resolve, 150 + Math.random() * 200));
    
    return {
      sustainabilityScore: {
        overall: Math.random() * 0.4 + 0.6,
        environmental: Math.random() * 0.5 + 0.5,
        social: Math.random() * 0.4 + 0.6,
        economic: Math.random() * 0.3 + 0.7
      },
      certifications: [
        {
          name: 'Green Tourism',
          level: 'Gold',
          validUntil: '2024-12-31',
          verified: true
        },
        {
          name: 'Sustainable Travel',
          level: 'Silver',
          validUntil: '2024-06-30',
          verified: true
        }
      ],
      initiatives: [
        'Renewable energy usage',
        'Waste reduction program',
        'Local community support',
        'Water conservation'
      ],
      carbonFootprint: {
        estimated: Math.random() * 50 + 10, // kg CO2
        offsetAvailable: Math.random() > 0.3,
        offsetCost: Math.random() * 20 + 5
      },
      localImpact: {
        localEmployment: Math.random() * 0.4 + 0.6,
        communityBenefit: Math.random() * 0.3 + 0.7,
        culturalPreservation: Math.random() * 0.5 + 0.5
      }
    };
  }

  applyEnrichmentData(candidate, service, enrichmentData) {
    if (!enrichmentData) return;
    
    // Initialize enrichment object if it doesn't exist
    if (!candidate.enrichment) {
      candidate.enrichment = {};
    }
    
    // Apply service-specific enrichment
    candidate.enrichment[service] = enrichmentData;
    
    // Update candidate fields based on enrichment
    switch (service) {
      case 'pricing':
        if (enrichmentData.dynamicPricing) {
          candidate.currentPrice = enrichmentData.dynamicPricing.current;
          candidate.priceLastUpdated = enrichmentData.dynamicPricing.lastUpdated;
        }
        break;
        
      case 'availability':
        if (enrichmentData.availability) {
          candidate.availabilityStatus = enrichmentData.availability.status;
          candidate.availabilityConfirmed = enrichmentData.availability.confirmed;
        }
        break;
        
      case 'reviews':
        if (enrichmentData.aggregatedRating) {
          candidate.enrichedRating = enrichmentData.aggregatedRating.average;
          candidate.enrichedReviewCount = enrichmentData.aggregatedRating.count;
        }
        break;
        
      case 'maps':
        if (enrichmentData.coordinates) {
          candidate.coordinates = enrichmentData.coordinates;
        }
        if (enrichmentData.walkingScore) {
          candidate.walkingScore = enrichmentData.transportation.walkingScore;
        }
        break;
        
      case 'sustainability':
        if (enrichmentData.sustainabilityScore) {
          candidate.sustainabilityScore = enrichmentData.sustainabilityScore.overall;
        }
        break;
    }
  }

  calculateEnrichmentScore(candidate, servicesToUse) {
    let score = 0;
    let maxScore = 0;
    
    servicesToUse.forEach(service => {
      maxScore += 1;
      
      if (candidate.enrichment && candidate.enrichment[service]) {
        // Service-specific scoring
        switch (service) {
          case 'pricing':
            score += candidate.enrichment[service].dynamicPricing ? 1 : 0.5;
            break;
            
          case 'availability':
            score += candidate.enrichment[service].availability?.confirmed ? 1 : 0.7;
            break;
            
          case 'reviews':
            const reviewData = candidate.enrichment[service];
            score += reviewData.aggregatedRating?.count > 10 ? 1 : 0.6;
            break;
            
          case 'weather':
            score += candidate.enrichment[service].forecast ? 1 : 0.5;
            break;
            
          case 'maps':
            const mapData = candidate.enrichment[service];
            score += mapData.coordinates && mapData.nearbyPOIs ? 1 : 0.7;
            break;
            
          case 'images':
            const imageData = candidate.enrichment[service];
            score += imageData.images?.length > 3 ? 1 : 0.6;
            break;
            
          case 'social':
            const socialData = candidate.enrichment[service];
            score += socialData.socialMetrics?.mentions > 50 ? 1 : 0.5;
            break;
            
          case 'sustainability':
            const sustainData = candidate.enrichment[service];
            score += sustainData.sustainabilityScore?.overall > 0.7 ? 1 : 0.6;
            break;
            
          default:
            score += 0.8;
        }
      }
    });
    
    return maxScore > 0 ? score / maxScore : 0;
  }

  async applyPostEnrichmentProcessing(enrichmentResults, userContext, travelDates) {
    // Cross-reference enrichment data
    await this.crossReferenceEnrichmentData(enrichmentResults);
    
    // Apply user context to enrichment
    await this.applyUserContextToEnrichment(enrichmentResults, userContext);
    
    // Generate enrichment insights
    await this.generateEnrichmentInsights(enrichmentResults, travelDates);
  }

  async crossReferenceEnrichmentData(enrichmentResults) {
    // Cross-reference weather data with activities
    Object.values(enrichmentResults.results).forEach(categoryItems => {
      categoryItems.forEach(candidate => {
        if (candidate.enrichment?.weather && candidate.enrichment?.maps) {
          // Add weather-location insights
          const weather = candidate.enrichment.weather;
          const location = candidate.enrichment.maps;
          
          candidate.enrichment.insights = candidate.enrichment.insights || {};
          candidate.enrichment.insights.weatherLocation = {
            suitableForOutdoorActivities: weather.forecast.conditions !== 'rainy' && weather.forecast.temperature.max > 15,
            walkingConditions: weather.forecast.conditions === 'sunny' ? 'excellent' : 'good',
            transportationRecommendation: weather.forecast.conditions === 'rainy' ? 'indoor_transport' : 'any'
          };
        }
      });
    });
  }

  async applyUserContextToEnrichment(enrichmentResults, userContext) {
    // Apply user preferences to enrichment data
    if (userContext.preferences) {
      Object.values(enrichmentResults.results).forEach(categoryItems => {
        categoryItems.forEach(candidate => {
          candidate.enrichment = candidate.enrichment || {};
          candidate.enrichment.userContext = {
            relevanceScore: this.calculateUserRelevance(candidate, userContext.preferences),
            personalizedRecommendations: this.generatePersonalizedRecommendations(candidate, userContext.preferences)
          };
        });
      });
    }
  }

  calculateUserRelevance(candidate, preferences) {
    let relevanceScore = 0.5; // Base score
    
    // Budget relevance
    if (preferences.budget && candidate.currentPrice) {
      const budgetMatch = this.matchesBudgetPreference(candidate.currentPrice, preferences.budget);
      relevanceScore += budgetMatch * 0.3;
    }
    
    // Sustainability relevance
    if (preferences.sustainability && candidate.sustainabilityScore) {
      relevanceScore += candidate.sustainabilityScore * 0.2;
    }
    
    // Activity preferences
    if (preferences.activities && candidate.enrichment?.maps?.nearbyPOIs) {
      const matchingPOIs = candidate.enrichment.maps.nearbyPOIs.filter(poi => 
        preferences.activities.some(activity => poi.type.includes(activity))
      ).length;
      
      relevanceScore += (matchingPOIs / Math.max(preferences.activities.length, 1)) * 0.2;
    }
    
    return Math.max(0, Math.min(1, relevanceScore));
  }

  generatePersonalizedRecommendations(candidate, preferences) {
    const recommendations = [];
    
    // Weather-based recommendations
    if (candidate.enrichment?.weather) {
      const weather = candidate.enrichment.weather;
      if (weather.forecast.conditions === 'rainy') {
        recommendations.push('Consider indoor activities due to expected rain');
      } else if (weather.forecast.temperature.max > 25) {
        recommendations.push('Perfect weather for outdoor activities');
      }
    }
    
    // Budget-based recommendations
    if (candidate.enrichment?.pricing?.discounts?.available) {
      recommendations.push('Early booking discount available - book soon to save!');
    }
    
    // Sustainability recommendations
    if (preferences.sustainability && candidate.enrichment?.sustainability) {
      const sustainScore = candidate.enrichment.sustainability.sustainabilityScore?.overall;
      if (sustainScore > 0.8) {
        recommendations.push('Excellent sustainability rating - aligns with your eco-friendly preferences');
      }
    }
    
    return recommendations;
  }

  async generateEnrichmentInsights(enrichmentResults, travelDates) {
    // Generate overall insights based on enriched data
    const insights = {
      weatherInsights: [],
      pricingInsights: [],
      availabilityInsights: [],
      qualityInsights: [],
      sustainabilityInsights: []
    };
    
    // Analyze weather patterns
    const weatherData = [];
    Object.values(enrichmentResults.results).forEach(categoryItems => {
      categoryItems.forEach(candidate => {
        if (candidate.enrichment?.weather) {
          weatherData.push(candidate.enrichment.weather);
        }
      });
    });
    
    if (weatherData.length > 0) {
      const avgTemp = weatherData.reduce((sum, w) => sum + w.forecast.temperature.max, 0) / weatherData.length;
      const rainyDays = weatherData.filter(w => w.forecast.conditions === 'rainy').length;
      
      if (avgTemp > 25) {
        insights.weatherInsights.push('Expect warm weather - perfect for outdoor activities');
      }
      
      if (rainyDays > weatherData.length * 0.3) {
        insights.weatherInsights.push('Some rainy weather expected - consider indoor alternatives');
      }
    }
    
    enrichmentResults.insights = insights;
  }

  generateServiceCacheKey(service, candidate, category, travelDates, location) {
    const keyData = {
      service,
      candidateId: candidate.id,
      category,
      travelStart: travelDates.start,
      locationKey: location.city || location.country || 'unknown'
    };
    
    return `${service}-${Buffer.from(JSON.stringify(keyData)).toString('base64').slice(0, 32)}`;
  }

    updateCategoryEnrichmentStats(category, stats) {
    const forbidden = new Set(['__proto__','prototype','constructor']);
    if (typeof category !== 'string' || forbidden.has(category)) return;
    if (!Object.prototype.hasOwnProperty.call(this.enrichmentStats.categoryStats, category)) return;
    const categoryStats = this.enrichmentStats.categoryStats[category];
    const totalEnriched = categoryStats.enriched + stats.enrichedCount;
    if (totalEnriched > 0) {
      categoryStats.avgEnrichmentScore = (categoryStats.avgEnrichmentScore * categoryStats.enriched + stats.totalEnrichmentScore) / totalEnriched;
    }
    categoryStats.enriched = totalEnriched;
  }
      
      categoryStats.enriched = totalEnriched;
    }
  }

  determineSeason(dateString) {
    const date = new Date(dateString);
    const month = date.getMonth() + 1; // 1-12
    
    if (month >= 3 && month <= 5) return 'spring';
    if (month >= 6 && month <= 8) return 'summer';
    if (month >= 9 && month <= 11) return 'autumn';
    return 'winter';
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

  clearExpiredCaches() {
    const now = Date.now();
    
    Object.values(this.enrichmentServices).forEach(service => {
      for (const [key, entry] of service.cache) {
        if (now - entry.timestamp > service.cacheTimeout) {
          service.cache.delete(key);
        }
      }
    });
  }

  updateEnrichmentStatistics() {
    logger.info('Enrichment statistics update', {
      totalEnrichments: this.enrichmentStats.totalEnrichments,
      averageEnrichmentTime: this.enrichmentStats.averageEnrichmentTime,
      cacheHitRate: this.enrichmentStats.cacheStats.hitRate,
      serviceStats: Object.keys(this.enrichmentStats.serviceStats).reduce((acc, service) => {
        const stats = this.enrichmentStats.serviceStats[service];
        acc[service] = {
          successRate: stats.requests > 0 ? (stats.successes / stats.requests).toFixed(3) : 0,
          avgTime: stats.avgTime.toFixed(0)
        };
        return acc;
      }, {})
    });
  }

  resetRateLimitCounters() {
    Object.values(this.externalServices).forEach(service => {
      service.currentUsage = 0;
    });
    
    logger.info('Rate limit counters reset');
  }

  // Event handlers
  async handleEnrichSingleCandidate(event) {
    const { sagaId, candidate, category, enrichmentLevel, userContext, travelDates, location } = event.data;
    
    try {
      const servicesToUse = this.determineEnrichmentServices(category, enrichmentLevel || 'standard');
      
      const enrichedCandidate = await this.enrichSingleCandidate(
        candidate, 
        category, 
        servicesToUse, 
        userContext || {}, 
        travelDates || {}, 
        location || {}
      );
      
      const enrichmentScore = this.calculateEnrichmentScore(enrichedCandidate, servicesToUse);
      enrichedCandidate.enrichmentScore = enrichmentScore;
      enrichedCandidate.enrichedAt = Date.now();
      
      await this.publish('single-candidate-enriched', {
        sagaId,
        enrichedCandidate,
        enrichmentScore,
        servicesUsed: servicesToUse,
        timestamp: Date.now()
      });
      
    } catch (error) {
      logger.error('Error enriching single candidate:', error);
      
      await this.publish('single-candidate-enrichment-failed', {
        sagaId,
        candidateId: candidate.id,
        error: error.message,
        timestamp: Date.now()
      });
    }
  }

  async handleUpdateEnrichmentData(event) {
    const { service, updates, reason } = event.data;
    
    try {
      if (this.enrichmentServices[service]) {
        // Clear cache for the service
        this.enrichmentServices[service].cache.clear();
        
        // Update service configuration
        this.enrichmentServices[service] = {
          ...this.enrichmentServices[service],
          ...updates
        };
        
        logger.info(`Enrichment service ${service} updated`, { reason });
        
        await this.publish('enrichment-service-updated', {
          service,
          updates,
          reason,
          timestamp: Date.now()
        });
      }
      
    } catch (error) {
      logger.error('Error updating enrichment data:', error);
    }
  }

  async handleRefreshExternalData(event) {
    const { services = [], force = false } = event.data;
    
    try {
      const servicesToRefresh = services.length > 0 ? services : Object.keys(this.enrichmentServices);
      
      servicesToRefresh.forEach(service => {
        if (this.enrichmentServices[service]) {
          if (force) {
            // Clear all cache
            this.enrichmentServices[service].cache.clear();
          } else {
            // Clear only expired cache
            this.clearExpiredCaches();
          }
        }
      });
      
      logger.info(`External data refreshed for services: ${servicesToRefresh.join(', ')}`);
      
      await this.publish('external-data-refreshed', {
        services: servicesToRefresh,
        force,
        timestamp: Date.now()
      });
      
    } catch (error) {
      logger.error('Error refreshing external data:', error);
    }
  }

  async handleValidateEnrichment(event) {
    const { sagaId, enrichedCandidates, validationCriteria } = event.data;
    
    try {
      const validation = {
        isValid: true,
        warnings: [],
        errors: [],
        statistics: {
          totalCandidates: 0,
          validCandidates: 0,
          averageEnrichmentScore: 0,
          missingEnrichments: []
        }
      };
      
      let totalScore = 0;
      let validCount = 0;
      
      Object.values(enrichedCandidates.results).forEach(categoryItems => {
        categoryItems.forEach(candidate => {
          validation.statistics.totalCandidates++;
          
          const enrichmentScore = candidate.enrichmentScore || 0;
          totalScore += enrichmentScore;
          
          if (enrichmentScore >= (validationCriteria.minEnrichmentScore || 0.6)) {
            validCount++;
          } else {
            validation.warnings.push(`Candidate ${candidate.id} has low enrichment score: ${enrichmentScore.toFixed(3)}`);
          }
          
          // Check required enrichments
          const requiredServices = validationCriteria.requiredServices || this.enrichmentRules.required;
          const missingServices = requiredServices.filter(service => 
            !candidate.enrichment || !candidate.enrichment[service]
          );
          
          if (missingServices.length > 0) {
            validation.errors.push(`Candidate ${candidate.id} missing required enrichments: ${missingServices.join(', ')}`);
            validation.isValid = false;
          }
        });
      });
      
      validation.statistics.validCandidates = validCount;
      validation.statistics.averageEnrichmentScore = 
        validation.statistics.totalCandidates > 0 ? totalScore / validation.statistics.totalCandidates : 0;
      
      await this.publish('enrichment-validated', {
        sagaId,
        validation,
        timestamp: Date.now()
      });
      
    } catch (error) {
      logger.error('Error validating enrichment:', error);
      
      await this.publish('enrichment-validation-failed', {
        sagaId,
        error: error.message,
        timestamp: Date.now()
      });
    }
  }

  // Query methods
  getEnrichmentStats() {
    return {
      ...this.enrichmentStats,
      serviceConfigs: Object.keys(this.enrichmentServices).reduce((acc, service) => {
        acc[service] = {
          enabled: this.enrichmentServices[service].enabled,
          cacheSize: this.enrichmentServices[service].cache.size,
          timeout: this.enrichmentServices[service].timeout
        };
        return acc;
      }, {})
    };
  }

  getEnrichmentServices() {
    return Object.keys(this.enrichmentServices).reduce((acc, service) => {
      acc[service] = {
        name: this.enrichmentServices[service].name,
        enabled: this.enrichmentServices[service].enabled,
        cacheSize: this.enrichmentServices[service].cache.size
      };
      return acc;
    }, {});
  }

  getEnrichmentRules() {
    return { ...this.enrichmentRules };
  }

  updateEnrichmentRules(newRules) {
    this.enrichmentRules = {
      ...this.enrichmentRules,
      ...newRules
    };
    
    logger.info('Enrichment rules updated');
  }

  getCacheStatistics() {
    return Object.keys(this.enrichmentServices).reduce((acc, service) => {
      acc[service] = {
        size: this.enrichmentServices[service].cache.size,
        timeout: this.enrichmentServices[service].cacheTimeout
      };
      return acc;
    }, {});
  }

  async shutdown() {
    logger.info('Shutting down Enrichment swarm');
    
    // Clear all caches
    Object.values(this.enrichmentServices).forEach(service => {
      service.cache.clear();
    });
    
    await super.shutdown();
  }
}