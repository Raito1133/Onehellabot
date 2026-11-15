/* =====================================================================
   ALL-IN-ONE SERVER ADMIN BOT  (discord.js v14, Node 18+)
   ENV:  DISCORD_TOKEN   (required)
         BOT_OWNER_IDS   (optional, comma separated user IDs for /bot commands)
         GUILD_ID        (optional, registers commands instantly in one server)
         SUPPORT_URL     (optional, used by /support)
         DATA_FILE       (optional, default ./data.json)
   Prefix commands: !stick  (sticky message)   !unstick
   ===================================================================== */
const {
  Client, GatewayIntentBits, Partials, Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
  PermissionFlagsBits, REST, Routes, SlashCommandBuilder, ChannelType, AttachmentBuilder,
  AuditLogEvent, OverwriteType, MessageFlags
} = require('discord.js');
const http = require('http');
const fs = require('fs');
const util = require('util');

// --- CONFIGURATION ---
const PREFIX = '!';
const GUILD_ID = process.env.GUILD_ID || null;
const OWNER_IDS = (process.env.BOT_OWNER_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
const SUPPORT_URL = process.env.SUPPORT_URL || 'https://discord.com';
const DATA_FILE = process.env.DATA_FILE || './data.json';
const START = Date.now();
const EPH = MessageFlags.Ephemeral;
const P = PermissionFlagsBits;
const COLORS = { main: 0x5865F2, ok: 0x2ecc71, err: 0xe74c3c, warn: 0xf1c40f };
const TEXTISH = [ChannelType.GuildText, ChannelType.GuildAnnouncement];
const VOICEISH = [ChannelType.GuildVoice, ChannelType.GuildStageVoice];
const LOG_CATS = ['member', 'message', 'channel', 'role', 'voice', 'moderation', 'server', 'bot', 'webhook', 'security'];
const DEFAULT_PRESENCE = { status: 'dnd', activities: [{ name: 'Daghanag activities', type: 5 }] }; // status retained

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildWebhooks, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions, GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel, Partials.Message, Partials.Reaction, Partials.User]
});

// --- PERSISTENT STORAGE (JSON file) ---
let db = { global: {}, guilds: {} };
try { if (fs.existsSync(DATA_FILE)) db = Object.assign(db, JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))); } catch (e) { console.error('Failed to load data:', e); }
db.global = Object.assign({ blacklist: { users: [], guilds: [] }, maintenance: false, presence: null, config: {}, reminders: [] }, db.global);
db.guilds = db.guilds || {};
let dirty = false;
const save = () => { dirty = true; };
setInterval(() => { if (!dirty) return; dirty = false; fs.writeFile(DATA_FILE, JSON.stringify(db), err => err && console.error(err)); }, 15000);

const defaults = () => ({
  settings: {}, welcome: {}, goodbye: {}, logs: { enabled: true, disabled: [] },
  automod: { enabled: false, rules: {}, badwords: [], blacklistWords: [], blacklistUsers: [], whitelistRoles: [], whitelistUsers: [] },
  security: { antiRaid: false, raidThreshold: 5, raidAction: 'lockdown', raidMode: false, minAccountDays: 0, accountAction: 'kick', antiBot: false, antiNuke: false, quarantineRole: null, quarantined: {}, trusted: [], verifyMode: null, verifyRole: null },
  warnings: {}, warnSeq: 0, cases: [], tempbans: [],
  xp: {}, levelRoles: {}, level: { enabled: true, multiplier: 1, announce: true, channel: null },
  tickets: { counter: 0, open: {}, ratings: [], supportRole: null, category: null, logChannel: null, cooldowns: {} },
  panels: {}, giveaways: {}, giveawayHistory: [],
  apps: { counter: 0, questions: {}, roles: {}, list: {}, reviewChannel: null },
  staff: {}, afk: {}, suggestions: {}, suggestSeq: 0, stickies: {}, backup: null, rules: '', mutedRole: null, activity: {},
  tempVoice: { lobby: null, category: null, channels: {} },
  fish: null, uwu: {}, schedules: [], schedSeq: 0
});
const G = id => {
  if (!db.guilds[id]) db.guilds[id] = defaults();
  else { const d = defaults(); for (const k of Object.keys(d)) if (db.guilds[id][k] === undefined) db.guilds[id][k] = d[k]; }
  return db.guilds[id];
};

// --- HELPERS ---
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ts = ms => Math.floor(ms / 1000);
const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const trunc = (s, n = 1000) => (s && s.length > n ? s.slice(0, n - 1) + '…' : s || '');
const nl = s => (s || '').replace(/\\n/g, '\n');
const hexColor = (s, d = COLORS.main) => { const m = /^#?([0-9a-f]{6})$/i.exec(s || ''); return m ? parseInt(m[1], 16) : d; };
const emb = (title, desc, color = COLORS.main) => {
  const e = new EmbedBuilder().setColor(color).setTimestamp();
  if (title) e.setTitle(title);
  if (desc) e.setDescription(String(desc).slice(0, 4000));
  return e;
};
const errors = [];
const noteError = e => { console.error(e); errors.push(`[${new Date().toISOString()}] ${e?.stack || e}`); if (errors.length > 20) errors.shift(); };
const isOwner = id => OWNER_IDS.includes(id);
const isAdmin = m => m.permissions.has(P.Administrator) || m.id === m.guild.ownerId || isOwner(m.id);
const isStaff = m => {
  const s = G(m.guild.id).settings;
  return isAdmin(m) || m.permissions.has(P.ManageGuild) || [s.adminRole, s.modRole, s.staffRole].some(r => r && m.roles.cache.has(r));
};
const parseDuration = s => {
  const m = String(s || '').trim().toLowerCase().match(/^(\d+)\s*(s|m|h|d|w)?$/);
  if (!m) return null;
  return +m[1] * { s: 1e3, m: 6e4, h: 36e5, d: 864e5, w: 6048e5 }[m[2] || 'm'];
};
const fmtDur = ms => {
  const d = Math.floor(ms / 864e5), h = Math.floor(ms % 864e5 / 36e5), m = Math.floor(ms % 36e5 / 6e4), s = Math.floor(ms % 6e4 / 1e3);
  return [d && `${d}d`, h && `${h}h`, m && `${m}m`, (s || (!d && !h && !m)) && `${s}s`].filter(Boolean).join(' ');
};
const send = (i, p, eph = true) => {
  if (typeof p === 'string') p = { content: p };
  if (i.deferred || i.replied) return i.editReply(p);
  return i.reply({ ...p, flags: eph ? EPH : undefined });
};
const defer = (i, eph = true) => (i.deferred || i.replied) ? null : i.deferReply({ flags: eph ? EPH : undefined });
const vars = (text, m) => (text || '')
  .replace(/{user}/g, `<@${m.id}>`).replace(/{username}/g, m.user.username).replace(/{tag}/g, m.user.tag)
  .replace(/{server}/g, m.guild.name).replace(/{membercount}/g, m.guild.memberCount);

async function logEvent(guild, cat, title, desc, color = COLORS.main, fields = []) {
  try {
    const g = G(guild.id);
    if (!g.logs.enabled || g.logs.disabled.includes(cat)) return;
    const ch = g.settings.logChannel && guild.channels.cache.get(g.settings.logChannel);
    if (!ch) return;
    const e = emb(title, desc, color);
    if (fields.length) e.addFields(fields);
    await ch.send({ embeds: [e], allowedMentions: { parse: [] } });
  } catch (e) { /* ignore */ }
}
function addCase(guild, type, target, mod, reason, extra = {}) {
  const g = G(guild.id);
  const c = { id: g.cases.length + 1, type, target, mod, reason: reason || 'No reason provided', time: Date.now(), ...extra };
  g.cases.push(c); save();
  logEvent(guild, 'moderation', `🛡️ Case #${c.id} — ${type}`, `**Target:** <@${target}> (\`${target}\`)\n**Moderator:** <@${mod}>\n**Reason:** ${c.reason}`, COLORS.warn);
  return c;
}
async function notify(user, guild, action, reason) {
  await user.send({ embeds: [emb(`You were ${action} in ${guild.name}`, `**Reason:** ${reason}`, COLORS.err)] }).catch(() => {});
}
function canAct(i, t) {
  if (t.id === i.user.id) return 'You cannot do that to yourself.';
  if (t.id === i.guild.ownerId) return 'You cannot target the server owner.';
  if (t.id === client.user.id) return 'I cannot target myself.';
  if (i.member.id !== i.guild.ownerId && t.roles.highest.position >= i.member.roles.highest.position) return 'That member has an equal or higher role than you.';
  return null;
}
function roleBlock(i, role) {
  if (role.managed) return 'That role is managed by an integration.';
  if (role.id === i.guild.id) return 'Invalid role.';
  if (role.position >= i.guild.members.me.roles.highest.position) return 'That role is higher than (or equal to) my highest role.';
  if (i.member.id !== i.guild.ownerId && role.position >= i.member.roles.highest.position) return 'That role is higher than (or equal to) your highest role.';
  return null;
}
async function ensureMuteRole(guild) {
  const g = G(guild.id);
  let role = (g.mutedRole && guild.roles.cache.get(g.mutedRole)) || guild.roles.cache.find(r => r.name === 'Muted');
  if (!role) {
    role = await guild.roles.create({ name: 'Muted', color: 0x607d8b, permissions: [], reason: 'Mute role' });
    for (const ch of guild.channels.cache.values()) {
      if (ch.permissionOverwrites) await ch.permissionOverwrites.edit(role, { SendMessages: false, AddReactions: false, Speak: false, SendMessagesInThreads: false, CreatePublicThreads: false }, { reason: 'Mute role' }).catch(() => {});
    }
  }
  g.mutedRole = role.id; save();
  return role;
}
async function setServerLock(guild, lock, reason) {
  let n = 0;
  for (const ch of guild.channels.cache.values()) {
    if ([ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum].includes(ch.type)) {
      try { await ch.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: lock ? false : null }, { reason }); n++; } catch (e) { /* skip */ }
    }
  }
  return n;
}
async function buildTranscript(channel) {
  let all = [], last;
  for (let n = 0; n < 10; n++) {
    const batch = await channel.messages.fetch({ limit: 100, ...(last && { before: last }) });
    if (!batch.size) break;
    all.push(...batch.values()); last = batch.last().id;
    if (batch.size < 100) break;
  }
  all.reverse();
  const lines = all.map(m => `[${new Date(m.createdTimestamp).toISOString()}] ${m.author.tag}: ${m.content}${m.attachments.size ? ' ' + [...m.attachments.values()].map(a => a.url).join(' ') : ''}${m.embeds.length && !m.content ? ' [embed]' : ''}`);
  return new AttachmentBuilder(Buffer.from(lines.join('\n') || '(empty)'), { name: `transcript-${channel.name}.txt` });
}

// --- COMMAND BUILDER HELPERS ---
const O = type => (n, d, r = false, extra = {}) => ({ type, n, d, r, ...extra });
const U = O('User'), S = O('String'), I = O('Integer'), C = O('Channel'), R = O('Role'), B = O('Boolean'), M = O('Mentionable'), A = O('Attachment'), N = O('Number');
const CT = (n, d, r = false) => C(n, d, r, { types: TEXTISH });
function applyOpts(b, opts) {
  for (const x of opts) {
    b[`add${x.type}Option`](o => {
      o.setName(x.n).setDescription(x.d).setRequired(!!x.r);
      if (x.choices) o.addChoices(...x.choices.map(c => typeof c === 'string' ? { name: c, value: c } : c));
      if (x.min != null) o.setMinValue(x.min);
      if (x.max != null) o.setMaxValue(x.max);
      if (x.types) o.addChannelTypes(...x.types);
      return o;
    });
  }
  return b;
}
const cmds = [];
const def = (name, desc, perm, opts = []) => {
  const b = new SlashCommandBuilder().setName(name).setDescription(desc);
  if (perm != null) b.setDefaultMemberPermissions(perm);
  applyOpts(b, opts); cmds.push(b);
};
const grp = (name, desc, perm, subs) => {
  const b = new SlashCommandBuilder().setName(name).setDescription(desc);
  if (perm != null) b.setDefaultMemberPermissions(perm);
  for (const [sn, sd, so = []] of subs) b.addSubcommand(s => applyOpts(s.setName(sn).setDescription(sd), so));
  cmds.push(b);
};

// =====================================================================
//  SLASH COMMAND DEFINITIONS
// =====================================================================
// 1. Server administration
def('serverinfo', 'Display complete server information');
def('servericon', 'Display or change the server icon', null, [S('url', 'Image URL to set as new icon'), A('image', 'Image file to set as new icon')]);
def('serverbanner', 'Display or change the server banner', null, [S('url', 'Image URL to set as new banner'), A('image', 'Image file to set as new banner')]);
def('servername', 'Change the server name', P.ManageGuild, [S('name', 'New server name', true)]);
def('serverrules', 'Set or display the server rules', null, [S('rules', 'New rules text (leave empty to display)')]);
def('serverstats', 'Show server statistics');
def('serverlock', 'Lock the entire server', P.Administrator, [S('reason', 'Reason')]);
def('serverunlock', 'Unlock the server', P.Administrator, [S('reason', 'Reason')]);
def('slowmode', 'Set channel slowmode', P.ManageChannels, [I('seconds', 'Seconds (0 disables)', true, { min: 0, max: 21600 }), CT('channel', 'Channel (default: current)')]);
def('announce', 'Send an announcement', P.ManageGuild, [S('message', 'Announcement text (use \\n for new lines)', true), CT('channel', 'Target channel'), S('title', 'Title'), R('ping_role', 'Role to ping'), B('ping_everyone', 'Ping @everyone'), B('staff_only', 'Send to the staff channel instead')]);
def('embed', 'Create a custom embed', P.ManageMessages, [S('title', 'Embed title', true), S('description', 'Embed description (use \\n for new lines)', true), CT('channel', 'Target channel'), S('color', 'Hex color e.g. #5865F2'), S('image', 'Image URL'), S('thumbnail', 'Thumbnail URL'), S('footer', 'Footer text')]);
def('purge', 'Delete multiple messages', P.ManageMessages, [I('amount', 'Number of messages (1-100)', true, { min: 1, max: 100 }), U('user', 'Only delete this user\'s messages')]);
def('nuke', 'Recreate a channel (wipes all messages)', P.Administrator, [B('confirm', 'Confirm you want to nuke the channel', true), CT('channel', 'Channel (default: current)')]);
def('backup', 'Create a server configuration backup', P.Administrator);
def('restore', 'Restore a server configuration backup', P.Administrator, [B('confirm', 'Confirm the restore', true), A('file', 'Backup file (default: last stored backup)')]);

// 2. Moderation
def('ban', 'Permanently ban a member', P.BanMembers, [U('user', 'User to ban', true), S('reason', 'Reason'), I('delete_days', 'Days of messages to delete (0-7)', false, { min: 0, max: 7 })]);
def('unban', 'Unban a user', P.BanMembers, [S('user_id', 'User ID to unban', true), S('reason', 'Reason')]);
def('tempban', 'Temporarily ban a member', P.BanMembers, [U('user', 'User to ban', true), S('duration', 'Duration e.g. 30m, 12h, 7d', true), S('reason', 'Reason')]);
def('kick', 'Remove a member from the server', P.KickMembers, [U('user', 'Member to kick', true), S('reason', 'Reason')]);
def('timeout', 'Temporarily restrict a member', P.ModerateMembers, [U('user', 'Member', true), S('duration', 'Duration e.g. 10m, 2h, 1d', true), S('reason', 'Reason')]);
def('untimeout', 'Remove a timeout', P.ModerateMembers, [U('user', 'Member', true), S('reason', 'Reason')]);
def('mute', 'Mute a member (Muted role)', P.ModerateMembers, [U('user', 'Member', true), S('reason', 'Reason')]);
def('unmute', 'Unmute a member', P.ModerateMembers, [U('user', 'Member', true), S('reason', 'Reason')]);
def('warn', 'Give a warning', P.ModerateMembers, [U('user', 'Member', true), S('reason', 'Reason', true)]);
def('warnings', 'View a member\'s warnings', P.ModerateMembers, [U('user', 'Member', true)]);
def('clearwarnings', 'Clear member warnings', P.ModerateMembers, [U('user', 'Member', true), I('id', 'Specific warning ID (default: all)')]);
def('softban', 'Ban and immediately unban (deletes recent messages)', P.BanMembers, [U('user', 'Member', true), S('reason', 'Reason')]);
def('massban', 'Ban multiple users by ID', P.BanMembers, [S('ids', 'User IDs separated by spaces/commas (max 25)', true), S('reason', 'Reason')]);
def('deafen', 'Deafen a member in voice', P.DeafenMembers, [U('user', 'Member', true), S('reason', 'Reason')]);
def('undeafen', 'Undeafen a member', P.DeafenMembers, [U('user', 'Member', true)]);
def('disconnect', 'Disconnect a member from voice', P.MoveMembers, [U('user', 'Member', true)]);
def('move', 'Move a member to another voice channel', P.MoveMembers, [U('user', 'Member', true), C('channel', 'Target voice channel', true, { types: VOICEISH })]);
def('modlogs', 'View moderation history of a user', P.ModerateMembers, [U('user', 'User', true)]);
def('case', 'View a specific moderation case', P.ModerateMembers, [I('number', 'Case number', true, { min: 1 })]);
def('clear', 'Clear messages', P.ManageMessages, [I('amount', 'Number of messages (1-100)', true, { min: 1, max: 100 }), U('user', 'Only delete this user\'s messages')]);

// 3. Roles
grp('role', 'Role management', P.ManageRoles, [
  ['add', 'Give a role to a member', [U('user', 'Member', true), R('role', 'Role', true)]],
  ['remove', 'Remove a role from a member', [U('user', 'Member', true), R('role', 'Role', true)]],
  ['create', 'Create a new role', [S('name', 'Role name', true), S('color', 'Hex color'), B('hoist', 'Display separately'), B('mentionable', 'Mentionable')]],
  ['delete', 'Delete a role', [R('role', 'Role', true)]],
  ['edit', 'Edit role settings', [R('role', 'Role', true), S('name', 'New name'), B('hoist', 'Display separately'), B('mentionable', 'Mentionable')]],
  ['color', 'Change role color', [R('role', 'Role', true), S('color', 'Hex color e.g. #ff0000', true)]],
  ['icon', 'Change role icon (needs boost level 2)', [R('role', 'Role', true), A('image', 'Icon image (omit to remove)')]],
  ['info', 'Display role information', [R('role', 'Role', true)]],
  ['members', 'List members with a role', [R('role', 'Role', true)]],
  ['all', 'Give a role to all members', [R('role', 'Role', true)]],
  ['bots', 'Give a role to all bots', [R('role', 'Role', true)]],
  ['humans', 'Give a role to all human members', [R('role', 'Role', true)]],
  ['bots-remove', 'Remove a role from all bots', [R('role', 'Role', true)]],
  ['humans-remove', 'Remove a role from all human members', [R('role', 'Role', true)]],
  ['transfer', 'Transfer a role to another member', [R('role', 'Role', true), U('from', 'Current holder', true), U('to', 'New holder', true)]]
]);

// 4. Member management
def('userinfo', 'View complete member information', null, [U('user', 'Member')]);
def('avatar', 'Display a member avatar', null, [U('user', 'Member')]);
def('banner', 'Display a member banner', null, [U('user', 'Member')]);
def('membercount', 'Show total members');
def('joinedat', 'Show when a member joined', null, [U('user', 'Member')]);
def('accountage', 'Show account age', null, [U('user', 'Member')]);
def('nickname', 'Change a member nickname', P.ManageNicknames, [U('user', 'Member', true), S('nickname', 'New nickname (empty resets)')]);
def('massnick', 'Change multiple member nicknames', P.Administrator, [S('format', 'Format e.g. [Member] {username}', true), R('role', 'Only members with this role'), B('reset', 'Reset nicknames instead')]);
def('profile', 'Display member profile', null, [U('user', 'Member')]);
def('inrole', 'List members in a specific role', null, [R('role', 'Role', true)]);
def('botinfo', 'Display bot information');
def('bots', 'List all bots in the server');

// 5. Channels
const CHTYPES = ['text', 'voice', 'announcement', 'forum', 'stage'];
grp('channel', 'Channel management', P.ManageChannels, [
  ['create', 'Create a channel', [S('name', 'Channel name', true), S('type', 'Channel type', false, { choices: CHTYPES }), C('category', 'Category', false, { types: [ChannelType.GuildCategory] }), S('topic', 'Topic')]],
  ['delete', 'Delete a channel', [C('channel', 'Channel', true)]],
  ['rename', 'Rename a channel', [S('name', 'New name', true), C('channel', 'Channel (default: current)')]],
  ['topic', 'Change channel description', [S('topic', 'New topic', true), CT('channel', 'Channel (default: current)')]],
  ['lock', 'Lock a channel', [CT('channel', 'Channel (default: current)'), R('role', 'Role (default: @everyone)')]],
  ['unlock', 'Unlock a channel', [CT('channel', 'Channel (default: current)'), R('role', 'Role (default: @everyone)')]],
  ['hide', 'Hide channel from a role/member', [M('target', 'Role or member', true), C('channel', 'Channel (default: current)')]],
  ['unhide', 'Make channel visible to a role/member', [M('target', 'Role or member', true), C('channel', 'Channel (default: current)')]],
  ['slowmode', 'Set channel slowmode', [I('seconds', 'Seconds', true, { min: 0, max: 21600 }), CT('channel', 'Channel')]],
  ['clone', 'Duplicate a channel', [C('channel', 'Channel (default: current)'), S('name', 'Name for the clone')]],
  ['info', 'Show channel information', [C('channel', 'Channel (default: current)')]],
  ['permissions', 'Edit channel permissions', [C('channel', 'Channel', true), M('target', 'Role or member', true),
    S('permission', 'Permission', true, { choices: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'AddReactions', 'AttachFiles', 'EmbedLinks', 'MentionEveryone', 'ManageMessages', 'Connect', 'Speak', 'UseExternalEmojis', 'CreatePublicThreads', 'ManageChannels'] }),
    S('value', 'Value', true, { choices: ['allow', 'deny', 'reset'] })]]
]);
grp('category', 'Category management', P.ManageChannels, [
  ['create', 'Create a category', [S('name', 'Category name', true)]],
  ['delete', 'Delete a category', [C('category', 'Category', true, { types: [ChannelType.GuildCategory] })]],
  ['rename', 'Rename a category', [C('category', 'Category', true, { types: [ChannelType.GuildCategory] }), S('name', 'New name', true)]]
]);

// 6 & 7. Security + Automod
grp('security', 'Security & anti-raid configuration', P.Administrator, [
  ['status', 'View security status'],
  ['antiraid', 'Configure anti-raid / mass join detection', [B('enabled', 'Enable', true), I('threshold', 'Joins in 10s that trigger a raid', false, { min: 2, max: 50 }), S('action', 'Action during a raid', false, { choices: ['lockdown', 'kick', 'ban', 'quarantine'] })]],
  ['accountage', 'Minimum account age to join (anti-alt)', [I('days', 'Minimum days (0 disables)', true, { min: 0, max: 365 }), S('action', 'Action', false, { choices: ['kick', 'ban', 'quarantine'] })]],
  ['antibot', 'Block unauthorized bot additions', [B('enabled', 'Enable', true)]],
  ['antinuke', 'Detect unauthorized channel/role/webhook/ban actions', [B('enabled', 'Enable', true)]],
  ['trust', 'Add/remove a trusted user for anti-nuke/anti-bot', [U('user', 'User', true), B('trusted', 'Trusted?', true)]],
  ['quarantine-role', 'Set the quarantine role', [R('role', 'Role', true)]],
  ['quarantine', 'Quarantine a member', [U('user', 'Member', true), S('reason', 'Reason')]],
  ['release', 'Release a member from quarantine', [U('user', 'Member', true)]],
  ['lockdown', 'Manually start/stop a raid lockdown', [B('enabled', 'Lock down', true)]],
  ['verification', 'Set up join verification', [S('mode', 'Mode', true, { choices: ['button', 'captcha', 'auto'] }), R('role', 'Verified role', true), CT('channel', 'Channel to post the verification panel')]]
]);
const AMRULES = ['antispam', 'links', 'invites', 'caps', 'mentions', 'emoji', 'repeats'];
grp('automod', 'Auto moderation', P.ManageGuild, [
  ['enable', 'Enable auto moderation'],
  ['disable', 'Disable auto moderation'],
  ...AMRULES.map(r => [r, `Configure ${r} detection`, [B('enabled', 'Enable this rule', true), I('limit', 'Threshold (spam msgs/5s, mentions, emojis, caps %, repeats)', false, { min: 2, max: 100 })]]),
  ['badwords', 'Configure prohibited words', [S('action', 'Action', true, { choices: ['add', 'remove', 'list', 'clear'] }), S('word', 'Word')]],
  ['whitelist', 'Exempt members or roles', [S('action', 'Action', true, { choices: ['add', 'remove', 'list'] }), R('role', 'Role'), U('user', 'User')]],
  ['blacklist', 'Block specified words or users', [S('action', 'Action', true, { choices: ['add', 'remove', 'list'] }), S('word', 'Word'), U('user', 'User')]]
]);

// 8. Welcome / goodbye
for (const kind of ['welcome', 'goodbye']) {
  const extra = kind === 'welcome' ? [B('dm', 'Also DM the message'), R('role', 'Role given automatically on join')] : [];
  const base = [S('title', 'Embed title'), S('image', 'Banner image URL'), S('color', 'Hex color'), ...extra];
  grp(kind, `${kind[0].toUpperCase() + kind.slice(1)} system`, P.ManageGuild, [
    ['setup', `Set up ${kind} messages`, [CT('channel', 'Channel', true), S('message', 'Message. Variables: {user} {username} {tag} {server} {membercount}', true), ...base]],
    ['test', `Preview the ${kind} message`],
    ['edit', `Edit the ${kind} message`, [CT('channel', 'Channel'), S('message', 'Message'), ...base]],
    ['disable', `Disable ${kind} messages`]
  ]);
}

// 9. Logs
grp('logs', 'Logging system', P.ManageGuild, [
  ['setup', 'Set up logging in a channel', [CT('channel', 'Log channel', true)]],
  ['enable', 'Enable logging (or one category)', [S('category', 'Category', false, { choices: LOG_CATS })]],
  ['disable', 'Disable logging (or one category)', [S('category', 'Category', false, { choices: LOG_CATS })]],
  ['channel', 'Change the log channel', [CT('channel', 'Log channel', true)]],
  ['configuration', 'View logging configuration'],
  ['test', 'Send a test log']
]);

// 10. Tickets
grp('ticket', 'Ticket system', null, [
  ['setup', 'Post the ticket panel (staff)', [CT('channel', 'Panel channel', true), R('support_role', 'Support role'), C('category', 'Ticket category', false, { types: [ChannelType.GuildCategory] }), CT('log_channel', 'Ticket log channel'), S('title', 'Panel title'), S('description', 'Panel description'), S('image', 'Banner URL')]],
  ['create', 'Create a support ticket', [S('reason', 'Reason', true)]],
  ['close', 'Close this ticket', [S('reason', 'Reason')]],
  ['reopen', 'Reopen this ticket'],
  ['delete', 'Delete this ticket'],
  ['claim', 'Claim this ticket'],
  ['add', 'Add a user to this ticket', [U('user', 'User', true)]],
  ['remove', 'Remove a user from this ticket', [U('user', 'User', true)]],
  ['rename', 'Rename this ticket', [S('name', 'New name', true)]],
  ['transcript', 'Generate a transcript of this ticket']
]);

