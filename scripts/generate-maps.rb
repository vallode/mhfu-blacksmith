require 'json'
require 'find'
require 'erb'
require_relative 'lib/slug'

FILE_TEMPLATE = %{{
    "map": <%= JSON.pretty_generate(weapon_map) %>
  }
}.gsub(/^  /, '')

WEAPON_PAIRS = [
  ["great-sword", "long-sword"],
  ["long-sword", "great-sword"],
  ["sword-and-shield", "dual-blades"],
  ["dual-blades", "sword-and-shield"],
  ["hammer", "hunting-horn"],
  ["hunting-horn", "hammer"],
  ["lance", "gunlance"],
  ["gunlance", "lance"],
  ["light-bowgun"],
  ["heavy-bowgun"],
  ["bow"],
]

ARMOR_SLOTS = %w[helmet plate gauntlets waist leggings]
ARMOR_RANKS = %w[low-rank high-rank g-rank]

def push_weapon(weapon, parent_weapon = nil, array, weapons_data, sibling_weapons_data)
  array.push({
    slug: slugify(weapon["name"]),
    type: weapon["type"],
    name: weapon["name"],
    rarity: weapon["rarity"]
  })

  if weapon.key?("color") and weapon["color"]
    array.last[:color] = weapon["color"]
  end
    
  if weapon.key?("elements") and weapon["elements"]
    # TODO: Adjust to use both elements in dual element weapons.
    array.last[:element] = weapon["elements"][0]["name"].downcase
  end

  if weapon.key?("improve_to") and weapon["improve_to"]
    array.last[:children] = []

    for child_weapon_name in weapon["improve_to"]
      child_weapon = weapons_data.select {|element| element["name"] == child_weapon_name }[0]
      
      if child_weapon
        push_weapon(child_weapon, array.last[:children], weapons_data, sibling_weapons_data)
      else
        child_weapon = sibling_weapons_data.select {|element| element["name"] == child_weapon_name }[0]

        if weapon and not weapon["type"] == child_weapon["type"]
          push_weapon(child_weapon, weapon, array.last[:children], weapons_data, sibling_weapons_data)
        end
      end
    end
  end
end

# ---------------------------------------------------------------------------
# Weapon trees
# ---------------------------------------------------------------------------
WEAPON_PAIRS.each do |pair|
  output = ERB.new(FILE_TEMPLATE, trim_mode: "<>")
  type = pair[0]
  sibling_type = pair[1]

  weapons = JSON.parse(File.read("data/weapons/#{type}.json"))["weapons"]
  sibling_weapons = sibling_type ? JSON.parse(File.read("data/weapons/#{sibling_type}.json"))["weapons"] : nil

  weapon_map = []

  root_weapons = weapons.select {|element| not element["improve_from"]}

  if sibling_weapons
    root_sibling_weapons = sibling_weapons.select {|element| element["improve_to"]}

    root_sibling_weapons = root_sibling_weapons.select do |element|
      element["improve_to"].any? {|child| weapons.any? {|w| w["name"] == child}}
    end

    root_weapons = root_weapons + root_sibling_weapons
  end

  dead_end_weapons = root_weapons.select {|element| not element["improve_from"] and not element["improve_to"]}

  root_weapons = root_weapons.sort_by {|s| s["rarity"].to_i}
  root_weapons = root_weapons - dead_end_weapons + dead_end_weapons

  root_weapons.each do |weapon|
    push_weapon(weapon, nil, weapon_map, weapons, sibling_weapons)
  end

  File.write("content/blacksmith/#{type}/map.json", output.result(binding))
end

# ---------------------------------------------------------------------------
# Armor trees — one map.json per slot per rank
# ---------------------------------------------------------------------------
ARMOR_SLOTS.each do |slot|
  all_armor = JSON.parse(File.read("data/armor/#{slot}.json"))["armor"]

  ARMOR_RANKS.each do |rank|
    output = ERB.new(FILE_TEMPLATE, trim_mode: "<>")
    rank_armor = all_armor.select {|a| a["rank"] == rank}

    weapon_map = rank_armor
      .sort_by {|a| a["rarity"].to_i}
      .map do |a|
        entry = {
          slug: slugify(a["name"]),
          type: a["type"],
          name: a["name"],
          rarity: a["rarity"]
        }
        entry
      end

    File.write("content/armorsmith/#{slot}/#{rank}/map.json", output.result(binding))
  end
end

# ---------------------------------------------------------------------------
# Decoration tree — grouped by category
# ---------------------------------------------------------------------------
output = ERB.new(FILE_TEMPLATE, trim_mode: "<>")
decorations = JSON.parse(File.read("data/decorations.json"))["decorations"]

categories_seen = []
categories_map = {}

decorations.each do |d|
  cat = d["category"]
  next unless cat

  unless categories_seen.include?(cat)
    categories_seen << cat
    categories_map[cat] = []
  end

  categories_map[cat] << {
    slug: slugify(d["name"]),
    type: d["type"],
    name: d["name"],
    rarity: d["rarity"],
    color: d["color"]
  }.compact
end

weapon_map = categories_seen.map do |cat|
  {
    slug: slugify(cat),
    type: "",
    name: cat,
    rarity: nil,
    children: categories_map[cat]
  }
end

File.write("content/decorations/map.json", output.result(binding))
