import { ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle, ChatInputCommandInteraction, Client, Colors, EmbedBuilder, GatewayIntentBits, Partials, REST, Routes, SlashCommandBuilder } from "discord.js";
import { getState, onAvailable } from "./scraper.js";
import { Room } from "./types.js";
import roomConfigs from './config.js';

type ApplianceType = 'washer' | 'dryer';
type WatchKey = `${string}:${ApplianceType}`;

// watch store: ${roomLabel}:${type} -> Set<userId>
const watches = new Map<WatchKey, Set<string>>();

/**
 * Encodes a watch key
 * @param roomLabel 
 * @param type 
 * @returns watch key in format accepted by watch store
 */
function watchKey(roomLabel: string, type: ApplianceType): WatchKey {
    return `${roomLabel}:${type}`;
}

/**
 * Adds a user to the watch list for a specific room and appliance type
 * @param roomLabel 
 * @param type 
 * @param userId 
 */
function watch(roomLabel: string, type: ApplianceType, userId: string): void {
    const key = watchKey(roomLabel, type);
    if (!watches.has(key)) watches.set(key, new Set());
    watches.get(key)!.add(userId);
}

/**
 * If a user is watching a specific room and appliance type, removes them from the watch list
 * @param roomLabel 
 * @param type 
 * @param userId 
 */
function unwatch(roomLabel: string, type: ApplianceType, userId: string): void {
    watches.get(watchKey(roomLabel, type))?.delete(userId);
}

/**
 * Deletes all watchers for a specific room and type, returning the list of userIds that were watching for notification purposes
 * @param roomId 
 * @param type 
 * @returns 
 */
function clearWatchers(roomId: string, type: ApplianceType): string[] {
    const key = watchKey(roomId, type);
    const ids = [...(watches.get(key) ?? [])];
    watches.delete(key);
    return ids;
}

function watchedEntries(userId: string): { roomLabel: string; type: ApplianceType }[] {
    return [...watches.entries()]
        .filter(([, s]) => s.has(userId))
        .map(([key]) => {
            const [roomLabel, type] = key.split(':') as [string, ApplianceType];
            return { roomLabel, type };
        });
}

function fmtSoonest(soonest: number | null): string {
    return soonest !== null ? ` · next in ${soonest}m` : '';
}

function fmtRoom(room: Room): string {
    const w = room.washers;
    const d = room.dryers;
    return [
    `🌊 Washers: **${w.available}/${w.total}**${fmtSoonest(w.soonest)}`,
    `🔥 Dryers:  **${d.available}/${d.total}**${fmtSoonest(d.soonest)}`,
  ].join('\n');
}

function buildStatusEmbed() {
    const state = getState();
    const embed = new EmbedBuilder()
        .setTitle('🧦 Laundry Status')
        .setTimestamp(new Date(state.lastUpdated))
        .setFooter({ text: 'Last updated' });
    
    if (state.error) return embed.setColor(Colors.Red).setDescription('⚠️ Could not fetch laundry data.');
    if (!state.rooms.length) return embed.setColor(Colors.Grey).setDescription('No laundry rooms found.');

    embed.setColor(Colors.Blue);
    for (const room of state.rooms) {
        embed.addFields({
            name: room.label,
            value: fmtRoom(room)
        });
    }
    return embed;
}

function rewatchButton(roomLabel: string, type: ApplianceType): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(`rewatch:${roomLabel}:${type}`)
            .setLabel('Rewatch')
            .setEmoji('🔁')
            .setStyle(ButtonStyle.Secondary),
    );
}

const commands = [
    new SlashCommandBuilder()
        .setName('laundry')
        .setDescription('Laundry Bot Commands')
        .addSubcommand(s => s.setName('status').setDescription('Show all rooms for this instance'))
        .addSubcommand(s => s
            .setName('watch')
            .setDescription('DM me when a machine opens up in a specific room')
            .addStringOption(o => 
                o.setName('room').setDescription('Room to watch').setRequired(true)
                // addChoices supports up to 25 options — if you have more rooms, remove this
                // and consider adding autocomplete instead (interaction.respond in an autocomplete handler)
                .addChoices(roomConfigs.map(room => ({ name: room.label, value: room.label })))
            )
            .addStringOption(o => o
                .setName('type')
                .setDescription('Washer or dryer')
                .setRequired(true)
                .addChoices(
                    { name: 'Washer', value: 'washer' },
                    { name: 'Dryer', value: 'dryer' },
                )
            )
        )
        .addSubcommand(s => s
            .setName('unwatch')
            .setDescription('Stop watching a specific room')
            .addStringOption(o => 
                o.setName('room').setDescription('Room to watch').setRequired(true)
                // ditto as above
                .addChoices(roomConfigs.map(room => ({ name: room.label, value: room.label })))
            )
            .addStringOption(o => o
                .setName('type')
                .setDescription('Washer or dryer')
                .setRequired(true)
                .addChoices(
                    { name: 'Washer', value: 'washer' },
                    { name: 'Dryer', value: 'dryer' },
                )
            )
        )
        .addSubcommand(s => s.setName('watching').setDescription(`List what you're watching`)),
];

