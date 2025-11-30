const express = require('express');
const cors = require('cors');
const discordTranscripts = require('discord-html-transcripts');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Discord Transcript API is running' });
});

// Generate transcript endpoint
app.post('/generate', async (req, res) => {
  try {
    const { messages, channel, guild } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    if (!channel) {
      return res.status(400).json({ error: 'Channel info is required' });
    }

    // Generate transcript using discord-html-transcripts
    const transcript = await discordTranscripts.generateFromMessages(messages, channel);

    // Return HTML
    res.setHeader('Content-Type', 'text/html');
    res.send(transcript);
  } catch (error) {
    console.error('Error generating transcript:', error);
    res.status(500).json({ 
      error: 'Failed to generate transcript', 
      details: error.message 
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});