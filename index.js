const {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionsBitField,
  REST,
  Routes,
  SlashCommandBuilder,
  ChannelType,
  MessageFlags,
  ActivityType
} = require('discord.js');
const http = require('http');

// --- ⚠️ CONFIGURATION ⚠️ ---
const GUILD_ID = '1371775026264670228'; // Server ID
const ULTRA_HELPER_ROLE_ID = '1529499021884919858'; // Ultra Helper Role ID
const HELPER_ROLE_ID = '1529499059596038285'; // Standard Helper / Farming Role ID
const SUPPORT_ROLE_ID = '1529498802149392614'; // Support Role ID

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
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel, Partials.Message]
});

// --- IN-MEMORY DATA STORES ---
const activeTickets = new Map();
const helperPoints = new Map();
const userRequestCounts = new Map();
const guildSettings = new Map();
const roleRewards = new Map();
const tempTicketCache = new Map();
const pendingVerifications = new Map();
const userRejectionReasons = new Map();
const activeGiveaways = new Map();
const snipeCache = new Map();

let ticketCounter = 0;

const globalStats = {
  totalTicketsCompleted: 0,
  totalPointsGiven: 0,
  totalBossesSlain: 0
};

// --- SNIPE EVENT LISTENER ---
client.on(Events.MessageDelete, (message) => {
  if (!message.guild || message.guild.id !== GUILD_ID || message.author?.bot) return;
  snipeCache.set(message.channel.id, {
    content: message.content || '[No text content / Embed / Image]',
    author: message.author,
    image: message.attachments.first()?.proxyURL || null,
    createdAt: message.createdAt
  });
});

// --- TICKET PRESETS ---
const TICKET_PRESETS = {
  farming: { 
    label: 'Farming Assistance', 
    max: 6, 
    points: 3, 
    pingRoleIds: [HELPER_ROLE_ID],
    bannerUrl: 'https://media.discordapp.net/attachments/1258198097293611131/1534961239598432368/6.png?ex=6a76078d&is=6a74b60d&hm=8f0ef43ee15c9a77eb4db7a93f72a13ed220524e73fa9bd105894b9e47e40208&=&format=webp&quality=lossless&width=2048&height=1024',
    accentColor: 0xFDE37C 
  },
  ultra_weeklies: { 
    label: 'Ultra Weeklies', 
    max: 3, 
    points: 3, 
    pingRoleIds: [ULTRA_HELPER_ROLE_ID],
    bannerUrl: 'https://media.discordapp.net/attachments/1258198097293611131/1534961237132050705/1.png?ex=6a76078d&is=6a74b60d&hm=c653e9de44bf6517cf997847ec6dbc9987387aed4dea2ea0823059f54f83a956&=&format=webp&quality=lossless&width=2048&height=1024',
    accentColor: 0xFCDD62 
  },
  seven_man_dailies: { 
    label: '7-Man Dailies', 
    max: 6, 
    points: 2, 
    pingRoleIds: [ULTRA_HELPER_ROLE_ID, HELPER_ROLE_ID],
    bannerUrl: 'https://media.discordapp.net/attachments/1258198097293611131/1534961238180626622/3.png?ex=6a76078d&is=6a74b60d&hm=5060584863f037151aada431ad3fba73ab18e43cf5ed3782182f5d9615b7de3d&=&format=webp&quality=lossless&width=2048&height=1024',
    accentColor: 0xFCD748 
  },
  ultra_dailies: { 
    label: 'Ultra Dailies', 
    max: 3, 
    points: 2, 
    pingRoleIds: [ULTRA_HELPER_ROLE_ID],
    bannerUrl: 'https://media.discordapp.net/attachments/1258198097293611131/1534961237597753374/2.png?ex=6a76078d&is=6a74b60d&hm=647568baa92f754e4dc7e20d48763f641a55322a976cd0d8b678093beab79343&=&format=webp&quality=lossless&width=2048&height=1024',
    accentColor: 0xFBD12D 
  },
  server_ticket: { 
    label: 'Server Ticket / Support', 
    max: 2, 
    points: 0, 
    pingRoleIds: [SUPPORT_ROLE_ID],
    bannerUrl: 'https://media.discordapp.net/attachments/1258198097293611131/1534961238772154518/4.png?ex=6a76078d&is=6a74b60d&hm=93e443b70e802d77bfe911218676839568cfa0a0361724e865be80233fdd415c&=&format=webp&quality=lossless&width=2048&height=1024',
    accentColor: 0xFBCC13 
  },
  boss_help: { 
    label: 'General Boss Help', 
    max: 6, 
    points: 2, 
    pingRoleIds: [HELPER_ROLE_ID],
    bannerUrl: STANDARD_BANNER_URL,
    accentColor: 0x856A02 
  },
  spamming: { 
    label: 'Spamming', 
    max: 6, 
    points: 1, 
    pingRoleIds: [HELPER_ROLE_ID],
    bannerUrl: 'https://media.discordapp.net/attachments/1258198097293611131/1534961239157899527/5.png?ex=6a76078d&is=6a74b60d&hm=b94b6cf605487010f0cd4f6f14a7e37603127fc8fdd6f333934947aab42f255f&=&format=webp&quality=lossless&width=2048&height=1024',
    accentColor: 0xEFBF04 
  }
};

// --- LIVE STATS UPDATER ---
async function updateLiveStatsMessage(guild) {
  try {
    const cfg = guildSettings.get(guild.id) || {};
    if (!cfg.statsChannelId || !cfg.statsMessageId) return;

    const channel = guild.channels.cache.get(cfg.statsChannelId);
    if (!channel) return;

    const msg = await channel.messages.fetch(cfg.statsMessageId).catch(() => null);
    if (!msg) return;

    const statsEmbed = new EmbedBuilder()
      .setTitle(`Ticket stats`)
      .setDescription(
        `🎫 **\`${globalStats.totalTicketsCompleted}\`** tickets completed.\n` +
        `🏅 **\`${globalStats.totalPointsGiven}\`** points given out.\n\n` +
        "Ticket status has been updated everytime you make one!"
      )
      .setColor('#3498db')
      .setTimestamp();

    await msg.edit({ embeds: [statsEmbed] });
  } catch (err) {
    console.error('Failed to update live stats message:', err);
  }
}

// --- HELPER LOGGING FUNCTION ---
async function sendTicketLog(guild, title, description, color = '#3498db', fields = []) {
  try {
    const cfg = guildSettings.get(guild.id) || {};
    const logChannelId = cfg.logChannelId;
    if (!logChannelId) return;

    const logChannel = guild.channels.cache.get(logChannelId);
    if (!logChannel) return;

    const logEmbed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(description)
      .addFields(fields)
      .setColor(color)
      .setTimestamp();

    await logChannel.send({ embeds: [logEmbed] });
  } catch (err) {
    console.error('Failed to send ticket log:', err);
  }
}

