const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  PermissionsBitField,
  REST,
  Routes,
  Events,
  ActivityType,
  ButtonBuilder,    
  ActionRowBuilder,
  ButtonStyle,      
  ChannelType,
  ModalBuilder,     
  TextInputBuilder,  
  TextInputStyle,
  Partials,
  MessageFlags,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder
} = require('discord.js');
const http = require('http');

// --- ⚠️ CONFIGURATION ⚠️ ---
const GUILD_ID = '1371775026264670228'; // Your Single Server ID

// --- ROLES & CONFIG ---
const ULTRA_HELPER_ROLE_ID = '1529499021884919858'; // Ultra Helper Role ID
const HELPER_ROLE_ID = '1529499059596038285'; // Standard Helper / Farming Role ID
const SUPPORT_ROLE_ID = '1529498802149392614'; // Support / Concern Role ID
const TICKET_GUIDE_URL = 'https://discord.com'; 

const STANDARD_BANNER_URL = 'https://i.pinimg.com/originals/5d/d8/0f/5dd80fe00a06651f3200aea753987f50.gif';

const AQW_SERVERS = [
  { label: 'Twilly', emoji: { id: '1534938699190763542', name: 'sadtwilly', animated: false } },
  { label: 'Twig', emoji: { id: '1534938798545305711', name: 'twighappy', animated: false } },
  { label: 'Artix', emoji: { id: '1534938821974556854', name: 'artixkek', animated: false } },
  { label: 'Gravelyn', emoji: '⚔️' },
  { label: 'Sir Ver', emoji: '⚔️' },
  { label: 'Galanoth', emoji: '⚔️' },
  { label: 'Yorumi', emoji: '⚔️' },
  { label: 'Espada', emoji: '⚔️' },
  { label: 'Sepulchure', emoji: { id: '1534938847518130247', name: 'toocloseSeppy', animated: false } },
  { label: 'Safiria', emoji: '⚔️' },
  { label: 'Swordhaven (EU)', emoji: '⚔️' },
  { label: 'Alteon', emoji: '⚔️' },
  { label: 'Yokai (SEA)', emoji: '⚔️' }
];

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildPresences
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

const defaultPrefix = '!';

// --- DATA STORAGE ---
const guildSettings = new Map();
const snipes = new Map();
const afkUsers = new Map();
const uwuTargets = new Set();
const stickyMessages = new Map();
const rejectionReasons = new Map(); 
const activeTickets = new Map();
const helperPoints = new Map();
const userRequestCounts = new Map();
const roleRewards = new Map();
const tempTicketCache = new Map();

let ticketCounter = 0;
const globalStats = {
  totalTicketsCompleted: 0,
  totalPointsGiven: 0,
  totalBossesSlain: 0
};

// --- ⚙️ CUSTOM TICKET PRESETS ---
const TICKET_PRESETS = {
  farming: { 
    label: 'Farming Assistance', 
    max: 6, 
    points: 3, 
    roleIds: [HELPER_ROLE_ID],
    bannerUrl: 'https://media.discordapp.net/attachments/1258198097293611131/1534961239598432368/6.png?ex=6a76078d&is=6a74b60d&hm=8f0ef43ee15c9a77eb4db7a93f72a13ed220524e73fa9bd105894b9e47e40208&=&format=webp&quality=lossless&width=2048&height=1024',
    accentColor: 0xFDE37C 
  },
  ultra_weeklies: { 
    label: 'Ultra Weeklies', 
    max: 3, 
    points: 3, 
    roleIds: [ULTRA_HELPER_ROLE_ID],
    bannerUrl: 'https://media.discordapp.net/attachments/1258198097293611131/1534961237132050705/1.png?ex=6a76078d&is=6a74b60d&hm=c653e9de44bf6517cf997847ec6dbc9987387aed4dea2ea0823059f54f83a956&=&format=webp&quality=lossless&width=2048&height=1024',
    accentColor: 0xFCDD62 
  },
  seven_man_dailies: { 
    label: '7-Man Dailies', 
    max: 6, 
    points: 2, 
    roleIds: [ULTRA_HELPER_ROLE_ID, HELPER_ROLE_ID],
    bannerUrl: 'https://media.discordapp.net/attachments/1258198097293611131/1534961238180626622/3.png?ex=6a76078d&is=6a74b60d&hm=5060584863f037151aada431ad3fba73ab18e43cf5ed3782182f5d9615b7de3d&=&format=webp&quality=lossless&width=2048&height=1024',
    accentColor: 0xFCD748 
  },
  ultra_dailies: { 
    label: 'Ultra Dailies', 
    max: 3, 
    points: 2, 
    roleIds: [ULTRA_HELPER_ROLE_ID],
    bannerUrl: 'https://media.discordapp.net/attachments/1258198097293611131/1534961237597753374/2.png?ex=6a76078d&is=6a74b60d&hm=647568baa92f754e4dc7e20d48763f641a55322a976cd0d8b678093beab79343&=&format=webp&quality=lossless&width=2048&height=1024',
    accentColor: 0xFBD12D 
  },
  server_ticket: { 
    label: 'Server Ticket / Support', 
    max: 2, 
    points: 0, 
    roleIds: [SUPPORT_ROLE_ID],
    bannerUrl: 'https://media.discordapp.net/attachments/1258198097293611131/1534961238772154518/4.png?ex=6a76078d&is=6a74b60d&hm=93e443b70e802d77bfe911218676839568cfa0a0361724e865be80233fdd415c&=&format=webp&quality=lossless&width=2048&height=1024',
    accentColor: 0xFBCC13 
  },
  boss_help: { 
    label: 'General Boss Help', 
    max: 6, 
    points: 2, 
    roleIds: [HELPER_ROLE_ID],
    bannerUrl: STANDARD_BANNER_URL,
    accentColor: 0x856A02 
  },
  spamming: { 
    label: 'Spamming', 
    max: 6, 
    points: 1, 
    roleIds: [HELPER_ROLE_ID],
    bannerUrl: 'https://media.discordapp.net/attachments/1258198097293611131/1534961239157899527/5.png?ex=6a76078d&is=6a74b60d&hm=b94b6cf605487010f0cd4f6f14a7e37603127fc8fdd6f333934947aab42f255f&=&format=webp&quality=lossless&width=2048&height=1024',
    accentColor: 0xEFBF04 
  }
};

// --- HELPER: TIME PARSER ---
function parseDuration(str) {
  if (!str) return null;
  const unit = str.slice(-1);
  const value = parseInt(str.slice(0, -1));
  if (isNaN(value)) return null;
  switch (unit) {
    case 's': return value * 1000;
    case 'm': return value * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    case 'd': return value * 24 * 60 * 60 * 1000;
    default: return null;
  }
}

// --- HELPER: UWU TRANSLATOR ---
function uwuify(text) {
  const faces = ['(・`ω´・)', ';;w;;', 'owo', 'UwU', '>w<', '^w^'];
  return text.replace(/(?:r|l)/g, 'w').replace(/(?:R|L)/g, 'W').replace(/n([aeiou])/g, 'ny$1').replace(/N([aeiou])/g, 'Ny$1').replace(/N([AEIOU])/g, 'Ny$1').replace(/ove/g, 'uv').replace(/!+/g, ' ' + faces[Math.floor(Math.random() * faces.length)] + ' ');
}

// --- TICKET HELPERS ---
async function sendTicketLog(guild, title, description, color = '#3498db', fields = []) {
  try {
    const cfg = guildSettings.get(guild.id) || {};
    const logChannelId = cfg.logChannelId;
    if (!logChannelId) return;
    const logChannel = guild.channels.cache.get(logChannelId);
    if (!logChannel) return;

    const logEmbed = new EmbedBuilder().setTitle(title).setDescription(description).addFields(fields).setColor(color).setTimestamp();
    await logChannel.send({ embeds: [logEmbed] });
  } catch (err) { console.error('Failed to send ticket log:', err); }
}

function isHelperInActiveTicket(userId) {
  for (const [channelId, ticket] of activeTickets.entries()) {
    if (ticket.helpers.some(h => h.id === userId)) return channelId;
  }
  return null;
}

