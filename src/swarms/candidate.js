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

export class CandidateSwarm extends BaseHolon {
  constructor(orchestration) {
    super('CandidateSwarm', orchestration);
    this.config = getConfig();
    
    // Generator agents with minimum candidate requirements
    this.generators = {
      hotel: {
        minCandidates: 20,
        active: false,
        candidates: []
      },
      flight: {
        minCandidates: 30,
        active: false,
        candidates: []
      },
      activity: {
        minCandidates: 25,
        active: false,
        candidates: []
      },
      restaurant: {
        minCandidates: 25,
        active: false,
        candidates: []
      },
      car: {
        minCandidates: 15,
        active: false,
        candidates: []
      }
    };
    
    // Provider integrations (mock for now)
    this.providers = {
      hotels: ['Booking.com', 'Expedia', 'Hotels.com', 'Agoda'],
      flights: ['Amadeus', 'Sabre', 'Skyscanner', 'Kayak'],
      activities: ['Viator', 'GetYourGuide', 'Klook', 'TripAdvisor'],
      restaurants: ['OpenTable', 'Yelp', 'TripAdvisor', 'Zomato'],
      cars: ['Hertz', 'Avis', 'Enterprise', 'Budget']
    };
    
    // Generation status tracking
    this.generationStatus = {
      sagaId: null,
      startTime: null,
      completedCategories: new Set(),
      totalCandidates: 0,
      errors: []
    };
    
    // Cache for candidate data
    this.candidateCache = new Map();
    this.cacheTimeout = 300000; // 5 minutes
  }

  async initialize() {
    await super.initialize();
    
    // Subscribe to candidate generation events
    this.subscribe('generate-candidates', this.handleGenerateCandidates.bind(this));
    this.subscribe('provider-response', this.handleProviderResponse.bind(this));
    this.subscribe('cache-candidates', this.handleCacheCandidates.bind(this));
    
    logger.info('Candidate swarm initialized');
  }

