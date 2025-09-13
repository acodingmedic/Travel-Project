import React, { useState, useEffect } from 'react';
import { Calendar, MapPin, Users, DollarSign, Clock, Star, Filter, Search, Plus, X } from 'lucide-react';
import './ClassicForm.css';

const ClassicForm = ({ onSearch, isLoading = false }) => {
  const [formData, setFormData] = useState({
    destination: '',
    departureDate: '',
    returnDate: '',
    travelers: {
      adults: 2,
      children: 0,
      infants: 0
    },
    budget: {
      min: '',
      max: '',
      currency: 'USD'
    },
    tripType: 'roundtrip',
    accommodation: {
      type: '',
      rating: '',
      amenities: []
    },
    activities: [],
    preferences: {
      pace: 'moderate',
      style: 'balanced',
      accessibility: false,
      dietary: []
    },
    transportation: {
      preferred: '',
      class: 'economy'
    }
  });

  const [errors, setErrors] = useState({});
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [destinationSuggestions, setDestinationSuggestions] = useState([]);
  const [showDestinationSuggestions, setShowDestinationSuggestions] = useState(false);

  // Popular destinations for suggestions
  const popularDestinations = [
    { name: 'Paris, France', type: 'city', region: 'Europe' },
    { name: 'Tokyo, Japan', type: 'city', region: 'Asia' },
    { name: 'New York, USA', type: 'city', region: 'North America' },
    { name: 'Bali, Indonesia', type: 'island', region: 'Asia' },
    { name: 'Rome, Italy', type: 'city', region: 'Europe' },
    { name: 'Barcelona, Spain', type: 'city', region: 'Europe' },
    { name: 'Thailand', type: 'country', region: 'Asia' },
    { name: 'Iceland', type: 'country', region: 'Europe' },
    { name: 'Costa Rica', type: 'country', region: 'Central America' },
    { name: 'Morocco', type: 'country', region: 'Africa' }
  ];

  const accommodationTypes = [
    { value: 'hotel', label: 'Hotel' },
    { value: 'resort', label: 'Resort' },
    { value: 'apartment', label: 'Apartment/Rental' },
    { value: 'hostel', label: 'Hostel' },
    { value: 'villa', label: 'Villa' },
    { value: 'boutique', label: 'Boutique Hotel' },
    { value: 'camping', label: 'Camping' },
    { value: 'cruise', label: 'Cruise' }
  ];

  const amenityOptions = [
    'WiFi', 'Pool', 'Spa', 'Gym', 'Restaurant', 'Bar', 'Beach Access',
    'Pet Friendly', 'Business Center', 'Parking', 'Airport Shuttle',
    'Room Service', 'Concierge', 'Laundry Service'
  ];

  const activityOptions = [
    'Sightseeing', 'Adventure Sports', 'Cultural Tours', 'Food & Dining',
    'Shopping', 'Nightlife', 'Museums', 'Nature & Wildlife', 'Beach Activities',
    'Photography', 'Wellness & Spa', 'Local Experiences', 'Art & History',
    'Music & Entertainment', 'Sports Events'
  ];

  const dietaryOptions = [
    'Vegetarian', 'Vegan', 'Gluten-Free', 'Halal', 'Kosher',
    'Dairy-Free', 'Nut-Free', 'Low-Carb', 'Keto'
  ];

  // Handle destination input and suggestions
  useEffect(() => {
    if (formData.destination.length > 1) {
      const filtered = popularDestinations.filter(dest =>
        dest.name.toLowerCase().includes(formData.destination.toLowerCase())
      );
      setDestinationSuggestions(filtered.slice(0, 5));
      setShowDestinationSuggestions(filtered.length > 0);
    } else {
      setShowDestinationSuggestions(false);
    }
  }, [formData.destination]);

  // Validation
  const validateForm = () => {
    const newErrors = {};

    if (!formData.destination.trim()) {
      newErrors.destination = 'Destination is required';
    }

    if (!formData.departureDate) {
      newErrors.departureDate = 'Departure date is required';
    } else if (new Date(formData.departureDate) < new Date()) {
      newErrors.departureDate = 'Departure date must be in the future';
    }

    if (formData.tripType === 'roundtrip' && !formData.returnDate) {
      newErrors.returnDate = 'Return date is required for round trips';
    } else if (formData.returnDate && new Date(formData.returnDate) <= new Date(formData.departureDate)) {
      newErrors.returnDate = 'Return date must be after departure date';
    }

    if (formData.travelers.adults < 1) {
      newErrors.travelers = 'At least one adult traveler is required';
    }

    if (formData.budget.min && formData.budget.max && 
        parseInt(formData.budget.min) >= parseInt(formData.budget.max)) {
      newErrors.budget = 'Maximum budget must be greater than minimum budget';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (validateForm() && !isLoading) {
      onSearch(formData);
    }
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    
    // Clear related errors
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const handleNestedChange = (parent, field, value) => {
    setFormData(prev => ({
      ...prev,
      [parent]: {
        ...prev[parent],
        [field]: value
      }
    }));
  };

  const handleArrayToggle = (parent, field, item) => {
    setFormData(prev => {
      const currentArray = prev[parent]?.[field] || prev[field] || [];
      const newArray = currentArray.includes(item)
        ? currentArray.filter(i => i !== item)
        : [...currentArray, item];
      
      if (parent) {
        return {
          ...prev,
          [parent]: {
            ...prev[parent],
            [field]: newArray
          }
        };
      } else {
        return {
          ...prev,
          [field]: newArray
        };
      }
    });
  };

  const handleDestinationSelect = (destination) => {
    setFormData(prev => ({ ...prev, destination: destination.name }));
    setShowDestinationSuggestions(false);
  };

  const getTotalTravelers = () => {
    return formData.travelers.adults + formData.travelers.children + formData.travelers.infants;
  };

  const getMinDate = () => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  };

  const getMinReturnDate = () => {
    if (formData.departureDate) {
      const departure = new Date(formData.departureDate);
      departure.setDate(departure.getDate() + 1);
      return departure.toISOString().split('T')[0];
    }
    return getMinDate();
  };

  return (
    <div className="classic-form-container">
      <div className="classic-form-header">
        <h1 className="classic-form-title">
          Plan Your Perfect Trip
        </h1>
        <p className="classic-form-subtitle">
          Fill in the details below to get personalized travel recommendations.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="classic-form">
        {/* Basic Information */}
        <div className="form-section">
          <h2 className="section-title">
            <MapPin className="w-5 h-5" />
            Destination & Dates
          </h2>
          
          <div className="form-grid">
            <div className="form-group destination-group">
              <label htmlFor="destination" className="form-label">
                Where do you want to go? *
              </label>
              <div className="destination-input-container">
                <input
                  type="text"
                  id="destination"
                  value={formData.destination}
                  onChange={(e) => handleInputChange('destination', e.target.value)}
                  placeholder="Enter city, country, or region"
                  className={`form-input ${errors.destination ? 'error' : ''}`}
                  autoComplete="off"
                />
                {showDestinationSuggestions && destinationSuggestions.length > 0 && (
                  <div className="destination-suggestions">
                    {destinationSuggestions.map((dest, index) => (
                      <button
                        key={index}
                        type="button"
                        className="destination-suggestion"
                        onClick={() => handleDestinationSelect(dest)}
                      >
                        <MapPin className="w-4 h-4" />
                        <div>
                          <div className="suggestion-name">{dest.name}</div>
                          <div className="suggestion-meta">{dest.type} • {dest.region}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {errors.destination && <span className="error-message">{errors.destination}</span>}
            </div>

            <div className="form-group">
              <label htmlFor="tripType" className="form-label">
                Trip Type
              </label>
              <select
                id="tripType"
                value={formData.tripType}
                onChange={(e) => handleInputChange('tripType', e.target.value)}
                className="form-input"
              >
                <option value="roundtrip">Round Trip</option>
                <option value="oneway">One Way</option>
                <option value="multicity">Multi-City</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="departureDate" className="form-label">
                Departure Date *
              </label>
              <input
                type="date"
                id="departureDate"
                value={formData.departureDate}
                onChange={(e) => handleInputChange('departureDate', e.target.value)}
                min={getMinDate()}
                className={`form-input ${errors.departureDate ? 'error' : ''}`}
              />
              {errors.departureDate && <span className="error-message">{errors.departureDate}</span>}
            </div>

            {formData.tripType === 'roundtrip' && (
              <div className="form-group">
                <label htmlFor="returnDate" className="form-label">
                  Return Date *
                </label>
                <input
                  type="date"
                  id="returnDate"
                  value={formData.returnDate}
                  onChange={(e) => handleInputChange('returnDate', e.target.value)}
                  min={getMinReturnDate()}
                  className={`form-input ${errors.returnDate ? 'error' : ''}`}
                />
                {errors.returnDate && <span className="error-message">{errors.returnDate}</span>}
              </div>
            )}
          </div>
        </div>

        {/* Travelers */}
        <div className="form-section">
          <h2 className="section-title">
            <Users className="w-5 h-5" />
            Travelers
          </h2>
          
          <div className="travelers-grid">
            <div className="traveler-group">
              <label className="form-label">Adults (18+) *</label>
              <div className="counter-input">
                <button
                  type="button"
                  onClick={() => handleNestedChange('travelers', 'adults', Math.max(1, formData.travelers.adults - 1))}
                  className="counter-button"
                  disabled={formData.travelers.adults <= 1}
                >
                  -
                </button>
                <span className="counter-value">{formData.travelers.adults}</span>
                <button
                  type="button"
                  onClick={() => handleNestedChange('travelers', 'adults', formData.travelers.adults + 1)}
                  className="counter-button"
                >
                  +
                </button>
              </div>
            </div>

            <div className="traveler-group">
              <label className="form-label">Children (2-17)</label>
              <div className="counter-input">
                <button
                  type="button"
                  onClick={() => handleNestedChange('travelers', 'children', Math.max(0, formData.travelers.children - 1))}
                  className="counter-button"
                  disabled={formData.travelers.children <= 0}
                >
                  -
                </button>
                <span className="counter-value">{formData.travelers.children}</span>
                <button
                  type="button"
                  onClick={() => handleNestedChange('travelers', 'children', formData.travelers.children + 1)}
                  className="counter-button"
                >
                  +
                </button>
              </div>
            </div>

            <div className="traveler-group">
              <label className="form-label">Infants (0-2)</label>
              <div className="counter-input">
                <button
                  type="button"
                  onClick={() => handleNestedChange('travelers', 'infants', Math.max(0, formData.travelers.infants - 1))}
                  className="counter-button"
                  disabled={formData.travelers.infants <= 0}
                >
                  -
                </button>
                <span className="counter-value">{formData.travelers.infants}</span>
                <button
                  type="button"
                  onClick={() => handleNestedChange('travelers', 'infants', formData.travelers.infants + 1)}
                  className="counter-button"
                >
                  +
                </button>
              </div>
            </div>
          </div>
          
          <div className="travelers-summary">
            Total: {getTotalTravelers()} traveler{getTotalTravelers() !== 1 ? 's' : ''}
          </div>
          {errors.travelers && <span className="error-message">{errors.travelers}</span>}
        </div>

        {/* Budget */}
        <div className="form-section">
          <h2 className="section-title">
            <DollarSign className="w-5 h-5" />
            Budget
          </h2>
          
          <div className="budget-grid">
            <div className="form-group">
              <label htmlFor="currency" className="form-label">
                Currency
              </label>
              <select
                id="currency"
                value={formData.budget.currency}
                onChange={(e) => handleNestedChange('budget', 'currency', e.target.value)}
                className="form-input"
              >
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
                <option value="GBP">GBP (£)</option>
                <option value="JPY">JPY (¥)</option>
                <option value="CAD">CAD ($)</option>
                <option value="AUD">AUD ($)</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="minBudget" className="form-label">
                Minimum Budget
              </label>
              <input
                type="number"
                id="minBudget"
                value={formData.budget.min}
                onChange={(e) => handleNestedChange('budget', 'min', e.target.value)}
                placeholder="0"
                min="0"
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label htmlFor="maxBudget" className="form-label">
                Maximum Budget
              </label>
              <input
                type="number"
                id="maxBudget"
                value={formData.budget.max}
                onChange={(e) => handleNestedChange('budget', 'max', e.target.value)}
                placeholder="No limit"
                min="0"
                className="form-input"
              />
            </div>
          </div>
          {errors.budget && <span className="error-message">{errors.budget}</span>}
        </div>

        {/* Advanced Options Toggle */}
        <div className="advanced-toggle">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="toggle-button"
          >
            <Filter className="w-4 h-4" />
            {showAdvanced ? 'Hide' : 'Show'} Advanced Options
            <span className={`toggle-icon ${showAdvanced ? 'rotated' : ''}`}>▼</span>
          </button>
        </div>

        {/* Advanced Options */}
        {showAdvanced && (
          <div className="advanced-options">
            {/* Accommodation */}
            <div className="form-section">
              <h2 className="section-title">
                <Star className="w-5 h-5" />
                Accommodation Preferences
              </h2>
              
              <div className="form-grid">
                <div className="form-group">
                  <label htmlFor="accommodationType" className="form-label">
                    Accommodation Type
                  </label>
                  <select
                    id="accommodationType"
                    value={formData.accommodation.type}
                    onChange={(e) => handleNestedChange('accommodation', 'type', e.target.value)}
                    className="form-input"
                  >
                    <option value="">Any</option>
                    {accommodationTypes.map(type => (
                      <option key={type.value} value={type.value}>{type.label}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="rating" className="form-label">
                    Minimum Rating
                  </label>
                  <select
                    id="rating"
                    value={formData.accommodation.rating}
                    onChange={(e) => handleNestedChange('accommodation', 'rating', e.target.value)}
                    className="form-input"
                  >
                    <option value="">Any</option>
                    <option value="3">3+ Stars</option>
                    <option value="4">4+ Stars</option>
                    <option value="5">5 Stars Only</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Desired Amenities</label>
                <div className="checkbox-grid">
                  {amenityOptions.map(amenity => (
                    <label key={amenity} className="checkbox-item">
                      <input
                        type="checkbox"
                        checked={formData.accommodation.amenities.includes(amenity)}
                        onChange={() => handleArrayToggle('accommodation', 'amenities', amenity)}
                        className="checkbox-input"
                      />
                      <span className="checkbox-label">{amenity}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* Activities */}
            <div className="form-section">
              <h2 className="section-title">
                <Clock className="w-5 h-5" />
                Activities & Interests
              </h2>
              
              <div className="form-group">
                <label className="form-label">What would you like to do?</label>
                <div className="checkbox-grid">
                  {activityOptions.map(activity => (
                    <label key={activity} className="checkbox-item">
                      <input
                        type="checkbox"
                        checked={formData.activities.includes(activity)}
                        onChange={() => handleArrayToggle(null, 'activities', activity)}
                        className="checkbox-input"
                      />
                      <span className="checkbox-label">{activity}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* Travel Preferences */}
            <div className="form-section">
              <h2 className="section-title">
                Travel Preferences
              </h2>
              
              <div className="form-grid">
                <div className="form-group">
                  <label htmlFor="pace" className="form-label">
                    Travel Pace
                  </label>
                  <select
                    id="pace"
                    value={formData.preferences.pace}
                    onChange={(e) => handleNestedChange('preferences', 'pace', e.target.value)}
                    className="form-input"
                  >
                    <option value="relaxed">Relaxed</option>
                    <option value="moderate">Moderate</option>
                    <option value="active">Active</option>
                    <option value="intensive">Intensive</option>
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="style" className="form-label">
                    Travel Style
                  </label>
                  <select
                    id="style"
                    value={formData.preferences.style}
                    onChange={(e) => handleNestedChange('preferences', 'style', e.target.value)}
                    className="form-input"
                  >
                    <option value="budget">Budget</option>
                    <option value="balanced">Balanced</option>
                    <option value="comfort">Comfort</option>
                    <option value="luxury">Luxury</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="checkbox-item">
                  <input
                    type="checkbox"
                    checked={formData.preferences.accessibility}
                    onChange={(e) => handleNestedChange('preferences', 'accessibility', e.target.checked)}
                    className="checkbox-input"
                  />
                  <span className="checkbox-label">Accessibility requirements</span>
                </label>
              </div>

              <div className="form-group">
                <label className="form-label">Dietary Requirements</label>
                <div className="checkbox-grid">
                  {dietaryOptions.map(diet => (
                    <label key={diet} className="checkbox-item">
                      <input
                        type="checkbox"
                        checked={formData.preferences.dietary.includes(diet)}
                        onChange={() => handleArrayToggle('preferences', 'dietary', diet)}
                        className="checkbox-input"
                      />
                      <span className="checkbox-label">{diet}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* Transportation */}
            <div className="form-section">
              <h2 className="section-title">
                Transportation
              </h2>
              
              <div className="form-grid">
                <div className="form-group">
                  <label htmlFor="transportation" className="form-label">
                    Preferred Transportation
                  </label>
                  <select
                    id="transportation"
                    value={formData.transportation.preferred}
                    onChange={(e) => handleNestedChange('transportation', 'preferred', e.target.value)}
                    className="form-input"
                  >
                    <option value="">Any</option>
                    <option value="flight">Flight</option>
                    <option value="train">Train</option>
                    <option value="bus">Bus</option>
                    <option value="car">Car Rental</option>
                    <option value="cruise">Cruise</option>
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="class" className="form-label">
                    Travel Class
                  </label>
                  <select
                    id="class"
                    value={formData.transportation.class}
                    onChange={(e) => handleNestedChange('transportation', 'class', e.target.value)}
                    className="form-input"
                  >
                    <option value="economy">Economy</option>
                    <option value="premium">Premium Economy</option>
                    <option value="business">Business</option>
                    <option value="first">First Class</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Submit Button */}
        <div className="form-actions">
          <button
            type="submit"
            className="submit-button"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <div className="loading-spinner"></div>
                Searching...
              </>
            ) : (
              <>
                <Search className="w-5 h-5" />
                Find My Perfect Trip
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ClassicForm;