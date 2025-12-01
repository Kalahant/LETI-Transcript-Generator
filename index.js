const express = require('express');
const discordTranscripts = require('discord-html-transcripts');

const app = express();
app.use(express.json({ limit: '50mb' })); // Increase limit for large message payloads

// Health check endpoint
app.get('/', (req, res) => {
    res.json({ status: 'ok', version: '2.0.0' });
});

// Generate transcript from messages sent directly
app.post('/generate-from-messages', async (req, res) => {
    const { messages, channel, guild, options } = req.body;

    if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: 'messages array is required' });
    }

    if (!channel || !guild) {
        return res.status(400).json({ error: 'channel and guild objects are required' });
    }

    try {
        // Create mock channel object with all required methods
        const mockChannel = {
            id: channel.id,
            name: channel.name,
            isDMBased: () => false,
            isThread: () => false,
            isTextBased: () => true,
            isVoiceBased: () => false,
            type: 0, // GuildText
            guild: {
                id: guild.id,
                name: guild.name,
                iconURL: () => guild.icon_url
            }
        };

        // Convert messages to the format discord-html-transcripts expects
        const formattedMessages = messages.map(msg => ({
            id: msg.id,
            content: msg.content || '',
            createdAt: new Date(msg.created_at),
            editedAt: msg.edited_at ? new Date(msg.edited_at) : null,
            author: {
                id: msg.author.id,
                username: msg.author.username,
                discriminator: msg.author.discriminator || '0',
                avatar: msg.author.avatar,
                bot: msg.author.bot || false,
                displayAvatarURL: () => msg.author.avatar_url,
                displayName: msg.author.display_name || msg.author.username,
                hexAccentColor: msg.author.color || null
            },
            attachments: new Map((msg.attachments || []).map(a => [a.id, {
                id: a.id,
                name: a.filename,
                url: a.url,
                proxyURL: a.proxy_url || a.url,
                size: a.size,
                height: a.height,
                width: a.width,
                contentType: a.content_type
            }])),
            embeds: (msg.embeds || []).map(e => ({
                title: e.title,
                description: e.description,
                url: e.url,
                timestamp: e.timestamp,
                color: e.color,
                footer: e.footer,
                image: e.image,
                thumbnail: e.thumbnail,
                author: e.author,
                fields: e.fields || []
            })),
            reactions: new Map((msg.reactions || []).map(r => [
                r.emoji.id ? `${r.emoji.name}:${r.emoji.id}` : r.emoji.name, 
                {
                    emoji: {
                        id: r.emoji.id || null,
                        name: r.emoji.name,
                        animated: r.emoji.animated || false
                    },
                    count: r.count,
                    users: { fetch: async () => new Map() }
                }
            ])),
            stickers: new Map((msg.stickers || []).map(s => [s.id, {
                id: s.id,
                name: s.name,
                formatType: s.format_type
            }])),
            reference: msg.reference ? {
                messageId: msg.reference.message_id
            } : null,
            mentions: {
                users: new Map((msg.mentions || []).map(u => [u.id, {
                    id: u.id,
                    username: u.username,
                    discriminator: u.discriminator || '0',
                    avatar: u.avatar,
                    bot: u.bot || false,
                    displayAvatarURL: () => u.avatar_url
                }])),
                roles: new Map(),
                channels: new Map()
            },
            components: msg.components || [],
            interaction: msg.interaction ? {
                id: msg.interaction.id,
                type: msg.interaction.type,
                commandName: msg.interaction.name,
                user: {
                    id: msg.interaction.user.id,
                    username: msg.interaction.user.username,
                    discriminator: msg.interaction.user.discriminator || '0',
                    avatar: msg.interaction.user.avatar,
                    bot: msg.interaction.user.bot || false,
                    displayAvatarURL: () => msg.interaction.user.avatar_url
                }
            } : null,
            type: msg.type || 0,
            system: msg.system || false,
            pinned: msg.pinned || false
        }));

        // Generate transcript
        const html = await discordTranscripts.generateFromMessages(formattedMessages, mockChannel, {
            returnType: 'string',
            poweredBy: options?.powered_by ?? false,
            footerText: options?.footer_text ?? 'Exported {number} message{s}',
            saveImages: options?.save_images ?? false,
            hydrate: true
        });

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(html);

    } catch (error) {
        console.error('Transcript generation error:', error);
        res.status(500).json({ error: error.message, stack: error.stack });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Transcript API server running on port ${PORT}`);
});