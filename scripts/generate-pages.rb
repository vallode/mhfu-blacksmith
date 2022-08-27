require 'json'
require 'find'
require 'erb'

FILE_TEMPLATE = %{+++
  title = <%= value["name"].to_json %>
  slug = "<%= slug %>"
  [extra]
  <% value.each_pair do |key, val| %>
  <%= key.gsub("-", "_") %> = <%= JSON.pretty_generate(val) or "null" %> 
  <% end %>
  <% if create_mats %>
  <% create_mats.each do |el| %>
  [[extra.create_mats]]
  name = "<%= el["name"] %>"
  amount = <%= el["amount"] %>
  type = "<%= el["type"] %>"
  color = "<%= el["color"] %>"
  <% end %>
  <% end %>
  <% if improve_mats %>
  <% improve_mats.each do |el| %>
  [[extra.improve_mats]]
  name = "<%= el["name"] %>"
  amount = <%= el["amount"] %>
  type = "<%= el["type"] %>"
  color = "<%= el["color"] %>"
  <% end %>
  <% end %>
  <% if alternative_create_mats %>
  <% alternative_create_mats.each do |el| %>
  [[extra.alternative_create_mats]]
  name = "<%= el["name"] %>"
  amount = <%= el["amount"] %>
  type = "<%= el["type"] %>"
  color = "<%= el["color"] %>"
  <% end %>
  <% end %>
  <% if shelling %>
  [extra.shelling]
  type = "<%= shelling["type"] %>"
  level = <%= shelling["level"] %>
  <% end %>
  <% if element %>
  <% element.each do |el| %>
  [[extra.element]]
  name = "<%= el[:name] %>"
  attack = <%= el[:attack] %>
  <% end %>
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
  "bow": "bw",
  "decoration": "dec"
}

WEAPON_CLASS_MULTIPLIER = {
  "great-sword": 4.8,
  "long-sword": 4.8,
  "sword-and-shield": 1.4,
  "dual-blades": 1.4,
  "hammer": 5.2,
  "hunting-horn": 5.2,
  "lance": 2.3,
  "gunlance":  2.3,
  "light-bowgun":  1.2,
  "heavy-bowgun":  1.2,
  "bow":  1.2,
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
  parsedElements = []

  if elements
    elements.scan(/([A-Za-z]+)\s([0-9]+)/) do |element, attack|
      parsedElements.push({name: element, attack: attack})
    end
  end

  return parsedElements
end

Dir.glob("content/blacksmith/**/*-crafting.json").each do |path|
  File.open(path) do |file|
    json_data = JSON.load(file)

    json_data["weapons"].each do |value|
      if value.key?("donotrender")
        next
      end

      output = ERB.new(FILE_TEMPLATE, trim_mode: "<>")
      output_binding = binding

      slug = slugify(value["name"])
      value["type"] = WEAPON_ABBR.key(value["type"])

      if WEAPON_CLASS_MULTIPLIER.key?(value["type"].to_sym)
        value["raw_attack"] = (value["attack"].to_i / WEAPON_CLASS_MULTIPLIER[value["type"].to_sym]).floor
      end

      if value["create-mats"]
        create_mats = value["create-mats"]
        value["create-mats"] = nil
      end

      if value["improve-mats"]
        improve_mats = value["improve-mats"]
        value["improve-mats"] = nil
      end

      if value["alternative-create-mats"]
        alternative_create_mats = value["alternative-create-mats"]
        value["alternative-create-mats"] = nil
      end
      
      if value["element"]
        element = parseElements(value["element"])
        value["element"] = nil
      end

      if value["shelling"]
        shelling = value["shelling"]
        value["shelling"] = nil
      end

      value = value.select {|key, value| value != nil }

      File.write("#{File.dirname(path)}/#{slug}.md", output.result(output_binding))
    end
  end
end
  