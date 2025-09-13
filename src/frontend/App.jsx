import React, { useState, useEffect } from 'react';
import { Search, Settings, Menu, X, Zap, List, Globe, User, HelpCircle } from 'lucide-react';
import QuickAsk from './components/QuickAsk.jsx';
import ClassicForm from './components/ClassicForm.jsx';
import './App.css';

const App = () => {
  const [currentView, setCurrentView] = useState('quick'); // 'quick' or 'classic'
  const [isLoading, setIsLoading] = useState(false);
  const [searchResults, setSearchResults] = useState(null);
  const [searchHistory, setSearchHistory] = useState([]);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [user, setUser] = useState(null);
  const [preferences, setPreferences] = useState({
    theme: 'light',
    language: 'en',
    currency: 'USD',
    notifications: true
  });

  // Load user data and preferences on mount
  useEffect(() => {
    const savedPreferences = localStorage.getItem('travelPreferences');
    if (savedPreferences) {
      setPreferences(JSON.parse(savedPreferences));
    }

    const savedHistory = localStorage.getItem('searchHistory');
    if (savedHistory) {
      setSearchHistory(JSON.parse(savedHistory));
    }

    // Check for user session
    const userSession = localStorage.getItem('userSession');
    if (userSession) {
      setUser(JSON.parse(userSession));
    }
  }, []);

  // Save preferences when they change
  useEffect(() => {
    localStorage.setItem('travelPreferences', JSON.stringify(preferences));
  }, [preferences]);

  // Save search history when it changes
  useEffect(() => {
    localStorage.setItem('searchHistory', JSON.stringify(searchHistory));
  }, [searchHistory]);

  const handleSearch = async (searchData) => {
    setIsLoading(true);
    setSearchResults(null);

    try {
      // Add to search history
      const historyItem = {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        type: currentView,
        data: searchData,
        query: typeof searchData === 'string' ? searchData : generateQuerySummary(searchData)
      };
      
      setSearchHistory(prev => [historyItem, ...prev.slice(0, 9)]); // Keep last 10 searches

      // Simulate API call - replace with actual API integration
      const response = await simulateSearchAPI(searchData);
      
      setSearchResults(response);
    } catch (error) {
      console.error('Search error:', error);
      // Handle error - show notification or error state
    } finally {
      setIsLoading(false);
    }
  };

  const simulateSearchAPI = async (searchData) => {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Mock response
    return {
      query: searchData,
      results: [
        {
          id: 1,
          title: 'Romantic Paris Getaway',
          description: 'Experience the city of love with this carefully curated 4-day romantic escape.',
          price: { amount: 1250, currency: 'USD' },
          duration: '4 days, 3 nights',
          rating: 4.8,
          image: '/api/placeholder/300/200',
          highlights: ['Eiffel Tower dinner', 'Seine river cruise', 'Luxury hotel', 'Private city tour']
        },
        {
          id: 2,
          title: 'Tokyo Adventure Package',
          description: 'Immerse yourself in Japanese culture with this comprehensive Tokyo experience.',
          price: { amount: 1800, currency: 'USD' },
          duration: '7 days, 6 nights',
          rating: 4.9,
          image: '/api/placeholder/300/200',
          highlights: ['Traditional ryokan stay', 'Sushi making class', 'Mount Fuji day trip', 'Cultural workshops']
        },
        {
          id: 3,
          title: 'Bali Wellness Retreat',
          description: 'Rejuvenate your mind and body in this tropical paradise wellness retreat.',
          price: { amount: 950, currency: 'USD' },
          duration: '5 days, 4 nights',
          rating: 4.7,
          image: '/api/placeholder/300/200',
          highlights: ['Daily yoga sessions', 'Spa treatments', 'Healthy cuisine', 'Beach meditation']
        }
      ],
      totalResults: 127,
      searchTime: 0.45,
      filters: {
        priceRange: { min: 500, max: 5000 },
        duration: { min: 2, max: 14 },
        destinations: ['Europe', 'Asia', 'Americas', 'Africa', 'Oceania']
      }
    };
  };

  const generateQuerySummary = (formData) => {
    const parts = [];
    
    if (formData.destination) {
      parts.push(formData.destination);
    }
    
    if (formData.departureDate) {
      const date = new Date(formData.departureDate);
      parts.push(date.toLocaleDateString());
    }
    
    const totalTravelers = formData.travelers.adults + formData.travelers.children + formData.travelers.infants;
    if (totalTravelers > 1) {
      parts.push(`${totalTravelers} travelers`);
    }
    
    if (formData.budget.max) {
      parts.push(`under ${formData.budget.currency} ${formData.budget.max}`);
    }
    
    return parts.join(', ') || 'Travel search';
  };

  const handleViewChange = (view) => {
    setCurrentView(view);
    setShowMobileMenu(false);
    setSearchResults(null); // Clear results when switching views
  };

  const handleHistoryItemClick = (historyItem) => {
    if (historyItem.type !== currentView) {
      setCurrentView(historyItem.type);
    }
    // Could pre-populate form with historical data
    setShowMobileMenu(false);
  };

  const clearSearchHistory = () => {
    setSearchHistory([]);
    localStorage.removeItem('searchHistory');
  };

  const toggleMobileMenu = () => {
    setShowMobileMenu(!showMobileMenu);
  };

  return (
    <div className={`app ${preferences.theme}`}>
      {/* Header */}
      <header className="app-header">
        <div className="header-content">
          <div className="header-left">
            <div className="logo">
              <Globe className="w-8 h-8" />
              <span className="logo-text">TravelAI</span>
            </div>
          </div>

          <nav className="header-nav desktop-nav">
            <button
              onClick={() => handleViewChange('quick')}
              className={`nav-button ${currentView === 'quick' ? 'active' : ''}`}
            >
              <Zap className="w-4 h-4" />
              Quick Ask
            </button>
            <button
              onClick={() => handleViewChange('classic')}
              className={`nav-button ${currentView === 'classic' ? 'active' : ''}`}
            >
              <List className="w-4 h-4" />
              Detailed Search
            </button>
          </nav>

          <div className="header-right">
            <div className="desktop-actions">
              {user ? (
                <div className="user-menu">
                  <button className="user-button">
                    <User className="w-5 h-5" />
                    <span>{user.name}</span>
                  </button>
                </div>
              ) : (
                <button className="login-button">
                  Sign In
                </button>
              )}
              
              <button className="settings-button">
                <Settings className="w-5 h-5" />
              </button>
            </div>

            <button 
              className="mobile-menu-button"
              onClick={toggleMobileMenu}
            >
              {showMobileMenu ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {showMobileMenu && (
          <div className="mobile-menu">
            <nav className="mobile-nav">
              <button
                onClick={() => handleViewChange('quick')}
                className={`mobile-nav-button ${currentView === 'quick' ? 'active' : ''}`}
              >
                <Zap className="w-5 h-5" />
                Quick Ask
              </button>
              <button
                onClick={() => handleViewChange('classic')}
                className={`mobile-nav-button ${currentView === 'classic' ? 'active' : ''}`}
              >
                <List className="w-5 h-5" />
                Detailed Search
              </button>
            </nav>

            {searchHistory.length > 0 && (
              <div className="mobile-history">
                <div className="history-header">
                  <h3>Recent Searches</h3>
                  <button onClick={clearSearchHistory} className="clear-history">
                    Clear
                  </button>
                </div>
                <div className="history-list">
                  {searchHistory.slice(0, 5).map(item => (
                    <button
                      key={item.id}
                      onClick={() => handleHistoryItemClick(item)}
                      className="history-item"
                    >
                      <Search className="w-4 h-4" />
                      <div className="history-content">
                        <div className="history-query">{item.query}</div>
                        <div className="history-meta">
                          {item.type === 'quick' ? 'Quick Ask' : 'Detailed'} • 
                          {new Date(item.timestamp).toLocaleDateString()}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mobile-actions">
              {!user && (
                <button className="mobile-login-button">
                  Sign In
                </button>
              )}
              <button className="mobile-help-button">
                <HelpCircle className="w-5 h-5" />
                Help & Support
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="app-main">
        {!searchResults ? (
          // Search Interface
          <div className="search-interface">
            {currentView === 'quick' ? (
              <QuickAsk onSearch={handleSearch} isLoading={isLoading} />
            ) : (
              <ClassicForm onSearch={handleSearch} isLoading={isLoading} />
            )}

            {/* Search History Sidebar (Desktop) */}
            {searchHistory.length > 0 && (
              <aside className="search-history desktop-only">
                <div className="history-header">
                  <h3>Recent Searches</h3>
                  <button onClick={clearSearchHistory} className="clear-history">
                    Clear
                  </button>
                </div>
                <div className="history-list">
                  {searchHistory.map(item => (
                    <button
                      key={item.id}
                      onClick={() => handleHistoryItemClick(item)}
                      className="history-item"
                    >
                      <Search className="w-4 h-4" />
                      <div className="history-content">
                        <div className="history-query">{item.query}</div>
                        <div className="history-meta">
                          {item.type === 'quick' ? 'Quick Ask' : 'Detailed'} • 
                          {new Date(item.timestamp).toLocaleDateString()}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </aside>
            )}
          </div>
        ) : (
          // Search Results
          <div className="search-results">
            <div className="results-header">
              <button 
                onClick={() => setSearchResults(null)}
                className="back-button"
              >
                ← Back to Search
              </button>
              <div className="results-info">
                <h2>Search Results</h2>
                <p>
                  Found {searchResults.totalResults} results in {searchResults.searchTime}s
                </p>
              </div>
            </div>

            <div className="results-content">
              <div className="results-grid">
                {searchResults.results.map(result => (
                  <div key={result.id} className="result-card">
                    <div className="result-image">
                      <img src={result.image} alt={result.title} />
                      <div className="result-rating">
                        ⭐ {result.rating}
                      </div>
                    </div>
                    <div className="result-content">
                      <h3 className="result-title">{result.title}</h3>
                      <p className="result-description">{result.description}</p>
                      <div className="result-highlights">
                        {result.highlights.slice(0, 3).map((highlight, index) => (
                          <span key={index} className="highlight-tag">
                            {highlight}
                          </span>
                        ))}
                      </div>
                      <div className="result-footer">
                        <div className="result-price">
                          <span className="price-amount">
                            {result.price.currency} {result.price.amount}
                          </span>
                          <span className="price-duration">
                            {result.duration}
                          </span>
                        </div>
                        <button className="book-button">
                          View Details
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-section">
            <h4>TravelAI</h4>
            <p>Intelligent travel planning powered by AI</p>
          </div>
          <div className="footer-section">
            <h4>Support</h4>
            <ul>
              <li><a href="#">Help Center</a></li>
              <li><a href="#">Contact Us</a></li>
              <li><a href="#">FAQ</a></li>
            </ul>
          </div>
          <div className="footer-section">
            <h4>Company</h4>
            <ul>
              <li><a href="#">About</a></li>
              <li><a href="#">Privacy Policy</a></li>
              <li><a href="#">Terms of Service</a></li>
            </ul>
          </div>
        </div>
        <div className="footer-bottom">
          <p>&copy; 2024 TravelAI. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default App;