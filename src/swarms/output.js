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

export class OutputSwarm extends BaseHolon {
  constructor(orchestration) {
    super('OutputSwarm', orchestration);
    this.config = getConfig();
    
    // Output formats and templates
    this.outputFormats = {
      json: {
        name: 'JSON Format',
        description: 'Structured JSON output for API consumption',
        enabled: true,
        contentType: 'application/json'
      },
      html: {
        name: 'HTML Format',
        description: 'Rich HTML output for web display',
        enabled: true,
        contentType: 'text/html'
      },
      pdf: {
        name: 'PDF Format',
        description: 'Printable PDF itinerary',
        enabled: true,
        contentType: 'application/pdf'
      },
      email: {
        name: 'Email Format',
        description: 'Email-friendly format',
        enabled: true,
        contentType: 'text/html'
      },
      mobile: {
        name: 'Mobile Format',
        description: 'Mobile-optimized format',
        enabled: true,
        contentType: 'application/json'
      },
      summary: {
        name: 'Summary Format',
        description: 'Condensed summary format',
        enabled: true,
        contentType: 'text/plain'
      }
    };
    
    // Output templates
    this.templates = {
      itinerary: {
        name: 'Travel Itinerary',
        description: 'Complete travel itinerary with all bookings',
        sections: ['header', 'summary', 'timeline', 'accommodations', 'transportation', 'activities', 'dining', 'footer']
      },
      comparison: {
        name: 'Options Comparison',
        description: 'Side-by-side comparison of travel options',
        sections: ['header', 'criteria', 'comparison_table', 'recommendations', 'footer']
      },
      quickResults: {
        name: 'Quick Results',
        description: 'Fast overview of top recommendations',
        sections: ['header', 'top_picks', 'key_info', 'next_steps']
      },
      detailed: {
        name: 'Detailed Report',
        description: 'Comprehensive travel report with all details',
        sections: ['header', 'executive_summary', 'detailed_options', 'analysis', 'appendix', 'footer']
      }
    };
    
    // Output statistics
    this.outputStats = {
      totalOutputs: 0,
      averageGenerationTime: 0,
      formatStats: {
        json: { generated: 0, avgSize: 0, avgTime: 0 },
        html: { generated: 0, avgSize: 0, avgTime: 0 },
        pdf: { generated: 0, avgSize: 0, avgTime: 0 },
        email: { generated: 0, avgSize: 0, avgTime: 0 },
        mobile: { generated: 0, avgSize: 0, avgTime: 0 },
        summary: { generated: 0, avgSize: 0, avgTime: 0 }
      },
      templateStats: {
        itinerary: { used: 0, avgRating: 0 },
        comparison: { used: 0, avgRating: 0 },
        quickResults: { used: 0, avgRating: 0 },
        detailed: { used: 0, avgRating: 0 }
      },
      errorStats: {
        formatErrors: 0,
        templateErrors: 0,
        renderingErrors: 0,
        validationErrors: 0
      }
    };
    
    // Output cache for performance
    this.outputCache = new Map();
    this.cacheTimeout = 300000; // 5 minutes
    
    // Personalization rules
    this.personalizationRules = {
      language: {
        default: 'en',
        supported: ['en', 'es', 'fr', 'de', 'it', 'pt', 'zh', 'ja']
      },
      currency: {
        default: 'USD',
        supported: ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF']
      },
      dateFormat: {
        default: 'MM/DD/YYYY',
        formats: {
          'US': 'MM/DD/YYYY',
          'EU': 'DD/MM/YYYY',
          'ISO': 'YYYY-MM-DD'
        }
      },
      timeFormat: {
        default: '12h',
        formats: ['12h', '24h']
      },
      units: {
        default: 'imperial',
        systems: ['imperial', 'metric']
      }
    };
    
    // Content filters and moderation
    this.contentFilters = {
      profanity: {
        enabled: true,
        action: 'replace', // 'replace', 'remove', 'flag'
        replacement: '***'
      },
      privacy: {
        enabled: true,
        maskPersonalInfo: true,
        maskPaymentInfo: true
      },
      accessibility: {
        enabled: true,
        altTextRequired: true,
        contrastCheck: true,
        screenReaderOptimized: true
      }
    };
  }

  async initialize() {
    await super.initialize();
    
    // Subscribe to output events
    this.subscribe('generate-output', this.handleGenerateOutput.bind(this));
    this.subscribe('format-results', this.handleFormatResults.bind(this));
    this.subscribe('customize-output', this.handleCustomizeOutput.bind(this));
    this.subscribe('validate-output', this.handleValidateOutput.bind(this));
    this.subscribe('export-results', this.handleExportResults.bind(this));
    
    // Start output maintenance
    this.startOutputMaintenance();
    
    logger.info('Output swarm initialized');
  }

  startOutputMaintenance() {
    // Clear expired cache entries every 3 minutes
    setInterval(() => {
      this.clearExpiredCache();
    }, 180000);
    
    // Update output statistics every 10 minutes
    setInterval(() => {
      this.updateOutputStatistics();
    }, 600000);
  }

