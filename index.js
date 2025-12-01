const express = require('express');
const discordTranscripts = require('discord-html-transcripts');
const { Collection } = require('@discordjs/collection');

const app = express();
app.use(express.json({ limit: '50mb' }));

console.log('Starting transcript API server...');

// Health check endpoint
app.get('/', (req, res) => {
    res.json({ status: 'ok', version: '2.1.0' });
});

// Generate transcript from messages sent directly
app.post('/generate-from-messages', async (req, res) => {
    console.log('Received transcript request');
    
    const { messages, channel, guild, options } = req.body;

    if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: 'messages array is required' });
    }

    if (!channel || !guild) {
        return res.status(400).json({ error: 'channel and guild objects are required' });
    }

    console.log(`Processing ${messages.length} messages for channel: ${channel.name}`);

    try {
        // Create a proper Collection for messages
        const messageCollection = new Collection();

        for (const msg of messages) {
            // Create attachment collection
            const attachments = new Collection();
            for (const a of (msg.attachments || [])) {
                attachments.set(a.id, {
                    id: a.id,
                    name: a.filename,
                    filename: a.filename,
                    url: a.url,
                    proxyURL: a.proxy_url || a.url,
                    size: a.size || 0,
                    height: a.height || null,
                    width: a.width || null,
                    contentType: a.content_type || 'application/octet-stream',
                    spoiler: false,
                    description: null
                });
            }

            // Create reactions collection
            const reactions = new Collection();
            for (const r of (msg.reactions || [])) {
                const emojiKey = r.emoji?.id ? `${r.emoji.name}:${r.emoji.id}` : (r.emoji?.name || '❓');
                reactions.set(emojiKey, {
                    emoji: {
                        id: r.emoji?.id || null,
                        name: r.emoji?.name || '❓',
                        animated: r.emoji?.animated || false,
                        toString: () => r.emoji?.id ? `<${r.emoji.animated ? 'a' : ''}:${r.emoji.name}:${r.emoji.id}>` : r.emoji?.name || '❓'
                    },
                    count: r.count || 1,
                    me: false,
                    users: {
                        fetch: async () => new Collection()
                    }
                });
            }

            // Create stickers collection  
            const stickers = new Collection();
            for (const s of (msg.stickers || [])) {
                stickers.set(s.id, {
                    id: s.id,
                    name: s.name,
                    formatType: s.format_type,
                    format: s.format_type
                });
            }

            // Create mentions collection
            const mentionUsers = new Collection();
            for (const u of (msg.mentions || [])) {
                mentionUsers.set(u.id, createMockUser(u));
            }

            // Build the message object
            const messageObj = {
                id: msg.id,
                content: msg.content || '',
                createdTimestamp: new Date(msg.created_at).getTime(),
                createdAt: new Date(msg.created_at),
                editedTimestamp: msg.edited_at ? new Date(msg.edited_at).getTime() : null,
                editedAt: msg.edited_at ? new Date(msg.edited_at) : null,
                author: createMockUser(msg.author),
                member: msg.author ? createMockMember(msg.author) : null,
                attachments,
                embeds: (msg.embeds || []).map(formatEmbed),
                reactions,
                stickers,
                reference: msg.reference ? {
                    messageId: msg.reference.message_id,
                    channelId: channel.id,
                    guildId: guild.id
                } : null,
                mentions: {
                    users: mentionUsers,
                    roles: new Collection(),
                    channels: new Collection(),
                    everyone: false,
                    crosspostedChannels: new Collection(),
                    repliedUser: null
                },
                components: msg.components || [],
                interaction: msg.interaction ? {
                    id: msg.interaction.id,
                    type: msg.interaction.type,
                    commandName: msg.interaction.name || 'command',
                    user: createMockUser(msg.interaction.user)
                } : null,
                type: msg.type ?? 0,
                system: msg.system || false,
                pinned: msg.pinned || false,
                tts: false,
                nonce: null,
                webhookId: null,
                applicationId: null,
                activity: null,
                flags: { bitfield: 0 },
                cleanContent: msg.content || '',
                channel: null, // Will be set below
                guild: null,   // Will be set below
                url: `https://discord.com/channels/${guild.id}/${channel.id}/${msg.id}`,
                
                // Methods that might be called
                toString: () => msg.content || '',
                fetch: async () => messageObj,
                fetchReference: async () => null,
                react: async () => null,
                delete: async () => null,
                edit: async () => messageObj,
                reply: async () => messageObj,
                pin: async () => messageObj,
                unpin: async () => messageObj,
                crosspost: async () => messageObj
            };

            messageCollection.set(msg.id, messageObj);
        }

        // Create mock guild object
        const mockGuild = {
            id: guild.id,
            name: guild.name,
            icon: guild.icon_url ? 'icon' : null,
            iconURL: (opts) => guild.icon_url || null,
            channels: {
                cache: new Collection(),
                fetch: async () => new Collection()
            },
            members: {
                cache: new Collection(),
                fetch: async () => null
            },
            roles: {
                cache: new Collection(),
                fetch: async () => new Collection()
            },
            emojis: {
                cache: new Collection()
            }
        };

        // Create mock channel object
        const mockChannel = {
            id: channel.id,
            name: channel.name,
            type: 0,
            isDMBased: () => false,
            isThread: () => false,
            isTextBased: () => true,
            isVoiceBased: () => false,
            guild: mockGuild,
            messages: {
                cache: messageCollection,
                fetch: async () => messageCollection
            },
            toString: () => `<#${channel.id}>`,
            send: async () => null
        };

        // Set channel/guild references in messages
        for (const [, msg] of messageCollection) {
            msg.channel = mockChannel;
            msg.guild = mockGuild;
        }

        console.log(`Generating transcript with ${messageCollection.size} messages...`);

        // Generate transcript
        const html = await discordTranscripts.generateFromMessages(messageCollection, mockChannel, {
            returnType: 'string',
            poweredBy: options?.powered_by ?? false,
            footerText: options?.footer_text ?? 'Exported {number} message{s}',
            saveImages: options?.save_images ?? false,
            hydrate: true
        });

        console.log(`Transcript generated (${html.length} bytes)`);

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(html);

    } catch (error) {
        console.error('Transcript generation error:', error);
        console.error('Stack:', error.stack);
        res.status(500).json({ error: error.message, stack: error.stack });
    }
});

