require 'json'
require 'find'
require 'erb'

FILE_TEMPLATE = %{{
    "weapons": <%= JSON.pretty_generate(weapon_map) %>
  }
}.gsub(/^  /, '')

WEAPON_PAIRS = [
  ["helmet"],
  ["plate"],
  ["gauntlets"],
  ["waist"],
  ["leggings"],
]

WEAPON_ABBR = {
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

materials = JSON.load(File.open(Dir.glob("test.json")[0]))["materials"]

WEAPON_PAIRS.each do |array|
  output = ERB.new(FILE_TEMPLATE, trim_mode: "<>")
  weapon_files = Dir.glob("content/{armorsmith}/{#{array.join(",")}}/*-crafting.json")
  file = File.open(weapon_files[0])
  weapons = JSON.load(file)["weapons"]

  if weapon_files.length > 1
    sibling_file = File.open(weapon_files[1])
    sibling_weapons = JSON.load(sibling_file)["weapons"]
  end

  weapon_map = []

  weapons.each do |weapon|
    create_mats = weapon["create_mats"]
    weapon["create_mats"] = []

    create_mats.each do |material|
      unless materials.key?(material["name"])
        raise "#{material['name']} not in the material list!!!}"
      end

      material["type"] = materials[material["name"]]["type"]
      material["color"] = materials[material["name"]]["color"]

      weapon["create_mats"].push(material)
    end

    weapon_map.push(weapon)
  end

  File.write(file.path, output.result(binding))
end
  