  async handleGenerateOutput(event) {
    const { 
      sagaId, 
      enrichedCandidates, 
      outputFormat = 'json',
      template = 'itinerary',
      userPreferences = {},
      customization = {},
      metadata = {} 
    } = event.data;
    
    try {
      logger.info(`Generating output for saga ${sagaId}`);
      
      const outputStartTime = Date.now();
      
      const outputRequest = {
        sagaId,
        outputFormat,
        template,
        userPreferences,
        customization,
        metadata,
        startTime: outputStartTime,
        enrichedCandidates
      };
      
      // Check cache first
      const cacheKey = this.generateOutputCacheKey(outputRequest);
      const cachedOutput = this.outputCache.get(cacheKey);
      
      if (cachedOutput && Date.now() - cachedOutput.timestamp < this.cacheTimeout) {
        logger.info(`Using cached output for saga ${sagaId}`);
        
        const cachedResult = {
          ...cachedOutput.data,
          sagaId,
          fromCache: true,
          generatedAt: Date.now()
        };
        
        await this.publish('output-generated', cachedResult);
        return;
      }
      
      // Generate new output
      const outputResult = await this.generateFormattedOutput(outputRequest);
      
      outputResult.endTime = Date.now();
      outputResult.duration = outputResult.endTime - outputStartTime;
      
      // Cache the result
      this.outputCache.set(cacheKey, {
        data: {
          outputFormat: outputResult.outputFormat,
          template: outputResult.template,
          content: outputResult.content,
          metadata: outputResult.metadata,
          statistics: outputResult.statistics
        },
        timestamp: Date.now()
      });
      
      // Update statistics
      this.outputStats.totalOutputs++;
      this.outputStats.averageGenerationTime = 
        (this.outputStats.averageGenerationTime * (this.outputStats.totalOutputs - 1) + outputResult.duration) / 
        this.outputStats.totalOutputs;
      
      const formatStats = this.outputStats.formatStats[outputFormat];
      if (formatStats) {
        formatStats.generated++;
        formatStats.avgTime = (formatStats.avgTime * (formatStats.generated - 1) + outputResult.duration) / formatStats.generated;
        formatStats.avgSize = (formatStats.avgSize * (formatStats.generated - 1) + outputResult.contentSize) / formatStats.generated;
      }
      
      const templateStats = this.outputStats.templateStats[template];
      if (templateStats) {
        templateStats.used++;
      }
      
      // Publish output results
      await this.publish('output-generated', outputResult);
      
      logger.info(`Output generated for saga ${sagaId}`, {
        outputFormat,
        template,
        contentSize: outputResult.contentSize,
        duration: outputResult.duration
      });
      
    } catch (error) {
      logger.error('Error generating output:', error);
      
      this.outputStats.errorStats.renderingErrors++;
      
      await this.publish('output-generation-failed', {
        sagaId,
        error: error.message,
        timestamp: Date.now()
      });
    }
  }

  async generateFormattedOutput(outputRequest) {
    const { sagaId, outputFormat, template, userPreferences, customization, metadata, enrichedCandidates } = outputRequest;
    
    // Prepare output data
    const outputData = await this.prepareOutputData(enrichedCandidates, userPreferences, customization);
    
    // Apply template
    const templateContent = await this.applyTemplate(template, outputData, userPreferences);
    
    // Format content
    const formattedContent = await this.formatContent(templateContent, outputFormat, userPreferences, customization);
    
    // Apply personalization
    const personalizedContent = await this.applyPersonalization(formattedContent, userPreferences);
    
    // Apply content filters
    const filteredContent = await this.applyContentFilters(personalizedContent, userPreferences);
    
    // Validate output
    const validation = await this.validateOutput(filteredContent, outputFormat, template);
    
    const outputResult = {
      sagaId,
      outputFormat,
      template,
      content: filteredContent,
      contentSize: this.calculateContentSize(filteredContent),
      metadata: {
        ...metadata,
        generatedAt: Date.now(),
        version: '1.0',
        format: outputFormat,
        template: template,
        personalized: Object.keys(userPreferences).length > 0,
        customized: Object.keys(customization).length > 0
      },
      validation,
      statistics: {
        totalCandidates: this.countTotalCandidates(enrichedCandidates),
        sectionsGenerated: templateContent.sections?.length || 0,
        personalizations: Object.keys(userPreferences).length,
        customizations: Object.keys(customization).length
      }
    };
    
    return outputResult;
  }

  async prepareOutputData(enrichedCandidates, userPreferences, customization) {
    const outputData = {
      summary: {
        totalOptions: 0,
        totalBudget: 0,
        averageRating: 0,
        sustainabilityScore: 0,
        generatedAt: new Date().toISOString()
      },
      categories: {
        hotels: [],
        flights: [],
        activities: [],
        restaurants: [],
        cars: []
      },
      insights: {
        recommendations: [],
        warnings: [],
        tips: [],
        alternatives: []
      },
      metadata: {
        searchCriteria: userPreferences,
        customizations: customization,
        dataQuality: {
          completeness: 0,
          freshness: 0,
          accuracy: 0
        }
      }
    };
    
    // Process each category
    let totalRating = 0;
    let totalSustainability = 0;
    let ratedItems = 0;
    let sustainableItems = 0;
    
    Object.keys(enrichedCandidates.results).forEach(category => {
      const candidates = enrichedCandidates.results[category] || [];
      
      outputData.categories[category] = candidates.map(candidate => {
        const processedCandidate = this.processCandidate(candidate, userPreferences);
        
        outputData.summary.totalOptions++;
        outputData.summary.totalBudget += candidate.currentPrice || candidate.price || 0;
        
        if (candidate.enrichedRating || candidate.rating) {
          totalRating += candidate.enrichedRating || candidate.rating;
          ratedItems++;
        }
        
        if (candidate.sustainabilityScore) {
          totalSustainability += candidate.sustainabilityScore;
          sustainableItems++;
        }
        
        return processedCandidate;
      });
    });
    
    // Calculate averages
    if (ratedItems > 0) {
      outputData.summary.averageRating = totalRating / ratedItems;
    }
    
    if (sustainableItems > 0) {
      outputData.summary.sustainabilityScore = totalSustainability / sustainableItems;
    }
    
    // Generate insights
    outputData.insights = await this.generateInsights(enrichedCandidates, userPreferences);
    
    // Calculate data quality metrics
    outputData.metadata.dataQuality = this.calculateDataQuality(enrichedCandidates);
    
    return outputData;
  }

