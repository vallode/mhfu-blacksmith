require 'json'
require 'find'
require 'erb'
require 'csv'

FILE_TEMPLATE = %{<%= JSON.pretty_generate(json_data) %>}.gsub(/^  /, '')

WEAPON_PAIRS = [
  ["helmet"],
  ["plate"],
  ["gauntlets"],
  ["waist"],
  ["leggings"],
]

ARMOR_FILES = {
  "head": "helmet",
  "body": "plate",
  "arms": "gauntlets",
  "waist": "waist",
  "legs": "leggings"
}

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
  weapon_files = Dir.glob("content/{armorsmith}/{#{array.join(",")}}/g-rank/*-crafting.json")
  file = File.open(weapon_files[0])
  weapons = JSON.load(file)["weapons"]

  if weapon_files.length > 1
    sibling_file = File.open(weapon_files[1])
    sibling_weapons = JSON.load(sibling_file)["weapons"]
  end

  weapon_map = []

  csv_file = CSV.open("sources/#{ARMOR_FILES.key(array[0])}.csv", "r:bom|utf-8", headers: true, skip_blanks: true)
  csv_data = csv_file.read

  weapons.each do |weapon|
    csv_weapon = csv_data.find {|row| row["Name"] == weapon["name"] }

    if not csv_weapon 
      raise "No data found for #{weapon["name"]} probably a wrong name?"
    end

    weapon["skills"] = []
    csv_weapon.fields(22...32).each_slice(2) do |skill, point|
      if skill and point
        weapon["skills"].push({name: skill, amount: point})
      end
    end
    
    weapon_map.push(weapon)
  end

  data = {"weapons": weapon_map}

  File.write(file.path, JSON.pretty_generate(data))
end
  