require 'json'
require 'find'
require 'erb'

FILE_TEMPLATE = %{<%= JSON.pretty_generate(json_data) %>}.gsub(/^  /, '')

WEAPON_PAIRS = [
  ["helmet"],
  ["plate"],
  ["gauntlets"],
  ["waist"],
  ["leggings"],
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
  weapon_files = Dir.glob("content/{armorsmith}/{#{array.join(",")}}/*-source.json")
  file = File.open(weapon_files[0])
  weapons = JSON.load(file)["weapons"]

  if weapon_files.length > 1
    sibling_file = File.open(weapon_files[1])
    sibling_weapons = JSON.load(sibling_file)["weapons"]
  end

  weapon_map = []

  lr = weapons.select {|weapon| weapon["hr"].to_i <= 5 }
  hr = weapons.select {|weapon| weapon["hr"].to_i > 5 and weapon["hr"].to_i <= 8 }
  gr = weapons.select {|weapon| weapon["hr"].to_i > 8 }

  json_data = {weapons: lr}
  # Dir.mkdir("#{File.dirname(file.path)}/low-rank")
  File.write("#{File.dirname(file.path)}/low-rank/#{array[0]}-crafting.json", output.result(binding))
  json_data = {weapons: hr}
  File.write("#{File.dirname(file.path)}/high-rank/#{array[0]}-crafting.json", output.result(binding))
  json_data = {weapons: gr}
  File.write("#{File.dirname(file.path)}/g-rank/#{array[0]}-crafting.json", output.result(binding))

  weapons.each do |weapon|
    weapon_map.push(weapon)
  end

  # File.write(file.path, output.result(binding))
end
  