  processCandidate(candidate, userPreferences) {
    const processed = {
      id: candidate.id,
      name: candidate.name,
      description: candidate.description,
      price: {
        current: candidate.currentPrice || candidate.price,
        original: candidate.price,
        currency: userPreferences.currency || 'USD',
        formatted: this.formatPrice(candidate.currentPrice || candidate.price, userPreferences.currency)
      },
      rating: {
        value: candidate.enrichedRating || candidate.rating,
        count: candidate.enrichedReviewCount || candidate.reviewCount,
        formatted: this.formatRating(candidate.enrichedRating || candidate.rating)
      },
      location: {
        address: candidate.address,
        coordinates: candidate.coordinates,
        nearbyPOIs: candidate.enrichment?.maps?.nearbyPOIs || []
      },
      availability: {
        status: candidate.availabilityStatus || 'unknown',
        confirmed: candidate.availabilityConfirmed || false,
        lastChecked: candidate.enrichment?.availability?.availability?.lastChecked
      },
      enrichment: {
        score: candidate.enrichmentScore || 0,
        services: candidate.servicesUsed || [],
        highlights: this.extractEnrichmentHighlights(candidate)
      },
      userRelevance: {
        score: candidate.enrichment?.userContext?.relevanceScore || 0.5,
        recommendations: candidate.enrichment?.userContext?.personalizedRecommendations || []
      }
    };
    
    // Add category-specific fields
    if (candidate.category === 'hotels') {
      processed.amenities = candidate.amenities || [];
      processed.roomTypes = candidate.roomTypes || [];
      processed.checkIn = candidate.checkIn;
      processed.checkOut = candidate.checkOut;
    } else if (candidate.category === 'flights') {
      processed.airline = candidate.airline;
      processed.departure = candidate.departure;
      processed.arrival = candidate.arrival;
      processed.duration = candidate.duration;
      processed.stops = candidate.stops || 0;
    } else if (candidate.category === 'activities') {
      processed.duration = candidate.duration;
      processed.difficulty = candidate.difficulty;
      processed.ageRestrictions = candidate.ageRestrictions;
    } else if (candidate.category === 'restaurants') {
      processed.cuisine = candidate.cuisine;
      processed.priceRange = candidate.priceRange;
      processed.openingHours = candidate.openingHours;
    } else if (candidate.category === 'cars') {
      processed.carType = candidate.carType;
      processed.transmission = candidate.transmission;
      processed.fuelType = candidate.fuelType;
    }
    
    return processed;
  }

  extractEnrichmentHighlights(candidate) {
    const highlights = [];
    
    if (candidate.enrichment) {
      // Weather highlights
      if (candidate.enrichment.weather) {
        const weather = candidate.enrichment.weather;
        highlights.push(`Weather: ${weather.forecast.conditions}, ${Math.round(weather.forecast.temperature.max)}°C`);
      }
      
      // Sustainability highlights
      if (candidate.enrichment.sustainability && candidate.enrichment.sustainability.sustainabilityScore.overall > 0.8) {
        highlights.push('Highly sustainable option');
      }
      
      // Social highlights
      if (candidate.enrichment.social && candidate.enrichment.social.socialMetrics.trending) {
        highlights.push('Trending destination');
      }
      
      // Pricing highlights
      if (candidate.enrichment.pricing && candidate.enrichment.pricing.discounts.available) {
        highlights.push(`${candidate.enrichment.pricing.discounts.amount} discount available`);
      }
    }
    
    return highlights;
  }

  async generateInsights(enrichedCandidates, userPreferences) {
    const insights = {
      recommendations: [],
      warnings: [],
      tips: [],
      alternatives: []
    };
    
    // Budget insights
    const totalBudget = Object.values(enrichedCandidates.results)
      .flat()
      .reduce((sum, candidate) => sum + (candidate.currentPrice || candidate.price || 0), 0);
    
    if (userPreferences.budget && totalBudget > userPreferences.budget.total) {
      insights.warnings.push(`Total cost (${this.formatPrice(totalBudget, userPreferences.currency)}) exceeds budget`);
      insights.recommendations.push('Consider selecting lower-cost alternatives or adjusting your budget');
    } else if (userPreferences.budget && totalBudget < userPreferences.budget.total * 0.8) {
      insights.tips.push('You have budget remaining - consider upgrading some selections');
    }
    
    // Weather insights
    const weatherData = Object.values(enrichedCandidates.results)
      .flat()
      .map(c => c.enrichment?.weather)
      .filter(w => w);
    
    if (weatherData.length > 0) {
      const rainyDays = weatherData.filter(w => w.forecast.conditions === 'rainy').length;
      if (rainyDays > weatherData.length * 0.3) {
        insights.warnings.push('Rain expected during your trip - pack accordingly');
        insights.tips.push('Consider indoor activities as backup options');
      }
    }
    
    // Sustainability insights
    const sustainabilityScores = Object.values(enrichedCandidates.results)
      .flat()
      .map(c => c.sustainabilityScore)
      .filter(s => s);
    
    if (sustainabilityScores.length > 0) {
      const avgSustainability = sustainabilityScores.reduce((sum, score) => sum + score, 0) / sustainabilityScores.length;
      if (avgSustainability > 0.8) {
        insights.recommendations.push('Excellent sustainability choices - your trip has a low environmental impact');
      } else if (avgSustainability < 0.5) {
        insights.tips.push('Consider more sustainable options to reduce your environmental impact');
      }
    }
    
    // Availability insights
    const availabilityIssues = Object.values(enrichedCandidates.results)
      .flat()
      .filter(c => c.availabilityStatus === 'limited' || !c.availabilityConfirmed);
    
    if (availabilityIssues.length > 0) {
      insights.warnings.push(`${availabilityIssues.length} options have limited availability - book soon`);
    }
    
    return insights;
  }

  calculateDataQuality(enrichedCandidates) {
    let totalCandidates = 0;
    let completeData = 0;
    let freshData = 0;
    let accurateData = 0;
    
    Object.values(enrichedCandidates.results).forEach(categoryItems => {
      categoryItems.forEach(candidate => {
        totalCandidates++;
        
        // Completeness: check if essential fields are present
        const essentialFields = ['name', 'price', 'location'];
        const presentFields = essentialFields.filter(field => candidate[field]);
        if (presentFields.length === essentialFields.length) {
          completeData++;
        }
        
        // Freshness: check if data was recently updated
        const enrichedAt = candidate.enrichedAt || 0;
        const hoursSinceEnrichment = (Date.now() - enrichedAt) / (1000 * 60 * 60);
        if (hoursSinceEnrichment < 24) {
          freshData++;
        }
        
        // Accuracy: based on enrichment score
        if (candidate.enrichmentScore && candidate.enrichmentScore > 0.7) {
          accurateData++;
        }
      });
    });
    
    return {
      completeness: totalCandidates > 0 ? completeData / totalCandidates : 0,
      freshness: totalCandidates > 0 ? freshData / totalCandidates : 0,
      accuracy: totalCandidates > 0 ? accurateData / totalCandidates : 0
    };
  }

