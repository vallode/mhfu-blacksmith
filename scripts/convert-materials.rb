require 'json'
require 'find'
require 'erb'

FILE_TEMPLATE = %{{
    "map": <%= JSON.pretty_generate(weapon_map) %>
  }
}.gsub(/^  /, '')

WEAPON_PAIRS = [
  ["helmet"],
  ["plate"],
  ["gauntlets"],
  ["leggings"],
  ["waist"],
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
  "decoration": "dec",
  "helmet": "helmet"
}

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

WEAPON_PAIRS.each do |array|
  output = ERB.new(FILE_TEMPLATE, trim_mode: "<>")
  weapon_files = Dir.glob("content/{blacksmith,armorsmith}/{#{array.join(",")}}/*-crafting.json")
  file = File.open(weapon_files[0])
  weapons = JSON.load(file)["weapons"]

  if weapon_files.length > 1
    sibling_file = File.open(weapon_files[1])
    sibling_weapons = JSON.load(sibling_file)["weapons"]
  end

  weapon_map = []

  weapons.each do |weapon|
    skills = weapon["skills"]
    weapon["skills"] = []

    skills.each do |skill|
      match = %r{([A-Za-z\s]+)\s([-]?[0-9])}.match(skill)
      weapon["skills"].push({
        "name": match[1],
        "amount": match[2],
      })
    end

    weapon_map.push(weapon)
  end

  File.write(file.path, output.result(binding))
end
  