export async function startBot() {
    const token = process.env.DISCORD_TOKEN;
    const clientId = process.env.DISCORD_CLIENT_ID;

    if (!token || !clientId) {
        console.warn('[bot] DISCORD_TOKEN or DISCORD_CLIENT_ID not set in .env - bot disabled');
        return;
    }

    const rest = new REST({ version: '10'}).setToken(token);
    await rest.put(Routes.applicationCommands(clientId), { body: commands.map(c => c.toJSON()) });
    console.log('[bot] slash commands registered');

    const client = new Client({
        intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages],
        partials: [Partials.Channel],
    });

    onAvailable(async transitions => {
        for (const t of transitions) {
            const userIds = clearWatchers(t.roomLabel, t.type);
            if(!userIds.length) continue;

            const state = getState();
            const room = state.rooms.find(r => r.label === t.roomLabel);
            const machine = t.type === 'washer' ? "🌊 washer" : "🔥 dryer";
            const summary = room ? `\n${fmtRoom(room)}` : '';

            for (const userId of userIds) {
                try {
                    const user = await client.users.fetch(userId);
                    await user.send({
                        content: `🟢 A **${machine}** is available in **${t.roomLabel}**!\n-# Please allow at least 5 minutes for the previous user to retrieve their items.\n\nMissed your chance? Press the button below to rewatch the room for the same type of machine.`,
                        components: [rewatchButton(t.roomLabel, t.type)],
                    });
                } catch (error) {
                    console.error(`[bot] failed to DM ${userId}:`, error);
                }
            }
        }
    });

    client.on('interactionCreate', async interaction => {
        if (interaction.isButton()) {
            const ix = interaction as ButtonInteraction;
            if (ix.customId.startsWith('rewatch:')) {
                const [, roomLabel, type] = ix.customId.split(':') as [string, string, ApplianceType];
                const userId = ix.user.id;
                const room = getState().rooms.find(r => r.label === roomLabel);

                if (!room) {
                    await ix.reply({ content: '❌ Room no longer found.', ephemeral: true });
                    return;
                }

                const summary = type === 'washer' ? room.washers : room.dryers;

                if (summary.available > 0) {
                    await ix.reply({ content: `🟢 There's still one free in ${room.label}! Go grab it!`, flags: "Ephemeral"});
                    return;
                }

                watch(roomLabel, type, userId);
                const eta = summary.soonest !== null ? ` Soonest in ~${summary.soonest}m.` : '';
                await ix.update({
                    content: `👀 Back on the list for a **${type}** in **${room.label}**.${eta}`,
                    components: [],
                });
                return;
            }
        }

        if (interaction.isChatInputCommand()) {
            if (interaction.commandName !== 'laundry') return;

            const ix = interaction as ChatInputCommandInteraction;
            const sub = ix.options.getSubcommand();
            const userId = ix.user.id;

            switch (sub){
                case 'status': {
                    await ix.reply({ embeds: [buildStatusEmbed() ], flags: "Ephemeral"});
                    return;
                }
                case 'watch': {
                    const roomLabel = ix.options.getString('room', true);
                    const machine = ix.options.getString('type', true) as ApplianceType;
                    const room = getState().rooms.find(r => r.label === roomLabel);

                    if (!room) {
                        await ix.reply({
                            content: `❌ Room \`${roomLabel}\` not found. User \`/laundry status\` to see available rooms.`,
                            flags: "Ephemeral"
                        });
                        return;
                    }

                    const summary = machine === "washer" ? room.washers : room.dryers;
                    const label = machine === "washer" ? "🌊 washers" : "🔥 dryers";
                    
                    if (summary.available > 0) {
                        await ix.reply({
                            content: `🟢 **${room.label}** already has ${label} free!`,
                            flags: "Ephemeral"
                        });
                        return;
                    }

                    watch(roomLabel, machine, userId);
                    const eta = summary.soonest !== null ? ` Soonest in ~${summary.soonest}m.` : '';
                    await ix.reply({
                        content: `👀 I'll DM you when a **${machine}** is free in **${room.label}**.${eta}`,
                        flags: "Ephemeral"
                    });
                    return;
                }
                case 'unwatch': {
                    const roomLabel = ix.options.getString('room', true);
                    const type = ix.options.getString('type', true) as ApplianceType;
                    const room = getState().rooms.find(r => r.label === roomLabel);
                    const label = room?.label ?? roomLabel;
                    
                    unwatch(roomLabel, type, userId);
                    await ix.reply({
                        content: `🙈 Stopped watching for **${type}s** in **${label}**.`,
                        flags: "Ephemeral"
                    });
                    return;
                }
                case 'watching': {
                    const entries = watchedEntries(userId);
                    if (!entries.length) {
                        await ix.reply({ content: "You're not watching anything.", flags: "Ephemeral" });
                        return;
                    }

                    const rooms = getState().rooms;
                    const lines = entries.map(({ roomLabel, type}) => {
                        const room = rooms.find(r => r.label === roomLabel);
                        const machine = type === 'washer' ? "🌊 washer" : "🔥 dryer";
                        return `- ${machine} in **${room ? room.label : roomLabel}**`; 
                    });
                    await ix.reply({
                        content: lines.join("\n"),
                        flags: "Ephemeral"
                    });
                    return;
                }
                default: {
                    await ix.reply({
                        content: '🥴 This command is unsupported.',
                        flags: "Ephemeral"
                    });
                    return;
                }
            }
        }
    });

    client.once('clientReady', () => console.log(`[bot] logged in as ${client.user?.tag}`));
    client.on('error', err => console.error('[bot] client error:', err));
    await client.login(token);
}