// 11. Reaction roles & self roles
const rrOpts = [];
for (let n = 1; n <= 5; n++) { rrOpts.push(R(`role${n}`, `Role ${n}`, n === 1)); rrOpts.push(S(`emoji${n}`, `Emoji for role ${n}`)); }
const srOpts = [];
for (let n = 2; n <= 10; n++) srOpts.push(R(`role${n}`, `Role ${n}`));
grp('reactionrole', 'Reaction / button role panels', P.ManageRoles, [
  ['create', 'Create a role panel', [S('title', 'Panel title', true), S('description', 'Panel description', true), R('role1', 'Role 1', true), CT('channel', 'Channel'), S('type', 'Panel type', false, { choices: ['button', 'reaction'] }), S('mode', 'Selection mode', false, { choices: ['multiple', 'single'] }), R('required_role', 'Role required to use panel'), S('emoji1', 'Emoji for role 1'), ...rrOpts.slice(2)]],
  ['delete', 'Delete a role panel', [S('message_id', 'Panel message ID', true)]],
  ['edit', 'Edit a role panel text', [S('message_id', 'Panel message ID', true), S('title', 'New title'), S('description', 'New description')]]
]);
grp('selfrole', 'Dropdown self-role menus', P.ManageRoles, [
  ['setup', 'Create a dropdown role menu', [S('category', 'Menu category', true, { choices: ['general', 'color', 'game', 'notification'] }), S('title', 'Title', true), R('role1', 'Role 1', true), CT('channel', 'Channel'), S('mode', 'Selection mode', false, { choices: ['multiple', 'single'] }), R('required_role', 'Role required to use menu'), S('description', 'Description'), ...srOpts]],
  ['remove', 'Remove a dropdown role menu', [S('message_id', 'Menu message ID', true)]]
]);

// 12. Leveling
def('rank', 'Show your rank card', null, [U('user', 'Member')]);
def('leaderboard', 'Show the XP leaderboard');
def('level', 'Show your level and next reward', null, [U('user', 'Member')]);
def('setxp', 'Set a member\'s XP', P.ManageGuild, [U('user', 'Member', true), I('amount', 'XP amount', true, { min: 0 })]);
def('resetxp', 'Reset XP for a member or everyone', P.ManageGuild, [U('user', 'Member (empty = everyone)')]);
grp('levelrole', 'Level reward roles', P.ManageGuild, [
  ['add', 'Add a level reward role', [I('level', 'Level', true, { min: 1 }), R('role', 'Role', true)]],
  ['remove', 'Remove a level reward', [I('level', 'Level', true, { min: 1 })]],
  ['list', 'List level rewards']
]);
def('levelconfig', 'Configure leveling', P.ManageGuild, [N('multiplier', 'XP multiplier (e.g. 1.5)', false, { min: 0.1, max: 10 }), CT('channel', 'Level-up announcement channel'), B('announce', 'Announce level-ups'), B('enabled', 'Enable leveling')]);

// 13. Utility
def('help', 'Display all available commands');
def('ping', 'Check bot latency');
def('uptime', 'Check bot uptime');
def('invite', 'Get the bot invitation link');
def('support', 'Get support information');
def('poll', 'Create a poll', null, [S('question', 'Question', true), S('option1', 'Option 1', true), S('option2', 'Option 2', true), S('option3', 'Option 3'), S('option4', 'Option 4'), S('option5', 'Option 5')]);
def('remind', 'Set a reminder', null, [S('time', 'When e.g. 10m, 2h, 1d', true), S('message', 'Reminder text', true)]);
def('translate', 'Translate text', null, [S('text', 'Text', true), S('to', 'Target language code e.g. es, fr, ja', true), S('from', 'Source language code (default: auto)')]);
def('calculate', 'Calculator', null, [S('expression', 'e.g. (5+3)*2', true)]);
def('afk', 'Set your AFK status', null, [S('reason', 'Reason')]);
def('whois', 'Look up a member', null, [U('user', 'Member')]);
def('suggest', 'Submit a suggestion', null, [S('suggestion', 'Your suggestion', true)]);
def('suggestions', 'View suggestions (staff can set status)', null, [I('id', 'Suggestion ID'), S('status', 'New status (staff)', false, { choices: ['approved', 'denied', 'considering'] }), S('note', 'Staff note')]);
def('report', 'Report a member', null, [U('user', 'Member', true), S('reason', 'Reason', true)]);
def('feedback', 'Submit feedback', null, [S('message', 'Your feedback', true)]);
def('say', 'Send a message through the bot', P.ManageMessages, [S('message', 'Message (use \\n for new lines)', true), CT('channel', 'Channel (default: current)')]);

// 14. Voice
grp('vc', 'Voice channel management', null, [
  ['setup', 'Set up join-to-create voice (staff)', [C('lobby', 'Lobby voice channel', true, { types: VOICEISH }), C('category', 'Category for temp channels', false, { types: [ChannelType.GuildCategory] })]],
  ['create', 'Create a temporary voice channel', [S('name', 'Channel name', true), I('limit', 'User limit', false, { min: 0, max: 99 })]],
  ['lock', 'Lock your voice channel'], ['unlock', 'Unlock your voice channel'],
  ['limit', 'Set user limit', [I('limit', 'Limit (0 = none)', true, { min: 0, max: 99 })]],
  ['rename', 'Rename your voice channel', [S('name', 'New name', true)]],
  ['owner', 'Show the voice channel owner'],
  ['transfer', 'Transfer ownership', [U('user', 'New owner', true)]],
  ['claim', 'Claim an ownerless voice channel'],
  ['kick', 'Kick a member from your voice channel', [U('user', 'Member', true)]],
  ['mute', 'Mute/unmute a member in voice', [U('user', 'Member', true), B('state', 'Muted? (default true)')]],
  ['deafen', 'Deafen/undeafen a member in voice', [U('user', 'Member', true), B('state', 'Deafened? (default true)')]],
  ['move', 'Move a member to another voice channel', [U('user', 'Member', true), C('channel', 'Target channel', true, { types: VOICEISH })]],
  ['afk', 'Set the AFK voice channel (staff)', [C('channel', 'AFK channel', true, { types: VOICEISH }), I('timeout', 'AFK timeout', false, { choices: [{ name: '1 minute', value: 60 }, { name: '5 minutes', value: 300 }, { name: '15 minutes', value: 900 }, { name: '30 minutes', value: 1800 }, { name: '1 hour', value: 3600 }] })]]
]);

// 15. Giveaways
grp('giveaway', 'Giveaway system', P.ManageGuild, [
  ['start', 'Start a giveaway', [S('prize', 'Prize', true), S('duration', 'Duration e.g. 30m, 2h, 1d', true), I('winners', 'Number of winners', true, { min: 1, max: 20 }), CT('channel', 'Channel'), R('role', 'Required role'), I('min_account_days', 'Minimum account age (days)', false, { min: 1 }), S('description', 'Description'), S('image', 'Banner URL')]],
  ['end', 'End a giveaway early', [S('message_id', 'Giveaway message ID', true)]],
  ['reroll', 'Reroll a winner', [S('message_id', 'Giveaway message ID', true)]],
  ['cancel', 'Cancel a giveaway', [S('message_id', 'Giveaway message ID', true)]],
  ['list', 'List giveaways', [B('history', 'Show history')]]
]);

// 16. Applications
const APPTYPES = ['staff', 'moderator', 'membership'];
grp('application', 'Application system', P.ManageGuild, [
  ['setup', 'Post the application panel', [CT('channel', 'Panel channel', true), CT('review_channel', 'Review channel', true), S('title', 'Panel title'), S('description', 'Panel description')]],
  ['questions', 'Set custom questions (max 5)', [S('type', 'Application type', true, { choices: APPTYPES }), S('questions', 'Questions separated by ;', true), R('role', 'Role given on approval')]],
  ['list', 'List applications', [S('status', 'Status', false, { choices: ['pending', 'approved', 'rejected'] })]],
  ['approve', 'Approve an application', [I('id', 'Application ID', true), S('note', 'Note to applicant')]],
  ['reject', 'Reject an application', [I('id', 'Application ID', true), S('reason', 'Reason', true)]],
  ['interview', 'Schedule an interview', [I('id', 'Application ID', true), S('time', 'When (free text)', true)]],
  ['transcript', 'Get an application transcript', [I('id', 'Application ID', true)]]
]);

// 17. Staff
grp('staff', 'Staff & administration management', null, [
  ['info', 'Show staff member info', [U('user', 'Staff member')]],
  ['promote', 'Promote a staff member', [U('user', 'Member', true), R('role', 'New role', true), S('reason', 'Reason')]],
  ['demote', 'Demote a staff member', [U('user', 'Member', true), R('role', 'Role to remove', true), S('reason', 'Reason')]],
  ['warn', 'Warn a staff member', [U('user', 'Member', true), S('reason', 'Reason', true)]],
  ['duty', 'Set your duty status', [S('status', 'Status', true, { choices: ['on', 'off'] })]],
  ['history', 'View staff record', [U('user', 'Member', true)]],
  ['activity', 'View staff activity', [U('user', 'Member')]],
  ['leave', 'Start or end staff leave', [I('days', 'Days of leave (0 = return)', true, { min: 0, max: 90 }), S('reason', 'Reason')]]
]);
grp('config', 'Configure the bot for this server', P.Administrator, [
  ['roles', 'Set staff roles', [R('admin_role', 'Admin role'), R('mod_role', 'Moderator role'), R('staff_role', 'General staff role'), R('auto_role', 'Role given to every new member')]],
  ['channels', 'Set system channels', [CT('log', 'Log channel'), CT('welcome', 'Welcome channel'), CT('goodbye', 'Goodbye channel'), CT('suggestions', 'Suggestions channel'), CT('reports', 'Reports channel'), CT('feedback', 'Feedback channel'), CT('staff', 'Staff announcement channel'), CT('levels', 'Level-up channel')]],
  ['restrict', 'Restrict a command to staff only', [S('command', 'Command name', true), B('enabled', 'Restrict?', true)]],
  ['view', 'View configuration']
]);

// 18. Bot owner
grp('bot', 'Bot owner commands', P.Administrator, [
  ['shutdown', 'Shut down the bot'], ['restart', 'Restart the bot'],
  ['maintenance', 'Toggle maintenance mode', [B('enabled', 'Enable', true)]],
  ['status', 'Change bot status', [S('status', 'Status', true, { choices: ['online', 'idle', 'dnd', 'invisible'] })]],
  ['activity', 'Change bot activity', [S('type', 'Type', true, { choices: [{ name: 'Playing', value: '0' }, { name: 'Streaming', value: '1' }, { name: 'Listening', value: '2' }, { name: 'Watching', value: '3' }, { name: 'Competing', value: '5' }] }), S('text', 'Activity text', true)]],
  ['servers', 'List servers using the bot'],
  ['leave', 'Make the bot leave a server', [S('guild_id', 'Server ID', true)]],
  ['blacklist', 'Blacklist a server or user', [S('type', 'Type', true, { choices: ['user', 'server'] }), S('id', 'ID', true)]],
  ['unblacklist', 'Remove a blacklist entry', [S('type', 'Type', true, { choices: ['user', 'server'] }), S('id', 'ID', true)]],
  ['eval', 'Developer-only code evaluation', [S('code', 'Code', true)]],
  ['debug', 'Debug bot errors'],
  ['sync', 'Synchronize slash commands'],
  ['config', 'Configure global bot settings', [S('key', 'Key', true), S('value', 'Value (empty deletes)')]]
]);

// =====================================================================
//  COMMAND HANDLERS
// =====================================================================
const H = {};

// ---- 1. Server administration ----
H.serverinfo = async i => {
  const g = i.guild; await g.fetch(); const owner = await g.fetchOwner();
  return send(i, { embeds: [emb(g.name).setThumbnail(g.iconURL()).addFields(
    { name: 'Owner', value: `${owner}`, inline: true }, { name: 'ID', value: g.id, inline: true },
    { name: 'Created', value: `<t:${ts(g.createdTimestamp)}:R>`, inline: true }, { name: 'Members', value: `${g.memberCount}`, inline: true },
    { name: 'Channels', value: `${g.channels.cache.size}`, inline: true }, { name: 'Roles', value: `${g.roles.cache.size}`, inline: true },
    { name: 'Boosts', value: `${g.premiumSubscriptionCount || 0} (Tier ${g.premiumTier})`, inline: true },
    { name: 'Verification', value: `${g.verificationLevel}`, inline: true })] }, false);
};
const imageChange = (label, getUrl, setter) => async i => {
  const src = i.options.getAttachment('image')?.url || i.options.getString('url');
  if (src) {
    if (!i.memberPermissions.has(P.ManageGuild)) return send(i, '❌ You need **Manage Server** to change this.');
    try { await i.guild[setter](src); return send(i, `✅ Server ${label} updated.`); } catch (e) { return send(i, '❌ ' + e.message); }
  }
  const u = getUrl(i.guild);
  if (!u) return send(i, `This server has no ${label}.`);
  return send(i, { embeds: [emb(`Server ${label}`).setImage(u)] }, false);
};
H.servericon = imageChange('icon', g => g.iconURL({ size: 1024 }), 'setIcon');
H.serverbanner = imageChange('banner', g => g.bannerURL({ size: 1024 }), 'setBanner');
H.servername = async i => { await i.guild.setName(i.options.getString('name')); return send(i, '✅ Server name updated.'); };
H.serverrules = async i => {
  const g = G(i.guild.id), text = i.options.getString('rules');
  if (text) {
    if (!i.memberPermissions.has(P.ManageGuild)) return send(i, '❌ You need **Manage Server** to set the rules.');
    g.rules = nl(text); save(); return send(i, '✅ Server rules updated.');
  }
  if (!g.rules) return send(i, 'No rules have been set yet.');
  return send(i, { embeds: [emb('📜 Server Rules', g.rules)] }, false);
};
H.serverstats = async i => {
  const g = i.guild; await g.members.fetch().catch(() => {});
  const bots = g.members.cache.filter(m => m.user.bot).size, today = G(g.id).activity[new Date().toISOString().slice(0, 10)] || 0;
  const cc = t => g.channels.cache.filter(c => c.type === t).size;
  return send(i, { embeds: [emb(`📊 ${g.name} Statistics`).addFields(
    { name: 'Members', value: `${g.memberCount} (${g.memberCount - bots} humans, ${bots} bots)` },
    { name: 'Channels', value: `${cc(ChannelType.GuildText)} text • ${cc(ChannelType.GuildVoice)} voice • ${cc(ChannelType.GuildCategory)} categories`, inline: true },
    { name: 'Roles / Emojis', value: `${g.roles.cache.size} / ${g.emojis.cache.size}`, inline: true },
    { name: 'Boosts', value: `${g.premiumSubscriptionCount || 0} (Tier ${g.premiumTier})`, inline: true },
    { name: 'Messages today', value: `${today}`, inline: true })] }, false);
};
H.serverlock = async i => { await defer(i); const n = await setServerLock(i.guild, true, i.options.getString('reason') || `Locked by ${i.user.tag}`); return send(i, `🔒 Locked **${n}** channel(s).`); };
H.serverunlock = async i => { await defer(i); const n = await setServerLock(i.guild, false, i.options.getString('reason') || `Unlocked by ${i.user.tag}`); return send(i, `🔓 Unlocked **${n}** channel(s).`); };
H.slowmode = async i => { const ch = i.options.getChannel('channel') || i.channel; await ch.setRateLimitPerUser(i.options.getInteger('seconds')); return send(i, `✅ Slowmode in ${ch} set to **${i.options.getInteger('seconds')}s**.`); };
H.announce = async i => {
  const g = G(i.guild.id), staffOnly = i.options.getBoolean('staff_only');
  const chId = staffOnly ? g.settings.staffChannel : (i.options.getChannel('channel') || i.channel).id;
  const ch = chId && i.guild.channels.cache.get(chId);
  if (!ch) return send(i, '❌ Staff channel not set. Use `/config channels`.');
  const role = i.options.getRole('ping_role'), everyone = i.options.getBoolean('ping_everyone');
  const ping = [everyone ? '@everyone' : '', role ? `${role}` : ''].filter(Boolean).join(' ');
  await ch.send({ content: ping || undefined, embeds: [emb(i.options.getString('title') || '📢 Announcement', nl(i.options.getString('message'))).setFooter({ text: `Announced by ${i.user.tag}` })], allowedMentions: { parse: everyone ? ['everyone'] : [], roles: role ? [role.id] : [] } });
  return send(i, `✅ Announcement sent in ${ch}.`);
};
H.embed = async i => {
  const ch = i.options.getChannel('channel') || i.channel;
  const e = new EmbedBuilder().setTitle(i.options.getString('title')).setDescription(nl(i.options.getString('description'))).setColor(hexColor(i.options.getString('color')));
  const img = i.options.getString('image'), th = i.options.getString('thumbnail'), ft = i.options.getString('footer');
  if (img) e.setImage(img); if (th) e.setThumbnail(th); if (ft) e.setFooter({ text: ft });
  await ch.send({ embeds: [e] }); return send(i, `✅ Embed sent in ${ch}.`);
};
H.purge = H.clear = async i => {
  await defer(i);
  const amount = i.options.getInteger('amount'), user = i.options.getUser('user');
  let msgs = await i.channel.messages.fetch({ limit: 100 });
  if (user) msgs = msgs.filter(m => m.author.id === user.id);
  const del = await i.channel.bulkDelete([...msgs.values()].slice(0, amount), true).catch(() => null);
  return send(i, del ? `🧹 Deleted **${del.size}** message(s).` : '❌ Failed (messages older than 14 days cannot be bulk deleted).');
};
H.nuke = async i => {
  if (!i.options.getBoolean('confirm')) return send(i, '⚠️ Set `confirm` to true to nuke the channel.');
  const ch = i.options.getChannel('channel') || i.channel;
  await send(i, '💥 Nuking channel...');
  const pos = ch.rawPosition; const nc = await ch.clone({ reason: `Nuked by ${i.user.tag}` });
  await ch.delete().catch(() => {}); await nc.setPosition(pos).catch(() => {});
  await nc.send({ embeds: [emb('💥 Channel Nuked', `This channel was recreated by ${i.user}.`, COLORS.err)] });
};
H.backup = async i => {
  await defer(i); const g = i.guild;
  const ow = ch => [...ch.permissionOverwrites.cache.values()].filter(o => o.type === OverwriteType.Role && g.roles.cache.has(o.id)).map(o => ({ role: g.roles.cache.get(o.id).name, everyone: o.id === g.id, allow: o.allow.bitfield.toString(), deny: o.deny.bitfield.toString() }));
  const roles = [...g.roles.cache.values()].filter(r => !r.managed && r.id !== g.id).sort((a, b) => a.position - b.position).map(r => ({ name: r.name, color: r.color, hoist: r.hoist, mentionable: r.mentionable, permissions: r.permissions.bitfield.toString() }));
  const cats = [...g.channels.cache.values()].filter(c => c.type === ChannelType.GuildCategory).sort((a, b) => a.rawPosition - b.rawPosition).map(c => ({ name: c.name, ow: ow(c) }));
  const chans = [...g.channels.cache.values()].filter(c => c.type !== ChannelType.GuildCategory && !c.isThread()).sort((a, b) => a.rawPosition - b.rawPosition).map(c => ({ name: c.name, type: c.type, parent: c.parent?.name || null, topic: c.topic || null, nsfw: c.nsfw || false, rate: c.rateLimitPerUser || 0, userLimit: c.userLimit || 0, ow: ow(c) }));
  const data = { name: g.name, time: Date.now(), roles, cats, chans };
  G(g.id).backup = data; save();
  return send(i, { content: `✅ Backup created (${roles.length} roles, ${cats.length} categories, ${chans.length} channels).`, files: [new AttachmentBuilder(Buffer.from(JSON.stringify(data, null, 2)), { name: `backup-${g.id}.json` })] });
};
H.restore = async i => {
  if (!i.options.getBoolean('confirm')) return send(i, '⚠️ Set `confirm` to true to restore.');
  await defer(i); const g = i.guild; let data = G(g.id).backup; const att = i.options.getAttachment('file');
  if (att) { try { data = await (await fetch(att.url)).json(); } catch (e) { return send(i, '❌ Invalid backup file.'); } }
  if (!data?.roles) return send(i, '❌ No backup found.');
  let r = 0, c = 0, h = 0;
  for (const ro of data.roles) if (!g.roles.cache.find(x => x.name === ro.name)) await g.roles.create({ name: ro.name, color: ro.color, hoist: ro.hoist, mentionable: ro.mentionable, permissions: BigInt(ro.permissions) }).then(() => r++).catch(() => {});
  const ow = list => list.map(o => { const role = o.everyone ? g.roles.everyone : g.roles.cache.find(x => x.name === o.role); return role ? { id: role.id, allow: BigInt(o.allow), deny: BigInt(o.deny) } : null; }).filter(Boolean);
  for (const ca of data.cats) if (!g.channels.cache.find(x => x.type === ChannelType.GuildCategory && x.name === ca.name)) await g.channels.create({ name: ca.name, type: ChannelType.GuildCategory, permissionOverwrites: ow(ca.ow) }).then(() => h++).catch(() => {});
  for (const ch of data.chans) {
    if (g.channels.cache.find(x => x.name === ch.name && x.type === ch.type)) continue;
    const parent = ch.parent ? g.channels.cache.find(x => x.type === ChannelType.GuildCategory && x.name === ch.parent) : null;
    await g.channels.create({ name: ch.name, type: ch.type, parent: parent?.id, topic: ch.topic || undefined, nsfw: ch.nsfw, rateLimitPerUser: ch.rate || undefined, userLimit: ch.userLimit || undefined, permissionOverwrites: ow(ch.ow) }).then(() => c++).catch(() => {});
  }
  return send(i, `✅ Restore complete: **${r}** roles, **${h}** categories, **${c}** channels recreated.`);
};

