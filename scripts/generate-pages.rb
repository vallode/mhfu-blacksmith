require 'json'
require 'toml'
require_relative 'lib/slug'

# TODO: Raw damage can be embedded directly into the dataset, no need for this?
WEAPON_CLASS_MULTIPLIER = {
  "great-sword": 4.8,
  "long-sword": 4.8,
  "sword-and-shield": 1.4,
  "dual-blades": 1.4,
  "hammer": 5.2,
  "hunting-horn": 5.2,
  "lance": 2.3,
  "gunlance":  2.3,
  "light-bowgun":  1.2,
  "heavy-bowgun":  1.2,
  "bow":  1.2,
}

# TODO: Add description for other weapon types, armor, and decorations.
def createDescription(value)
  description = []

  if value["attack"]
    description.push("Attack: #{value["attack"]}")
    description.push("Raw Attack: #{value["raw_attack"]}")
  end

  description.push("Affinity: #{value["affinity"]}") if value["affinity"]
  description.push("Slots: #{value["slots"]}") if value["slots"]
  description.push("Rarity: #{value["rarity"]}") if value["rarity"]

  return description.join(" | ")
end

threads = []

# Weapons — data/weapons/<type>.json → content/blacksmith/<type>/<slug>.md
Dir.glob("data/weapons/*.json").each do |path|
  threads << Thread.new {
    File.open(path) do |file|
      json_data = JSON.load(file)
      type = File.basename(path, ".json")
      output_dir = "content/blacksmith/#{type}"

      json_data["weapons"].each_with_index do |value, index|
        if WEAPON_CLASS_MULTIPLIER.key?(value["type"].to_sym)
          value["raw_attack"] = (value["attack"].to_i / WEAPON_CLASS_MULTIPLIER[value["type"].to_sym]).floor
        end

        output = {
          title: value["name"],
          slug: slugify(value["name"]),
          weight: index,
          description: createDescription(value),
          extra: value.select {|key, val| ["title", "slug"].none?(key)},
        }

        File.write("#{output_dir}/#{output[:slug]}.md", "+++\n#{TOML::Generator.new(output).body}+++\n")
      end
    end
  }
end

# Armor — data/armor/<slot>.json → content/armorsmith/<slot>/<rank>/<slug>.md
Dir.glob("data/armor/*.json").each do |path|
  threads << Thread.new {
    File.open(path) do |file|
      json_data = JSON.load(file)
      slot = File.basename(path, ".json")

      json_data["armor"].each_with_index do |value, index|
        rank = value["rank"]
        output_dir = "content/armorsmith/#{slot}/#{rank}"

        output = {
          title: value["name"],
          slug: slugify(value["name"]),
          weight: index,
          description: createDescription(value),
          extra: value.select {|key, val| ["title", "slug"].none?(key)},
        }

        File.write("#{output_dir}/#{output[:slug]}.md", "+++\n#{TOML::Generator.new(output).body}+++\n")
      end
    end
  }
end

# Decorations — data/decorations.json → content/decorations/<slug>.md
threads << Thread.new {
  File.open("data/decorations.json") do |file|
    json_data = JSON.load(file)

    json_data["decorations"].each_with_index do |value, index|
      output = {
        title: value["name"],
        slug: slugify(value["name"]),
        weight: index,
        description: createDescription(value),
        extra: value.select {|key, val| ["title", "slug"].none?(key)},
      }

      File.write("content/decorations/#{output[:slug]}.md", "+++\n#{TOML::Generator.new(output).body}+++\n")
    end
  end
}

# Monsters — data/monsters/<category>.json → content/monsters/<category>/<slug>.md
Dir.glob("data/monsters/*.json").each do |path|
  threads << Thread.new {
    File.open(path) do |file|
      json_data = JSON.load(file)
      category = File.basename(path, ".json")
      output_dir = "content/monsters/#{category}"

      json_data["monsters"].each_with_index do |monster, index|
        output = {
          title: monster["name"],
          slug: slugify(monster["name"]),
          weight: index,
          extra: monster.select {|key, value| ["name", "drops"].none?(key)},
        }

        File.write("#{output_dir}/#{output[:slug]}.md", "+++\n#{TOML::Generator.new(output).body}+++\n")
      end
    end
  }
end

threads.each(&:join)
