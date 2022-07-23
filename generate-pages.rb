require 'json'
require 'find'
require 'erb'

FILE_TEMPLATE = %{+++
  template = "weapon.html"
  slug = "<%= slug %>"
  [extra]
  name = <%= name.to_json %>
  type = "<%= type %>"
  image = "<%= image %>"
  rarity = <%= rarity %>
  attack = <%= attack %>
  affinity = "<%= affinity %>"
  sharpness = "<%= sharpness %>"
  element = <%= elements %>
  slots = "<%= slots %>"
  <% if create_cost %>
  create-cost = "<%= create_cost %>"
  create-mats = <%= create_mats %>
  <% end %>
  <% if upgrade_cost %>
  upgrade-cost = "<%= upgrade_cost %>"
  upgrade-mats = <%= upgrade_mats %>
  <% end %>
  <% if upgrade_from and upgrade_from.kind_of?(Array) %>
  upgrade-from = <%= upgrade_from %>
  <% elsif upgrade_from %>
  upgrade-from = <%= upgrade_from.to_json %>
  <% end %>
  <% if upgrade_to %>
  upgrade-to = <%= upgrade_to %>
  <% end %>
  +++
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

def parseElements(elements)
  parsedElements = %{}

  if elements != "N/A"
    elements.scan(/([A-Za-z]+)\s([0-9]+)/) do |element, attack|
      parsedElements.concat("{\"name\" = \"#{element}\", \"attack\" = #{attack}},")
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
      output = ERB.new(FILE_TEMPLATE, trim_mode: "<>")

      slug = slugify(value["name"])
      name = value["name"]
      type = WEAPON_ABBR.key(value["type"])
      image = WEAPON_IMAGE.key(value["type"])
      rarity = value["rarity"]
      attack = value["attack"]
      affinity = value["affinity"]
      sharpness = value["sharpness"]
      elements = parseElements(value["element"])
      slots = value["slots"]

      if value["upgrade-cost"] != "N/A"
        upgrade_cost = value["upgrade-cost"]
        upgrade_mats = value["upgrade-mats"]
      end

      if value["upgrade-from"] != "N/A"
        upgrade_from = value['upgrade-from']
      end

      if value["upgrade-to"] != "N/A"
        upgrade_to = value["upgrade-to"]
      end

      if value["create-cost"] != "N/A"
        create_cost = value["create-cost"]
        create_mats = value["create-mats"]
      end

      puts slug
      File.write("#{File.dirname(path)}/details/" + slug + ".md", output.result(binding))
    end
  end
end
  