function getPointsForTicket(ticketData) {
  const type = (ticketData.type || '').toLowerCase();
  const desc = (ticketData.description || '').toLowerCase();
  const items = desc ? desc.split(',').map(x => x.trim()).filter(x => x.length > 0) : [];
  const itemCount = items.length > 0 ? items.length : 1;

  if (type === 'ultra_weeklies') {
    let totalPts = 0;
    for (const item of items) {
      if (item.toLowerCase().includes('speaker')) totalPts += 5;
      else totalPts += 3;
    }
    return totalPts > 0 ? totalPts : 3 * itemCount;
  }
  if (type === 'ultra_dailies' || type === 'seven_man_dailies') return 2 * itemCount;
  if (ticketData.customPoints !== undefined && ticketData.customPoints >= 0) return ticketData.customPoints;
  if (type.includes('farm') || type.includes('farming')) return 3;
  return 1;
}

async function checkAndAssignHelperRoles(guild, userId, currentPoints) {
  try {
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return;
    for (const [requiredPts, roleId] of roleRewards.entries()) {
      if (currentPoints >= requiredPts && !member.roles.cache.has(roleId)) {
        await member.roles.add(roleId).catch(console.error);
      }
    }
  } catch (err) { console.error('Failed to assign helper auto-role:', err); }
}

function buildTicketHubPayload(options = {}) {
  const {
    imageUrl = STANDARD_BANNER_URL,
    guideTitle = "TICKET GUIDE",
    guideDesc = "Read through the ticket rules and guidelines before requesting assistance.",
    guideUrl = TICKET_GUIDE_URL,
    createTitle = "MAKE A TICKET",
    createDesc = "Select a category from the menu to open a new ticket. Our helpers will join shortly!"
  } = options;

  return {
    components: [{
      type: 17,
      accent_color: 0x8b0000,
      components: [
        { type: 12, items: [{ media: { url: imageUrl } }] },
        { type: 9, components: [{ type: 10, content: `**${guideTitle}**\n\n${guideDesc}` }], accessory: { type: 2, style: 5, url: guideUrl, label: 'Guide' } },
        { type: 9, components: [{ type: 10, content: `**${createTitle}**\n\n${createDesc}` }], accessory: { type: 2, style: 2, custom_id: 'btn_open_ticket_menu', label: 'Create' } }
      ]
    }],
    flags: MessageFlags.IsComponentsV2
  };
}

function buildTicketControlPayload(ticketData) {
  const maxLimit = ticketData.maxHelpers || 3;
  const categoryPreset = TICKET_PRESETS[ticketData.type] || {};
  const ticketBanner = categoryPreset.bannerUrl || STANDARD_BANNER_URL;
  const accentColor = categoryPreset.accentColor || 0x8b0000;
  const requesterTag = `<@${ticketData.requesterId}> (${ticketData.ign})`;
  const helpersFormatted = ticketData.helpers.length > 0 ? ticketData.helpers.map(h => `• <@${h.id}>`).join('\n') : '• None';
  const points = getPointsForTicket(ticketData);

  return {
    components: [{
      type: 17,
      accent_color: accentColor,
      components: [
        { type: 12, items: [{ media: { url: ticketBanner } }] },
        { type: 10, content: `<:pointsbt:1534950425080496189> **Points:**\n-# > **${points}**` },
        { type: 10, content: `<:requestbt:1534950441060798594> **Requester:** ${requesterTag}` },
        { type: 9, components: [{ type: 10, content: `Selected server:\n-# > **${ticketData.server}**` }], accessory: { type: 2, style: 2, custom_id: 'btn_change_server', label: 'Change server', emoji: { id: '1534950290908909749', name: 'changeserverbt', animated: false } } },
        { type: 9, components: [{ type: 10, content: `Monsters:\n-# > **${ticketData.description}**` }], accessory: { type: 2, style: 2, custom_id: 'btn_change_bosses', label: 'Change Monsters', emoji: { id: '1534950407003050185', name: 'monstersbt', animated: false } } },
        { type: 10, content: `Details:\n-# > **${ticketData.details || 'None provided'}**` },
        { type: 9, components: [{ type: 10, content: `Need more help? **Ping helpers!**` }], accessory: { type: 2, style: 2, custom_id: 'btn_pinghelpers', label: 'Ping helpers', emoji: { id: '1534950337167884368', name: 'pinghelpersbt', animated: false } } },
        { type: 10, content: `Done with the ticket?` },
        { type: 1, components: [
          { type: 2, style: 3, custom_id: 'btn_complete', label: 'Complete', emoji: { id: '1534950268679094397', name: 'completebt', animated: false } },
          { type: 2, style: 4, custom_id: 'btn_cancel', label: 'Cancel', emoji: { id: '1534950219517788170', name: 'cancelbt', animated: false } }
        ] },
        { type: 9, components: [{ type: 10, content: `<:helpersbt:1534950382109986876> **Helpers (${ticketData.helpers.length}/${maxLimit})**\n${helpersFormatted}` }], accessory: { type: 2, style: 4, custom_id: 'btn_kick_helper', label: 'Kick Helper' } },
        { type: 9, components: [{ type: 10, content: `Need the room information again? Click **Room details!**` }], accessory: { type: 2, style: 2, custom_id: 'btn_location', label: 'Room details', emoji: { id: '1534950471922483382', name: 'roomdeetsbt', animated: false } } },
        { type: 9, components: [{ type: 10, content: `Claim this ticket to view room details.` }], accessory: { type: 2, style: 3, custom_id: 'btn_claim', label: 'Claim', emoji: { id: '1534950248831516806', name: 'claimbt', animated: false } } }
      ]
    }],
    flags: MessageFlags.IsComponentsV2
  };
}

function buildSupportTicketControlPayload(ticketData) {
  const categoryPreset = TICKET_PRESETS.server_ticket;
  const ticketBanner = categoryPreset.bannerUrl || STANDARD_BANNER_URL;
  const accentColor = categoryPreset.accentColor || 0x2ecc71;
  const requesterTag = `<@${ticketData.requesterId}> (${ticketData.ign})`;

  return {
    components: [{
      type: 17,
      accent_color: accentColor,
      components: [
        { type: 12, items: [{ media: { url: ticketBanner } }] },
        { type: 10, content: `<:requestbt:1534950441060798594> **User:** ${requesterTag}\n\n**Subject / Concern:**\n-# > **${ticketData.subject}**` },
        { type: 10, content: `**Details / Report:**\n-# > **${ticketData.description}**` },
        { type: 9, components: [{ type: 10, content: `Need staff attention? **Ping staff!**` }], accessory: { type: 2, style: 2, custom_id: 'btn_pinghelpers', label: 'Ping staff', emoji: { id: '1534950337167884368', name: 'pinghelpersbt', animated: false } } },
        { type: 1, components: [
          { type: 2, style: 3, custom_id: 'btn_complete', label: 'Complete', emoji: { id: '1534950268679094397', name: 'completebt', animated: false } },
          { type: 2, style: 4, custom_id: 'btn_cancel', label: 'Cancel', emoji: { id: '1534950219517788170', name: 'cancelbt', animated: false } }
        ] }
      ]
    }],
    flags: MessageFlags.IsComponentsV2
  };
}

async function updateTicketEmbed(channel, ticketData) {
  try {
    const pinnedMessages = await channel.messages.fetchPinned();
    const panelMsg = pinnedMessages.first();
    if (!panelMsg) return;
    const payload = ticketData.type === 'server_ticket' ? buildSupportTicketControlPayload(ticketData) : buildTicketControlPayload(ticketData);
    await panelMsg.edit(payload);
  } catch (err) { console.error('Failed to update ticket embed:', err); }
}

