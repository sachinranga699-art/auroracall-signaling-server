// Authentication middleware for signaling server

const jwt = require('jsonwebtoken');

const authenticateSocket = (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    
    if (!token) {
      return next(new Error('Authentication token required'));
    }
    
    // Verify JWT token (replace with your JWT secret)
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-jwt-secret');
    
    socket.userId = decoded.userId;
    socket.userEmail = decoded.email;
    
    next();
  } catch (error) {
    next(new Error('Invalid authentication token'));
  }
};

const rateLimiter = (socket, next) => {
  // Implement rate limiting logic here
  // For example, limit connections per IP
  next();
};

module.exports = {
  authenticateSocket,
  rateLimiter
};