function isHelperInActiveTicket(userId) {
  for (const [channelId, ticket] of activeTickets.entries()) {
    if (ticket.helpers.some(h => h.id === userId)) {
      return channelId;
    }
  }
  return null;
}

function getPointsForTicket(ticketData, completedItems = null) {
  const type = (ticketData.type || '').toLowerCase();
  let items = [];
  if (Array.isArray(completedItems)) {
    items = completedItems;
  } else if (typeof completedItems === 'string') {
    items = completedItems.split(',').map(x => x.trim()).filter(x => x.length > 0);
  } else {
    const desc = ticketData.description || '';
    items = desc.split(',').map(x => x.trim()).filter(x => x.length > 0);
  }

  const itemCount = items.length > 0 ? items.length : 1;

  if (type === 'ultra_weeklies') {
    let totalPts = 0;
    for (const item of items) {
      if (item.toLowerCase().includes('speaker')) {
        totalPts += 5; 
      } else if (item.toLowerCase().includes('nulgath')) {
        totalPts += 3; // Ultra Nulgath = 3 points
      } else {
        totalPts += 3; 
      }
    }
    return totalPts > 0 ? totalPts : 3 * itemCount;
  }

  if (type === 'ultra_dailies' || type === 'seven_man_dailies') {
    return 2 * itemCount; 
  }

  if (ticketData.customPoints !== undefined && ticketData.customPoints >= 0) {
    return ticketData.customPoints;
  }

  if (type.includes('farm') || type.includes('farming')) return 3;
  if (type.includes('weekly')) return 8;
  if (type.includes('daily')) return 5;
  return 1;
}

async function checkAndAssignHelperRoles(guild, userId, currentPoints) {
  try {
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return;

    for (const [requiredPts, roleId] of roleRewards.entries()) {
      if (currentPoints >= requiredPts) {
        if (!member.roles.cache.has(roleId)) {
          await member.roles.add(roleId).catch(console.error);
        }
      }
    }
  } catch (err) {
    console.error('Failed to assign helper auto-role:', err);
  }
}

function buildTicketHubPayload(options = {}) {
  const {
    imageUrl = STANDARD_BANNER_URL,
    guideTitle = "TICKET GUIDE",
    guideDesc = "Read through the ticket rules and guidelines before requesting assistance.",
    guideUrl = TICKET_GUIDE_URL,
    createTitle = "MAKE A TICKET",
    createDesc = "Select a category below to open a ticket."
  } = options;

  const containerComponent = {
    type: 17,
    accent_color: 0x8b0000,
    components: [
      { type: 12, items: [{ media: { url: imageUrl } }] },
      {
        type: 9,
        components: [{ type: 10, content: `**${guideTitle.replace(/\\n/g, '\n')}**\n\n${guideDesc.replace(/\\n/g, '\n')}` }],
        accessory: { type: 2, style: 5, url: guideUrl, label: 'Guide' }
      },
      {
        type: 9,
        components: [{ type: 10, content: `**${createTitle.replace(/\\n/g, '\n')}**\n\n${createDesc.replace(/\\n/g, '\n')}` }],
        accessory: { type: 2, style: 2, custom_id: 'btn_open_ticket_menu', label: 'Create' }
      }
    ]
  };

  return { components: [containerComponent], flags: MessageFlags.IsComponentsV2 };
}

function buildTicketControlPayload(ticketData, userMention) {
  const maxLimit = ticketData.maxHelpers || 3;
  const categoryPreset = TICKET_PRESETS[ticketData.type] || {};
  const ticketBanner = categoryPreset.bannerUrl || STANDARD_BANNER_URL;
  const accentColor = categoryPreset.accentColor || 0x8b0000;

  const requesterTag = `<@${ticketData.requesterId}> (${ticketData.ign})`;
  const helpersFormatted = ticketData.helpers.length > 0
    ? ticketData.helpers.map(h => `• <@${h.id}>`).join('\n')
    : '• None';

  const points = getPointsForTicket(ticketData);

  const containerComponent = {
    type: 17,
    accent_color: accentColor,
    components: [
      { type: 12, items: [{ media: { url: ticketBanner } }] },
      { type: 10, content: `<:pointsbt:1534950425080496189> **Points:**\n-# > **${points}**` },
      { type: 10, content: `<:requestbt:1534950441060798594> **Requester:** ${requesterTag}` },
      {
        type: 9,
        components: [{ type: 10, content: `Selected server:\n-# > **${ticketData.server}**` }],
        accessory: { type: 2, style: 2, custom_id: 'btn_change_server', label: 'Change server', emoji: { id: '1534950290908909749', name: 'changeserverbt', animated: false } }
      },
      {
        type: 9,
        components: [{ type: 10, content: `Monsters:\n-# > **${ticketData.description}**` }],
        accessory: { type: 2, style: 2, custom_id: 'btn_change_bosses', label: 'Change Monsters', emoji: { id: '1534950407003050185', name: 'monstersbt', animated: false } }
      },
      { type: 10, content: `Details:\n-# > **${ticketData.details || 'None provided'}**` },
      {
        type: 9,
        components: [{ type: 10, content: `Need more help? **Ping helpers!**` }],
        accessory: { type: 2, style: 2, custom_id: 'btn_pinghelpers', label: 'Ping helpers', emoji: { id: '1534950337167884368', name: 'pinghelpersbt', animated: false } }
      },
      { type: 10, content: `Done with the ticket?` },
      {
        type: 1,
        components: [
          { type: 2, style: 3, custom_id: 'btn_complete', label: 'Complete', emoji: { id: '1534950268679094397', name: 'completebt', animated: false } },
          { type: 2, style: 4, custom_id: 'btn_cancel', label: 'Cancel', emoji: { id: '1534950219517788170', name: 'cancelbt', animated: false } }
        ]
      },
      {
        type: 9,
        components: [{ type: 10, content: `<:helpersbt:1534950382109986876> **Helpers (${ticketData.helpers.length}/${maxLimit})**\n${helpersFormatted}` }],
        accessory: { type: 2, style: 4, custom_id: 'btn_kick_helper', label: 'Kick Helper' }
      },
      {
        type: 9,
        components: [{ type: 10, content: `Stepped down from helping? Click **Leave!**` }],
        accessory: { type: 2, style: 2, custom_id: 'btn_leave_ticket', label: 'Leave' }
      },
      {
        type: 9,
        components: [{ type: 10, content: `Need the room information again? Click **Room details!**` }],
        accessory: { type: 2, style: 2, custom_id: 'btn_location', label: 'Room details', emoji: { id: '1534950471922483382', name: 'roomdeetsbt', animated: false } }
      },
      {
        type: 9,
        components: [{ type: 10, content: `Claim this ticket to view room details.` }],
        accessory: { type: 2, style: 3, custom_id: 'btn_claim', label: 'Claim', emoji: { id: '1534950248831516806', name: 'claimbt', animated: false } }
      }
    ]
  };

  return { components: [containerComponent], flags: MessageFlags.IsComponentsV2 };
}