  async handleGenerateCandidates(event) {
    const { sagaId, userInput, preferences, constraints } = event.data;
    
    try {
      // Initialize generation status
      this.generationStatus = {
        sagaId,
        startTime: Date.now(),
        completedCategories: new Set(),
        totalCandidates: 0,
        errors: []
      };
      
      logger.info(`Starting candidate generation for saga ${sagaId}`);
      
      // Extract travel parameters
      const travelParams = this.extractTravelParameters(userInput, preferences, constraints);
      
      // Check cache first
      const cacheKey = this.generateCacheKey(travelParams);
      const cachedCandidates = this.candidateCache.get(cacheKey);
      
      if (cachedCandidates && Date.now() - cachedCandidates.timestamp < this.cacheTimeout) {
        logger.info(`Using cached candidates for saga ${sagaId}`);
        
        await this.publish('candidates-generated', {
          sagaId,
          candidates: cachedCandidates.data,
          fromCache: true,
          timestamp: Date.now()
        });
        
        // Emit cache hit event
        await this.publish('cache-hit', {
          key: cacheKey,
          namespace: 'candidates'
        });
        
        return;
      }
      
      // Emit cache miss event
      await this.publish('cache-miss', {
        key: cacheKey,
        namespace: 'candidates'
      });
      
      // Generate candidates for each category in parallel
      const generationPromises = [];
      
      if (travelParams.needsHotel) {
        generationPromises.push(this.generateHotelCandidates(travelParams));
      }
      
      if (travelParams.needsFlight) {
        generationPromises.push(this.generateFlightCandidates(travelParams));
      }
      
      if (travelParams.needsActivities) {
        generationPromises.push(this.generateActivityCandidates(travelParams));
      }
      
      if (travelParams.needsRestaurants) {
        generationPromises.push(this.generateRestaurantCandidates(travelParams));
      }
      
      if (travelParams.needsCar) {
        generationPromises.push(this.generateCarCandidates(travelParams));
      }
      
      // Wait for all generations to complete
      const results = await Promise.allSettled(generationPromises);
      
      // Collect all candidates
      const allCandidates = {
        hotels: [],
        flights: [],
        activities: [],
        restaurants: [],
        cars: []
      };
      
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          const { category, candidates } = result.value;
          allCandidates[category] = candidates;
          this.generationStatus.totalCandidates += candidates.length;
        } else {
          this.generationStatus.errors.push(result.reason);
          logger.error('Candidate generation failed:', result.reason);
        }
      });
      
      // Cache the results
      this.candidateCache.set(cacheKey, {
        data: allCandidates,
        timestamp: Date.now()
      });
      
      // Publish candidates
      await this.publish('candidates-generated', {
        sagaId,
        candidates: allCandidates,
        fromCache: false,
        generationTime: Date.now() - this.generationStatus.startTime,
        totalCandidates: this.generationStatus.totalCandidates,
        errors: this.generationStatus.errors,
        timestamp: Date.now()
      });
      
      logger.info(`Candidate generation completed for saga ${sagaId}`, {
        totalCandidates: this.generationStatus.totalCandidates,
        generationTime: Date.now() - this.generationStatus.startTime
      });
      
    } catch (error) {
      logger.error('Error in candidate generation:', error);
      
      await this.publish('candidates-generation-failed', {
        sagaId,
        error: error.message,
        timestamp: Date.now()
      });
    }
  }

  extractTravelParameters(userInput, preferences, constraints) {
    return {
      destination: userInput.destination || preferences.destination,
      dates: {
        checkIn: userInput.checkIn || preferences.checkIn,
        checkOut: userInput.checkOut || preferences.checkOut,
        departure: userInput.departure || preferences.departure,
        return: userInput.return || preferences.return
      },
      partySize: userInput.partySize || preferences.partySize || 1,
      budget: {
        total: userInput.budget || preferences.budget,
        hotel: constraints.hotelBudget,
        flight: constraints.flightBudget,
        activities: constraints.activityBudget,
        dining: constraints.diningBudget,
        car: constraints.carBudget
      },
      preferences: {
        hotelClass: preferences.hotelClass || 3,
        flightClass: preferences.flightClass || 'economy',
        cuisine: preferences.cuisine || [],
        activities: preferences.activities || [],
        mobility: preferences.mobility || 'standard',
        dietary: preferences.dietary || []
      },
      constraints: {
        maxLayovers: constraints.maxLayovers || 1,
        refundable: constraints.refundable || false,
        accessibility: constraints.accessibility || false,
        petFriendly: constraints.petFriendly || false
      },
      needsHotel: !userInput.skipHotel,
      needsFlight: !userInput.skipFlight,
      needsActivities: !userInput.skipActivities,
      needsRestaurants: !userInput.skipRestaurants,
      needsCar: !userInput.skipCar
    };
  }

  generateCacheKey(travelParams) {
    const keyData = {
      destination: travelParams.destination,
      dates: travelParams.dates,
      partySize: travelParams.partySize,
      budget: travelParams.budget,
      preferences: travelParams.preferences
    };
    
    return `candidates-${Buffer.from(JSON.stringify(keyData)).toString('base64').slice(0, 32)}`;
  }

  async generateHotelCandidates(travelParams) {
    const startTime = Date.now();
    const candidates = [];
    
    try {
      // Simulate API calls to multiple hotel providers
      for (const provider of this.providers.hotels) {
        const providerCandidates = await this.fetchHotelCandidates(provider, travelParams);
        candidates.push(...providerCandidates);
      }
      
      // Ensure minimum candidates
      if (candidates.length < this.generators.hotel.minCandidates) {
        logger.warn(`Hotel candidates below minimum: ${candidates.length}/${this.generators.hotel.minCandidates}`);
        
        // Generate additional synthetic candidates if needed
        const syntheticCandidates = await this.generateSyntheticHotels(travelParams, 
          this.generators.hotel.minCandidates - candidates.length);
        candidates.push(...syntheticCandidates);
      }
      
      // Normalize and deduplicate
      const normalizedCandidates = this.normalizeHotelCandidates(candidates);
      const uniqueCandidates = this.deduplicateCandidates(normalizedCandidates, 'hotel');
      
      logger.info(`Generated ${uniqueCandidates.length} hotel candidates in ${Date.now() - startTime}ms`);
      
      return {
        category: 'hotels',
        candidates: uniqueCandidates
      };
      
    } catch (error) {
      logger.error('Error generating hotel candidates:', error);
      throw new Error(`Hotel generation failed: ${error.message}`);
    }
  }

  async fetchHotelCandidates(provider, travelParams) {
    // Simulate API call with realistic delay
    await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 500));
    
    const candidates = [];
    const basePrice = 100 + Math.random() * 300;
    
    // Generate 5-8 candidates per provider
    const count = Math.floor(Math.random() * 4) + 5;
    
    for (let i = 0; i < count; i++) {
      candidates.push({
        id: `${provider.toLowerCase()}-hotel-${i + 1}`,
        provider,
        name: `Hotel ${provider} ${i + 1}`,
        location: travelParams.destination,
        price: Math.round(basePrice * (0.8 + Math.random() * 0.4)),
        currency: 'EUR',
        rating: Math.round((3 + Math.random() * 2) * 10) / 10,
        reviewCount: Math.floor(Math.random() * 1000) + 100,
        amenities: this.generateHotelAmenities(),
        images: this.generateImagePlaceholders('hotel', 3),
        coordinates: this.generateCoordinates(travelParams.destination),
        availability: true,
        cancellation: {
          free: Math.random() > 0.3,
          deadline: new Date(Date.now() + 86400000 * (1 + Math.random() * 7))
        },
        breakfast: Math.random() > 0.5,
        wifi: Math.random() > 0.2,
        parking: Math.random() > 0.6
      });
    }
    
    return candidates;
  }

  async generateFlightCandidates(travelParams) {
    const startTime = Date.now();
    const candidates = [];
    
    try {
      // Simulate API calls to multiple flight providers
      for (const provider of this.providers.flights) {
        const providerCandidates = await this.fetchFlightCandidates(provider, travelParams);
        candidates.push(...providerCandidates);
      }
      
      // Ensure minimum candidates
      if (candidates.length < this.generators.flight.minCandidates) {
        logger.warn(`Flight candidates below minimum: ${candidates.length}/${this.generators.flight.minCandidates}`);
        
        const syntheticCandidates = await this.generateSyntheticFlights(travelParams, 
          this.generators.flight.minCandidates - candidates.length);
        candidates.push(...syntheticCandidates);
      }
      
      const normalizedCandidates = this.normalizeFlightCandidates(candidates);
      const uniqueCandidates = this.deduplicateCandidates(normalizedCandidates, 'flight');
      
      logger.info(`Generated ${uniqueCandidates.length} flight candidates in ${Date.now() - startTime}ms`);
      
      return {
        category: 'flights',
        candidates: uniqueCandidates
      };
      
    } catch (error) {
      logger.error('Error generating flight candidates:', error);
      throw new Error(`Flight generation failed: ${error.message}`);
    }
  }

  async fetchFlightCandidates(provider, travelParams) {
    await new Promise(resolve => setTimeout(resolve, Math.random() * 1500 + 800));
    
    const candidates = [];
    const basePrice = 200 + Math.random() * 800;
    const airlines = ['Lufthansa', 'Air France', 'British Airways', 'KLM', 'Ryanair', 'EasyJet'];
    
    const count = Math.floor(Math.random() * 6) + 7;
    
    for (let i = 0; i < count; i++) {
      const layovers = Math.random() > 0.6 ? Math.floor(Math.random() * 2) + 1 : 0;
      
      candidates.push({
        id: `${provider.toLowerCase()}-flight-${i + 1}`,
        provider,
        airline: airlines[Math.floor(Math.random() * airlines.length)],
        flightNumber: `${this.generateFlightCode()}${Math.floor(Math.random() * 9000) + 1000}`,
        price: Math.round(basePrice * (0.7 + Math.random() * 0.6)),
        currency: 'EUR',
        departure: {
          airport: this.getAirportCode(travelParams.origin || 'Berlin'),
          time: travelParams.dates.departure,
          terminal: Math.floor(Math.random() * 3) + 1
        },
        arrival: {
          airport: this.getAirportCode(travelParams.destination),
          time: new Date(new Date(travelParams.dates.departure).getTime() + (2 + Math.random() * 10) * 3600000),
          terminal: Math.floor(Math.random() * 3) + 1
        },
        duration: Math.floor(2 + Math.random() * 10) * 60, // minutes
        layovers,
        class: travelParams.preferences.flightClass,
        baggage: {
          carry: true,
          checked: Math.random() > 0.3,
          weight: Math.random() > 0.5 ? 23 : 20
        },
        refundable: travelParams.constraints.refundable && Math.random() > 0.7,
        changeable: Math.random() > 0.4,
        seatSelection: Math.random() > 0.3,
        meal: layovers > 0 || Math.random() > 0.5
      });
    }
    
    return candidates;
  }

  async generateActivityCandidates(travelParams) {
    const startTime = Date.now();
    const candidates = [];
    
    try {
      for (const provider of this.providers.activities) {
        const providerCandidates = await this.fetchActivityCandidates(provider, travelParams);
        candidates.push(...providerCandidates);
      }
      
      if (candidates.length < this.generators.activity.minCandidates) {
        const syntheticCandidates = await this.generateSyntheticActivities(travelParams, 
          this.generators.activity.minCandidates - candidates.length);
        candidates.push(...syntheticCandidates);
      }
      
      const normalizedCandidates = this.normalizeActivityCandidates(candidates);
      const uniqueCandidates = this.deduplicateCandidates(normalizedCandidates, 'activity');
      
      logger.info(`Generated ${uniqueCandidates.length} activity candidates in ${Date.now() - startTime}ms`);
      
      return {
        category: 'activities',
        candidates: uniqueCandidates
      };
      
    } catch (error) {
      logger.error('Error generating activity candidates:', error);
      throw new Error(`Activity generation failed: ${error.message}`);
    }
  }

  async fetchActivityCandidates(provider, travelParams) {
    await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 600));
    
    const candidates = [];
    const activityTypes = ['Museum', 'Tour', 'Experience', 'Adventure', 'Cultural', 'Entertainment'];
    const count = Math.floor(Math.random() * 5) + 6;
    
    for (let i = 0; i < count; i++) {
      const type = activityTypes[Math.floor(Math.random() * activityTypes.length)];
      
      candidates.push({
        id: `${provider.toLowerCase()}-activity-${i + 1}`,
        provider,
        name: `${type} ${provider} ${i + 1}`,
        type,
        location: travelParams.destination,
        price: Math.round((20 + Math.random() * 150) * travelParams.partySize),
        currency: 'EUR',
        duration: Math.floor(1 + Math.random() * 8) * 60, // minutes
        rating: Math.round((3.5 + Math.random() * 1.5) * 10) / 10,
        reviewCount: Math.floor(Math.random() * 500) + 50,
        description: `Amazing ${type.toLowerCase()} experience in ${travelParams.destination}`,
        images: this.generateImagePlaceholders('activity', 4),
        coordinates: this.generateCoordinates(travelParams.destination),
        availability: this.generateAvailabilitySlots(travelParams.dates),
        cancellation: {
          free: Math.random() > 0.4,
          deadline: 24 // hours before
        },
        accessibility: travelParams.constraints.accessibility ? Math.random() > 0.3 : Math.random() > 0.7,
        languages: ['English', 'German', 'Spanish'],
        groupSize: {
          min: 1,
          max: Math.floor(Math.random() * 20) + 5
        }
      });
    }
    
    return candidates;
  }

  async generateRestaurantCandidates(travelParams) {
    const startTime = Date.now();
    const candidates = [];
    
    try {
      for (const provider of this.providers.restaurants) {
        const providerCandidates = await this.fetchRestaurantCandidates(provider, travelParams);
        candidates.push(...providerCandidates);
      }
      
      if (candidates.length < this.generators.restaurant.minCandidates) {
        const syntheticCandidates = await this.generateSyntheticRestaurants(travelParams, 
          this.generators.restaurant.minCandidates - candidates.length);
        candidates.push(...syntheticCandidates);
      }
      
      const normalizedCandidates = this.normalizeRestaurantCandidates(candidates);
      const uniqueCandidates = this.deduplicateCandidates(normalizedCandidates, 'restaurant');
      
      logger.info(`Generated ${uniqueCandidates.length} restaurant candidates in ${Date.now() - startTime}ms`);
      
      return {
        category: 'restaurants',
        candidates: uniqueCandidates
      };
      
    } catch (error) {
      logger.error('Error generating restaurant candidates:', error);
      throw new Error(`Restaurant generation failed: ${error.message}`);
    }
  }

  async fetchRestaurantCandidates(provider, travelParams) {
    await new Promise(resolve => setTimeout(resolve, Math.random() * 800 + 400));
    
    const candidates = [];
    const cuisines = ['Italian', 'French', 'German', 'Asian', 'Mediterranean', 'American', 'Local'];
    const count = Math.floor(Math.random() * 5) + 6;
    
    for (let i = 0; i < count; i++) {
      const cuisine = cuisines[Math.floor(Math.random() * cuisines.length)];
      
      candidates.push({
        id: `${provider.toLowerCase()}-restaurant-${i + 1}`,
        provider,
        name: `${cuisine} Restaurant ${i + 1}`,
        cuisine,
        location: travelParams.destination,
        priceRange: Math.floor(Math.random() * 4) + 1, // 1-4 $ signs
        rating: Math.round((3.5 + Math.random() * 1.5) * 10) / 10,
        reviewCount: Math.floor(Math.random() * 800) + 100,
        description: `Authentic ${cuisine.toLowerCase()} cuisine in the heart of ${travelParams.destination}`,
        images: this.generateImagePlaceholders('restaurant', 3),
        coordinates: this.generateCoordinates(travelParams.destination),
        openingHours: this.generateOpeningHours(),
        reservationRequired: Math.random() > 0.4,
        dietary: this.generateDietaryOptions(),
        atmosphere: this.generateAtmosphere(),
        dressCode: Math.random() > 0.7 ? 'Smart casual' : 'Casual',
        parking: Math.random() > 0.6,
        outdoorSeating: Math.random() > 0.5
      });
    }
    
    return candidates;
  }

  async generateCarCandidates(travelParams) {
    const startTime = Date.now();
    const candidates = [];
    
    try {
      for (const provider of this.providers.cars) {
        const providerCandidates = await this.fetchCarCandidates(provider, travelParams);
        candidates.push(...providerCandidates);
      }
      
      if (candidates.length < this.generators.car.minCandidates) {
        const syntheticCandidates = await this.generateSyntheticCars(travelParams, 
          this.generators.car.minCandidates - candidates.length);
        candidates.push(...syntheticCandidates);
      }
      
      const normalizedCandidates = this.normalizeCarCandidates(candidates);
      const uniqueCandidates = this.deduplicateCandidates(normalizedCandidates, 'car');
      
      logger.info(`Generated ${uniqueCandidates.length} car candidates in ${Date.now() - startTime}ms`);
      
      return {
        category: 'cars',
        candidates: uniqueCandidates
      };
      
    } catch (error) {
      logger.error('Error generating car candidates:', error);
      throw new Error(`Car generation failed: ${error.message}`);
    }
  }

  async fetchCarCandidates(provider, travelParams) {
    await new Promise(resolve => setTimeout(resolve, Math.random() * 600 + 300));
    
    const candidates = [];
    const carTypes = ['Economy', 'Compact', 'Mid-size', 'Full-size', 'SUV', 'Luxury'];
    const brands = ['Volkswagen', 'BMW', 'Mercedes', 'Audi', 'Ford', 'Opel'];
    const count = Math.floor(Math.random() * 3) + 3;
    
    for (let i = 0; i < count; i++) {
      const carType = carTypes[Math.floor(Math.random() * carTypes.length)];
      const brand = brands[Math.floor(Math.random() * brands.length)];
      
      candidates.push({
        id: `${provider.toLowerCase()}-car-${i + 1}`,
        provider,
        brand,
        model: `${brand} ${carType} ${i + 1}`,
        type: carType,
        price: Math.round((25 + Math.random() * 100) * this.calculateRentalDays(travelParams.dates)),
        currency: 'EUR',
        pricePerDay: Math.round(25 + Math.random() * 100),
        seats: this.getSeatsForCarType(carType),
        doors: Math.random() > 0.3 ? 4 : 2,
        transmission: Math.random() > 0.6 ? 'Automatic' : 'Manual',
        fuelType: Math.random() > 0.8 ? 'Electric' : Math.random() > 0.3 ? 'Petrol' : 'Diesel',
        airConditioning: Math.random() > 0.2,
        gps: Math.random() > 0.4,
        images: this.generateImagePlaceholders('car', 2),
        pickup: {
          location: `${travelParams.destination} Airport`,
          coordinates: this.generateCoordinates(travelParams.destination)
        },
        dropoff: {
          location: `${travelParams.destination} Airport`,
          coordinates: this.generateCoordinates(travelParams.destination)
        },
        insurance: {
          basic: true,
          comprehensive: Math.random() > 0.5,
          excess: Math.round(200 + Math.random() * 800)
        },
        mileage: Math.random() > 0.7 ? 'Unlimited' : `${Math.floor(100 + Math.random() * 400)} km/day`,
        cancellation: {
          free: Math.random() > 0.3,
          deadline: Math.floor(Math.random() * 48) + 24 // hours
        }
      });
    }
    
    return candidates;
  }

  // Normalization methods
  normalizeHotelCandidates(candidates) {
    return candidates.map(candidate => ({
      ...candidate,
      score: this.calculateHotelScore(candidate),
      normalizedPrice: this.normalizePrice(candidate.price, 'hotel'),
      category: 'hotel'
    }));
  }

  normalizeFlightCandidates(candidates) {
    return candidates.map(candidate => ({
      ...candidate,
      score: this.calculateFlightScore(candidate),
      normalizedPrice: this.normalizePrice(candidate.price, 'flight'),
      category: 'flight'
    }));
  }

  normalizeActivityCandidates(candidates) {
    return candidates.map(candidate => ({
      ...candidate,
      score: this.calculateActivityScore(candidate),
      normalizedPrice: this.normalizePrice(candidate.price, 'activity'),
      category: 'activity'
    }));
  }

  normalizeRestaurantCandidates(candidates) {
    return candidates.map(candidate => ({
      ...candidate,
      score: this.calculateRestaurantScore(candidate),
      normalizedPrice: this.normalizePriceRange(candidate.priceRange),
      category: 'restaurant'
    }));
  }

  normalizeCarCandidates(candidates) {
    return candidates.map(candidate => ({
      ...candidate,
      score: this.calculateCarScore(candidate),
      normalizedPrice: this.normalizePrice(candidate.price, 'car'),
      category: 'car'
    }));
  }

  // Scoring methods (0-1 scale)
  calculateHotelScore(hotel) {
    const ratingScore = hotel.rating / 5;
    const reviewScore = Math.min(hotel.reviewCount / 500, 1);
    const amenityScore = hotel.amenities.length / 10;
    
    return (ratingScore * 0.5 + reviewScore * 0.3 + amenityScore * 0.2);
  }

  calculateFlightScore(flight) {
    const layoverPenalty = flight.layovers * 0.1;
    const durationScore = Math.max(0, 1 - (flight.duration - 120) / 600); // Penalty for long flights
    const serviceScore = (flight.baggage.checked ? 0.2 : 0) + (flight.meal ? 0.1 : 0) + (flight.seatSelection ? 0.1 : 0);
    
    return Math.max(0, 0.6 + durationScore * 0.3 + serviceScore - layoverPenalty);
  }

  calculateActivityScore(activity) {
    const ratingScore = (activity.rating - 3) / 2; // Normalize 3-5 to 0-1
    const reviewScore = Math.min(activity.reviewCount / 200, 1);
    const accessibilityBonus = activity.accessibility ? 0.1 : 0;
    
    return Math.max(0, ratingScore * 0.6 + reviewScore * 0.3 + 0.1 + accessibilityBonus);
  }

  calculateRestaurantScore(restaurant) {
    const ratingScore = (restaurant.rating - 3) / 2;
    const reviewScore = Math.min(restaurant.reviewCount / 300, 1);
    const dietaryScore = restaurant.dietary.length / 5;
    
    return Math.max(0, ratingScore * 0.5 + reviewScore * 0.3 + dietaryScore * 0.2);
  }

  calculateCarScore(car) {
    const typeScore = {
      'Economy': 0.6,
      'Compact': 0.7,
      'Mid-size': 0.8,
      'Full-size': 0.9,
      'SUV': 0.85,
      'Luxury': 1.0
    }[car.type] || 0.7;
    
    const featureScore = (car.airConditioning ? 0.1 : 0) + (car.gps ? 0.1 : 0) + (car.transmission === 'Automatic' ? 0.1 : 0);
    
    return Math.min(1, typeScore + featureScore);
  }

  normalizePrice(price, category) {
    const ranges = {
      hotel: { min: 50, max: 500 },
      flight: { min: 100, max: 1200 },
      activity: { min: 10, max: 200 },
      car: { min: 100, max: 800 }
    };
    
    const range = ranges[category];
    return Math.max(0, Math.min(1, (price - range.min) / (range.max - range.min)));
  }

  normalizePriceRange(priceRange) {
    return (priceRange - 1) / 3; // Convert 1-4 to 0-1
  }

  deduplicateCandidates(candidates, category) {
    const seen = new Set();
    const unique = [];
    
    for (const candidate of candidates) {
      const key = this.generateDeduplicationKey(candidate, category);
      
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(candidate);
      }
    }
    
    return unique;
  }

  generateDeduplicationKey(candidate, category) {
    switch (category) {
      case 'hotel':
        return `${candidate.name}-${candidate.location}-${candidate.price}`;
      case 'flight':
        return `${candidate.airline}-${candidate.departure.airport}-${candidate.arrival.airport}-${candidate.departure.time}`;
      case 'activity':
        return `${candidate.name}-${candidate.location}-${candidate.type}`;
      case 'restaurant':
        return `${candidate.name}-${candidate.location}-${candidate.cuisine}`;
      case 'car':
        return `${candidate.brand}-${candidate.model}-${candidate.type}-${candidate.price}`;
      default:
        return candidate.id;
    }
  }

  // Helper methods for generating synthetic data
  generateHotelAmenities() {
    const allAmenities = ['WiFi', 'Pool', 'Gym', 'Spa', 'Restaurant', 'Bar', 'Room Service', 'Concierge', 'Parking', 'Pet Friendly'];
    const count = Math.floor(Math.random() * 6) + 3;
    
    return allAmenities.sort(() => 0.5 - Math.random()).slice(0, count);
  }

  generateImagePlaceholders(type, count) {
    const images = [];
    
    for (let i = 0; i < count; i++) {
      images.push({
        url: `https://placeholder.com/400x300/${type}/${i + 1}`,
        alt: `${type} image ${i + 1}`,
        license: {
          valid: true,
          source: 'Stock Photos Inc.',
          type: 'Commercial'
        }
      });
    }
    
    return images;
  }

  generateCoordinates(destination) {
    // Simplified coordinate generation based on destination
    const baseCoords = {
      'Berlin': { lat: 52.5200, lng: 13.4050 },
      'Paris': { lat: 48.8566, lng: 2.3522 },
      'London': { lat: 51.5074, lng: -0.1278 },
      'Rome': { lat: 41.9028, lng: 12.4964 },
      'Barcelona': { lat: 41.3851, lng: 2.1734 }
    };
    
    const base = baseCoords[destination] || baseCoords['Berlin'];
    
    return {
      lat: base.lat + (Math.random() - 0.5) * 0.1,
      lng: base.lng + (Math.random() - 0.5) * 0.1
    };
  }

  generateAvailabilitySlots(dates) {
    const slots = [];
    const start = new Date(dates.checkIn);
    const end = new Date(dates.checkOut);
    
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      if (Math.random() > 0.2) { // 80% availability
        slots.push({
          date: new Date(d),
          times: ['09:00', '11:00', '14:00', '16:00'].filter(() => Math.random() > 0.3)
        });
      }
    }
    
    return slots;
  }

  generateOpeningHours() {
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const hours = {};
    
    days.forEach(day => {
      if (Math.random() > 0.1) { // 90% chance open
        hours[day] = {
          open: '11:00',
          close: Math.random() > 0.5 ? '22:00' : '23:00'
        };
      } else {
        hours[day] = 'Closed';
      }
    });
    
    return hours;
  }

  generateDietaryOptions() {
    const options = ['Vegetarian', 'Vegan', 'Gluten-Free', 'Halal', 'Kosher', 'Dairy-Free'];
    const count = Math.floor(Math.random() * 4);
    
    return options.sort(() => 0.5 - Math.random()).slice(0, count);
  }

  generateAtmosphere() {
    const atmospheres = ['Casual', 'Fine Dining', 'Family Friendly', 'Romantic', 'Business', 'Trendy'];
    return atmospheres[Math.floor(Math.random() * atmospheres.length)];
  }

  getAirportCode(city) {
    const codes = {
      'Berlin': 'BER',
      'Paris': 'CDG',
      'London': 'LHR',
      'Rome': 'FCO',
      'Barcelona': 'BCN',
      'Madrid': 'MAD',
      'Amsterdam': 'AMS',
      'Frankfurt': 'FRA'
    };
    
    return codes[city] || 'XXX';
  }

  generateFlightCode() {
    const codes = ['LH', 'AF', 'BA', 'KL', 'FR', 'U2', 'EW', 'AB'];
    return codes[Math.floor(Math.random() * codes.length)];
  }

  getSeatsForCarType(type) {
    const seats = {
      'Economy': 4,
      'Compact': 4,
      'Mid-size': 5,
      'Full-size': 5,
      'SUV': 7,
      'Luxury': 4
    };
    
    return seats[type] || 4;
  }

  calculateRentalDays(dates) {
    const start = new Date(dates.checkIn);
    const end = new Date(dates.checkOut);
    return Math.ceil((end - start) / (1000 * 60 * 60 * 24));
  }

  // Synthetic candidate generation for minimum requirements
  async generateSyntheticHotels(travelParams, count) {
    const synthetic = [];
    
    for (let i = 0; i < count; i++) {
      synthetic.push({
        id: `synthetic-hotel-${i + 1}`,
        provider: 'Synthetic',
        name: `Budget Hotel ${i + 1}`,
        location: travelParams.destination,
        price: Math.round(60 + Math.random() * 80),
        currency: 'EUR',
        rating: Math.round((2.5 + Math.random() * 1.5) * 10) / 10,
        reviewCount: Math.floor(Math.random() * 200) + 50,
        amenities: ['WiFi', 'Reception'],
        images: this.generateImagePlaceholders('hotel', 2),
        coordinates: this.generateCoordinates(travelParams.destination),
        availability: true,
        cancellation: { free: false },
        breakfast: false,
        wifi: true,
        parking: Math.random() > 0.5
      });
    }
    
    return synthetic;
  }

  async generateSyntheticFlights(travelParams, count) {
    const synthetic = [];
    
    for (let i = 0; i < count; i++) {
      synthetic.push({
        id: `synthetic-flight-${i + 1}`,
        provider: 'Synthetic',
        airline: 'Budget Air',
        flightNumber: `BA${Math.floor(Math.random() * 9000) + 1000}`,
        price: Math.round(150 + Math.random() * 200),
        currency: 'EUR',
        departure: {
          airport: this.getAirportCode(travelParams.origin || 'Berlin'),
          time: travelParams.dates.departure,
          terminal: 1
        },
        arrival: {
          airport: this.getAirportCode(travelParams.destination),
          time: new Date(new Date(travelParams.dates.departure).getTime() + (3 + Math.random() * 5) * 3600000),
          terminal: 1
        },
        duration: Math.floor(3 + Math.random() * 5) * 60,
        layovers: Math.random() > 0.7 ? 1 : 0,
        class: 'economy',
        baggage: { carry: true, checked: false },
        refundable: false,
        changeable: false,
        seatSelection: false,
        meal: false
      });
    }
    
    return synthetic;
  }

  async generateSyntheticActivities(travelParams, count) {
    const synthetic = [];
    const types = ['Walking Tour', 'Museum Visit', 'City Experience'];
    
    for (let i = 0; i < count; i++) {
      const type = types[Math.floor(Math.random() * types.length)];
      
      synthetic.push({
        id: `synthetic-activity-${i + 1}`,
        provider: 'Synthetic',
        name: `${type} ${i + 1}`,
        type,
        location: travelParams.destination,
        price: Math.round((15 + Math.random() * 50) * travelParams.partySize),
        currency: 'EUR',
        duration: Math.floor(1 + Math.random() * 3) * 60,
        rating: Math.round((3.0 + Math.random() * 1.0) * 10) / 10,
        reviewCount: Math.floor(Math.random() * 100) + 20,
        description: `Basic ${type.toLowerCase()} in ${travelParams.destination}`,
        images: this.generateImagePlaceholders('activity', 2),
        coordinates: this.generateCoordinates(travelParams.destination),
        availability: this.generateAvailabilitySlots(travelParams.dates),
        cancellation: { free: true, deadline: 24 },
        accessibility: false,
        languages: ['English'],
        groupSize: { min: 1, max: 15 }
      });
    }
    
    return synthetic;
  }

  async generateSyntheticRestaurants(travelParams, count) {
    const synthetic = [];
    const cuisines = ['Local', 'International', 'Fast Food'];
    
    for (let i = 0; i < count; i++) {
      const cuisine = cuisines[Math.floor(Math.random() * cuisines.length)];
      
      synthetic.push({
        id: `synthetic-restaurant-${i + 1}`,
        provider: 'Synthetic',
        name: `${cuisine} Restaurant ${i + 1}`,
        cuisine,
        location: travelParams.destination,
        priceRange: Math.floor(Math.random() * 2) + 1, // 1-2 $ signs
        rating: Math.round((3.0 + Math.random() * 1.0) * 10) / 10,
        reviewCount: Math.floor(Math.random() * 150) + 30,
        description: `Simple ${cuisine.toLowerCase()} restaurant`,
        images: this.generateImagePlaceholders('restaurant', 2),
        coordinates: this.generateCoordinates(travelParams.destination),
        openingHours: this.generateOpeningHours(),
        reservationRequired: false,
        dietary: [],
        atmosphere: 'Casual',
        dressCode: 'Casual',
        parking: Math.random() > 0.5,
        outdoorSeating: Math.random() > 0.7
      });
    }
    
    return synthetic;
  }

  async generateSyntheticCars(travelParams, count) {
    const synthetic = [];
    const types = ['Economy', 'Compact'];
    
    for (let i = 0; i < count; i++) {
      const type = types[Math.floor(Math.random() * types.length)];
      
      synthetic.push({
        id: `synthetic-car-${i + 1}`,
        provider: 'Synthetic',
        brand: 'Generic',
        model: `${type} Car ${i + 1}`,
        type,
        price: Math.round((30 + Math.random() * 40) * this.calculateRentalDays(travelParams.dates)),
        currency: 'EUR',
        pricePerDay: Math.round(30 + Math.random() * 40),
        seats: 4,
        doors: 4,
        transmission: 'Manual',
        fuelType: 'Petrol',
        airConditioning: type === 'Compact',
        gps: false,
        images: this.generateImagePlaceholders('car', 1),
        pickup: {
          location: `${travelParams.destination} Airport`,
          coordinates: this.generateCoordinates(travelParams.destination)
        },
        dropoff: {
          location: `${travelParams.destination} Airport`,
          coordinates: this.generateCoordinates(travelParams.destination)
        },
        insurance: { basic: true, comprehensive: false, excess: 500 },
        mileage: '200 km/day',
        cancellation: { free: true, deadline: 48 }
      });
    }
    
    return synthetic;
  }

  async handleProviderResponse(event) {
    // Handle responses from external providers
    const { provider, category, candidates, error } = event.data;
    
    if (error) {
      logger.error(`Provider ${provider} error for ${category}:`, error);
      this.generationStatus.errors.push({ provider, category, error });
    } else {
      logger.info(`Received ${candidates.length} candidates from ${provider} for ${category}`);
      this.generators[category].candidates.push(...candidates);
    }
  }

  async handleCacheCandidates(event) {
    const { key, candidates } = event.data;
    
    this.candidateCache.set(key, {
      data: candidates,
      timestamp: Date.now()
    });
    
    logger.info(`Cached candidates with key: ${key}`);
  }

  // Cache management
  clearExpiredCache() {
    const now = Date.now();
    
    for (const [key, entry] of this.candidateCache) {
      if (now - entry.timestamp > this.cacheTimeout) {
        this.candidateCache.delete(key);
      }
    }
  }

  getCacheStats() {
    return {
      size: this.candidateCache.size,
      timeout: this.cacheTimeout,
      entries: Array.from(this.candidateCache.keys())
    };
  }

  async shutdown() {
    logger.info('Shutting down Candidate swarm');
    
    // Clear all data
    Object.keys(this.generators).forEach(key => {
      this.generators[key].candidates = [];
      this.generators[key].active = false;
    });
    
    this.candidateCache.clear();
    
    await super.shutdown();
  }
}