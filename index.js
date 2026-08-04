const {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionsBitField,
  REST,
  Routes,
  SlashCommandBuilder,
  ChannelType
} = require('discord.js');
const http = require('http');

// --- ⚠️ CONFIGURATION ⚠️ ---
const GUILD_ID = '1243470533316579361'; // Server ID
const HELPER_ROLE_ID = 'YOUR_HELPER_ROLE_ID'; // Fallback Helper Role ID
const DEFAULT_VERIFY_CHANNEL_ID = '1531294593780416743';

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

// --- ⚙️ CUSTOM TICKET PRESETS ⚙️ ---
const TICKET_PRESETS = {
  farming: { 
    label: 'Farming Assistance', 
    max: 6, 
    points: 3, 
    emoji: '<:queststart:1531490481991843862>', 
    roleIds: ['1529499059596038285'] 
  },
  ultra_weeklies: { 
    label: 'Ultra Weeklies', 
    max: 3, 
    points: 8, 
    emoji: '<:aqwDecay:1533349135460335668>', 
    roleIds: ['1529499021884919858'] 
  },
  seven_man_dailies: { 
    label: '7-Man Dailies', 
    max: 6, 
    points: 5, 
    emoji: '<:aqwGauntlet:1531490394146078820>', 
    roleIds: ['1529499059596038285', '1529499021884919858'] 
  },
  ultra_dailies: { 
    label: 'Ultra Dailies', 
    max: 3, 
    points: 5, 
    emoji: '<:wolfblade:1533348197223632956>', 
    roleIds: ['1529499021884919858'] 
  },
  server_ticket: { 
    label: 'Server Ticket / Support', 
    max: 2, 
    points: 0, 
    emoji: '<:Ticket:1533348464908435526>', 
    roleIds: ['1529498802149392614'] 
  },
  boss_help: { 
    label: 'General Boss Help', 
    max: 6, 
    points: 2, 
    emoji: '<:AQW_sword:1531490097768304714>', 
    roleIds: ['1529499059596038285'] 
  },
  other_help: { 
    label: 'Other Requests', 
    max: 6, 
    points: 1, 
    emoji: '<:aqwScroll:1533349936438181908>', 
    roleIds: ['1529499059596038285'] 
  }
};

// --- HELPER LOGGING FUNCTION ---
async function sendTicketLog(guild, title, description, color = '#2b2d31', fields = []) {
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
    if (ticket.helpers.includes(userId)) {
      return channelId;
    }
  }
  return null;
}