function buildSupportTicketControlPayload(ticketData, userMention) {
  const categoryPreset = TICKET_PRESETS.server_ticket;
  const ticketBanner = categoryPreset.bannerUrl || STANDARD_BANNER_URL;
  const accentColor = categoryPreset.accentColor || 0x2ecc71;

  const requesterTag = `<@${ticketData.requesterId}> (${ticketData.ign})`;

  const containerComponent = {
    type: 17,
    accent_color: accentColor,
    components: [
      { type: 12, items: [{ media: { url: ticketBanner } }] },
      { type: 10, content: `<:requestbt:1534950441060798594> **User:** ${requesterTag}\n\n**Subject / Concern:**\n-# > **${ticketData.subject}**` },
      { type: 10, content: `**Details / Report:**\n-# > **${ticketData.description}**` },
      {
        type: 9,
        components: [{ type: 10, content: `Need staff attention? **Ping staff!**` }],
        accessory: { type: 2, style: 2, custom_id: 'btn_pinghelpers', label: 'Ping staff', emoji: { id: '1534950337167884368', name: 'pinghelpersbt', animated: false } }
      },
      {
        type: 1,
        components: [
          { type: 2, style: 3, custom_id: 'btn_complete', label: 'Complete', emoji: { id: '1534950268679094397', name: 'completebt', animated: false } },
          { type: 2, style: 4, custom_id: 'btn_cancel', label: 'Cancel', emoji: { id: '1534950219517788170', name: 'cancelbt', animated: false } }
        ]
      }
    ]
  };

  return { components: [containerComponent], flags: MessageFlags.IsComponentsV2 };
}

async function updateTicketEmbed(channel, ticketData) {
  try {
    const pinnedMessages = await channel.messages.fetchPinned();
    const panelMsg = pinnedMessages.first();
    if (!panelMsg) return;

    const payload = ticketData.type === 'server_ticket'
      ? buildSupportTicketControlPayload(ticketData, `<@${ticketData.requesterId}>`)
      : buildTicketControlPayload(ticketData, `<@${ticketData.requesterId}>`);

    await panelMsg.edit(payload);
  } catch (err) {
    console.error('Failed to update ticket embed in real-time:', err);
  }
}

// --- PARSE VARIABLES HELPER ---
function parseVariables(text, member, guild) {
  if (!text) return '';
  return text
    .replace(/{user}/g, `<@${member.id}>`)
    .replace(/{username}/g, member.user.username)
    .replace(/{server}/g, guild.name)
    .replace(/{membercount}/g, guild.memberCount);
}

