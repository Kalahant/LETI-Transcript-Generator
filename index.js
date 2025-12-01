const express = require('express');
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const discordTranscripts = require('discord-html-transcripts');

const app = express();
app.use(express.json());

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Message, Partials.Channel],
});

let isReady = false;

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
    isReady = true;
});

// Health check endpoint
app.get('/', (req, res) => {
    res.json({ status: 'ok', ready: isReady });
});

// Generate transcript endpoint
app.post('/generate', async (req, res) => {
    if (!isReady) {
        return res.status(503).json({ error: 'Bot not ready yet' });
    }

    const { channelId } = req.body;

    if (!channelId) {
        return res.status(400).json({ error: 'channelId is required' });
    }

    try {
        const channel = await client.channels.fetch(channelId);
        
        if (!channel || !channel.isTextBased()) {
            return res.status(404).json({ error: 'Channel not found or not a text channel' });
        }

        const html = await discordTranscripts.createTranscript(channel, {
            returnType: 'string',
            poweredBy: false,
            footerText: 'Exported {number} message{s}',
            hydrate: true,
        });

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(html);

    } catch (error) {
        console.error('Transcript generation error:', error);
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// Login the bot
client.login(process.env.DISCORD_TOKEN);