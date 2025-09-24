const axios = require('axios');

class TurnService {
  constructor() {
    // Twilio credentials (store in environment variables)
    this.twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
    this.twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
    
    // Metered.ca credentials (alternative)
    this.meteredApiKey = process.env.METERED_API_KEY;
  }

  /**
   * Get TURN credentials from Twilio Network Traversal Service
   */
  async getTwilioTurnCredentials(userId) {
    try {
      if (!this.twilioAccountSid || !this.twilioAuthToken) {
        throw new Error('Twilio credentials not configured');
      }

      const url = `https://api.twilio.com/2010-04-01/Accounts/${this.twilioAccountSid}/Tokens.json`;
      
      const response = await axios.post(url, {}, {
        auth: {
          username: this.twilioAccountSid,
          password: this.twilioAuthToken
        }
      });

      const token = response.data;
      
      return {
        iceServers: token.ice_servers.map(server => ({
          urls: server.urls,
          username: server.username,
          credential: server.credential
        })),
        ttl: token.ttl, // Time to live in seconds
        userId: userId,
        timestamp: Date.now()
      };
    } catch (error) {
      console.error('Error getting Twilio TURN credentials:', error);
      throw error;
    }
  }

  /**
   * Get TURN credentials from Metered.ca
   */
  async getMeteredTurnCredentials(userId) {
    try {
      if (!this.meteredApiKey) {
        throw new Error('Metered API key not configured');
      }

      const response = await axios.get(
        `https://auroracall.metered.live/api/v1/turn/credentials?apiKey=${this.meteredApiKey}`
      );

      // Metered.ca returns the iceServers array directly
      const iceServers = response.data;
      
      return {
        iceServers: iceServers,
        ttl: 86400, // 24 hours
        userId: userId,
        timestamp: Date.now()
      };
    } catch (error) {
      console.error('Error getting Metered TURN credentials:', error);
      throw error;
    }
  }

  /**
   * Get fallback STUN servers (free)
   */
  getFallbackStunServers() {
    return {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' }
      ],
      ttl: 3600, // 1 hour
      timestamp: Date.now()
    };
  }

  /**
   * Get TURN credentials with fallback
   */
  async getTurnCredentials(userId, preferredProvider = 'metered') {
    try {
      let credentials;

      if (preferredProvider === 'metered') {
        try {
          credentials = await this.getMeteredTurnCredentials(userId);
        } catch (error) {
          console.log('Metered failed, trying Twilio...');
          credentials = await this.getTwilioTurnCredentials(userId);
        }
      } else if (preferredProvider === 'twilio') {
        try {
          credentials = await this.getTwilioTurnCredentials(userId);
        } catch (error) {
          console.log('Twilio failed, trying Metered...');
          credentials = await this.getMeteredTurnCredentials(userId);
        }
      }

      // Add STUN servers to the mix
      const stunServers = this.getFallbackStunServers();
      credentials.iceServers = [...stunServers.iceServers, ...credentials.iceServers];

      return credentials;
    } catch (error) {
      console.log('All TURN providers failed, using STUN only');
      return this.getFallbackStunServers();
    }
  }
}

module.exports = TurnService;