const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const TurnService = require('./services/turnService');
const { authenticateSocket, authenticateHttp } = require('./middleware/auth');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// Read environment variables
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '*')
  .split(',')
  .map((s) => s.trim())
  .filter((s) => s.length > 0);
const CALL_TIMEOUT_MS = (parseInt(process.env.CALL_TIMEOUT_SECONDS, 10) || 30) * 1000;
const HEALTH_CHECK_ENABLED = String(process.env.HEALTH_CHECK_ENABLED || 'true').toLowerCase() !== 'false';

// Configure CORS for Socket.IO
const io = socketIo(server, {
  cors: {
    origin: ALLOWED_ORIGINS.includes('*') ? '*' : ALLOWED_ORIGINS,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Configure CORS for Express
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (ALLOWED_ORIGINS.includes('*') || ALLOWED_ORIGINS.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  })
);
app.use(express.json());

// Store active users and calls
const activeUsers = new Map();
const activeCalls = new Map();

// Initialize TURN service
const turnService = new TurnService();

// Health check endpoint (optional)
if (HEALTH_CHECK_ENABLED) {
  app.get('/health', (req, res) => {
    res.json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      activeUsers: activeUsers.size,
      activeCalls: activeCalls.size,
    });
  });
}

// TURN credentials endpoint (requires auth)
app.post('/turn-credentials', authenticateHttp, async (req, res) => {
  try {
    const { userId: bodyUserId, provider = 'twilio' } = req.body;
    const effectiveUserId = bodyUserId || req.user?.userId;

    if (!effectiveUserId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const credentials = await turnService.getTurnCredentials(effectiveUserId, provider);

    res.json({
      success: true,
      credentials: credentials,
      expiresAt: new Date(Date.now() + credentials.ttl * 1000).toISOString(),
    });
  } catch (error) {
    console.error('Error getting TURN credentials:', error);
    res.status(500).json({
      error: 'Failed to get TURN credentials',
      fallback: turnService.getFallbackStunServers(),
    });
  }
});

// Require JWT on socket connections
io.use(authenticateSocket);

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // User registration
  socket.on('register_user', (data) => {
    const { userId } = data;
    // If authenticated, prefer token-derived userId
    const effectiveUserId = socket.userId || userId;
    activeUsers.set(userId, {
      socketId: socket.id,
      userId: effectiveUserId,
      isAvailable: false,
      connectedAt: new Date(),
    });

    socket.userId = effectiveUserId;
    socket.join(`user_${effectiveUserId}`);

    console.log(`User registered: ${effectiveUserId}`);

    // Notify user of successful registration
    socket.emit('registration_success', { userId: effectiveUserId });
  });

  // Update user availability
  socket.on('update_availability', (data) => {
    const { userId, isAvailable } = data;
    const user = activeUsers.get(userId);

    if (user) {
      user.isAvailable = isAvailable;
      console.log(`User ${userId} availability updated: ${isAvailable}`);
    }
  });

  // Call initiation
  socket.on('call_initiate', (data) => {
    const { callId, callerId, targetUserId, scheduleId, callType, offer } = data;

    console.log(`Call initiated: ${callId} from ${callerId} to ${targetUserId}`);

    // Store call information
    activeCalls.set(callId, {
      callId,
      callerId,
      targetUserId,
      scheduleId,
      callType,
      status: 'ringing',
      startTime: new Date(),
    });

    // Send call to target user
    io.to(`user_${targetUserId}`).emit('call_incoming', {
      callId,
      callerId,
      scheduleId,
      callType,
      offer,
    });

    // Also forward the SDP offer via the dedicated WebRTC event so clients can
    // use a single handler (`webrtc_offer`) to process remote offers.
    io.to(`user_${targetUserId}`).emit('webrtc_offer', { callId, offer });

    // Set timeout for call
    setTimeout(() => {
      const call = activeCalls.get(callId);
      if (call && call.status === 'ringing') {
        // Call timeout
        io.to(`user_${callerId}`).emit('call_timeout', { callId });
        io.to(`user_${targetUserId}`).emit('call_timeout', { callId });
        activeCalls.delete(callId);
        console.log(`Call timeout: ${callId}`);
      }
    }, CALL_TIMEOUT_MS);
  });

  // Call answer
  socket.on('call_answer', (data) => {
    const { callId, userId } = data;
    const call = activeCalls.get(callId);

    if (call) {
      call.status = 'answered';
      console.log(`Call answered: ${callId} by ${userId}`);

      // Notify caller that call was answered
      io.to(`user_${call.callerId}`).emit('call_answered', { callId, userId });
    }
  });

  // Call rejection
  socket.on('call_reject', (data) => {
    const { callId, userId } = data;
    const call = activeCalls.get(callId);

    if (call) {
      console.log(`Call rejected: ${callId} by ${userId}`);

      // Notify caller that call was rejected
      io.to(`user_${call.callerId}`).emit('call_rejected', { callId, userId });

      // Clean up call
      activeCalls.delete(callId);
    }
  });

  // Call end
  socket.on('call_end', (data) => {
    const { callId, userId } = data;
    const call = activeCalls.get(callId);

    if (call) {
      console.log(`Call ended: ${callId} by ${userId}`);

      // Notify both parties that call ended
      io.to(`user_${call.callerId}`).emit('call_ended', { callId, userId });
      io.to(`user_${call.targetUserId}`).emit('call_ended', { callId, userId });

      // Clean up call
      activeCalls.delete(callId);
    }
  });

  // WebRTC signaling
  socket.on('webrtc_offer', (data) => {
    const { callId, offer } = data;
    const call = activeCalls.get(callId);

    if (call) {
      // Forward offer to target user
      io.to(`user_${call.targetUserId}`).emit('webrtc_offer', { callId, offer });
      console.log(`WebRTC offer forwarded for call: ${callId}`);
    }
  });

  socket.on('webrtc_answer', (data) => {
    const { callId, answer } = data;
    const call = activeCalls.get(callId);

    if (call) {
      call.status = 'connected';
      // Forward answer to caller
      io.to(`user_${call.callerId}`).emit('webrtc_answer', { callId, answer });
      console.log(`WebRTC answer forwarded for call: ${callId}`);
    }
  });

  socket.on('webrtc_ice_candidate', (data) => {
    const { callId, candidate } = data;
    const call = activeCalls.get(callId);

    if (call) {
      // Forward ICE candidate to the other party
      const targetUserId = socket.userId === call.callerId ? call.targetUserId : call.callerId;
      io.to(`user_${targetUserId}`).emit('webrtc_ice_candidate', { callId, candidate });
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);

    // Remove user from active users
    if (socket.userId) {
      activeUsers.delete(socket.userId);

      // End any active calls for this user
      for (const [callId, call] of activeCalls.entries()) {
        if (call.callerId === socket.userId || call.targetUserId === socket.userId) {
          const otherUserId = call.callerId === socket.userId ? call.targetUserId : call.callerId;
          io.to(`user_${otherUserId}`).emit('call_ended', { callId, reason: 'user_disconnected' });
          activeCalls.delete(callId);
        }
      }
    }
  });

  // Error handling
  socket.on('error', (error) => {
    console.error(`Socket error for ${socket.id}:`, error);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`AuroraCall Signaling Server running on port ${PORT}`);
  if (HEALTH_CHECK_ENABLED) {
    console.log(`Health check available at: http://localhost:${PORT}/health`);
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});