const express = require('express');
const cors = require('cors');
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const discordTranscripts = require('discord-html-transcripts');

const app = express();
const PORT = process.env.PORT || 3000;

// Increase payload limits and timeouts
app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

// Create Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

let isReady = false;

client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  isReady = true;
});

client.login(process.env.DISCORD_BOT_TOKEN).catch(err => {
  console.error('❌ Failed to login:', err);
});

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ 
    status: isReady ? 'ready' : 'connecting',
    bot: isReady ? client.user.tag : null,
    message: 'Discord HTML Transcripts API'
  });
});

// Generate transcript endpoint
app.post('/generate', async (req, res) => {
  // Set response timeout
  req.setTimeout(300000); // 5 minutes
  
  try {
    if (!isReady) {
      return res.status(503).json({ 
        error: 'Bot is still connecting to Discord',
        status: 'connecting'
      });
    }

    const { channelId } = req.body;

    if (!channelId) {
      return res.status(400).json({ error: 'channelId is required' });
    }

    console.log(`📝 Generating transcript for channel ${channelId}...`);

    // Fetch the channel
    const channel = await client.channels.fetch(channelId).catch(err => {
      console.error('Failed to fetch channel:', err);
      return null;
    });

    if (!channel) {
      return res.status(404).json({ error: 'Channel not found or bot lacks access' });
    }

    // Check if it's a text channel (type 0, 5, 11, or 12)
    if (channel.type !== 0 && channel.type !== 5 && channel.type !== 11 && channel.type !== 12) {
      return res.status(400).json({ error: 'Channel is not a text-based channel' });
    }

    console.log(`Fetching messages from #${channel.name}...`);

    // Use createTranscript which handles everything properly
    const transcript = await discordTranscripts.createTranscript(channel, {
      limit: -1, // Fetch all messages
      returnType: 'string',
      filename: `transcript-${channel.name}.html`,
      saveImages: false, // Don't embed images (faster)
      poweredBy: false
    });

    console.log(`✅ Transcript generated for #${channel.name}`);

    // Return HTML
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(transcript);

  } catch (error) {
    console.error('Error generating transcript:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      error: 'Failed to generate transcript',
      details: error.message,
      stack: error.stack
    });
  }
});

const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

// Increase server timeout
server.timeout = 300000; // 5 minutes