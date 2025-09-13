import React, { useState, useRef, useEffect } from 'react';
import { Send, Mic, MicOff, Loader, MapPin, Calendar, Users, DollarSign } from 'lucide-react';
import './QuickAsk.css';

const QuickAsk = ({ onSearch, isLoading = false }) => {
  const [query, setQuery] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const textareaRef = useRef(null);
  const recognitionRef = useRef(null);

  // Sample suggestions based on common travel queries
  const sampleSuggestions = [
    {
      icon: <MapPin className="w-4 h-4" />,
      text: "Find me a romantic weekend getaway in Europe under $1000",
      category: "destination"
    },
    {
      icon: <Calendar className="w-4 h-4" />,
      text: "Plan a 7-day family vacation to Japan in spring",
      category: "duration"
    },
    {
      icon: <Users className="w-4 h-4" />,
      text: "Adventure trip for 4 friends in South America",
      category: "group"
    },
    {
      icon: <DollarSign className="w-4 h-4" />,
      text: "Luxury honeymoon destinations within $5000 budget",
      category: "budget"
    }
  ];

  // Initialize speech recognition
  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'en-US';
      
      recognitionRef.current.onstart = () => {
        setIsListening(true);
      };
      
      recognitionRef.current.onresult = (event) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        setQuery(transcript);
      };
      
      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
      
      recognitionRef.current.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
      };
    }
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [query]);

  // Generate suggestions based on query
  useEffect(() => {
    if (query.length > 2) {
      const filtered = sampleSuggestions.filter(suggestion =>
        suggestion.text.toLowerCase().includes(query.toLowerCase())
      );
      setSuggestions(filtered.slice(0, 3));
      setShowSuggestions(filtered.length > 0);
    } else {
      setSuggestions(sampleSuggestions.slice(0, 4));
      setShowSuggestions(query.length === 0);
    }
  }, [query]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (query.trim() && !isLoading) {
      onSearch(query.trim());
      setShowSuggestions(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const toggleVoiceInput = () => {
    if (!recognitionRef.current) {
      alert('Speech recognition is not supported in your browser.');
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
    } else {
      recognitionRef.current.start();
    }
  };

  const handleSuggestionClick = (suggestion) => {
    setQuery(suggestion.text);
    setShowSuggestions(false);
    textareaRef.current?.focus();
  };

  const handleInputFocus = () => {
    if (query.length === 0) {
      setShowSuggestions(true);
    }
  };

  const handleInputBlur = () => {
    // Delay hiding suggestions to allow clicking
    setTimeout(() => setShowSuggestions(false), 200);
  };

  return (
    <div className="quick-ask-container">
      <div className="quick-ask-header">
        <h1 className="quick-ask-title">
          Where would you like to go?
        </h1>
        <p className="quick-ask-subtitle">
          Describe your perfect trip in natural language, and we'll find the best options for you.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="quick-ask-form">
        <div className="input-container">
          <textarea
            ref={textareaRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={handleInputFocus}
            onBlur={handleInputBlur}
            placeholder="e.g., 'Find me a relaxing beach vacation in the Caribbean for 2 people under $3000'"
            className={`query-input ${isListening ? 'listening' : ''}`}
            disabled={isLoading}
            rows={1}
          />
          
          <div className="input-actions">
            {recognitionRef.current && (
              <button
                type="button"
                onClick={toggleVoiceInput}
                className={`voice-button ${isListening ? 'listening' : ''}`}
                disabled={isLoading}
                title={isListening ? 'Stop listening' : 'Start voice input'}
              >
                {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>
            )}
            
            <button
              type="submit"
              className="submit-button"
              disabled={!query.trim() || isLoading}
              title="Search"
            >
              {isLoading ? (
                <Loader className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>

        {showSuggestions && suggestions.length > 0 && (
          <div className="suggestions-container">
            <div className="suggestions-header">
              {query.length === 0 ? 'Try these popular searches:' : 'Suggestions:'}
            </div>
            <div className="suggestions-list">
              {suggestions.map((suggestion, index) => (
                <button
                  key={index}
                  type="button"
                  className="suggestion-item"
                  onClick={() => handleSuggestionClick(suggestion)}
                >
                  <div className="suggestion-icon">
                    {suggestion.icon}
                  </div>
                  <div className="suggestion-text">
                    {suggestion.text}
                  </div>
                  <div className="suggestion-category">
                    {suggestion.category}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </form>

      {isListening && (
        <div className="listening-indicator">
          <div className="listening-animation">
            <div className="wave"></div>
            <div className="wave"></div>
            <div className="wave"></div>
          </div>
          <span>Listening... Speak now</span>
        </div>
      )}

      <div className="quick-tips">
        <div className="tip-item">
          <strong>💡 Tip:</strong> Be specific about your preferences - budget, dates, group size, activities, etc.
        </div>
        <div className="tip-item">
          <strong>🎯 Examples:</strong> "Family-friendly resort in Mexico", "Budget backpacking through Europe", "Luxury spa weekend nearby"
        </div>
      </div>
    </div>
  );
};

export default QuickAsk;