#!/bin/bash

# AuroraCall Signaling Server Deployment Script
# This script helps deploy the signaling server to various platforms

set -e

echo "🚀 AuroraCall Signaling Server Deployment"
echo "=========================================="

# Check if .env file exists
if [ ! -f .env ]; then
    echo "❌ Error: .env file not found!"
    echo "Please copy .env.example to .env and configure your settings."
    exit 1
fi

# Load environment variables
source .env

# Validate required environment variables
if [ -z "$METERED_API_KEY" ] || [ "$METERED_API_KEY" = "your_metered_api_key_here" ]; then
    echo "❌ Error: METERED_API_KEY not configured!"
    echo "Please set your Metered.ca API key in .env file."
    exit 1
fi

if [ -z "$JWT_SECRET" ] || [ "$JWT_SECRET" = "your_jwt_secret_here" ]; then
    echo "❌ Error: JWT_SECRET not configured!"
    echo "Please set a secure JWT secret in .env file."
    exit 1
fi

echo "✅ Environment configuration validated"

# Install dependencies
echo "📦 Installing dependencies..."
npm ci --only=production

# Run tests if they exist
if [ -f "package.json" ] && grep -q "\"test\"" package.json; then
    echo "🧪 Running tests..."
    npm test
fi

# Create logs directory
mkdir -p logs

echo "✅ Dependencies installed and tests passed"

# Deployment options
echo ""
echo "Choose deployment method:"
echo "1) Local development server"
echo "2) PM2 production deployment"
echo "3) Docker deployment"
echo "4) Build Docker image only"
echo "5) Exit"

read -p "Enter your choice (1-5): " choice

case $choice in
    1)
        echo "🔧 Starting development server..."
        npm run dev
        ;;
    2)
        echo "🚀 Deploying with PM2..."
        
        # Check if PM2 is installed
        if ! command -v pm2 &> /dev/null; then
            echo "Installing PM2..."
            npm install -g pm2
        fi
        
        # Stop existing process if running
        pm2 stop auroracall-signaling 2>/dev/null || true
        pm2 delete auroracall-signaling 2>/dev/null || true
        
        # Start with PM2
        pm2 start ecosystem.config.js --env production
        pm2 save
        
        echo "✅ Deployed with PM2!"
        echo "Use 'pm2 status' to check status"
        echo "Use 'pm2 logs auroracall-signaling' to view logs"
        ;;
    3)
        echo "🐳 Deploying with Docker..."
        
        # Build Docker image
        docker build -t auroracall-signaling .
        
        # Stop existing container if running
        docker stop auroracall-signaling 2>/dev/null || true
        docker rm auroracall-signaling 2>/dev/null || true
        
        # Run new container
        docker run -d \
            --name auroracall-signaling \
            -p ${PORT:-3000}:${PORT:-3000} \
            --env-file .env \
            --restart unless-stopped \
            auroracall-signaling
        
        echo "✅ Deployed with Docker!"
        echo "Use 'docker logs auroracall-signaling' to view logs"
        echo "Use 'docker ps' to check status"
        ;;
    4)
        echo "🐳 Building Docker image..."
        docker build -t auroracall-signaling .
        echo "✅ Docker image built successfully!"
        echo "Run with: docker run -d --name auroracall-signaling -p 3000:3000 --env-file .env auroracall-signaling"
        ;;
    5)
        echo "👋 Deployment cancelled"
        exit 0
        ;;
    *)
        echo "❌ Invalid choice"
        exit 1
        ;;
esac

echo ""
echo "🎉 Deployment completed!"
echo "Server will be available at: http://localhost:${PORT:-3000}"
echo "Health check: http://localhost:${PORT:-3000}/health"