// ---- 2. Moderation ----
const modAct = (type, past, color, run, guard) => async i => {
  const user = i.options.getUser('user'), reason = i.options.getString('reason') || 'No reason provided';
  const m = await i.guild.members.fetch(user.id).catch(() => null);
  if (!m) return send(i, '❌ That user is not in this server.');
  const bad = canAct(i, m); if (bad) return send(i, '❌ ' + bad);
  const gm = guard && guard(m); if (gm) return send(i, '❌ ' + gm);
  let extra = '';
  try { if (past) await notify(user, i.guild, past, reason); extra = (await run(m, reason, i)) || ''; } catch (e) { return send(i, '❌ ' + e.message); }
  const c = addCase(i.guild, type, user.id, i.user.id, reason);
  return send(i, { embeds: [emb(`✅ ${type} — ${user.tag}`, `**Reason:** ${reason}${extra}\n**Case:** #${c.id}`, color)] }, false);
};
async function banCore(i, user, reason, days, tempMs) {
  const m = await i.guild.members.fetch(user.id).catch(() => null);
  if (m) {
    const bad = canAct(i, m); if (bad) return send(i, '❌ ' + bad);
    if (!m.bannable) return send(i, '❌ I cannot ban that member.');
    await notify(user, i.guild, tempMs ? 'temporarily banned' : 'banned', reason);
  }
  try { await i.guild.members.ban(user, { reason: `${i.user.tag}: ${reason}`, deleteMessageSeconds: days * 86400 }); } catch (e) { return send(i, '❌ ' + e.message); }
  if (tempMs) { G(i.guild.id).tempbans.push({ id: user.id, until: Date.now() + tempMs }); save(); }
  const c = addCase(i.guild, tempMs ? 'TEMPBAN' : 'BAN', user.id, i.user.id, reason, tempMs ? { duration: tempMs } : {});
  return send(i, { embeds: [emb(`🔨 ${tempMs ? 'Temp-banned' : 'Banned'} — ${user.tag}`, `**Reason:** ${reason}${tempMs ? `\n**Duration:** ${fmtDur(tempMs)}` : ''}\n**Case:** #${c.id}`, COLORS.err)] }, false);
}
H.ban = i => banCore(i, i.options.getUser('user'), i.options.getString('reason') || 'No reason provided', i.options.getInteger('delete_days') || 0, 0);
H.tempban = i => {
  const d = parseDuration(i.options.getString('duration'));
  if (!d) return send(i, '❌ Invalid duration. Use e.g. 30m, 12h, 7d.');
  return banCore(i, i.options.getUser('user'), i.options.getString('reason') || 'No reason provided', 0, d);
};
H.unban = async i => {
  const id = i.options.getString('user_id').trim(), reason = i.options.getString('reason') || 'No reason provided';
  try { await i.guild.members.unban(id, `${i.user.tag}: ${reason}`); } catch (e) { return send(i, '❌ Could not unban: ' + e.message); }
  const c = addCase(i.guild, 'UNBAN', id, i.user.id, reason);
  return send(i, `✅ Unbanned \`${id}\` (Case #${c.id}).`);
};
H.softban = async i => {
  const user = i.options.getUser('user'), reason = i.options.getString('reason') || 'No reason provided';
  const m = await i.guild.members.fetch(user.id).catch(() => null);
  if (m) { const bad = canAct(i, m); if (bad) return send(i, '❌ ' + bad); if (!m.bannable) return send(i, '❌ I cannot ban that member.'); await notify(user, i.guild, 'softbanned', reason); }
  try { await i.guild.members.ban(user, { reason: `Softban: ${reason}`, deleteMessageSeconds: 604800 }); await i.guild.members.unban(user, 'Softban'); } catch (e) { return send(i, '❌ ' + e.message); }
  const c = addCase(i.guild, 'SOFTBAN', user.id, i.user.id, reason);
  return send(i, { embeds: [emb(`🧹 Softbanned — ${user.tag}`, `**Reason:** ${reason}\n**Case:** #${c.id}`, COLORS.warn)] }, false);
};
H.massban = async i => {
  await defer(i);
  const ids = [...new Set(i.options.getString('ids').match(/\d{17,20}/g) || [])].slice(0, 25), reason = i.options.getString('reason') || 'Mass ban';
  let ok = 0;
  for (const id of ids) {
    if (id === i.user.id || id === client.user.id || id === i.guild.ownerId) continue;
    try { await i.guild.members.ban(id, { reason: `${i.user.tag}: ${reason}` }); addCase(i.guild, 'BAN', id, i.user.id, reason); ok++; } catch (e) { /* skip */ }
    await sleep(300);
  }
  return send(i, `✅ Banned **${ok}/${ids.length}** user(s).`);
};
H.kick = modAct('KICK', 'kicked', COLORS.warn, (m, r, i) => m.kick(`${i.user.tag}: ${r}`), m => m.kickable ? null : 'I cannot kick that member.');
H.timeout = modAct('TIMEOUT', 'timed out', COLORS.warn, async (m, r, i) => {
  const d = parseDuration(i.options.getString('duration')); if (!d) throw new Error('Invalid duration. Use e.g. 10m, 2h, 1d.');
  const ms = Math.min(d, 28 * 864e5); await m.timeout(ms, `${i.user.tag}: ${r}`); return `\n**Duration:** ${fmtDur(ms)}`;
}, m => m.moderatable ? null : 'I cannot timeout that member.');
H.untimeout = modAct('UNTIMEOUT', null, COLORS.ok, (m, r, i) => m.timeout(null, `${i.user.tag}: ${r}`), m => m.moderatable ? null : 'I cannot modify that member.');
H.mute = modAct('MUTE', 'muted', COLORS.warn, async (m, r, i) => { const role = await ensureMuteRole(i.guild); await m.roles.add(role, `${i.user.tag}: ${r}`); });
H.unmute = modAct('UNMUTE', null, COLORS.ok, async (m, r, i) => { const role = await ensureMuteRole(i.guild); await m.roles.remove(role, `${i.user.tag}: ${r}`); });
H.warn = modAct('WARN', 'warned', COLORS.warn, async (m, r, i) => {
  const g = G(i.guild.id); const id = ++g.warnSeq;
  (g.warnings[m.id] ||= []).push({ id, reason: r, mod: i.user.id, time: Date.now() }); save();
  return `\n**Total warnings:** ${g.warnings[m.id].length}`;
});
H.warnings = async i => {
  const u = i.options.getUser('user'), w = G(i.guild.id).warnings[u.id] || [];
  if (!w.length) return send(i, `✅ **${u.tag}** has no warnings.`);
  return send(i, { embeds: [emb(`⚠️ Warnings — ${u.tag}`, w.slice(-15).map(x => `**#${x.id}** • <t:${ts(x.time)}:d> • by <@${x.mod}>\n${x.reason}`).join('\n\n'), COLORS.warn)] });
};
H.clearwarnings = async i => {
  const u = i.options.getUser('user'), id = i.options.getInteger('id'), g = G(i.guild.id);
  if (id) g.warnings[u.id] = (g.warnings[u.id] || []).filter(w => w.id !== id); else delete g.warnings[u.id];
  save(); addCase(i.guild, 'CLEARWARNINGS', u.id, i.user.id, id ? `Cleared warning #${id}` : 'Cleared all warnings');
  return send(i, `✅ Cleared ${id ? `warning #${id}` : 'all warnings'} for **${u.tag}**.`);
};
const voiceAct = (name, fn, needVoice = true) => async i => {
  const m = await i.guild.members.fetch(i.options.getUser('user').id).catch(() => null);
  if (!m) return send(i, '❌ Member not found.');
  if (needVoice && !m.voice.channel) return send(i, '❌ That member is not in a voice channel.');
  try { await fn(m, i); } catch (e) { return send(i, '❌ ' + e.message); }
  addCase(i.guild, name, m.id, i.user.id, i.options.getString?.('reason') || 'No reason provided');
  return send(i, `✅ ${name} applied to **${m.user.tag}**.`);
};
H.deafen = voiceAct('DEAFEN', m => m.voice.setDeaf(true));
H.undeafen = voiceAct('UNDEAFEN', m => m.voice.setDeaf(false));
H.disconnect = voiceAct('DISCONNECT', m => m.voice.disconnect());
H.move = voiceAct('MOVE', (m, i) => m.voice.setChannel(i.options.getChannel('channel')));
H.modlogs = async i => {
  const u = i.options.getUser('user'), cs = G(i.guild.id).cases.filter(c => c.target === u.id);
  if (!cs.length) return send(i, `No moderation history for **${u.tag}**.`);
  return send(i, { embeds: [emb(`📁 Mod Logs — ${u.tag}`, cs.slice(-15).reverse().map(c => `**#${c.id}** ${c.type} • <t:${ts(c.time)}:d> • by <@${c.mod}>\n${trunc(c.reason, 150)}`).join('\n\n'))] });
};
H.case = async i => {
  const c = G(i.guild.id).cases[i.options.getInteger('number') - 1];
  if (!c) return send(i, '❌ Case not found.');
  return send(i, { embeds: [emb(`Case #${c.id} — ${c.type}`, `**Target:** <@${c.target}> (\`${c.target}\`)\n**Moderator:** <@${c.mod}>\n**Reason:** ${c.reason}\n**Date:** <t:${ts(c.time)}:F>${c.duration ? `\n**Duration:** ${fmtDur(c.duration)}` : ''}`)] });
};

// ---- 3. Roles ----
const bulkRole = (filter, add) => async i => {
  const role = i.options.getRole('role'), bad = roleBlock(i, role); if (bad) return send(i, '❌ ' + bad);
  await defer(i); const members = await i.guild.members.fetch(); let n = 0;
  for (const m of members.values()) {
    if (!filter(m) || add === m.roles.cache.has(role.id)) continue;
    try { add ? await m.roles.add(role) : await m.roles.remove(role); n++; } catch (e) { /* skip */ }
    await sleep(250);
  }
  return send(i, `✅ ${add ? 'Added' : 'Removed'} **${role.name}** ${add ? 'to' : 'from'} **${n}** member(s).`);
};
H.role = {
  add: async i => { const r = i.options.getRole('role'), m = i.options.getMember('user'), bad = roleBlock(i, r); if (bad) return send(i, '❌ ' + bad); if (!m) return send(i, '❌ Member not found.'); await m.roles.add(r); return send(i, `✅ Gave **${r.name}** to ${m}.`); },
  remove: async i => { const r = i.options.getRole('role'), m = i.options.getMember('user'), bad = roleBlock(i, r); if (bad) return send(i, '❌ ' + bad); if (!m) return send(i, '❌ Member not found.'); await m.roles.remove(r); return send(i, `✅ Removed **${r.name}** from ${m}.`); },
  create: async i => { const r = await i.guild.roles.create({ name: i.options.getString('name'), color: hexColor(i.options.getString('color'), 0), hoist: !!i.options.getBoolean('hoist'), mentionable: !!i.options.getBoolean('mentionable') }); return send(i, `✅ Created ${r}.`); },
  delete: async i => { const r = i.options.getRole('role'), bad = roleBlock(i, r); if (bad) return send(i, '❌ ' + bad); await r.delete(`By ${i.user.tag}`); return send(i, `✅ Deleted **${r.name}**.`); },
  edit: async i => { const r = i.options.getRole('role'), bad = roleBlock(i, r); if (bad) return send(i, '❌ ' + bad); const d = {}; const n = i.options.getString('name'), h = i.options.getBoolean('hoist'), mn = i.options.getBoolean('mentionable'); if (n) d.name = n; if (h !== null) d.hoist = h; if (mn !== null) d.mentionable = mn; await r.edit(d); return send(i, `✅ Updated ${r}.`); },
  color: async i => { const r = i.options.getRole('role'), bad = roleBlock(i, r); if (bad) return send(i, '❌ ' + bad); await r.setColor(hexColor(i.options.getString('color'), 0)); return send(i, `✅ Updated color of ${r}.`); },
  icon: async i => { const r = i.options.getRole('role'), bad = roleBlock(i, r); if (bad) return send(i, '❌ ' + bad); try { await r.setIcon(i.options.getAttachment('image')?.url || null); } catch (e) { return send(i, '❌ ' + e.message); } return send(i, `✅ Updated icon of ${r}.`); },
  info: async i => { const r = i.options.getRole('role'); return send(i, { embeds: [emb(`Role: ${r.name}`, null, r.color || COLORS.main).addFields({ name: 'ID', value: r.id, inline: true }, { name: 'Color', value: r.hexColor, inline: true }, { name: 'Members', value: `${r.members.size}`, inline: true }, { name: 'Hoisted', value: r.hoist ? 'Yes' : 'No', inline: true }, { name: 'Mentionable', value: r.mentionable ? 'Yes' : 'No', inline: true }, { name: 'Position', value: `${r.position}`, inline: true }, { name: 'Created', value: `<t:${ts(r.createdTimestamp)}:R>`, inline: true }, { name: 'Key Permissions', value: r.permissions.has(P.Administrator) ? 'Administrator' : trunc(r.permissions.toArray().slice(0, 10).join(', ') || 'None', 500) })] }); },
  members: async i => { await i.guild.members.fetch(); const r = i.options.getRole('role'); const l = r.members.map(m => `${m}`); return send(i, { embeds: [emb(`Members with ${r.name} (${l.length})`, trunc(l.join(' ') || 'None', 3900))] }); },
  all: bulkRole(() => true, true), bots: bulkRole(m => m.user.bot, true), humans: bulkRole(m => !m.user.bot, true),
  'bots-remove': bulkRole(m => m.user.bot, false), 'humans-remove': bulkRole(m => !m.user.bot, false),
  transfer: async i => {
    const r = i.options.getRole('role'), bad = roleBlock(i, r); if (bad) return send(i, '❌ ' + bad);
    const a = i.options.getMember('from'), b = i.options.getMember('to'); if (!a || !b) return send(i, '❌ Member not found.');
    await a.roles.remove(r); await b.roles.add(r); return send(i, `✅ Transferred **${r.name}** from ${a} to ${b}.`);
  }
};

// ---- 4. Member management ----
H.userinfo = H.whois = async i => {
  const user = i.options.getUser('user') || i.user, m = await i.guild.members.fetch(user.id).catch(() => null);
  const e = emb(`👤 ${user.tag}`).setThumbnail(user.displayAvatarURL({ size: 256 })).addFields({ name: 'ID', value: user.id, inline: true }, { name: 'Bot', value: user.bot ? 'Yes' : 'No', inline: true }, { name: 'Created', value: `<t:${ts(user.createdTimestamp)}:F> (<t:${ts(user.createdTimestamp)}:R>)` });
  if (m) {
    e.addFields({ name: 'Joined', value: `<t:${ts(m.joinedTimestamp)}:F> (<t:${ts(m.joinedTimestamp)}:R>)` }, { name: 'Nickname', value: m.nickname || 'None', inline: true }, { name: 'Highest Role', value: `${m.roles.highest}`, inline: true }, { name: `Roles (${m.roles.cache.size - 1})`, value: trunc(m.roles.cache.filter(r => r.id !== i.guild.id).map(r => `${r}`).join(' ') || 'None', 1000) });
    if (m.premiumSince) e.addFields({ name: 'Boosting since', value: `<t:${ts(m.premiumSinceTimestamp)}:R>`, inline: true });
    if (m.communicationDisabledUntil) e.addFields({ name: 'Timed out until', value: `<t:${ts(m.communicationDisabledUntilTimestamp)}:R>`, inline: true });
  }
  return send(i, { embeds: [e] }, false);
};
H.avatar = async i => { const u = i.options.getUser('user') || i.user; return send(i, { embeds: [emb(`${u.tag}'s Avatar`).setImage(u.displayAvatarURL({ size: 1024 }))] }, false); };
H.banner = async i => { const u = await (i.options.getUser('user') || i.user).fetch(true); const b = u.bannerURL({ size: 1024 }); if (!b) return send(i, `**${u.tag}** has no banner.`); return send(i, { embeds: [emb(`${u.tag}'s Banner`).setImage(b)] }, false); };
H.membercount = async i => send(i, { embeds: [emb('👥 Member Count', `**${i.guild.memberCount}** members in **${i.guild.name}**`)] }, false);
H.joinedat = async i => { const u = i.options.getUser('user') || i.user, m = await i.guild.members.fetch(u.id).catch(() => null); if (!m) return send(i, '❌ Member not found.'); return send(i, `📅 **${u.tag}** joined <t:${ts(m.joinedTimestamp)}:F> (<t:${ts(m.joinedTimestamp)}:R>)`, false); };
H.accountage = async i => { const u = i.options.getUser('user') || i.user; return send(i, `🎂 **${u.tag}**'s account was created <t:${ts(u.createdTimestamp)}:F> (<t:${ts(u.createdTimestamp)}:R>)`, false); };
H.nickname = async i => {
  const m = await i.guild.members.fetch(i.options.getUser('user').id).catch(() => null); if (!m) return send(i, '❌ Member not found.');
  if (m.id !== i.user.id) { const bad = canAct(i, m); if (bad) return send(i, '❌ ' + bad); }
  if (!m.manageable) return send(i, '❌ I cannot change that member\'s nickname.');
  const nick = i.options.getString('nickname'); await m.setNickname(nick || null, `By ${i.user.tag}`);
  return send(i, `✅ Nickname ${nick ? `changed to **${nick}**` : 'reset'} for ${m}.`);
};
H.massnick = async i => {
  await defer(i); const role = i.options.getRole('role'), reset = i.options.getBoolean('reset'), fmt = i.options.getString('format');
  const members = await i.guild.members.fetch(); let n = 0;
  for (const m of members.values()) {
    if (m.user.bot || !m.manageable || (role && !m.roles.cache.has(role.id))) continue;
    try { await m.setNickname(reset ? null : fmt.replace(/{username}/g, m.user.username).slice(0, 32), `Massnick by ${i.user.tag}`); n++; } catch (e) { /* skip */ }
    await sleep(300);
  }
  return send(i, `✅ Updated **${n}** nickname(s).`);
};
H.profile = async i => {
  const u = i.options.getUser('user') || i.user, m = await i.guild.members.fetch(u.id).catch(() => null), g = G(i.guild.id);
  const x = g.xp[u.id] || { xp: 0, level: 0, msgs: 0 }, w = (g.warnings[u.id] || []).length, afk = g.afk[u.id];
  const e = emb(`📇 Profile — ${u.tag}`).setThumbnail(u.displayAvatarURL({ size: 256 })).addFields(
    { name: 'Level', value: `${x.level} (${x.xp} XP)`, inline: true }, { name: 'Messages', value: `${x.msgs || 0}`, inline: true }, { name: 'Warnings', value: `${w}`, inline: true },
    { name: 'Joined', value: m ? `<t:${ts(m.joinedTimestamp)}:R>` : 'N/A', inline: true }, { name: 'Created', value: `<t:${ts(u.createdTimestamp)}:R>`, inline: true }, { name: 'AFK', value: afk ? afk.reason : 'No', inline: true });
  return send(i, { embeds: [e] }, false);
};
H.inrole = async i => { await i.guild.members.fetch(); const r = i.options.getRole('role'); return send(i, { embeds: [emb(`Members in ${r.name} (${r.members.size})`, trunc(r.members.map(m => `${m}`).join(' ') || 'None', 3900))] }); };
H.botinfo = async i => send(i, { embeds: [emb(`🤖 ${client.user.username}`).setThumbnail(client.user.displayAvatarURL()).addFields(
  { name: 'Servers', value: `${client.guilds.cache.size}`, inline: true }, { name: 'Users', value: `${client.guilds.cache.reduce((a, g) => a + g.memberCount, 0)}`, inline: true },
  { name: 'Ping', value: `${client.ws.ping}ms`, inline: true }, { name: 'Uptime', value: fmtDur(Date.now() - START), inline: true },
  { name: 'Memory', value: `${(process.memoryUsage().heapUsed / 1048576).toFixed(1)} MB`, inline: true }, { name: 'Versions', value: `Node ${process.version} • discord.js ${require('discord.js').version}`, inline: true }, { name: 'Owner', value: '👑 Owned by Patrick', inline: true }).setFooter({ text: 'Owned by Patrick' })] }, false);
H.bots = async i => { const ms = await i.guild.members.fetch(); const l = ms.filter(m => m.user.bot).map(m => `${m} (\`${m.user.tag}\`)`); return send(i, { embeds: [emb(`🤖 Bots (${l.length})`, trunc(l.join('\n') || 'None', 3900))] }); };

// ---- 5. Channels ----
const CHMAP = { text: ChannelType.GuildText, voice: ChannelType.GuildVoice, announcement: ChannelType.GuildAnnouncement, forum: ChannelType.GuildForum, stage: ChannelType.GuildStageVoice };
const chOf = i => i.options.getChannel('channel') || i.channel;
H.channel = {
  create: async i => { const cat = i.options.getChannel('category'), topic = i.options.getString('topic'); const ch = await i.guild.channels.create({ name: i.options.getString('name'), type: CHMAP[i.options.getString('type') || 'text'], parent: cat?.id, topic: topic || undefined }); return send(i, `✅ Created ${ch}.`); },
  delete: async i => { const ch = i.options.getChannel('channel'); await send(i, `✅ Deleting **${ch.name}**...`); await ch.delete(`By ${i.user.tag}`); },
  rename: async i => { const ch = chOf(i); await ch.setName(i.options.getString('name')); return send(i, `✅ Renamed to ${ch}.`); },
  topic: async i => { const ch = chOf(i); await ch.setTopic(i.options.getString('topic')); return send(i, `✅ Topic updated for ${ch}.`); },
  lock: async i => { const ch = chOf(i), r = i.options.getRole('role') || i.guild.roles.everyone; await ch.permissionOverwrites.edit(r, { SendMessages: false }); return send(i, `🔒 Locked ${ch} for ${r.name}.`); },
  unlock: async i => { const ch = chOf(i), r = i.options.getRole('role') || i.guild.roles.everyone; await ch.permissionOverwrites.edit(r, { SendMessages: null }); return send(i, `🔓 Unlocked ${ch} for ${r.name}.`); },
  hide: async i => { const ch = chOf(i); await ch.permissionOverwrites.edit(i.options.getMentionable('target'), { ViewChannel: false }); return send(i, `🙈 Hidden ${ch}.`); },
  unhide: async i => { const ch = chOf(i); await ch.permissionOverwrites.edit(i.options.getMentionable('target'), { ViewChannel: null }); return send(i, `👁️ ${ch} is visible again.`); },
  slowmode: async i => { const ch = chOf(i); await ch.setRateLimitPerUser(i.options.getInteger('seconds')); return send(i, `✅ Slowmode set in ${ch}.`); },
  clone: async i => { const ch = chOf(i), n = await ch.clone({ name: i.options.getString('name') || undefined }); return send(i, `✅ Cloned to ${n}.`); },
  info: async i => { const ch = chOf(i); return send(i, { embeds: [emb(`Channel: ${ch.name}`).addFields({ name: 'ID', value: ch.id, inline: true }, { name: 'Type', value: ChannelType[ch.type], inline: true }, { name: 'Category', value: ch.parent?.name || 'None', inline: true }, { name: 'Created', value: `<t:${ts(ch.createdTimestamp)}:R>`, inline: true }, { name: 'Topic', value: ch.topic || 'None' }, { name: 'Slowmode', value: `${ch.rateLimitPerUser || 0}s`, inline: true }, { name: 'NSFW', value: ch.nsfw ? 'Yes' : 'No', inline: true })] }); },
  permissions: async i => {
    const ch = i.options.getChannel('channel'), v = i.options.getString('value');
    await ch.permissionOverwrites.edit(i.options.getMentionable('target'), { [i.options.getString('permission')]: v === 'allow' ? true : v === 'deny' ? false : null });
    return send(i, `✅ Permission updated on ${ch}.`);
  }
};
H.category = {
  create: async i => { const c = await i.guild.channels.create({ name: i.options.getString('name'), type: ChannelType.GuildCategory }); return send(i, `✅ Created category **${c.name}**.`); },
  delete: async i => { const c = i.options.getChannel('category'); await c.delete(); return send(i, `✅ Deleted category **${c.name}**.`); },
  rename: async i => { const c = i.options.getChannel('category'); await c.setName(i.options.getString('name')); return send(i, '✅ Category renamed.'); }
};

// ---- 6/7. Security + Automod ----
async function quarantine(member, reason) {
  const sec = G(member.guild.id).security;
  sec.quarantined[member.id] = member.roles.cache.filter(r => r.id !== member.guild.id && !r.managed).map(r => r.id); save();
  const keep = member.roles.cache.filter(r => r.managed).map(r => r.id);
  await member.roles.set(sec.quarantineRole ? [...keep, sec.quarantineRole] : keep, reason).catch(() => {});
  if (!sec.quarantineRole) await member.timeout(7 * 864e5, reason).catch(() => {});
}
H.security = {
  status: async i => { const s = G(i.guild.id).security; const on = v => v ? '✅' : '❌'; return send(i, { embeds: [emb('🛡️ Security Status', `Anti-raid: ${on(s.antiRaid)} (threshold ${s.raidThreshold}/10s → ${s.raidAction})${s.raidMode ? ' 🚨 RAID MODE' : ''}\nMin account age: ${s.minAccountDays ? `${s.minAccountDays}d → ${s.accountAction}` : '❌'}\nAnti-bot: ${on(s.antiBot)}\nAnti-nuke: ${on(s.antiNuke)}\nQuarantine role: ${s.quarantineRole ? `<@&${s.quarantineRole}>` : 'None (uses timeout)'}\nVerification: ${s.verifyMode ? `${s.verifyMode} → <@&${s.verifyRole}>` : '❌'}\nTrusted users: ${s.trusted.map(id => `<@${id}>`).join(' ') || 'None'}`)] }); },
  antiraid: async i => { const s = G(i.guild.id).security; s.antiRaid = i.options.getBoolean('enabled'); s.raidThreshold = i.options.getInteger('threshold') || s.raidThreshold; s.raidAction = i.options.getString('action') || s.raidAction; save(); return send(i, `✅ Anti-raid ${s.antiRaid ? 'enabled' : 'disabled'} (threshold ${s.raidThreshold}, action ${s.raidAction}).`); },
  accountage: async i => { const s = G(i.guild.id).security; s.minAccountDays = i.options.getInteger('days'); s.accountAction = i.options.getString('action') || s.accountAction; save(); return send(i, `✅ Minimum account age: **${s.minAccountDays}** day(s) (${s.accountAction}).`); },
  antibot: async i => { G(i.guild.id).security.antiBot = i.options.getBoolean('enabled'); save(); return send(i, '✅ Anti-bot protection updated.'); },
  antinuke: async i => { G(i.guild.id).security.antiNuke = i.options.getBoolean('enabled'); save(); return send(i, '✅ Anti-nuke protection updated.'); },
  trust: async i => { const s = G(i.guild.id).security, u = i.options.getUser('user'); s.trusted = s.trusted.filter(x => x !== u.id); if (i.options.getBoolean('trusted')) s.trusted.push(u.id); save(); return send(i, `✅ ${u} is now ${i.options.getBoolean('trusted') ? 'trusted' : 'untrusted'}.`); },
  'quarantine-role': async i => { G(i.guild.id).security.quarantineRole = i.options.getRole('role').id; save(); return send(i, '✅ Quarantine role set.'); },
  quarantine: async i => { const m = i.options.getMember('user'); if (!m) return send(i, '❌ Member not found.'); const bad = canAct(i, m); if (bad) return send(i, '❌ ' + bad); await quarantine(m, i.options.getString('reason') || 'Quarantined'); addCase(i.guild, 'QUARANTINE', m.id, i.user.id, i.options.getString('reason')); return send(i, `🔒 ${m} quarantined.`); },
  release: async i => { const m = i.options.getMember('user'), s = G(i.guild.id).security; if (!m || !s.quarantined[m.id]) return send(i, '❌ That member is not quarantined.'); await m.roles.set(s.quarantined[m.id]).catch(() => {}); await m.timeout(null).catch(() => {}); delete s.quarantined[m.id]; save(); return send(i, `🔓 ${m} released.`); },
  lockdown: async i => { await defer(i); const on = i.options.getBoolean('enabled'), n = await setServerLock(i.guild, on, 'Manual lockdown'); G(i.guild.id).security.raidMode = on; save(); return send(i, `${on ? '🔒 Lockdown enabled' : '🔓 Lockdown lifted'} (${n} channels).`); },
  verification: async i => {
    const s = G(i.guild.id).security, role = i.options.getRole('role'), mode = i.options.getString('mode'), ch = i.options.getChannel('channel');
    s.verifyMode = mode; s.verifyRole = role.id; save();
    if (mode !== 'auto') {
      if (!ch) return send(i, '❌ Provide a `channel` to post the verification panel.');
      await ch.send({ embeds: [emb('✅ Verification', `Click the button below to verify${mode === 'captcha' ? ' (captcha required)' : ''} and gain access to the server.`)], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('verify_start').setLabel('Verify').setStyle(ButtonStyle.Success))] });
    }
    return send(i, `✅ Verification set to **${mode}** (role ${role}).`);
  }
};
H.automod = {
  enable: async i => { G(i.guild.id).automod.enabled = true; save(); return send(i, '✅ AutoMod enabled.'); },
  disable: async i => { G(i.guild.id).automod.enabled = false; save(); return send(i, '✅ AutoMod disabled.'); },
  badwords: async i => {
    const a = G(i.guild.id).automod, act = i.options.getString('action'), w = (i.options.getString('word') || '').toLowerCase().trim();
    if (act === 'list') return send(i, `📝 Prohibited words: ${a.badwords.map(x => `||${x}||`).join(', ') || 'None'}`);
    if (act === 'clear') { a.badwords = []; save(); return send(i, '✅ Cleared all prohibited words.'); }
    if (!w) return send(i, '❌ Provide a `word`.');
    a.badwords = a.badwords.filter(x => x !== w); if (act === 'add') a.badwords.push(w); save(); return send(i, `✅ ${act === 'add' ? 'Added' : 'Removed'} \`${w}\`.`);
  },
  whitelist: async i => {
    const a = G(i.guild.id).automod, act = i.options.getString('action'), r = i.options.getRole('role'), u = i.options.getUser('user');
    if (act === 'list') return send(i, `Whitelisted roles: ${a.whitelistRoles.map(x => `<@&${x}>`).join(' ') || 'None'}\nWhitelisted users: ${a.whitelistUsers.map(x => `<@${x}>`).join(' ') || 'None'}`);
    if (r) { a.whitelistRoles = a.whitelistRoles.filter(x => x !== r.id); if (act === 'add') a.whitelistRoles.push(r.id); }
    if (u) { a.whitelistUsers = a.whitelistUsers.filter(x => x !== u.id); if (act === 'add') a.whitelistUsers.push(u.id); }
    save(); return send(i, '✅ Whitelist updated.');
  },
  blacklist: async i => {
    const a = G(i.guild.id).automod, act = i.options.getString('action'), w = (i.options.getString('word') || '').toLowerCase().trim(), u = i.options.getUser('user');
    if (act === 'list') return send(i, `Blacklisted words: ${a.blacklistWords.map(x => `||${x}||`).join(', ') || 'None'}\nBlacklisted users: ${a.blacklistUsers.map(x => `<@${x}>`).join(' ') || 'None'}`);
    if (w) { a.blacklistWords = a.blacklistWords.filter(x => x !== w); if (act === 'add') a.blacklistWords.push(w); }
    if (u) { a.blacklistUsers = a.blacklistUsers.filter(x => x !== u.id); if (act === 'add') a.blacklistUsers.push(u.id); }
    save(); return send(i, '✅ Blacklist updated.');
  }
};
for (const r of AMRULES) H.automod[r] = async i => {
  const a = G(i.guild.id).automod, old = a.rules[r] || {};
  a.rules[r] = { enabled: i.options.getBoolean('enabled'), limit: i.options.getInteger('limit') ?? old.limit };
  save(); return send(i, `✅ AutoMod **${r}** ${a.rules[r].enabled ? 'enabled' : 'disabled'}${a.rules[r].limit ? ` (limit ${a.rules[r].limit})` : ''}.${a.enabled ? '' : '\n⚠️ AutoMod is currently disabled — use `/automod enable`.'}`);
};
const INVITE_RE = /(discord\.gg|discord(app)?\.com\/invite)\/[\w-]+/i, LINK_RE = /(https?:\/\/|www\.)\S+/i;
const spamMap = new Map(), repMap = new Map(), strikes = new Map();
async function runAutomod(message) {
  const g = G(message.guild.id), a = g.automod, member = message.member; if (!member) return false;
  const bl = a.blacklistUsers.includes(message.author.id);
  if (!a.enabled && !bl) return false;
  if (!bl && (isStaff(member) || member.permissions.has(P.ManageMessages) || a.whitelistUsers.includes(member.id) || member.roles.cache.some(r => a.whitelistRoles.includes(r.id)))) return false;
  const c = message.content, rules = a.rules, on = k => rules[k]?.enabled, lim = (k, d) => rules[k]?.limit || d, key = `${message.guild.id}:${message.author.id}`;
  let why = null;
  if (bl) why = 'Blacklisted user';
  else if ([...a.badwords, ...a.blacklistWords].some(w => new RegExp(`(^|\\W)${escRe(w)}(\\W|$)`, 'i').test(c))) why = 'Prohibited word';
  else if (on('invites') && INVITE_RE.test(c)) why = 'Discord invite';
  else if (on('links') && LINK_RE.test(c)) why = 'Link';
  else if (on('mentions') && message.mentions.users.size + message.mentions.roles.size + (message.mentions.everyone ? 1 : 0) >= lim('mentions', 5)) why = 'Mass mention';
  else if (on('emoji') && ((c.match(/\p{Extended_Pictographic}/gu) || []).length + (c.match(/<a?:\w+:\d+>/g) || []).length) >= lim('emoji', 10)) why = 'Excessive emojis';
  else if (on('caps')) { const letters = c.replace(/[^a-zA-Z]/g, ''); if (letters.length >= 10 && (letters.replace(/[^A-Z]/g, '').length / letters.length) * 100 >= lim('caps', 70)) why = 'Excessive caps'; }
  if (!why && on('repeats')) { const r = repMap.get(key) || { c: '', n: 0 }; r.n = r.c === c.toLowerCase() ? r.n + 1 : 1; r.c = c.toLowerCase(); repMap.set(key, r); if (c && r.n >= lim('repeats', 3)) { why = 'Repeated messages'; repMap.delete(key); } }
  if (!why && on('antispam')) { const arr = (spamMap.get(key) || []).filter(t => Date.now() - t < 5000); arr.push(Date.now()); spamMap.set(key, arr); if (arr.length >= lim('antispam', 5)) { why = 'Spam / flood'; spamMap.delete(key); } }
  if (!why) return false;
  await message.delete().catch(() => {});
  const s = strikes.get(key) || { n: 0, t: 0 }; if (Date.now() - s.t > 600000) s.n = 0; s.n++; s.t = Date.now(); strikes.set(key, s);
  const note = await message.channel.send({ content: `⚠️ ${message.author}, your message was removed: **${why}** (strike ${s.n}/3)`, allowedMentions: { users: [message.author.id] } }).catch(() => null);
  setTimeout(() => note?.delete().catch(() => {}), 6000);
  logEvent(message.guild, 'moderation', '🤖 AutoMod', `**User:** ${message.author} • **Channel:** ${message.channel}\n**Rule:** ${why}\n**Content:** ${trunc(c, 500) || '(none)'}`, COLORS.warn);
  if (s.n >= 3 && member.moderatable) { await member.timeout(10 * 60000, 'AutoMod: repeated violations').catch(() => {}); addCase(message.guild, 'AUTOTIMEOUT', member.id, client.user.id, `AutoMod: ${why}`); s.n = 0; }
  return true;
}
const joins = new Map();
async function punishJoin(member, action, reason) {
  logEvent(member.guild, 'security', '🛡️ Join Blocked', `${member.user.tag} (\`${member.id}\`) → **${action}**\n${reason}`, COLORS.err);
  if (action === 'ban') await member.ban({ reason }).catch(() => {});
  else if (action === 'quarantine') await quarantine(member, reason);
  else await member.kick(reason).catch(() => {});
}
async function joinSecurity(member) {
  const guild = member.guild, sec = G(guild.id).security, age = (Date.now() - member.user.createdTimestamp) / 864e5;
  if (sec.minAccountDays && age < sec.minAccountDays) { await punishJoin(member, sec.accountAction || 'kick', `Account younger than ${sec.minAccountDays} day(s)`); return true; }
  if (age < 7 && !member.user.avatar) logEvent(guild, 'security', '🕵️ Suspicious Account', `${member} — ${age.toFixed(1)} days old with no avatar.`, COLORS.warn);
  if (sec.antiRaid) {
    const arr = (joins.get(guild.id) || []).filter(t => Date.now() - t < 10000); arr.push(Date.now()); joins.set(guild.id, arr);
    if (!sec.raidMode && arr.length >= sec.raidThreshold) {
      sec.raidMode = true; save();
      logEvent(guild, 'security', '🚨 Raid Detected', `${arr.length} joins in 10 seconds. Raid mode active for 5 minutes (action: ${sec.raidAction}).`, COLORS.err);
      if (sec.raidAction === 'lockdown') setServerLock(guild, true, 'Raid detected');
      setTimeout(() => { sec.raidMode = false; save(); if (sec.raidAction === 'lockdown') setServerLock(guild, false, 'Raid mode ended'); }, 300000);
    }
    if (sec.raidMode && sec.raidAction !== 'lockdown') { await punishJoin(member, sec.raidAction, 'Raid protection'); return true; }
  }
  return false;
}
const actionCounts = new Map();
async function guardAudit(guild, type, label, targetId) {
  const sec = G(guild.id).security; if (!sec.antiNuke) return;
  try {
    const e = (await guild.fetchAuditLogs({ type, limit: 1 })).entries.first();
    if (!e || Date.now() - e.createdTimestamp > 8000 || (targetId && e.targetId !== targetId)) return;
    const ex = e.executor;
    if (!ex || ex.id === client.user.id || ex.id === guild.ownerId || isOwner(ex.id) || sec.trusted.includes(ex.id)) return;
    const key = `${guild.id}:${ex.id}`, arr = (actionCounts.get(key) || []).filter(t => Date.now() - t < 10000); arr.push(Date.now()); actionCounts.set(key, arr);
    logEvent(guild, 'security', '🚨 Unauthorized Action', `${ex} performed **${label}**`, COLORS.err);
    if (arr.length >= 3) { const m = await guild.members.fetch(ex.id).catch(() => null); if (m) { await quarantine(m, `Anti-nuke: mass ${label}`); logEvent(guild, 'security', '🔒 Executor Quarantined', `${ex} was quarantined for repeated **${label}**.`, COLORS.err); } }
  } catch (e) { /* missing audit log perms */ }
}