function getPointsForTicket(ticketData) {
  if (ticketData.customPoints !== undefined && ticketData.customPoints >= 0) {
    return ticketData.customPoints;
  }
  const normalized = (ticketData.type || '').toLowerCase();
  if (normalized.includes('weekly') || normalized.includes('ultraweekly') || normalized.includes('ultra weeklies')) {
    return 8;
  }
  if (normalized.includes('daily') || normalized.includes('ultradaily') || normalized.includes('ultra dailies')) {
    return 5;
  }
  if (normalized.includes('farm') || normalized.includes('farming')) {
    return 3;
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

// --- REAL-TIME EMBED & BUTTON PAYLOAD BUILDER ---
function buildTicketControlPayload(ticketData) {
  const maxLimit = ticketData.maxHelpers || 6;
  const helpersList = ticketData.helpers.length > 0
    ? ticketData.helpers.map(id => `• <@${id}>`).join('\n')
    : 'None';

  const embed = new EmbedBuilder()
    .setTitle(`🎫 ${ticketData.type.replace(/_/g, ' ').toUpperCase()}`)
    .setColor('#a82b2b')
    .setTimestamp();

  if (ticketData.type === 'server_ticket') {
    embed.setDescription(
      `🎖️ **Points:**\n\`${ticketData.customPoints}\`\n\n` +
      `👤 **Requester:** <@${ticketData.requesterId}>\n\n` +
      `📌 **Subject:**\n${ticketData.subject}\n\n` +
      `📝 **Description:**\n${ticketData.description}\n\n` +
      `🤝 **Helpers (${ticketData.helpers.length}/${maxLimit}):**\n${helpersList}`
    );

    const rowAction = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('btn_claim').setLabel('Claim Ticket').setStyle(ButtonStyle.Success).setEmoji('🤝'),
      new ButtonBuilder().setCustomId('btn_complete').setLabel('Complete Ticket').setStyle(ButtonStyle.Success).setEmoji('🎫'),
      new ButtonBuilder().setCustomId('btn_cancel').setLabel('Cancel Ticket').setStyle(ButtonStyle.Danger).setEmoji('🎟️')
    );

    return { embeds: [embed], components: [rowAction] };
  }

  // Exact Match Layout
  embed.setDescription(
    `🎖️ **Points:**\n\`${ticketData.customPoints}\`\n\n` +
    `👤 **Requester:** <@${ticketData.requesterId}>\n\n` +
    `**Selected server:**\n\`${ticketData.server}\`\n\n` +
    `**Bosses / Details:**\n${ticketData.description}\n\n` +
    `**Still in need of help?** **Ping helpers!**\n\n` +
    `**Finished with the ticket?**\n\n` +
    `--------------------------------------\n` +
    `🖐️ **Helpers (${ticketData.helpers.length}/${maxLimit})**\n${helpersList}\n\n` +
    `**Forgot room codes? Click Room codes!**\n\n` +
    `**Claim the ticket, and get room codes!**`
  );

  const rowServer = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('btn_change_server').setLabel('Change server').setStyle(ButtonStyle.Secondary).setEmoji('🗄️')
  );

  const rowBosses = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('btn_change_bosses').setLabel('Change bosses').setStyle(ButtonStyle.Secondary).setEmoji('💀')
  );

  const rowPing = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('btn_pinghelpers').setLabel('Ping helpers').setStyle(ButtonStyle.Secondary).setEmoji('🔔')
  );

  const rowFinish = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('btn_complete').setLabel('Complete ticket').setStyle(ButtonStyle.Success).setEmoji('🎫'),
    new ButtonBuilder().setCustomId('btn_cancel').setLabel('Cancel ticket').setStyle(ButtonStyle.Danger).setEmoji('🎟️')
  );

  const rowClaim = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('btn_location').setLabel('Room codes').setStyle(ButtonStyle.Secondary).setEmoji('📋'),
    new ButtonBuilder().setCustomId('btn_claim').setLabel('Claim ticket').setStyle(ButtonStyle.Success).setEmoji('🤝'),
    new ButtonBuilder().setCustomId('btn_leave').setLabel('Leave ticket').setStyle(ButtonStyle.Secondary).setEmoji('🚪')
  );

  return { embeds: [embed], components: [rowServer, rowBosses, rowPing, rowFinish, rowClaim] };
}

async function updateTicketEmbed(channel, ticketData) {
  try {
    const pinnedMessages = await channel.messages.fetchPinned();
    const panelMsg = pinnedMessages.first();
    if (!panelMsg) return;

    const payload = buildTicketControlPayload(ticketData);
    await panelMsg.edit(payload);
  } catch (err) {
    console.error('Failed to update ticket embed in real-time:', err);
  }
}

function parseCustomPlaceholders(str, member, boostCount = 0, verifyChannelId = DEFAULT_VERIFY_CHANNEL_ID) {
  if (!str) return '';
  return str
    .replace(/{user}/g, `${member}`)
    .replace(/{username}/g, member.user.username)
    .replace(/{server}/g, member.guild.name)
    .replace(/{boostCount}/g, boostCount)
    .replace(/{verifyChannel}/g, `<#${verifyChannelId}>`)
    .replace(/\\n/g, '\n');
}

