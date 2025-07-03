// Enhanced Twitch Shoutout API with better game detection and messages
const express = require('express');
const https = require('https');
const app = express();

// Twitch API credentials
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

// Get user's recent videos to find last game played
async function getRecentVideos(userId) {
  try {
    const token = await getTwitchToken();
    
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.twitch.tv',
        path: `/helix/videos?user_id=${userId}&first=5&type=archive`,
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
            resolve(response.data || []);
          } catch (error) {
            reject(error);
          }
        });
      });

      req.on('error', reject);
      req.end();
    });
  } catch (error) {
    return [];
  }
}

// Enhanced message variations
function getRandomMessage(username, game, isLive, followerCount) {
  const baseMessages = [
    `Go check out ${username}`,
    `Show some love to ${username}`,
    `Give ${username} a follow`,
    `Check out the amazing ${username}`,
    `Support ${username}`
  ];
  
  const baseMessage = baseMessages[Math.floor(Math.random() * baseMessages.length)];
  
  if (isLive && game) {
    const liveMessages = [
      `${baseMessage}, they're currently live playing ${game}!`,
      `${baseMessage} - they're streaming ${game} right now!`,
      `${baseMessage}, live now with ${game}!`
    ];
    return liveMessages[Math.floor(Math.random() * liveMessages.length)];
  } else if (game) {
    const recentMessages = [
      `${baseMessage}, they recently played ${game}!`,
      `${baseMessage}, check out their ${game} content!`,
      `${baseMessage} - great ${game} streamer!`
    ];
    return recentMessages[Math.floor(Math.random() * recentMessages.length)];
  } else {
    return `${baseMessage}, great content creator!`;
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
    let game = null;
    let isLive = false;
    
    if (stream) {
      game = stream.game_name;
      isLive = true;
    } else {
      // If not live, try to get recent game from videos
      const videos = await getRecentVideos(user.id);
      if (videos.length > 0) {
        // Try to extract game from recent video titles
        const recentVideo = videos[0];
        if (recentVideo.title) {
          // Look for common game indicators in titles
          const commonGames = ['Valorant', 'League of Legends', 'Fortnite', 'Minecraft', 'Among Us', 'Call of Duty', 'Apex Legends', 'Counter-Strike', 'Overwatch', 'World of Warcraft', 'Rocket League', 'Fall Guys', 'GTA', 'Dead by Daylight', 'Escape from Tarkov'];
          for (const gameCheck of commonGames) {
            if (recentVideo.title.toLowerCase().includes(gameCheck.toLowerCase())) {
              game = gameCheck;
              break;
            }
          }
        }
      }
    }
    
    // Generate enhanced message
    const message = getRandomMessage(username, game, isLive, user.view_count);
    const url = ` at https://twitch.tv/${username}`;
    
    res.send(message + url);
    
  } catch (error) {
    console.error('Error:', error);
    // Fallback with variety
    const fallbacks = [
      `Check out ${username} at https://twitch.tv/${username}!`,
      `Show some love to ${username} at https://twitch.tv/${username}!`,
      `Give ${username} a follow at https://twitch.tv/${username}!`
    ];
    res.send(fallbacks[Math.floor(Math.random() * fallbacks.length)]);
  }
});

// Debug endpoint to see what's happening
app.get('/debug', async (req, res) => {
  const username = req.query.user || '';
  if (!username) {
    return res.json({ error: 'No username provided' });
  }
  
  try {
    const user = await getTwitchUser(username.replace('@', ''));
    const stream = await getCurrentStream(user?.id);
    const videos = await getRecentVideos(user?.id);
    
    res.json({
      user: user ? {
        login: user.login,
        display_name: user.display_name,
        view_count: user.view_count
      } : null,
      stream: stream ? {
        game_name: stream.game_name,
        title: stream.title,
        viewer_count: stream.viewer_count
      } : null,
      recent_videos: videos.slice(0, 2).map(v => ({
        title: v.title,
        created_at: v.created_at
      }))
    });
  } catch (error) {
    res.json({ error: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const port = process.env.PORT || 3000;
app.listen(port, '0.0.0.0', () => {
  console.log(`Enhanced Shoutout API running on port ${port}`);
});
