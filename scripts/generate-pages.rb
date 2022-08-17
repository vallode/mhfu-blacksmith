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
      
      if value["element"]
        element = parseElements(value["element"])
        value["element"] = nil
      end

      value = value.select {|key, value| value != nil }

      File.write("#{File.dirname(path)}/#{slug}.md", output.result(output_binding))
    end
  end
end
  