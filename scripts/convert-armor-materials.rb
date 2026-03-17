require 'json'
require 'find'
require 'erb'
require_relative 'lib/slug'

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
  