// ---- 8. Welcome & goodbye ----
const buildWelcome = (cfg, m, kind) => {
  const e = emb(vars(cfg.title || (kind === 'welcome' ? 'Welcome!' : 'Goodbye!'), m), vars(cfg.message || (kind === 'welcome' ? 'Welcome {user} to **{server}**!' : '**{tag}** has left **{server}**.'), m), cfg.color || (kind === 'welcome' ? COLORS.ok : COLORS.err)).setThumbnail(m.user.displayAvatarURL());
  if (cfg.image) e.setImage(cfg.image);
  return e;
};
for (const kind of ['welcome', 'goodbye']) {
  const apply = (i, cfg) => {
    const ch = i.options.getChannel('channel'); if (ch) cfg.channel = ch.id;
    const msg = i.options.getString('message'); if (msg) cfg.message = nl(msg);
    for (const k of ['title', 'image']) { const v = i.options.getString(k); if (v) cfg[k] = v; }
    const c = i.options.getString('color'); if (c) cfg.color = hexColor(c);
    if (kind === 'welcome') { const dm = i.options.getBoolean('dm'); if (dm !== null) cfg.dm = dm; const r = i.options.getRole('role'); if (r) cfg.role = r.id; }
    save();
  };
  H[kind] = {
    setup: async i => { const cfg = G(i.guild.id)[kind]; cfg.enabled = true; apply(i, cfg); return send(i, `✅ ${kind} configured in <#${cfg.channel}>.`); },
    edit: async i => { const cfg = G(i.guild.id)[kind]; if (!cfg.channel) return send(i, `❌ Run \`/${kind} setup\` first.`); apply(i, cfg); return send(i, `✅ ${kind} updated.`); },
    test: async i => { const cfg = G(i.guild.id)[kind]; return send(i, { content: cfg.channel ? `Preview (channel <#${cfg.channel}>):` : '⚠️ Not configured yet — default preview:', embeds: [buildWelcome(cfg, i.member, kind)] }); },
    disable: async i => { G(i.guild.id)[kind].enabled = false; save(); return send(i, `✅ ${kind} messages disabled.`); }
  };
}

// ---- 9. Logs ----
H.logs = {
  setup: async i => { const g = G(i.guild.id); g.settings.logChannel = i.options.getChannel('channel').id; g.logs.enabled = true; save(); return send(i, `✅ Logging enabled in <#${g.settings.logChannel}>.`); },
  channel: async i => { G(i.guild.id).settings.logChannel = i.options.getChannel('channel').id; save(); return send(i, '✅ Log channel updated.'); },
  enable: async i => { const l = G(i.guild.id).logs, c = i.options.getString('category'); if (c) l.disabled = l.disabled.filter(x => x !== c); else { l.enabled = true; l.disabled = []; } save(); return send(i, `✅ Logging ${c ? `category **${c}**` : ''} enabled.`); },
  disable: async i => { const l = G(i.guild.id).logs, c = i.options.getString('category'); if (c) { if (!l.disabled.includes(c)) l.disabled.push(c); } else l.enabled = false; save(); return send(i, `✅ Logging ${c ? `category **${c}**` : ''} disabled.`); },
  configuration: async i => { const g = G(i.guild.id); return send(i, { embeds: [emb('📜 Logging Configuration', `**Channel:** ${g.settings.logChannel ? `<#${g.settings.logChannel}>` : 'Not set'}\n**Enabled:** ${g.logs.enabled ? 'Yes' : 'No'}\n**Categories:**\n${LOG_CATS.map(c => `${g.logs.disabled.includes(c) ? '❌' : '✅'} ${c}`).join('\n')}`)] }); },
  test: async i => { await logEvent(i.guild, 'server', '🧪 Test Log', `Test log triggered by ${i.user}.`); return send(i, '✅ Test log sent (if a log channel is configured).'); }
};

// ---- 10. Tickets ----
const ticketStaff = m => isStaff(m) || (G(m.guild.id).tickets.supportRole && m.roles.cache.has(G(m.guild.id).tickets.supportRole));
async function ticketLog(guild, embed, files) {
  const t = G(guild.id).tickets, g = G(guild.id), id = t.logChannel || g.settings.logChannel, ch = id && guild.channels.cache.get(id);
  if (ch) await ch.send({ embeds: [embed], files: files || [] }).catch(() => {});
}
const tkButtons = closed => new ActionRowBuilder().addComponents(...(closed
  ? [new ButtonBuilder().setCustomId('tk_reopen').setLabel('Reopen').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('tk_transcript').setLabel('Transcript').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('tk_delete').setLabel('Delete').setStyle(ButtonStyle.Danger)]
  : [new ButtonBuilder().setCustomId('tk_close').setLabel('Close').setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId('tk_claim').setLabel('Claim').setStyle(ButtonStyle.Success)]));
async function openTicket(i, reason) {
  const g = G(i.guild.id), t = g.tickets, guild = i.guild;
  const ex = Object.entries(t.open).find(([cid, v]) => v.owner === i.user.id && !v.closed && guild.channels.cache.has(cid));
  if (ex) return send(i, `⚠️ You already have an open ticket: <#${ex[0]}>`);
  const wait = 60000 - (Date.now() - (t.cooldowns[i.user.id] || 0));
  if (wait > 0) return send(i, `⏳ Please wait ${Math.ceil(wait / 1000)}s before opening another ticket.`);
  t.counter++; const num = t.counter, name = `ticket-${String(num).padStart(4, '0')}`;
  const staffRoles = [t.supportRole, g.settings.adminRole, g.settings.modRole, g.settings.staffRole].filter(Boolean);
  const allow = [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.AttachFiles, P.EmbedLinks];
  const ch = await guild.channels.create({
    name, type: ChannelType.GuildText, parent: t.category || undefined, topic: `Ticket #${num} | ${i.user.tag} | ${i.user.id}`,
    permissionOverwrites: [{ id: guild.id, deny: [P.ViewChannel] }, { id: i.user.id, allow }, { id: client.user.id, allow: [...allow, P.ManageChannels, P.ManageMessages] }, ...staffRoles.map(id => ({ id, allow }))]
  });
  t.open[ch.id] = { num, owner: i.user.id, reason, claimedBy: null, closed: false, createdAt: Date.now() };
  t.cooldowns[i.user.id] = Date.now(); save();
  await ch.send({ content: `${i.user} ${staffRoles.map(r => `<@&${r}>`).join(' ')}`, embeds: [emb(`🎫 Ticket #${num}`, `**Opened by:** ${i.user}\n**Reason:** ${trunc(reason, 1500)}\n\nA staff member will be with you shortly.`)], components: [tkButtons(false)] });
  ticketLog(guild, emb('🎫 Ticket Opened', `**Ticket:** ${ch} (#${num})\n**User:** ${i.user}\n**Reason:** ${trunc(reason, 500)}`, COLORS.ok));
  return send(i, `✅ Ticket created: ${ch}`);
}
async function closeTicket(i, reason) {
  const g = G(i.guild.id), tk = g.tickets.open[i.channel.id];
  if (!tk) return send(i, '❌ This is not a ticket channel.');
  if (i.user.id !== tk.owner && !ticketStaff(i.member)) return send(i, '❌ Only the ticket owner or staff can close this ticket.');
  if (tk.closed) return send(i, '⚠️ This ticket is already closed.');
  await defer(i, false);
  tk.closed = true; save();
  await i.channel.permissionOverwrites.edit(tk.owner, { SendMessages: false }).catch(() => {});
  await i.channel.setName(`closed-${String(tk.num).padStart(4, '0')}`).catch(() => {});
  const file = await buildTranscript(i.channel);
  ticketLog(i.guild, emb('🔒 Ticket Closed', `**Ticket:** #${tk.num}\n**Owner:** <@${tk.owner}>\n**Closed by:** ${i.user}\n**Claimed by:** ${tk.claimedBy ? `<@${tk.claimedBy}>` : 'Nobody'}\n**Reason:** ${reason}`, COLORS.err), [file]);
  const owner = await client.users.fetch(tk.owner).catch(() => null);
  if (owner) owner.send({ embeds: [emb(`How was your support in ${i.guild.name}?`, `Your ticket **#${tk.num}** was closed. Please rate your experience:`)], components: [new ActionRowBuilder().addComponents([1, 2, 3, 4, 5].map(n => new ButtonBuilder().setCustomId(`tkrate:${i.guild.id}:${tk.num}:${n}`).setLabel('⭐'.repeat(n)).setStyle(ButtonStyle.Secondary)))] }).catch(() => {});
  return send(i, { embeds: [emb('🔒 Ticket Closed', `Closed by ${i.user}\n**Reason:** ${reason}`, COLORS.err)], components: [tkButtons(true)] });
}
async function reopenTicket(i) {
  const g = G(i.guild.id), tk = g.tickets.open[i.channel.id];
  if (!tk) return send(i, '❌ This is not a ticket channel.');
  if (!ticketStaff(i.member)) return send(i, '❌ Only staff can reopen tickets.');
  if (!tk.closed) return send(i, '⚠️ This ticket is open.');
  await defer(i, false); tk.closed = false; save();
  await i.channel.permissionOverwrites.edit(tk.owner, { SendMessages: true }).catch(() => {});
  await i.channel.setName(`ticket-${String(tk.num).padStart(4, '0')}`).catch(() => {});
  return send(i, { embeds: [emb('🔓 Ticket Reopened', `Reopened by ${i.user}`, COLORS.ok)], components: [tkButtons(false)] });
}
async function deleteTicket(i) {
  const g = G(i.guild.id), tk = g.tickets.open[i.channel.id];
  if (!tk) return send(i, '❌ This is not a ticket channel.');
  if (!ticketStaff(i.member)) return send(i, '❌ Only staff can delete tickets.');
  await defer(i, false);
  const file = await buildTranscript(i.channel);
  ticketLog(i.guild, emb('🗑️ Ticket Deleted', `**Ticket:** #${tk.num}\n**Owner:** <@${tk.owner}>\n**Deleted by:** ${i.user}`, COLORS.err), [file]);
  await send(i, '🗑️ Deleting this ticket in 5 seconds...');
  delete g.tickets.open[i.channel.id]; save();
  setTimeout(() => i.channel.delete().catch(() => {}), 5000);
}
async function claimTicket(i) {
  const g = G(i.guild.id), tk = g.tickets.open[i.channel.id];
  if (!tk) return send(i, '❌ This is not a ticket channel.');
  if (!ticketStaff(i.member)) return send(i, '❌ Only staff can claim tickets.');
  if (tk.claimedBy) return send(i, `⚠️ Already claimed by <@${tk.claimedBy}>.`);
  tk.claimedBy = i.user.id; save();
  return send(i, { embeds: [emb('🙋 Ticket Claimed', `${i.user} will handle this ticket.`, COLORS.ok)] }, false);
}
async function ticketTranscript(i) {
  const tk = G(i.guild.id).tickets.open[i.channel.id];
  if (!tk) return send(i, '❌ This is not a ticket channel.');
  if (!ticketStaff(i.member) && i.user.id !== tk.owner) return send(i, '❌ No permission.');
  await defer(i); const file = await buildTranscript(i.channel);
  return send(i, { content: '📄 Transcript generated:', files: [file] });
}
const ticketOnly = (i, fn) => { const tk = G(i.guild.id).tickets.open[i.channel.id]; if (!tk) return send(i, '❌ This is not a ticket channel.'); if (!ticketStaff(i.member)) return send(i, '❌ Only staff can do that.'); return fn(tk); };
H.ticket = {
  setup: async i => {
    if (!isStaff(i.member)) return send(i, '❌ Staff only.');
    const t = G(i.guild.id).tickets, ch = i.options.getChannel('channel');
    t.supportRole = i.options.getRole('support_role')?.id || t.supportRole; t.category = i.options.getChannel('category')?.id || t.category; t.logChannel = i.options.getChannel('log_channel')?.id || t.logChannel; save();
    const e = emb(i.options.getString('title') || '🎫 Support Tickets', nl(i.options.getString('description') || 'Need help? Click the button below to open a ticket and our staff will assist you.'));
    const img = i.options.getString('image'); if (img) e.setImage(img);
    await ch.send({ embeds: [e], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('tk_open').setLabel('Create Ticket').setEmoji('🎫').setStyle(ButtonStyle.Primary))] });
    return send(i, `✅ Ticket panel posted in ${ch}.`);
  },
  create: async i => { await defer(i); return openTicket(i, i.options.getString('reason')); },
  close: i => closeTicket(i, i.options.getString('reason') || 'No reason provided'),
  reopen: reopenTicket, delete: deleteTicket, claim: claimTicket, transcript: ticketTranscript,
  add: i => ticketOnly(i, async () => { const u = i.options.getUser('user'); await i.channel.permissionOverwrites.edit(u, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true }); return send(i, `✅ Added ${u} to the ticket.`, false); }),
  remove: i => ticketOnly(i, async tk => { const u = i.options.getUser('user'); if (u.id === tk.owner) return send(i, '❌ You cannot remove the ticket owner.'); await i.channel.permissionOverwrites.delete(u); return send(i, `✅ Removed ${u} from the ticket.`, false); }),
  rename: i => ticketOnly(i, async () => { await i.channel.setName(i.options.getString('name')); return send(i, '✅ Ticket renamed.'); })
};

// ---- 11. Reaction roles & self roles ----
const emojiKey = raw => (raw || '').match(/\d{17,}/)?.[0] || (raw || '').trim();
H.reactionrole = {
  create: async i => {
    await defer(i); const ch = i.options.getChannel('channel') || i.channel, type = i.options.getString('type') || 'button', mode = i.options.getString('mode') || 'multiple';
    const roles = [];
    for (let n = 1; n <= 5; n++) { const r = i.options.getRole(`role${n}`); if (r && !roles.find(x => x.roleId === r.id)) roles.push({ roleId: r.id, emoji: i.options.getString(`emoji${n}`) || null }); }
    const bad = roles.map(x => roleBlock({ guild: i.guild, member: i.member }, i.guild.roles.cache.get(x.roleId))).find(Boolean);
    if (bad) return send(i, '❌ ' + bad);
    const e = emb(i.options.getString('title'), nl(i.options.getString('description')) + (type === 'reaction' ? '\n\n' + roles.map(x => `${x.emoji || '▫️'} — <@&${x.roleId}>`).join('\n') : ''));
    const payload = { embeds: [e] };
    if (type === 'button') payload.components = [new ActionRowBuilder().addComponents(roles.map(x => { const b = new ButtonBuilder().setCustomId(`rr:${x.roleId}`).setLabel(i.guild.roles.cache.get(x.roleId).name.slice(0, 80)).setStyle(ButtonStyle.Secondary); if (x.emoji) { try { b.setEmoji(x.emoji); } catch (er) { /* ignore */ } } return b; }))];
    const msg = await ch.send(payload);
    if (type === 'reaction') for (const x of roles) if (x.emoji) await msg.react(x.emoji).catch(() => {});
    G(i.guild.id).panels[msg.id] = { kind: type, mode, roles, required: i.options.getRole('required_role')?.id || null, channel: ch.id }; save();
    return send(i, `✅ Role panel posted in ${ch}. (ID: \`${msg.id}\`)`);
  },
  delete: async i => {
    const g = G(i.guild.id), id = i.options.getString('message_id'), p = g.panels[id]; if (!p) return send(i, '❌ Panel not found.');
    const ch = i.guild.channels.cache.get(p.channel); const msg = ch && await ch.messages.fetch(id).catch(() => null); if (msg) await msg.delete().catch(() => {});
    delete g.panels[id]; save(); return send(i, '✅ Panel deleted.');
  },
  edit: async i => {
    const g = G(i.guild.id), id = i.options.getString('message_id'), p = g.panels[id]; if (!p) return send(i, '❌ Panel not found.');
    const ch = i.guild.channels.cache.get(p.channel), msg = ch && await ch.messages.fetch(id).catch(() => null); if (!msg) return send(i, '❌ Panel message not found.');
    const e = EmbedBuilder.from(msg.embeds[0]), t = i.options.getString('title'), d = i.options.getString('description');
    if (t) e.setTitle(t); if (d) e.setDescription(nl(d) + (p.kind === 'reaction' ? '\n\n' + p.roles.map(x => `${x.emoji || '▫️'} — <@&${x.roleId}>`).join('\n') : ''));
    await msg.edit({ embeds: [e] }); return send(i, '✅ Panel updated.');
  }
};
H.selfrole = {
  setup: async i => {
    await defer(i); const ch = i.options.getChannel('channel') || i.channel, mode = i.options.getString('mode') || 'multiple', cat = i.options.getString('category');
    const roles = []; for (let n = 1; n <= 10; n++) { const r = i.options.getRole(`role${n}`); if (r && !roles.find(x => x.roleId === r.id)) roles.push({ roleId: r.id }); }
    const bad = roles.map(x => roleBlock({ guild: i.guild, member: i.member }, i.guild.roles.cache.get(x.roleId))).find(Boolean); if (bad) return send(i, '❌ ' + bad);
    const icon = { general: '🎭', color: '🎨', game: '🎮', notification: '🔔' }[cat];
    const menu = new StringSelectMenuBuilder().setCustomId('sr').setPlaceholder(`${icon} Select your ${cat} roles...`).setMinValues(0).setMaxValues(mode === 'single' ? 1 : roles.length)
      .addOptions(roles.map(x => new StringSelectMenuOptionBuilder().setLabel(i.guild.roles.cache.get(x.roleId).name.slice(0, 100)).setValue(x.roleId)));
    const msg = await ch.send({ embeds: [emb(`${icon} ${i.options.getString('title')}`, nl(i.options.getString('description') || 'Pick your roles from the menu below.'))], components: [new ActionRowBuilder().addComponents(menu)] });
    G(i.guild.id).panels[msg.id] = { kind: 'select', mode, roles, required: i.options.getRole('required_role')?.id || null, channel: ch.id }; save();
    return send(i, `✅ Self-role menu posted in ${ch}. (ID: \`${msg.id}\`)`);
  },
  remove: H.reactionrole.delete
};

// ---- 12. Leveling ----
const lvl = xp => Math.floor(Math.sqrt(xp / 100));
async function applyLevelRoles(guild, userId, level) {
  const g = G(guild.id), m = await guild.members.fetch(userId).catch(() => null); if (!m) return;
  for (const [l, r] of Object.entries(g.levelRoles)) if (level >= +l && !m.roles.cache.has(r)) await m.roles.add(r).catch(() => {});
}
async function addXp(guild, userId, amount, channel) {
  const g = G(guild.id); if (!g.level.enabled) return;
  const u = (g.xp[userId] ||= { xp: 0, level: 0, msgs: 0 }), before = u.level;
  u.xp += Math.max(1, Math.round(amount * (g.level.multiplier || 1))); u.level = lvl(u.xp); save();
  if (u.level > before) {
    applyLevelRoles(guild, userId, u.level);
    if (g.level.announce) { const ch = (g.level.channel && guild.channels.cache.get(g.level.channel)) || channel; ch?.send({ content: `🎉 <@${userId}> reached **level ${u.level}**!`, allowedMentions: { users: [userId] } }).catch(() => {}); }
  }
}
const bar = (p, n = 12) => '█'.repeat(Math.round(p * n)) + '░'.repeat(n - Math.round(p * n));
H.rank = async i => {
  const u = i.options.getUser('user') || i.user, g = G(i.guild.id), x = g.xp[u.id] || { xp: 0, level: 0 };
  const pos = Object.entries(g.xp).sort((a, b) => b[1].xp - a[1].xp).findIndex(([id]) => id === u.id) + 1;
  const cur = 100 * x.level ** 2, nxt = 100 * (x.level + 1) ** 2, p = (x.xp - cur) / (nxt - cur);
  return send(i, { embeds: [emb(`🏆 ${u.tag}`, `**Rank:** ${pos ? '#' + pos : 'Unranked'}\n**Level:** ${x.level}\n**XP:** ${x.xp} / ${nxt}\n\`${bar(p)}\` ${Math.round(p * 100)}%`).setThumbnail(u.displayAvatarURL())] }, false);
};
H.level = async i => {
  const u = i.options.getUser('user') || i.user, g = G(i.guild.id), x = g.xp[u.id] || { xp: 0, level: 0 };
  const next = Object.entries(g.levelRoles).map(([l, r]) => [+l, r]).filter(([l]) => l > x.level).sort((a, b) => a[0] - b[0])[0];
  return send(i, `📈 **${u.tag}** is level **${x.level}** with **${x.xp} XP**.${next ? `\nNext reward: <@&${next[1]}> at level **${next[0]}**.` : ''}`, false);
};
H.leaderboard = async i => {
  const top = Object.entries(G(i.guild.id).xp).sort((a, b) => b[1].xp - a[1].xp).slice(0, 10);
  return send(i, { embeds: [emb('🏆 XP Leaderboard', top.map(([id, x], n) => `**${n + 1}.** <@${id}> — Level ${x.level} (${x.xp} XP)`).join('\n') || 'No data yet.')] }, false);
};
H.setxp = async i => { const u = i.options.getUser('user'), g = G(i.guild.id), x = (g.xp[u.id] ||= { xp: 0, level: 0, msgs: 0 }); x.xp = i.options.getInteger('amount'); x.level = lvl(x.xp); save(); applyLevelRoles(i.guild, u.id, x.level); return send(i, `✅ Set **${u.tag}** to **${x.xp} XP** (level ${x.level}).`); };
H.resetxp = async i => { const u = i.options.getUser('user'), g = G(i.guild.id); if (u) delete g.xp[u.id]; else g.xp = {}; save(); return send(i, u ? `✅ Reset XP for **${u.tag}**.` : '✅ Reset XP for everyone.'); };
H.levelrole = {
  add: async i => { G(i.guild.id).levelRoles[i.options.getInteger('level')] = i.options.getRole('role').id; save(); return send(i, '✅ Level reward added.'); },
  remove: async i => { delete G(i.guild.id).levelRoles[i.options.getInteger('level')]; save(); return send(i, '✅ Level reward removed.'); },
  list: async i => { const l = Object.entries(G(i.guild.id).levelRoles).sort((a, b) => a[0] - b[0]); return send(i, { embeds: [emb('🎖️ Level Rewards', l.map(([lv, r]) => `Level **${lv}** → <@&${r}>`).join('\n') || 'None set.')] }); }
};
H.levelconfig = async i => {
  const l = G(i.guild.id).level, m = i.options.getNumber('multiplier'), c = i.options.getChannel('channel'), a = i.options.getBoolean('announce'), e = i.options.getBoolean('enabled');
  if (m) l.multiplier = m; if (c) l.channel = c.id; if (a !== null) l.announce = a; if (e !== null) l.enabled = e; save();
  return send(i, `✅ Leveling: ${l.enabled ? 'on' : 'off'} • multiplier **x${l.multiplier}** • announcements ${l.announce ? 'on' : 'off'}${l.channel ? ` in <#${l.channel}>` : ''}.`);
};

// ---- 13. Utility ----
H.help = async i => send(i, { embeds: [emb('📖 Bot Commands').addFields(
  { name: '🏠 Server', value: '`/serverinfo` `/servericon` `/serverbanner` `/servername` `/serverrules` `/serverstats` `/serverlock` `/serverunlock` `/slowmode` `/announce` `/embed` `/purge` `/nuke` `/backup` `/restore`' },
  { name: '🔨 Moderation', value: '`/ban` `/unban` `/tempban` `/kick` `/timeout` `/untimeout` `/mute` `/unmute` `/warn` `/warnings` `/clearwarnings` `/softban` `/massban` `/deafen` `/undeafen` `/disconnect` `/move` `/modlogs` `/case` `/clear`' },
  { name: '🎭 Roles & Members', value: '`/role` `/userinfo` `/avatar` `/banner` `/membercount` `/joinedat` `/accountage` `/nickname` `/massnick` `/profile` `/inrole` `/botinfo` `/bots`' },
  { name: '📺 Channels', value: '`/channel` `/category` `/vc`' },
  { name: '🛡️ Protection', value: '`/security` `/automod` `/logs`' },
  { name: '👋 Community', value: '`/welcome` `/goodbye` `/ticket` `/reactionrole` `/selfrole` `/giveaway` `/application` `/suggest` `/suggestions` `/report` `/feedback`' },
  { name: '📈 Leveling', value: '`/rank` `/level` `/leaderboard` `/setxp` `/resetxp` `/levelrole` `/levelconfig`' },
  { name: '🧰 Utility', value: '`/ping` `/uptime` `/invite` `/support` `/poll` `/remind` `/translate` `/calculate` `/afk` `/whois` `/say`' },
  { name: '👔 Staff & Config', value: '`/staff` `/config`' },
  { name: '📌 Prefix', value: '`!stick <text>` — sticky message (or reply to a message with `!stick`)\n`!unstick` — remove the sticky\nUse `/prefix set` to change `!` to your own prefix.' },
  { name: '🐟 Fish Game', value: '`/fish feed` `/fish status` `/fish leaderboard` `/fish collection` `/fish profile` (prefix: `feed`, `fish`)' },
  { name: '✨ Extras', value: '`/prefix` `/uwulock` `/reminder`' },
  { name: '🎵 Music', value: '`/play` `/pause` `/resume` `/skip` `/stop` `/queue` `/nowplaying` `/volume` `/loop`' })] }, false);
H.ping = async i => { const s = Date.now(); await send(i, '🏓 Pinging...', false); return i.editReply(`🏓 Pong! Roundtrip: **${Date.now() - s}ms** • WebSocket: **${client.ws.ping}ms**`); };
H.uptime = async i => send(i, `⏱️ Uptime: **${fmtDur(Date.now() - START)}**`, false);
H.invite = async i => send(i, `🔗 [Invite me](${client.generateInvite({ scopes: ['bot', 'applications.commands'], permissions: [P.Administrator] })})`);
H.support = async i => send(i, { embeds: [emb('🆘 Support', `Need help? Join our support server or open a ticket.\n${SUPPORT_URL}`)] });
H.poll = async i => {
  const opts = [1, 2, 3, 4, 5].map(n => i.options.getString(`option${n}`)).filter(Boolean), nums = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'];
  await i.reply({ embeds: [emb('📊 ' + i.options.getString('question'), opts.map((o, k) => `${nums[k]} ${o}`).join('\n\n')).setFooter({ text: `Poll by ${i.user.tag}` })] });
  const m = await i.fetchReply(); for (let k = 0; k < opts.length; k++) await m.react(nums[k]).catch(() => {});
};
H.remind = async i => {
  const d = parseDuration(i.options.getString('time')); if (!d || d < 5000) return send(i, '❌ Invalid time. Use e.g. 10m, 2h, 1d.');
  db.global.reminders.push({ user: i.user.id, channel: i.channel.id, at: Date.now() + d, text: i.options.getString('message') }); save();
  return send(i, `⏰ I'll remind you <t:${ts(Date.now() + d)}:R>.`);
};
H.translate = async i => {
  await defer(i);
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(i.options.getString('text'))}&langpair=${encodeURIComponent((i.options.getString('from') || 'Autodetect') + '|' + i.options.getString('to'))}`;
    const j = await (await fetch(url)).json();
    return send(i, { embeds: [emb('🌐 Translation', `**Original:** ${trunc(i.options.getString('text'), 500)}\n**Translated:** ${j.responseData.translatedText}`)] });
  } catch (e) { return send(i, '❌ Translation failed.'); }
};
H.calculate = async i => {
  const ex = i.options.getString('expression').replace(/\s+/g, '').replace(/\^/g, '**');
  if (!/^[\d+\-*/().%]+$/.test(ex) || ex.length > 100) return send(i, '❌ Invalid expression.');
  try { const r = Function(`"use strict"; return (${ex})`)(); if (!isFinite(r)) throw 0; return send(i, `🧮 \`${i.options.getString('expression')}\` = **${r}**`, false); } catch (e) { return send(i, '❌ Could not calculate that.'); }
};
H.afk = async i => { G(i.guild.id).afk[i.user.id] = { reason: i.options.getString('reason') || 'AFK', since: Date.now() }; save(); return send(i, `💤 ${i.user}, you are now AFK: **${i.options.getString('reason') || 'AFK'}**`, false); };
H.suggest = async i => {
  const g = G(i.guild.id), ch = g.settings.suggestChannel && i.guild.channels.cache.get(g.settings.suggestChannel);
  if (!ch) return send(i, '❌ Suggestions channel not set. Ask an admin to use `/config channels`.');
  const id = ++g.suggestSeq; const msg = await ch.send({ embeds: [emb(`💡 Suggestion #${id}`, i.options.getString('suggestion')).setAuthor({ name: i.user.tag, iconURL: i.user.displayAvatarURL() }).addFields({ name: 'Status', value: '⏳ Pending' })] });
  await msg.react('👍').catch(() => {}); await msg.react('👎').catch(() => {});
  g.suggestions[id] = { user: i.user.id, text: i.options.getString('suggestion'), status: 'pending', msg: msg.id, channel: ch.id }; save();
  return send(i, `✅ Suggestion #${id} submitted in ${ch}.`);
};
H.suggestions = async i => {
  const g = G(i.guild.id), id = i.options.getInteger('id'), st = i.options.getString('status');
  if (id && st) {
    if (!isStaff(i.member)) return send(i, '❌ Staff only.');
    const s = g.suggestions[id]; if (!s) return send(i, '❌ Suggestion not found.');
    s.status = st; save();
    const ch = i.guild.channels.cache.get(s.channel), msg = ch && await ch.messages.fetch(s.msg).catch(() => null);
    if (msg) { const e = EmbedBuilder.from(msg.embeds[0]).setColor(st === 'approved' ? COLORS.ok : st === 'denied' ? COLORS.err : COLORS.warn).setFields({ name: 'Status', value: `${{ approved: '✅ Approved', denied: '❌ Denied', considering: '🤔 Considering' }[st]} by ${i.user.tag}${i.options.getString('note') ? `\n${i.options.getString('note')}` : ''}` }); await msg.edit({ embeds: [e] }).catch(() => {}); }
    return send(i, `✅ Suggestion #${id} marked **${st}**.`);
  }
  const l = Object.entries(g.suggestions).slice(-10).reverse();
  return send(i, { embeds: [emb('💡 Recent Suggestions', l.map(([k, s]) => `**#${k}** [${s.status}] — ${trunc(s.text, 100)}`).join('\n') || 'No suggestions yet.')] });
};
async function routeToChannel(i, key, embed) {
  const g = G(i.guild.id), ch = (g.settings[key] && i.guild.channels.cache.get(g.settings[key])) || (g.settings.logChannel && i.guild.channels.cache.get(g.settings.logChannel));
  if (!ch) return false; await ch.send({ embeds: [embed] }); return true;
}
H.report = async i => { const u = i.options.getUser('user'); const ok = await routeToChannel(i, 'reportChannel', emb('🚨 New Report', `**Reported:** ${u} (\`${u.id}\`)\n**By:** ${i.user}\n**Channel:** ${i.channel}\n**Reason:** ${i.options.getString('reason')}`, COLORS.err)); return send(i, ok ? '✅ Your report was sent to the staff.' : '❌ No report channel configured.'); };
H.feedback = async i => { const ok = await routeToChannel(i, 'feedbackChannel', emb('💬 New Feedback', `**From:** ${i.user}\n${i.options.getString('message')}`)); return send(i, ok ? '✅ Thanks for your feedback!' : '❌ No feedback channel configured.'); };
H.say = async i => { const ch = i.options.getChannel('channel') || i.channel; await ch.send({ content: nl(i.options.getString('message')), allowedMentions: { parse: [] } }); return send(i, `✅ Sent in ${ch}.`); };

