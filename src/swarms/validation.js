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

export class ValidationSwarm extends BaseHolon {
  constructor(orchestration) {
    super('ValidationSwarm', orchestration);
    this.config = getConfig();
    
    // Validation rules and thresholds
    this.validationRules = {
      pricing: {
        maxDriftPercent: 5,
        minPrice: {
          hotel: 20,
          flight: 50,
          activity: 5,
          restaurant: 10,
          car: 15
        },
        maxPrice: {
          hotel: 2000,
          flight: 5000,
          activity: 500,
          restaurant: 200,
          car: 300
        }
      },
      quality: {
        minRating: 2.0,
        minReviewCount: 5,
        requiredFields: {
          hotel: ['name', 'location', 'price', 'rating'],
          flight: ['airline', 'departure', 'arrival', 'price'],
          activity: ['name', 'location', 'price', 'duration'],
          restaurant: ['name', 'location', 'cuisine', 'priceRange'],
          car: ['brand', 'model', 'type', 'price']
        }
      },
      availability: {
        maxResponseTime: 5000, // 5 seconds
        minAvailabilityWindow: 24 // hours
      },
      compliance: {
        requiredLicenses: ['images', 'content'],
        gdprCompliant: true,
        accessibilityRequired: false
      }
    };
    
    // Validation statistics
    this.validationStats = {
      total: 0,
      passed: 0,
      failed: 0,
      byCategory: {
        hotels: { total: 0, passed: 0, failed: 0 },
        flights: { total: 0, passed: 0, failed: 0 },
        activities: { total: 0, passed: 0, failed: 0 },
        restaurants: { total: 0, passed: 0, failed: 0 },
        cars: { total: 0, passed: 0, failed: 0 }
      },
      byRule: {
        pricing: { passed: 0, failed: 0 },
        quality: { passed: 0, failed: 0 },
        availability: { passed: 0, failed: 0 },
        compliance: { passed: 0, failed: 0 }
      }
    };
    
    // Validation cache for expensive checks
    this.validationCache = new Map();
    this.cacheTimeout = 600000; // 10 minutes
    
    // External validation services (mock)
    this.externalValidators = {
      pricing: 'PriceValidationAPI',
      availability: 'AvailabilityAPI',
      compliance: 'ComplianceAPI'
    };
  }

  async initialize() {
    await super.initialize();
    
    // Subscribe to validation events
    this.subscribe('validate-candidates', this.handleValidateCandidates.bind(this));
    this.subscribe('validate-pricing', this.handleValidatePricing.bind(this));
    this.subscribe('validate-availability', this.handleValidateAvailability.bind(this));
    this.subscribe('validate-compliance', this.handleValidateCompliance.bind(this));
    this.subscribe('external-validation-response', this.handleExternalValidationResponse.bind(this));
    
    // Start validation maintenance
    this.startValidationMaintenance();
    
    logger.info('Validation swarm initialized');
  }

  startValidationMaintenance() {
    // Clear expired cache entries every 5 minutes
    setInterval(() => {
      this.clearExpiredCache();
    }, 300000);
    
    // Reset validation statistics every hour
    setInterval(() => {
      this.resetValidationStats();
    }, 3600000);
  }