function createMockUser(userData) {
    if (!userData) {
        return {
            id: '0',
            username: 'Unknown',
            displayName: 'Unknown',
            discriminator: '0',
            avatar: null,
            bot: false,
            system: false,
            flags: { bitfield: 0 },
            displayAvatarURL: () => 'https://cdn.discordapp.com/embed/avatars/0.png',
            avatarURL: () => null,
            toString: () => 'Unknown',
            tag: 'Unknown#0'
        };
    }

    const displayName = userData.display_name || userData.username || 'Unknown';
    const username = userData.username || 'Unknown';
    
    return {
        id: userData.id || '0',
        username: username,
        displayName: displayName,
        globalName: displayName,
        discriminator: userData.discriminator || '0',
        avatar: userData.avatar || null,
        bot: userData.bot || false,
        system: false,
        flags: { bitfield: 0 },
        displayAvatarURL: (opts) => userData.avatar_url || 'https://cdn.discordapp.com/embed/avatars/0.png',
        avatarURL: (opts) => userData.avatar_url || null,
        toString: () => `<@${userData.id}>`,
        tag: userData.discriminator && userData.discriminator !== '0' 
            ? `${username}#${userData.discriminator}` 
            : username
    };
}

function createMockMember(userData) {
    if (!userData) return null;
    
    const user = createMockUser(userData);
    
    return {
        ...user,
        nickname: userData.display_name || null,
        displayName: userData.display_name || userData.username || 'Unknown',
        roles: {
            cache: new Collection(),
            highest: { color: 0, hexColor: '#000000' }
        },
        displayColor: 0,
        displayHexColor: userData.color || '#000000'
    };
}

function formatEmbed(e) {
    if (!e) return null;
    
    return {
        title: e.title || null,
        description: e.description || null,
        url: e.url || null,
        timestamp: e.timestamp || null,
        color: e.color || null,
        footer: e.footer ? {
            text: e.footer.text || '',
            iconURL: e.footer.icon_url || null,
            proxyIconURL: e.footer.proxy_icon_url || null
        } : null,
        image: e.image ? {
            url: e.image.url || null,
            proxyURL: e.image.proxy_url || null,
            height: e.image.height || null,
            width: e.image.width || null
        } : null,
        thumbnail: e.thumbnail ? {
            url: e.thumbnail.url || null,
            proxyURL: e.thumbnail.proxy_url || null,
            height: e.thumbnail.height || null,
            width: e.thumbnail.width || null
        } : null,
        video: e.video ? {
            url: e.video.url || null,
            proxyURL: e.video.proxy_url || null,
            height: e.video.height || null,
            width: e.video.width || null
        } : null,
        provider: e.provider ? {
            name: e.provider.name || null,
            url: e.provider.url || null
        } : null,
        author: e.author ? {
            name: e.author.name || null,
            url: e.author.url || null,
            iconURL: e.author.icon_url || null,
            proxyIconURL: e.author.proxy_icon_url || null
        } : null,
        fields: (e.fields || []).map(f => ({
            name: f.name || '',
            value: f.value || '',
            inline: f.inline || false
        }))
    };
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Transcript API server running on port ${PORT}`);
});