require 'json'
require 'find'
require 'erb'

FILE_TEMPLATE = %{+++
  title = <%= name.to_json %>
  slug = "<%= slug %>"
  [extra]
  name = <%= name.to_json %>
  type = "<%= type %>"
  rarity = <%= rarity %>
  attack = <%= attack %>
  affinity = "<%= affinity %>"
  <% if sharpness %>
  sharpness = "<%= sharpness %>"
  <% end %>
  <% if sharpness_plus %>
  sharpness_plus = "<%= sharpness_plus %>"
  <% end %>
  <% if elements %>
  element = <%= elements %>
  <% end %>
  slots = "<%= slots %>"
  <% if create_cost %>
  create-cost = "<%= create_cost %>"
  <% end %>
  <% if create_mats %>
  create-mats = <%= create_mats %>
  <% end %>
  <% if upgrade_cost %>
  improve-cost = "<%= upgrade_cost %>"
  improve-mats = <%= upgrade_mats %>
  <% end %>
  <% if upgrade_from and upgrade_from.kind_of?(Array) %>
  improve-from = <%= upgrade_from %>
  <% elsif upgrade_from %>
  improve-from = <%= upgrade_from.to_json %>
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

Dir.glob("content/blacksmith/**/*-crafting.json").each do |path|
  File.open(path) do |file|
    json_data = JSON.load(file)

    json_data["weapons"].each do |value|
      output = ERB.new(FILE_TEMPLATE, trim_mode: "<>")

      slug = slugify(value["name"])
      name = value["name"]
      type = WEAPON_ABBR.key(value["type"])
      rarity = value["rarity"]
      attack = value["attack"]
      affinity = value["affinity"]
      slots = value["slots"]
      
      if value.key?("sharpness")
        sharpness_array = value["sharpness"].split(" ")
        sharpness = sharpness_array[0]

        if sharpness_array[1]
          sharpness_plus = sharpness_array[1]
        end
      end
      
      if value.key?("elements")
        elements = parseElements(value["element"])
      end

      if value["improve-cost"] != "N/A"
        upgrade_cost = value["improve-cost"]
        upgrade_mats = value["improve-mats"]
      end

      if value["improve-from"] != "N/A"
        upgrade_from = value['improve-from']
      end

      if value["upgrade-to"] != "N/A"
        upgrade_to = value["upgrade-to"]
      end

      if value["create-cost"] != "N/A"
        create_cost = value["create-cost"]

        if value["create-mats"] != "N/A"
          create_mats = value["create-mats"]
        end
      end

      File.write("#{File.dirname(path)}/#{slug}.md", output.result(binding))
    end
  end
end
  