  async applyTemplate(template, outputData, userPreferences) {
    const templateConfig = this.templates[template];
    
    if (!templateConfig) {
      throw new Error(`Unknown template: ${template}`);
    }
    
    const templateContent = {
      template: template,
      sections: [],
      metadata: {
        generatedAt: new Date().toISOString(),
        template: templateConfig.name,
        description: templateConfig.description
      }
    };
    
    // Generate each section based on template configuration
    for (const sectionName of templateConfig.sections) {
      const section = await this.generateTemplateSection(sectionName, outputData, userPreferences);
      templateContent.sections.push(section);
    }
    
    return templateContent;
  }

  async generateTemplateSection(sectionName, outputData, userPreferences) {
    const section = {
      name: sectionName,
      title: this.getSectionTitle(sectionName),
      content: {},
      order: this.getSectionOrder(sectionName)
    };
    
    switch (sectionName) {
      case 'header':
        section.content = {
          title: 'Your Travel Itinerary',
          subtitle: `Generated on ${new Date().toLocaleDateString()}`,
          logo: '/assets/logo.png',
          userInfo: {
            name: userPreferences.name || 'Traveler',
            email: userPreferences.email
          }
        };
        break;
        
      case 'summary':
        section.content = {
          overview: outputData.summary,
          keyMetrics: {
            totalOptions: outputData.summary.totalOptions,
            totalBudget: this.formatPrice(outputData.summary.totalBudget, userPreferences.currency),
            averageRating: this.formatRating(outputData.summary.averageRating),
            sustainabilityScore: (outputData.summary.sustainabilityScore * 100).toFixed(0) + '%'
          },
          highlights: outputData.insights.recommendations.slice(0, 3)
        };
        break;
        
      case 'timeline':
        section.content = {
          timeline: this.generateTimeline(outputData.categories, userPreferences)
        };
        break;
        
      case 'accommodations':
        section.content = {
          hotels: outputData.categories.hotels,
          totalNights: this.calculateTotalNights(outputData.categories.hotels),
          averagePrice: this.calculateAveragePrice(outputData.categories.hotels, userPreferences.currency)
        };
        break;
        
      case 'transportation':
        section.content = {
          flights: outputData.categories.flights,
          cars: outputData.categories.cars,
          totalTransportCost: this.calculateCategoryTotal(['flights', 'cars'], outputData.categories, userPreferences.currency)
        };
        break;
        
      case 'activities':
        section.content = {
          activities: outputData.categories.activities,
          totalActivities: outputData.categories.activities.length,
          estimatedDuration: this.calculateTotalDuration(outputData.categories.activities)
        };
        break;
        
      case 'dining':
        section.content = {
          restaurants: outputData.categories.restaurants,
          cuisineTypes: this.extractCuisineTypes(outputData.categories.restaurants),
          averageMealCost: this.calculateAveragePrice(outputData.categories.restaurants, userPreferences.currency)
        };
        break;
        
      case 'comparison_table':
        section.content = {
          comparison: this.generateComparisonTable(outputData.categories)
        };
        break;
        
      case 'top_picks':
        section.content = {
          topPicks: this.selectTopPicks(outputData.categories, 3)
        };
        break;
        
      case 'detailed_options':
        section.content = {
          detailedOptions: outputData.categories
        };
        break;
        
      case 'analysis':
        section.content = {
          insights: outputData.insights,
          dataQuality: outputData.metadata.dataQuality,
          recommendations: this.generateAnalysisRecommendations(outputData)
        };
        break;
        
      case 'footer':
        section.content = {
          disclaimer: 'Prices and availability subject to change. Please verify details before booking.',
          contact: 'For assistance, contact our travel experts.',
          generatedBy: 'Holonic Travel Planner',
          version: '1.0'
        };
        break;
        
      default:
        section.content = {
          message: `Section ${sectionName} content not implemented`
        };
    }
    
    return section;
  }

  async formatContent(templateContent, outputFormat, userPreferences, customization) {
    switch (outputFormat) {
      case 'json':
        return this.formatAsJSON(templateContent, customization);
        
      case 'html':
        return this.formatAsHTML(templateContent, userPreferences, customization);
        
      case 'pdf':
        return this.formatAsPDF(templateContent, userPreferences, customization);
        
      case 'email':
        return this.formatAsEmail(templateContent, userPreferences, customization);
        
      case 'mobile':
        return this.formatAsMobile(templateContent, userPreferences, customization);
        
      case 'summary':
        return this.formatAsSummary(templateContent, userPreferences, customization);
        
      default:
        throw new Error(`Unsupported output format: ${outputFormat}`);
    }
  }

  formatAsJSON(templateContent, customization) {
    const jsonOutput = {
      ...templateContent,
      format: 'json',
      customization: customization
    };
    
    return {
      contentType: 'application/json',
      data: jsonOutput,
      raw: JSON.stringify(jsonOutput, null, customization.prettyPrint ? 2 : 0)
    };
  }

  formatAsHTML(templateContent, userPreferences, customization) {
    let html = `
<!DOCTYPE html>
<html lang="${userPreferences.language || 'en'}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${templateContent.sections.find(s => s.name === 'header')?.content?.title || 'Travel Itinerary'}</title>
    <style>
        ${this.generateCSS(customization)}
    </style>
</head>
<body>
    <div class="container">
`;
    
    // Generate HTML for each section
    templateContent.sections.forEach(section => {
      html += this.generateSectionHTML(section, userPreferences);
    });
    
    html += `
    </div>
</body>
</html>`;
    
    return {
      contentType: 'text/html',
      data: templateContent,
      raw: html
    };
  }

  formatAsPDF(templateContent, userPreferences, customization) {
    // Mock PDF generation - in production, this would use a PDF library
    const pdfMetadata = {
      title: templateContent.sections.find(s => s.name === 'header')?.content?.title || 'Travel Itinerary',
      author: 'Holonic Travel Planner',
      subject: 'Travel Itinerary',
      creator: 'Travel Planning System',
      creationDate: new Date().toISOString()
    };
    
    return {
      contentType: 'application/pdf',
      data: templateContent,
      metadata: pdfMetadata,
      raw: `[PDF Content - ${JSON.stringify(templateContent).length} bytes]`,
      downloadUrl: `/api/download/pdf/${Date.now()}.pdf`
    };
  }

