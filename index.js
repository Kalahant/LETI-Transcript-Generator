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

    // Create mock Discord.js-like objects that the library expects
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

    // Convert messages to format the library expects
    const processedMessages = messages.map(msg => {
      const createdAt = new Date(msg.timestamp);
      const editedAt = msg.edited_timestamp ? new Date(msg.edited_timestamp) : null;

      return {
        id: msg.id,
        type: msg.type || 0,
        content: msg.content || '',
        cleanContent: msg.content || '',
        createdAt: createdAt,
        createdTimestamp: createdAt.getTime(),
        editedAt: editedAt,
        editedTimestamp: editedAt ? editedAt.getTime() : null,
        author: {
          id: msg.author.id,
          username: msg.author.username,
          discriminator: msg.author.discriminator || '0',
          avatar: msg.author.avatar,
          bot: msg.author.bot || false,
          displayAvatarURL: (options) => {
            if (msg.author.avatar) {
              return `https://cdn.discordapp.com/avatars/${msg.author.id}/${msg.author.avatar}.png`;
            }
            const defaultIndex = parseInt(msg.author.discriminator || '0') % 5;
            return `https://cdn.discordapp.com/embed/avatars/${defaultIndex}.png`;
          },
          displayName: msg.author.displayName || msg.author.username,
          tag: `${msg.author.username}#${msg.author.discriminator || '0000'}`
        },
        attachments: new Map((msg.attachments || []).map(att => [att.id, {
          id: att.id,
          name: att.filename,
          url: att.url,
          proxyURL: att.url,
          size: att.size,
          width: att.width || null,
          height: att.height || null,
          contentType: att.content_type || null
        }])),
        embeds: (msg.embeds || []).map(embed => ({
          title: embed.title || null,
          description: embed.description || null,
          url: embed.url || null,
          color: embed.color || null,
          timestamp: embed.timestamp || null,
          fields: embed.fields || [],
          author: embed.author || null,
          footer: embed.footer || null,
          image: embed.image || null,
          thumbnail: embed.thumbnail || null
        })),
        mentions: {
          users: new Map((msg.mentions || []).map(u => [u.id, {
            id: u.id,
            username: u.username,
            discriminator: u.discriminator || '0',
            avatar: u.avatar,
            displayAvatarURL: () => {
              if (u.avatar) {
                return `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png`;
              }
              return `https://cdn.discordapp.com/embed/avatars/0.png`;
            }
          }])),
          roles: new Map((msg.mention_roles || []).map(r => [r, { id: r, name: 'Role' }])),
          everyone: false
        },
        pinned: msg.pinned || false,
        reference: msg.reference ? {
          messageId: msg.reference.message_id,
          channelId: msg.reference.channel_id,
          guildId: msg.reference.guild_id
        } : null,
        reactions: {
          cache: new Map((msg.reactions || []).map((r, i) => [`${i}`, {
            emoji: {
              id: r.emoji.id || null,
              name: r.emoji.name,
              animated: false
            },
            count: r.count || 0
          }]))
        },
        system: false,
        member: msg.author ? {
          displayName: msg.author.displayName || msg.author.username,
          roles: {
            cache: new Map()
          }
        } : null
      };
    });

    // Generate transcript
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

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});