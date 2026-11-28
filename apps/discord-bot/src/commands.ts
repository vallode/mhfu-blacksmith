/**
 * The bot's slash commands, as Discord's API takes them. The Worker answers
 * them (bot.ts) and scripts/register-commands.ts sends this list to Discord.
 * Descriptions are what Discord shows under each command.
 */
import { CommandType, OptionType } from "./discord.js";
import { MESSAGE_LOOKUP } from "./message-lookup.js";

const nameOption = (description: string) => ({
  type: OptionType.String,
  name: "name",
  description,
  required: true,
  autocomplete: true,
});

export const COMMANDS = [
  {
    name: "monster",
    description:
      "A monster's weaknesses, breakable parts and crowns, with its page on the Blacksmith",
    options: [nameOption("Monster name or nickname")],
  },
  {
    name: "item",
    description: "An item's rarity and price, with its page on the Blacksmith",
    options: [nameOption("Item name (English or Japanese)")],
  },
  {
    name: "weapon",
    description: "A weapon's attack, element and slots, with its page on the Blacksmith",
    options: [nameOption("Weapon name")],
  },
  {
    name: "settings",
    description: "What a RandomFU settings string turns on: its seed and options",
    options: [
      {
        type: OptionType.String,
        name: "string",
        description: "The settings string (starts with RF)",
        required: true,
      },
    ],
  },
  {
    name: "sets",
    description: "Describe the armor set you want, and get a set builder search for it",
    options: [
      {
        type: OptionType.String,
        name: "request",
        description: "e.g. G rank gunner set with Evade +2 and Auto-Reload, no Fatalis gear",
        required: true,
        max_length: 500,
      },
    ],
  },
  {
    // Right-click a message > Apps: what it names, looked up (message-lookup.ts).
    type: CommandType.Message,
    name: MESSAGE_LOOKUP,
    description: "",
  },
] as const;

export type CommandName = (typeof COMMANDS)[number]["name"];