  formatAsEmail(templateContent, userPreferences, customization) {
    const emailContent = {
      subject: `Your Travel Itinerary - ${new Date().toLocaleDateString()}`,
      to: userPreferences.email || '',
      from: 'noreply@travelplanner.com',
      html: this.generateEmailHTML(templateContent, userPreferences),
      text: this.generateEmailText(templateContent, userPreferences)
    };
    
    return {
      contentType: 'text/html',
      data: emailContent,
      raw: emailContent.html
    };
  }

  formatAsMobile(templateContent, userPreferences, customization) {
    // Mobile-optimized JSON format
    const mobileData = {
      ...templateContent,
      format: 'mobile',
      optimizations: {
        compactSections: true,
        reducedImages: true,
        essentialDataOnly: true
      },
      sections: templateContent.sections.map(section => ({
        ...section,
        content: this.optimizeForMobile(section.content)
      }))
    };
    
    return {
      contentType: 'application/json',
      data: mobileData,
      raw: JSON.stringify(mobileData)
    };
  }

  formatAsSummary(templateContent, userPreferences, customization) {
    let summary = '';
    
    // Extract key information for summary
    const headerSection = templateContent.sections.find(s => s.name === 'header');
    if (headerSection) {
      summary += `${headerSection.content.title}\n`;
      summary += `${headerSection.content.subtitle}\n\n`;
    }
    
    const summarySection = templateContent.sections.find(s => s.name === 'summary');
    if (summarySection) {
      const metrics = summarySection.content.keyMetrics;
      summary += `Summary:\n`;
      summary += `- Total Options: ${metrics.totalOptions}\n`;
      summary += `- Total Budget: ${metrics.totalBudget}\n`;
      summary += `- Average Rating: ${metrics.averageRating}\n`;
      summary += `- Sustainability Score: ${metrics.sustainabilityScore}\n\n`;
    }
    
    // Add top recommendations
    const topPicks = this.selectTopPicks(templateContent.sections.find(s => s.name === 'detailed_options')?.content?.detailedOptions || {}, 3);
    if (topPicks.length > 0) {
      summary += `Top Recommendations:\n`;
      topPicks.forEach((pick, index) => {
        summary += `${index + 1}. ${pick.name} - ${pick.price.formatted}\n`;
      });
    }
    
    return {
      contentType: 'text/plain',
      data: { summary: summary.trim() },
      raw: summary.trim()
    };
  }

  async applyPersonalization(content, userPreferences) {
    const personalizedContent = { ...content };
    
    // Apply language localization
    if (userPreferences.language && userPreferences.language !== 'en') {
      personalizedContent.localized = true;
      personalizedContent.language = userPreferences.language;
      // In production, this would apply actual translations
    }
    
    // Apply currency conversion
    if (userPreferences.currency && userPreferences.currency !== 'USD') {
      personalizedContent.currencyConverted = true;
      personalizedContent.currency = userPreferences.currency;
      // In production, this would apply actual currency conversion
    }
    
    // Apply date/time formatting
    if (userPreferences.dateFormat) {
      personalizedContent.dateFormatted = true;
      personalizedContent.dateFormat = userPreferences.dateFormat;
    }
    
    // Apply unit conversion
    if (userPreferences.units && userPreferences.units !== 'imperial') {
      personalizedContent.unitsConverted = true;
      personalizedContent.units = userPreferences.units;
    }
    
    return personalizedContent;
  }

  async applyContentFilters(content, userPreferences) {
    let filteredContent = { ...content };
    
    // Apply profanity filter
    if (this.contentFilters.profanity.enabled) {
      filteredContent = this.applyProfanityFilter(filteredContent);
    }
    
    // Apply privacy filters
    if (this.contentFilters.privacy.enabled) {
      filteredContent = this.applyPrivacyFilter(filteredContent, userPreferences);
    }
    
    // Apply accessibility enhancements
    if (this.contentFilters.accessibility.enabled) {
      filteredContent = this.applyAccessibilityEnhancements(filteredContent);
    }
    
    return filteredContent;
  }

  applyProfanityFilter(content) {
    // Mock profanity filter - in production, this would use a real profanity detection library
    const profanityWords = ['badword1', 'badword2']; // Mock list
    
    const filterText = (text) => {
      if (typeof text !== 'string') return text;
      
      let filteredText = text;
      profanityWords.forEach(word => {
        const regex = new RegExp(word, 'gi');
        filteredText = filteredText.replace(regex, this.contentFilters.profanity.replacement);
      });
      
      return filteredText;
    };
    
    // Recursively filter all text content
    const filterObject = (obj) => {
      if (typeof obj === 'string') {
        return filterText(obj);
      } else if (Array.isArray(obj)) {
        return obj.map(filterObject);
      } else if (obj && typeof obj === 'object') {
        const filtered = {};
        Object.keys(obj).forEach(key => {
          filtered[key] = filterObject(obj[key]);
        });
        return filtered;
      }
      return obj;
    };
    
    return filterObject(content);
  }

  applyPrivacyFilter(content, userPreferences) {
    // Mock privacy filter - mask sensitive information
    const maskEmail = (email) => {
      if (!email || typeof email !== 'string') return email;
      const [username, domain] = email.split('@');
      if (!username || !domain) return email;
      return `${username.slice(0, 2)}***@${domain}`;
    };
    
    const maskPhone = (phone) => {
      if (!phone || typeof phone !== 'string') return phone;
      return phone.replace(/(\d{3})(\d{3})(\d{4})/, '$1-***-$3');
    };
    
    // Apply masking if privacy settings are enabled
    if (this.contentFilters.privacy.maskPersonalInfo) {
      // This would recursively mask personal information in the content
      // For now, just mark as privacy-filtered
      content.privacyFiltered = true;
    }
    
    return content;
  }

  applyAccessibilityEnhancements(content) {
    // Add accessibility enhancements
    const enhanced = { ...content };
    
    enhanced.accessibility = {
      screenReaderOptimized: this.contentFilters.accessibility.screenReaderOptimized,
      altTextProvided: this.contentFilters.accessibility.altTextRequired,
      contrastChecked: this.contentFilters.accessibility.contrastCheck,
      keyboardNavigable: true
    };
    
    return enhanced;
  }

