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
  MessageFlags
} = require('discord.js');
const http = require('http');

// --- ⚠️ CONFIGURATION ⚠️ ---
const GUILD_ID = '1371775026264670228'; // Server ID
const ULTRA_HELPER_ROLE_ID = 'YOUR_ULTRA_HELPER_ROLE_ID'; // <--- Paste your Ultra Helper role ID here!
const HELPER_ROLE_ID = 'YOUR_HELPER_ROLE_ID'; // Fallback Helper Role ID
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
    bannerUrl: STANDARD_BANNER_URL,
    accentColor: 0x8b0000 
  },
  ultra_weeklies: { 
    label: 'Ultra Weeklies', 
    max: 3, 
    points: 3, 
    roleIds: [ULTRA_HELPER_ROLE_ID],
    bannerUrl: STANDARD_BANNER_URL,
    accentColor: 0x9b59b6 
  },
  seven_man_dailies: { 
    label: '7-Man Dailies', 
    max: 6, 
    points: 2, 
    roleIds: [ULTRA_HELPER_ROLE_ID, HELPER_ROLE_ID],
    bannerUrl: STANDARD_BANNER_URL,
    accentColor: 0xe67e22 
  },
  ultra_dailies: { 
    label: 'Ultra Dailies', 
    max: 3, 
    points: 2, 
    roleIds: [ULTRA_HELPER_ROLE_ID],
    bannerUrl: STANDARD_BANNER_URL,
    accentColor: 0x3498db 
  },
  server_ticket: { 
    label: 'Server Ticket / Support', 
    max: 2, 
    points: 0, 
    roleIds: ['1529498802149392614'],
    bannerUrl: STANDARD_BANNER_URL,
    accentColor: 0x2ecc71 
  },
  boss_help: { 
    label: 'General Boss Help', 
    max: 6, 
    points: 2, 
    roleIds: [HELPER_ROLE_ID],
    bannerUrl: STANDARD_BANNER_URL,
    accentColor: 0xe74c3c 
  },
  spamming: { 
    label: 'Spamming', 
    max: 6, 
    points: 1, 
    roleIds: [HELPER_ROLE_ID],
    bannerUrl: STANDARD_BANNER_URL,
    accentColor: 0x95a5a6 
  }
};

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

function getPointsForTicket(ticketData) {
  const type = (ticketData.type || '').toLowerCase();
  const desc = (ticketData.description || '').toLowerCase();
  const items = desc ? desc.split(',').map(x => x.trim()).filter(x => x.length > 0) : [];
  const itemCount = items.length > 0 ? items.length : 1;

  if (type === 'ultra_weeklies') {
    let totalPts = 0;
    for (const item of items) {
      if (item.toLowerCase().includes('speaker')) {
        totalPts += 5; // Ultra Speaker is 5 points
      } else {
        totalPts += 3; // Other Ultra Weeklies bosses are 3 points
      }
    }
    return totalPts > 0 ? totalPts : 3 * itemCount;
  }

  if (type === 'ultra_dailies' || type === 'seven_man_dailies') {
    return 2 * itemCount; // 2 points per boss
  }

  if (ticketData.customPoints !== undefined && ticketData.customPoints >= 0) {
    return ticketData.customPoints;
  }

  if (type.includes('farm') || type.includes('farming')) {
    return 3;
  }
  if (type.includes('weekly')) {
    return 8;
  }
  if (type.includes('daily')) {
    return 5;
  }
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
    guideDesc = "Read through the ticket rules and guidelines before requesting assistance.",
    guideUrl = TICKET_GUIDE_URL,
    createDesc = "Select a category from the menu to open a new ticket. Our helpers will join shortly!"
  } = options;

  const containerComponent = {
    type: 17,
    accent_color: 0x8b0000,
    components: [
      {
        type: 12,
        items: [{ media: { url: imageUrl } }]
      },
      {
        type: 9,
        components: [
          {
            type: 10,
            content: `🔖 **TICKET GUIDE**\n\n${guideDesc.replace(/\\n/g, '\n')}`
          }
        ],
        accessory: {
          type: 2,
          style: 5,
          url: guideUrl,
          label: 'Guide'
        }
      },
      {
        type: 9,
        components: [
          {
            type: 10,
            content: `🤝 **MAKE A TICKET**\n\n${createDesc.replace(/\\n/g, '\n')}`
          }
        ],
        accessory: {
          type: 2,
          style: 2,
          custom_id: 'btn_open_ticket_menu',
          label: 'Create'
        }
      }
    ]
  };

  return {
    components: [containerComponent],
    flags: MessageFlags.IsComponentsV2
  };
}

