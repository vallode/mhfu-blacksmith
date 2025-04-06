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
  ["decorations"],
  ["helmet"],
  ["plate"],
  ["gauntlets"],
  ["waist"],
  ["leggings"],
]

def slugify(value)
  value = value.downcase.strip
  value = value.gsub(/(?<!\s)(?!\w)'(?=\w)/, "-")
  value = value.gsub(/\s\&\s/, " ")
  value = value.gsub(/[\'\"\(\)]/, "")
  value = value.gsub(/\.\s/, "-")
  value = value.gsub(/[\s\,\.\&]{1}/, '-')
  value = value.gsub("ä", "a").gsub("ö", "o").gsub("ü", "u").gsub("á", "a")
  value = value.gsub("+", "-plus")
end

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

WEAPON_PAIRS.each do |array|
  output = ERB.new(FILE_TEMPLATE, trim_mode: "<>")
  weapon_files = Dir.glob("content/**/{#{array.join(",")}}-{crafting,source}.json")
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
    root_weapons = weapons.select {|element| not element["improve_from"]}

    if sibling_weapons
      root_sibling_weapons = sibling_weapons.select {|element| element["improve_to"]}

      root_sibling_weapons = root_sibling_weapons.select do |element|
        has_sibling_child = false

        element["improve_to"].each do |child|
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

  dead_end_weapons = root_weapons.select {|element| not element["improve_from"] and not element["improve_to"]}

  root_weapons = root_weapons.sort_by {|s| s["rarity"].to_i}

  root_weapons = root_weapons - dead_end_weapons + dead_end_weapons

  root_weapons.each_with_index do |weapon, index|
    push_weapon(weapon, nil, weapon_map, weapons, sibling_weapons)
  end

  File.write("#{File.dirname(file.path)}/map.json", output.result(binding))
end
  