  async validateOutput(content, outputFormat, template) {
    const validation = {
      isValid: true,
      warnings: [],
      errors: [],
      quality: {
        completeness: 0,
        accuracy: 0,
        readability: 0
      }
    };
    
    // Validate format-specific requirements
    switch (outputFormat) {
      case 'json':
        try {
          JSON.stringify(content);
          validation.quality.completeness += 0.3;
        } catch (error) {
          validation.errors.push('Invalid JSON structure');
          validation.isValid = false;
        }
        break;
        
      case 'html':
        if (content.raw && content.raw.includes('<!DOCTYPE html>')) {
          validation.quality.completeness += 0.3;
        } else {
          validation.warnings.push('HTML structure may be incomplete');
        }
        break;
        
      case 'pdf':
        if (content.metadata && content.downloadUrl) {
          validation.quality.completeness += 0.3;
        } else {
          validation.warnings.push('PDF metadata incomplete');
        }
        break;
    }
    
    // Validate template requirements
    const templateConfig = this.templates[template];
    if (templateConfig && content.sections) {
      const requiredSections = templateConfig.sections;
      const presentSections = content.sections.map(s => s.name);
      const missingSections = requiredSections.filter(s => !presentSections.includes(s));
      
      if (missingSections.length === 0) {
        validation.quality.completeness += 0.4;
      } else {
        validation.warnings.push(`Missing template sections: ${missingSections.join(', ')}`);
      }
    }
    
    // Validate content quality
    if (content.data || content.sections) {
      validation.quality.accuracy = 0.8; // Mock accuracy score
      validation.quality.readability = 0.7; // Mock readability score
      validation.quality.completeness += 0.3;
    }
    
    // Overall quality score
    const qualityScores = Object.values(validation.quality);
    validation.overallQuality = qualityScores.reduce((sum, score) => sum + score, 0) / qualityScores.length;
    
    return validation;
  }

  // Helper methods
  generateOutputCacheKey(outputRequest) {
    const keyData = {
      format: outputRequest.outputFormat,
      template: outputRequest.template,
      candidatesHash: this.hashCandidates(outputRequest.enrichedCandidates),
      preferences: JSON.stringify(outputRequest.userPreferences),
      customization: JSON.stringify(outputRequest.customization)
    };
    
    return `output-${Buffer.from(JSON.stringify(keyData)).toString('base64').slice(0, 32)}`;
  }

  hashCandidates(enrichedCandidates) {
    // Simple hash of candidates for cache key
    const candidateIds = Object.values(enrichedCandidates.results)
      .flat()
      .map(c => c.id)
      .sort()
      .join(',');
    
    return Buffer.from(candidateIds).toString('base64').slice(0, 16);
  }

  calculateContentSize(content) {
    return JSON.stringify(content).length;
  }

  countTotalCandidates(enrichedCandidates) {
    return Object.values(enrichedCandidates.results)
      .reduce((sum, categoryItems) => sum + categoryItems.length, 0);
  }