// ---- 14. Voice ----
const vcAuth = (i, vc) => { const o = G(i.guild.id).tempVoice.channels[vc.id]; return o ? (o === i.user.id || isStaff(i.member)) : (i.memberPermissions.has(P.ManageChannels) || isStaff(i.member)); };
const withVC = fn => async i => {
  const vc = i.member.voice.channel; if (!vc) return send(i, '❌ Join a voice channel first.');
  if (!vcAuth(i, vc)) return send(i, '❌ You do not own this voice channel.'); return fn(i, vc);
};
const vcTarget = async (i, vc) => { const m = await i.guild.members.fetch(i.options.getUser('user').id).catch(() => null); if (!m || m.voice.channelId !== vc.id) { await send(i, '❌ That member is not in your voice channel.'); return null; } return m; };
H.vc = {
  setup: async i => { if (!isStaff(i.member)) return send(i, '❌ Staff only.'); const t = G(i.guild.id).tempVoice; t.lobby = i.options.getChannel('lobby').id; t.category = i.options.getChannel('category')?.id || null; save(); return send(i, `✅ Join-to-create enabled. Joining <#${t.lobby}> creates a private voice room.`); },
  create: async i => {
    const g = G(i.guild.id), ch = await i.guild.channels.create({ name: i.options.getString('name'), type: ChannelType.GuildVoice, parent: g.tempVoice.category || undefined, userLimit: i.options.getInteger('limit') || 0, permissionOverwrites: [{ id: i.user.id, allow: [P.ViewChannel, P.Connect, P.Speak] }] });
    g.tempVoice.channels[ch.id] = i.user.id; save(); if (i.member.voice.channel) await i.member.voice.setChannel(ch).catch(() => {});
    setTimeout(() => { if (ch.members.size === 0) { ch.delete().catch(() => {}); delete g.tempVoice.channels[ch.id]; save(); } }, 60000);
    return send(i, `✅ Created ${ch}. It is deleted automatically when empty.`);
  },
  lock: withVC(async (i, vc) => { await vc.permissionOverwrites.edit(i.user.id, { Connect: true }); await vc.permissionOverwrites.edit(i.guild.id, { Connect: false }); return send(i, `🔒 ${vc} locked.`); }),
  unlock: withVC(async (i, vc) => { await vc.permissionOverwrites.edit(i.guild.id, { Connect: null }); return send(i, `🔓 ${vc} unlocked.`); }),
  limit: withVC(async (i, vc) => { await vc.setUserLimit(i.options.getInteger('limit')); return send(i, `✅ User limit set to **${i.options.getInteger('limit') || 'none'}**.`); }),
  rename: withVC(async (i, vc) => { await vc.setName(i.options.getString('name')); return send(i, '✅ Renamed.'); }),
  owner: async i => { const vc = i.member.voice.channel; if (!vc) return send(i, '❌ Join a voice channel first.'); const o = G(i.guild.id).tempVoice.channels[vc.id]; return send(i, o ? `👑 Owner of ${vc}: <@${o}>` : `${vc} is not a temporary channel.`); },
  transfer: withVC(async (i, vc) => { const m = await vcTarget(i, vc); if (!m) return; G(i.guild.id).tempVoice.channels[vc.id] = m.id; save(); await vc.permissionOverwrites.edit(m.id, { ViewChannel: true, Connect: true, Speak: true }); return send(i, `👑 Ownership transferred to ${m}.`); }),
  claim: async i => {
    const vc = i.member.voice.channel, t = G(i.guild.id).tempVoice; if (!vc || !t.channels[vc.id]) return send(i, '❌ Join a temporary voice channel first.');
    if (vc.members.has(t.channels[vc.id])) return send(i, '❌ The owner is still in the channel.');
    t.channels[vc.id] = i.user.id; save(); return send(i, `👑 You now own ${vc}.`);
  },
  kick: withVC(async (i, vc) => { const m = await vcTarget(i, vc); if (!m) return; await m.voice.disconnect(); return send(i, `✅ Kicked ${m} from voice.`); }),
  mute: withVC(async (i, vc) => { const m = await vcTarget(i, vc); if (!m) return; const s = i.options.getBoolean('state') ?? true; await m.voice.setMute(s); return send(i, `✅ ${m} ${s ? 'muted' : 'unmuted'}.`); }),
  deafen: withVC(async (i, vc) => { const m = await vcTarget(i, vc); if (!m) return; const s = i.options.getBoolean('state') ?? true; await m.voice.setDeaf(s); return send(i, `✅ ${m} ${s ? 'deafened' : 'undeafened'}.`); }),
  move: withVC(async (i, vc) => { const m = await vcTarget(i, vc); if (!m) return; await m.voice.setChannel(i.options.getChannel('channel')); return send(i, `✅ Moved ${m}.`); }),
  afk: async i => { if (!isStaff(i.member)) return send(i, '❌ Staff only.'); await i.guild.setAFKChannel(i.options.getChannel('channel')); const t = i.options.getInteger('timeout'); if (t) await i.guild.setAFKTimeout(t); return send(i, '✅ AFK voice channel updated.'); }
};

// ---- 15. Giveaways ----
const gwReq = gw => [gw.role && `<@&${gw.role}>`, gw.minDays && `Account ${gw.minDays}+ days old`].filter(Boolean).join(' • ') || 'None';
const gwEmbed = (gw, ended, winners = []) => {
  const e = new EmbedBuilder().setColor(ended ? 0x7f8c8d : 0xf1c40f).setTitle(`🎉 ${gw.prize}`).setTimestamp(gw.endsAt)
    .setDescription(`${gw.description ? gw.description + '\n\n' : ''}**Winners:** ${gw.winners}\n**Hosted by:** <@${gw.host}>\n**Requirements:** ${gwReq(gw)}\n${ended ? `**Ended:** <t:${ts(gw.endsAt)}:R>\n**Winner(s):** ${winners.length ? winners.map(w => `<@${w}>`).join(', ') : 'No valid entries'}` : `**Ends:** <t:${ts(gw.endsAt)}:R>`}`);
  if (gw.image) e.setImage(gw.image); return e;
};
const pick = (arr, n) => [...arr].sort(() => Math.random() - 0.5).slice(0, n);
async function endGiveaway(guild, id) {
  const g = G(guild.id), gw = g.giveaways[id]; if (!gw) return false;
  const winners = pick(gw.entries, gw.winners), ch = guild.channels.cache.get(gw.channel);
  if (ch) {
    const msg = await ch.messages.fetch(id).catch(() => null); if (msg) await msg.edit({ embeds: [gwEmbed(gw, true, winners)], components: [] }).catch(() => {});
    await ch.send(winners.length ? `🎊 Congratulations ${winners.map(w => `<@${w}>`).join(', ')}! You won **${gw.prize}**!` : `❌ No valid entries for **${gw.prize}**.`).catch(() => {});
  }
  g.giveawayHistory.unshift({ id, prize: gw.prize, channel: gw.channel, winners, entries: gw.entries, endedAt: Date.now() }); g.giveawayHistory = g.giveawayHistory.slice(0, 25);
  delete g.giveaways[id]; save(); return true;
}
H.giveaway = {
  start: async i => {
    await defer(i); const d = parseDuration(i.options.getString('duration')); if (!d || d < 10000) return send(i, '❌ Invalid duration. Use e.g. 30m, 2h, 1d.');
    const ch = i.options.getChannel('channel') || i.channel;
    const gw = { prize: i.options.getString('prize'), winners: i.options.getInteger('winners'), channel: ch.id, host: i.user.id, endsAt: Date.now() + d, role: i.options.getRole('role')?.id || null, minDays: i.options.getInteger('min_account_days') || 0, description: nl(i.options.getString('description') || ''), image: i.options.getString('image') || null, entries: [] };
    const msg = await ch.send({ embeds: [gwEmbed(gw, false)], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('gw:enter').setLabel('Enter Giveaway').setEmoji('🎉').setStyle(ButtonStyle.Success))] });
    G(i.guild.id).giveaways[msg.id] = gw; save(); return send(i, `✅ Giveaway started in ${ch}! (ID: \`${msg.id}\`)`);
  },
  end: async i => { await defer(i); return send(i, (await endGiveaway(i.guild, i.options.getString('message_id'))) ? '✅ Giveaway ended.' : '❌ Active giveaway not found.'); },
  reroll: async i => {
    const g = G(i.guild.id), h = g.giveawayHistory.find(x => x.id === i.options.getString('message_id')); if (!h) return send(i, '❌ Ended giveaway not found.');
    const pool = h.entries.filter(e => !h.winners.includes(e)); if (!pool.length) return send(i, '❌ No other entries to reroll from.');
    const w = pick(pool, 1)[0]; h.winners.push(w); save();
    await i.guild.channels.cache.get(h.channel)?.send(`🔄 **Reroll!** Congratulations <@${w}>! You won **${h.prize}**! 🎉`); return send(i, `✅ New winner: <@${w}>`);
  },
  cancel: async i => {
    const g = G(i.guild.id), id = i.options.getString('message_id'), gw = g.giveaways[id]; if (!gw) return send(i, '❌ Active giveaway not found.');
    const ch = i.guild.channels.cache.get(gw.channel), msg = ch && await ch.messages.fetch(id).catch(() => null); if (msg) await msg.delete().catch(() => {});
    delete g.giveaways[id]; save(); return send(i, '✅ Giveaway cancelled.');
  },
  list: async i => {
    const g = G(i.guild.id);
    if (i.options.getBoolean('history')) return send(i, { embeds: [emb('🎉 Giveaway History', g.giveawayHistory.slice(0, 10).map(h => `**${h.prize}** — ${h.winners.map(w => `<@${w}>`).join(', ') || 'No winners'} (<t:${ts(h.endedAt)}:d>)`).join('\n') || 'None.')] });
    return send(i, { embeds: [emb('🎉 Active Giveaways', Object.entries(g.giveaways).map(([id, gw]) => `**${gw.prize}** — <#${gw.channel}> • ends <t:${ts(gw.endsAt)}:R> • ${gw.entries.length} entries • ID \`${id}\``).join('\n') || 'None.')] });
  }
};

// ---- 16. Applications ----
const DEFAULT_QS = { staff: ['Why do you want to join the staff team?', 'Do you have previous moderation experience?', 'How many hours per week can you be active?'], moderator: ['Why do you want to be a moderator?', 'How would you handle a heated argument between two members?', 'How many hours per week can you be active?'], membership: ['Why do you want to join?', 'How did you find us?'] };
const appEmbed = (a, color) => emb(`📝 Application #${a.id} — ${a.type}`, `**Applicant:** <@${a.user}>\n**Status:** ${a.status}\n\n${a.answers.map(x => `**${trunc(x.q, 200)}**\n${trunc(x.a, 700)}`).join('\n\n')}`, color);
async function decideApp(guild, a, status, by, text) {
  const g = G(guild.id); a.status = status; a.decidedBy = by; a.note = text; save();
  const m = await guild.members.fetch(a.user).catch(() => null), role = g.apps.roles[a.type];
  if (status === 'approved' && m && role) await m.roles.add(role).catch(() => {});
  const u = await client.users.fetch(a.user).catch(() => null);
  if (u) u.send({ embeds: [emb(`Your ${a.type} application was ${status}`, `Server: **${guild.name}**${text ? `\n${text}` : ''}`, status === 'approved' ? COLORS.ok : COLORS.err)] }).catch(() => {});
  const ch = a.reviewMsg && g.apps.reviewChannel && guild.channels.cache.get(g.apps.reviewChannel), msg = ch && await ch.messages.fetch(a.reviewMsg).catch(() => null);
  if (msg) await msg.edit({ embeds: [appEmbed(a, status === 'approved' ? COLORS.ok : COLORS.err).setFooter({ text: `${status} by ${(await client.users.fetch(by).catch(() => ({ tag: by }))).tag}` })], components: [] }).catch(() => {});
}
H.application = {
  setup: async i => {
    const ch = i.options.getChannel('channel'), g = G(i.guild.id); g.apps.reviewChannel = i.options.getChannel('review_channel').id; save();
    await ch.send({ embeds: [emb(i.options.getString('title') || '📝 Applications', nl(i.options.getString('description') || 'Interested? Pick an application below and answer the questions.'))], components: [new ActionRowBuilder().addComponents(APPTYPES.map(t => new ButtonBuilder().setCustomId(`app_open:${t}`).setLabel(t[0].toUpperCase() + t.slice(1)).setStyle(ButtonStyle.Primary)))] });
    return send(i, `✅ Application panel posted in ${ch}.`);
  },
  questions: async i => {
    const g = G(i.guild.id), t = i.options.getString('type'), qs = i.options.getString('questions').split(';').map(s => s.trim()).filter(Boolean).slice(0, 5);
    g.apps.questions[t] = qs; const r = i.options.getRole('role'); if (r) g.apps.roles[t] = r.id; save();
    return send(i, `✅ **${t}** now has ${qs.length} question(s).${r ? ` Approved applicants get ${r}.` : ''}`);
  },
  list: async i => { const st = i.options.getString('status'), l = Object.values(G(i.guild.id).apps.list).filter(a => !st || a.status === st).slice(-15).reverse(); return send(i, { embeds: [emb('📝 Applications', l.map(a => `**#${a.id}** ${a.type} — <@${a.user}> [${a.status}]`).join('\n') || 'None.')] }); },
  approve: async i => { const a = G(i.guild.id).apps.list[i.options.getInteger('id')]; if (!a) return send(i, '❌ Application not found.'); await decideApp(i.guild, a, 'approved', i.user.id, i.options.getString('note')); return send(i, `✅ Application #${a.id} approved.`); },
  reject: async i => { const a = G(i.guild.id).apps.list[i.options.getInteger('id')]; if (!a) return send(i, '❌ Application not found.'); await decideApp(i.guild, a, 'rejected', i.user.id, i.options.getString('reason')); return send(i, `✅ Application #${a.id} rejected.`); },
  interview: async i => {
    const a = G(i.guild.id).apps.list[i.options.getInteger('id')]; if (!a) return send(i, '❌ Application not found.');
    a.interview = i.options.getString('time'); save(); const u = await client.users.fetch(a.user).catch(() => null);
    if (u) u.send({ embeds: [emb('📅 Interview Scheduled', `Your **${a.type}** application in **${i.guild.name}** has an interview scheduled:\n**${a.interview}**`)] }).catch(() => {});
    return send(i, `✅ Interview scheduled for application #${a.id}.`);
  },
  transcript: async i => { const a = G(i.guild.id).apps.list[i.options.getInteger('id')]; if (!a) return send(i, '❌ Application not found.'); const txt = `Application #${a.id} (${a.type})\nApplicant: ${a.user}\nStatus: ${a.status}\nSubmitted: ${new Date(a.time).toISOString()}\n\n${a.answers.map(x => `Q: ${x.q}\nA: ${x.a}`).join('\n\n')}`; return send(i, { files: [new AttachmentBuilder(Buffer.from(txt), { name: `application-${a.id}.txt` })] }); }
};

