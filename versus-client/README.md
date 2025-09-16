# Versus Client 🎮

A modern React-based web client for the Versus Game Server. Built with TypeScript, Vite, and Bun for optimal performance and developer experience.

## ✨ Features

- **27 Games Supported** - Automatically discovers and supports all games from the server
- **Real-time Gameplay** - Dynamic game state updates and move validation
- **Type-Safe API Client** - Comprehensive TypeScript API client with error handling
- **Modern UI** - Clean, responsive interface built with React 19
- **Game Statistics** - View game stats and activity across all supported games
- **API Testing** - Built-in API testing tools for development
- **Hot Reload** - Fast development with Vite HMR

## 🚀 Quick Start

### Prerequisites

- [Bun](https://bun.sh/) 1.0+ (recommended) or Node.js 18+
- TypeScript 5.0+
- Running [versus-server](../versus-server) instance

### Installation

```bash
# Navigate to client directory
cd versus-client

# Install dependencies
bun install

# Start development server
bun run dev
```

The client will be available at `http://localhost:5173`

### Environment Configuration

Create a `.env` file for custom configuration:

```bash
# API Configuration
VITE_API_URL=http://localhost:6789
VITE_API_TIMEOUT=10000
VITE_API_RETRY_ATTEMPTS=3
VITE_API_RETRY_DELAY=1000
VITE_POLLING_INTERVAL=2000
VITE_ENABLE_DEBUG=false
VITE_MAX_GAME_HISTORY=100
```

## 🎯 Supported Games

The client automatically supports all **27 games** available on the server:

### Board Games (10)

- Chess, Checkers, Go, Othello, Connect Four
- Tic-Tac-Toe, Omok, Mancala, Chinese Checkers, Catan

### Card Games (10)

- Poker, Blackjack, Hearts, Spades, Go Fish
- Cuttle, War, Bullshit, Thirteen, Crazy Cards

### Strategy Games (3)

- Shogi, Martial Tactics, Mahjong

### Party Games (4)

- Bingo, Word Tiles, Battleship, Against Cards

## 🛠️ Development

### Available Scripts

```bash
# Development
bun run dev          # Start dev server with hot reload
bun run build        # Build for production
bun run preview      # Preview production build

# Code Quality
bun run lint         # Run ESLint
bun run lint:fix     # Auto-fix linting issues
bun run format       # Format code with Prettier
bun run format:check # Check code formatting
bun run type-check   # TypeScript type checking
```

### Project Structure

```
src/
├── components/      # React components
│   ├── GameSelector.tsx    # Game selection and creation
│   ├── StatsDisplay.tsx    # Statistics visualization
│   ├── ApiTester.tsx       # API testing interface
│   └── TicTacToeDemo.tsx   # Game demo component
├── pages/           # Page components
│   ├── HomePage.tsx        # Landing page
│   ├── PlaygroundPage.tsx  # Game playground
│   └── StatsPage.tsx       # Statistics page
├── services/        # API and services
│   └── api-client.ts       # TypeScript API client
├── assets/          # Static assets
├── config.ts        # Configuration
└── main.tsx         # App entry point
```

## 🔗 API Client

The client includes a comprehensive TypeScript API client:

```typescript
import { gameApi, statsApi, healthApi } from './services/api-client'

// Game operations
const games = await gameApi.getGames()
const metadata = await gameApi.getMetadata('chess')
const gameId = await gameApi.create('chess', { playerCount: 2 })
const state = await gameApi.getState('chess', gameId)
await gameApi.makeMove('chess', gameId, { from: 'e2', to: 'e4' })

// Statistics
const stats = await statsApi.getGlobal()
const chessStats = await statsApi.getByType('chess')

// Health check
const health = await healthApi.check()
```

### Error Handling

The API client provides robust error handling:

```typescript
const response = await gameApi.create('chess')
if (response.error) {
  console.error('Game creation failed:', response.error)
  // Handle error appropriately
} else {
  console.log('Game created:', response.data.gameId)
}
```

## 🎮 Using the Client

### Game Selection

1. **Browse Games** - View all 27 available games with metadata
2. **Select Game** - Choose a game type from the dropdown
3. **Create Game** - Click "Create Game" to start a new instance
4. **View State** - See the current game state in JSON format

### API Testing

The client includes a built-in API tester:

1. Navigate to the Playground page
2. Select an endpoint from the dropdown
3. Configure request method and body
4. Send request and view response

### Statistics

View comprehensive game statistics:

- Total games played across all types
- Active games currently running
- Popular game types and trends
- Recent activity feed
- Player statistics

## 🏗️ Architecture

### State Management

- **React Hooks** - useState and useEffect for local state
- **API Client** - Centralized API communication
- **Error Boundaries** - Graceful error handling

### Type Safety

- **Full TypeScript** - Comprehensive type coverage
- **API Types** - Strongly typed API responses
- **Component Props** - Typed React components

### Performance

- **Vite Build** - Fast bundling and hot reload
- **Code Splitting** - Optimal bundle sizes
- **Lazy Loading** - Components loaded on demand

## 🧪 Testing

```bash
# Run type checking
bun run type-check

# Run linting
bun run lint

# Check formatting
bun run format:check

# Build verification
bun run build
```

## 🚀 Deployment

### Production Build

```bash
# Build for production
bun run build

# Preview production build
bun run preview
```

The build output will be in the `dist/` directory.

### Docker Deployment

```bash
# Build Docker image
docker build -t versus-client .

# Run container
docker run -p 5173:5173 versus-client
```

### Environment Variables for Production

```bash
# Production API URL
VITE_API_URL=https://your-api-domain.com

# Disable debug mode
VITE_ENABLE_DEBUG=false

# Optimize polling for production
VITE_POLLING_INTERVAL=5000
```

## 🔧 Configuration

### Vite Configuration

The project uses Vite with React plugin and TypeScript support. See `vite.config.ts` for configuration.

### TypeScript Configuration

- `tsconfig.app.json` - Application TypeScript config
- `tsconfig.node.json` - Node.js/build tools TypeScript config
- `tsconfig.json` - Root TypeScript configuration

### ESLint Configuration

Configured with React-specific rules and TypeScript support. See `eslint.config.js`.

## 🤝 Development Workflow

### Code Quality

The project enforces code quality through:

- **Pre-commit Hooks** - Automatic linting and formatting
- **CI/CD Pipeline** - Automated quality checks on PR/push
- **TypeScript** - Compile-time error prevention
- **ESLint** - Code quality and consistency
- **Prettier** - Consistent code formatting

### Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes with proper TypeScript types
4. Add tests if applicable
5. Ensure all quality checks pass
6. Submit a pull request

## 📊 Performance

- **Sub-100ms** API response handling
- **Optimized Rendering** - React 19 performance features
- **Efficient Bundling** - Vite's optimized build process
- **Small Bundle Size** - Code splitting and tree shaking

## 🔍 Debugging

Enable debug mode for detailed logging:

```bash
# In .env file
VITE_ENABLE_DEBUG=true
```

This will enable:

- Detailed API request/response logging
- Component render tracking
- Error stack traces

## 📚 Related Documentation

- **[Server Documentation](../versus-server/README.md)** - Versus Game Server
- **[API Documentation](../versus-server/docs/)** - API reference
- **[Game Development Guide](../versus-server/GAME_DEVELOPMENT_GUIDE.md)** - Adding new games

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](../LICENSE) file for details.

---

**Ready to play?** Start the server, launch the client, and enjoy 27 classic games! 🎮
