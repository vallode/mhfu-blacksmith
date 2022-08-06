require 'json'
require 'find'
require 'erb'

FILE_TEMPLATE = %{{
    "map": <%= weapon_map.to_json %>
  }
}.gsub(/^  /, '')

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
  "bow": "bw"
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

def push_weapon(weapon, array, weapons_data)
  array.push({
    slug: slugify(weapon["name"]),
    name: weapon["name"],
    rarity: weapon["rarity"],
    children: []
    })
    
  if weapon.key?("element") and weapon["element"]
    array.last[:element] = weapon["element"].match(/([A-Za-z]+)\s([0-9\w]+)/).captures[0].downcase
  end

  if weapon.key?("improve-to") and weapon["improve-to"]
    for child_weapon_name in weapon["improve-to"]
      child_weapon = weapons_data.select {|element| element["name"] == child_weapon_name }[0]

      if child_weapon
        push_weapon(child_weapon, array.last[:children], weapons_data)
      end
    end
  end
end

Dir.glob("content/blacksmith/**/*-crafting.json").each do |path|
  File.open(path) do |file|
    output = ERB.new(FILE_TEMPLATE, trim_mode: "<>")
    weapon_map = []

    json_data = JSON.load(file)
    weapons = json_data["weapons"]

    root_weapons = weapons.select {|element| !element["improve-from"] or not element.key?("improve-from")}

    root_weapons.each_with_index do |weapon, index|
      push_weapon(weapon, weapon_map, weapons)
    end

    File.write("#{File.dirname(path)}/map.json", output.result(binding))
  end
end
  