// ---- 17. Staff & config ----
const sd = (g, id) => (g.staff[id] ||= { duty: false, dutySince: 0, dutyMs: 0, warnings: [], history: [], leaveUntil: 0, messages: 0 });
H.staff = {
  info: async i => { const u = i.options.getUser('user') || i.user, g = G(i.guild.id), s = sd(g, u.id), cases = g.cases.filter(c => c.mod === u.id).length; return send(i, { embeds: [emb(`👔 Staff — ${u.tag}`).setThumbnail(u.displayAvatarURL()).addFields({ name: 'Duty', value: s.duty ? '🟢 On duty' : '🔴 Off duty', inline: true }, { name: 'On leave', value: s.leaveUntil > Date.now() ? `Until <t:${ts(s.leaveUntil)}:D>` : 'No', inline: true }, { name: 'Mod actions', value: `${cases}`, inline: true }, { name: 'Messages', value: `${s.messages}`, inline: true }, { name: 'Warnings', value: `${s.warnings.length}`, inline: true }, { name: 'Records', value: `${s.history.length}`, inline: true })] }, false); },
  promote: async i => { if (!isAdmin(i.member)) return send(i, '❌ Admins only.'); const m = i.options.getMember('user'), r = i.options.getRole('role'), bad = roleBlock(i, r); if (bad) return send(i, '❌ ' + bad); if (!m) return send(i, '❌ Member not found.'); await m.roles.add(r); sd(G(i.guild.id), m.id).history.push({ type: 'PROMOTION', role: r.name, by: i.user.id, reason: i.options.getString('reason') || 'None', time: Date.now() }); save(); return send(i, `📈 Promoted ${m} to **${r.name}**.`, false); },
  demote: async i => { if (!isAdmin(i.member)) return send(i, '❌ Admins only.'); const m = i.options.getMember('user'), r = i.options.getRole('role'), bad = roleBlock(i, r); if (bad) return send(i, '❌ ' + bad); if (!m) return send(i, '❌ Member not found.'); await m.roles.remove(r); sd(G(i.guild.id), m.id).history.push({ type: 'DEMOTION', role: r.name, by: i.user.id, reason: i.options.getString('reason') || 'None', time: Date.now() }); save(); return send(i, `📉 Demoted ${m} (removed **${r.name}**).`, false); },
  warn: async i => { if (!isAdmin(i.member)) return send(i, '❌ Admins only.'); const u = i.options.getUser('user'); sd(G(i.guild.id), u.id).warnings.push({ reason: i.options.getString('reason'), by: i.user.id, time: Date.now() }); save(); return send(i, `⚠️ Staff warning recorded for ${u}.`); },
  duty: async i => { const s = sd(G(i.guild.id), i.user.id), on = i.options.getString('status') === 'on'; if (on && !s.duty) s.dutySince = Date.now(); if (!on && s.duty) s.dutyMs += Date.now() - s.dutySince; s.duty = on; save(); return send(i, `${on ? '🟢 You are now **on duty**.' : '🔴 You are now **off duty**.'}`); },
  history: async i => { const u = i.options.getUser('user'), s = sd(G(i.guild.id), u.id); const l = [...s.history.map(h => `<t:${ts(h.time)}:d> **${h.type}** ${h.role} — ${h.reason} (by <@${h.by}>)`), ...s.warnings.map(w => `<t:${ts(w.time)}:d> **WARNING** — ${w.reason} (by <@${w.by}>)`)]; return send(i, { embeds: [emb(`📚 Staff Record — ${u.tag}`, l.join('\n') || 'No records.')] }); },
  activity: async i => { const u = i.options.getUser('user') || i.user, g = G(i.guild.id), s = sd(g, u.id); return send(i, { embeds: [emb(`📊 Staff Activity — ${u.tag}`, `**Messages:** ${s.messages}\n**Moderation actions:** ${g.cases.filter(c => c.mod === u.id).length}\n**Time on duty:** ${fmtDur(s.dutyMs + (s.duty ? Date.now() - s.dutySince : 0))}`)] }); },
  leave: async i => { const s = sd(G(i.guild.id), i.user.id), d = i.options.getInteger('days'); s.leaveUntil = d ? Date.now() + d * 864e5 : 0; if (d) s.history.push({ type: 'LEAVE', role: `${d}d`, by: i.user.id, reason: i.options.getString('reason') || 'None', time: Date.now() }); save(); return send(i, d ? `🏖️ Leave recorded until <t:${ts(s.leaveUntil)}:D>.` : '👋 Welcome back!'); }
};
H.config = {
  roles: async i => { const s = G(i.guild.id).settings; for (const [o, k] of [['admin_role', 'adminRole'], ['mod_role', 'modRole'], ['staff_role', 'staffRole'], ['auto_role', 'autoRole']]) { const r = i.options.getRole(o); if (r) s[k] = r.id; } save(); return send(i, '✅ Roles updated.'); },
  channels: async i => { const g = G(i.guild.id), s = g.settings; for (const [o, k] of [['log', 'logChannel'], ['welcome', 'welcomeChannel'], ['goodbye', 'goodbyeChannel'], ['suggestions', 'suggestChannel'], ['reports', 'reportChannel'], ['feedback', 'feedbackChannel'], ['staff', 'staffChannel']]) { const c = i.options.getChannel(o); if (c) s[k] = c.id; } const lv = i.options.getChannel('levels'); if (lv) g.level.channel = lv.id; const w = i.options.getChannel('welcome'), gb = i.options.getChannel('goodbye'); if (w) g.welcome.channel = w.id; if (gb) g.goodbye.channel = gb.id; save(); return send(i, '✅ Channels updated.'); },
  restrict: async i => { const s = G(i.guild.id).settings, c = i.options.getString('command').replace('/', '').toLowerCase(); s.restricted = (s.restricted || []).filter(x => x !== c); if (i.options.getBoolean('enabled')) s.restricted.push(c); save(); return send(i, `✅ \`/${c}\` is ${i.options.getBoolean('enabled') ? 'now restricted to staff' : 'no longer restricted'}.`); },
  view: async i => { const s = G(i.guild.id).settings, ch = id => id ? `<#${id}>` : '—', ro = id => id ? `<@&${id}>` : '—'; return send(i, { embeds: [emb('⚙️ Configuration', `**Admin role:** ${ro(s.adminRole)}\n**Mod role:** ${ro(s.modRole)}\n**Staff role:** ${ro(s.staffRole)}\n**Auto role:** ${ro(s.autoRole)}\n**Log:** ${ch(s.logChannel)}\n**Welcome:** ${ch(s.welcomeChannel)}\n**Goodbye:** ${ch(s.goodbyeChannel)}\n**Suggestions:** ${ch(s.suggestChannel)}\n**Reports:** ${ch(s.reportChannel)}\n**Feedback:** ${ch(s.feedbackChannel)}\n**Staff:** ${ch(s.staffChannel)}\n**Restricted commands:** ${(s.restricted || []).map(c => `\`/${c}\``).join(' ') || 'None'}`)] }); }
};

// ---- 18. Bot owner ----
function applyPresence() {
  const p = db.global.presence;
  if (!p) return client.user.setPresence(DEFAULT_PRESENCE);
  client.user.setPresence({ status: p.status || DEFAULT_PRESENCE.status, activities: p.activity ? [{ name: p.activity.name, type: p.activity.type }] : DEFAULT_PRESENCE.activities });
}
async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN), body = cmds.map(c => c.toJSON());
  try {
    await rest.put(GUILD_ID ? Routes.applicationGuildCommands(client.user.id, GUILD_ID) : Routes.applicationCommands(client.user.id), { body });
    console.log(`✅ ${body.length} slash commands registered!`); return body.length;
  } catch (e) { noteError(e); return 0; }
}
H.bot = {
  shutdown: async i => { await send(i, '🛑 Shutting down...'); save(); setTimeout(() => process.exit(0), 1000); },
  restart: async i => { await send(i, '🔄 Restarting...'); fs.writeFileSync(DATA_FILE, JSON.stringify(db)); setTimeout(() => process.exit(0), 1000); },
  maintenance: async i => { db.global.maintenance = i.options.getBoolean('enabled'); save(); return send(i, `🛠️ Maintenance mode **${db.global.maintenance ? 'ON' : 'OFF'}**.`); },
  status: async i => { db.global.presence = { ...(db.global.presence || {}), status: i.options.getString('status') }; save(); applyPresence(); return send(i, '✅ Status updated.'); },
  activity: async i => { db.global.presence = { ...(db.global.presence || {}), activity: { name: i.options.getString('text'), type: +i.options.getString('type') } }; save(); applyPresence(); return send(i, '✅ Activity updated.'); },
  servers: async i => send(i, { embeds: [emb(`🌐 Servers (${client.guilds.cache.size})`, trunc([...client.guilds.cache.values()].slice(0, 40).map(g => `**${g.name}** — ${g.memberCount} members (\`${g.id}\`)`).join('\n'), 3900))] }),
  leave: async i => { const g = client.guilds.cache.get(i.options.getString('guild_id')); if (!g) return send(i, '❌ Server not found.'); await g.leave(); return send(i, `✅ Left **${g.name}**.`); },
  blacklist: async i => { const t = i.options.getString('type') === 'user' ? 'users' : 'guilds', id = i.options.getString('id'); if (!db.global.blacklist[t].includes(id)) db.global.blacklist[t].push(id); save(); if (t === 'guilds') client.guilds.cache.get(id)?.leave().catch(() => {}); return send(i, `✅ Blacklisted \`${id}\`.`); },
  unblacklist: async i => { const t = i.options.getString('type') === 'user' ? 'users' : 'guilds', id = i.options.getString('id'); db.global.blacklist[t] = db.global.blacklist[t].filter(x => x !== id); save(); return send(i, `✅ Removed \`${id}\` from the blacklist.`); },
  eval: async i => {
    await defer(i); const code = i.options.getString('code');
    try {
      let r = await eval(`(async()=>{ ${/\breturn\b/.test(code) ? code : `return (${code})`} })()`);
      if (typeof r !== 'string') r = util.inspect(r, { depth: 1 });
      r = r.split(process.env.DISCORD_TOKEN || '\u0000').join('[REDACTED]');
      return send(i, '```js\n' + trunc(r, 1900) + '\n```');
    } catch (e) { return send(i, '```js\n' + trunc(String(e.stack || e), 1900) + '\n```'); }
  },
  debug: async i => send(i, { embeds: [emb('🐞 Debug', `**Ping:** ${client.ws.ping}ms\n**Memory:** ${(process.memoryUsage().rss / 1048576).toFixed(1)} MB\n**Guilds:** ${client.guilds.cache.size}\n**Maintenance:** ${db.global.maintenance}\n**Recent errors (${errors.length}):**\n\`\`\`${trunc(errors.slice(-3).join('\n\n') || 'None', 1500)}\`\`\``)] }),
  sync: async i => { await defer(i); const n = await registerCommands(); return send(i, n ? `✅ Synced **${n}** commands.` : '❌ Sync failed (see console).'); },
  config: async i => { const k = i.options.getString('key'), v = i.options.getString('value'); if (v) db.global.config[k] = v; else delete db.global.config[k]; save(); return send(i, `✅ \`${k}\` ${v ? `= \`${v}\`` : 'removed'}.`); }
};

// =====================================================================
//  INTERACTION ROUTER
// =====================================================================
const ADMIN_LOGGED = new Set(['config', 'servername', 'serverlock', 'serverunlock', 'nuke', 'backup', 'restore', 'role', 'channel', 'category', 'security', 'automod', 'staff', 'purge', 'clear', 'announce', 'massnick', 'setxp', 'resetxp', 'bot']);
async function runCommand(i) {
  const name = i.commandName, g = G(i.guild.id);
  if (db.global.maintenance && !isOwner(i.user.id)) return send(i, '🛠️ The bot is currently in maintenance mode.');
  if (g.settings.restricted?.includes(name) && !isStaff(i.member)) return send(i, '❌ This command is restricted to staff.');
  if (name === 'bot' && !isOwner(i.user.id)) return send(i, '❌ Bot owner only.');
  const h = H[name]; if (!h) return send(i, '❌ Unknown command.');
  let sub = null;
  if (typeof h === 'function') await h(i); else { sub = i.options.getSubcommand(); if (!h[sub]) return send(i, '❌ Unknown subcommand.'); await h[sub](i); }
  if (ADMIN_LOGGED.has(name)) logEvent(i.guild, 'moderation', '🔧 Admin Action', `${i.user} used \`/${name}${sub ? ' ' + sub : ''}\` in ${i.channel}`, COLORS.warn);
}
const captchas = new Map();
async function onButton(i) {
  const id = i.customId, g = G(i.guild.id);
  if (id === 'gw:enter') {
    const gw = g.giveaways[i.message.id]; if (!gw) return send(i, '❌ This giveaway has ended.');
    if (gw.role && !i.member.roles.cache.has(gw.role)) return send(i, `❌ You need <@&${gw.role}> to enter.`);
    if (gw.minDays && (Date.now() - i.user.createdTimestamp) / 864e5 < gw.minDays) return send(i, `❌ Your account must be at least ${gw.minDays} days old.`);
    if (gw.entries.includes(i.user.id)) { gw.entries = gw.entries.filter(e => e !== i.user.id); save(); return send(i, '👋 You left the giveaway.'); }
    gw.entries.push(i.user.id); save(); return send(i, '🎉 You entered the giveaway! Click again to leave.');
  }
  if (id === 'tk_open') {
    const modal = new ModalBuilder().setCustomId('tk_modal').setTitle('Open a Ticket').addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason').setLabel('How can we help you?').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000)));
    return i.showModal(modal);
  }
  if (id === 'tk_close') return closeTicket(i, 'Closed via button');
  if (id === 'tk_reopen') return reopenTicket(i);
  if (id === 'tk_delete') return deleteTicket(i);
  if (id === 'tk_claim') return claimTicket(i);
  if (id === 'tk_transcript') return ticketTranscript(i);
  if (id.startsWith('rr:')) {
    const p = g.panels[i.message.id], roleId = id.slice(3), role = i.guild.roles.cache.get(roleId);
    if (!p || !role) return send(i, '❌ This panel is no longer valid.');
    if (p.required && !i.member.roles.cache.has(p.required)) return send(i, `❌ You need <@&${p.required}> to use this panel.`);
    try {
      if (i.member.roles.cache.has(roleId)) { await i.member.roles.remove(roleId); return send(i, `➖ Removed **${role.name}**.`); }
      if (p.mode === 'single') for (const x of p.roles) if (x.roleId !== roleId && i.member.roles.cache.has(x.roleId)) await i.member.roles.remove(x.roleId).catch(() => {});
      await i.member.roles.add(roleId); return send(i, `➕ Added **${role.name}**.`);
    } catch (e) { return send(i, '❌ Failed to update role. Check my role hierarchy/permissions.'); }
  }
  if (id.startsWith('app_open:')) {
    const t = id.slice(9), qs = g.apps.questions[t] || DEFAULT_QS[t];
    if (Object.values(g.apps.list).some(a => a.user === i.user.id && a.type === t && a.status === 'pending')) return send(i, '⚠️ You already have a pending application of this type.');
    const modal = new ModalBuilder().setCustomId(`app_modal:${t}`).setTitle(`${t[0].toUpperCase() + t.slice(1)} Application`);
    modal.addComponents(qs.map((q, n) => new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(`q${n}`).setLabel(q.slice(0, 45)).setPlaceholder(q.length > 45 ? q.slice(0, 100) : '').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000))));
    return i.showModal(modal);
  }
  if (id.startsWith('app_ok:') || id.startsWith('app_no:')) {
    if (!isStaff(i.member)) return send(i, '❌ Staff only.');
    const a = g.apps.list[id.split(':')[1]]; if (!a) return send(i, '❌ Application not found.');
    if (id.startsWith('app_no:')) return i.showModal(new ModalBuilder().setCustomId(`app_rej:${a.id}`).setTitle('Reject Application').addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason').setLabel('Reason').setStyle(TextInputStyle.Paragraph).setRequired(true))));
    await i.deferUpdate(); return decideApp(i.guild, a, 'approved', i.user.id, 'Congratulations!');
  }
  if (id === 'verify_start') {
    const s = g.security; if (!s.verifyRole) return send(i, '❌ Verification is not configured.');
    if (i.member.roles.cache.has(s.verifyRole)) return send(i, '✅ You are already verified.');
    if (s.verifyMode === 'captcha') {
      const code = Math.random().toString(36).replace(/[^a-z0-9]/g, '').slice(2, 7).toUpperCase(); captchas.set(i.user.id, code);
      return send(i, { content: `🔐 Your captcha code: \`${code.split('').join(' ')}\``, components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('verify_enter').setLabel('Enter Code').setStyle(ButtonStyle.Primary))] });
    }
    await i.member.roles.add(s.verifyRole).catch(() => {}); logEvent(i.guild, 'member', '✅ Member Verified', `${i.user} verified.`, COLORS.ok); return send(i, '✅ You have been verified!');
  }
  if (id === 'verify_enter') return i.showModal(new ModalBuilder().setCustomId('verify_modal').setTitle('Captcha').addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('code').setLabel('Enter the code shown').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(10))));
}
async function onSelect(i) {
  if (i.customId !== 'sr') return;
  const p = G(i.guild.id).panels[i.message.id]; if (!p) return send(i, '❌ This menu is no longer valid.');
  if (p.required && !i.member.roles.cache.has(p.required)) return send(i, `❌ You need <@&${p.required}> to use this menu.`);
  await i.deferReply({ flags: EPH });
  try {
    for (const x of p.roles) {
      const want = i.values.includes(x.roleId), has = i.member.roles.cache.has(x.roleId);
      if (want && !has) await i.member.roles.add(x.roleId); else if (!want && has) await i.member.roles.remove(x.roleId);
    }
    return i.editReply(`✅ Roles updated: ${i.values.map(v => `<@&${v}>`).join(' ') || 'none selected'}`);
  } catch (e) { return i.editReply('❌ Failed to update roles. Check my role hierarchy/permissions.'); }
}
async function onModal(i) {
  const id = i.customId, g = G(i.guild.id);
  if (id === 'tk_modal') { await defer(i); return openTicket(i, i.fields.getTextInputValue('reason')); }
  if (id.startsWith('app_modal:')) {
    await defer(i); const t = id.slice(10), qs = g.apps.questions[t] || DEFAULT_QS[t], ch = g.apps.reviewChannel && i.guild.channels.cache.get(g.apps.reviewChannel);
    if (!ch) return send(i, '❌ Review channel is not configured.');
    const a = { id: ++g.apps.counter, user: i.user.id, type: t, status: 'pending', time: Date.now(), answers: qs.map((q, n) => ({ q, a: i.fields.getTextInputValue(`q${n}`) })) };
    const msg = await ch.send({ embeds: [appEmbed(a, COLORS.warn)], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`app_ok:${a.id}`).setLabel('Approve').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`app_no:${a.id}`).setLabel('Reject').setStyle(ButtonStyle.Danger))] });
    a.reviewMsg = msg.id; g.apps.list[a.id] = a; save(); return send(i, `✅ Application **#${a.id}** submitted! You will be notified of the decision.`);
  }
  if (id.startsWith('app_rej:')) { await i.deferUpdate(); const a = g.apps.list[id.slice(8)]; if (a) await decideApp(i.guild, a, 'rejected', i.user.id, i.fields.getTextInputValue('reason')); return; }
  if (id === 'verify_modal') {
    const ok = captchas.get(i.user.id) === i.fields.getTextInputValue('code').trim().toUpperCase(); captchas.delete(i.user.id);
    if (!ok) return send(i, '❌ Wrong code. Click **Verify** to try again.');
    await i.member.roles.add(g.security.verifyRole).catch(() => {}); logEvent(i.guild, 'member', '✅ Member Verified', `${i.user} passed the captcha.`, COLORS.ok); return send(i, '✅ Verified! Welcome.');
  }
}
async function rateTicket(i) {
  const [, gid, num, stars] = i.customId.split(':'), guild = client.guilds.cache.get(gid); if (!guild) return;
  G(gid).tickets.ratings.push({ num: +num, user: i.user.id, stars: +stars, time: Date.now() }); save();
  await i.update({ content: `Thanks for rating your support **${stars}/5** ⭐`, embeds: [], components: [] });
  ticketLog(guild, emb('⭐ Ticket Rated', `**Ticket:** #${num}\n**User:** ${i.user}\n**Rating:** ${'⭐'.repeat(+stars)} (${stars}/5)`, COLORS.warn));
}
client.on(Events.InteractionCreate, async i => {
  try {
    if (i.isButton() && i.customId.startsWith('tkrate:')) return await rateTicket(i);
    if (!i.guild) { if (i.isRepliable()) return await i.reply({ content: 'This bot only works inside servers.', flags: EPH }); return; }
    if (db.global.blacklist.users.includes(i.user.id) && !isOwner(i.user.id)) return await i.reply({ content: '🚫 You are blacklisted from using this bot.', flags: EPH });
    if (i.isChatInputCommand()) return await runCommand(i);
    if (i.isButton()) return await onButton(i);
    if (i.isStringSelectMenu()) return await onSelect(i);
    if (i.isModalSubmit()) return await onModal(i);
  } catch (e) {
    noteError(e);
    const m = { content: `❌ Something went wrong: ${trunc(e.message, 200)}`, flags: EPH };
    if (i.isRepliable()) (i.deferred || i.replied ? i.followUp(m) : i.reply(m)).catch(() => {});
  }
});

// =====================================================================
//  PREFIX COMMANDS  (!stick / !unstick)
// =====================================================================
const stickyTimers = new Map();
async function repostSticky(channel) {
  const g = G(channel.guild.id), s = g.stickies[channel.id]; if (!s) return;
  if (s.messageId) await channel.messages.delete(s.messageId).catch(() => {});
  const m = await channel.send({ embeds: [new EmbedBuilder().setColor(COLORS.warn).setTitle('📌 Stickied Message').setDescription(s.content.slice(0, 4000))], allowedMentions: { parse: [] } }).catch(() => null);
  s.messageId = m?.id || null; save();
}
function scheduleSticky(channel) {
  if (!G(channel.guild.id).stickies[channel.id]) return;
  clearTimeout(stickyTimers.get(channel.id));
  stickyTimers.set(channel.id, setTimeout(() => repostSticky(channel).catch(noteError), 2500));
}
const tempReply = async (message, text) => { const m = await message.channel.send(text).catch(() => null); setTimeout(() => m?.delete().catch(() => {}), 6000); };
async function handlePrefix(message) {
  const PREFIX = getPrefix(message.guild); // per-server custom prefix
  const cmd = (message.content.slice(PREFIX.length).trim().split(/\s+/)[0] || '').toLowerCase();
  if (cmd === 'feed' || cmd === 'fish') return await prefixFish(message, cmd);
  if (cmd !== 'stick' && cmd !== 'unstick') return false;
  const member = message.member || await message.guild.members.fetch(message.author.id).catch(() => null);
  if (!member || !(member.permissions.has(P.ManageMessages) || isStaff(member))) { await tempReply(message, '❌ You need **Manage Messages** to use this command.'); return true; }
  const g = G(message.guild.id), ch = message.channel;
  if (cmd === 'unstick') {
    const s = g.stickies[ch.id];
    if (!s) await tempReply(message, '⚠️ There is no sticky message in this channel.');
    else { if (s.messageId) await ch.messages.delete(s.messageId).catch(() => {}); delete g.stickies[ch.id]; save(); await tempReply(message, '✅ Sticky message removed.'); }
    message.delete().catch(() => {}); return true;
  }
  let text = message.content.slice(PREFIX.length + 'stick'.length).trim();
  if (!text && message.reference?.messageId) { const ref = await ch.messages.fetch(message.reference.messageId).catch(() => null); text = ref?.content || ''; }
  if (!text) { await tempReply(message, `ℹ️ Usage: \`${PREFIX}stick <message>\` (or reply to a message with \`${PREFIX}stick\`). Remove it with \`${PREFIX}unstick\`.`); return true; }
  if (g.stickies[ch.id]?.messageId) await ch.messages.delete(g.stickies[ch.id].messageId).catch(() => {});
  g.stickies[ch.id] = { content: text, messageId: null, by: message.author.id }; save();
  await repostSticky(ch); message.delete().catch(() => {}); return true;
}

// =====================================================================
//  MESSAGE EVENTS
// =====================================================================
const xpCooldown = new Map();
client.on(Events.MessageCreate, async message => {
  try {
    if (!message.guild) return;
    if (message.author.id !== client.user.id) scheduleSticky(message.channel);
    if (message.author.bot || db.global.blacklist.users.includes(message.author.id)) return;
    if (!message.member) await message.guild.members.fetch(message.author.id).catch(() => {});
    if (message.content.trim() === `<@${client.user.id}>` || message.content.trim() === `<@!${client.user.id}>`) { message.reply({ content: `👋 My prefix here is \`${getPrefix(message.guild)}\` — or use slash commands.`, allowedMentions: { repliedUser: false } }).catch(() => {}); return; }
    if (message.content.startsWith(getPrefix(message.guild)) && await handlePrefix(message)) return;
    if (await runAutomod(message)) return;
    if (await uwuLockHandle(message)) return; // uwulock
    const g = G(message.guild.id);
    // daily activity
    const day = new Date().toISOString().slice(0, 10); g.activity[day] = (g.activity[day] || 0) + 1;
    const keys = Object.keys(g.activity); if (keys.length > 14) delete g.activity[keys.sort()[0]];
    // AFK
    if (g.afk[message.author.id] && Date.now() - g.afk[message.author.id].since > 10000) {
      delete g.afk[message.author.id]; save();
      const m = await message.reply({ content: `👋 Welcome back ${message.author}, I removed your AFK status.`, allowedMentions: { repliedUser: false } }).catch(() => null); setTimeout(() => m?.delete().catch(() => {}), 6000);
    }
    for (const u of message.mentions.users.values()) if (g.afk[u.id] && u.id !== message.author.id) message.reply({ content: `💤 **${u.username}** is AFK: ${g.afk[u.id].reason} (<t:${ts(g.afk[u.id].since)}:R>)`, allowedMentions: { repliedUser: false } }).catch(() => {});
    // XP
    const k = `${message.guild.id}:${message.author.id}`;
    if (Date.now() - (xpCooldown.get(k) || 0) > 60000) {
      xpCooldown.set(k, Date.now());
      const u = (g.xp[message.author.id] ||= { xp: 0, level: 0, msgs: 0 }); u.msgs = (u.msgs || 0) + 1;
      await addXp(message.guild, message.author.id, 15 + Math.floor(Math.random() * 11), message.channel);
    }
    // Staff activity
    if (message.member && isStaff(message.member)) { sd(g, message.author.id).messages++; save(); }
  } catch (e) { noteError(e); }
});

