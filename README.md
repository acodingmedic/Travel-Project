# TravelAI Platform

ðŸŒ **Intelligent travel planning platform powered by AI with swarm intelligence capabilities**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)
[![React Version](https://img.shields.io/badge/react-18.3.1-blue)](https://reactjs.org/)
[![Build Status](https://img.shields.io/badge/build-passing-brightgreen)]()
[![Coverage](https://img.shields.io/badge/coverage-85%25-brightgreen)]()

## ðŸš€ Overview

TravelAI Platform is a next-generation travel planning system that combines artificial intelligence, swarm intelligence, and modern web technologies to provide personalized travel recommendations and seamless booking experiences.

### âœ¨ Key Features

- **ðŸ¤– AI-Powered Search**: Natural language queries with intelligent understanding
- **ðŸ” Dual Interface**: Quick Ask for simple queries, Detailed Form for comprehensive planning
- **ðŸ§  Swarm Intelligence**: Multi-agent system for optimal travel recommendations
- **ðŸ”’ GDPR Compliant**: Built-in privacy protection and data compliance
- **âš¡ Real-time Processing**: Live search results and dynamic pricing
- **ðŸ“± Responsive Design**: Seamless experience across all devices
- **ðŸŒ Multi-language Support**: International travel planning capabilities
- **ðŸ” Enterprise Security**: Advanced security monitoring and threat detection

## ðŸ—ï¸ Architecture

### System Components

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”    â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”    â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚   Frontend      â”‚    â”‚   Backend       â”‚    â”‚   AI Engine     â”‚
â”‚   (React)       â”‚â—„â”€â”€â–ºâ”‚   (Node.js)     â”‚â—„â”€â”€â–ºâ”‚   (Swarm)       â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜    â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜    â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
         â”‚                       â”‚                       â”‚
         â–¼                       â–¼                       â–¼
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”    â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”    â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚   UI Components â”‚    â”‚   API Routes    â”‚    â”‚   Agent System  â”‚
â”‚   - QuickAsk    â”‚    â”‚   - Search      â”‚    â”‚   - Coordinator â”‚
â”‚   - ClassicForm â”‚    â”‚   - Booking     â”‚    â”‚   - Specialists â”‚
â”‚   - Results     â”‚    â”‚   - User Mgmt   â”‚    â”‚   - Validators  â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜    â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜    â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

### Core Systems

- **ðŸŽ¯ Agent System**: Swarm intelligence with specialized travel agents
- **ðŸ“Š Monitoring**: Comprehensive analytics and performance tracking
- **ðŸ”„ Orchestration**: Workflow and queue management
- **ðŸ›¡ï¸ Security**: Advanced threat detection and compliance
- **ðŸ’¾ State Management**: Distributed state with consistency guarantees
- **ðŸŽ›ï¸ Decision Engine**: Multi-criteria decision making
- **ðŸ“¡ Event Bus**: Real-time event processing and routing

## ðŸ› ï¸ Technology Stack

### Frontend
- **React 18.3.1** - Modern UI framework
- **Lucide React** - Beautiful icons
- **CSS3** - Advanced styling with custom properties
- **Web APIs** - Speech recognition, geolocation, notifications

### Backend
- **Node.js 18+** - JavaScript runtime
- **Express.js** - Web application framework
- **MongoDB** - Document database
- **Redis** - In-memory data store
- **Socket.IO** - Real-time communication

### AI & Intelligence
- **Custom Swarm System** - Multi-agent coordination
- **OpenAI Integration** - Natural language processing
- **Decision Algorithms** - Voting, auction, consensus mechanisms
- **Machine Learning** - Recommendation and prediction models

### DevOps & Infrastructure
- **Docker** - Containerization
- **Jest** - Testing framework
- **ESLint & Prettier** - Code quality
- **Winston** - Logging
- **Helmet** - Security headers

## ðŸš€ Quick Start

### Prerequisites

- Node.js 18.0.0 or higher
- npm 9.0.0 or higher
- MongoDB 5.0 or higher
- Redis 6.0 or higher

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/travelai/platform.git
   cd platform
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Start the development servers**
   ```bash
   npm run dev
   ```

5. **Access the application**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:8000
   - Health Check: http://localhost:8000/health

### Docker Setup

```bash
# Build the Docker image
npm run docker:build

# Run the container
npm run docker:run
```

## ðŸ“– Usage Guide

### Quick Ask Interface

The Quick Ask interface allows users to search for travel options using natural language:

```javascript
// Example queries:
"Find me a romantic weekend in Paris for 2 people under $2000"
"I want to visit Tokyo in March, 5 days, family friendly"
"Beach vacation in Thailand, budget friendly, next month"
```

### Classic Form Interface

For detailed searches, users can specify:
- Destination and dates
- Number of travelers (adults, children, infants)
- Budget range and currency
- Accommodation preferences
- Activity interests
- Accessibility requirements

### API Endpoints

#### Search
```http
POST /api/search
Content-Type: application/json

{
  "query": "Beach vacation in Bali",
  "travelers": { "adults": 2 },
  "budget": { "max": 3000, "currency": "USD" },
  "dates": { "departure": "2024-06-01", "return": "2024-06-08" }
}
```

#### Health Check
```http
GET /health
```

## ðŸ§ª Testing

### Run Tests

```bash
# Run all tests
npm test

# Run backend tests only
npm run test:backend

# Run frontend tests only
npm run test:frontend

# Run tests in watch mode
npm run test:watch
```

### Test Coverage

```bash
# Generate coverage report
npm run test -- --coverage
```

## ðŸ”§ Development

### Code Quality

```bash
# Lint code
npm run lint

# Format code
npm run format

# Check formatting
npm run format:check

# Security audit
npm run security-audit
```

### Build

```bash
# Build for production
npm run build

# Analyze bundle size
npm run analyze
```

### Database Operations

```bash
# Run migrations
npm run migrate

# Seed database
npm run seed
```

## ðŸ—ï¸ Project Structure

```
travelai-platform/
â”œâ”€â”€ public/                 # Static files
â”‚   â”œâ”€â”€ index.html         # HTML template
â”‚   â””â”€â”€ manifest.json      # PWA manifest
â”œâ”€â”€ src/
â”‚   â”œâ”€â”€ frontend/          # React application
â”‚   â”‚   â”œâ”€â”€ components/    # React components
â”‚   â”‚   â”œâ”€â”€ App.jsx        # Main app component
â”‚   â”‚   â”œâ”€â”€ App.css        # App styles
â”‚   â”‚   â”œâ”€â”€ index.js       # Entry point
â”‚   â”‚   â””â”€â”€ index.css      # Global styles
â”‚   â”œâ”€â”€ agents/            # AI agent system
â”‚   â”‚   â”œâ”€â”€ swarm/         # Swarm intelligence
â”‚   â”‚   â”œâ”€â”€ coordinator/   # Agent coordination
â”‚   â”‚   â””â”€â”€ specialists/   # Specialized agents
â”‚   â”œâ”€â”€ monitoring/        # Analytics & monitoring
â”‚   â”œâ”€â”€ orchestration/     # Workflow management
â”‚   â”œâ”€â”€ compliance/        # GDPR & legal
â”‚   â”œâ”€â”€ security/          # Security systems
â”‚   â”œâ”€â”€ state/             # State management
â”‚   â”œâ”€â”€ decision/          # Decision engine
â”‚   â”œâ”€â”€ events/            # Event bus
â”‚   â”œâ”€â”€ config/            # Configuration
â”‚   â”œâ”€â”€ utils/             # Utilities
â”‚   â””â”€â”€ index.js           # Backend entry point
â”œâ”€â”€ scripts/               # Build & deployment scripts
â”œâ”€â”€ tests/                 # Test files
â”œâ”€â”€ docs/                  # Documentation
â”œâ”€â”€ .env.example           # Environment template
â”œâ”€â”€ package.json           # Dependencies
â”œâ”€â”€ README.md              # This file
â””â”€â”€ Dockerfile             # Docker configuration
```

## ðŸ”’ Security

### Security Features

- **ðŸ›¡ï¸ Helmet.js**: Security headers
- **ðŸ” JWT Authentication**: Secure token-based auth
- **ðŸš¦ Rate Limiting**: API abuse prevention
- **ðŸ” Input Validation**: Comprehensive data validation
- **ðŸ”’ HTTPS Enforcement**: Secure communication
- **ðŸ›¡ï¸ CSRF Protection**: Cross-site request forgery prevention
- **ðŸ” Data Encryption**: At-rest and in-transit encryption

### Security Monitoring

- Real-time threat detection
- Anomaly detection algorithms
- Security event logging
- Incident response automation

## ðŸ“Š Monitoring & Analytics

### Built-in Monitoring

- **ðŸ“ˆ Performance Metrics**: Response times, throughput
- **ðŸ” Error Tracking**: Comprehensive error logging
- **ðŸ‘¥ User Analytics**: Behavior and usage patterns
- **ðŸŽ¯ Business Metrics**: Conversion rates, engagement
- **ðŸ¥ Health Checks**: System status monitoring

### Dashboards

- Real-time system health
- User activity analytics
- Performance optimization insights
- Security threat monitoring

## ðŸŒ GDPR Compliance

### Privacy Features

- **âœ… Consent Management**: Cookie and data consent
- **ðŸ—‘ï¸ Right to Erasure**: Data deletion capabilities
- **ðŸ“‹ Data Portability**: Export user data
- **ðŸ” Data Transparency**: Clear data usage policies
- **ðŸ›¡ï¸ Privacy by Design**: Built-in privacy protection

### Compliance Tools

- Automated compliance reporting
- Data retention management
- Privacy impact assessments
- Breach notification system

## ðŸš€ Deployment

### Production Deployment

```bash
# Build for production
npm run build

# Deploy to production
npm run deploy:production
```

### Environment Configuration

1. **Staging Environment**
   ```bash
   npm run deploy:staging
   ```

2. **Production Environment**
   ```bash
   npm run deploy:production
   ```

### Docker Deployment

```dockerfile
# Multi-stage build
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:18-alpine AS runtime
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY . .
EXPOSE 3000 8000
CMD ["npm", "start"]
```

## ðŸ¤ Contributing

### Development Workflow

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

### Code Standards

- Follow ESLint configuration
- Use Prettier for formatting
- Write comprehensive tests
- Document new features
- Follow semantic versioning

### Commit Convention

```
feat: add new search algorithm
fix: resolve booking confirmation issue
docs: update API documentation
test: add unit tests for agent system
refactor: optimize database queries
```

## ðŸ“š API Documentation

### Authentication

```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}
```

### Search Endpoints

```http
# Natural language search
POST /api/search/quick

# Structured search
POST /api/search/detailed

# Search suggestions
GET /api/search/suggestions?q=paris
```

### Booking Endpoints

```http
# Create booking
POST /api/bookings

# Get booking details
GET /api/bookings/:id

# Cancel booking
DELETE /api/bookings/:id
```

## ðŸ”§ Configuration

### Environment Variables

See `.env.example` for a complete list of configuration options:

- **Database**: MongoDB and Redis connections
- **Authentication**: JWT secrets and session configuration
- **External APIs**: Travel service integrations
- **AI Services**: OpenAI and other AI provider keys
- **Monitoring**: Analytics and error tracking
- **Security**: Rate limiting and security headers

### Feature Flags

```javascript
// Enable/disable features
FEATURE_ADVANCED_SEARCH=true
FEATURE_VOICE_SEARCH=true
FEATURE_REAL_TIME_CHAT=true
FEATURE_AI_RECOMMENDATIONS=true
```

## ðŸ› Troubleshooting

### Common Issues

1. **Port Already in Use**
   ```bash
   # Kill process on port 3000
   npx kill-port 3000
   ```

2. **Database Connection Failed**
   - Ensure MongoDB is running
   - Check connection string in `.env`
   - Verify network connectivity

3. **Redis Connection Error**
   - Start Redis server
   - Check Redis configuration
   - Verify Redis URL format

4. **Build Failures**
   ```bash
   # Clear cache and reinstall
   npm run clean
   rm -rf node_modules package-lock.json
   npm install
   ```

### Debug Mode

```bash
# Enable debug logging
DEBUG=travelai:* npm run dev
```

## ðŸ“ˆ Performance

### Optimization Features

- **âš¡ Code Splitting**: Lazy loading of components
- **ðŸ—œï¸ Compression**: Gzip compression for responses
- **ðŸ’¾ Caching**: Redis-based caching strategy
- **ðŸ”„ Connection Pooling**: Database connection optimization
- **ðŸ“¦ Bundle Optimization**: Webpack optimization

### Performance Monitoring

- Real-time performance metrics
- Database query optimization
- Memory usage tracking
- Response time monitoring

## ðŸ”® Roadmap

### Upcoming Features

- [ ] **Mobile App**: React Native application
- [ ] **Voice Assistant**: Advanced voice interaction
- [ ] **AR Integration**: Augmented reality travel guides
- [ ] **Blockchain**: Secure booking verification
- [ ] **IoT Integration**: Smart travel devices
- [ ] **Advanced AI**: GPT-4 integration
- [ ] **Social Features**: Travel community platform
- [ ] **Offline Mode**: Progressive Web App capabilities

### Version History

- **v1.0.0** - Initial release with core features
- **v0.9.0** - Beta release with AI integration
- **v0.8.0** - Alpha release with basic functionality

## ðŸ“„ License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## ðŸ™ Acknowledgments

- **React Team** - For the amazing frontend framework
- **Node.js Community** - For the robust backend platform
- **OpenAI** - For AI capabilities
- **MongoDB** - For flexible data storage
- **Redis** - For high-performance caching
- **Contributors** - For their valuable contributions

## ðŸ“ž Support

### Getting Help

- **ðŸ“§ Email**: support@travelai.com
- **ðŸ’¬ Discord**: [TravelAI Community](https://discord.gg/travelai)
- **ðŸ“– Documentation**: [docs.travelai.com](https://docs.travelai.com)
- **ðŸ› Issues**: [GitHub Issues](https://github.com/travelai/platform/issues)

### Enterprise Support

For enterprise customers, we offer:
- 24/7 technical support
- Custom feature development
- On-premise deployment
- Training and consultation

---

**Made with â¤ï¸ by the TravelAI Team**

*Empowering intelligent travel experiences through AI and innovation.*
## Development (Vite)

- Dev server: `npm run dev` (starts backend on 8000 and Vite on 3000)
- Frontend only: `npm run dev:frontend` (Vite)
- Build frontend: `npm run build:frontend` (outputs to `dist/`)
- Preview build: `npx vite preview`

### Testing (Vitest)
- Frontend tests: `npm run test:frontend`
- Config: `vitest.config.ts` (jsdom, V8 coverage)

### HTTPS (production optional)
- Set `SSL_KEY_PATH` and `SSL_CERT_PATH` to enable HTTPS in production for the backend.
- Falls back to HTTP if certs are not provided.
