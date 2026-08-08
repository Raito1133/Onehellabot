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
const GUILD_ID = '1371775026264670228';
const ULTRA_HELPER_ROLE_ID = '1529499021884919858';
const HELPER_ROLE_ID = '1529499059596038285';
const SUPPORT_ROLE_ID = '1529498802149392614';
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
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildMembers, GatewayIntentBits.MessageContent],
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
const userRejectionReasons = new Map(); // Ito ang nagho-hold ng rejection status
const activeGiveaways = new Map();
const snipeCache = new Map();

let ticketCounter = 0;
const globalStats = { totalTicketsCompleted: 0, totalPointsGiven: 0, totalBossesSlain: 0 };

client.on(Events.MessageDelete, (message) => {
  if (!message.guild || message.guild.id !== GUILD_ID || message.author?.bot) return;
  snipeCache.set(message.channel.id, {
    content: message.content || '[No text content]',
    author: message.author,
    image: message.attachments.first()?.proxyURL || null,
    createdAt: message.createdAt
  });
});

const TICKET_PRESETS = {
  farming: { label: 'Farming Assistance', max: 6, points: 3, pingRoleIds: [HELPER_ROLE_ID], bannerUrl: 'https://media.discordapp.net/attachments/1258198097293611131/1534961239598432368/6.png?ex=6a76078d&is=6a74b60d&hm=8f0ef43ee15c9a77eb4db7a93f72a13ed220524e73fa9bd105894b9e47e40208&=&format=webp&quality=lossless&width=2048&height=1024', accentColor: 0xFDE37C },
  ultra_weeklies: { label: 'Ultra Weeklies', max: 3, points: 3, pingRoleIds: [ULTRA_HELPER_ROLE_ID], bannerUrl: 'https://media.discordapp.net/attachments/1258198097293611131/1534961237132050705/1.png?ex=6a76078d&is=6a74b60d&hm=c653e9de44bf6517cf997847ec6dbc9987387aed4dea2ea0823059f54f83a956&=&format=webp&quality=lossless&width=2048&height=1024', accentColor: 0xFCDD62 },
  seven_man_dailies: { label: '7-Man Dailies', max: 6, points: 2, pingRoleIds: [ULTRA_HELPER_ROLE_ID, HELPER_ROLE_ID], bannerUrl: 'https://media.discordapp.net/attachments/1258198097293611131/1534961238180626622/3.png?ex=6a76078d&is=6a74b60d&hm=5060584863f037151aada431ad3fba73ab18e43cf5ed3782182f5d9615b7de3d&=&format=webp&quality=lossless&width=2048&height=1024', accentColor: 0xFCD748 },
  ultra_dailies: { label: 'Ultra Dailies', max: 3, points: 2, pingRoleIds: [ULTRA_HELPER_ROLE_ID], bannerUrl: 'https://media.discordapp.net/attachments/1258198097293611131/1534961237597753374/2.png?ex=6a76078d&is=6a74b60d&hm=647568baa92f754e4dc7e20d48763f641a55322a976cd0d8b678093beab79343&=&format=webp&quality=lossless&width=2048&height=1024', accentColor: 0xFBD12D },
  server_ticket: { label: 'Server Ticket / Support', max: 2, points: 0, pingRoleIds: [SUPPORT_ROLE_ID], bannerUrl: 'https://media.discordapp.net/attachments/1258198097293611131/1534961238772154518/4.png?ex=6a76078d&is=6a74b60d&hm=93e443b70e802d77bfe911218676839568cfa0a0361724e865be80233fdd415c&=&format=webp&quality=lossless&width=2048&height=1024', accentColor: 0xFBCC13 },
  boss_help: { label: 'General Boss Help', max: 6, points: 2, pingRoleIds: [HELPER_ROLE_ID], bannerUrl: STANDARD_BANNER_URL, accentColor: 0x856A02 },
  spamming: { label: 'Spamming', max: 6, points: 1, pingRoleIds: [HELPER_ROLE_ID], bannerUrl: 'https://media.discordapp.net/attachments/1258198097293611131/1534961239157899527/5.png?ex=6a76078d&is=6a74b60d&hm=b94b6cf605487010f0cd4f6f14a7e37603127fc8fdd6f333934947aab42f255f&=&format=webp&quality=lossless&width=2048&height=1024', accentColor: 0xEFBF04 }
};

// --- BUNCH OF UTILITY FUNCTIONS (UPDATE STATS, TICKET LOGS, ETC) ---
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
      .setDescription(`🎫 **\`${globalStats.totalTicketsCompleted}\`** tickets completed.\n🏅 **\`${globalStats.totalPointsGiven}\`** points given out.\n\nTicket status has been updated everytime you make one!`)
      .setColor('#3498db')
      .setTimestamp();
    await msg.edit({ embeds: [statsEmbed] });
  } catch (err) { console.error(err); }
}

