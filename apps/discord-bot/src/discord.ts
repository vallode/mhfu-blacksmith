/**
 * The parts of Discord's HTTP interactions API the bot uses. Discord POSTs
 * each interaction (a slash command, an autocomplete keystroke) to the
 * Worker and takes the reply as the response, so there is no gateway
 * connection to keep. https://discord.com/developers/docs/interactions/overview
 */

export const API = "https://discord.com/api/v10";

export const InteractionType = {
  Ping: 1,
  ApplicationCommand: 2,
  /** A button press. */
  MessageComponent: 3,
  Autocomplete: 4,
} as const;

/** An application command's kind: a slash command or a message's right-click menu. */
export const CommandType = {
  ChatInput: 1,
  Message: 3,
} as const;

export const ComponentType = {
  ActionRow: 1,
  Button: 2,
} as const;

export const ButtonStyle = {
  Primary: 1,
  Secondary: 2,
} as const;

export const ResponseType = {
  Pong: 1,
  ChannelMessage: 4,
  DeferredChannelMessage: 5,
  AutocompleteResult: 8,
} as const;

export const OptionType = {
  String: 3,
} as const;

/** Only the asker sees the message. */
export const EPHEMERAL = 1 << 6;

export interface CommandOption {
  name: string;
  type: number;
  value?: string | number | boolean;
  focused?: boolean;
}

export interface Interaction {
  id: string;
  application_id: string;
  type: number;
  token: string;
  data?: {
    /** A command's name; a button press has none. */
    name?: string;
    options?: CommandOption[];
    /** CommandType: a message command names its target message. */
    type?: number;
    target_id?: string;
    resolved?: { messages?: Record<string, DiscordMessage> };
    /** A button press: the button's custom_id. */
    custom_id?: string;
    component_type?: number;
  };
  guild_id?: string;
  channel_id?: string;
  /** A button press: the message the button is on. */
  message?: DiscordMessage;
  /** In a server. */
  member?: { user: DiscordUser };
  /** In a DM. */
  user?: DiscordUser;
}

export interface DiscordUser {
  id: string;
  username: string;
}

export interface DiscordMessage {
  id: string;
  channel_id?: string;
  content?: string;
  author?: DiscordUser;
  embeds?: Embed[];
  /** A forwarded message's copy of what it forwards. */
  message_snapshots?: { message: { content?: string; embeds?: Embed[] } }[];
  components?: ActionRow[];
}

export interface Button {
  type: typeof ComponentType.Button;
  style: number;
  label: string;
  custom_id: string;
}

export interface ActionRow {
  type: typeof ComponentType.ActionRow;
  components: Button[];
}

export interface Embed {
  title?: string;
  url?: string;
  description?: string;
  color?: number;
  /** A small image at the embed's top right. */
  thumbnail?: { url: string };
  fields?: { name: string; value: string; inline?: boolean }[];
  footer?: { text: string };
}

export interface MessageData {
  content?: string;
  embeds?: Embed[];
  components?: ActionRow[];
  flags?: number;
  allowed_mentions?: { parse: string[] };
}

export type InteractionResponse =
  | { type: typeof ResponseType.Pong }
  | { type: typeof ResponseType.ChannelMessage; data: MessageData }
  | { type: typeof ResponseType.DeferredChannelMessage; data?: { flags?: number } }
  | {
      type: typeof ResponseType.AutocompleteResult;
      data: { choices: { name: string; value: string }[] };
    };

/** Discord's limits on what a reply holds. */
export const LIMITS = {
  choices: 25,
  choiceName: 100,
  embedDescription: 4096,
  fieldValue: 1024,
  fields: 25,
  embeds: 10,
  buttonLabel: 80,
  /** Every title, description, field and footer of an embed together. */
  embedTotal: 6000,
} as const;

/** `s` cut to `max` characters, with an ellipsis if it was longer. */
export function clip(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

/** The value of a command's option by name. */
export function optionValue(interaction: Interaction, name: string): string | undefined {
  const v = interaction.data?.options?.find((o) => o.name === name)?.value;
  return v === undefined ? undefined : String(v);
}

/** The option being typed in an autocomplete interaction. */
export function focusedOption(interaction: Interaction): CommandOption | undefined {
  return interaction.data?.options?.find((o) => o.focused);
}

export function userOf(interaction: Interaction): DiscordUser | undefined {
  return interaction.member?.user ?? interaction.user;
}

function hexBytes(hex: string): Uint8Array<ArrayBuffer> {
  if (!/^(?:[0-9a-f]{2})*$/i.test(hex)) throw new Error("not hex");
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/**
 * Whether a request is really from Discord: its Ed25519 signature, over the
 * timestamp header and the raw body, checks against the application's
 * public key (the Developer Portal's General Information page). Discord
 * sends test requests with bad signatures when the endpoint is set, and
 * stops sending to one that accepts them.
 */
export async function verifySignature(
  publicKeyHex: string,
  signatureHex: string | null,
  timestamp: string | null,
  body: string,
): Promise<boolean> {
  if (!signatureHex || !timestamp) return false;
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      hexBytes(publicKeyHex),
      { name: "Ed25519" },
      false,
      ["verify"],
    );
    return await crypto.subtle.verify(
      { name: "Ed25519" },
      key,
      hexBytes(signatureHex),
      new TextEncoder().encode(timestamp + body),
    );
  } catch {
    return false;
  }
}

/** Replaces the deferred reply's "thinking…" message with the real one. */
export async function editOriginal(
  interaction: Pick<Interaction, "application_id" | "token">,
  message: MessageData,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  const res = await fetcher(
    `${API}/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(message),
    },
  );
  if (!res.ok) throw new Error(`Discord answered ${res.status} to the follow-up`);
}