// =====================================================================
//  LOGGING & MEMBER EVENTS
// =====================================================================
client.on(Events.GuildMemberAdd, async member => {
  try {
    const guild = member.guild, g = G(guild.id), sec = g.security;
    logEvent(guild, 'member', '📥 Member Joined', `${member} (${member.user.tag})\nAccount created <t:${ts(member.user.createdTimestamp)}:R>`, COLORS.ok);
    if (member.user.bot) {
      logEvent(guild, 'bot', '🤖 Bot Added', `${member} (${member.user.tag})`, COLORS.warn);
      if (sec.antiBot) {
        let ok = false;
        try { const ex = (await guild.fetchAuditLogs({ type: AuditLogEvent.BotAdd, limit: 1 })).entries.first()?.executor; ok = ex && (ex.id === guild.ownerId || isOwner(ex.id) || sec.trusted.includes(ex.id)); } catch (e) { /* ignore */ }
        if (!ok) { await member.kick('Anti-bot protection').catch(() => {}); logEvent(guild, 'security', '🛡️ Bot Blocked', `${member.user.tag} was kicked (anti-bot).`, COLORS.err); }
      }
      return;
    }
    if (await joinSecurity(member)) return;
    if (g.settings.autoRole) member.roles.add(g.settings.autoRole).catch(() => {});
    if (sec.verifyMode === 'auto' && sec.verifyRole) member.roles.add(sec.verifyRole).catch(() => {});
    const w = g.welcome;
    if (w.enabled) {
      if (w.role) member.roles.add(w.role).catch(() => {});
      const ch = guild.channels.cache.get(w.channel || g.settings.welcomeChannel);
      if (ch) ch.send({ content: `${member}`, embeds: [buildWelcome(w, member, 'welcome')], allowedMentions: { users: [member.id] } }).catch(() => {});
      if (w.dm) member.send({ embeds: [buildWelcome(w, member, 'welcome')] }).catch(() => {});
      if (ch && guild.memberCount % 100 === 0) ch.send({ embeds: [emb('🎊 Milestone!', `We just reached **${guild.memberCount}** members! Thanks to everyone — welcome ${member}!`, COLORS.warn)] }).catch(() => {});
    }
  } catch (e) { noteError(e); }
});
client.on(Events.GuildMemberRemove, async member => {
  try {
    const g = G(member.guild.id); logEvent(member.guild, 'member', '📤 Member Left', `${member.user.tag} (\`${member.id}\`)`, COLORS.err);
    const gb = g.goodbye; if (!gb.enabled) return;
    const ch = member.guild.channels.cache.get(gb.channel || g.settings.goodbyeChannel);
    if (ch) ch.send({ embeds: [buildWelcome(gb, member, 'goodbye')] }).catch(() => {});
  } catch (e) { noteError(e); }
});
client.on(Events.GuildMemberUpdate, (o, n) => {
  try {
    if (o.nickname !== n.nickname) logEvent(n.guild, 'member', '✏️ Nickname Changed', `${n}\n**Before:** ${o.nickname || 'None'}\n**After:** ${n.nickname || 'None'}`);
    const added = n.roles.cache.filter(r => !o.roles.cache.has(r.id)), removed = o.roles.cache.filter(r => !n.roles.cache.has(r.id));
    if (added.size) logEvent(n.guild, 'role', '➕ Role Added', `${n}: ${added.map(r => `${r}`).join(' ')}`, COLORS.ok);
    if (removed.size) logEvent(n.guild, 'role', '➖ Role Removed', `${n}: ${removed.map(r => `${r}`).join(' ')}`, COLORS.err);
    if (o.communicationDisabledUntilTimestamp !== n.communicationDisabledUntilTimestamp) logEvent(n.guild, 'moderation', n.communicationDisabledUntilTimestamp ? '⏳ Member Timed Out' : '⏳ Timeout Removed', `${n}${n.communicationDisabledUntilTimestamp ? ` until <t:${ts(n.communicationDisabledUntilTimestamp)}:R>` : ''}`, COLORS.warn);
  } catch (e) { noteError(e); }
});
client.on(Events.GuildBanAdd, ban => { logEvent(ban.guild, 'moderation', '🔨 Member Banned', `${ban.user.tag} (\`${ban.user.id}\`)\n**Reason:** ${ban.reason || 'None'}`, COLORS.err); guardAudit(ban.guild, AuditLogEvent.MemberBanAdd, 'ban', ban.user.id); });
client.on(Events.GuildBanRemove, ban => logEvent(ban.guild, 'moderation', '♻️ Member Unbanned', `${ban.user.tag} (\`${ban.user.id}\`)`, COLORS.ok));
client.on(Events.MessageDelete, m => { if (!m.guild || m.author?.bot) return; logEvent(m.guild, 'message', '🗑️ Message Deleted', `**Author:** ${m.author || 'Unknown'}\n**Channel:** ${m.channel}\n**Content:** ${trunc(m.content, 1500) || '(no text / uncached)'}`, COLORS.err); });
client.on(Events.MessageUpdate, (o, n) => { if (!n.guild || n.author?.bot || o.content === n.content || !o.content) return; logEvent(n.guild, 'message', '✏️ Message Edited', `**Author:** ${n.author} • **Channel:** ${n.channel} • [Jump](${n.url})\n**Before:** ${trunc(o.content, 900)}\n**After:** ${trunc(n.content, 900)}`); });
client.on(Events.ChannelCreate, ch => {
  if (!ch.guild) return; logEvent(ch.guild, 'channel', '📁 Channel Created', `${ch} (\`${ch.name}\`)`, COLORS.ok);
  const g = G(ch.guild.id); if (g.mutedRole && ch.permissionOverwrites) ch.permissionOverwrites.edit(g.mutedRole, { SendMessages: false, AddReactions: false, Speak: false }).catch(() => {});
});
client.on(Events.ChannelDelete, ch => {
  if (!ch.guild) return; logEvent(ch.guild, 'channel', '🗑️ Channel Deleted', `\`#${ch.name}\``, COLORS.err);
  const g = G(ch.guild.id); if (g.stickies[ch.id]) { delete g.stickies[ch.id]; save(); }
  guardAudit(ch.guild, AuditLogEvent.ChannelDelete, 'channel deletion', ch.id);
});
client.on(Events.ChannelUpdate, (o, n) => {
  if (!n.guild) return; const d = [];
  if (o.name !== n.name) d.push(`**Name:** ${o.name} → ${n.name}`);
  if (o.topic !== n.topic) d.push('**Topic** changed');
  if (o.permissionOverwrites && !o.permissionOverwrites.cache.equals?.(n.permissionOverwrites.cache) && JSON.stringify([...o.permissionOverwrites.cache.values()].map(x => [x.id, x.allow.bitfield, x.deny.bitfield])) !== JSON.stringify([...n.permissionOverwrites.cache.values()].map(x => [x.id, x.allow.bitfield, x.deny.bitfield]))) d.push('**Permissions** changed');
  if (d.length) logEvent(n.guild, 'channel', '🔧 Channel Updated', `${n}\n${d.join('\n')}`, COLORS.warn);
});
client.on(Events.GuildRoleCreate, r => logEvent(r.guild, 'role', '🆕 Role Created', `${r} (\`${r.name}\`)`, COLORS.ok));
client.on(Events.GuildRoleDelete, r => { logEvent(r.guild, 'role', '🗑️ Role Deleted', `\`${r.name}\``, COLORS.err); guardAudit(r.guild, AuditLogEvent.RoleDelete, 'role deletion', r.id); });
client.on(Events.GuildRoleUpdate, (o, n) => {
  const d = []; if (o.name !== n.name) d.push(`**Name:** ${o.name} → ${n.name}`); if (o.color !== n.color) d.push('**Color** changed');
  if (o.permissions.bitfield !== n.permissions.bitfield) { d.push('**Permissions** changed'); guardAudit(n.guild, AuditLogEvent.RoleUpdate, 'role permission change', n.id); }
  if (d.length) logEvent(n.guild, 'role', '🔧 Role Updated', `${n}\n${d.join('\n')}`, COLORS.warn);
});
client.on(Events.GuildUpdate, (o, n) => {
  const d = []; if (o.name !== n.name) d.push(`**Name:** ${o.name} → ${n.name}`); if (o.icon !== n.icon) d.push('**Icon** changed'); if (o.verificationLevel !== n.verificationLevel) d.push(`**Verification:** ${o.verificationLevel} → ${n.verificationLevel}`);
  if (d.length) { logEvent(n, 'server', '⚙️ Server Updated', d.join('\n'), COLORS.warn); guardAudit(n, AuditLogEvent.GuildUpdate, 'server setting change'); }
});
client.on(Events.WebhooksUpdate, ch => { if (!ch.guild) return; logEvent(ch.guild, 'webhook', '🪝 Webhooks Updated', `Webhooks changed in ${ch}`, COLORS.warn); guardAudit(ch.guild, AuditLogEvent.WebhookCreate, 'webhook creation'); });
client.on(Events.VoiceStateUpdate, async (o, n) => {
  try {
    const guild = n.guild || o.guild, g = G(guild.id), m = n.member || o.member; if (!m) return;
    if (o.channelId !== n.channelId) {
      if (!o.channelId) logEvent(guild, 'voice', '🔊 Voice Join', `${m} joined <#${n.channelId}>`, COLORS.ok);
      else if (!n.channelId) logEvent(guild, 'voice', '🔇 Voice Leave', `${m} left <#${o.channelId}>`, COLORS.err);
      else logEvent(guild, 'voice', '🔀 Voice Move', `${m}: <#${o.channelId}> → <#${n.channelId}>`);
    }
    if (n.channelId && n.channelId === g.tempVoice.lobby && !m.user.bot) {
      const ch = await guild.channels.create({ name: `${m.displayName}'s room`.slice(0, 100), type: ChannelType.GuildVoice, parent: g.tempVoice.category || n.channel?.parentId || undefined, permissionOverwrites: [{ id: m.id, allow: [P.ViewChannel, P.Connect, P.Speak] }] });
      g.tempVoice.channels[ch.id] = m.id; save(); await m.voice.setChannel(ch).catch(() => {});
    }
    if (o.channelId && g.tempVoice.channels[o.channelId] && o.channelId !== n.channelId) {
      const ch = guild.channels.cache.get(o.channelId);
      if (!ch || ch.members.size === 0) { await ch?.delete().catch(() => {}); delete g.tempVoice.channels[o.channelId]; save(); }
    }
  } catch (e) { noteError(e); }
});
const reactionRole = async (reaction, user, add) => {
  try {
    if (user.bot) return; if (reaction.partial) await reaction.fetch(); if (reaction.message.partial) await reaction.message.fetch();
    const guild = reaction.message.guild; if (!guild) return;
    const p = G(guild.id).panels[reaction.message.id]; if (!p || p.kind !== 'reaction') return;
    const key = reaction.emoji.id || reaction.emoji.name, x = p.roles.find(r => r.emoji && emojiKey(r.emoji) === key); if (!x) return;
    const m = await guild.members.fetch(user.id).catch(() => null); if (!m) return;
    if (add) { if (p.required && !m.roles.cache.has(p.required)) return reaction.users.remove(user.id).catch(() => {}); await m.roles.add(x.roleId).catch(() => {}); } else await m.roles.remove(x.roleId).catch(() => {});
  } catch (e) { noteError(e); }
};
client.on(Events.MessageReactionAdd, (r, u) => reactionRole(r, u, true));
client.on(Events.MessageReactionRemove, (r, u) => reactionRole(r, u, false));
client.on(Events.GuildCreate, guild => { if (db.global.blacklist.guilds.includes(guild.id)) guild.leave().catch(() => {}); });
process.on('unhandledRejection', e => noteError(e));

// =====================================================================
//  ✨ NEW FEATURES  (custom prefix • fish game • uwulock • reminder • music)
//  Added without changing the existing code. Everything below is self-contained.
// =====================================================================

// ---------------------------------------------------------------------
//  1. CUSTOM PREFIX   /prefix set | reset | show
// ---------------------------------------------------------------------
const getPrefix = guild => (guild && G(guild.id).settings.prefix) || PREFIX;
grp('prefix', 'Set a custom prefix for this server', null, [
  ['set', 'Set a custom prefix (staff)', [S('prefix', 'New prefix e.g. ? . $ ! >> (max 5 chars, no spaces)', true)]],
  ['reset', 'Reset the prefix back to the default (staff)'],
  ['show', 'Show the current prefix']
]);
H.prefix = {
  set: async i => {
    if (!isStaff(i.member)) return send(i, '❌ Staff only.');
    const p = i.options.getString('prefix').trim();
    if (!p || p.length > 5 || /\s/.test(p) || p.startsWith('/')) return send(i, '❌ Prefix must be 1-5 characters, no spaces, and cannot start with `/`.');
    G(i.guild.id).settings.prefix = p; save();
    return send(i, `✅ Prefix changed to \`${p}\`. Try \`${p}feed\` or \`${p}stick <text>\`.`, false);
  },
  reset: async i => {
    if (!isStaff(i.member)) return send(i, '❌ Staff only.');
    delete G(i.guild.id).settings.prefix; save();
    return send(i, `✅ Prefix reset to \`${PREFIX}\`.`, false);
  },
  show: async i => send(i, `ℹ️ My prefix here is \`${getPrefix(i.guild)}\` (slash commands always work too).`)
};

// ---------------------------------------------------------------------
//  2. FISH GAME  🐟   /fish feed | status | leaderboard | collection | profile
//     • Everyone feeds the SAME server fish. Each person can feed every 5 hours.
//     • Feeding = coins + personal XP; the fish levels up from everyone's feeds.
//     • Level 10 = the fish is released into the collection and a new random one hatches.
//     • If NOBODY feeds for 1 day, the fish AND every player lose 1 level.
// ---------------------------------------------------------------------
const FISH_CD = 5 * 36e5, FISH_DECAY = 24 * 36e5, FISH_MAX = 10;
const twemoji = cp => `https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/${cp}.png`;
const RARITY = {
  Common: { w: 50, mult: 1, color: 0x95a5a6, icon: '⚪' },
  Uncommon: { w: 28, mult: 1.5, color: 0x2ecc71, icon: '🟢' },
  Rare: { w: 14, mult: 2, color: 0x3498db, icon: '🔵' },
  Epic: { w: 6, mult: 3, color: 0x9b59b6, icon: '🟣' },
  Legendary: { w: 2, mult: 5, color: 0xf1c40f, icon: '🟡' }
};
// [name, emoji, twemoji codepoint]
const SPECIES = {
  Common: [['Sardine', '🐟', '1f41f'], ['Tilapia', '🐟', '1f41f'], ['Bangus (Milkfish)', '🐟', '1f41f'], ['Goldfish', '🐠', '1f420'], ['Clownfish', '🐠', '1f420'], ['Hermit Crab', '🦀', '1f980'], ['Tiny Shrimp', '🦐', '1f990'], ['Sea Snail', '🐚', '1f41a']],
  Uncommon: [['Pufferfish', '🐡', '1f421'], ['Blue Tang', '🐠', '1f420'], ['Angelfish', '🐠', '1f420'], ['Spiny Lobster', '🦞', '1f99e'], ['Sea Turtle', '🐢', '1f422'], ['Mud Crab', '🦀', '1f980']],
  Rare: [['Octopus', '🐙', '1f419'], ['Dolphin', '🐬', '1f42c'], ['Giant Squid', '🦑', '1f991'], ['Lionfish', '🐠', '1f420'], ['Manta Ray', '🐟', '1f41f']],
  Epic: [['Great White Shark', '🦈', '1f988'], ['Orca', '🐋', '1f40b'], ['Humpback Whale', '🐳', '1f433'], ['Hammerhead Shark', '🦈', '1f988']],
  Legendary: [['Megalodon', '🦈', '1f988'], ['Kraken', '🐙', '1f419'], ['Leviathan', '🐋', '1f40b'], ['Golden Dragon Koi', '🐟', '1f41f'], ['Abyssal Whale', '🐳', '1f433']]
};
const fishNeed = l => 3 + l * 2;          // feeds needed for the fish to go level l -> l+1
const userNeed = l => 5 + l * 3;          // feeds needed for a player to go level l -> l+1
const fbar = (v, max, n = 10) => { const f = Math.max(0, Math.min(n, Math.round(v / max * n))); return '▰'.repeat(f) + '▱'.repeat(n - f); };
const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const rpick = a => a[Math.floor(Math.random() * a.length)];

function hatchFish() {
  let roll = Math.random() * Object.values(RARITY).reduce((a, r) => a + r.w, 0), rarity = 'Common';
  for (const [k, r] of Object.entries(RARITY)) { if ((roll -= r.w) < 0) { rarity = k; break; } }
  const [name, emoji, cp] = rpick(SPECIES[rarity]);
  return { name, emoji, img: twemoji(cp), rarity, level: 1, progress: 0, feeders: {}, born: Date.now() };
}
function getFish(g) {
  if (!g.fish) g.fish = { current: hatchFish(), lastFed: Date.now(), lastDecay: 0, channel: null, users: {}, collection: {}, released: 0 };
  return g.fish;
}
const fishUser = (f, id) => (f.users[id] ||= { feeds: 0, coins: 0, level: 1, progress: 0, lastFeed: 0 });

function fishEmbed(f, title) {
  const c = f.current, r = RARITY[c.rarity];
  const top = Object.entries(c.feeders).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, n], k) => `**${k + 1}.** <@${id}> — ${n} feed${n > 1 ? 's' : ''}`).join('\n') || '_Nobody yet — be the first!_';
  const base = Math.max(f.lastFed || c.born, f.lastDecay || 0), hungry = Date.now() - (f.lastFed || c.born) > FISH_DECAY / 2;
  return new EmbedBuilder().setColor(r.color).setTimestamp().setTitle(title || `${c.emoji} ${c.name}`).setThumbnail(c.img)
    .setDescription(`${r.icon} **${c.rarity}** • Level **${c.level}/${FISH_MAX}**\n${fbar(c.progress, fishNeed(c.level))} ${c.progress}/${fishNeed(c.level)} feeds to next level`)
    .addFields(
      { name: 'Mood', value: hungry ? '😟 Hungry!' : '😄 Happy', inline: true },
      { name: 'Last fed', value: f.lastFed ? `<t:${ts(f.lastFed)}:R>` : 'never', inline: true },
      { name: '⚠️ Loses a level', value: `<t:${ts(base + FISH_DECAY)}:R>`, inline: true },
      { name: '🍤 Top feeders (this fish)', value: top });
}

// core feed logic (shared by /fish feed and the prefix "feed" command)
function doFeed(guild, user, channelId) {
  const g = G(guild.id), f = getFish(g), c = f.current, u = fishUser(f, user.id), now = Date.now();
  if (now - u.lastFeed < FISH_CD) return { text: `⏳ You already fed the fish. You can feed again <t:${ts(u.lastFeed + FISH_CD)}:R>.` };
  const r = RARITY[c.rarity], coins = Math.round(rand(10, 25) * r.mult), lines = [];
  u.lastFeed = now; u.feeds++; u.coins += coins; u.progress++;
  f.lastFed = now; f.channel = channelId || f.channel; c.feeders[user.id] = (c.feeders[user.id] || 0) + 1; c.progress++;
  if (u.progress >= userNeed(u.level)) { u.progress = 0; u.level++; const b = 25 * u.level; u.coins += b; lines.push(`🆙 You reached **Level ${u.level}**! (+${b} coins)`); }
  if (c.progress >= fishNeed(c.level)) {
    c.progress = 0; c.level++;
    lines.push(`🎉 **${c.name}** grew to **Level ${c.level}**!`);
    if (c.level >= FISH_MAX) {
      const col = (f.collection[c.name] ||= { rarity: c.rarity, emoji: c.emoji, count: 0, first: now }); col.count++; f.released++;
      for (const [id, n] of Object.entries(c.feeders)) fishUser(f, id).coins += Math.round(50 * r.mult + n * 5);
      lines.push(`🌊 **${c.name}** is fully grown and was released into the ocean! Everyone who fed it earned a bonus. A new fish hatched!`);
      f.current = hatchFish(); f.lastFed = now; f.lastDecay = 0;
      lines.push(`🥚 New fish: ${f.current.emoji} **${f.current.name}** (${RARITY[f.current.rarity].icon} ${f.current.rarity})`);
    }
  }
  save();
  const e = fishEmbed(f, `🍤 ${user.username} fed ${c.name}!`).addFields({ name: 'Reward', value: `+**${coins}** 🪙 coins • Total: **${u.coins}** 🪙\nYour level: **${u.level}** (${u.progress}/${userNeed(u.level)})\nNext feed: <t:${ts(now + FISH_CD)}:R>` });
  if (lines.length) e.addFields({ name: '✨ Events', value: lines.join('\n') });
  return { embed: e };
}

grp('fish', '🐟 Feed the server fish and level up!', null, [
  ['feed', 'Feed the fish (once every 5 hours)'],
  ['status', 'See the current fish'],
  ['leaderboard', 'Top feeders', [S('type', 'Rank by', false, { choices: ['feeds', 'coins', 'level'] })]],
  ['collection', 'All fish species & which ones your server has released'],
  ['profile', 'Your fish stats', [U('user', 'Member')]]
]);
H.fish = {
  feed: async i => { const r = doFeed(i.guild, i.user, i.channel.id); return send(i, r.embed ? { embeds: [r.embed] } : r.text, !r.embed); },
  status: async i => send(i, { embeds: [fishEmbed(getFish(G(i.guild.id)))] }, false),
  leaderboard: async i => {
    const f = getFish(G(i.guild.id)), t = i.options.getString('type') || 'feeds';
    const key = u => t === 'coins' ? u.coins : t === 'level' ? u.level * 1000 + u.progress : u.feeds;
    const rows = Object.entries(f.users).sort((a, b) => key(b[1]) - key(a[1])).slice(0, 10);
    const medal = ['🥇', '🥈', '🥉'];
    const txt = rows.map(([id, u], n) => `${medal[n] || `**${n + 1}.**`} <@${id}> — ${t === 'coins' ? `${u.coins} 🪙` : t === 'level' ? `Level ${u.level}` : `${u.feeds} feeds`}  _(Lv ${u.level} • ${u.coins} 🪙)_`).join('\n');
    return send(i, { embeds: [emb(`🏆 Fish Leaderboard — ${t}`, txt || 'Nobody has fed the fish yet. Use `/fish feed`!', COLORS.warn)] }, false);
  },
  collection: async i => {
    const f = getFish(G(i.guild.id));
    const parts = Object.entries(SPECIES).reverse().map(([rar, list]) => `${RARITY[rar].icon} **${rar}** (x${RARITY[rar].mult} coins)\n` + list.map(([n, e]) => { const c = f.collection[n]; return c ? `${e} ${n} ✅ x${c.count}` : `${e} ~~${n}~~ ❔`; }).join(' • '));
    return send(i, { embeds: [emb('📖 Fish Collection', `Fish released in this server: **${f.released}**\n\n${parts.join('\n\n')}`, COLORS.main).setThumbnail(f.current.img)] }, false);
  },
  profile: async i => {
    const f = getFish(G(i.guild.id)), t = i.options.getUser('user') || i.user, u = f.users[t.id];
    if (!u) return send(i, `🐟 **${t.username}** hasn't fed the fish yet.`);
    const rank = Object.entries(f.users).sort((a, b) => b[1].feeds - a[1].feeds).findIndex(([id]) => id === t.id) + 1;
    return send(i, { embeds: [emb(`🎣 ${t.username}'s Fish Profile`, `**Level:** ${u.level} ${fbar(u.progress, userNeed(u.level))} ${u.progress}/${userNeed(u.level)}\n**Feeds:** ${u.feeds} • **Rank:** #${rank}\n**Coins:** ${u.coins} 🪙\n**Next feed:** ${Date.now() - u.lastFeed >= FISH_CD ? '✅ ready now!' : `<t:${ts(u.lastFeed + FISH_CD)}:R>`}`, COLORS.ok).setThumbnail(t.displayAvatarURL())] }, false);
  }
};
async function prefixFish(message, cmd) {
  if (cmd === 'feed') { const r = doFeed(message.guild, message.author, message.channel.id); await message.reply(r.embed ? { embeds: [r.embed], allowedMentions: { repliedUser: false } } : { content: r.text, allowedMentions: { repliedUser: false } }).catch(() => {}); }
  else await message.reply({ embeds: [fishEmbed(getFish(G(message.guild.id)))], allowedMentions: { repliedUser: false } }).catch(() => {});
  return true;
}
async function fishTick() {
  const now = Date.now();
  for (const guild of client.guilds.cache.values()) {
    const g = db.guilds[guild.id]; if (!g?.fish) continue;
    const f = g.fish, c = f.current, base = Math.max(f.lastFed || c.born, f.lastDecay || 0);
    const steps = Math.floor((now - base) / FISH_DECAY); if (steps < 1) continue;
    const n = Math.min(steps, FISH_MAX);
    c.level = Math.max(1, c.level - n); c.progress = 0;
    let hit = 0; for (const u of Object.values(f.users)) if (u.level > 1) { u.level = Math.max(1, u.level - n); u.progress = 0; hit++; }
    f.lastDecay = base + steps * FISH_DECAY; save();
    const ch = f.channel && guild.channels.cache.get(f.channel);
    if (ch?.isTextBased()) ch.send({ embeds: [emb('📉 Nobody fed the fish!', `${c.emoji} **${c.name}** went hungry for ${n} day${n > 1 ? 's' : ''}.\nThe fish is now **Level ${c.level}** and **${hit}** player${hit === 1 ? '' : 's'} lost ${n} level${n > 1 ? 's' : ''}.\nUse \`/fish feed\` to cheer it up!`, COLORS.err).setThumbnail(c.img)] }).catch(() => {});
  }
}

// ---------------------------------------------------------------------
//  3. UWULOCK   /uwulock add | remove | list
//     Locked members' messages are deleted and re-sent in uwu-speak via webhook.
// ---------------------------------------------------------------------
grp('uwulock', 'UwU-lock a member (their messages get uwu-ified)', P.ModerateMembers, [
  ['add', 'UwU-lock a member', [U('user', 'Member to uwulock', true)]],
  ['remove', 'Remove the uwulock', [U('user', 'Member', true)]],
  ['list', 'List uwulocked members']
]);
H.uwulock = {
  add: async i => {
    if (!isStaff(i.member)) return send(i, '❌ Staff only.');
    const m = i.options.getMember('user'); if (!m) return send(i, '❌ Member not found.');
    if (m.user.bot) return send(i, '❌ You can\'t uwulock a bot.');
    const why = canAct(i, m); if (why) return send(i, `❌ ${why}`);
    G(i.guild.id).uwu[m.id] = { by: i.user.id, at: Date.now() }; save();
    return send(i, `😺 ${m} is now **uwulocked**! ${rpick(UWU_FACES)}`, false);
  },
  remove: async i => {
    if (!isStaff(i.member)) return send(i, '❌ Staff only.');
    const u = i.options.getUser('user'), g = G(i.guild.id);
    if (!g.uwu[u.id]) return send(i, '⚠️ That member is not uwulocked.');
    delete g.uwu[u.id]; save(); return send(i, `✅ ${u} is free from the uwulock.`, false);
  },
  list: async i => { const ids = Object.keys(G(i.guild.id).uwu); return send(i, { embeds: [emb('😺 UwU-locked members', ids.map(id => `<@${id}>`).join('\n') || 'Nobody is uwulocked.')] }); }
};
const UWU_FACES = ['uwu', 'owo', '>w<', '^w^', '(´・ω・`)', 'nyaa~', '(◕ᴗ◕✿)', 'rawr x3', ':3'];
function uwuify(text) {
  return text.split(/(```[\s\S]*?```|<[^>]*>|https?:\/\/\S+|:\w+:)/).map((p, k) => k % 2 ? p
    : p.replace(/[rl]/g, 'w').replace(/[RL]/g, 'W').replace(/([nN])([aeiouAEIOU])/g, (m, n, v) => `${n}${n === 'N' ? 'Y' : 'y'}${v}`).replace(/!+/g, m => ` ${rpick(UWU_FACES)}${m}`)
  ).join('') + (Math.random() < 0.35 ? ` ${rpick(UWU_FACES)}` : '');
}
const uwuHooks = new Map();
async function uwuHook(channel) {
  const base = channel.isThread() ? channel.parent : channel; if (!base?.fetchWebhooks) return null;
  if (uwuHooks.has(base.id)) return uwuHooks.get(base.id);
  const hooks = await base.fetchWebhooks();
  const h = hooks.find(w => w.owner?.id === client.user.id && w.name === 'UwuLock') || await base.createWebhook({ name: 'UwuLock', reason: 'UwU lock' });
  uwuHooks.set(base.id, h); return h;
}
async function uwuLockHandle(message) {
  const g = G(message.guild.id); if (!g.uwu[message.author.id]) return false;
  if (message.system || !message.content || message.attachments.size || message.stickers?.size) return false;
  try {
    const hook = await uwuHook(message.channel); if (!hook) return false;
    const text = uwuify(message.content).slice(0, 2000), who = message.member || message.author;
    await hook.send({ content: text, username: (message.member?.displayName || message.author.username).slice(0, 80), avatarURL: who.displayAvatarURL(), threadId: message.channel.isThread() ? message.channel.id : undefined, allowedMentions: { parse: [] } });
    await message.delete().catch(() => {}); return true;
  } catch (e) { uwuHooks.delete(message.channel.id); return false; }
}