// --- SLASH COMMAND DEFINITIONS ---
const commands = [
  { name: 'ping', description: 'Check bot latency' }, 
  {
    name: 'talk',
    description: 'Make the bot say something',
    options: [
      { name: 'message', description: 'What should I say?', type: 3, required: true },
      { name: 'channel', description: 'Where? (Optional)', type: 7, required: false }
    ],
    default_member_permissions: '8'
  },
  { name: 'me', description: 'Credits & Info' },
  {
    name: 'embed',
    description: 'Create a custom embedded message with V2 banner layout',
    options: [
      { name: 'title', description: 'Title of the embed', type: 3, required: true },
      { name: 'description', description: 'Main text', type: 3, required: true },
      { name: 'color', description: 'Hex Color (e.g. #8b0000)', type: 3, required: false },
      { name: 'image', description: 'Banner Image URL', type: 3, required: false },
      { name: 'channel', description: 'Where to send it?', type: 7, required: false }
    ],
    default_member_permissions: '8'
  },
  { name: 'mute', description: 'Mute user', options: [{ name: 'user', description: 'User', type: 6, required: true }, { name: 'duration', description: 'e.g. 10s, 5m', type: 3, required: false }], default_member_permissions: '8' },
  { name: 'unmute', description: 'Unmute user', options: [{ name: 'user', description: 'User', type: 6, required: true }], default_member_permissions: '8' },
  { name: 'ban', description: 'Ban user', options: [{ name: 'user', description: 'User', type: 6, required: true }, { name: 'reason', description: 'Reason', type: 3, required: false }], default_member_permissions: '8' },
  { name: 'kick', description: 'Kick user', options: [{ name: 'user', description: 'User', type: 6, required: true }, { name: 'reason', description: 'Reason', type: 3, required: false }], default_member_permissions: '8' },
  { name: 'purge', description: 'Delete messages', options: [{ name: 'amount', description: 'Amount', type: 4, required: true }], default_member_permissions: '8' },
  { name: 'lock', description: 'Lock channel', default_member_permissions: '8' },
  { name: 'unlock', description: 'Unlock channel', default_member_permissions: '8' },
  { name: 'deafen', description: 'Deafen user', options: [{ name: 'user', description: 'User', type: 6, required: true }], default_member_permissions: '8' },
  { name: 'undeafen', description: 'Undeafen user', options: [{ name: 'user', description: 'User', type: 6, required: true }], default_member_permissions: '8' },
  { name: 'setprefix', description: 'Change prefix', options: [{ name: 'new_prefix', description: 'Symbol', type: 3, required: true }], default_member_permissions: '8' },
  { name: 'uwulock', description: 'Force a user to speak UwU', options: [{ name: 'user', description: 'User to lock', type: 6, required: true }], default_member_permissions: '8' },
  { name: 'uwuunlock', description: 'Free a user from UwU', options: [{ name: 'user', description: 'User to unlock', type: 6, required: true }], default_member_permissions: '8' },
  { name: 'stick', description: 'Create a reminder', options: [{ name: 'message', description: 'Text', type: 3, required: true }], default_member_permissions: '8' },
  { name: 'unstick', description: 'Remove reminder', default_member_permissions: '8' },
  { name: 'afk', description: 'Set status to AFK', options: [{ name: 'reason', description: 'Reason', type: 3, required: false }] },
  { name: 'snipe', description: 'Show last deleted msg' },
  { name: 'help', description: 'Show commands' },
  { name: 'userinfo', description: 'Get user info', options: [{ name: 'user', description: 'User', type: 6, required: false }] },
  { name: 'avatar', description: 'Get avatar of a user', options: [{ name: 'user', description: 'Select user', type: 6, required: false }] },
  { 
    name: 'setupchannels', 
    description: 'Configure server system channels and welcome message', 
    options: [
      { name: 'welcome_channel', description: 'Welcome channel', type: 7, required: false },
      { name: 'welcome_message', description: 'Welcome outer message (use <@USER> for mention)', type: 3, required: false },
      { name: 'log_channel', description: 'Log channel', type: 7, required: false },
      { name: 'boost_channel', description: 'Boost channel', type: 7, required: false }
    ], 
    default_member_permissions: '8' 
  },
  { name: 'leave-setup', description: 'Setup leave message', options: [{ name: 'channel', description: 'Channel', type: 7, required: true }, { name: 'message', description: 'Message', type: 3, required: false }], default_member_permissions: '8' },
  { 
    name: 'setup-ticket-hub', 
    description: 'Post the unified ticket panel hub', 
    options: [
      { name: 'channel', description: 'Channel to post panel', type: 7, required: true },
      { name: 'banner_url', description: 'Header banner image URL', type: 3, required: false },
      { name: 'guide_title', description: 'Custom guide section title', type: 3, required: false },
      { name: 'guide_desc', description: 'Custom guide section description', type: 3, required: false },
      { name: 'create_title', description: 'Custom create ticket section title', type: 3, required: false },
      { name: 'create_desc', description: 'Custom create ticket section description', type: 3, required: false },
      { name: 'category', description: 'Ticket Channel Category', type: 7, channel_types: [4], required: false },
      { name: 'log_channel', description: 'Channel for Ticket Logs', type: 7, required: false }
    ], 
    default_member_permissions: '8' 
  },
  { 
    name: 'verify-setup', 
    description: 'Setup the Verification Panel with V2 Layout', 
    options: [
      { name: 'channel', description: 'Where to post the verify buttons', type: 7, required: true },
      { name: 'log_channel', description: 'Where verification logs will go', type: 7, required: true },
      { name: 'guest_role', description: 'Role given to verified Guests', type: 8, required: true },
      { name: 'member_role', description: 'Role given to verified Guild Members', type: 8, required: true },
      { name: 'banner_url', description: 'Banner Image URL', type: 3, required: false }
    ], 
    default_member_permissions: '8' 
  },
  { name: 'autoreact-setup', description: 'Auto-react setup', options: [{ name: 'emoji', description: 'Which emoji?', type: 3, required: true }, { name: 'role', description: 'Optional: Filter by this Role', type: 8, required: false }], default_member_permissions: '8' },
  { name: 'autorole-setup', description: 'Set auto role', options: [{ name: 'role', description: 'Role to give new members', type: 8, required: true }], default_member_permissions: '8' },
  { name: 'skullboard-setup', description: 'Skullboard setup', options: [{ name: 'channel', description: 'Where to log skulls', type: 7, required: true }], default_member_permissions: '8' },
  { name: 'boost-setup', description: 'Set boost announcement', options: [{ name: 'channel', description: 'Where to announce boosts', type: 7, required: true }, { name: 'message', description: 'Custom msg (Use {user})', type: 3, required: false }], default_member_permissions: '8' },
  { 
    name: 'reactionrole', 
    description: 'Create a panel with up to 5 role buttons', 
    options: [
      { name: 'title', description: 'Embed title', type: 3, required: true },
      { name: 'description', description: 'Embed main text', type: 3, required: true },
      { name: 'role1', description: 'First role', type: 8, required: true },
      { name: 'emoji1', description: 'Emoji for button 1', type: 3, required: false },
      { name: 'role2', description: 'Second role', type: 8, required: false },
      { name: 'emoji2', description: 'Emoji for button 2', type: 3, required: false },
      { name: 'role3', description: 'Third role', type: 8, required: false },
      { name: 'emoji3', description: 'Emoji for button 3', type: 3, required: false },
      { name: 'role4', description: 'Fourth role', type: 8, required: false },
      { name: 'emoji4', description: 'Emoji for button 4', type: 3, required: false },
      { name: 'role5', description: 'Fifth role', type: 8, required: false },
      { name: 'emoji5', description: 'Emoji for button 5', type: 3, required: false }
    ], 
    default_member_permissions: '8' 
  }
];

// --- STARTUP ---
client.once(Events.ClientReady, async () => {
  console.log(`Logged in as ${client.user.tag}`);
  
  // Set bot presence to online with activity
  client.user.setPresence({
    status: 'online',
    activities: [{ name: 'syntry send dih', type: ActivityType.Listening }]
  });

  const rest = new REST().setToken(client.token);
  try {
    if (GUILD_ID === 'PASTE_YOUR_SERVER_ID_HERE') {
      console.log('⚠️ ERROR: YOU FORGOT TO PASTE YOUR SERVER ID AT THE TOP!');
    } else {
      console.log('Clearing global commands...');
      await rest.put(Routes.applicationCommands(client.user.id), { body: [] });

      console.log('Registering commands to target server...');
      await rest.put(Routes.applicationGuildCommands(client.user.id, GUILD_ID), { body: commands });
      console.log('Commands successfully refreshed and registered.');
    }
  } catch (error) { console.error('Slash error:', error); }
});

// --- TRACK DELETED MESSAGES FOR SNIPE ---
client.on('messageDelete', message => {
  if (message.author?.bot) return;
  snipes.set(message.channel.id, {
    content: message.content,
    author: message.author,
    image: message.attachments.first() ? message.attachments.first().proxyURL : null
  });
});