async function sendTicketLog(guild, title, description, color = '#3498db', fields = []) {
  try {
    const cfg = guildSettings.get(guild.id) || {};
    if (!cfg.logChannelId) return;
    const logChannel = guild.channels.cache.get(cfg.logChannelId);
    if (!logChannel) return;
    const logEmbed = new EmbedBuilder().setTitle(title).setDescription(description).addFields(fields).setColor(color).setTimestamp();
    await logChannel.send({ embeds: [logEmbed] });
  } catch (err) { console.error(err); }
}

function parseVariables(text, member, guild) {
  if (!text) return '';
  return text.replace(/{user}/g, `<@${member.id}>`).replace(/{username}/g, member.user.username).replace(/{server}/g, guild.name).replace(/{membercount}/g, guild.memberCount);
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
    .addChannelOption(opt => opt.setName('category').setDescription('Ticket Channel Category').setRequired(false))
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
    .addStringOption(opt => opt.setName('footer_banner_url').setDescription('Bottom footer banner image URL (Optional)').setRequired(false)),

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

  new SlashCommandBuilder()
    .setName('setup-boost')
    .setDescription('Configure Server Boost announcement')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
    .addChannelOption(opt => opt.setName('channel').setDescription('Boost announcement channel').setRequired(true))
    .addStringOption(opt => opt.setName('title').setDescription('Boost message title').setRequired(true))
    .addStringOption(opt => opt.setName('description').setDescription('Boost description (supports variables)').setRequired(true))
    .addStringOption(opt => opt.setName('banner_url').setDescription('Banner image URL').setRequired(false)),

  new SlashCommandBuilder()
    .setName('setup-welcome')
    .setDescription('Configure Server Welcome announcement')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
    .addChannelOption(opt => opt.setName('channel').setDescription('Welcome announcement channel').setRequired(true))
    .addStringOption(opt => opt.setName('outer_message').setDescription('Message outside container').setRequired(true))
    .addStringOption(opt => opt.setName('title').setDescription('Welcome card title').setRequired(true))
    .addStringOption(opt => opt.setName('description').setDescription('Welcome description (supports variables)').setRequired(true))
    .addStringOption(opt => opt.setName('banner_url').setDescription('Banner image URL').setRequired(false)),

  new SlashCommandBuilder()
    .setName('viewpoints')
    .setDescription('Check your points or another user points')
    .addUserOption(opt => opt.setName('user').setDescription('User to check points for (Optional)').setRequired(false)),

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
    .addStringOption(opt => opt.setDescription('Panel description').setRequired(true))
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

// --- BOT INITIALIZATION ---
client.once(Events.ClientReady, async () => {
  console.log(`Logged in as ${client.user.tag}`);
  await registerCommands();
});

// --- INTERACTION LISTENER ---
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.guild || interaction.guild.id !== GUILD_ID) return;

  try {
    // --- GIVEAWAY ENTER BUTTON ---
    if (interaction.isButton() && interaction.customId.startsWith('gw_enter_')) {
      const gwId = interaction.customId.replace('gw_enter_', '');
      const giveaway = activeGiveaways.get(gwId);
      if (!giveaway || giveaway.ended) return interaction.reply({ content: '❌ Giveaway ended.', ephemeral: true });
      if (giveaway.entries.has(interaction.user.id)) return interaction.reply({ content: '⚠️ Already entered.', ephemeral: true });
      giveaway.entries.add(interaction.user.id);
      return interaction.reply({ content: '🎉 Entered!', ephemeral: true });
    }

    // --- VERIFICATION BUTTON TRIGGERS ---
    if (interaction.isButton() && interaction.customId.startsWith('btn_verify_')) {
      const roleId = interaction.customId.split('_')[3];
      if (userRejectionReasons.has(interaction.user.id)) {
        return interaction.reply({ content: `❌ **Rejected:** ${userRejectionReasons.get(interaction.user.id)}`, ephemeral: true });
      }
      const type = interaction.customId.includes('guest') ? 'GUEST' : 'MEMBER';
      const modal = new ModalBuilder()
        .setCustomId(`modal_verify_${type.toLowerCase()}_${roleId}`)
        .setTitle(`Verify as ${type}`);
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('ign').setLabel('AQW IGN').setStyle(TextInputStyle.Short).setRequired(true)),
        type === 'GUEST' ? new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('guild_name').setLabel('Guild Name').setStyle(TextInputStyle.Short).setRequired(true)) : null,
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('invited_by').setLabel('Who invited you?').setStyle(TextInputStyle.Short).setRequired(type === 'MEMBER'))
      ).components = modal.components.filter(c => c);
      return await interaction.showModal(modal);
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_verify_')) {
      await interaction.deferReply({ ephemeral: true });
      const parts = interaction.customId.split('_');
      const type = parts[2].toUpperCase();
      const roleId = parts[3];
      const ign = interaction.fields.getTextInputValue('ign');
      const invitedBy = interaction.fields.getTextInputValue('invited_by') || 'None';
      const guildName = type === 'GUEST' ? interaction.fields.getTextInputValue('guild_name') : 'Main Guild';

      const logChannelId = guildSettings.get(interaction.guild.id)?.verifyLogChannelId;
      const logChannel = interaction.guild.channels.cache.get(logChannelId);
      if (!logChannel) return interaction.editReply('❌ Log channel not set.');

      const requestId = `ver_${interaction.user.id}_${Date.now()}`;
      pendingVerifications.set(requestId, { userId: interaction.user.id, type, ign, roleId, invitedBy, guildName });

      const logContainer = {
        type: 17,
        accent_color: type === 'GUEST' ? 0x3498db : 0x2ecc71,
        components: [
          { type: 10, content: `🛡️ **New ${type} Verification**\nUser: <@${interaction.user.id}>\nIGN: [${ign}](https://account.aq.com/CharPage?id=${ign})\nInvited By: ${invitedBy}` },
          { type: 1, components: [
            new ButtonBuilder().setCustomId(`ver_approve_${requestId}`).setLabel('Approve').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`ver_reject_${requestId}`).setLabel('Reject').setStyle(ButtonStyle.Danger)
          ]}
        ]
      };
      await logChannel.send({ components: [logContainer], flags: MessageFlags.IsComponentsV2 });
      await interaction.editReply('✅ Submitted!');
    }

    if (interaction.isButton() && interaction.customId.startsWith('ver_approve_')) {
      const requestId = interaction.customId.replace('ver_approve_', '');
      const data = pendingVerifications.get(requestId);
      const member = await interaction.guild.members.fetch(data.userId);
      await member.roles.add(data.roleId);
      await member.setNickname(data.ign);
      userRejectionReasons.delete(data.userId);
      pendingVerifications.delete(requestId);
      await interaction.update({ content: '✅ Approved!', components: [] });
    }

    if (interaction.isButton() && interaction.customId.startsWith('ver_reject_')) {
      const requestId = interaction.customId.replace('ver_reject_', '');
      const modal = new ModalBuilder().setCustomId(`modal_reject_${requestId}`).setTitle('Rejection Reason')
        .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason').setLabel('Reason').setStyle(TextInputStyle.Paragraph).setRequired(true)));
      await interaction.showModal(modal);
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_reject_')) {
      await interaction.deferUpdate();
      const requestId = interaction.customId.replace('modal_reject_', '');
      const reason = interaction.fields.getTextInputValue('reason');
      const data = pendingVerifications.get(requestId);
      userRejectionReasons.set(data.userId, reason);
      pendingVerifications.delete(requestId);
      await interaction.editReply({ content: '❌ Rejected.', components: [] });
    }

    // --- TICKET SYSTEM ---
    if (interaction.isButton() && interaction.customId === 'btn_open_ticket_menu') {
      const menu = new StringSelectMenuBuilder().setCustomId('select_ticket_cat').setPlaceholder('Select category...').addOptions(
        Object.entries(TICKET_PRESETS).map(([k, v]) => new StringSelectMenuOptionBuilder().setLabel(v.label).setValue(k))
      );
      await interaction.reply({ components: [new ActionRowBuilder().addComponents(menu)], ephemeral: true });
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'select_ticket_cat') {
      const key = interaction.values[0];
      const bossData = {
        'ultra_weeklies': ['Champion Drakath', 'Ultra Dage', 'Ultra Darkon', 'Ultra Drago', 'Ultra Gramiel', 'Ultra Speaker'],
        'ultra_dailies': ['Ultra Ezrajal', 'Ultra Warden', 'Ultra Engineer', 'Ultra Tyndarius', 'Ultra Kala', 'Ultra Iara'],
        'seven_man_dailies': ['Kathool Depths', 'Originul', 'Astral Shrine', 'Lavarock Shore']
      };

      if (bossData[key]) {
        const menu = new StringSelectMenuBuilder().setCustomId(`select_bosses_${key}`).setPlaceholder('Select monsters...').setMinValues(1).setMaxValues(bossData[key].length).addOptions(
          bossData[key].map(b => new StringSelectMenuOptionBuilder().setLabel(b).setValue(b))
        );
        return await interaction.update({ content: '⚔️ Select monsters:', components: [new ActionRowBuilder().addComponents(menu)] });
      }
      // ... (Add server selection logic here as before)
    }

    // --- OTHER LOGIC (TICKETS, MODERATION, ETC) ---
    // ... (Keep existing ticket/mod logic) ...

  } catch (err) { console.error(err); }
});

async function endGiveaway(guild, gwId) { /* ... */ }
client.login(process.env.DISCORD_TOKEN);