  formatPrice(price, currency = 'USD') {
    if (!price) return 'N/A';
    
    const formatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency
    });
    
    return formatter.format(price);
  }

  formatRating(rating) {
    if (!rating) return 'N/A';
    return `${rating.toFixed(1)}/5.0`;
  }

  getSectionTitle(sectionName) {
    const titles = {
      header: 'Header',
      summary: 'Trip Summary',
      timeline: 'Itinerary Timeline',
      accommodations: 'Accommodations',
      transportation: 'Transportation',
      activities: 'Activities & Experiences',
      dining: 'Dining Options',
      comparison_table: 'Options Comparison',
      top_picks: 'Top Recommendations',
      detailed_options: 'Detailed Options',
      analysis: 'Analysis & Insights',
      footer: 'Additional Information'
    };
    
    return titles[sectionName] || sectionName;
  }

  getSectionOrder(sectionName) {
    const order = {
      header: 1,
      summary: 2,
      top_picks: 3,
      timeline: 4,
      accommodations: 5,
      transportation: 6,
      activities: 7,
      dining: 8,
      comparison_table: 9,
      detailed_options: 10,
      analysis: 11,
      footer: 12
    };
    
    return order[sectionName] || 99;
  }

  generateTimeline(categories, userPreferences) {
    // Mock timeline generation
    const timeline = [];
    
    // Add flights
    if (categories.flights && categories.flights.length > 0) {
      categories.flights.forEach(flight => {
        timeline.push({
          type: 'flight',
          time: flight.departure,
          title: `Flight to ${flight.arrival}`,
          details: flight
        });
      });
    }
    
    // Add hotel check-ins
    if (categories.hotels && categories.hotels.length > 0) {
      categories.hotels.forEach(hotel => {
        timeline.push({
          type: 'accommodation',
          time: hotel.checkIn,
          title: `Check-in: ${hotel.name}`,
          details: hotel
        });
      });
    }
    
    // Add activities
    if (categories.activities && categories.activities.length > 0) {
      categories.activities.forEach((activity, index) => {
        timeline.push({
          type: 'activity',
          time: `Day ${index + 1}`,
          title: activity.name,
          details: activity
        });
      });
    }
    
    return timeline.sort((a, b) => {
      // Simple sorting - in production, this would be more sophisticated
      return a.time.localeCompare(b.time);
    });
  }

  calculateTotalNights(hotels) {
    // Mock calculation
    return hotels.reduce((total, hotel) => {
      // Assume each hotel booking is for 1 night by default
      return total + 1;
    }, 0);
  }

  calculateAveragePrice(items, currency) {
    if (!items || items.length === 0) return this.formatPrice(0, currency);
    
    const total = items.reduce((sum, item) => sum + (item.price.current || 0), 0);
    return this.formatPrice(total / items.length, currency);
  }

  calculateCategoryTotal(categoryNames, categories, currency) {
    const total = categoryNames.reduce((sum, categoryName) => {
      const categoryItems = categories[categoryName] || [];
      return sum + categoryItems.reduce((catSum, item) => catSum + (item.price.current || 0), 0);
    }, 0);
    
    return this.formatPrice(total, currency);
  }

  calculateTotalDuration(activities) {
    // Mock duration calculation
    return activities.reduce((total, activity) => {
      const duration = activity.duration || '2 hours';
      // Simple parsing - in production, this would be more robust
      const hours = parseInt(duration) || 2;
      return total + hours;
    }, 0) + ' hours';
  }

  extractCuisineTypes(restaurants) {
    const cuisines = restaurants.map(r => r.cuisine).filter(c => c);
    return [...new Set(cuisines)];
  }

  generateComparisonTable(categories) {
    // Mock comparison table
    const comparison = {
      headers: ['Option', 'Price', 'Rating', 'Availability'],
      rows: []
    };
    
    Object.keys(categories).forEach(category => {
      categories[category].forEach(item => {
        comparison.rows.push([
          item.name,
          item.price.formatted,
          item.rating.formatted,
          item.availability.status
        ]);
      });
    });
    
    return comparison;
  }

  selectTopPicks(categories, count = 3) {
    const allItems = Object.values(categories).flat();
    
    // Sort by user relevance score and rating
    return allItems
      .sort((a, b) => {
        const scoreA = (a.userRelevance.score * 0.6) + (a.rating.value * 0.4);
        const scoreB = (b.userRelevance.score * 0.6) + (b.rating.value * 0.4);
        return scoreB - scoreA;
      })
      .slice(0, count);
  }

  generateAnalysisRecommendations(outputData) {
    const recommendations = [];
    
    // Budget analysis
    if (outputData.summary.totalBudget > 0) {
      recommendations.push({
        type: 'budget',
        title: 'Budget Optimization',
        description: 'Your selections are within a reasonable budget range',
        priority: 'medium'
      });
    }
    
    // Quality analysis
    if (outputData.summary.averageRating > 4.0) {
      recommendations.push({
        type: 'quality',
        title: 'High Quality Selections',
        description: 'Your choices have excellent ratings and reviews',
        priority: 'high'
      });
    }
    
    // Sustainability analysis
    if (outputData.summary.sustainabilityScore > 0.7) {
      recommendations.push({
        type: 'sustainability',
        title: 'Eco-Friendly Travel',
        description: 'Your trip has a positive environmental impact',
        priority: 'medium'
      });
    }
    
    return recommendations;
  }

  generateCSS(customization) {
    const theme = customization.theme || 'default';
    const colors = customization.colors || {
      primary: '#007bff',
      secondary: '#6c757d',
      background: '#ffffff',
      text: '#333333'
    };
    
    return `
      body {
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        line-height: 1.6;
        color: ${colors.text};
        background-color: ${colors.background};
        margin: 0;
        padding: 20px;
      }
      
      .container {
        max-width: 1200px;
        margin: 0 auto;
        background: white;
        border-radius: 8px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        overflow: hidden;
      }
      
      .section {
        padding: 20px;
        border-bottom: 1px solid #eee;
      }
      
      .section:last-child {
        border-bottom: none;
      }
      
      h1, h2, h3 {
        color: ${colors.primary};
        margin-top: 0;
      }
      
      .highlight {
        background-color: ${colors.primary};
        color: white;
        padding: 2px 6px;
        border-radius: 4px;
        font-size: 0.9em;
      }
      
      .price {
        font-weight: bold;
        color: ${colors.primary};
      }
      
      .rating {
        color: #ffc107;
      }
      
      @media (max-width: 768px) {
        body {
          padding: 10px;
        }
        
        .container {
          border-radius: 0;
        }
      }
    `;
  }

  generateSectionHTML(section, userPreferences) {
    let html = `<div class="section" id="${section.name}">`;
    html += `<h2>${section.title}</h2>`;
    
    // Generate content based on section type
    switch (section.name) {
      case 'header':
        html += `
          <div class="header-content">
            <h1>${section.content.title}</h1>
            <p>${section.content.subtitle}</p>
          </div>
        `;
        break;
        
      case 'summary':
        html += `
          <div class="summary-metrics">
            <div class="metric">
              <span class="label">Total Options:</span>
              <span class="value">${section.content.keyMetrics.totalOptions}</span>
            </div>
            <div class="metric">
              <span class="label">Total Budget:</span>
              <span class="value price">${section.content.keyMetrics.totalBudget}</span>
            </div>
            <div class="metric">
              <span class="label">Average Rating:</span>
              <span class="value rating">${section.content.keyMetrics.averageRating}</span>
            </div>
          </div>
        `;
        break;
        
      default:
        html += `<pre>${JSON.stringify(section.content, null, 2)}</pre>`;
    }
    
    html += '</div>';
    return html;
  }

  generateEmailHTML(templateContent, userPreferences) {
    // Simplified email HTML generation
    let emailHTML = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #007bff;">Your Travel Itinerary</h1>
    `;
    
    templateContent.sections.forEach(section => {
      if (['header', 'summary', 'top_picks'].includes(section.name)) {
        emailHTML += `
          <div style="margin: 20px 0; padding: 15px; border: 1px solid #eee;">
            <h2>${section.title}</h2>
            <p>Section content would be rendered here</p>
          </div>
        `;
      }
    });
    
    emailHTML += `
        <p style="color: #666; font-size: 12px;">Generated by Holonic Travel Planner</p>
      </div>
    `;
    
    return emailHTML;
  }

  generateEmailText(templateContent, userPreferences) {
    let text = 'Your Travel Itinerary\n\n';
    
    templateContent.sections.forEach(section => {
      if (['header', 'summary', 'top_picks'].includes(section.name)) {
        text += `${section.title}\n`;
        text += '='.repeat(section.title.length) + '\n';
        text += 'Section content would be rendered here\n\n';
      }
    });
    
    text += 'Generated by Holonic Travel Planner';
    return text;
  }

  optimizeForMobile(content) {
    // Optimize content for mobile display
    if (typeof content === 'object' && content !== null) {
      const optimized = {};
      
      // Keep only essential fields for mobile
      const essentialFields = ['title', 'name', 'price', 'rating', 'location', 'highlights'];
      
      Object.keys(content).forEach(key => {
        if (essentialFields.includes(key) || key.startsWith('mobile')) {
          optimized[key] = content[key];
        }
      });
      
      return optimized;
    }
    
    return content;
  }

  clearExpiredCache() {
    const now = Date.now();
    
    for (const [key, entry] of this.outputCache) {
      if (now - entry.timestamp > this.cacheTimeout) {
        this.outputCache.delete(key);
      }
    }
  }

  updateOutputStatistics() {
    logger.info('Output statistics update', {
      totalOutputs: this.outputStats.totalOutputs,
      averageGenerationTime: this.outputStats.averageGenerationTime,
      cacheSize: this.outputCache.size,
      formatStats: Object.keys(this.outputStats.formatStats).reduce((acc, format) => {
        const stats = this.outputStats.formatStats[format];
        acc[format] = {
          generated: stats.generated,
          avgTime: stats.avgTime.toFixed(0),
          avgSize: Math.round(stats.avgSize)
        };
        return acc;
      }, {})
    });
  }

  // Event handlers
  async handleFormatResults(event) {
    const { sagaId, data, format, customization } = event.data;
    
    try {
      const formattedContent = await this.formatContent(
        data, 
        format, 
        customization.userPreferences || {}, 
        customization
      );
      
      await this.publish('results-formatted', {
        sagaId,
        format,
        content: formattedContent,
        timestamp: Date.now()
      });
      
    } catch (error) {
      logger.error('Error formatting results:', error);
      
      await this.publish('formatting-failed', {
        sagaId,
        format,
        error: error.message,
        timestamp: Date.now()
      });
    }
  }

  async handleCustomizeOutput(event) {
    const { sagaId, outputData, customizations } = event.data;
    
    try {
      // Apply customizations to output data
      const customizedData = {
        ...outputData,
        customizations: customizations,
        customizedAt: Date.now()
      };
      
      // Clear cache to force regeneration with new customizations
      this.outputCache.clear();
      
      await this.publish('output-customized', {
        sagaId,
        customizedData,
        customizations,
        timestamp: Date.now()
      });
      
    } catch (error) {
      logger.error('Error customizing output:', error);
      
      await this.publish('customization-failed', {
        sagaId,
        error: error.message,
        timestamp: Date.now()
      });
    }
  }

  async handleValidateOutput(event) {
    const { sagaId, content, format, template } = event.data;
    
    try {
      const validation = await this.validateOutput(content, format, template);
      
      await this.publish('output-validated', {
        sagaId,
        validation,
        timestamp: Date.now()
      });
      
    } catch (error) {
      logger.error('Error validating output:', error);
      
      await this.publish('output-validation-failed', {
        sagaId,
        error: error.message,
        timestamp: Date.now()
      });
    }
  }

  async handleExportResults(event) {
    const { sagaId, content, exportFormat, destination } = event.data;
    
    try {
      let exportResult;
      
      switch (exportFormat) {
        case 'pdf':
          exportResult = await this.exportToPDF(content, destination);
          break;
        case 'email':
          exportResult = await this.exportToEmail(content, destination);
          break;
        case 'calendar':
          exportResult = await this.exportToCalendar(content, destination);
          break;
        case 'json':
          exportResult = await this.exportToJSON(content, destination);
          break;
        default:
          throw new Error(`Unsupported export format: ${exportFormat}`);
      }
      
      await this.publish('results-exported', {
        sagaId,
        exportFormat,
        exportResult,
        timestamp: Date.now()
      });
      
    } catch (error) {
      logger.error('Error exporting results:', error);
      
      this.outputStats.errorStats.formatErrors++;
      
      await this.publish('export-failed', {
        sagaId,
        exportFormat,
        error: error.message,
        timestamp: Date.now()
      });
    }
  }

  async exportToPDF(content, destination) {
    // Mock PDF export
    const pdfPath = `/exports/itinerary-${Date.now()}.pdf`;
    
    return {
      format: 'pdf',
      path: pdfPath,
      size: JSON.stringify(content).length,
      downloadUrl: `${destination.baseUrl}${pdfPath}`,
      expiresAt: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
    };
  }

  async exportToEmail(content, destination) {
    // Mock email export
    const emailData = {
      to: destination.email,
      subject: 'Your Travel Itinerary',
      content: content,
      sentAt: Date.now()
    };
    
    return {
      format: 'email',
      recipient: destination.email,
      messageId: `msg-${Date.now()}`,
      status: 'sent'
    };
  }

  async exportToCalendar(content, destination) {
    // Mock calendar export
    const calendarData = {
      format: 'ics',
      events: this.extractCalendarEvents(content),
      downloadUrl: `${destination.baseUrl}/calendar-${Date.now()}.ics`
    };
    
    return calendarData;
  }

  async exportToJSON(content, destination) {
    // Mock JSON export
    const jsonPath = `/exports/itinerary-${Date.now()}.json`;
    
    return {
      format: 'json',
      path: jsonPath,
      size: JSON.stringify(content).length,
      downloadUrl: `${destination.baseUrl}${jsonPath}`,
      compressed: destination.compress || false
    };
  }

  extractCalendarEvents(content) {
    const events = [];
    
    // Extract events from timeline or sections
    if (content.sections) {
      const timelineSection = content.sections.find(s => s.name === 'timeline');
      if (timelineSection && timelineSection.content.timeline) {
        timelineSection.content.timeline.forEach(item => {
          events.push({
            title: item.title,
            start: item.time,
            description: item.details?.description || '',
            location: item.details?.location?.address || ''
          });
        });
      }
    }
    
    return events;
  }

  // Query methods
  getOutputStatistics() {
    return {
      ...this.outputStats,
      cacheSize: this.outputCache.size,
      uptime: Date.now() - this.startTime
    };
  }

  getFormatCapabilities() {
    return {
      supportedFormats: Object.keys(this.outputFormats).filter(f => this.outputFormats[f].enabled),
      supportedTemplates: Object.keys(this.templates),
      personalizationOptions: Object.keys(this.personalizationRules),
      contentFilters: Object.keys(this.contentFilters).filter(f => this.contentFilters[f].enabled)
    };
  }

  async shutdown() {
    logger.info('Shutting down Output swarm');
    
    // Clear cache
    this.outputCache.clear();
    
    // Update final statistics
    this.updateOutputStatistics();
    
    await super.shutdown();
  }
}