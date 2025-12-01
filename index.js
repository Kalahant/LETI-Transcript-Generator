const express = require('express');
const cors = require('cors');
const discordTranscripts = require('discord-html-transcripts');

const app = express();
const PORT = process.env.PORT || 3000;


app.use(cors());
app.use(express.json({ limit: '50mb' }));


app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Discord Transcript API is running' });
});


app.post('/generate', async (req, res) => {
  try {
    const { messages, channel, guild } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    if (!channel) {
      return res.status(400).json({ error: 'Channel info is required' });
    }

    const mockChannel = {
      id: channel.id,
      name: channel.name,
      type: channel.type,
      topic: channel.topic || null,
      isDMBased: () => false,
      isThread: () => false,
      guild: guild ? {
        id: guild.id,
        name: guild.name,
        iconURL: () => guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png` : null
      } : null
    };

    const processedMessages = messages.map(msg => ({
      id: msg.id,
      type: msg.type || 0,
      content: msg.content || '',
      cleanContent: msg.content || '',
      createdTimestamp: new Date(msg.timestamp).getTime(),
      editedTimestamp: msg.edited_timestamp ? new Date(msg.edited_timestamp).getTime() : null,
      author: {
        id: msg.author.id,
        username: msg.author.username,
        discriminator: msg.author.discriminator || '0',
        avatar: msg.author.avatar,
        bot: msg.author.bot || false,
        displayAvatarURL: () => {
          if (msg.author.avatar) {
            return `https://cdn.discordapp.com/avatars/${msg.author.id}/${msg.author.avatar}.png`;
          }
          return `https://cdn.discordapp.com/embed/avatars/${parseInt(msg.author.discriminator || '0') % 5}.png`;
        },
        displayName: msg.author.displayName || msg.author.username
      },
      attachments: new Map(msg.attachments.map(att => [att.id, {
        id: att.id,
        name: att.filename,
        url: att.url,
        proxyURL: att.url,
        size: att.size,
        width: att.width,
        height: att.height
      }])),
      embeds: msg.embeds || [],
      mentions: {
        users: new Map(msg.mentions?.map(u => [u.id, {
          id: u.id,
          username: u.username,
          discriminator: u.discriminator || '0',
          avatar: u.avatar
        }]) || []),
        roles: new Map(msg.mention_roles?.map(r => [r, { id: r }]) || []),
        everyone: false
      },
      pinned: msg.pinned || false,
      reference: msg.reference ? {
        messageId: msg.reference.message_id,
        channelId: msg.reference.channel_id,
        guildId: msg.reference.guild_id
      } : null,
      reactions: {
        cache: new Map(msg.reactions?.map((r, i) => [i, {
          emoji: {
            id: r.emoji.id,
            name: r.emoji.name,
            animated: false
          },
          count: r.count
        }]) || [])
      }
    }));

    const transcript = await discordTranscripts.generateFromMessages(
      processedMessages,
      mockChannel,
      {
        returnType: 'string',
        filename: `transcript-${channel.name}.html`,
        saveImages: true,
        poweredBy: false
      }
    );

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(transcript);
  } catch (error) {
    console.error('Error generating transcript:', error);
    res.status(500).json({ 
      error: 'Failed to generate transcript', 
      details: error.message,
      stack: error.stack
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});