// ---------------------------------------------------------------------
//  4. SCHEDULE REMINDER   /reminder add | list | remove | timezone
//     Mentions @everyone / @here / a role when the time comes. Default timezone: UTC+8 (Philippines)
// ---------------------------------------------------------------------
grp('reminder', '📅 Scheduled reminders that can ping everyone', null, [
  ['add', 'Schedule an announcement/reminder (staff)', [
    S('title', 'Title e.g. Movie Night', true), S('date', 'Date: YYYY-MM-DD, MM/DD, today, tomorrow', true), S('time', 'Time: 14:30 or 2:30pm', true),
    S('message', 'Extra details (use \\n for new lines)'), CT('channel', 'Channel to announce in (default: here)'),
    S('ping', 'Who to ping (default: everyone)', false, { choices: ['everyone', 'here', 'none'] }), R('role', 'Also ping this role'), S('before', 'Also warn beforehand e.g. 30m, 1h, 1d')]],
  ['list', 'Show the upcoming schedule'],
  ['remove', 'Remove a scheduled reminder (staff)', [I('id', 'Reminder ID (see /reminder list)', true)]],
  ['timezone', 'Set the server timezone offset (staff)', [N('utc_offset', 'Hours from UTC e.g. 8 for Philippines', true, { min: -12, max: 14 })]]
]);
const tzOf = g => (g.settings.tzOffset ?? 8);
function parseWhen(dateStr, timeStr, off) {
  const tm = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i.exec((timeStr || '').trim()); if (!tm) return { err: 'Invalid time. Use `14:30` or `2:30pm`.' };
  let h = +tm[1], min = +(tm[2] || 0); const ap = (tm[3] || '').toLowerCase();
  if (ap) { if (h < 1 || h > 12) return { err: 'Invalid time.' }; if (ap === 'pm' && h < 12) h += 12; if (ap === 'am' && h === 12) h = 0; }
  if (h > 23 || min > 59) return { err: 'Invalid time.' };
  const local = new Date(Date.now() + off * 36e5); let y = local.getUTCFullYear(), mo = local.getUTCMonth() + 1, d = local.getUTCDate();
  const ds = (dateStr || '').trim().toLowerCase();
  if (ds === 'today') { /* keep */ } else if (ds === 'tomorrow') { const t = new Date(Date.UTC(y, mo - 1, d + 1)); y = t.getUTCFullYear(); mo = t.getUTCMonth() + 1; d = t.getUTCDate(); }
  else {
    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(ds);
    if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
    else if ((m = /^(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?$/.exec(ds))) { mo = +m[1]; d = +m[2]; if (m[3]) y = +m[3] < 100 ? 2000 + +m[3] : +m[3]; }
    else return { err: 'Invalid date. Use `2026-12-25`, `12/25`, `today` or `tomorrow`.' };
  }
  const chk = new Date(Date.UTC(y, mo - 1, d, h, min));
  if (chk.getUTCMonth() !== mo - 1 || chk.getUTCDate() !== d) return { err: 'That date does not exist.' };
  return { at: chk.getTime() - off * 36e5 };
}
H.reminder = {
  add: async i => {
    if (!isStaff(i.member)) return send(i, '❌ Only staff can schedule reminders that ping everyone.');
    const g = G(i.guild.id), w = parseWhen(i.options.getString('date'), i.options.getString('time'), tzOf(g));
    if (w.err) return send(i, `❌ ${w.err}`);
    if (w.at < Date.now() + 10000) return send(i, '❌ That time is already in the past.');
    const beforeStr = i.options.getString('before'), before = beforeStr ? parseDuration(beforeStr) : 0;
    if (beforeStr && !before) return send(i, '❌ Invalid `before` value. Use e.g. 30m, 1h, 1d.');
    const ch = i.options.getChannel('channel') || i.channel;
    const r = { id: ++g.schedSeq, title: i.options.getString('title'), text: nl(i.options.getString('message')), at: w.at, channel: ch.id, ping: i.options.getString('ping') || 'everyone', role: i.options.getRole('role')?.id || null, before: before || 0, preSent: false, by: i.user.id };
    g.schedules.push(r); save();
    return send(i, { embeds: [emb('✅ Reminder scheduled', `**#${r.id} — ${r.title}**\n🗓️ <t:${ts(r.at)}:F> (<t:${ts(r.at)}:R>)\n📢 ${ch} • ping: **${r.ping}**${r.role ? ` + <@&${r.role}>` : ''}${r.before ? `\n⏳ Early warning ${fmtDur(r.before)} before` : ''}\n🌏 Timezone: UTC${tzOf(g) >= 0 ? '+' : ''}${tzOf(g)}`, COLORS.ok)] }, false);
  },
  list: async i => {
    const g = G(i.guild.id), l = g.schedules.slice().sort((a, b) => a.at - b.at);
    return send(i, { embeds: [emb('📅 Upcoming Schedule', trunc(l.map(r => `**#${r.id}** — **${r.title}**\n<t:${ts(r.at)}:F> (<t:${ts(r.at)}:R>) • <#${r.channel}> • ${r.ping}`).join('\n\n') || 'Nothing scheduled. Staff can add one with `/reminder add`.', 3900), COLORS.warn)] }, false);
  },
  remove: async i => {
    if (!isStaff(i.member)) return send(i, '❌ Staff only.');
    const g = G(i.guild.id), id = i.options.getInteger('id'), n = g.schedules.length;
    g.schedules = g.schedules.filter(r => r.id !== id); save();
    return send(i, g.schedules.length < n ? `✅ Removed reminder #${id}.` : '❌ No reminder with that ID.');
  },
  timezone: async i => {
    if (!isStaff(i.member)) return send(i, '❌ Staff only.');
    const g = G(i.guild.id); g.settings.tzOffset = i.options.getNumber('utc_offset'); save();
    return send(i, `✅ Timezone set to **UTC${g.settings.tzOffset >= 0 ? '+' : ''}${g.settings.tzOffset}**. New reminders use this time.`);
  }
};
async function scheduleTick() {
  const now = Date.now();
  for (const guild of client.guilds.cache.values()) {
    const g = db.guilds[guild.id]; if (!g?.schedules?.length) continue;
    for (const r of g.schedules.slice()) {
      const ch = guild.channels.cache.get(r.channel);
      const pings = [r.ping === 'everyone' ? '@everyone' : r.ping === 'here' ? '@here' : '', r.role ? `<@&${r.role}>` : ''].filter(Boolean).join(' ');
      const allowed = { parse: r.ping === 'none' ? [] : ['everyone'], roles: r.role ? [r.role] : [] };
      if (!ch?.isTextBased()) { if (r.at <= now) { g.schedules = g.schedules.filter(x => x !== r); save(); } continue; }
      if (r.before && !r.preSent && now >= r.at - r.before && now < r.at) {
        r.preSent = true; save();
        await ch.send({ content: pings || undefined, embeds: [emb(`⏳ Starting soon: ${r.title}`, `${r.text ? r.text + '\n\n' : ''}Starts <t:${ts(r.at)}:R> (<t:${ts(r.at)}:F>)`, COLORS.warn)], allowedMentions: allowed }).catch(() => {});
      }
      if (r.at <= now) {
        g.schedules = g.schedules.filter(x => x !== r); save();
        await ch.send({ content: pings || undefined, embeds: [emb(`📢 ${r.title}`, `${r.text ? r.text + '\n\n' : ''}🗓️ It's time! <t:${ts(r.at)}:F>`, COLORS.ok).setFooter({ text: 'Scheduled reminder' })], allowedMentions: allowed }).catch(noteError);
      }
    }
  }
}

// ---------------------------------------------------------------------
//  5. MUSIC   /play /pause /resume /skip /stop /queue /nowplaying /volume /loop
//     Needs:  npm i @discordjs/voice @snazzah/davey play-dl ffmpeg-static opusscript libsodium-wrappers
//     Best YouTube reliability: also install the `yt-dlp` program on your host (optional, auto-detected).
//         - set YTDLP_PATH if it is not on PATH, YTDLP_COOKIES=/path/cookies.txt if YouTube asks to sign in
//     Works with: YouTube links/playlists, song names (YouTube search), SoundCloud links,
//                 Spotify track links (matched on YouTube), direct .mp3/.ogg/.wav links.
//     Optional env: SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REFRESH_TOKEN (Spotify albums/playlists)
//                   YT_COOKIE (play-dl cookie, helps when YouTube blocks the server)
// ---------------------------------------------------------------------
const cp = require('child_process');
let Voice = null, playdl = null;
try { Voice = require('@discordjs/voice'); } catch (e) { console.warn('[music] @discordjs/voice not installed — music disabled.'); }
try {
  playdl = require('play-dl');
  const tok = {};
  if (process.env.YT_COOKIE) tok.youtube = { cookie: process.env.YT_COOKIE };
  if (process.env.SPOTIFY_CLIENT_ID) tok.spotify = { client_id: process.env.SPOTIFY_CLIENT_ID, client_secret: process.env.SPOTIFY_CLIENT_SECRET, refresh_token: process.env.SPOTIFY_REFRESH_TOKEN, market: 'PH' };
  if (Object.keys(tok).length) Promise.resolve(playdl.setToken(tok)).catch(() => {});
} catch (e) { console.warn('[music] play-dl not installed — falling back to yt-dlp only if available.'); }
let YTDLP = process.env.YTDLP_PATH || 'yt-dlp';
let hasYtdlp = false;
const checkYtdlp = p => { try { return cp.spawnSync(p, ['--version'], { timeout: 15000 }).status === 0; } catch (e) { return false; } };
hasYtdlp = checkYtdlp(YTDLP);
// no yt-dlp installed? download the standalone build next to the bot (no Python / no terminal needed)
async function ensureYtdlp() {
  if (hasYtdlp || process.env.YTDLP_NO_AUTODOWNLOAD) return;
  const path = require('path'), win = process.platform === 'win32';
  const file = win ? 'yt-dlp.exe' : process.platform === 'darwin' ? 'yt-dlp_macos' : (process.arch === 'arm64' ? 'yt-dlp_linux_aarch64' : 'yt-dlp_linux');
  const dest = path.join(process.cwd(), win ? 'yt-dlp.exe' : 'yt-dlp');
  try {
    if (!fs.existsSync(dest)) {
      console.log(`[music] yt-dlp not found — downloading ${file} ...`);
      const r = await fetch(`https://github.com/yt-dlp/yt-dlp/releases/latest/download/${file}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
      if (!win) fs.chmodSync(dest, 0o755);
    }
    if (checkYtdlp(dest)) { YTDLP = dest; hasYtdlp = true; console.log('[music] ✅ yt-dlp ready:', dest); cp.execFile(dest, ['-U'], { timeout: 60000 }, () => {}); }
    else console.warn('[music] downloaded yt-dlp but it cannot run on this host (try installing python3 + `pip install yt-dlp`).');
  } catch (e) { console.warn('[music] yt-dlp auto-download failed:', e.message); }
}
let hasFfmpeg = false;
try { require('ffmpeg-static'); hasFfmpeg = true; } catch (e) { try { hasFfmpeg = cp.spawnSync('ffmpeg', ['-version'], { timeout: 8000 }).status === 0; } catch (e2) { hasFfmpeg = false; } }
let hasOpus = false, hasSodium = false;
for (const m of ['@discordjs/opus', 'opusscript']) { try { require(m); hasOpus = true; break; } catch (e) { /* next */ } }
for (const m of ['sodium-native', 'libsodium-wrappers', 'tweetnacl', '@noble/ciphers']) { try { require(m); hasSodium = true; break; } catch (e) { /* next */ } }
let hasDave = false; try { require('@snazzah/davey'); hasDave = true; } catch (e) { /* missing */ }
console.log(`[music] voice: ${!!Voice} • play-dl: ${!!playdl} • yt-dlp: ${hasYtdlp} • ffmpeg: ${hasFfmpeg} • opus: ${hasOpus} • encryption: ${hasSodium} • davey(DAVE): ${hasDave}`);
if (Voice && Voice.generateDependencyReport) console.log(Voice.generateDependencyReport());
if (Voice && !hasFfmpeg) console.warn('[music] ❌ ffmpeg NOT found -> bot will join but stay silent. Run: npm i ffmpeg-static');
if (Voice && !hasOpus) console.warn('[music] ❌ no opus encoder -> silent. Run: npm i opusscript');
if (Voice && !hasSodium) console.warn('[music] ❌ no encryption lib -> cannot send audio. Run: npm i libsodium-wrappers');
if (Voice && !hasDave) console.warn('[music] ⚠️ @snazzah/davey missing -> Discord may reject audio (DAVE). Run: npm i @snazzah/davey');
const ytdlpBase = () => ['--no-warnings', '-q', ...(process.env.YTDLP_COOKIES ? ['--cookies', process.env.YTDLP_COOKIES] : []), ...(process.env.YTDLP_ARGS ? process.env.YTDLP_ARGS.split(' ').filter(Boolean) : [])];

def('play', '🎵 Play a song (name, YouTube/Spotify/SoundCloud link, or direct link)', null, [S('query', 'Song name or link', true)]);
def('pause', '⏸️ Pause the music');
def('resume', '▶️ Resume the music');
def('skip', '⏭️ Skip the current song');
def('stop', '⏹️ Stop the music, clear the queue and leave');
def('queue', '📜 Show the music queue');
def('nowplaying', '🎶 Show the current song');
def('volume', '🔊 Set the volume', null, [I('level', 'Volume 1-100', true, { min: 1, max: 100 })]);
def('loop', '🔁 Set loop mode', null, [S('mode', 'Loop mode', true, { choices: ['off', 'track', 'queue'] })]);

const musicQ = new Map();
const clock = s => { s = Math.max(0, Math.floor(s || 0)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? `${h}:${String(m).padStart(2, '0')}` : `${m}`) + `:${String(x).padStart(2, '0')}`; };
const unHtml = s => (s || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, '\'').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const ytTrack = (v, by) => ({ title: v.title || 'Unknown', url: v.url, duration: v.durationInSec || 0, thumb: v.thumbnails?.[v.thumbnails.length - 1]?.url || v.thumbnails?.[0]?.url, by });
const AUDIO_FILE_RE = /\.(mp3|ogg|oga|wav|flac|m4a|aac|opus|webm)(\?|$)/i;

// ---- yt-dlp helpers (most reliable for YouTube) ----
function ytdlpJson(args) {
  return new Promise((resolve, reject) => {
    cp.execFile(YTDLP, [...ytdlpBase(), '-J', ...args], { maxBuffer: 64 * 1024 * 1024, timeout: 30000 }, (err, out, errOut) => {
      if (err) return reject(new Error(trunc(String(errOut || err.message).split('\n').filter(Boolean).pop() || 'yt-dlp failed', 200)));
      try { resolve(JSON.parse(out)); } catch (e) { reject(new Error('yt-dlp returned invalid data.')); }
    });
  });
}
async function ytdlpResolve(query, by) {
  const isUrl = /^https?:\/\//i.test(query), playlistOnly = isUrl && /(\/playlist|[?&]list=)/.test(query) && !/[?&]v=/.test(query);
  const j = await ytdlpJson([...(playlistOnly ? ['--flat-playlist'] : ['--no-playlist', '--flat-playlist']), isUrl ? query : `ytsearch1:${query}`]);
  const one = e => ({ title: e.title || 'Unknown', url: e.webpage_url || (e.url && /^https?:/.test(e.url) ? e.url : `https://www.youtube.com/watch?v=${e.id}`), duration: e.duration || 0, thumb: e.thumbnail || e.thumbnails?.[e.thumbnails.length - 1]?.url, by });
  if (j.entries) { const list = j.entries.filter(Boolean).slice(0, 100).map(one); if (!list.length) throw new Error('No results found.'); return isUrl ? list : [list[0]]; }
  return [one(j)];
}

async function spotifyQueries(url) {
  try {
    if (!playdl) throw 0;
    const sp = await playdl.spotify(url);
    const name = t => `${t.name} ${(t.artists || []).map(a => a.name).join(' ')}`;
    if (sp.type === 'track') return [name(sp)];
    const all = await sp.all_tracks(); return all.slice(0, 100).map(name);
  } catch (e) { /* no credentials -> fall back below */ }
  if (/\/track\//.test(url)) {
    const html = await (await fetch(url)).text();
    const t = /<meta property="og:title" content="([^"]+)"/.exec(html)?.[1], d = /<meta property="og:description" content="([^"]+)"/.exec(html)?.[1];
    if (t) return [`${unHtml(t)} ${unHtml((d || '').split('·')[0])}`.trim()];
  }
  throw new Error('Spotify albums/playlists need SPOTIFY_CLIENT_ID / SECRET / REFRESH_TOKEN set. Single track links work without them.');
}
async function musicResolve(query, by) {
  const isUrl = /^https?:\/\//i.test(query);
  if (isUrl && /open\.spotify\.com|spotify\.link/i.test(query)) return (await spotifyQueries(query)).map(q => ({ title: q, query: q, duration: 0, by }));
  if (isUrl && AUDIO_FILE_RE.test(query)) return [{ title: decodeURIComponent(query.split('?')[0].split('/').pop() || query), url: query, direct: true, duration: 0, by }];
  if (hasYtdlp) { try { return await ytdlpResolve(query, by); } catch (e) { console.warn('[music] yt-dlp resolve failed:', e.message); if (!playdl) throw e; } }
  if (!playdl) throw new Error('No music engine available (install play-dl or yt-dlp).');
  if (!isUrl) {
    const r = await playdl.search(query, { limit: 1, source: { youtube: 'video' } });
    if (!r[0]) throw new Error('No results found.');
    return [ytTrack(r[0], by)];
  }
  const kind = await playdl.validate(query).catch(() => false);
  if (kind === 'yt_video') return [ytTrack((await playdl.video_basic_info(query)).video_details, by)];
  if (kind === 'yt_playlist') { const pl = await playdl.playlist_info(query, { incomplete: true }); return (await pl.all_videos()).slice(0, 100).map(v => ytTrack(v, by)); }
  if (kind === 'so_track') { const s = await playdl.soundcloud(query); return [{ title: s.name, url: s.url, duration: s.durationInSec, thumb: s.thumbnail, by }]; }
  return [{ title: decodeURIComponent(query.split('?')[0].split('/').pop() || query), url: query, direct: true, duration: 0, by }];
}
async function trackResource(t, q) {
  if (t.direct) return Voice.createAudioResource(t.url, { inlineVolume: true });
  if (hasYtdlp) {
    if (!t.url) Object.assign(t, (await ytdlpResolve(t.query, t.by))[0]);
    const proc = cp.spawn(YTDLP, [...ytdlpBase(), '-f', 'bestaudio/best', '--no-playlist', '-o', '-', t.url], { stdio: ['ignore', 'pipe', 'pipe'] });
    let err = '', got = false; proc.stderr.on('data', d => { err += d; }); proc.stdout.once('data', () => { got = true; });
    proc.on('close', code => { if (code && !got && q?.current === t) q.text?.send(`⚠️ yt-dlp: ${trunc(err.trim().split('\n').pop() || 'stream failed', 200)}`).catch(() => {}); });
    proc.on('error', noteError);
    const res = Voice.createAudioResource(proc.stdout, { inputType: Voice.StreamType.Arbitrary, inlineVolume: true });
    res.proc = proc; return res;
  }
  if (!t.url) {
    const r = await playdl.search(t.query, { limit: 1, source: { youtube: 'video' } });
    if (!r[0]) throw new Error(`No YouTube match for "${t.query}"`);
    Object.assign(t, ytTrack(r[0], t.by));
  }
  const s = await playdl.stream(t.url, { quality: 2 });
  return Voice.createAudioResource(s.stream, { inputType: s.type, inlineVolume: true });
}
function musicDestroy(gid) {
  const q = musicQ.get(gid); if (!q) return;
  clearTimeout(q.idle); musicQ.delete(gid);
  try { q.res?.proc?.kill(); } catch (e) { /* ignore */ }
  try { q.player.stop(true); } catch (e) { /* ignore */ }
  try { q.conn.destroy(); } catch (e) { /* ignore */ }
}
async function musicNext(gid) {
  const q = musicQ.get(gid); if (!q) return;
  clearTimeout(q.idle);
  try { q.res?.proc?.kill(); } catch (e) { /* ignore */ }
  const t = q.queue[0];
  if (!t) { q.current = null; q.res = null; q.idle = setTimeout(() => musicDestroy(gid), 120000); return; }
  try {
    q.current = t;
    const res = await trackResource(t, q);
    res.volume?.setVolume(q.volume / 100);
    q.res = res; q.player.play(res);
    // only announce once audio REALLY starts (Playing); otherwise tell the user why not
    Voice.entersState(q.player, Voice.AudioPlayerStatus.Playing, 20000).then(() => {
      if (musicQ.get(gid) === q && q.current === t) q.text?.send({ embeds: [musicEmbed('🎶 Now playing', t)], allowedMentions: { parse: [] } }).catch(() => {});
    }).catch(() => {
      if (musicQ.get(gid) !== q || q.current !== t) return;
      const vs = q.conn?.state?.status, ps = q.player?.state?.status;
      console.warn(`[music] audio did not start. voice=${vs} player=${ps}`);
      try { q.res?.proc?.kill(); } catch (e) { /* ignore */ }
      q.queue.shift(); musicNext(gid);
      q.text?.send(`⚠️ Audio didn't start (voice: \`${vs}\`, player: \`${ps}\`). ${vs !== 'ready' ? 'Voice connection problem — update `@discordjs/voice` and install `@snazzah/davey`.' : 'The stream failed — check the console / install `yt-dlp`.'}`).catch(() => {});
    });
  } catch (e) {
    noteError(e); q.text?.send(`❌ Couldn't play **${trunc(t.title, 80)}**: ${trunc(e.message, 150)} — skipping.`).catch(() => {});
    q.queue.shift(); return musicNext(gid);
  }
}
const musicEmbed = (title, t) => { const e = emb(title, `**[${trunc(t.title, 200)}](${t.url || 'https://discord.com'})**\n${t.duration ? `⏱️ ${clock(t.duration)} • ` : ''}Requested by <@${t.by}>`, COLORS.main); if (t.thumb) e.setThumbnail(t.thumb); return e; };
function musicNeeds(i) {
  if (!Voice || (!playdl && !hasYtdlp)) return '❌ Music isn\'t set up on this bot yet. The owner must run: `npm i @discordjs/voice @snazzah/davey play-dl ffmpeg-static opusscript libsodium-wrappers` and restart.';
  if (!i.member.voice?.channel) return '❌ Join a voice channel first.';
  const q = musicQ.get(i.guild.id);
  if (q && q.channelId !== i.member.voice.channelId) return `❌ I'm already playing in <#${q.channelId}>.`;
  return null;
}
async function musicGet(i) {
  let q = musicQ.get(i.guild.id); if (q) { q.text = i.channel; return q; }
  const vc = i.member.voice.channel;
  if (!vc.joinable || !vc.speakable) throw new Error('I need **Connect** and **Speak** permission in that voice channel.');
  const conn = Voice.joinVoiceChannel({ channelId: vc.id, guildId: i.guild.id, adapterCreator: i.guild.voiceAdapterCreator, selfDeaf: true });
  await Voice.entersState(conn, Voice.VoiceConnectionStatus.Ready, 15000).catch(e => { conn.destroy(); throw new Error('Could not connect to the voice channel (15s). Check Connect/Speak permission, and that @discordjs/voice + @snazzah/davey are installed.'); });
  const player = Voice.createAudioPlayer({ behaviors: { noSubscriber: Voice.NoSubscriberBehavior.Play } });
  conn.subscribe(player);
  q = { conn, player, queue: [], current: null, res: null, loop: 'off', volume: 60, text: i.channel, channelId: vc.id, idle: null };
  musicQ.set(i.guild.id, q);
  player.on(Voice.AudioPlayerStatus.Idle, () => {
    const cur = musicQ.get(i.guild.id); if (!cur) return;
    if (cur.loop === 'queue') cur.queue.push(cur.queue.shift()); else if (cur.loop !== 'track') cur.queue.shift();
    musicNext(i.guild.id);
  });
  player.on('error', e => { noteError(e); musicQ.get(i.guild.id)?.text?.send(`❌ Audio error: ${trunc(e.message, 200)}`).catch(() => {}); });
  player.on('stateChange', (o, n) => console.log(`[music] player ${o.status} -> ${n.status}`));
  conn.on('stateChange', (o, n) => console.log(`[music] voice ${o.status} -> ${n.status}`));
  conn.on(Voice.VoiceConnectionStatus.Disconnected, async () => {
    try { await Promise.race([Voice.entersState(conn, Voice.VoiceConnectionStatus.Signalling, 5000), Voice.entersState(conn, Voice.VoiceConnectionStatus.Connecting, 5000)]); }
    catch (e) { musicDestroy(i.guild.id); }
  });
  return q;
}
H.play = async i => {
  const bad = musicNeeds(i); if (bad) return send(i, bad);
  if (!hasFfmpeg) return send(i, '❌ ffmpeg is missing, so I can join but not play audio. Owner: run `npm i ffmpeg-static opusscript libsodium-wrappers @snazzah/davey` and restart.');
  await defer(i, false);
  let timer;
  try {
    const query = i.options.getString('query').trim();
    console.log(`[music] /play "${query}" (yt-dlp: ${hasYtdlp})`);
    await send(i, '🔎 Searching...');
    const tracks = await Promise.race([
      musicResolve(query, i.user.id),
      new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('Search timed out (20s) — YouTube is probably blocking the bot. Install yt-dlp or set YT_COOKIE.')), 20000); })
    ]);
    if (!tracks.length) return send(i, '❌ Nothing found.');
    console.log(`[music] found ${tracks.length} track(s): ${tracks[0].title}`);
    if (!musicQ.get(i.guild.id)) await send(i, '🔊 Joining voice channel...');
    const q = await musicGet(i), wasEmpty = q.queue.length === 0;
    console.log('[music] joined voice, starting playback');
    q.queue.push(...tracks);
    if (wasEmpty) musicNext(i.guild.id).catch(noteError);
    return send(i, { embeds: [tracks.length > 1 ? emb('➕ Added to queue', `Added **${tracks.length}** tracks.`, COLORS.ok) : musicEmbed(wasEmpty ? '▶️ Starting' : `➕ Added to queue (#${q.queue.length})`, tracks[0])] });
  } catch (e) { noteError(e); return send(i, `❌ ${trunc(e.message, 300)}`); }
  finally { clearTimeout(timer); }
};
const withQ = fn => async i => {
  const bad = musicNeeds(i); if (bad) return send(i, bad);
  const q = musicQ.get(i.guild.id); if (!q) return send(i, '❌ Nothing is playing.');
  return fn(i, q);
};
H.pause = withQ((i, q) => { q.player.pause(); return send(i, '⏸️ Paused.', false); });
H.resume = withQ((i, q) => { q.player.unpause(); return send(i, '▶️ Resumed.', false); });
H.skip = withQ((i, q) => { if (!q.current) return send(i, '❌ Nothing to skip.'); const t = q.current; if (q.loop === 'track') q.loop = 'off'; q.player.stop(true); return send(i, `⏭️ Skipped **${trunc(t.title, 80)}**.`, false); });
H.stop = withQ((i, q) => { musicDestroy(i.guild.id); return send(i, '⏹️ Stopped and left the voice channel.', false); });
H.volume = withQ((i, q) => { q.volume = i.options.getInteger('level'); q.res?.volume?.setVolume(q.volume / 100); return send(i, `🔊 Volume set to **${q.volume}%**.`, false); });
H.loop = withQ((i, q) => { q.loop = i.options.getString('mode'); return send(i, `🔁 Loop mode: **${q.loop}**.`, false); });
H.queue = async i => {
  const q = musicQ.get(i.guild.id); if (!q || !q.queue.length) return send(i, '📭 The queue is empty.');
  const lines = q.queue.slice(0, 15).map((t, n) => `${n === 0 ? '▶️' : `**${n}.**`} ${trunc(t.title, 70)}${t.duration ? ` \`${clock(t.duration)}\`` : ''}`).join('\n');
  return send(i, { embeds: [emb('📜 Queue', `${lines}${q.queue.length > 15 ? `\n…and ${q.queue.length - 15} more` : ''}`).setFooter({ text: `Loop: ${q.loop} • Volume: ${q.volume}%` })] }, false);
};
H.nowplaying = async i => { const q = musicQ.get(i.guild.id); if (!q?.current) return send(i, '❌ Nothing is playing.'); return send(i, { embeds: [musicEmbed('🎶 Now playing', q.current)] }, false); };

// ---------------------------------------------------------------------
//  Background loops for the new features
// ---------------------------------------------------------------------
client.once(Events.ClientReady, () => {
  ensureYtdlp().catch(noteError);
  setInterval(() => fishTick().catch(noteError), 60000);
  setInterval(() => scheduleTick().catch(noteError), 15000);
});


// =====================================================================
//  BOT INITIALIZATION
// =====================================================================
client.once(Events.ClientReady, async () => {
  console.log(`Logged in as ${client.user.tag}`);

  applyPresence(); // keeps the original status: idle • Competing in "Sindria On Top"

  try {
    const app = await client.application.fetch();
    if (app.owner?.members) app.owner.members.forEach(m => OWNER_IDS.push(m.id));
    else if (app.owner?.id) OWNER_IDS.push(app.owner.id);
  } catch (e) { /* ignore */ }

  await registerCommands();

  // Background jobs: giveaways, temp bans, reminders, voice XP
  setInterval(async () => {
    const now = Date.now();
    for (const guild of client.guilds.cache.values()) {
      const g = db.guilds[guild.id]; if (!g) continue;
      for (const [id, gw] of Object.entries(g.giveaways || {})) if (gw.endsAt <= now) await endGiveaway(guild, id).catch(noteError);
      const due = (g.tempbans || []).filter(t => t.until <= now);
      if (due.length) { g.tempbans = g.tempbans.filter(t => t.until > now); save(); for (const t of due) { await guild.members.unban(t.id, 'Temp ban expired').catch(() => {}); addCase(guild, 'UNBAN', t.id, client.user.id, 'Temp ban expired'); } }
    }
    const rem = db.global.reminders.filter(r => r.at <= now);
    if (rem.length) {
      db.global.reminders = db.global.reminders.filter(r => r.at > now); save();
      for (const r of rem) {
        const content = `⏰ <@${r.user}> Reminder: ${r.text}`, ch = r.channel && await client.channels.fetch(r.channel).catch(() => null);
        if (ch?.isTextBased()) await ch.send({ content, allowedMentions: { users: [r.user] } }).catch(async () => (await client.users.fetch(r.user).catch(() => null))?.send(content).catch(() => {}));
        else (await client.users.fetch(r.user).catch(() => null))?.send(content).catch(() => {});
      }
    }
  }, 15000);
  setInterval(() => {
    for (const guild of client.guilds.cache.values()) {
      if (!db.guilds[guild.id] || !G(guild.id).level.enabled) continue;
      for (const vs of guild.voiceStates.cache.values()) {
        if (!vs.channelId || !vs.member || vs.member.user.bot || vs.selfDeaf || vs.serverDeaf || vs.channelId === guild.afkChannelId) continue;
        addXp(guild, vs.id, 8, null).catch(() => {});
      }
    }
  }, 60000);
});

// --- LOGIN ---
client.login(process.env.DISCORD_TOKEN);

// --- HTTP SERVER FOR KEEP-ALIVE ---
http.createServer((req, res) => {
  res.write("Bot is alive!");
  res.end();
}).listen(process.env.PORT || 3000);