  async handleValidateCandidates(event) {
    const { sagaId, candidates, validationLevel = 'standard' } = event.data;
    
    try {
      logger.info(`Starting validation for saga ${sagaId} with level: ${validationLevel}`);
      
      const validationStartTime = Date.now();
      const validationResults = {
        sagaId,
        validationLevel,
        startTime: validationStartTime,
        results: {
          hotels: [],
          flights: [],
          activities: [],
          restaurants: [],
          cars: []
        },
        summary: {
          totalCandidates: 0,
          validCandidates: 0,
          invalidCandidates: 0,
          validationErrors: []
        }
      };
      
      // Validate each category in parallel
      const validationPromises = [];
      
      Object.keys(candidates).forEach(category => {
        if (candidates[category] && candidates[category].length > 0) {
          validationPromises.push(
            this.validateCategoryBatch(category, candidates[category], validationLevel)
          );
        }
      });
      
      // Wait for all validations to complete
      const categoryResults = await Promise.allSettled(validationPromises);
      
      // Process results
      categoryResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          const { category, validatedCandidates, stats } = result.value;
          validationResults.results[category] = validatedCandidates;
          
          validationResults.summary.totalCandidates += stats.total;
          validationResults.summary.validCandidates += stats.valid;
          validationResults.summary.invalidCandidates += stats.invalid;
          
          // Update global stats
          this.updateValidationStats(category, stats);
          
        } else {
          validationResults.summary.validationErrors.push(result.reason.message);
          logger.error('Category validation failed:', result.reason);
        }
      });
      
      validationResults.endTime = Date.now();
      validationResults.duration = validationResults.endTime - validationStartTime;
      
      // Publish validation results
      await this.publish('candidates-validated', validationResults);
      
      logger.info(`Validation completed for saga ${sagaId}`, {
        totalCandidates: validationResults.summary.totalCandidates,
        validCandidates: validationResults.summary.validCandidates,
        duration: validationResults.duration
      });
      
    } catch (error) {
      logger.error('Error in candidate validation:', error);
      
      await this.publish('validation-failed', {
        sagaId,
        error: error.message,
        timestamp: Date.now()
      });
    }
  }

  async validateCategoryBatch(category, candidates, validationLevel) {
    const validatedCandidates = [];
    const stats = { total: candidates.length, valid: 0, invalid: 0 };
    
    // Process candidates in batches to avoid overwhelming external services
    const batchSize = 10;
    const batches = [];
    
    for (let i = 0; i < candidates.length; i += batchSize) {
      batches.push(candidates.slice(i, i + batchSize));
    }
    
    for (const batch of batches) {
      const batchPromises = batch.map(candidate => 
        this.validateSingleCandidate(candidate, category, validationLevel)
      );
      
      const batchResults = await Promise.allSettled(batchPromises);
      
      batchResults.forEach(result => {
        if (result.status === 'fulfilled') {
          const validatedCandidate = result.value;
          
          if (validatedCandidate.isValid) {
            validatedCandidates.push(validatedCandidate);
            stats.valid++;
          } else {
            stats.invalid++;
          }
        } else {
          stats.invalid++;
          logger.error('Candidate validation failed:', result.reason);
        }
      });
      
      // Small delay between batches to be respectful to external services
      if (batches.indexOf(batch) < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    return {
      category,
      validatedCandidates,
      stats
    };
  }

  async validateSingleCandidate(candidate, category, validationLevel) {
    const validationResult = {
      ...candidate,
      isValid: true,
      validationScore: 1.0,
      validationErrors: [],
      validationWarnings: [],
      validatedAt: Date.now(),
      validationLevel
    };
    
    try {
      // Check cache first
      const cacheKey = this.generateValidationCacheKey(candidate, validationLevel);
      const cachedResult = this.validationCache.get(cacheKey);
      
      if (cachedResult && Date.now() - cachedResult.timestamp < this.cacheTimeout) {
        return { ...validationResult, ...cachedResult.data };
      }
      
      // Perform validation checks
      const validationChecks = [];
      
      // Basic validation (always performed)
      validationChecks.push(this.validateBasicFields(candidate, category));
      validationChecks.push(this.validatePricing(candidate, category));
      validationChecks.push(this.validateQuality(candidate, category));
      
      // Extended validation for higher levels
      if (validationLevel === 'extended' || validationLevel === 'comprehensive') {
        validationChecks.push(this.validateAvailability(candidate, category));
        validationChecks.push(this.validateCompliance(candidate, category));
      }
      
      // Comprehensive validation includes external checks
      if (validationLevel === 'comprehensive') {
        validationChecks.push(this.validateWithExternalServices(candidate, category));
      }
      
      // Execute all validation checks
      const checkResults = await Promise.allSettled(validationChecks);
      
      // Process validation results
      let totalScore = 0;
      let scoreCount = 0;
      
      checkResults.forEach(result => {
        if (result.status === 'fulfilled') {
          const checkResult = result.value;
          
          if (!checkResult.passed) {
            if (checkResult.severity === 'error') {
              validationResult.isValid = false;
              validationResult.validationErrors.push(checkResult.message);
            } else {
              validationResult.validationWarnings.push(checkResult.message);
            }
          }
          
          if (checkResult.score !== undefined) {
            totalScore += checkResult.score;
            scoreCount++;
          }
        } else {
          validationResult.validationWarnings.push(`Validation check failed: ${result.reason.message}`);
        }
      });
      
      // Calculate final validation score
      if (scoreCount > 0) {
        validationResult.validationScore = totalScore / scoreCount;
      }
      
      // Apply score threshold
      if (validationResult.validationScore < 0.5) {
        validationResult.isValid = false;
        validationResult.validationErrors.push('Validation score below threshold');
      }
      
      // Cache the result
      this.validationCache.set(cacheKey, {
        data: {
          isValid: validationResult.isValid,
          validationScore: validationResult.validationScore,
          validationErrors: validationResult.validationErrors,
          validationWarnings: validationResult.validationWarnings
        },
        timestamp: Date.now()
      });
      
      return validationResult;
      
    } catch (error) {
      logger.error('Error validating candidate:', error);
      
      validationResult.isValid = false;
      validationResult.validationErrors.push(`Validation error: ${error.message}`);
      
      return validationResult;
    }
  }

  validateBasicFields(candidate, category) {
    return new Promise((resolve) => {
      const requiredFields = this.validationRules.quality.requiredFields[category] || [];
      const missingFields = [];
      
      requiredFields.forEach(field => {
        if (!candidate[field] || (typeof candidate[field] === 'string' && candidate[field].trim() === '')) {
          missingFields.push(field);
        }
      });
      
      if (missingFields.length > 0) {
        resolve({
          passed: false,
          severity: 'error',
          message: `Missing required fields: ${missingFields.join(', ')}`,
          score: 0
        });
      } else {
        resolve({
          passed: true,
          message: 'All required fields present',
          score: 1.0
        });
      }
    });
  }

  validatePricing(candidate, category) {
    return new Promise((resolve) => {
      const price = candidate.price || candidate.pricePerDay;
      
      if (!price || typeof price !== 'number') {
        resolve({
          passed: false,
          severity: 'error',
          message: 'Invalid or missing price',
          score: 0
        });
        return;
      }
      
      const rules = this.validationRules.pricing;
      const minPrice = rules.minPrice[category];
      const maxPrice = rules.maxPrice[category];
      
      if (price < minPrice) {
        resolve({
          passed: false,
          severity: 'warning',
          message: `Price below minimum threshold: ${price} < ${minPrice}`,
          score: 0.3
        });
      } else if (price > maxPrice) {
        resolve({
          passed: false,
          severity: 'warning',
          message: `Price above maximum threshold: ${price} > ${maxPrice}`,
          score: 0.7
        });
      } else {
        // Price is within acceptable range
        const priceScore = 1.0 - Math.abs(price - (minPrice + maxPrice) / 2) / ((maxPrice - minPrice) / 2);
        
        resolve({
          passed: true,
          message: 'Price within acceptable range',
          score: Math.max(0.5, priceScore)
        });
      }
    });
  }

  validateQuality(candidate, category) {
    return new Promise((resolve) => {
      const rules = this.validationRules.quality;
      let qualityScore = 1.0;
      const issues = [];
      
      // Check rating
      if (candidate.rating) {
        if (candidate.rating < rules.minRating) {
          issues.push(`Low rating: ${candidate.rating}`);
          qualityScore *= 0.5;
        } else {
          qualityScore *= Math.min(1.0, candidate.rating / 5.0);
        }
      }
      
      // Check review count
      if (candidate.reviewCount) {
        if (candidate.reviewCount < rules.minReviewCount) {
          issues.push(`Low review count: ${candidate.reviewCount}`);
          qualityScore *= 0.7;
        } else {
          qualityScore *= Math.min(1.0, Math.log10(candidate.reviewCount) / 3);
        }
      }
      
      // Category-specific quality checks
      switch (category) {
        case 'hotels':
          if (!candidate.amenities || candidate.amenities.length < 2) {
            issues.push('Insufficient amenities');
            qualityScore *= 0.8;
          }
          break;
          
        case 'flights':
          if (candidate.layovers > 2) {
            issues.push('Too many layovers');
            qualityScore *= 0.6;
          }
          if (candidate.duration > 720) { // 12 hours
            issues.push('Very long flight duration');
            qualityScore *= 0.8;
          }
          break;
          
        case 'activities':
          if (!candidate.duration || candidate.duration < 30) {
            issues.push('Very short activity duration');
            qualityScore *= 0.7;
          }
          break;
          
        case 'restaurants':
          if (!candidate.cuisine) {
            issues.push('Missing cuisine information');
            qualityScore *= 0.8;
          }
          break;
          
        case 'cars':
          if (!candidate.transmission || !candidate.fuelType) {
            issues.push('Missing vehicle specifications');
            qualityScore *= 0.8;
          }
          break;
      }
      
      const passed = qualityScore >= 0.6 && issues.length === 0;
      
      resolve({
        passed,
        severity: passed ? 'info' : 'warning',
        message: passed ? 'Quality checks passed' : `Quality issues: ${issues.join(', ')}`,
        score: qualityScore
      });
    });
  }

  async validateAvailability(candidate, category) {
    return new Promise(async (resolve) => {
      try {
        // Simulate availability check with external service
        const availabilityStartTime = Date.now();
        
        // Mock availability check - in production, this would call external APIs
        await new Promise(r => setTimeout(r, Math.random() * 1000 + 200));
        
        const responseTime = Date.now() - availabilityStartTime;
        
        if (responseTime > this.validationRules.availability.maxResponseTime) {
          resolve({
            passed: false,
            severity: 'warning',
            message: `Availability check timeout: ${responseTime}ms`,
            score: 0.5
          });
          return;
        }
        
        // Mock availability result
        const isAvailable = Math.random() > 0.1; // 90% availability
        
        if (!isAvailable) {
          resolve({
            passed: false,
            severity: 'error',
            message: 'Not available for requested dates',
            score: 0
          });
        } else {
          resolve({
            passed: true,
            message: 'Available for requested dates',
            score: 1.0
          });
        }
        
      } catch (error) {
        resolve({
          passed: false,
          severity: 'warning',
          message: `Availability check failed: ${error.message}`,
          score: 0.5
        });
      }
    });
  }

  async validateCompliance(candidate, category) {
    return new Promise((resolve) => {
      const issues = [];
      let complianceScore = 1.0;
      
      // Check image licenses
      if (candidate.images && candidate.images.length > 0) {
        const unlicensedImages = candidate.images.filter(img => 
          !img.license || !img.license.valid
        );
        
        if (unlicensedImages.length > 0) {
          issues.push(`${unlicensedImages.length} images without valid licenses`);
          complianceScore *= 0.7;
        }
      }
      
      // Check GDPR compliance
      if (this.validationRules.compliance.gdprCompliant) {
        // Check for potential PII in descriptions or names
        const textFields = [candidate.name, candidate.description].filter(Boolean);
        const piiPatterns = [
          /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/, // Credit card
          /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, // Email
          /\b\d{3}[\s-]?\d{3}[\s-]?\d{4}\b/ // Phone
        ];
        
        textFields.forEach(text => {
          piiPatterns.forEach(pattern => {
            if (pattern.test(text)) {
              issues.push('Potential PII detected in text fields');
              complianceScore *= 0.5;
            }
          });
        });
      }
      
      // Check accessibility compliance if required
      if (this.validationRules.compliance.accessibilityRequired) {
        if (category === 'activities' && !candidate.accessibility) {
          issues.push('Accessibility information missing');
          complianceScore *= 0.8;
        }
      }
      
      const passed = complianceScore >= 0.8 && issues.length === 0;
      
      resolve({
        passed,
        severity: passed ? 'info' : 'warning',
        message: passed ? 'Compliance checks passed' : `Compliance issues: ${issues.join(', ')}`,
        score: complianceScore
      });
    });
  }

  async validateWithExternalServices(candidate, category) {
    return new Promise(async (resolve) => {
      try {
        // Simulate external validation service calls
        const validationPromises = [];
        
        // Price validation with external service
        validationPromises.push(this.callExternalPriceValidator(candidate, category));
        
        // Availability validation with provider
        validationPromises.push(this.callExternalAvailabilityValidator(candidate, category));
        
        // Compliance validation
        validationPromises.push(this.callExternalComplianceValidator(candidate, category));
        
        const results = await Promise.allSettled(validationPromises);
        
        let overallScore = 1.0;
        const issues = [];
        
        results.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            const validationResult = result.value;
            overallScore *= validationResult.score;
            
            if (!validationResult.passed) {
              issues.push(validationResult.message);
            }
          } else {
            issues.push(`External validation ${index} failed`);
            overallScore *= 0.8;
          }
        });
        
        const passed = overallScore >= 0.7 && issues.length === 0;
        
        resolve({
          passed,
          severity: passed ? 'info' : 'warning',
          message: passed ? 'External validation passed' : `External validation issues: ${issues.join(', ')}`,
          score: overallScore
        });
        
      } catch (error) {
        resolve({
          passed: false,
          severity: 'warning',
          message: `External validation error: ${error.message}`,
          score: 0.6
        });
      }
    });
  }

  async callExternalPriceValidator(candidate, category) {
    // Simulate external price validation API call
    await new Promise(r => setTimeout(r, Math.random() * 500 + 200));
    
    const marketPrice = candidate.price * (0.9 + Math.random() * 0.2);
    const priceDrift = Math.abs(candidate.price - marketPrice) / marketPrice * 100;
    
    if (priceDrift > this.validationRules.pricing.maxDriftPercent) {
      return {
        passed: false,
        message: `Price drift too high: ${priceDrift.toFixed(1)}%`,
        score: 0.5
      };
    }
    
    return {
      passed: true,
      message: 'Price validated against market rates',
      score: 1.0 - (priceDrift / this.validationRules.pricing.maxDriftPercent) * 0.3
    };
  }

  async callExternalAvailabilityValidator(candidate, category) {
    // Simulate external availability API call
    await new Promise(r => setTimeout(r, Math.random() * 800 + 300));
    
    const isAvailable = Math.random() > 0.05; // 95% availability for external check
    
    return {
      passed: isAvailable,
      message: isAvailable ? 'Confirmed available with provider' : 'Not available with provider',
      score: isAvailable ? 1.0 : 0
    };
  }

  async callExternalComplianceValidator(candidate, category) {
    // Simulate external compliance API call
    await new Promise(r => setTimeout(r, Math.random() * 400 + 100));
    
    const isCompliant = Math.random() > 0.02; // 98% compliance rate
    
    return {
      passed: isCompliant,
      message: isCompliant ? 'Compliance verified' : 'Compliance issues detected',
      score: isCompliant ? 1.0 : 0.3
    };
  }

  generateValidationCacheKey(candidate, validationLevel) {
    const keyData = {
      id: candidate.id,
      provider: candidate.provider,
      price: candidate.price,
      validationLevel
    };
    
    return `validation-${Buffer.from(JSON.stringify(keyData)).toString('base64').slice(0, 32)}`;
  }

  updateValidationStats(category, stats) {
    this.validationStats.total += stats.total;
    this.validationStats.passed += stats.valid;
    this.validationStats.failed += stats.invalid;
    
    if (this.validationStats.byCategory[category]) {
      this.validationStats.byCategory[category].total += stats.total;
      this.validationStats.byCategory[category].passed += stats.valid;
      this.validationStats.byCategory[category].failed += stats.invalid;
    }
  }

  resetValidationStats() {
    this.validationStats = {
      total: 0,
      passed: 0,
      failed: 0,
      byCategory: {
        hotels: { total: 0, passed: 0, failed: 0 },
        flights: { total: 0, passed: 0, failed: 0 },
        activities: { total: 0, passed: 0, failed: 0 },
        restaurants: { total: 0, passed: 0, failed: 0 },
        cars: { total: 0, passed: 0, failed: 0 }
      },
      byRule: {
        pricing: { passed: 0, failed: 0 },
        quality: { passed: 0, failed: 0 },
        availability: { passed: 0, failed: 0 },
        compliance: { passed: 0, failed: 0 }
      }
    };
  }

  clearExpiredCache() {
    const now = Date.now();
    
    for (const [key, entry] of this.validationCache) {
      if (now - entry.timestamp > this.cacheTimeout) {
        this.validationCache.delete(key);
      }
    }
  }

  // Event handlers for specific validation requests
  async handleValidatePricing(event) {
    const { sagaId, candidates, category } = event.data;
    
    try {
      const pricingResults = [];
      
      for (const candidate of candidates) {
        const result = await this.validatePricing(candidate, category);
        pricingResults.push({
          candidateId: candidate.id,
          ...result
        });
      }
      
      await this.publish('pricing-validated', {
        sagaId,
        category,
        results: pricingResults,
        timestamp: Date.now()
      });
      
    } catch (error) {
      logger.error('Error in pricing validation:', error);
      
      await this.publish('pricing-validation-failed', {
        sagaId,
        category,
        error: error.message,
        timestamp: Date.now()
      });
    }
  }

  async handleValidateAvailability(event) {
    const { sagaId, candidates, category, dates } = event.data;
    
    try {
      const availabilityResults = [];
      
      // Process in batches to avoid overwhelming external services
      const batchSize = 5;
      for (let i = 0; i < candidates.length; i += batchSize) {
        const batch = candidates.slice(i, i + batchSize);
        
        const batchPromises = batch.map(async candidate => {
          const result = await this.validateAvailability(candidate, category);
          return {
            candidateId: candidate.id,
            ...result
          };
        });
        
        const batchResults = await Promise.allSettled(batchPromises);
        
        batchResults.forEach(result => {
          if (result.status === 'fulfilled') {
            availabilityResults.push(result.value);
          } else {
            availabilityResults.push({
              candidateId: 'unknown',
              passed: false,
              severity: 'error',
              message: result.reason.message,
              score: 0
            });
          }
        });
        
        // Small delay between batches
        if (i + batchSize < candidates.length) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }
      
      await this.publish('availability-validated', {
        sagaId,
        category,
        results: availabilityResults,
        timestamp: Date.now()
      });
      
    } catch (error) {
      logger.error('Error in availability validation:', error);
      
      await this.publish('availability-validation-failed', {
        sagaId,
        category,
        error: error.message,
        timestamp: Date.now()
      });
    }
  }

  async handleValidateCompliance(event) {
    const { sagaId, candidates, category, requirements } = event.data;
    
    try {
      const complianceResults = [];
      
      for (const candidate of candidates) {
        const result = await this.validateCompliance(candidate, category);
        complianceResults.push({
          candidateId: candidate.id,
          ...result
        });
      }
      
      await this.publish('compliance-validated', {
        sagaId,
        category,
        results: complianceResults,
        timestamp: Date.now()
      });
      
    } catch (error) {
      logger.error('Error in compliance validation:', error);
      
      await this.publish('compliance-validation-failed', {
        sagaId,
        category,
        error: error.message,
        timestamp: Date.now()
      });
    }
  }

  async handleExternalValidationResponse(event) {
    const { service, candidateId, result } = event.data;
    
    logger.info(`Received external validation response from ${service} for candidate ${candidateId}`);
    
    // Update validation cache with external result
    const cacheKey = `external-${service}-${candidateId}`;
    this.validationCache.set(cacheKey, {
      data: result,
      timestamp: Date.now()
    });
  }

  // Query methods
  getValidationStats() {
    return {
      ...this.validationStats,
      cacheSize: this.validationCache.size,
      cacheTimeout: this.cacheTimeout
    };
  }

  getValidationRules() {
    return { ...this.validationRules };
  }

  updateValidationRules(newRules) {
    this.validationRules = {
      ...this.validationRules,
      ...newRules
    };
    
    logger.info('Validation rules updated');
  }

  getCacheStats() {
    return {
      size: this.validationCache.size,
      timeout: this.cacheTimeout,
      entries: Array.from(this.validationCache.keys()).slice(0, 10) // First 10 keys
    };
  }

  async shutdown() {
    logger.info('Shutting down Validation swarm');
    
    // Clear all data
    this.validationCache.clear();
    this.resetValidationStats();
    
    await super.shutdown();
  }
}