// --- SLASH COMMANDS REGISTRATION ---
const commands = [
  new SlashCommandBuilder()
    .setName('setup-ticket-hub')
    .setDescription('Post the unified ticket panel embed')
    .addChannelOption(opt => opt.setName('channel').setDescription('Channel to post panel').setRequired(true))
    .addStringOption(opt => opt.setName('title').setDescription('Embed Title').setRequired(true))
    .addStringOption(opt => opt.setName('description').setDescription('Embed Description').setRequired(true))
    .addChannelOption(opt => opt.setName('category').setDescription('Ticket Channel Category').setRequired(false))
    .addChannelOption(opt => opt.setName('log_channel').setDescription('Channel for Ticket Logs').setRequired(false)),

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
    .setName('set-welcome-embed')
    .setDescription('Customize the welcome message and embed')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
    .addStringOption(opt => opt.setName('title').setDescription('Title').setRequired(true))
    .addStringOption(opt => opt.setName('description').setDescription('Description').setRequired(true))
    .addStringOption(opt => opt.setName('message').setDescription('Outer ping message').setRequired(false))
    .addStringOption(opt => opt.setName('footer').setDescription('Footer').setRequired(false))
    .addChannelOption(opt => opt.setName('verify_channel').setDescription('Verification Channel').setRequired(false))
    .addStringOption(opt => opt.setName('image_url').setDescription('Image URL').setRequired(false))
    .addStringOption(opt => opt.setName('thumbnail_url').setDescription('Thumbnail URL').setRequired(false))
    .addStringOption(opt => opt.setName('color').setDescription('Color').setRequired(false)),

  new SlashCommandBuilder()
    .setName('set-boost-embed')
    .setDescription('Customize server boost embed')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
    .addStringOption(opt => opt.setName('title').setDescription('Title').setRequired(true))
    .addStringOption(opt => opt.setName('description').setDescription('Description').setRequired(true))
    .addStringOption(opt => opt.setName('message').setDescription('Outer message').setRequired(false))
    .addStringOption(opt => opt.setName('footer').setDescription('Footer').setRequired(false))
    .addStringOption(opt => opt.setName('image_url').setDescription('Image URL').setRequired(false))
    .addStringOption(opt => opt.setName('thumbnail_url').setDescription('Thumbnail URL').setRequired(false))
    .addStringOption(opt => opt.setName('color').setDescription('Color').setRequired(false)),

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
    status: 'dnd',
    activities: [{
      name: 'Sindria Ticket Helper',
      type: 5
    }]
  });

  await registerCommands();
});

// --- WELCOME EVENT ---
client.on(Events.GuildMemberAdd, async (member) => {
  if (member.guild.id !== GUILD_ID) return;

  try {
    const cfg = guildSettings.get(member.guild.id) || {};
    const welcomeChannelId = cfg.welcomeChannelId;
    if (!welcomeChannelId) return;

    const welcomeChannel = member.guild.channels.cache.get(welcomeChannelId);
    if (!welcomeChannel) return;

    const customEmbed = cfg.welcomeEmbed || {};
    const verifyChanId = customEmbed.verifyChannelId || DEFAULT_VERIFY_CHANNEL_ID;

    const defaultDesc = `Hey {user}, welcome to **{server}**! 🎉\n\n📌 **First Step:** Please verify your account in {verifyChannel} first to gain access.\n\n🎫 **Need Help?** Check our ticket system after verifying!`;

    const title = parseCustomPlaceholders(customEmbed.title || `Welcome to ${member.guild.name}!`, member, 0, verifyChanId);
    const desc = parseCustomPlaceholders(customEmbed.description || defaultDesc, member, 0, verifyChanId);
    const contentMessage = customEmbed.outerMessage 
      ? parseCustomPlaceholders(customEmbed.outerMessage, member, 0, verifyChanId) 
      : `Welcome ${member}!`;

    const image = customEmbed.image || 'https://i.imgur.com/8Q9Z5Yw.png';
    const thumbnail = customEmbed.thumbnail || member.user.displayAvatarURL({ dynamic: true });
    const color = customEmbed.color || '#2b2d31';

    const welcomeEmbed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(desc)
      .setThumbnail(thumbnail)
      .setImage(image)
      .setColor(color)
      .setTimestamp();

    if (customEmbed.footer) {
      welcomeEmbed.setFooter({ text: parseCustomPlaceholders(customEmbed.footer, member, 0, verifyChanId) });
    }

    await welcomeChannel.send({ content: contentMessage, embeds: [welcomeEmbed] });
  } catch (err) {
    console.error('Error sending welcome message:', err);
  }
});

