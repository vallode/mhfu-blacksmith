require 'json'
require 'csv'
require 'find'
require 'erb'
require_relative 'lib/slug'

FILE_TEMPLATE = %{{
    "armors": <%= JSON.pretty_generate(armor_map) %>
  }
}.gsub(/^  /, '')

ARMOR_PATH = "waist.csv"

output = ERB.new(FILE_TEMPLATE, trim_mode: "<>")
armor_map = []

CSV.foreach(ARMOR_PATH, "r:bom|utf-8", headers: true, skip_blanks: true) do |row|
  armor_piece = {
    "name": row["Name"],
    "type": "leggings",
    "hr": row["HR"],
    "elder": row["Elder*"],
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
      create_materials.push({
        "name": material,
        "amount": amount,
        "type": "bone",
        "color": "white"
      })
    end
  end

  skills = []
  row.fields(23...33).each_slice(2) do |skill, point|
    if skill and point
      skills.push("#{skill} #{point}")
    end
  end

  armor_piece["skills"] = skills
  armor_piece["create_mats"] = create_materials

  armor_map.push(armor_piece)
end 

File.write("#{File.dirname(ARMOR_PATH)}/waist-crafting.json", output.result(binding))
  