// --- COMPONENTS V2 LAYOUT WITH KICK HELPER & ALL CUSTOM EMOJIS ---
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
      {
        type: 12,
        items: [{ media: { url: ticketBanner } }]
      },
      {
        type: 10,
        content: `<:pointsbt:1534950425080496189> **Points:**\n-# > **${points}**`
      },
      {
        type: 10,
        content: `<:requestbt:1534950441060798594> **Requester:** ${requesterTag}`
      },
      {
        type: 9,
        components: [
          {
            type: 10,
            content: `Selected server:\n-# > **${ticketData.server}**`
          }
        ],
        accessory: {
          type: 2,
          style: 2,
          custom_id: 'btn_change_server',
          label: 'Change server',
          emoji: { id: '1534950290908909749', name: 'changeserverbt', animated: false }
        }
      },
      {
        type: 9,
        components: [
          {
            type: 10,
            content: `Monsters:\n-# > **${ticketData.description}**`
          }
        ],
        accessory: {
          type: 2,
          style: 2,
          custom_id: 'btn_change_bosses',
          label: 'Change Monsters',
          emoji: { id: '1534950407003050185', name: 'monstersbt', animated: false }
        }
      },
      {
        type: 10,
        content: `Details:\n-# > **${ticketData.details || 'None provided'}**`
      },
      {
        type: 9,
        components: [
          {
            type: 10,
            content: `Still in need of help? **Ping helpers!**`
          }
        ],
        accessory: {
          type: 2,
          style: 2,
          custom_id: 'btn_pinghelpers',
          label: 'Ping helpers',
          emoji: { id: '1534950337167884368', name: 'pinghelpersbt', animated: false }
        }
      },
      {
        type: 10,
        content: `Finished with the ticket?`
      },
      {
        type: 1,
        components: [
          {
            type: 2,
            style: 3,
            custom_id: 'btn_complete',
            label: 'Complete',
            emoji: { id: '1534950268679094397', name: 'completebt', animated: false }
          },
          {
            type: 2,
            style: 4,
            custom_id: 'btn_cancel',
            label: 'Cancel',
            emoji: { id: '1534950219517788170', name: 'cancelbt', animated: false }
          }
        ]
      },
      {
        type: 9,
        components: [
          {
            type: 10,
            content: `<:helpersbt:1534950382109986876> **Helpers (${ticketData.helpers.length}/${maxLimit})**\n${helpersFormatted}`
          }
        ],
        accessory: {
          type: 2,
          style: 4,
          custom_id: 'btn_kick_helper',
          label: 'Kick Helper'
        }
      },
      {
        type: 9,
        components: [
          {
            type: 10,
            content: `Forgot room details? Click **Room details!**`
          }
        ],
        accessory: {
          type: 2,
          style: 2,
          custom_id: 'btn_location',
          label: 'Room details',
          emoji: { id: '1534950471922483382', name: 'roomdeetsbt', animated: false }
        }
      },
      {
        type: 9,
        components: [
          {
            type: 10,
            content: `Claim the ticket, and get room details!`
          }
        ],
        accessory: {
          type: 2,
          style: 3,
          custom_id: 'btn_claim',
          label: 'Claim',
          emoji: { id: '1534950248831516806', name: 'claimbt', animated: false }
        }
      }
    ]
  };

  return {
    components: [containerComponent],
    flags: MessageFlags.IsComponentsV2
  };
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
      {
        type: 12,
        items: [{ media: { url: ticketBanner } }]
      },
      {
        type: 10,
        content: `<:requestbt:1534950441060798594> **User:** ${requesterTag}\n\n**Subject / Concern:**\n-# > **${ticketData.subject}**`
      },
      {
        type: 10,
        content: `**Details / Report:**\n-# > **${ticketData.description}**`
      },
      {
        type: 9,
        components: [
          {
            type: 10,
            content: `Need staff attention? **Ping staff!**`
          }
        ],
        accessory: {
          type: 2,
          style: 2,
          custom_id: 'btn_pinghelpers',
          label: 'Ping staff',
          emoji: { id: '1534950337167884368', name: 'pinghelpersbt', animated: false }
        }
      },
      {
        type: 1,
        components: [
          {
            type: 2,
            style: 3,
            custom_id: 'btn_complete',
            label: 'Complete',
            emoji: { id: '1534950268679094397', name: 'completebt', animated: false }
          },
          {
            type: 2,
            style: 4,
            custom_id: 'btn_cancel',
            label: 'Cancel',
            emoji: { id: '1534950219517788170', name: 'cancelbt', animated: false }
          }
        ]
      }
    ]
  };

  return {
    components: [containerComponent],
    flags: MessageFlags.IsComponentsV2
  };
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
    .setName('stats')
    .setDescription('Display global ticket stats counter')
    .addStringOption(opt => opt.setName('custom_message').setDescription('Custom message below stats').setRequired(false)),

  new SlashCommandBuilder()
    .setName('embed')
    .setDescription('Create and send a customized embed message')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageMessages)
    .addChannelOption(opt => opt.setName('channel').setDescription('Target channel').setRequired(true))
    .addStringOption(opt => opt.setName('title').setDescription('Embed Title').setRequired(true))
    .addStringOption(opt => opt.setName('description').setDescription('Embed Description').setRequired(true))
    .addStringOption(opt => opt.setName('outer_message').setDescription('Message outside embed').setRequired(false))
    .addStringOption(opt => opt.setName('color').setDescription('Hex color code').setRequired(false))
    .addStringOption(opt => opt.setName('image_url').setDescription('Banner image URL').setRequired(false))
    .addStringOption(opt => opt.setName('thumbnail_url').setDescription('Thumbnail URL').setRequired(false))
    .addStringOption(opt => opt.setName('footer').setDescription('Footer text').setRequired(false)),

  new SlashCommandBuilder()
    .setName('setup-channels')
    .setDescription('Configure server system channels')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
    .addChannelOption(opt => opt.setName('log_channel').setDescription('Log channel').setRequired(false))
    .addChannelOption(opt => opt.setName('welcome_channel').setDescription('Welcome channel').setRequired(false))
    .addChannelOption(opt => opt.setName('boost_channel').setDescription('Boost channel').setRequired(false)),

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

