# AuroraCall Signaling Server

A WebRTC signaling server for the AuroraCall wake-up call application, built with Node.js and Socket.IO.

## Features

- WebRTC signaling for peer-to-peer voice calls
- Metered.ca TURN server integration
- JWT-based authentication
- Real-time call matching and management
- Health check endpoint
- Production-ready configuration

## Prerequisites

- Node.js 18+ 
- npm or yarn
- Metered.ca API key (for TURN servers)

## Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd auroracall-signaling-server
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
```

Edit `.env` with your configuration:
```env
NODE_ENV=production
PORT=3000
ALLOWED_ORIGINS=https://auroracall.com,https://www.auroracall.com
LOG_LEVEL=info
CALL_TIMEOUT_SECONDS=30
MAX_CONCURRENT_CALLS=1000
METERED_API_KEY=your_metered_api_key_here
JWT_SECRET=your_jwt_secret_here
HEALTH_CHECK_ENABLED=true
```

## Running the Server

### Development
```bash
npm run dev
```

### Production
```bash
npm start
```

## API Endpoints

### Health Check
```
GET /health
```
Returns server health status and metrics.

### WebRTC Signaling
The server uses Socket.IO for real-time WebRTC signaling:

- `join-room`: Join a call room
- `offer`: Send WebRTC offer
- `answer`: Send WebRTC answer  
- `ice-candidate`: Exchange ICE candidates
- `leave-room`: Leave a call room

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment (development/production) | `development` |
| `PORT` | Server port | `3000` |
| `ALLOWED_ORIGINS` | CORS allowed origins | `*` |
| `LOG_LEVEL` | Logging level | `info` |
| `CALL_TIMEOUT_SECONDS` | Call timeout in seconds | `30` |
| `MAX_CONCURRENT_CALLS` | Maximum concurrent calls | `1000` |
| `METERED_API_KEY` | Metered.ca API key | Required |
| `JWT_SECRET` | JWT signing secret | Required |
| `HEALTH_CHECK_ENABLED` | Enable health check endpoint | `true` |

## Deployment

### Using PM2 (Recommended)

1. Install PM2 globally:
```bash
npm install -g pm2
```

2. Start the application:
```bash
pm2 start ecosystem.config.js
```

3. Save PM2 configuration:
```bash
pm2 save
pm2 startup
```

### Using Docker

1. Build the image:
```bash
docker build -t auroracall-signaling .
```

2. Run the container:
```bash
docker run -d \
  --name auroracall-signaling \
  -p 3000:3000 \
  --env-file .env \
  auroracall-signaling
```

### Cloud Deployment

The server is ready for deployment on:
- Heroku
- Railway
- DigitalOcean App Platform
- AWS Elastic Beanstalk
- Google Cloud Run

## Monitoring

The server includes:
- Health check endpoint at `/health`
- Structured logging with configurable levels
- Connection and call metrics
- Error tracking and reporting

## Security

- JWT-based authentication
- CORS protection
- Rate limiting (recommended to add)
- Input validation
- Secure WebSocket connections

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details.