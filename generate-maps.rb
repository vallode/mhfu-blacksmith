require 'json'
require 'find'
require 'erb'

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
  ["decoration"]
]

WEAPON_ABBR = {
  "great-sword": "gs",
  "long-sword": "ls",
  "sword-and-shield": "sns",
  "dual-blades": "db",
  "hammer": "hm",
  "hunting-horn": "hh",
  "lance": "ln",
  "gunlance":  "gl",
  "light-bowgun": "lbg",
  "heavy-bowgun": "hbg",
  "bow": "bw",
  "decoration": "dec"
}

def slugify(value)
  value = value.downcase.strip
  value = value.gsub(/(?<!\s)(?!\w)'(?=\w)/, "-")
  value = value.gsub(/\s\&\s/, " ")
  value = value.gsub(/[\'\"\(\)]/, "")
  value = value.gsub(/\.\s/, "-")
  value = value.gsub(/[\s\,\.]{1}/, '-')
  value = value.gsub("ä", "a").gsub("ö", "o").gsub("ü", "u").gsub("á", "a")
  value = value.gsub("+", "-plus")
end

def push_weapon(weapon, parent_weapon = nil, array, weapons_data, sibling_weapons_data)
  array.push({
    slug: slugify(weapon["name"]),
    type: WEAPON_ABBR.key(weapon["type"]),
    name: weapon["name"],
    rarity: weapon["rarity"]
  })

  if weapon.key?("color") and weapon["color"]
    array.last[:color] = weapon["color"]
  end
    
  if weapon.key?("element") and weapon["element"]
    array.last[:element] = weapon["element"].match(/([A-Za-z]+)\s([0-9\w]+)/).captures[0].downcase
  end

  if weapon.key?("improve-to") and weapon["improve-to"]
    array.last[:children] = []

    for child_weapon_name in weapon["improve-to"]
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

WEAPON_PAIRS.each do |array|
  output = ERB.new(FILE_TEMPLATE, trim_mode: "<>")
  weapon_files = Dir.glob("content/blacksmith/{#{array.join(",")}}/*-crafting.json")
  file = File.open(weapon_files[0])
  weapons = JSON.load(file)["weapons"]

  if weapon_files.length > 1
    sibling_file = File.open(weapon_files[1])
    sibling_weapons = JSON.load(sibling_file)["weapons"]
  end

  weapon_map = []

  if file.path.include?("decoration")
    root_weapons = weapons.select {|element| element.key?("donotrender")}
  else
    root_weapons = weapons.select {|element| not element["improve-from"]}

    if sibling_weapons
      root_sibling_weapons = sibling_weapons.select {|element| element["improve-to"]}

      root_sibling_weapons = root_sibling_weapons.select do |element|
        has_sibling_child = false

        element["improve-to"].each do |child|
          child_weapon = weapons.select {|element| element["name"] == child}

          if child_weapon.length > 0
            has_sibling_child = true
          end
        end

        next(has_sibling_child)
      end

      root_weapons = root_weapons + root_sibling_weapons
    end
  end

  dead_end_weapons = root_weapons.select {|element| not element["improve-from"] and not element["improve-to"]}

  root_weapons = root_weapons.sort_by {|s| s["rarity"].to_i}

  root_weapons = root_weapons - dead_end_weapons + dead_end_weapons

  root_weapons.each_with_index do |weapon, index|
    push_weapon(weapon, nil, weapon_map, weapons, sibling_weapons)
  end

  File.write("#{File.dirname(file.path)}/map.json", output.result(binding))
end
  