// --- MEMBER WELCOME LISTENER ---
client.on(Events.GuildMemberAdd, async (member) => {
  try {
    const cfg = guildSettings.get(member.guild.id) || {};
    const welcomeChannelId = cfg.welcomeChannelId;
    if (!welcomeChannelId) return;

    const welcomeChannel = member.guild.channels.cache.get(welcomeChannelId);
    if (!welcomeChannel) return;

    let welcomeMsg = cfg.welcomeMessage || 'Welcome to the server, <@USER>!';
    const formattedMsg = welcomeMsg.replace(/<@USER>/g, `<@${member.id}>`);

    await welcomeChannel.send({ content: formattedMsg });
  } catch (err) { console.error('Failed to send welcome message:', err); }
});

// --- PREFIX HANDLER (!) ---
client.on('messageCreate', async message => {
  if (message.author.bot || !message.guild || message.guild.id !== GUILD_ID) return;

  if (uwuTargets.has(message.author.id)) {
    try {
      await message.delete();
      const uwuText = uwuify(message.content);
      const nickname = message.member ? message.member.displayName : message.author.username;
      await message.channel.send(`**${nickname}**: ${uwuText}`);
      return;
    } catch (e) {}
  }

  if (stickyMessages.has(message.channel.id)) {
    const stickyData = stickyMessages.get(message.channel.id);
    if (stickyData.lastMsgId) message.channel.messages.delete(stickyData.lastMsgId).catch(() => {});
    const sentSticky = await message.channel.send(`**reminder**\n${stickyData.content}`);
    stickyData.lastMsgId = sentSticky.id;
    stickyMessages.set(message.channel.id, stickyData);
  }

  if (message.mentions.users.size > 0) {
    message.mentions.users.forEach(user => {
      if (afkUsers.has(user.id)) message.reply(`**${user.username}** is AFK: ${afkUsers.get(user.id).reason}`);
    });
  }
  if (afkUsers.has(message.author.id)) {
    afkUsers.delete(message.author.id);
    message.reply(`Welcome back **${message.author.username}**! AFK status removed.`);
  }

  const config = guildSettings.get(message.guild.id);
  if (config && config.autoReactRoles && message.member) {
      message.member.roles.cache.forEach(role => {
          if (config.autoReactRoles.has(role.id)) {
              const emoji = config.autoReactRoles.get(role.id);
              const emojiId = emoji.match(/<a?:.+?:(\d+)>/) ? emoji.match(/<a?:.+?:(\d+)>/)[1] : emoji;
              message.react(emojiId).catch(() => {});
          }
      });
  }

  const serverPrefix = config?.prefix || defaultPrefix;
  if (!message.content.startsWith(serverPrefix)) return;

  const args = message.content.slice(serverPrefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  try {
    if (command === 'ping') return message.reply(`Pong! ${Math.round(client.ws.ping)}ms`);
    if (command === 'talk') {
        if(!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return message.reply("❌ You need Admin permissions.");
        message.delete().catch(()=>{});
        return message.channel.send(args.join(' ') || 'What should I say?');
    }
    if (command === 'ban') {
        if(!message.member.permissions.has(PermissionsBitField.Flags.BanMembers)) return message.reply("❌ You need Ban Members permission.");
        const target = message.mentions.members.first();
        if(!target || !target.bannable) return message.reply('❌ Cannot ban target.');
        await target.ban(); 
        message.reply(`Banned **${target.user.tag}**`);
    }
    if (command === 'kick') {
        if(!message.member.permissions.has(PermissionsBitField.Flags.KickMembers)) return message.reply("❌ You need Kick Members permission.");
        const target = message.mentions.members.first();
        if(!target || !target.kickable) return message.reply('❌ Cannot kick target.');
        await target.kick(); 
        message.reply(`Kicked **${target.user.tag}**`);
    }
    if (command === 'help') {
        const embed = new EmbedBuilder().setTitle('Bot Command Manual').setColor(0x00AAFF).setDescription(`**Prefix:** \`${serverPrefix}\`\nUse \`/\` for Slash Commands.`);
        message.reply({embeds:[embed]});
    }
    if (command === 'snipe') {
        const snipedMsg = snipes.get(message.channel.id);
        if (!snipedMsg) return message.reply('❌ Nothing to snipe!');
        const embed = new EmbedBuilder().setAuthor({ name: snipedMsg.author.tag, iconURL: snipedMsg.author.displayAvatarURL() }).setDescription(snipedMsg.content || '*(Attachment)*').setColor(0xFF0000);
        if(snipedMsg.image) embed.setImage(snipedMsg.image);
        message.reply({ embeds: [embed] });
    }
  } catch (e) { console.error('Prefix Error:', e); }
});

// --- INTERACTION HANDLER ---
client.on('interactionCreate', async interaction => {
  if (!interaction.guild || interaction.guild.id !== GUILD_ID) return;

  // BUTTON CLICK HANDLER
  if (interaction.isButton()) {
    if (interaction.customId.startsWith('rr_')) {
        const roleId = interaction.customId.split('_')[1];
        const role = interaction.guild.roles.cache.get(roleId);
        if (!role) return interaction.reply({ content: '❌ Target role no longer exists.', ephemeral: true });

        try {
          if (interaction.member.roles.cache.has(roleId)) {
              await interaction.member.roles.remove(roleId);
              return interaction.reply({ content: `Removed role: **${role.name}**`, ephemeral: true });
          } else {
              await interaction.member.roles.add(roleId);
              return interaction.reply({ content: `Added role: **${role.name}**`, ephemeral: true });
          }
        } catch (err) {
          return interaction.reply({ content: '❌ Failed to update role.', ephemeral: true });
        }
    }

    if (interaction.customId.startsWith('verify_type_')) {
        const verifyType = interaction.customId.replace('verify_type_', ''); // 'guest' or 'member'

        if (rejectionReasons.has(interaction.user.id)) {
            const previousReason = rejectionReasons.get(interaction.user.id);
            rejectionReasons.delete(interaction.user.id);
            const rejEmbed = new EmbedBuilder().setTitle('❌ Previous Verification Request Rejected').setColor(0xFF0000).setDescription(`Your previous request was rejected for: \n\n> **${previousReason}**`);
            await interaction.reply({ embeds: [rejEmbed], ephemeral: true });
        }

        const modal = new ModalBuilder().setCustomId(`aqw_verify_modal_${verifyType}`).setTitle(`AQW ${verifyType.toUpperCase()} Verification`);
        modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('aqw_name').setLabel('AQW Username').setStyle(TextInputStyle.Short).setPlaceholder('Enter your exact in-game character name').setRequired(true)));

        if (verifyType === 'guest') {
            modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('aqw_guild').setLabel('Guild Name').setStyle(TextInputStyle.Short).setPlaceholder('Enter your AQW Guild name (or None)').setRequired(true)));
        }

        modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('aqw_inviter').setLabel('Who invited you? (Optional)').setStyle(TextInputStyle.Short).setPlaceholder('Username of person who invited you').setRequired(false)));

        if (interaction.replied) return;
        return await interaction.showModal(modal);
    }

    if (interaction.customId.startsWith('v_approve_')) {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) return interaction.reply({ content: '❌ Only staff/admins can approve verification requests.', ephemeral: true });
        await interaction.deferReply({ ephemeral: true });

        const parts = interaction.customId.split('_');
        const userId = parts[2];
        const verifyType = parts[3]; 
        const ign = parts.slice(4).join('_'); 

        const config = guildSettings.get(interaction.guild.id) || {};
        const targetMember = await interaction.guild.members.fetch(userId).catch(() => null);

        if (targetMember) {
            const roleToGive = verifyType === 'guest' ? config.verifyGuestRoleId : config.verifyMemberRoleId;
            if (roleToGive) await targetMember.roles.add(roleToGive).catch(() => {});
            await targetMember.setNickname(ign).catch(() => {});
            rejectionReasons.delete(userId);
            await interaction.editReply(`✅ Approved ${verifyType.toUpperCase()} verification for ${targetMember.user.tag} (${ign})!`);
            
            const oldEmbed = interaction.message.embeds[0];
            const updatedEmbed = EmbedBuilder.from(oldEmbed).setColor(0x00FF00).setFooter({ text: `Approved by ${interaction.user.tag}` });
            const disabledRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('done_app').setLabel(`Approved by ${interaction.user.username}`).setStyle(ButtonStyle.Success).setDisabled(true));
            await interaction.message.edit({ embeds: [updatedEmbed], components: [disabledRow] });
        } else { interaction.editReply('❌ User is no longer in this server.'); }
        return;
    }

    if (interaction.customId.startsWith('v_reject_')) {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) return interaction.reply({ content: '❌ Only staff/admins can reject verification requests.', ephemeral: true });
        const userId = interaction.customId.split('_')[2];
        const messageId = interaction.message.id;

        const modal = new ModalBuilder().setCustomId(`v_reject_modal_${userId}_${messageId}`).setTitle('Reject Verification Request');
        modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reject_reason').setLabel('Reason for Rejection').setStyle(TextInputStyle.Paragraph).setPlaceholder('Enter reason...').setRequired(true)));
        return await interaction.showModal(modal);
    }

    // TICKET BUTTONS & CONTROLS
    if (interaction.customId === 'btn_open_ticket_menu') {
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('select_ticket_cat')
        .setPlaceholder('Select a ticket type...')
        .addOptions(Object.entries(TICKET_PRESETS).map(([key, item]) => new StringSelectMenuOptionBuilder().setLabel(item.label).setValue(key)));

      return await interaction.reply({ content: '🎫 **Select the ticket category you need assistance with:**', components: [new ActionRowBuilder().addComponents(selectMenu)], ephemeral: true });
    }

    if (interaction.customId === 'btn_change_server') {
      const ticketData = activeTickets.get(interaction.channel.id);
      if (!ticketData) return interaction.reply({ content: '❌ Ticket not found.', ephemeral: true });
      if (interaction.user.id !== ticketData.requesterId && !interaction.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) return interaction.reply({ content: '❌ Only the requester can change the server.', ephemeral: true });

      const serverDropdown = new StringSelectMenuBuilder().setCustomId('active_change_server_menu').setPlaceholder('Select new AQW server...').addOptions(AQW_SERVERS.map(srv => new StringSelectMenuOptionBuilder().setLabel(srv.label).setValue(srv.label).setEmoji(srv.emoji)));
      return await interaction.reply({ content: '🌐 **Select a new server from the dropdown below:**', components: [new ActionRowBuilder().addComponents(serverDropdown)], ephemeral: true });
    }

    if (interaction.customId === 'btn_change_bosses') {
      const ticketData = activeTickets.get(interaction.channel.id);
      if (!ticketData) return interaction.reply({ content: '❌ Ticket not found.', ephemeral: true });
      if (interaction.user.id !== ticketData.requesterId && !interaction.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) return interaction.reply({ content: '❌ Only the requester can edit monster details.', ephemeral: true });

      const modal = new ModalBuilder().setCustomId('modal_edit_bosses').setTitle('Change Monsters / Details').addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('new_details').setLabel('New Monsters or Details').setValue(ticketData.description).setStyle(TextInputStyle.Paragraph).setRequired(true)));
      return await interaction.showModal(modal);
    }

    if (interaction.customId === 'btn_location') {
      const ticketData = activeTickets.get(interaction.channel.id);
      if (!ticketData) return interaction.reply({ content: '❌ Ticket not found.', ephemeral: true });
      const isRequester = interaction.user.id === ticketData.requesterId;
      const isHelper = ticketData.helpers.some(h => h.id === interaction.user.id);
      const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.ManageChannels);

      if (!isRequester && !isHelper && !isAdmin) return interaction.reply({ content: '🔒 **Access Denied:** Click **Claim** first to view room details.', ephemeral: true });

      const codesEmbed = new EmbedBuilder().setTitle('📍 Room Details').setColor(0x3498db).addFields(
        { name: '👤 IGN', value: `\`${ticketData.ign}\``, inline: true },
        { name: '🖥️ Server', value: `\`${ticketData.server}\``, inline: true },
        { name: '📜 Command', value: `\`${ticketData.room}\``, inline: false },
        { name: '📝 Details', value: `\`${ticketData.details || 'None provided'}\``, inline: false }
      ).setTimestamp();
      return await interaction.reply({ embeds: [codesEmbed], ephemeral: true });
    }

    if (interaction.customId === 'btn_claim') {
      const ticketData = activeTickets.get(interaction.channel.id);
      if (!ticketData) return interaction.reply({ content: '❌ Ticket not found.', ephemeral: true });
      if (interaction.user.id === ticketData.requesterId) return interaction.reply({ content: '⚠️ You are the requester!', ephemeral: true });
      if (ticketData.helpers.some(h => h.id === interaction.user.id)) return interaction.reply({ content: '⚠️ Already claimed!', ephemeral: true });

      const activeChannelId = isHelperInActiveTicket(interaction.user.id);
      if (activeChannelId) return interaction.reply({ content: `⚠️ Already in active ticket (<#${activeChannelId}>)!`, ephemeral: true });

      const maxAllowed = ticketData.maxHelpers || 3;
      if (ticketData.helpers.length >= maxAllowed) return interaction.reply({ content: `⚠️ Helper spots full!`, ephemeral: true });

      ticketData.helpers.push({ id: interaction.user.id });
      activeTickets.set(interaction.channel.id, ticketData);

      await interaction.channel.send({ content: `🟢 ${interaction.user} **claimed ticket (${ticketData.helpers.length}/${maxAllowed})**` });
      await sendTicketLog(interaction.guild, '🤝 Ticket Claimed', `**Helper:** ${interaction.user}\n**Ticket:** ${interaction.channel}`, '#3498db');
      await interaction.reply({ content: `✅ **Claimed!** Server: \`${ticketData.server}\` | Room: \`${ticketData.room}\``, ephemeral: true });
      return updateTicketEmbed(interaction.channel, ticketData);
    }

    if (interaction.customId === 'btn_kick_helper') {
      const ticketData = activeTickets.get(interaction.channel.id);
      if (!ticketData) return interaction.reply({ content: '❌ Ticket not found.', ephemeral: true });
      const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.ManageChannels);
      const isRequester = interaction.user.id === ticketData.requesterId;
      if (!isAdmin && !isRequester) return interaction.reply({ content: '❌ Only requester or staff can kick helpers.', ephemeral: true });
      if (!ticketData.helpers || ticketData.helpers.length === 0) return interaction.reply({ content: '⚠️ No helpers in this ticket.', ephemeral: true });

      const helperMenu = new StringSelectMenuBuilder().setCustomId('active_kick_helper_menu').setPlaceholder('Select helper to remove...').addOptions(ticketData.helpers.map(h => new StringSelectMenuOptionBuilder().setLabel(`Helper ID: ${h.id}`).setValue(h.id)));
      return await interaction.reply({ content: '🔨 **Select helper to remove:**', components: [new ActionRowBuilder().addComponents(helperMenu)], ephemeral: true });
    }

    if (interaction.customId === 'btn_pinghelpers') {
      const ticketData = activeTickets.get(interaction.channel.id);
      const pingRoleIds = ticketData?.pingRoleIds || [SUPPORT_ROLE_ID];
      const validRoleIds = pingRoleIds.filter(id => id && /^\d+$/.test(id));
      const helperRolePings = validRoleIds.length > 0 ? validRoleIds.map(id => `<@&${id}>`).join(' ') : '@Staff';
      return interaction.reply({ content: `🔔 ${helperRolePings} assistance requested!`, allowedMentions: { roles: validRoleIds } });
    }

    if (interaction.customId === 'btn_cancel') {
      const ticketData = activeTickets.get(interaction.channel.id);
      if (ticketData && interaction.user.id !== ticketData.requesterId && !interaction.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) return interaction.reply({ content: '❌ Only requester or staff can cancel.', ephemeral: true });
      await interaction.reply('🎟️ Ticket Canceled. Deleting channel in 3 seconds...');
      activeTickets.delete(interaction.channel.id);
      setTimeout(() => interaction.channel.delete().catch(() => {}), 3000);
      return;
    }

    if (interaction.customId === 'btn_complete') {
      const ticketData = activeTickets.get(interaction.channel.id);
      if (ticketData && interaction.user.id !== ticketData.requesterId && !interaction.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) return interaction.reply({ content: '❌ Only requester or staff can complete.', ephemeral: true });
      await interaction.deferReply();

      try {
        await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: false }).catch(() => {});
        let pointsToAward = 0;
        if (ticketData && ticketData.helpers.length > 0 && ticketData.type !== 'server_ticket') {
          pointsToAward = getPointsForTicket(ticketData);
          for (const hObj of ticketData.helpers) {
            const current = helperPoints.get(hObj.id) || 0;
            const updated = current + pointsToAward;
            helperPoints.set(hObj.id, updated);
            checkAndAssignHelperRoles(interaction.guild, hObj.id, updated).catch(console.error);
          }
          globalStats.totalTicketsCompleted += 1;
          globalStats.totalPointsGiven += pointsToAward;
        }

        const completionEmbed = new EmbedBuilder().setTitle('🔒 Ticket Completed').setDescription(`Resolved successfully! +\`${pointsToAward} pts\` awarded.\n\n*Deleting channel in 5 seconds...*`).setColor(0x2ecc71);
        await interaction.editReply({ embeds: [completionEmbed] });
        activeTickets.delete(interaction.channel.id);
        setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
      } catch (err) { await interaction.editReply({ content: '❌ Failed to complete ticket.' }); }
      return;
    }

    return;
  }

  // SELECT MENUS
  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === 'select_ticket_cat') {
      const selectedKey = interaction.values[0];
      const preset = TICKET_PRESETS[selectedKey] || { label: 'Ticket', max: 6, points: 1 };

      if (selectedKey === 'ultra_weeklies') {
        const menu = new StringSelectMenuBuilder().setCustomId('select_bosses_ultra_weeklies').setPlaceholder('Select Ultra Weeklies bosses...').setMinValues(1).setMaxValues(6).addOptions(
          new StringSelectMenuOptionBuilder().setLabel('Champion Drakath').setValue('Champion Drakath'),
          new StringSelectMenuOptionBuilder().setLabel('Ultra Dage').setValue('Ultra Dage'),
          new StringSelectMenuOptionBuilder().setLabel('Ultra Darkon').setValue('Ultra Darkon'),
          new StringSelectMenuOptionBuilder().setLabel('Ultra Drago').setValue('Ultra Drago'),
          new StringSelectMenuOptionBuilder().setLabel('Ultra Gramiel').setValue('Ultra Gramiel'),
          new StringSelectMenuOptionBuilder().setLabel('Ultra Speaker').setValue('Ultra Speaker')
        );
        return await interaction.update({ content: '⚔️ **Select all Ultra Weeklies bosses:**', components: [new ActionRowBuilder().addComponents(menu)] });
      }

      if (selectedKey === 'server_ticket') {
        tempTicketCache.set(interaction.user.id, { categoryKey: 'server_ticket', server: 'N/A', bosses: '' });
        const modal = new ModalBuilder().setCustomId('ticket_form_final_2_0_server_ticket').setTitle('Ticket: Support');
        modal.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('ign').setLabel('Username / IGN').setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('subject').setLabel('Subject / Concern').setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('description').setLabel('Details / Report').setStyle(TextInputStyle.Paragraph).setRequired(true))
        );
        return await interaction.showModal(modal);
      }

      const serverMenu = new StringSelectMenuBuilder().setCustomId(`select_server_form_${selectedKey}`).setPlaceholder('Select your AQW server...').addOptions(AQW_SERVERS.map(srv => new StringSelectMenuOptionBuilder().setLabel(srv.label).setValue(srv.label).setEmoji(srv.emoji)));
      return await interaction.update({ content: `🌐 **Select your server for ${preset.label}:**`, components: [new ActionRowBuilder().addComponents(serverMenu)] });
    }

    if (interaction.customId.startsWith('select_bosses_')) {
      const categoryKey = interaction.customId.replace('select_bosses_', '');
      tempTicketCache.set(interaction.user.id, { categoryKey, bosses: interaction.values.join(', ') });
      const serverMenu = new StringSelectMenuBuilder().setCustomId('select_server_form_boss').setPlaceholder('Select your AQW server...').addOptions(AQW_SERVERS.map(srv => new StringSelectMenuOptionBuilder().setLabel(srv.label).setValue(srv.label).setEmoji(srv.emoji)));
      return await interaction.update({ content: '🌐 **Select your AQW server:**', components: [new ActionRowBuilder().addComponents(serverMenu)] });
    }

    if (interaction.customId.startsWith('select_server_form_')) {
      const selectedServer = interaction.values[0];
      let categoryKey, bossVal = '';
      if (interaction.customId === 'select_server_form_boss') {
        const cached = tempTicketCache.get(interaction.user.id) || {};
        categoryKey = cached.categoryKey;
        bossVal = cached.bosses;
      } else {
        categoryKey = interaction.customId.replace('select_server_form_', '');
      }
      const preset = TICKET_PRESETS[categoryKey] || { max: 6, points: 1, label: 'Ticket' };
      tempTicketCache.set(interaction.user.id, { categoryKey, server: selectedServer, bosses: bossVal });

      const modal = new ModalBuilder().setCustomId(`ticket_form_final_${preset.max}_${preset.points}_${categoryKey}`).setTitle(`Ticket: ${preset.label}`);
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('ign').setLabel('Username / IGN').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('map_name').setLabel('Map Name / Room').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('details').setLabel('Details (Optional)').setStyle(TextInputStyle.Paragraph).setRequired(false))
      );
      if (!bossVal) {
        modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('description').setLabel('Monsters / Details').setStyle(TextInputStyle.Paragraph).setRequired(true)));
      }
      return await interaction.showModal(modal);
    }

    if (interaction.customId === 'active_change_server_menu') {
      await interaction.deferUpdate();
      const ticketData = activeTickets.get(interaction.channel.id);
      if (!ticketData) return;
      ticketData.server = interaction.values[0];
      activeTickets.set(interaction.channel.id, ticketData);
      await interaction.editReply({ content: `✅ Updated server to **${ticketData.server}**!`, components: [] });
      return updateTicketEmbed(interaction.channel, ticketData);
    }

    if (interaction.customId === 'active_kick_helper_menu') {
      await interaction.deferUpdate();
      const ticketData = activeTickets.get(interaction.channel.id);
      if (!ticketData) return;
      const helperIdToRemove = interaction.values[0];
      ticketData.helpers = ticketData.helpers.filter(h => h.id !== helperIdToRemove);
      activeTickets.set(interaction.channel.id, ticketData);
      await interaction.editReply({ content: `✅ Removed <@${helperIdToRemove}> from ticket.`, components: [] });
      await interaction.channel.send({ content: `🔴 <@${helperIdToRemove}> has been removed from this ticket by ${interaction.user}.` });
      return updateTicketEmbed(interaction.channel, ticketData);
    }
  }

  // MODAL SUBMISSIONS
  if (interaction.isModalSubmit()) {
    if (interaction.customId.startsWith('verify_modal_')) {
        await interaction.deferReply({ ephemeral: true });
        const parts = interaction.customId.split('_');
        const channelId = parts[2], logChannelId = parts[3], guestRoleId = parts[4], memberRoleId = parts[5];
        const bannerUrl = parts.slice(6).join('_');
        const title = interaction.fields.getTextInputValue('verify_title');
        const desc = interaction.fields.getTextInputValue('verify_desc');
        const channel = interaction.guild.channels.cache.get(channelId);

        const cfg = guildSettings.get(interaction.guildId) || {};
        cfg.verifyLogChannelId = logChannelId;
        cfg.verifyGuestRoleId = guestRoleId;
        cfg.verifyMemberRoleId = memberRoleId;
        guildSettings.set(interaction.guildId, cfg);

        const verifyPayload = {
          components: [{
            type: 17,
            accent_color: 0x8b0000,
            components: [
              { type: 12, items: [{ media: { url: bannerUrl || STANDARD_BANNER_URL } }] },
              { type: 9, components: [{ type: 10, content: `**${title}**\n\n${desc}` }], accessory: { type: 2, style: 3, custom_id: 'verify_type_member', label: 'Verify' } },
              { type: 9, components: [{ type: 10, content: `**Join Sindria**\n\nCome hang out with us in game, participate in guild-only events and screenshots. Click 'Join Sindria' to get started!` }], accessory: { type: 2, style: 1, custom_id: 'verify_type_guest', label: 'Join Sindria' } }
            ]
          }],
          flags: MessageFlags.IsComponentsV2
        };

        if (channel) {
            await channel.send(verifyPayload);
            interaction.editReply(`Verification panel successfully posted to ${channel}!`);
        } else { interaction.editReply('❌ Could not find target channel.'); }
        return;
    }

    if (interaction.customId.startsWith('aqw_verify_modal_')) {
        await interaction.deferReply({ ephemeral: true });
        const verifyType = interaction.customId.replace('aqw_verify_modal_', '');
        const ign = interaction.fields.getTextInputValue('aqw_name').trim();
        let guildInput = verifyType === 'guest' ? (interaction.fields.getTextInputValue('aqw_guild')?.trim() || 'None') : 'Sindria';
        const inviterInput = interaction.fields.getTextInputValue('aqw_inviter')?.trim() || '';
        const config = guildSettings.get(interaction.guild.id) || {};
        
        try { await interaction.member.setNickname(ign); } catch (e) {}

        const roleId = verifyType === 'guest' ? config.verifyGuestRoleId : config.verifyMemberRoleId;
        const logRoleText = roleId ? `<@&${roleId}>` : '@unknown-role';

        const logEmbed = new EmbedBuilder()
            .setTitle(`📋 New ${verifyType.toUpperCase()} Verification Request`)
            .setColor(verifyType === 'guest' ? 0x3498DB : 0xFFA500)
            .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
            .addFields(
                { name: 'User', value: `${interaction.user}`, inline: true },
                { name: 'AQW Username', value: `[${ign}](https://account.aq.com/CharPage?id=${encodeURIComponent(ign)})`, inline: true },
                { name: 'Verification Type', value: verifyType.toUpperCase(), inline: true },
                { name: 'Guild', value: guildInput, inline: true },
                { name: 'Role To Give', value: logRoleText, inline: true },
                { name: 'Invited By', value: inviterInput || 'None', inline: true }
            ).setTimestamp();

        const adminActionRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`v_approve_${interaction.user.id}_${verifyType}_${ign}`).setLabel('Approve Verification').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`v_reject_${interaction.user.id}`).setLabel('Reject').setStyle(ButtonStyle.Danger)
        );

        if (config.verifyLogChannelId) {
            const logCh = interaction.guild.channels.cache.get(config.verifyLogChannelId);
            if (logCh) await logCh.send({ embeds: [logEmbed], components: [adminActionRow] });
        }
        return interaction.editReply(`✅ Verification request submitted as **${verifyType.toUpperCase()}** for **${ign}**!`);
    }

    if (interaction.customId.startsWith('v_reject_modal_')) {
        await interaction.deferReply({ ephemeral: true });
        const parts = interaction.customId.split('_');
        const userId = parts[3], logMsgId = parts[4];
        const reason = interaction.fields.getTextInputValue('reject_reason');
        const targetMember = await interaction.guild.members.fetch(userId).catch(() => null);

        if (targetMember) {
            await targetMember.setNickname(null).catch(() => {});
            rejectionReasons.set(userId, reason);
        }

        try {
            const logMessage = await interaction.channel.messages.fetch(logMsgId).catch(() => null);
            if (logMessage) {
                const updatedEmbed = EmbedBuilder.from(logMessage.embeds[0]).setColor(0xFF0000).addFields({ name: 'Rejection Reason', value: reason }).setFooter({ text: `Rejected by ${interaction.user.tag}` });
                const disabledRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('done_rej').setLabel(`Rejected by ${interaction.user.username}`).setStyle(ButtonStyle.Danger).setDisabled(true));
                await logMessage.edit({ embeds: [updatedEmbed], components: [disabledRow] });
            }
        } catch (e) {}
        return interaction.editReply('❌ Verification rejected.');
    }

    if (interaction.customId === 'modal_edit_bosses') {
      const ticketData = activeTickets.get(interaction.channel.id);
      if (!ticketData) return interaction.reply({ content: '❌ Ticket not found.', ephemeral: true });
      ticketData.description = interaction.fields.getTextInputValue('new_details');
      activeTickets.set(interaction.channel.id, ticketData);
      await interaction.reply({ content: `✅ Updated monster details!`, ephemeral: true });
      return updateTicketEmbed(interaction.channel, ticketData);
    }

    if (interaction.customId.startsWith('ticket_form_final_')) {
      await interaction.deferReply({ ephemeral: true });
      try {
        const parts = interaction.customId.replace('ticket_form_final_', '').split('_');
        const maxHelpers = parseInt(parts[0]) || 3;
        const customPoints = parseInt(parts[1]) || 0;
        const ticketType = parts.slice(2).join('_');
        const cached = tempTicketCache.get(interaction.user.id) || {};
        const serverName = cached.server || 'Artix';
        let description = cached.bosses || '';
        const preset = TICKET_PRESETS[ticketType] || {};
        const pingRoleIds = preset.roleIds || [HELPER_ROLE_ID];

        const ign = interaction.fields.getTextInputValue('ign');
        const ticketDetails = ticketType === 'server_ticket' ? interaction.fields.getTextInputValue('description') : (interaction.fields.getTextInputValue('details') || 'None provided');
        if (!description) {
          try { description = interaction.fields.getTextInputValue('description'); } catch { description = 'General Assistance'; }
        }

        let room = 'N/A', subject = 'N/A';
        if (ticketType === 'server_ticket') subject = interaction.fields.getTextInputValue('subject');
        else {
          const rawMap = interaction.fields.getTextInputValue('map_name').trim();
          room = `/join ${rawMap.toLowerCase().replace(/[^a-z0-9]/g, '') || 'room'}`;
        }

        const cfg = guildSettings.get(interaction.guild.id) || {};
        ticketCounter += 1;
        const chName = `ticket-${String(ticketCounter).padStart(4, '0')}`;
        const isServerTicket = ticketType === 'server_ticket';

        let permissionOverwrites = [
          { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageChannels, PermissionsBitField.Flags.ManageMessages] },
          { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
        ];

        if (isServerTicket) permissionOverwrites.push({ id: interaction.guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] });
        else permissionOverwrites.push({ id: interaction.guild.roles.everyone, allow: [PermissionsBitField.Flags.ViewChannel] });

        const ticketChannel = await interaction.guild.channels.create({
          name: chName,
          type: ChannelType.GuildText,
          parent: cfg.ticketCategory || null,
          permissionOverwrites
        });

        const newTicketData = {
          requesterId: interaction.user.id,
          type: ticketType,
          ign,
          server: serverName,
          room,
          subject,
          description,
          details: ticketDetails,
          maxHelpers,
          customPoints,
          pingRoleIds,
          helpers: []
        };

        activeTickets.set(ticketChannel.id, newTicketData);
        tempTicketCache.delete(interaction.user.id);

        const validRoleIds = pingRoleIds.filter(id => id && /^\d+$/.test(id));
        const helperRolePings = validRoleIds.length > 0 ? validRoleIds.map(id => `<@&${id}>`).join(' ') : '@Staff';
        
        await ticketChannel.send({ content: `${helperRolePings} assistance requested!`, allowedMentions: { roles: validRoleIds } });

        const payload = isServerTicket ? buildSupportTicketControlPayload(newTicketData) : buildTicketControlPayload(newTicketData);
        const mainMsg = await ticketChannel.send({ components: payload.components, flags: payload.flags });
        await mainMsg.pin().catch(() => {});

        await sendTicketLog(interaction.guild, '📩 Ticket Created', `**Category:** \`${ticketType}\`\n**User:** ${interaction.user}\n**Channel:** ${ticketChannel}`, '#3498db');
        return await interaction.editReply(`✅ Ticket created: ${ticketChannel}`);
      } catch (err) {
        console.error('Failed to create ticket channel:', err);
        return await interaction.editReply(`❌ Failed to create ticket channel: ${err.message}`);
      }
    }
  }

  if (!interaction.isChatInputCommand()) return;

  // --- SLASH COMMAND HANDLERS ---
  try {
    const { commandName, options } = interaction;

    if (commandName === 'setup-ticket-hub') {
        await interaction.deferReply({ ephemeral: true });
        const channel = options.getChannel('channel');
        const customBanner = options.getString('banner_url');
        const guideTitle = options.getString('guide_title');
        const guideDesc = options.getString('guide_desc');
        const createTitle = options.getString('create_title');
        const createDesc = options.getString('create_desc');
        const category = options.getChannel('category');
        const logChannel = options.getChannel('log_channel');

        const cfg = guildSettings.get(interaction.guild.id) || {};
        if (category) cfg.ticketCategory = category.id;
        if (logChannel) cfg.logChannelId = logChannel.id;
        guildSettings.set(interaction.guild.id, cfg);

        const payload = buildTicketHubPayload({
          imageUrl: customBanner || STANDARD_BANNER_URL,
          guideTitle: guideTitle || undefined,
          guideDesc: guideDesc || undefined,
          createTitle: createTitle || undefined,
          createDesc: createDesc || undefined
        });

        await channel.send({ components: payload.components, flags: payload.flags });
        return await interaction.editReply(`✅ Ticket Hub Panel successfully posted to ${channel}!`);
    }

    if (commandName === 'verify-setup') {
        const channel = options.getChannel('channel');
        const logChannel = options.getChannel('log_channel');
        const guestRole = options.getRole('guest_role');
        const memberRole = options.getRole('member_role');
        const bannerUrl = options.getString('banner_url') || STANDARD_BANNER_URL;

        const modal = new ModalBuilder()
            .setCustomId(`verify_modal_${channel.id}_${logChannel.id}_${guestRole.id}_${memberRole.id}_${encodeURIComponent(bannerUrl)}`)
            .setTitle('Verification Panel Setup');

        modal.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('verify_title').setLabel('Panel Title').setStyle(TextInputStyle.Short).setValue('Get access to the discord').setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('verify_desc').setLabel('Description').setStyle(TextInputStyle.Paragraph).setValue('Verify by entering your AQW username, and get access to the rest of the discord. Click \'Verify\' to get started!').setRequired(true))
        );
        return await interaction.showModal(modal);
    }

    if (commandName === 'purge') {
        await interaction.deferReply({ ephemeral: true }); 
        const amt = options.getInteger('amount');
        if (amt > 100) return interaction.editReply('❌ Max 100.');
        await interaction.channel.bulkDelete(amt, true).catch(() => interaction.editReply("❌ Error deleting."));
        return interaction.editReply(`Deleted ${amt} messages.`);
    }

    await interaction.deferReply({ ephemeral: false });

    if (commandName === 'ping') interaction.editReply(`Pong! ${Math.round(client.ws.ping)}ms`);
    else if (commandName === 'talk') {
        await (options.getChannel('channel')||interaction.channel).send(options.getString('message'));
        interaction.editReply('Sent.');
    }
    else if (commandName === 'me') interaction.editReply('This bot was made out of boredom by **Adlaw**.');
    else if (commandName === 'setprefix') {
        const newPrefix = options.getString('new_prefix');
        const cfg = guildSettings.get(interaction.guildId) || {};
        cfg.prefix = newPrefix;
        guildSettings.set(interaction.guildId, cfg);
        interaction.editReply(`Prefix changed to: \`${newPrefix}\``);
    }
    else if (commandName === 'embed') {
        const title = options.getString('title');
        const description = options.getString('description');
        const color = options.getString('color') || '#8b0000';
        const image = options.getString('image');
        const targetChannel = options.getChannel('channel') || interaction.channel;

        const containerComponent = {
          type: 17,
          accent_color: parseInt(color.replace('#', ''), 16) || 0x8b0000,
          components: [
            { type: 12, items: [{ media: { url: image || STANDARD_BANNER_URL } }] },
            { type: 9, components: [{ type: 10, content: `**${title}**\n\n${description.replace(/\\n/g, '\n')}` }] }
          ]
        };

        await targetChannel.send({ components: [containerComponent], flags: MessageFlags.IsComponentsV2 });
        interaction.editReply({ content: 'Embed sent!', ephemeral: true });
    }
    else if (commandName === 'ban') {
        const user = options.getMember('user');
        if(!user.bannable) return interaction.editReply('❌ Cannot ban.');
        await user.ban({ reason: options.getString('reason') });
        interaction.editReply(`Banned **${user.user.tag}**`);
    }
    else if (commandName === 'kick') {
        const user = options.getMember('user');
        if(!user.kickable) return interaction.editReply('❌ Cannot kick.');
        await user.kick(options.getString('reason'));
        interaction.editReply(`Kicked **${user.user.tag}**`);
    }
    else if (commandName === 'userinfo') {
        const user = options.getMember('user') || interaction.member;
        const embed = new EmbedBuilder().setTitle(`User: ${user.user.tag}`).addFields({name:'Joined', value:`<t:${Math.floor(user.joinedTimestamp/1000)}:R>`}).setColor(0x00AAFF);
        interaction.editReply({embeds:[embed]});
    }
    else if (commandName === 'avatar') {
        const targetUser = options.getUser('user') || interaction.user;
        const embed = new EmbedBuilder().setTitle(`Avatar for ${targetUser.username}`).setImage(targetUser.displayAvatarURL({ dynamic: true, size: 1024 })).setColor(0x00AAFF);
        interaction.editReply({ embeds: [embed] });
    }
    else if (commandName === 'help') {
        const embed = new EmbedBuilder().setTitle('Bot Command Manual').setColor(0x00AAFF).setDescription(`**Prefix:** \`${defaultPrefix}\``)
            .addFields(
                { name: 'Admin / Mod', value: '`ban`, `kick`, `mute`, `unmute`, `lock`, `unlock`, `purge`' },
                { name: 'Public / Fun', value: '`ping`, `afk`, `snipe`, `userinfo`, `avatar`, `me`, `help`' },
                { name: 'Setup', value: '`/setup-ticket-hub`, `/verify-setup`, `/setupchannels`' }
            );
        interaction.editReply({embeds:[embed]});
    }
    else if (commandName === 'setupchannels') {
        const welcomeCh = options.getChannel('welcome_channel');
        const welcomeMsg = options.getString('welcome_message');
        const logCh = options.getChannel('log_channel');
        const boostCh = options.getChannel('boost_channel');

        const cfg = guildSettings.get(interaction.guildId) || {};
        if (welcomeCh) cfg.welcomeChannelId = welcomeCh.id;
        if (welcomeMsg) cfg.welcomeMessage = welcomeMsg;
        if (logCh) cfg.logChannelId = logCh.id;
        if (boostCh) cfg.boostChannelId = boostCh.id;
        guildSettings.set(interaction.guildId, cfg);

        interaction.editReply(`✅ Channels & welcome message setup updated successfully!`);
    }
    else if (commandName === 'mute') {
        const user = options.getMember('user');
        const dStr = options.getString('duration');
        const role = interaction.guild.roles.cache.find(r=>r.name==='Muted');
        if(!role) return interaction.editReply('❌ "Muted" role missing.');
        await user.roles.add(role);
        interaction.editReply(`Muted **${user.user.tag}**`);
        const ms = parseDuration(dStr);
        if(ms) setTimeout(()=> user.roles.remove(role).catch(()=>{}), ms);
    }
    else if (commandName === 'unmute') {
        const user = options.getMember('user');
        const role = interaction.guild.roles.cache.find(r=>r.name==='Muted');
        await user.roles.remove(role);
        interaction.editReply('Unmuted.');
    }
    else if (commandName === 'lock') {
        await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: false });
        interaction.editReply('Locked.');
    }
    else if (commandName === 'unlock') {
        await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: null });
        interaction.editReply('Unlocked.');
    }
  } catch (err) { interaction.editReply('❌ Error: ' + err.message).catch(()=>{}); }
});

// --- CRASH PREVENTION ---
process.on('unhandledRejection', (reason, p) => console.log('Anti-Crash: ', reason));
process.on('uncaughtException', (err, origin) => console.log('Anti-Crash: ', err));

// --- LOGIN ---
console.log('Starting bot, trying to login...');
client.login(process.env.DISCORD_TOKEN);

http.createServer((req, res) => {
  res.write("Bot is alive!");
  res.end();
}).listen(process.env.PORT || 3000);