// --- BOOST EVENT ---
client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
  if (newMember.guild.id !== GUILD_ID) return;

  if (!oldMember.premiumSince && newMember.premiumSince) {
    try {
      const cfg = guildSettings.get(newMember.guild.id) || {};
      const boostChannelId = cfg.boostChannelId;
      if (!boostChannelId) return;

      const boostChannel = newMember.guild.channels.cache.get(boostChannelId);
      if (!boostChannel) return;

      const boostCount = newMember.guild.premiumSubscriptionCount || 0;
      const customEmbed = cfg.boostEmbed || {};

      const title = parseCustomPlaceholders(customEmbed.title || '🚀 Server Boost Received!', newMember, boostCount);
      const desc = parseCustomPlaceholders(customEmbed.description || `Thank you **{username}** for boosting!\n\nWe now have **{boostCount}** total boosts! 🎉`, newMember, boostCount);
      const contentMessage = customEmbed.outerMessage 
        ? parseCustomPlaceholders(customEmbed.outerMessage, newMember, boostCount) 
        : `Thank you for boosting ${newMember}!`;

      const thumbnail = customEmbed.thumbnail || newMember.user.displayAvatarURL({ dynamic: true });
      const color = customEmbed.color || '#f47fff';

      const boostEmbed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(desc)
        .setColor(color)
        .setThumbnail(thumbnail)
        .setTimestamp();

      if (customEmbed.image) boostEmbed.setImage(customEmbed.image);
      if (customEmbed.footer) boostEmbed.setFooter({ text: parseCustomPlaceholders(customEmbed.footer, newMember, boostCount) });

      await boostChannel.send({ content: contentMessage, embeds: [boostEmbed] });
    } catch (err) {
      console.error('Error sending boost message:', err);
    }
  }
});

