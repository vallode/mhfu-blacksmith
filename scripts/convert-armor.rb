require 'json'
require 'csv'
require 'find'
require 'erb'

FILE_TEMPLATE = %{{
    "armors": <%= JSON.pretty_generate(armor_map) %>
  }
}.gsub(/^  /, '')

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

ARMOR_PATH = "head.csv"

output = ERB.new(FILE_TEMPLATE, trim_mode: "<>")
armor_map = []

CSV.foreach(ARMOR_PATH, "r:bom|utf-8", headers: true, skip_blanks: true) do |row|
  p row
  armor_piece = {
    "name": row["Name"],
    "type": "helmet",
    "defence": row["Defence"],
    "fire_res": row["Fire Res"],
    "thunder_res": row["Thunder Res"],
    "dragon_res": row["Dragon Res"],
    "water_res": row["Water Res"],
    "ice_res": row["Ice Res"],
    "sex": row["Gender"],
    "hunter_type": row["Hunter Type"],
    "rarity": row["Rarity"],
    "slots": row["Slots"],
    "create_cost": row["Price"] ? row["Price"].gsub("z", "") : nil,
  }

  create_materials = []
  row.fields(2...10).each_slice(2) do |material, amount|
    if material and amount
      create_materials.push("#{material} (#{amount})")
    end
  end

  armor_piece["create_mats"] = create_materials

  armor_map.push(armor_piece)
end 

File.write("#{File.dirname(ARMOR_PATH)}/map.json", output.result(binding))

# WEAPON_PAIRS.each do |array|

#   armor_file = File.open("head.csv")
#   weapon_files = Dir.glob("content/blacksmith/{#{array.join(",")}}/*-crafting.json")
#   file = File.open(weapon_files[0])
#   weapons = JSON.load(file)["weapons"]

#   weapon_map = []

# end
  