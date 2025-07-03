// Simple Twitch Shoutout API - Single File Version
const express = require('express');
const https = require('https');
const app = express();

// Twitch API credentials (set these in your hosting environment)
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID || '';
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET || '';

let twitchToken = null;
let tokenExpiry = 0;

// Get Twitch access token
async function getTwitchToken() {
  if (twitchToken && Date.now() < tokenExpiry) {
    return twitchToken;
  }

  if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET) {
    throw new Error('Twitch credentials not configured');
  }

  const postData = `client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`;

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'id.twitch.tv',
      path: '/oauth2/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': postData.length
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          twitchToken = response.access_token;
          tokenExpiry = Date.now() + (response.expires_in * 1000) - 60000;
          resolve(twitchToken);
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

// Get user info from Twitch
async function getTwitchUser(username) {
  try {
    const token = await getTwitchToken();
    
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.twitch.tv',
        path: `/helix/users?login=${encodeURIComponent(username)}`,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Client-Id': TWITCH_CLIENT_ID
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            resolve(response.data[0] || null);
          } catch (error) {
            reject(error);
          }
        });
      });

      req.on('error', reject);
      req.end();
    });
  } catch (error) {
    return null;
  }
}

// Get current stream info
async function getCurrentStream(userId) {
  try {
    const token = await getTwitchToken();
    
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.twitch.tv',
        path: `/helix/streams?user_id=${userId}`,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Client-Id': TWITCH_CLIENT_ID
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            resolve(response.data[0] || null);
          } catch (error) {
            reject(error);
          }
        });
      });

      req.on('error', reject);
      req.end();
    });
  } catch (error) {
    return null;
  }
}

// Main shoutout endpoint
app.get('/', async (req, res) => {
  let username = req.query.user || '';
  
  // Clean up username
  username = username.trim();
  if (username.startsWith('@')) {
    username = username.substring(1);
  }
  
  if (!username) {
    return res.send('Please provide a username with ?user=USERNAME');
  }
  
  // Validate username format
  if (!/^[a-zA-Z0-9_]{4,25}$/.test(username)) {
    return res.send('Invalid username format. Twitch usernames must be 4-25 characters and contain only letters, numbers, and underscores.');
  }
  
  try {
    // Get user info
    const user = await getTwitchUser(username);
    if (!user) {
      return res.send(`User "${username}" not found on Twitch. Please check the username and try again.`);
    }
    
    // Get current stream
    const stream = await getCurrentStream(user.id);
    const game = stream?.game_name;
    
    // Generate message
    if (game) {
      res.send(`Check out ${username}, they are playing ${game} at https://twitch.tv/${username}!`);
    } else {
      res.send(`Check out ${username} at https://twitch.tv/${username}!`);
    }
    
  } catch (error) {
    console.error('Error:', error);
    res.send(`Check out ${username} at https://twitch.tv/${username}!`);
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const port = process.env.PORT || 3000;
app.listen(port, '0.0.0.0', () => {
  console.log(`Shoutout API running on port ${port}`);
});