// --- SLASH COMMANDS REGISTRATION ---
const commands = [
  new SlashCommandBuilder()
    .setName('setup-ticket-hub')
    .setDescription('Post the unified ticket panel hub')
    .addChannelOption(opt => opt.setName('channel').setDescription('Channel to post panel').setRequired(true))
    .addStringOption(opt => opt.setName('banner_url').setDescription('Header banner image URL').setRequired(false))
    .addStringOption(opt => opt.setName('guide_title').setDescription('Custom guide section title').setRequired(false))
    .addStringOption(opt => opt.setName('guide_desc').setDescription('Custom guide section description').setRequired(false))
    .addStringOption(opt => opt.setName('guide_url').setDescription('Custom ticket guide link URL').setRequired(false))
    .addStringOption(opt => opt.setName('create_title').setDescription('Custom create ticket section title').setRequired(false))
    .addStringOption(opt => opt.setName('create_desc').setDescription('Custom create ticket section description').setRequired(false))
    .addChannelOption(opt => 
      opt.setName('category')
        .setDescription('Ticket Channel Category')
        .addChannelTypes(ChannelType.GuildCategory)
        .setRequired(false)
    )
    .addChannelOption(opt => opt.setName('log_channel').setDescription('Channel for Ticket Logs').setRequired(false)),

  new SlashCommandBuilder()
    .setName('setup-verification')
    .setDescription('Post a fully customizable Verification and Member Join panel')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
    .addChannelOption(opt => opt.setName('channel').setDescription('Target channel to post verification panel').setRequired(true))
    .addRoleOption(opt => opt.setName('guest_role').setDescription('Guest Role to give upon approval').setRequired(true))
    .addRoleOption(opt => opt.setName('member_role').setDescription('Member Role to give upon approval').setRequired(true))
    .addStringOption(opt => opt.setName('panel_title').setDescription('Main Title for the Verification Panel').setRequired(true))
    .addStringOption(opt => opt.setName('guest_title').setDescription('Title for Guest Section').setRequired(true))
    .addStringOption(opt => opt.setName('guest_desc').setDescription('Description for Guest Section').setRequired(true))
    .addStringOption(opt => opt.setName('member_title').setDescription('Title for Member Section').setRequired(true))
    .addStringOption(opt => opt.setName('member_desc').setDescription('Description for Member Section').setRequired(true))
    .addStringOption(opt => opt.setName('guest_btn_name').setDescription('Custom button name for Guest').setRequired(false))
    .addStringOption(opt => opt.setName('member_btn_name').setDescription('Custom button name for Member').setRequired(false))
    .addStringOption(opt => opt.setName('banner_url').setDescription('Top banner image URL').setRequired(false))
    .addStringOption(opt => opt.setName('footer_banner_url').setDescription('Bottom banner image URL (Optional)').setRequired(false)),

  // --- /GIVEAWAY COMMAND ---
  new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('Manage server giveaways')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
    .addSubcommand(sub =>
      sub.setName('start')
        .setDescription('Start a new V2 Giveaway')
        .addChannelOption(opt => opt.setName('channel').setDescription('Channel to post giveaway').setRequired(true))
        .addStringOption(opt => opt.setName('prize').setDescription('Prize of the giveaway').setRequired(true))
        .addStringOption(opt => opt.setName('title').setDescription('Giveaway embed/card title').setRequired(true))
        .addStringOption(opt => opt.setName('description').setDescription('Giveaway description details').setRequired(true))
        .addIntegerOption(opt => opt.setName('duration').setDescription('Duration in minutes').setRequired(true))
        .addIntegerOption(opt => opt.setName('winners').setDescription('Number of winners').setRequired(true))
        .addRoleOption(opt => opt.setName('role1').setDescription('Required Role 1 (Optional)').setRequired(false))
        .addRoleOption(opt => opt.setName('role2').setDescription('Required Role 2 (Optional)').setRequired(false))
        .addStringOption(opt => opt.setName('banner_url').setDescription('Banner image URL').setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('end')
        .setDescription('End an active giveaway early')
        .addStringOption(opt => opt.setName('message_id').setDescription('Giveaway message ID').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('reroll')
        .setDescription('Reroll a winner for a giveaway')
        .addStringOption(opt => opt.setName('message_id').setDescription('Giveaway message ID').setRequired(true))
    ),

  // --- /SETUP-BOOST COMMAND ---
  new SlashCommandBuilder()
    .setName('setup-boost')
    .setDescription('Configure Server Boost announcement')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
    .addChannelOption(opt => opt.setName('channel').setDescription('Boost announcement channel').setRequired(true))
    .addStringOption(opt => opt.setName('title').setDescription('Boost message title').setRequired(true))
    .addStringOption(opt => opt.setName('description').setDescription('Boost description (supports variables)').setRequired(true))
    .addStringOption(opt => opt.setName('banner_url').setDescription('Banner image URL').setRequired(false)),

  // --- /SETUP-WELCOME COMMAND ---
  new SlashCommandBuilder()
    .setName('setup-welcome')
    .setDescription('Configure Server Welcome announcement')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
    .addChannelOption(opt => opt.setName('channel').setDescription('Welcome announcement channel').setRequired(true))
    .addStringOption(opt => opt.setName('outer_message').setDescription('Message outside container').setRequired(true))
    .addStringOption(opt => opt.setName('title').setDescription('Welcome card title').setRequired(true))
    .addStringOption(opt => opt.setName('description').setDescription('Welcome description (supports variables)').setRequired(true))
    .addStringOption(opt => opt.setName('banner_url').setDescription('Banner image URL').setRequired(false)),

  // --- /VIEWPOINTS COMMAND ---
  new SlashCommandBuilder()
    .setName('viewpoints')
    .setDescription('Check your points or another user points')
    .addUserOption(opt => opt.setName('user').setDescription('User to check points for (Optional)').setRequired(false)),

  // --- MODERATION COMMANDS ---
  new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick a member from the server')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.KickMembers)
    .addUserOption(opt => opt.setName('user').setDescription('User to kick').setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('Reason for kick').setRequired(false)),

  new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Timeout/mute a member')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ModerateMembers)
    .addUserOption(opt => opt.setName('user').setDescription('User to mute').setRequired(true))
    .addIntegerOption(opt => opt.setName('duration').setDescription('Duration in minutes').setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('Reason for mute').setRequired(false)),

  new SlashCommandBuilder()
    .setName('snipe')
    .setDescription('Retrieve the last deleted message in the channel')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageMessages),

  new SlashCommandBuilder()
    .setName('viewprofile')
    .setDescription('View user profile details')
    .addUserOption(opt => opt.setName('user').setDescription('User to view profile of').setRequired(false)),

  new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Display global ticket stats counter')
    .addStringOption(opt => opt.setName('custom_message').setDescription('Custom message below stats').setRequired(false)),

  new SlashCommandBuilder()
    .setName('setup-stats')
    .setDescription('Post and link a live updating stats message')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
    .addChannelOption(opt => opt.setName('channel').setDescription('Channel to post stats').setRequired(true)),

  new SlashCommandBuilder()
    .setName('embed')
    .setDescription('Create a clean Components V2 panel with title, description, and banners')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageMessages)
    .addChannelOption(opt => opt.setName('channel').setDescription('Target channel').setRequired(true))
    .addStringOption(opt => opt.setName('title').setDescription('Panel title').setRequired(true))
    .addStringOption(opt => opt.setName('description').setDescription('Main text content').setRequired(true))
    .addStringOption(opt => opt.setName('banner_url').setDescription('Top banner image URL').setRequired(false))
    .addStringOption(opt => opt.setName('footer_banner_url').setDescription('Bottom footer banner image URL').setRequired(false)),

  new SlashCommandBuilder()
    .setName('reactionrole')
    .setDescription('Create a Components V2 reaction role panel with up to 7 buttons')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageRoles)
    .addChannelOption(opt => opt.setName('channel').setDescription('Where to post the panel').setRequired(true))
    .addStringOption(opt => opt.setName('title').setDescription('Panel title').setRequired(true))
    .addStringOption(opt => opt.setName('description').setDescription('Panel description').setRequired(true))
    .addRoleOption(opt => opt.setName('role1').setDescription('Role 1').setRequired(true))
    .addStringOption(opt => opt.setName('desc1').setDescription('Description for Role 1').setRequired(true))
    .addStringOption(opt => opt.setName('banner_url').setDescription('Banner image URL').setRequired(false))
    .addStringOption(opt => opt.setName('emoji1').setDescription('Emoji for Button 1').setRequired(false))
    .addRoleOption(opt => opt.setName('role2').setDescription('Role 2').setRequired(false))
    .addStringOption(opt => opt.setName('desc2').setDescription('Description for Role 2').setRequired(false))
    .addStringOption(opt => opt.setName('emoji2').setDescription('Emoji for Button 2').setRequired(false))
    .addRoleOption(opt => opt.setName('role3').setDescription('Role 3').setRequired(false))
    .addStringOption(opt => opt.setName('desc3').setDescription('Description for Role 3').setRequired(false))
    .addStringOption(opt => opt.setName('emoji3').setDescription('Emoji for Button 3').setRequired(false))
    .addRoleOption(opt => opt.setName('role4').setDescription('Role 4').setRequired(false))
    .addStringOption(opt => opt.setName('desc4').setDescription('Description for Role 4').setRequired(false))
    .addStringOption(opt => opt.setName('emoji4').setDescription('Emoji for Button 4').setRequired(false))
    .addRoleOption(opt => opt.setName('role5').setDescription('Role 5').setRequired(false))
    .addStringOption(opt => opt.setName('desc5').setDescription('Description for Role 5').setRequired(false))
    .addStringOption(opt => opt.setName('emoji5').setDescription('Emoji for Button 5').setRequired(false))
    .addRoleOption(opt => opt.setName('role6').setDescription('Role 6').setRequired(false))
    .addStringOption(opt => opt.setName('desc6').setDescription('Description for Role 6').setRequired(false))
    .addStringOption(opt => opt.setName('emoji6').setDescription('Emoji for Button 6').setRequired(false))
    .addRoleOption(opt => opt.setName('role7').setDescription('Role 7').setRequired(false))
    .addStringOption(opt => opt.setName('desc7').setDescription('Description for Role 7').setRequired(false))
    .addStringOption(opt => opt.setName('emoji7').setDescription('Emoji for Button 7').setRequired(false)),

  new SlashCommandBuilder()
    .setName('setup-channels')
    .setDescription('Configure server system channels')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
    .addChannelOption(opt => opt.setName('log_channel').setDescription('Log channel').setRequired(false))
    .addChannelOption(opt => opt.setName('welcome_channel').setDescription('Welcome channel').setRequired(false))
    .addChannelOption(opt => opt.setName('boost_channel').setDescription('Boost channel').setRequired(false))
    .addChannelOption(opt => opt.setName('verify_log_channel').setDescription('Verification Log Channel').setRequired(false)),

  new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('View top 20 helpers and top 20 requesters'),

  new SlashCommandBuilder()
    .setName('points')
    .setDescription('Manage helper points')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
    .addSubcommand(sub =>
      sub.setName('add')
        .setDescription('Add points to helper')
        .addUserOption(opt => opt.setName('user').setDescription('User').setRequired(true))
        .addIntegerOption(opt => opt.setName('amount').setDescription('Amount').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('remove')
        .setDescription('Remove points from helper')
        .addUserOption(opt => opt.setName('user').setDescription('User').setRequired(true))
        .addIntegerOption(opt => opt.setName('amount').setDescription('Amount').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('reset')
        .setDescription('Reset points')
        .addUserOption(opt => opt.setName('user').setDescription('User (Leave blank for ALL)').setRequired(false))
    ),

  new SlashCommandBuilder()
    .setName('helper-roles')
    .setDescription('Configure role rewards')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
    .addSubcommand(sub =>
      sub.setName('add')
        .setDescription('Set point reward role')
        .addIntegerOption(opt => opt.setName('points').setDescription('Points required').setRequired(true))
        .addRoleOption(opt => opt.setName('role').setDescription('Role').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription('View reward roles')
    )
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

async function registerCommands() {
  try {
    await rest.put(
      Routes.applicationGuildCommands(client.user.id, GUILD_ID),
      { body: commands }
    );
    console.log('✅ Slash commands successfully registered!');
  } catch (error) {
    console.error('Error registering commands:', error);
  }
}

client.once(Events.ClientReady, async () => {
  console.log(`Logged in as ${client.user.tag}`);
  client.user.setPresence({ status: 'idle', activities: [{ name: 'Sindria On Top', type: 5 }] });
  await registerCommands();
});

// --- WELCOME & BOOST EVENT LISTENERS ---
client.on(Events.GuildMemberAdd, async (member) => {
  if (member.guild.id !== GUILD_ID) return;
  const cfg = guildSettings.get(member.guild.id) || {};
  if (!cfg.welcomeChannelId) return;
  const channel = member.guild.channels.cache.get(cfg.welcomeChannelId);
  if (!channel) return;

  const welcomeData = cfg.welcomeData || { outerMessage: 'Welcome to the server, {user}!', title: 'New Member Joined!', description: 'We are thrilled to have you here, {user}!', bannerUrl: STANDARD_BANNER_URL };
  const container = {
    type: 17, accent_color: 0x3498db,
    components: [
      { type: 12, items: [{ media: { url: welcomeData.bannerUrl } }] },
      { type: 9, components: [{ type: 10, content: `**${parseVariables(welcomeData.title, member, member.guild)}**\n\n${parseVariables(welcomeData.description, member, member.guild)}` }] }
    ]
  };
  await channel.send({ content: parseVariables(welcomeData.outerMessage, member, member.guild), components: [container], flags: MessageFlags.IsComponentsV2 }).catch(console.error);
});

client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
  if (newMember.guild.id !== GUILD_ID) return;
  if (!oldMember.premiumSince && newMember.premiumSince) {
    const cfg = guildSettings.get(newMember.guild.id) || {};
    if (!cfg.boostChannelId) return;
    const channel = newMember.guild.channels.cache.get(cfg.boostChannelId);
    if (!channel) return;

    const boostData = cfg.boostData || { title: 'Server Boosted! 🚀', description: 'Thank you {user} for boosting {server}!', bannerUrl: STANDARD_BANNER_URL };
    const container = {
      type: 17, accent_color: 0xf47fff,
      components: [
        { type: 12, items: [{ media: { url: boostData.bannerUrl } }] },
        { type: 9, components: [{ type: 10, content: `**${parseVariables(boostData.title, newMember, newMember.guild)}**\n\n${parseVariables(boostData.description, newMember, newMember.guild)}` }] }
      ]
    };
    await channel.send({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(console.error);
  }
});

// --- INTERACTION LISTENER ---
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.guild || interaction.guild.id !== GUILD_ID) return;

  try {
    // --- GIVEAWAY ENTER ---
    if (interaction.isButton() && interaction.customId.startsWith('gw_enter_')) {
      const gwId = interaction.customId.replace('gw_enter_', '');
      const giveaway = activeGiveaways.get(gwId);
      if (!giveaway || giveaway.ended) return interaction.reply({ content: '❌ Giveaway ended.', ephemeral: true });
      if (giveaway.entries.has(interaction.user.id)) return interaction.reply({ content: '⚠️ Already entered.', ephemeral: true });
      giveaway.entries.add(interaction.user.id);
      return interaction.reply({ content: '🎉 Entered!', ephemeral: true });
    }

    // --- VERIFICATION TRIGGERS ---
    if (interaction.isButton() && interaction.customId.startsWith('btn_verify_')) {
      if (userRejectionReasons.has(interaction.user.id)) {
        const reason = userRejectionReasons.get(interaction.user.id);
        return interaction.reply({ content: `❌ **You were rejected:** ${reason}\nPlease address this issue before verifying again.`, ephemeral: true });
      }

      const roleId = interaction.customId.split('_')[3];
      const type = interaction.customId.includes('guest') ? 'GUEST' : 'MEMBER';
      const modal = new ModalBuilder().setCustomId(`modal_verify_${type.toLowerCase()}_${roleId}`).setTitle(`Verify as ${type}`);
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('ign').setLabel('AQW IGN').setStyle(TextInputStyle.Short).setRequired(true)),
        type === 'GUEST' ? new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('guild_name').setLabel('Guild Name').setStyle(TextInputStyle.Short).setRequired(true)) : null,
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('invited_by').setLabel('Who invited you?').setStyle(TextInputStyle.Short).setRequired(type === 'MEMBER'))
      );
      modal.components = modal.components.filter(c => c);
      return await interaction.showModal(modal);
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_verify_')) {
      await interaction.deferReply({ ephemeral: true });
      const parts = interaction.customId.split('_');
      const type = parts[2].toUpperCase();
      const roleId = parts[3];
      const ign = interaction.fields.getTextInputValue('ign').trim();
      const invitedBy = interaction.fields.getTextInputValue('invited_by') || 'None';
      const guildName = type === 'GUEST' ? interaction.fields.getTextInputValue('guild_name') : 'Main Guild';

      const logChannelId = guildSettings.get(interaction.guild.id)?.verifyLogChannelId;
      const logChannel = interaction.guild.channels.cache.get(logChannelId);
      if (!logChannel) return interaction.editReply('❌ Verification log channel not set.');

      const requestId = `ver_${interaction.user.id}_${Date.now()}`;
      pendingVerifications.set(requestId, { userId: interaction.user.id, type, ign, roleId, invitedBy, guildName });
      const userAvatar = interaction.user.displayAvatarURL({ extension: 'png', size: 128 });

      const logContainer = {
        type: 17, accent_color: type === 'GUEST' ? 0x3498db : 0x2ecc71,
        components: [
          { type: 12, items: [{ media: { url: userAvatar } }] },
          { type: 10, content: `🛡️ **New ${type} Verification**\nUser: <@${interaction.user.id}>\nIGN: [${ign}](https://account.aq.com/CharPage?id=${encodeURIComponent(ign)})\nInvited By: ${invitedBy}` },
          { type: 1, components: [
            new ButtonBuilder().setCustomId(`ver_approve_${requestId}`).setLabel('Approve').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`ver_reject_${requestId}`).setLabel('Reject').setStyle(ButtonStyle.Danger)
          ]}
        ]
      };
      await logChannel.send({ components: [logContainer], flags: MessageFlags.IsComponentsV2 });
      return interaction.editReply('✅ Verification submitted for review!');
    }

    if (interaction.isButton() && interaction.customId.startsWith('ver_approve_')) {
      const requestId = interaction.customId.replace('ver_approve_', '');
      const data = pendingVerifications.get(requestId);
      if (!data) return interaction.reply({ content: '⚠️ Request already processed.', ephemeral: true });

      const member = await interaction.guild.members.fetch(data.userId).catch(() => null);
      if (member) {
        await member.roles.add(data.roleId).catch(() => {});
        await member.setNickname(data.ign).catch(() => {});
      }
      userRejectionReasons.delete(data.userId);
      pendingVerifications.delete(requestId);
      await interaction.update({ content: '✅ Approved successfully!', components: [] });
    }

    if (interaction.isButton() && interaction.customId.startsWith('ver_reject_')) {
      const requestId = interaction.customId.replace('ver_reject_', '');
      const modal = new ModalBuilder().setCustomId(`modal_reject_reason_${requestId}`).setTitle('Reason for Rejection')
        .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason').setLabel('Reason').setStyle(TextInputStyle.Paragraph).setRequired(true)));
      return await interaction.showModal(modal);
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_reject_reason_')) {
      await interaction.deferUpdate();
      const requestId = interaction.customId.replace('modal_reject_reason_', '');
      const reason = interaction.fields.getTextInputValue('reason');
      const data = pendingVerifications.get(requestId);
      if (data) {
        userRejectionReasons.set(data.userId, reason);
        pendingVerifications.delete(requestId);
      }
      await interaction.editReply({ content: '❌ Request rejected with reason recorded.', components: [] });
    }

    // --- TICKET SYSTEM (WITH DROPDOWNS & ULTRA NULGATH RESTORED) ---
    if (interaction.isButton() && interaction.customId === 'btn_open_ticket_menu') {
      const selectMenu = new StringSelectMenuBuilder().setCustomId('select_ticket_cat').setPlaceholder('Select category...').addOptions(
        Object.entries(TICKET_PRESETS).map(([k, v]) => new StringSelectMenuOptionBuilder().setLabel(v.label).setValue(k))
      );
      return await interaction.reply({ components: [new ActionRowBuilder().addComponents(selectMenu)], ephemeral: true });
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'select_ticket_cat') {
      const selectedKey = interaction.values[0];
      if (selectedKey === 'ultra_weeklies') {
        const menu = new StringSelectMenuBuilder().setCustomId('select_bosses_ultra_weeklies').setPlaceholder('Select Ultra Weeklies bosses...').setMinValues(1).setMaxValues(7).addOptions(
          [
            { label: 'Champion Drakath', value: 'Champion Drakath', emoji: { id: '1534544989009477754', name: 'drakath' } },
            { label: 'Ultra Dage', value: 'Ultra Dage', emoji: { id: '1534544956713209877', name: 'dage' } },
            { label: 'Ultra Darkon', value: 'Ultra Darkon', emoji: { id: '1534545103350272131', name: 'darkon' } },
            { label: 'Ultra Drago', value: 'Ultra Drago', emoji: { id: '1534545063915290694', name: 'drago' } },
            { label: 'Ultra Gramiel', value: 'Ultra Gramiel', emoji: { id: '1534545007468613662', name: 'gramiel' } },
            { label: 'Ultra Speaker', value: 'Ultra Speaker', emoji: { id: '1534545145016352778', name: 'malgor' } },
            { label: 'Ultra Nulgath', value: 'Ultra Nulgath', emoji: { id: '1534545036102995988', name: 'nulgath' } }
          ].map(b => new StringSelectMenuOptionBuilder().setLabel(b.label).setValue(b.value).setEmoji(b.emoji))
        );
        return await interaction.update({ content: '⚔️ Select all Ultra Weeklies bosses you need help with:', components: [new ActionRowBuilder().addComponents(menu)] });
      }

      if (selectedKey === 'ultra_dailies') {
        const menu = new StringSelectMenuBuilder().setCustomId('select_bosses_ultra_dailies').setPlaceholder('Select Ultra Dailies bosses...').setMinValues(1).setMaxValues(6).addOptions(
          ['Ultra Ezrajal', 'Ultra Warden', 'Ultra Engineer', 'Ultra Tyndarius', 'Ultra Kala', 'Ultra Iara'].map(b => new StringSelectMenuOptionBuilder().setLabel(b).setValue(b))
        );
        return await interaction.update({ content: '⚔️ Select Ultra Dailies bosses:', components: [new ActionRowBuilder().addComponents(menu)] });
      }

      if (selectedKey === 'seven_man_dailies') {
        const menu = new StringSelectMenuBuilder().setCustomId('select_bosses_seven_man_dailies').setPlaceholder('Select 7-Man Dailies bosses...').setMinValues(1).setMaxValues(4).addOptions(
          ['Kathool Depths', 'Originul', 'Astral Shrine', 'Lavarock Shore'].map(b => new StringSelectMenuOptionBuilder().setLabel(b).setValue(b))
        );
        return await interaction.update({ content: '⚔️ Select 7-Man Dailies bosses:', components: [new ActionRowBuilder().addComponents(menu)] });
      }

      if (selectedKey === 'server_ticket') {
        tempTicketCache.set(interaction.user.id, { categoryKey: 'server_ticket', server: 'N/A', bosses: '' });
        const modal = new ModalBuilder().setCustomId('ticket_form_final_2_0_server_ticket').setTitle('Support Ticket')
          .addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('ign').setLabel('Username / IGN').setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('subject').setLabel('Subject').setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('description').setLabel('Details').setStyle(TextInputStyle.Paragraph).setRequired(true))
          );
        return await interaction.showModal(modal);
      }

      const serverMenu = new StringSelectMenuBuilder().setCustomId(`select_server_form_${selectedKey}`).setPlaceholder('Select AQW server...').addOptions(
        AQW_SERVERS.map(srv => new StringSelectMenuOptionBuilder().setLabel(srv.label).setValue(srv.label).setEmoji(srv.emoji))
      );
      return await interaction.update({ content: `🌐 Select server:`, components: [new ActionRowBuilder().addComponents(serverMenu)] });
    }

    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('select_bosses_')) {
      const categoryKey = interaction.customId.replace('select_bosses_', '');
      tempTicketCache.set(interaction.user.id, { categoryKey, bosses: interaction.values.join(', ') });
      const serverMenu = new StringSelectMenuBuilder().setCustomId('select_server_form_boss').setPlaceholder('Select server...').addOptions(
        AQW_SERVERS.map(srv => new StringSelectMenuOptionBuilder().setLabel(srv.label).setValue(srv.label).setEmoji(srv.emoji))
      );
      return await interaction.update({ content: '🌐 Select server:', components: [new ActionRowBuilder().addComponents(serverMenu)] });
    }

    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('select_server_form_')) {
      const server = interaction.values[0];
      const cached = tempTicketCache.get(interaction.user.id) || {};
      const categoryKey = interaction.customId === 'select_server_form_boss' ? cached.categoryKey : interaction.customId.replace('select_server_form_', '');
      const bosses = cached.bosses || '';
      const preset = TICKET_PRESETS[categoryKey] || { max: 6, points: 1 };

      tempTicketCache.set(interaction.user.id, { categoryKey, server, bosses });
      const modal = new ModalBuilder().setCustomId(`ticket_form_final_${preset.max}_${preset.points}_${categoryKey}`).setTitle('Ticket Form')
        .addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('ign').setLabel('Username / IGN').setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('map_name').setLabel('Map Name / Room').setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('details').setLabel('Details (Optional)').setStyle(TextInputStyle.Paragraph).setRequired(false))
        );
      if (!bosses) {
        modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('description').setLabel('Monsters').setStyle(TextInputStyle.Paragraph).setRequired(true)));
      }
      return await interaction.showModal(modal);
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('ticket_form_final_')) {
      await interaction.deferReply({ ephemeral: true });
      const parts = interaction.customId.replace('ticket_form_final_', '').split('_');
      const maxHelpers = parseInt(parts[0]) || 3;
      const customPoints = parseInt(parts[1]) || 0;
      const ticketType = parts.slice(2).join('_');

      const cached = tempTicketCache.get(interaction.user.id) || {};
      const serverName = cached.server || 'Artix';
      let description = cached.bosses || interaction.fields.getTextInputValue('description') || 'General Assistance';
      const ign = interaction.fields.getTextInputValue('ign');
      const rawMap = interaction.fields.getTextInputValue('map_name').trim();
      const cleanMap = rawMap.toLowerCase().replace(/[^a-z0-9]/g, '') || 'room';
      const room = `/join ${cleanMap}`;
      const ticketDetails = interaction.fields.getTextInputValue('details') || 'None provided';

      const cfg = guildSettings.get(interaction.guild.id) || {};
      ticketCounter += 1;
      const chName = `ticket-${String(ticketCounter).padStart(4, '0')}`;

      const ticketChannel = await interaction.guild.channels.create({
        name: chName,
        type: ChannelType.GuildText,
        parent: cfg.ticketCategory || null,
        permissionOverwrites: [
          { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageChannels] },
          { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
          { id: interaction.guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] }
        ]
      });

      const newTicketData = { requesterId: interaction.user.id, type: ticketType, ign, server: serverName, room, description, details: ticketDetails, maxHelpers, customPoints, helpers: [] };
      activeTickets.set(ticketChannel.id, newTicketData);
      tempTicketCache.delete(interaction.user.id);

      await ticketChannel.send({ content: `<@&${ULTRA_HELPER_ROLE_ID}> assistance requested!` });
      const payload = buildSupportTicketControlPayload(newTicketData);
      const mainMsg = await ticketChannel.send({ components: payload.components, flags: payload.flags });
      await mainMsg.pin().catch(() => {});

      return await interaction.editReply(`✅ Ticket created: ${ticketChannel}`);
    }

    // --- COMMAND INPUTS ---
    if (interaction.isChatInputCommand()) {
      const { commandName, options } = interaction;

      if (commandName === 'viewpoints') {
        const target = options.getUser('user') || interaction.user;
        const pts = helperPoints.get(target.id) || 0;
        return await interaction.reply({ content: `🏅 **${target.tag}** currently has **${pts}** helper points.`, ephemeral: true });
      }

      if (commandName === 'kick') {
        const user = options.getUser('user');
        const reason = options.getString('reason') || 'No reason';
        const member = await interaction.guild.members.fetch(user.id).catch(() => null);
        if (!member) return await interaction.reply({ content: '❌ User not found.', ephemeral: true });
        await member.kick(reason);
        return await interaction.reply({ content: `✅ Kicked ${user.tag}.`, ephemeral: true });
      }

      if (commandName === 'mute') {
        const user = options.getUser('user');
        const duration = options.getInteger('duration');
        const reason = options.getString('reason') || 'No reason';
        const member = await interaction.guild.members.fetch(user.id).catch(() => null);
        if (!member) return await interaction.reply({ content: '❌ User not found.', ephemeral: true });
        await member.timeout(duration * 60 * 1000, reason);
        return await interaction.reply({ content: `✅ Muted ${user.tag} for ${duration} mins.`, ephemeral: true });
      }

      if (commandName === 'snipe') {
        const sniped = snipeCache.get(interaction.channel.id);
        if (!sniped) return await interaction.reply({ content: '❌ Nothing to snipe.', ephemeral: true });
        const embed = new EmbedBuilder().setTitle('🎯 Sniped Message').setDescription(sniped.content).setAuthor({ name: sniped.author.tag, iconURL: sniped.author.displayAvatarURL() }).setColor('#e74c3c');
        if (sniped.image) embed.setImage(sniped.image);
        return await interaction.reply({ embeds: [embed] });
      }

      if (commandName === 'viewprofile') {
        const user = options.getUser('user') || interaction.user;
        const member = await interaction.guild.members.fetch(user.id).catch(() => null);
        if (!member) return await interaction.reply({ content: '❌ User not found.', ephemeral: true });
        const roles = member.roles.cache.filter(r => r.id !== interaction.guild.id).map(r => r).join(', ') || 'None';
        const embed = new EmbedBuilder().setTitle(`👤 Profile: ${user.tag}`).setThumbnail(user.displayAvatarURL()).addFields(
          { name: '🆔 ID', value: `\`${user.id}\``, inline: true },
          { name: '📅 Joined', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`, inline: true },
          { name: '🛡️ Roles', value: roles }
        ).setColor('#3498db');
        return await interaction.reply({ embeds: [embed], ephemeral: true });
      }

      if (commandName === 'giveaway' && options.getSubcommand() === 'start') {
        await interaction.deferReply({ ephemeral: true });
        const channel = options.getChannel('channel');
        const prize = options.getString('prize');
        const title = options.getString('title');
        const description = options.getString('description').replace(/\\n/g, '\n');
        const duration = options.getInteger('duration');
        const winners = options.getInteger('winners');
        const role1 = options.getRole('role1')?.id || null;
        const role2 = options.getRole('role2')?.id || null;
        const bannerUrl = options.getString('banner_url') || STANDARD_BANNER_URL;

        const endsAt = Date.now() + duration * 60 * 1000;
        const gwId = `gw_${Date.now()}`;

        const gwContainer = {
          type: 17, accent_color: 0xf1c40f,
          components: [
            { type: 12, items: [{ media: { url: bannerUrl } }] },
            {
              type: 9,
              components: [{ type: 10, content: `# ${title}\n\n🎉 **Prize:** ${prize}\n\n${description}\n\n**Winners:** ${winners}\nEnds At: <t:${Math.floor(endsAt / 1000)}:R>` }],
              accessory: { type: 2, style: 3, custom_id: `gw_enter_${gwId}`, label: '🎉 Enter Giveaway' }
            }
          ]
        };

        const msg = await channel.send({ components: [gwContainer], flags: MessageFlags.IsComponentsV2 });
        activeGiveaways.set(gwId, { messageId: msg.id, channelId: channel.id, prize, winnersCount: winners, role1, role2, entries: new Set(), ended: false });
        setTimeout(() => endGiveaway(interaction.guild, gwId), duration * 60 * 1000);
        return await interaction.editReply(`✅ Giveaway started in ${channel}!`);
      }

      if (commandName === 'setup-verification') {
        await interaction.deferReply({ ephemeral: true });
        const channel = options.getChannel('channel');
        const guestRole = options.getRole('guest_role');
        const memberRole = options.getRole('member_role');
        const panelTitle = options.getString('panel_title');
        const guestTitle = options.getString('guest_title');
        const guestDesc = options.getString('guest_desc').replace(/\\n/g, '\n');
        const memberTitle = options.getString('member_title');
        const memberDesc = options.getString('member_desc').replace(/\\n/g, '\n');
        const bannerUrl = options.getString('banner_url') || STANDARD_BANNER_URL;

        const verifyContainer = {
          type: 17, accent_color: 0x8b0000,
          components: [
            { type: 12, items: [{ media: { url: bannerUrl } }] },
            { type: 10, content: `# ${panelTitle}` },
            { type: 9, components: [{ type: 10, content: `**${guestTitle}**\n-# > ${guestDesc}` }], accessory: { type: 2, style: 2, custom_id: `btn_verify_guest_${guestRole.id}`, label: options.getString('guest_btn_name') || 'Verify as Guest' } },
            { type: 9, components: [{ type: 10, content: `**${memberTitle}**\n-# > ${memberDesc}` }], accessory: { type: 2, style: 2, custom_id: `btn_verify_member_${memberRole.id}`, label: options.getString('member_btn_name') || 'Verify as Member' } }
          ]
        };
        await channel.send({ components: [verifyContainer], flags: MessageFlags.IsComponentsV2 });
        return await interaction.editReply('✅ Verification panel posted!');
      }

      if (commandName === 'setup-ticket-hub') {
        await interaction.deferReply({ ephemeral: true });
        const channel = options.getChannel('channel');
        const payload = buildTicketHubPayload({ imageUrl: options.getString('banner_url') || STANDARD_BANNER_URL });
        await channel.send({ components: payload.components, flags: payload.flags });
        return await interaction.editReply('✅ Ticket Hub posted!');
      }

      if (commandName === 'setup-channels') {
        await interaction.deferReply({ ephemeral: true });
        const cfg = guildSettings.get(interaction.guild.id) || {};
        if (options.getChannel('log_channel')) cfg.logChannelId = options.getChannel('log_channel').id;
        if (options.getChannel('verify_log_channel')) cfg.verifyLogChannelId = options.getChannel('verify_log_channel').id;
        guildSettings.set(interaction.guild.id, cfg);
        return await interaction.editReply('✅ Channels configured!');
      }
    }
  } catch (err) { console.error(err); }
});

async function endGiveaway(guild, gwId) {
  const gw = activeGiveaways.get(gwId);
  if (!gw || gw.ended) return;
  gw.ended = true;
  const channel = guild.channels.cache.get(gw.channelId);
  if (!channel) return;
  const entries = Array.from(gw.entries);
  let winners = [];
  if (entries.length > 0) {
    const shuffled = entries.sort(() => 0.5 - Math.random());
    winners = shuffled.slice(0, gw.winnersCount).map(id => `<@${id}>`);
  }
  await channel.send(winners.length > 0 ? `🎊 Congratulations ${winners.join(', ')}! You won the **${gw.prize}**!` : `❌ Giveaway for ${gw.prize} ended with no entries.`);
  activeGiveaways.delete(gwId);
}

client.login(process.env.DISCORD_TOKEN);

// --- HTTP SERVER FOR KEEP-ALIVE (RENDER FIX) ---
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => res.end("Bot is alive!")).listen(PORT, () => {
  console.log(`HTTP server is listening on port ${PORT}`);
});
