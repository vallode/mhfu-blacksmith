require 'json'
require 'find'

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

# Temporary solution, we'll have images for every single weapon at some point.
WEAPON_IMAGE = {
  "white-serpentblade": "gs",
  "tigrex-tooth": "ls",
  "shaka-poison-bite": "sns",
  "snow-venom": "db",
  "war-hammer": "hm",
  "giaprey-balloon": "hh",
  "gatling-lance": "ln",
  "dragonwood-gunlance":  "gl",
  "kut-ku-anger": "lbg",
  "rock-eater": "hbg",
  "defect-swordfish-bow": "bw"
}

def parseElements(elements)
  parsedElements = %{}

  if elements != "N/A"
    elements.scan(/([A-Za-z]+)\s([0-9]+)/) do |element, attack|
      parsedElements.concat("{\"name\" = \"#{element}\", \"attack\" = #{attack}}")
    end
  end

  return "[#{parsedElements}]"
end

crafting_files = []

Find.find("content/blacksmith/") do |path|
  if FileTest.directory?(path)
    next
  end

  if File.basename(path).start_with?(".")
    next
  end

  if not File.basename(path).end_with?("-crafting.json")
    next
  end

  crafting_files.push(path)
end

crafting_files.each do |path|
  File.open(path) do |file|
    json_data = JSON.load(file)

    for value in json_data["weapons"] do
      slug = value["name"].downcase.strip.gsub(' ', '-').gsub('\'', '-').gsub('.', '-').gsub('+', '-plus')
      element = parseElements(value["element"])
      content = %{+++
template = "weapon.html"
slug = "#{slug}"
[extra]
name = "#{value["name"]}"
type = "#{WEAPON_ABBR.key(value["type"])}"
image = "#{WEAPON_IMAGE.key(value["type"])}"
rarity = #{value["rarity"]}
attack = #{value["attack"]}
affinity = "#{value["affinity"]}"
sharpness = "#{value["sharpness"]}"
element = #{parseElements(value["element"])}
slots = "#{value["slots"]}"}

      if value["upgrade-from"].kind_of?(Array)
        content.concat(%{
upgrade-from = #{value["upgrade-from"]}})
      elsif value != "N/A"
        content.concat(%{
upgrade-from = "#{value["upgrade-from"]}"})
      end

      if value["upgrade-to"] != "N/A"
        content.concat(%{
upgrade-to = #{value["upgrade-to"]}})
      end

      if value["upgrade-cost"] != "N/A"
        content.concat(%{
upgrade-cost = "#{value["upgrade-cost"]}"
upgrade-mats = #{value["upgrade-mats"]}})
      end

      if value["create-cost"] != "N/A"
        content.concat(%{
create-cost = "#{value["create-cost"]}"
create-mats = #{value["create-mats"]}})
      end

      content.concat(%{
+++})
  
      puts slug
      File.write("#{File.dirname(path)}/details/" + slug + ".md", content)
    end
  end
end
  