// --- INTERACTION LISTENER ---
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.guild || interaction.guild.id !== GUILD_ID) return;

  try {
    // 1. SELECT MENU SELECTION -> OPEN MODAL
    if (interaction.isStringSelectMenu() && interaction.customId === 'select_ticket_cat') {
      const selectedKey = interaction.values[0];
      const preset = TICKET_PRESETS[selectedKey] || { label: 'Ticket', max: 6, points: 1, roleIds: [HELPER_ROLE_ID] };

      const modal = new ModalBuilder()
        .setCustomId(`ticket_form_${preset.max}_${preset.points}_${selectedKey}`)
        .setTitle(`Ticket: ${preset.label}`);

      const ignInput = new TextInputBuilder()
        .setCustomId('ign')
        .setLabel('AQW IGN')
        .setPlaceholder('Enter IGN...')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      if (selectedKey === 'server_ticket') {
        const subjectInput = new TextInputBuilder()
          .setCustomId('subject')
          .setLabel('SUBJECT')
          .setPlaceholder('Enter subject/concern...')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const descInput = new TextInputBuilder()
          .setCustomId('description')
          .setLabel('DESCRIPTION')
          .setPlaceholder('Provide details...')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true);

        modal.addComponents(
          new ActionRowBuilder().addComponents(ignInput),
          new ActionRowBuilder().addComponents(subjectInput),
          new ActionRowBuilder().addComponents(descInput)
        );
      } else {
        const serverInput = new TextInputBuilder()
          .setCustomId('server')
          .setLabel('Server')
          .setPlaceholder('Artix, Safiria, etc.')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const mapInput = new TextInputBuilder()
          .setCustomId('map_name')
          .setLabel('Map Name / Room')
          .setPlaceholder('ultraezrajal, ultrakala, etc.')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const descInput = new TextInputBuilder()
          .setCustomId('description')
          .setLabel('Details / Bosses')
          .setPlaceholder('List bosses or details needed...')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true);

        modal.addComponents(
          new ActionRowBuilder().addComponents(ignInput),
          new ActionRowBuilder().addComponents(serverInput),
          new ActionRowBuilder().addComponents(mapInput),
          new ActionRowBuilder().addComponents(descInput)
        );
      }

      return await interaction.showModal(modal);
    }

    // 2. MODALS -> CHANGE SERVER / CHANGE BOSSES
    if (interaction.isModalSubmit() && interaction.customId === 'modal_edit_server') {
      const ticketData = activeTickets.get(interaction.channel.id);
      if (!ticketData) return interaction.reply({ content: '❌ Ticket not found.', ephemeral: true });

      const newServer = interaction.fields.getTextInputValue('new_server');
      ticketData.server = newServer;
      activeTickets.set(interaction.channel.id, ticketData);

      await interaction.reply({ content: `✅ Updated server to **${newServer}**`, ephemeral: true });
      return updateTicketEmbed(interaction.channel, ticketData);
    }

    if (interaction.isModalSubmit() && interaction.customId === 'modal_edit_bosses') {
      const ticketData = activeTickets.get(interaction.channel.id);
      if (!ticketData) return interaction.reply({ content: '❌ Ticket not found.', ephemeral: true });

      const newDetails = interaction.fields.getTextInputValue('new_details');
      ticketData.description = newDetails;
      activeTickets.set(interaction.channel.id, ticketData);

      await interaction.reply({ content: `✅ Updated boss details!`, ephemeral: true });
      return updateTicketEmbed(interaction.channel, ticketData);
    }

    // 3. MODAL SUBMIT -> CREATE TICKET CHANNEL
    if (interaction.isModalSubmit() && interaction.customId.startsWith('ticket_form_')) {
      await interaction.deferReply({ ephemeral: true });

      try {
        const parts = interaction.customId.replace('ticket_form_', '').split('_');
        const maxHelpers = parseInt(parts[0]) || 6;
        const customPoints = parseInt(parts[1]) || 0;
        const ticketType = parts.slice(2).join('_');

        const preset = TICKET_PRESETS[ticketType] || {};
        const pingRoleIds = preset.roleIds || [HELPER_ROLE_ID];

        const ign = interaction.fields.getTextInputValue('ign');
        const description = interaction.fields.getTextInputValue('description');

        let serverName = 'N/A';
        let room = 'N/A';
        let subject = 'N/A';

        if (ticketType === 'server_ticket') {
          subject = interaction.fields.getTextInputValue('subject');
        } else {
          serverName = interaction.fields.getTextInputValue('server');
          const rawMap = interaction.fields.getTextInputValue('map_name').trim();
          const cleanMap = rawMap.toLowerCase().replace(/[^a-z0-9]/g, '') || 'room';
          room = `/join ${cleanMap}`;
        }

        const cfg = guildSettings.get(interaction.guild.id) || {};
        const chName = `ticket-${ticketType}-${interaction.user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, '');

        const isServerTicket = ticketType === 'server_ticket';
        const permissionOverwrites = [
          { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
        ];

        if (isServerTicket) {
          permissionOverwrites.push({
            id: interaction.guild.id,
            deny: [PermissionsBitField.Flags.ViewChannel]
          });
        } else {
          permissionOverwrites.push({
            id: interaction.guild.id,
            allow: [PermissionsBitField.Flags.ViewChannel],
            deny: [PermissionsBitField.Flags.SendMessages]
          });
        }

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
          maxHelpers,
          customPoints,
          pingRoleIds,
          helpers: []
        };

        activeTickets.set(ticketChannel.id, newTicketData);

        const helperRolePing = pingRoleIds.length > 0 
          ? pingRoleIds.map(id => `<@&${id}>`).join(' ') 
          : '@Helper';
        
        const payload = buildTicketControlPayload(newTicketData);
        const mainMsg = await ticketChannel.send({ 
          content: `Hey ${interaction.user}! ${helperRolePing}`, 
          embeds: payload.embeds, 
          components: payload.components 
        });

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

    // 4. BUTTON ACTIONS
    if (interaction.isButton()) {
      const ticketData = activeTickets.get(interaction.channel.id);
      const customId = interaction.customId;

      if (customId === 'btn_change_server') {
        if (!ticketData) return interaction.reply({ content: '❌ Ticket not found.', ephemeral: true });
        if (interaction.user.id !== ticketData.requesterId && !interaction.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
          return interaction.reply({ content: '❌ Only the requester can change the server.', ephemeral: true });
        }

        const modal = new ModalBuilder()
          .setCustomId('modal_edit_server')
          .setTitle('Change Server')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('new_server')
                .setLabel('New Server Name')
                .setValue(ticketData.server)
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
            )
          );

        return await interaction.showModal(modal);
      }

      if (customId === 'btn_change_bosses') {
        if (!ticketData) return interaction.reply({ content: '❌ Ticket not found.', ephemeral: true });
        if (interaction.user.id !== ticketData.requesterId && !interaction.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
          return interaction.reply({ content: '❌ Only the requester can edit boss details.', ephemeral: true });
        }

        const modal = new ModalBuilder()
          .setCustomId('modal_edit_bosses')
          .setTitle('Change Bosses / Details')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('new_details')
                .setLabel('New Bosses or Details')
                .setValue(ticketData.description)
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
            )
          );

        return await interaction.showModal(modal);
      }

      if (customId === 'btn_location') {
        if (!ticketData) return interaction.reply({ content: '❌ Ticket not found.', ephemeral: true });

        const isRequester = interaction.user.id === ticketData.requesterId;
        const isHelper = ticketData.helpers.includes(interaction.user.id);
        const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.ManageChannels);

        if (!isRequester && !isHelper && !isAdmin) {
          return interaction.reply({
            content: '🔒 **Access Denied:** Click **Claim ticket** first to view the room code.',
            ephemeral: true
          });
        }

        return interaction.reply({
          content: `📍 **Room Details:**\n• **IGN:** \`${ticketData.ign}\`\n• **Server:** \`${ticketData.server}\`\n• **Command:** \`${ticketData.room}\``,
          ephemeral: true
        });
      }

      if (customId === 'btn_claim') {
        if (!ticketData) return interaction.reply({ content: '❌ Ticket not found.', ephemeral: true });

        if (interaction.user.id === ticketData.requesterId) {
          return interaction.reply({ 
            content: '⚠️ You are the requester of this ticket!', 
            ephemeral: true 
          });
        }

        if (ticketData.helpers.includes(interaction.user.id)) {
          return interaction.reply({ content: '⚠️ You already claimed this ticket!', ephemeral: true });
        }

        const activeChannelId = isHelperInActiveTicket(interaction.user.id);
        if (activeChannelId) {
          return interaction.reply({
            content: `⚠️ You are already in an active ticket (<#${activeChannelId}>)!`,
            ephemeral: true
          });
        }

        const maxAllowed = ticketData.maxHelpers || 6;
        if (ticketData.helpers.length >= maxAllowed) {
          return interaction.reply({ content: `⚠️ Helper spots are full (${maxAllowed}/${maxAllowed})!`, ephemeral: true });
        }

        ticketData.helpers.push(interaction.user.id);
        activeTickets.set(interaction.channel.id, ticketData);

        const spotsLeft = maxAllowed - ticketData.helpers.length;

        await interaction.channel.send({
          content: `✅ ${interaction.user} joined the helper team! (${spotsLeft} spots left)`
        });

        await sendTicketLog(
          interaction.guild,
          '🤝 Ticket Claimed',
          `**Helper:** ${interaction.user} (\`${interaction.user.id}\`)\n**Ticket:** ${interaction.channel}\n**Requester:** <@${ticketData.requesterId}>`,
          '#f1c40f'
        );

        await interaction.reply({
          content: `✅ **Claimed!** Room Code:\n📍 **Server:** \`${ticketData.server}\`\n📍 **Command:** \`${ticketData.room}\``,
          ephemeral: true
        });

        return updateTicketEmbed(interaction.channel, ticketData);
      }

      if (customId === 'btn_leave') {
        if (!ticketData) return interaction.reply({ content: '❌ Ticket not found.', ephemeral: true });

        if (!ticketData.helpers.includes(interaction.user.id)) {
          return interaction.reply({ content: '⚠️ You are not on this ticket.', ephemeral: true });
        }

        ticketData.helpers = ticketData.helpers.filter(id => id !== interaction.user.id);
        activeTickets.set(interaction.channel.id, ticketData);

        await interaction.reply({ content: `🚪 ${interaction.user} stepped down from helping.` });
        return updateTicketEmbed(interaction.channel, ticketData);
      }

      if (customId === 'btn_pinghelpers') {
        const pingRoleIds = ticketData?.pingRoleIds || [];
        const helperRolePing = pingRoleIds.length > 0 ? pingRoleIds.map(id => `<@&${id}>`).join(' ') : '@Helper';
        return interaction.reply({ content: `🔔 ${helperRolePing} assistance requested!` });
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

        await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: false });

        if (ticketData) {
          const currentReqs = userRequestCounts.get(ticketData.requesterId) || 0;
          userRequestCounts.set(ticketData.requesterId, currentReqs + 1);
        }

        let awardedText = '';
        if (ticketData && ticketData.helpers.length > 0) {
          const pointsToAward = getPointsForTicket(ticketData);

          for (const hId of ticketData.helpers) {
            const current = helperPoints.get(hId) || 0;
            const updated = current + pointsToAward;
            helperPoints.set(hId, updated);

            await checkAndAssignHelperRoles(interaction.guild, hId, updated);
          }

          const helperMentions = ticketData.helpers.map(id => `<@${id}>`).join(', ');
          awardedText = `\n🏆 **+${pointsToAward} pts** awarded to: ${helperMentions}`;
        } else {
          awardedText = '\n⚠️ No helpers joined.';
        }

        const embed = new EmbedBuilder()
          .setTitle('🔒 Ticket Completed')
          .setDescription(`Resolved successfully!${awardedText}\n\n*Deleting channel in 5 seconds...*`)
          .setColor('#2ecc71')
          .setTimestamp();

        const helperMentionsLog = ticketData && ticketData.helpers.length > 0
          ? ticketData.helpers.map(id => `<@${id}>`).join(', ')
          : 'None';

        await sendTicketLog(
          interaction.guild,
          '✅ Ticket Completed',
          `**Requester:** <@${ticketData.requesterId}>\n**Helpers:** ${helperMentionsLog}\n**Points Awarded:** \`${getPointsForTicket(ticketData)}\`\n**Channel:** \`#${interaction.channel.name}\``,
          '#2ecc71'
        );

        await interaction.editReply({ embeds: [embed] });

        activeTickets.delete(interaction.channel.id);
        setTimeout(() => {
          interaction.channel.delete().catch(() => {});
        }, 5000);

        return;
      }
    }

    // 5. COMMANDS
    if (interaction.isChatInputCommand()) {
      const { commandName, options } = interaction;

      if (commandName === 'setup-ticket-hub') {
        await interaction.deferReply({ ephemeral: true });
        const channel = options.getChannel('channel');
        const title = options.getString('title');
        const desc = options.getString('description').replace(/\\n/g, '\n');
        const category = options.getChannel('category');
        const logChannel = options.getChannel('log_channel');

        const cfg = guildSettings.get(interaction.guild.id) || {};
        if (category) cfg.ticketCategory = category.id;
        if (logChannel) cfg.logChannelId = logChannel.id;
        guildSettings.set(interaction.guild.id, cfg);

        const embed = new EmbedBuilder()
          .setTitle(title)
          .setDescription(desc)
          .setColor('#2b2d31');

        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId('select_ticket_cat')
          .setPlaceholder('Select a ticket type...')
          .addOptions(
            Object.entries(TICKET_PRESETS).map(([key, item]) => 
              new StringSelectMenuOptionBuilder()
                .setLabel(item.label)
                .setValue(key)
                .setEmoji(item.emoji)
            )
          );

        const row = new ActionRowBuilder().addComponents(selectMenu);

        await channel.send({ embeds: [embed], components: [row] });
        return await interaction.editReply(`✅ Ticket Panel posted to ${channel}!`);
      }

      if (commandName === 'embed') {
        await interaction.deferReply({ ephemeral: true });

        const channel = options.getChannel('channel');
        const title = options.getString('title');
        const desc = options.getString('description').replace(/\\n/g, '\n');
        const rawOuterMessage = options.getString('outer_message');
        const color = options.getString('color') || '#2b2d31';
        const image = options.getString('image_url');
        const thumbnail = options.getString('thumbnail_url');
        const footer = options.getString('footer');

        try {
          const customEmbed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(desc)
            .setColor(color)
            .setTimestamp();

          if (image) customEmbed.setImage(image);
          if (thumbnail) customEmbed.setThumbnail(thumbnail);
          if (footer) customEmbed.setFooter({ text: footer });

          const messageOptions = { embeds: [customEmbed] };
          if (rawOuterMessage) {
            messageOptions.content = rawOuterMessage.replace(/\\n/g, '\n');
          }

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

        if (statusUpdates.length === 0) {
          return await interaction.editReply('⚠️ No channels updated.');
        }

        return await interaction.editReply(`✅ **Configured Channels:**\n${statusUpdates.join('\n')}`);
      }

      if (commandName === 'set-welcome-embed') {
        const title = options.getString('title');
        const desc = options.getString('description');
        const outerMessage = options.getString('message');
        const footer = options.getString('footer');
        const verifyChannel = options.getChannel('verify_channel');
        const image = options.getString('image_url');
        const thumbnail = options.getString('thumbnail_url');
        const color = options.getString('color');

        const cfg = guildSettings.get(interaction.guild.id) || {};
        cfg.welcomeEmbed = {
          title,
          description: desc,
          outerMessage,
          footer,
          verifyChannelId: verifyChannel ? verifyChannel.id : DEFAULT_VERIFY_CHANNEL_ID,
          image,
          thumbnail,
          color
        };
        guildSettings.set(interaction.guild.id, cfg);

        return await interaction.reply({
          content: '✅ **Welcome embed settings updated!**',
          ephemeral: true
        });
      }

      if (commandName === 'set-boost-embed') {
        const title = options.getString('title');
        const desc = options.getString('description');
        const outerMessage = options.getString('message');
        const footer = options.getString('footer');
        const image = options.getString('image_url');
        const thumbnail = options.getString('thumbnail_url');
        const color = options.getString('color');

        const cfg = guildSettings.get(interaction.guild.id) || {};
        cfg.boostEmbed = { title, description: desc, outerMessage, footer, image, thumbnail, color };
        guildSettings.set(interaction.guild.id, cfg);

        return await interaction.reply({
          content: '✅ **Server boost embed settings updated!**',
          ephemeral: true
        });
      }

      if (commandName === 'leaderboard') {
        const sortedHelpers = [...helperPoints.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
        const sortedRequesters = [...userRequestCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);

        const helpersStr = sortedHelpers.length > 0
          ? sortedHelpers.map(([id, pts], i) => `**${i + 1}.** <@${id}> — \`${pts} pts\``).join('\n')
          : 'No helper data yet';

        const requestersStr = sortedRequesters.length > 0
          ? sortedRequesters.map(([id, reqs], i) => `**${i + 1}.** <@${id}> — \`${reqs} tickets\``).join('\n')
          : 'No request data yet';

        const lbEmbed = new EmbedBuilder()
          .setTitle('📊 Server Activity Leaderboard (Top 20)')
          .addFields(
            { name: '🏆 Top Helpers', value: helpersStr, inline: true },
            { name: '📩 Top Requesters', value: requestersStr, inline: true }
          )
          .setColor('#2b2d31')
          .setTimestamp();

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
          return await interaction.reply({
            content: `✅ Role ${role} set for **${requiredPts} pts**.`,
            ephemeral: true
          });
        }

        if (sub === 'list') {
          if (roleRewards.size === 0) {
            return await interaction.reply({ content: '⚙️ No role rewards set.', ephemeral: true });
          }

          const sorted = [...roleRewards.entries()].sort((a, b) => a[0] - b[0]);
          const rewardList = sorted.map(([pts, roleId]) => `• **${pts} Pts** -> <@&${roleId}>`).join('\n');

          const embed = new EmbedBuilder()
            .setTitle('🏅 Role Rewards')
            .setDescription(rewardList)
            .setColor('#2b2d31');

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
