// Authentication middleware for signaling server

const jwt = require('jsonwebtoken');
let admin;
try {
  // Lazy-load firebase-admin if available
  admin = require('firebase-admin');
  if (!admin.apps.length) {
    admin.initializeApp(); // Uses ADC; or set GOOGLE_APPLICATION_CREDENTIALS
  }
} catch (e) {
  admin = null;
}

async function verifyToken(token) {
  // Prefer Firebase ID token verification when firebase-admin is available
  if (admin) {
    const decoded = await admin.auth().verifyIdToken(token);
    return { userId: decoded.uid, email: decoded.email };
  }

  // Fallback to local JWT (development only)
  const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-jwt-secret');
  return { userId: decoded.userId, email: decoded.email };
}

const extractBearer = (authHeader) => {
  if (!authHeader) return null;
  const parts = authHeader.split(' ');
  if (parts.length === 2 && /^Bearer$/i.test(parts[0])) return parts[1];
  return null;
};

const authenticateSocket = async (socket, next) => {
  try {
    const headerToken = extractBearer(socket.handshake.headers?.authorization);
    const authToken = socket.handshake.auth?.token;
    const token = authToken || headerToken;

    if (!token) {
      return next(new Error('Authentication token required'));
    }

    const decoded = await verifyToken(token);

    socket.userId = decoded.userId;
    socket.userEmail = decoded.email;

    next();
  } catch (error) {
    next(new Error('Invalid authentication token'));
  }
};

// Express middleware for REST endpoints
const authenticateHttp = async (req, res, next) => {
  try {
    const token = extractBearer(req.headers.authorization);
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    const decoded = await verifyToken(token);
    req.user = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
};

const rateLimiter = (socket, next) => {
  // Implement rate limiting logic here
  // For example, limit connections per IP
  next();
};

module.exports = {
  authenticateSocket,
  authenticateHttp,
  rateLimiter
};