// Twitch Shoutout API with PROPER game detection (like StreamElements)
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

// Make API request helper
async function makeApiRequest(path) {
  const token = await getTwitchToken();
  
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.twitch.tv',
      path: path,
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
          resolve(response);
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

// Get user info from Twitch
async function getTwitchUser(username) {
  try {
    const response = await makeApiRequest(`/helix/users?login=${encodeURIComponent(username)}`);
    return response.data[0] || null;
  } catch (error) {
    return null;
  }
}

// Get current stream info
async function getCurrentStream(userId) {
  try {
    const response = await makeApiRequest(`/helix/streams?user_id=${userId}`);
    return response.data[0] || null;
  } catch (error) {
    return null;
  }
}

// Get channel information (includes last game category)
async function getChannelInfo(userId) {
  try {
    const response = await makeApiRequest(`/helix/channels?broadcaster_id=${userId}`);
    return response.data[0] || null;
  } catch (error) {
    return null;
  }
}

// Get recent streams/videos with game info
async function getRecentVideos(userId) {
  try {
    const response = await makeApiRequest(`/helix/videos?user_id=${userId}&first=10&type=archive`);
    return response.data || [];
  } catch (error) {
    return [];
  }
}

// Get game info by ID
async function getGameById(gameId) {
  try {
    if (!gameId) return null;
    const response = await makeApiRequest(`/helix/games?id=${gameId}`);
    return response.data[0] || null;
  } catch (error) {
    return null;
  }
}

// Main function to get the last played game (like StreamElements does)
async function getLastPlayedGame(userId) {
  try {
    // First check current stream
    const stream = await getCurrentStream(userId);
    if (stream && stream.game_name && stream.game_name !== 'Just Chatting') {
      return stream.game_name;
    }

    // If not live or just chatting, check channel info for last category
    const channelInfo = await getChannelInfo(userId);
    if (channelInfo && channelInfo.game_name && channelInfo.game_name !== 'Just Chatting') {
      return channelInfo.game_name;
    }

    // If still no game, check recent videos for actual game content
    const videos = await getRecentVideos(userId);
    for (const video of videos) {
      if (video.type === 'archive' && video.duration) {
        // Parse duration - skip very short videos (likely Just Chatting)
        const durationMatch = video.duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
        if (durationMatch) {
          const hours = parseInt(durationMatch[1] || '0');
          const minutes = parseInt(durationMatch[2] || '0');
          const totalMinutes = hours * 60 + minutes;
          
          // Only consider videos longer than 30 minutes for game content
          if (totalMinutes > 30) {
            // Try to extract game from title or use a more sophisticated approach
            const title = video.title.toLowerCase();
            
            // Skip obvious non-game content
            const skipWords = ['react', 'irl', 'chat', 'talk', 'podcast', 'interview', 'music'];
            const hasSkipWord = skipWords.some(word => title.includes(word));
            
            if (!hasSkipWord) {
              // This is likely game content, but we need the actual game name
              // For now, we'll return a generic indicator that they stream games
              return "games"; // This will trigger a general gaming message
            }
          }
        }
      }
    }

    return null;
  } catch (error) {
    console.error('Error getting last played game:', error);
    return null;
  }
}

// Main shoutout endpoint
app.get('/', async (req, res) => {
  let username = req.query.user || '';
  
  // Clean up username - remove @ symbol if present
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

    // Get the last played game
    const game = await getLastPlayedGame(user.id);
    
    // Generate message based on game availability
    let message;
    if (game && game !== 'games') {
      // Specific game found
      message = `Check out ${username}, they are playing ${game} at https://twitch.tv/${username}!`;
    } else if (game === 'games') {
      // General gaming content found
      message = `Check out ${username}, great gaming content at https://twitch.tv/${username}!`;
    } else {
      // No specific game found
      message = `Check out ${username} at https://twitch.tv/${username}!`;
    }
    
    res.send(message);
    
  } catch (error) {
    console.error('Error processing shoutout request:', error);
    // Fallback response
    res.send(`Check out ${username} at https://twitch.tv/${username}!`);
  }
});

// Debug endpoint to see what data we're getting
app.get('/debug', async (req, res) => {
  const username = req.query.user || '';
  if (!username) {
    return res.json({ error: 'No username provided' });
  }
  
  try {
    const cleanUsername = username.replace('@', '');
    const user = await getTwitchUser(cleanUsername);
    
    if (!user) {
      return res.json({ error: 'User not found' });
    }

    const stream = await getCurrentStream(user.id);
    const channelInfo = await getChannelInfo(user.id);
    const videos = await getRecentVideos(user.id);
    const lastGame = await getLastPlayedGame(user.id);
    
    res.json({
      user: {
        login: user.login,
        display_name: user.display_name,
        id: user.id
      },
      current_stream: stream ? {
        game_name: stream.game_name,
        title: stream.title,
        is_live: true
      } : { is_live: false },
      channel_info: channelInfo ? {
        game_name: channelInfo.game_name,
        title: channelInfo.title
      } : null,
      recent_videos: videos.slice(0, 3).map(v => ({
        title: v.title,
        duration: v.duration,
        created_at: v.created_at,
        type: v.type
      })),
      detected_last_game: lastGame,
      final_message: lastGame ? 
        `Check out ${cleanUsername}, they are playing ${lastGame} at https://twitch.tv/${cleanUsername}!` :
        `Check out ${cleanUsername} at https://twitch.tv/${cleanUsername}!`
    });
  } catch (error) {
    res.json({ error: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    features: ['@ symbol removal', 'real game detection', 'fallback handling']
  });
});

const port = process.env.PORT || 3000;
app.listen(port, '0.0.0.0', () => {
  console.log(`Twitch Shoutout API running on port ${port}`);
  console.log(`Features: Proper game detection, @ symbol handling, StreamElements compatible`);
});