// --- BOT INITIALIZATION ---
client.once(Events.ClientReady, async () => {
  console.log(`Logged in as ${client.user.tag}`);

  client.user.setPresence({
    status: 'idle',
    activities: [{
      name: 'Im weird',
      type: 5
    }]
  });

  await registerCommands();
});

// --- INTERACTION LISTENER ---
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.guild || interaction.guild.id !== GUILD_ID) return;

  try {
    if (interaction.isButton() && interaction.customId === 'btn_open_ticket_menu') {
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('select_ticket_cat')
        .setPlaceholder('Select a ticket type...')
        .addOptions(
          Object.entries(TICKET_PRESETS).map(([key, item]) => 
            new StringSelectMenuOptionBuilder()
              .setLabel(item.label)
              .setValue(key)
          )
        );

      return await interaction.reply({
        content: '🎫 **Select the ticket category you need assistance with:**',
        components: [new ActionRowBuilder().addComponents(selectMenu)],
        ephemeral: true
      });
    }

    if (interaction.isButton() && ['btn_all_helpers', 'btn_helpers_list', 'btn_support_info', 'btn_support_details'].includes(interaction.customId)) {
      return await interaction.reply({
        content: '🔒 **Status:** Showing active ticket details.',
        ephemeral: true
      });
    }

    // STEP 1: Category Selected
    if (interaction.isStringSelectMenu() && interaction.customId === 'select_ticket_cat') {
      const selectedKey = interaction.values[0];
      const preset = TICKET_PRESETS[selectedKey] || { label: 'Ticket', max: 6, points: 1, roleIds: [HELPER_ROLE_ID] };

      if (selectedKey === 'ultra_weeklies') {
        const menu = new StringSelectMenuBuilder()
          .setCustomId('select_bosses_ultra_weeklies')
          .setPlaceholder('Select Ultra Weeklies bosses...')
          .setMinValues(1)
          .setMaxValues(6)
          .addOptions(
            new StringSelectMenuOptionBuilder().setLabel('Champion Drakath').setValue('Champion Drakath').setEmoji({ id: '1534544989009477754', name: 'drakath' }),
            new StringSelectMenuOptionBuilder().setLabel('Ultra Dage').setValue('Ultra Dage').setEmoji({ id: '1534544956713209877', name: 'dage' }),
            new StringSelectMenuOptionBuilder().setLabel('Ultra Darkon').setValue('Ultra Darkon').setEmoji({ id: '1534545103350272131', name: 'darkon' }),
            new StringSelectMenuOptionBuilder().setLabel('Ultra Drago').setValue('Ultra Drago').setEmoji({ id: '1534545063915290694', name: 'drago' }),
            new StringSelectMenuOptionBuilder().setLabel('Ultra Gramiel').setValue('Ultra Gramiel').setEmoji({ id: '1534545007468613662', name: 'gramiel' }),
            new StringSelectMenuOptionBuilder().setLabel('Ultra Speaker').setValue('Ultra Speaker').setEmoji({ id: '1534545145016352778', name: 'malgor' })
          );

        return await interaction.update({
          content: '⚔️ **Select all Ultra Weeklies bosses you need help with:**',
          components: [new ActionRowBuilder().addComponents(menu)]
        });
      }

      if (selectedKey === 'ultra_dailies') {
        const menu = new StringSelectMenuBuilder()
          .setCustomId('select_bosses_ultra_dailies')
          .setPlaceholder('Select Ultra Dailies bosses...')
          .setMinValues(1)
          .setMaxValues(6)
          .addOptions(
            new StringSelectMenuOptionBuilder().setLabel('Ultra Ezrajal').setValue('Ultra Ezrajal'),
            new StringSelectMenuOptionBuilder().setLabel('Ultra Warden').setValue('Ultra Warden'),
            new StringSelectMenuOptionBuilder().setLabel('Ultra Engineer').setValue('Ultra Engineer'),
            new StringSelectMenuOptionBuilder().setLabel('Ultra Tyndarius').setValue('Ultra Tyndarius'),
            new StringSelectMenuOptionBuilder().setLabel('Ultra Kala').setValue('Ultra Kala'),
            new StringSelectMenuOptionBuilder().setLabel('Ultra Iara').setValue('Ultra Iara')
          );

        return await interaction.update({
          content: '⚔️ **Select all Ultra Dailies bosses you need help with:**',
          components: [new ActionRowBuilder().addComponents(menu)]
        });
      }

      if (selectedKey === 'seven_man_dailies') {
        const menu = new StringSelectMenuBuilder()
          .setCustomId('select_bosses_seven_man_dailies')
          .setPlaceholder('Select 7-Man Dailies bosses...')
          .setMinValues(1)
          .setMaxValues(4)
          .addOptions(
            new StringSelectMenuOptionBuilder().setLabel('Kathool Depths').setValue('Kathool Depths'),
            new StringSelectMenuOptionBuilder().setLabel('Originul').setValue('Originul'),
            new StringSelectMenuOptionBuilder().setLabel('Astral Shrine').setValue('Astral Shrine'),
            new StringSelectMenuOptionBuilder().setLabel('Lavarock Shore').setValue('Lavarock Shore')
          );

        return await interaction.update({
          content: '⚔️ **Select all 7-Man Dailies bosses you need help with:**',
          components: [new ActionRowBuilder().addComponents(menu)]
        });
      }

      // For other categories, prompt Server Dropdown next
      const serverMenu = new StringSelectMenuBuilder()
        .setCustomId(`select_server_form_${selectedKey}`)
        .setPlaceholder('Select your AQW server...')
        .addOptions(
          AQW_SERVERS.map(srv => 
            new StringSelectMenuOptionBuilder()
              .setLabel(srv.label)
              .setValue(srv.label)
              .setEmoji(srv.emoji)
          )
        );

      return await interaction.update({
        content: `🌐 **Select your AQW server for ${preset.label}:**`,
        components: [new ActionRowBuilder().addComponents(serverMenu)]
      });
    }

    // Boss selection finished -> Prompt Server Dropdown
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('select_bosses_')) {
      const categoryKey = interaction.customId.replace('select_bosses_', '');
      const selectedBosses = interaction.values.join(', ');
      
      tempTicketCache.set(interaction.user.id, { categoryKey, bosses: selectedBosses });

      const serverMenu = new StringSelectMenuBuilder()
        .setCustomId('select_server_form_boss')
        .setPlaceholder('Select your AQW server...')
        .addOptions(
          AQW_SERVERS.map(srv => 
            new StringSelectMenuOptionBuilder()
              .setLabel(srv.label)
              .setValue(srv.label)
              .setEmoji(srv.emoji)
          )
        );

      return await interaction.update({
        content: '🌐 **Select your AQW server:**',
        components: [new ActionRowBuilder().addComponents(serverMenu)]
      });
    }

    // Server selected from dropdown -> Show Final Modal
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('select_server_form_')) {
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

      const modal = new ModalBuilder()
        .setCustomId(`ticket_form_final_${preset.max}_${preset.points}_${categoryKey}`)
        .setTitle(`Ticket: ${preset.label}`);

      const ignInput = new TextInputBuilder()
        .setCustomId('ign')
        .setLabel('Username / IGN')
        .setPlaceholder('Enter your username...')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      if (categoryKey === 'server_ticket') {
        const subjectInput = new TextInputBuilder().setCustomId('subject').setLabel('Subject / Concern').setPlaceholder('Report, Question, etc.').setStyle(TextInputStyle.Short).setRequired(true);
        const descInput = new TextInputBuilder().setCustomId('description').setLabel('Details / Report').setPlaceholder('Describe your concern...').setStyle(TextInputStyle.Paragraph).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(ignInput), new ActionRowBuilder().addComponents(subjectInput), new ActionRowBuilder().addComponents(descInput));
      } else {
        const mapInput = new TextInputBuilder().setCustomId('map_name').setLabel('Map Name / Room').setPlaceholder('ultraezrajal, ultrakala, etc.').setStyle(TextInputStyle.Short).setRequired(true);
        const detailsInput = new TextInputBuilder().setCustomId('details').setLabel('Details').setPlaceholder('Add extra details (optional)...').setStyle(TextInputStyle.Paragraph).setRequired(false);
        
        const modalComps = [
          new ActionRowBuilder().addComponents(ignInput), 
          new ActionRowBuilder().addComponents(mapInput),
          new ActionRowBuilder().addComponents(detailsInput)
        ];
        
        if (!bossVal) {
          const descInput = new TextInputBuilder().setCustomId('description').setLabel('Monsters / Details').setPlaceholder('List monsters...').setStyle(TextInputStyle.Paragraph).setRequired(true);
          modalComps.push(new ActionRowBuilder().addComponents(descInput));
        }

        modal.addComponents(modalComps);
      }

      return await interaction.showModal(modal);
    }

    // Changing server inside active ticket via Dropdown menu
    if (interaction.isButton() && interaction.customId === 'btn_change_server') {
      const ticketData = activeTickets.get(interaction.channel.id);
      if (!ticketData) return interaction.reply({ content: '❌ Ticket not found.', ephemeral: true });
      if (interaction.user.id !== ticketData.requesterId && !interaction.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
        return interaction.reply({ content: '❌ Only the requester can change the server.', ephemeral: true });
      }

      const serverDropdown = new StringSelectMenuBuilder()
        .setCustomId('active_change_server_menu')
        .setPlaceholder('Select new AQW server...')
        .addOptions(
          AQW_SERVERS.map(srv => 
            new StringSelectMenuOptionBuilder()
              .setLabel(srv.label)
              .setValue(srv.label)
              .setEmoji(srv.emoji)
          )
        );

      return await interaction.reply({
        content: '🌐 **Select a new server from the dropdown below:**',
        components: [new ActionRowBuilder().addComponents(serverDropdown)],
        ephemeral: true
      });
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'active_change_server_menu') {
      await interaction.deferUpdate();
      const ticketData = activeTickets.get(interaction.channel.id);
      if (!ticketData) return;

      const newServer = interaction.values[0];
      ticketData.server = newServer;
      activeTickets.set(interaction.channel.id, ticketData);

      await interaction.editReply({ content: `✅ Successfully updated server to **${newServer}**!`, components: [] });
      return updateTicketEmbed(interaction.channel, ticketData);
    }

    // Kick Helper Button Clicked
    if (interaction.isButton() && interaction.customId === 'btn_kick_helper') {
      const ticketData = activeTickets.get(interaction.channel.id);
      if (!ticketData) return interaction.reply({ content: '❌ Ticket not found.', ephemeral: true });

      const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.ManageChannels);
      const isRequester = interaction.user.id === ticketData.requesterId;
      if (!isAdmin && !isRequester) {
        return interaction.reply({ content: '❌ Only the requester or staff can kick helpers.', ephemeral: true });
      }

      if (!ticketData.helpers || ticketData.helpers.length === 0) {
        return interaction.reply({ content: '⚠️ There are no helpers currently claimed in this ticket.', ephemeral: true });
      }

      const helperMenu = new StringSelectMenuBuilder()
        .setCustomId('active_kick_helper_menu')
        .setPlaceholder('Select helper to remove...')
        .addOptions(
          ticketData.helpers.map(h => 
            new StringSelectMenuOptionBuilder()
              .setLabel(`Helper ID: ${h.id}`)
              .setValue(h.id)
          )
        );

      return await interaction.reply({
        content: '🔨 **Select the helper you want to remove from this ticket:**',
        components: [new ActionRowBuilder().addComponents(helperMenu)],
        ephemeral: true
      });
    }

    // Process Kick Helper Selection
    if (interaction.isStringSelectMenu() && interaction.customId === 'active_kick_helper_menu') {
      await interaction.deferUpdate();
      const ticketData = activeTickets.get(interaction.channel.id);
      if (!ticketData) return;

      const helperIdToRemove = interaction.values[0];
      ticketData.helpers = ticketData.helpers.filter(h => h.id !== helperIdToRemove);
      activeTickets.set(interaction.channel.id, ticketData);

      await interaction.editReply({ content: `✅ Successfully removed <@${helperIdToRemove}> from the ticket!`, components: [] });
      await interaction.channel.send({ content: `🔴 <@${helperIdToRemove}> has been removed from this ticket by ${interaction.user}.` });
      return updateTicketEmbed(interaction.channel, ticketData);
    }

    if (interaction.isModalSubmit() && interaction.customId === 'modal_edit_bosses') {
      const ticketData = activeTickets.get(interaction.channel.id);
      if (!ticketData) return interaction.reply({ content: '❌ Ticket not found.', ephemeral: true });

      const newDetails = interaction.fields.getTextInputValue('new_details');
      ticketData.description = newDetails;
      activeTickets.set(interaction.channel.id, ticketData);

      await interaction.reply({ content: `✅ Updated monster details!`, ephemeral: true });
      return updateTicketEmbed(interaction.channel, ticketData);
    }

    // Final Ticket Creation Submit
    if (interaction.isModalSubmit() && interaction.customId.startsWith('ticket_form_final_')) {
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
        const ticketDetails = interaction.fields.getTextInputValue('details') || 'None provided';

        if (!description) {
          try {
            description = interaction.fields.getTextInputValue('description');
          } catch {
            description = 'General Assistance';
          }
        }

        let room = 'N/A';
        let subject = 'N/A';

        if (ticketType === 'server_ticket') {
          subject = interaction.fields.getTextInputValue('subject');
        } else {
          const rawMap = interaction.fields.getTextInputValue('map_name').trim();
          const cleanMap = rawMap.toLowerCase().replace(/[^a-z0-9]/g, '') || 'room';
          room = `/join ${cleanMap}`;
        }

        const cfg = guildSettings.get(interaction.guild.id) || {};
        
        ticketCounter += 1;
        const formattedNum = String(ticketCounter).padStart(4, '0');
        const chName = `ticket-${formattedNum}`;

        let parentCategoryId = cfg.ticketCategory || null;
        if (parentCategoryId) {
          const fetchedCategory = interaction.guild.channels.cache.get(parentCategoryId);
          if (!fetchedCategory || fetchedCategory.type !== ChannelType.GuildCategory) {
            parentCategoryId = null;
          }
        }

        const isServerTicket = ticketType === 'server_ticket';
        const permissionOverwrites = [
          { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageChannels, PermissionsBitField.Flags.ManageMessages] },
          { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
        ];

        if (isServerTicket) {
          permissionOverwrites.push({ id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] });
        } else {
          permissionOverwrites.push({ id: interaction.guild.id, allow: [PermissionsBitField.Flags.ViewChannel], deny: [PermissionsBitField.Flags.SendMessages] });
        }

        const ticketChannel = await interaction.guild.channels.create({
          name: chName,
          type: ChannelType.GuildText,
          parent: parentCategoryId,
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
        const helperRolePings = validRoleIds.length > 0 ? validRoleIds.map(id => `<@&${id}>`).join(' ') : '@Helper';
        
        await ticketChannel.send({ 
          content: `${helperRolePings} assistance requested!`,
          allowedMentions: validRoleIds.length > 0 ? { roles: validRoleIds } : { parse: ['users', 'roles'] }
        });

        const payload = isServerTicket 
          ? buildSupportTicketControlPayload(newTicketData, `${interaction.user}`)
          : buildTicketControlPayload(newTicketData, `${interaction.user}`);

        const mainMsg = await ticketChannel.send({ components: payload.components, flags: payload.flags });

        await mainMsg.pin().catch(() => {});

        await sendTicketLog(
          interaction.guild,
          '📩 Ticket Created',
          `**Category:** \`${ticketType}\`\n**User:** ${interaction.user} (\`${interaction.user.id}\`)\n**Channel:** ${ticketChannel}`,
          '#3498db'
        );

        return await interaction.editReply(`✅ Ticket created: ${ticketChannel}`);
      } catch (err) {
        console.error('Failed to create ticket channel:', err);
        return await interaction.editReply(`❌ Failed to create ticket channel: ${err.message}`);
      }
    }

    if (interaction.isButton()) {
      const ticketData = activeTickets.get(interaction.channel.id);
      const customId = interaction.customId;

      if (customId === 'btn_change_bosses') {
        if (!ticketData) return interaction.reply({ content: '❌ Ticket not found.', ephemeral: true });
        if (interaction.user.id !== ticketData.requesterId && !interaction.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
          return interaction.reply({ content: '❌ Only the requester can edit monster details.', ephemeral: true });
        }

        const modal = new ModalBuilder()
          .setCustomId('modal_edit_bosses')
          .setTitle('Change Monsters / Details')
          .addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('new_details').setLabel('New Monsters or Details').setValue(ticketData.description).setStyle(TextInputStyle.Paragraph).setRequired(true)
          ));

        return await interaction.showModal(modal);
      }

      if (customId === 'btn_location') {
        if (!ticketData) return interaction.reply({ content: '❌ Ticket not found.', ephemeral: true });

        const isRequester = interaction.user.id === ticketData.requesterId;
        const isHelper = ticketData.helpers.some(h => h.id === interaction.user.id);
        const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.ManageChannels);

        if (!isRequester && !isHelper && !isAdmin) {
          return interaction.reply({ content: '🔒 **Access Denied:** Click **Claim** first to view room details.', ephemeral: true });
        }

        const categoryPreset = TICKET_PRESETS[ticketData.type] || {};
        const accentColor = categoryPreset.accentColor || 0x3498db;

        const codesEmbed = new EmbedBuilder()
          .setTitle('📍 Room Details')
          .setColor(accentColor)
          .addFields(
            { name: '👤 IGN', value: `\`${ticketData.ign}\``, inline: true },
            { name: '🖥️ Server', value: `\`${ticketData.server}\``, inline: true },
            { name: '📜 Command', value: `\`${ticketData.room}\``, inline: false },
            { name: '📝 Details', value: `\`${ticketData.details || 'None provided'}\``, inline: false }
          )
          .setFooter({ text: 'AQW Ticket System' })
          .setTimestamp();

        return await interaction.reply({
          embeds: [codesEmbed],
          ephemeral: true
        });
      }

      if (customId === 'btn_claim') {
        if (!ticketData) return interaction.reply({ content: '❌ Ticket not found.', ephemeral: true });

        if (interaction.user.id === ticketData.requesterId) {
          return interaction.reply({ content: '⚠️ You are the requester of this ticket!', ephemeral: true });
        }

        if (ticketData.helpers.some(h => h.id === interaction.user.id)) {
          return interaction.reply({ content: '⚠️ You already claimed this ticket!', ephemeral: true });
        }

        const activeChannelId = isHelperInActiveTicket(interaction.user.id);
        if (activeChannelId) {
          return interaction.reply({ content: `⚠️ You are already in an active ticket (<#${activeChannelId}>)!`, ephemeral: true });
        }

        const maxAllowed = ticketData.maxHelpers || 3;
        if (ticketData.helpers.length >= maxAllowed) {
          return interaction.reply({ content: `⚠️ Helper spots are full (${maxAllowed}/${maxAllowed})!`, ephemeral: true });
        }

        ticketData.helpers.push({ id: interaction.user.id });
        activeTickets.set(interaction.channel.id, ticketData);

        const claimedCount = ticketData.helpers.length;

        await interaction.channel.send({
          content: `🟢 ${interaction.user} **claimed ticket (${claimedCount}/${maxAllowed})**`
        });

        await sendTicketLog(
          interaction.guild,
          '🤝 Ticket Claimed',
          `**Helper:** ${interaction.user} (\`${interaction.user.id}\`)\n**Ticket:** ${interaction.channel}\n**Requester:** <@${ticketData.requesterId}>`,
          '#3498db'
        );

        await interaction.reply({
          content: `✅ **Claimed!** Room Details:\n📍 **Server:** \`${ticketData.server}\`\n📍 **Command:** \`${ticketData.room}\`\n📍 **Details:** \`${ticketData.details || 'None provided'}\``,
          ephemeral: true
        });

        return updateTicketEmbed(interaction.channel, ticketData);
      }

      if (customId === 'btn_pinghelpers') {
        const pingRoleIds = ticketData?.pingRoleIds || [ULTRA_HELPER_ROLE_ID];
        const validRoleIds = pingRoleIds.filter(id => id && /^\d+$/.test(id));
        const helperRolePings = validRoleIds.length > 0 ? validRoleIds.map(id => `<@&${id}>`).join(' ') : '@Helper';
        return interaction.reply({ 
          content: `🔔 ${helperRolePings} assistance requested!`,
          allowedMentions: validRoleIds.length > 0 ? { roles: validRoleIds } : { parse: ['users', 'roles'] }
        });
      }

      if (customId === 'btn_cancel') {
        if (ticketData && interaction.user.id !== ticketData.requesterId && !interaction.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
          return interaction.reply({ content: '❌ Only requester or staff can cancel.', ephemeral: true });
        }

        await interaction.reply('🎟️ Ticket Canceled. Deleting channel in 3 seconds...');

        await sendTicketLog(
          interaction.guild,
          '🚫 Ticket Canceled',
          `**Canceled By:** ${interaction.user} (\`${interaction.user.id}\`)\n**Channel:** \`#${interaction.channel.name}\``,
          '#e74c3c'
        );

        activeTickets.delete(interaction.channel.id);
        setTimeout(() => interaction.channel.delete().catch(() => {}), 3000);
        return;
      }

      if (customId === 'btn_complete') {
        if (ticketData && interaction.user.id !== ticketData.requesterId && !interaction.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
          return interaction.reply({ content: '❌ Only requester or staff can complete.', ephemeral: true });
        }

        await interaction.deferReply();

        try {
          await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: false }).catch(() => {});

          if (ticketData) {
            const currentReqs = userRequestCounts.get(ticketData.requesterId) || 0;
            userRequestCounts.set(ticketData.requesterId, currentReqs + 1);
          }

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
            globalStats.totalBossesSlain += 1;
          }

          const helperMentionsLog = ticketData && ticketData.helpers.length > 0
            ? ticketData.helpers.map(h => `<@${h.id}>`).join(', ')
            : 'None';

          sendTicketLog(
            interaction.guild,
            '✅ Ticket Completed',
            `**Requester:** <@${ticketData.requesterId}>\n**Helpers:** ${helperMentionsLog}\n**Points Awarded:** \`${pointsToAward}\`\n**Channel:** \`#${interaction.channel.name}\``,
            '#2ecc71'
          ).catch(() => {});

          const categoryPreset = TICKET_PRESETS[ticketData?.type] || {};
          const accentColor = categoryPreset.accentColor || 0x2ecc71;

          let detailContent = '⚠️ **No helpers joined this ticket.**';
          if (ticketData && ticketData.type === 'server_ticket') {
            detailContent = '🛠️ **Support ticket handled and resolved by staff.**';
          } else if (ticketData && ticketData.helpers.length > 0) {
            const helperMentions = ticketData.helpers.map(h => `<@${h.id}>`).join(', ');
            detailContent = `🏆 **+${pointsToAward} pts** awarded to:\n> ${helperMentions}`;
          }

          const completionEmbed = new EmbedBuilder()
            .setTitle('🔒 Ticket Completed')
            .setDescription(`Resolved successfully!\n${detailContent}\n\n*Deleting channel in 5 seconds...*`)
            .setColor(accentColor)
            .setTimestamp();

          await interaction.editReply({ embeds: [completionEmbed] });

          activeTickets.delete(interaction.channel.id);
          setTimeout(() => {
            interaction.channel.delete().catch(() => {});
          }, 5000);

        } catch (err) {
          console.error('Error during ticket completion:', err);
          await interaction.editReply({ content: '❌ Failed to complete ticket properly. Channel deleting shortly.' }).catch(() => {});
          setTimeout(() => {
            interaction.channel.delete().catch(() => {});
          }, 3000);
        }

        return;
      }
    }

    if (interaction.isChatInputCommand()) {
      const { commandName, options } = interaction;

      if (commandName === 'setup-ticket-hub') {
        await interaction.deferReply({ ephemeral: true });

        try {
          const channel = options.getChannel('channel');
          if (!channel || !channel.isTextBased()) {
            return await interaction.editReply('❌ Please select a valid text channel to post the panel.');
          }

          const customBanner = options.getString('banner_url');
          const guideTitle = options.getString('guide_title') || undefined;
          const guideDesc = options.getString('guide_desc') || undefined;
          const guideUrl = options.getString('guide_url') || undefined;
          const createTitle = options.getString('create_title') || undefined;
          const createDesc = options.getString('create_desc') || undefined;
          const category = options.getChannel('category');
          const logChannel = options.getChannel('log_channel');

          const cfg = guildSettings.get(interaction.guild.id) || {};
          if (category) cfg.ticketCategory = category.id;
          if (logChannel) cfg.logChannelId = logChannel.id;
          guildSettings.set(interaction.guild.id, cfg);

          const payload = buildTicketHubPayload({
            imageUrl: customBanner || STANDARD_BANNER_URL,
            guideTitle,
            guideDesc,
            guideUrl,
            createTitle,
            createDesc
          });

          await channel.send({
            components: payload.components,
            flags: payload.flags
          });

          return await interaction.editReply(`✅ Ticket Hub Panel successfully posted to ${channel}!`);
        } catch (err) {
          console.error('Error posting ticket hub panel:', err);
          return await interaction.editReply(`❌ Failed to post panel: ${err.message}. Please check bot channel permissions.`);
        }
      }

      if (commandName === 'stats') {
        const customMessage = options.getString('custom_message');
        const defaultFooterMessage = "A huge thank you to each and every one of you who made this possible! ❤️";

        const statsEmbed = new EmbedBuilder()
          .setTitle(`Ticket stats`)
          .setDescription(
            `🎫 **\`${globalStats.totalTicketsCompleted}\`** tickets completed.\n` +
            `🏅 **\`${globalStats.totalPointsGiven}\`** points given out.\n\n` +
            (customMessage ? customMessage.replace(/\\n/g, '\n') : defaultFooterMessage)
          )
          .setColor('#3498db')
          .setTimestamp();

        return await interaction.reply({ embeds: [statsEmbed] });
      }

      if (commandName === 'embed') {
        await interaction.deferReply({ ephemeral: true });

        const channel = options.getChannel('channel');
        if (!channel || !channel.isTextBased()) {
          return await interaction.editReply('❌ Please select a valid text channel.');
        }

        const title = options.getString('title');
        const desc = options.getString('description').replace(/\\n/g, '\n');
        const rawOuterMessage = options.getString('outer_message');
        const color = options.getString('color') || '#3498db';
        const image = options.getString('image_url');
        const thumbnail = options.getString('thumbnail_url');
        const footer = options.getString('footer');

        try {
          const customEmbed = new EmbedBuilder().setTitle(title).setDescription(desc).setColor(color).setTimestamp();
          if (image) customEmbed.setImage(image);
          if (thumbnail) customEmbed.setThumbnail(thumbnail);
          if (footer) customEmbed.setFooter({ text: footer });

          const messageOptions = { embeds: [customEmbed] };
          if (rawOuterMessage) messageOptions.content = rawOuterMessage.replace(/\\n/g, '\n');

          await channel.send(messageOptions);
          return await interaction.editReply(`✅ Embed posted to ${channel}!`);
        } catch (err) {
          console.error('Error posting embed:', err);
          return await interaction.editReply(`❌ Failed: ${err.message}`);
        }
      }

      if (commandName === 'setup-channels') {
        await interaction.deferReply({ ephemeral: true });

        const logChannel = options.getChannel('log_channel');
        const welcomeChannel = options.getChannel('welcome_channel');
        const boostChannel = options.getChannel('boost_channel');

        const cfg = guildSettings.get(interaction.guild.id) || {};
        if (logChannel) cfg.logChannelId = logChannel.id;
        if (welcomeChannel) cfg.welcomeChannelId = welcomeChannel.id;
        if (boostChannel) cfg.boostChannelId = boostChannel.id;

        guildSettings.set(interaction.guild.id, cfg);

        const statusUpdates = [
          logChannel ? `• **Log Channel:** ${logChannel}` : null,
          welcomeChannel ? `• **Welcome Channel:** ${welcomeChannel}` : null,
          boostChannel ? `• **Boost Channel:** ${boostChannel}` : null,
        ].filter(Boolean);

        if (statusUpdates.length === 0) return await interaction.editReply('⚠️ No channels updated.');

        return await interaction.editReply(`✅ **Configured Channels:**\n${statusUpdates.join('\n')}`);
      }

      if (commandName === 'leaderboard') {
        const sortedHelpers = [...helperPoints.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
        const sortedRequesters = [...userRequestCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);

        const helpersStr = sortedHelpers.length > 0 ? sortedHelpers.map(([id, pts], i) => `**${i + 1}.** <@${id}> — \`${pts} pts\``).join('\n') : 'No helper data yet';
        const requestersStr = sortedRequesters.length > 0 ? sortedRequesters.map(([id, reqs], i) => `**${i + 1}.** <@${id}> — \`${reqs} tickets\``).join('\n') : 'No request data yet';

        const lbEmbed = new EmbedBuilder().setTitle('📊 Server Activity Leaderboard (Top 20)').addFields({ name: '🏆 Top Helpers', value: helpersStr, inline: true }, { name: '📩 Top Requesters', value: requestersStr, inline: true }).setColor('#3498db').setTimestamp();

        return await interaction.reply({ embeds: [lbEmbed] });
      }

      if (commandName === 'points') {
        const sub = options.getSubcommand();
        const targetUser = options.getUser('user');

        if (sub === 'add') {
          const amount = options.getInteger('amount');
          const current = helperPoints.get(targetUser.id) || 0;
          const updated = current + amount;
          helperPoints.set(targetUser.id, updated);

          await checkAndAssignHelperRoles(interaction.guild, targetUser.id, updated);
          return await interaction.reply({ content: `✅ Gave **${amount}** pts to ${targetUser}. Total: **${updated}**`, ephemeral: true });
        }

        if (sub === 'remove') {
          const amount = options.getInteger('amount');
          const current = helperPoints.get(targetUser.id) || 0;
          const updated = Math.max(0, current - amount);
          helperPoints.set(targetUser.id, updated);
          return await interaction.reply({ content: `✅ Removed **${amount}** pts from ${targetUser}. Total: **${updated}**`, ephemeral: true });
        }

        if (sub === 'reset') {
          if (targetUser) {
            helperPoints.delete(targetUser.id);
            return await interaction.reply({ content: `✅ Reset points for ${targetUser}.`, ephemeral: true });
          } else {
            helperPoints.clear();
            return await interaction.reply({ content: '✅ Reset all helper points!', ephemeral: true });
          }
        }
      }

      if (commandName === 'helper-roles') {
        const sub = options.getSubcommand();

        if (sub === 'add') {
          const requiredPts = options.getInteger('points');
          const role = options.getRole('role');

          roleRewards.set(requiredPts, role.id);
          return await interaction.reply({ content: `✅ Role ${role} set for **${requiredPts} pts**.`, ephemeral: true });
        }

        if (sub === 'list') {
          if (roleRewards.size === 0) return await interaction.reply({ content: '⚙️ No role rewards set.', ephemeral: true });

          const sorted = [...roleRewards.entries()].sort((a, b) => a[0] - b[0]);
          const rewardList = sorted.map(([pts, roleId]) => `• **${pts} Pts** -> <@&${roleId}>`).join('\n');

          const embed = new EmbedBuilder().setTitle('🏅 Role Rewards').setDescription(rewardList).setColor('#3498db');
          return await interaction.reply({ embeds: [embed], ephemeral: true });
        }
      }
    }
  } catch (error) {
    console.error('Error handling interaction:', error);
  }
});

// --- LOGIN ---
client.login(process.env.DISCORD_TOKEN);

// --- HTTP SERVER FOR KEEP-ALIVE ---
http.createServer((req, res) => {
  res.write("Bot is alive!");
  res.end();
}).listen(process.env.PORT || 3000);
