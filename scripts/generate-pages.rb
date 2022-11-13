require 'json'
require 'find'
require 'erb'
require 'toml'

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
  "helmet": "helmet",
  "plate": "plate",
  "gauntlets": "gauntlets",
  "waist": "waist",
  "leggings": "leggings"
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

threads = []

Dir.glob("content/{blacksmith,armorsmith}/**/*-crafting.json").each do |path|
  threads << Thread.new {
    File.open(path) do |file|
      json_data = JSON.load(file)

      json_data["weapons"].each do |value|
        if value.key?("donotrender")
          next
        end

        output = {}

        output["title"] = value["name"]
        output["slug"] = slugify(value["name"])
        
        value["type"] = WEAPON_ABBR.key(value["type"]).to_s
        if WEAPON_CLASS_MULTIPLIER.key?(value["type"].to_sym)
          value["raw_attack"] = (value["attack"].to_i / WEAPON_CLASS_MULTIPLIER[value["type"].to_sym]).floor
        end
        value = value.select {|key, value| value != nil }

        output["extra"] = value.select {|key, value| ["title", "slug"].none?(key)}

        if path.include?("armorsmith")
          File.write("#{File.dirname(path)}/#{output["slug"]}.md", "+++\n#{TOML::Generator.new(output).body}+++\n")
        else
          File.write("#{File.dirname(path)}/#{output["slug"]}.md", "+++\n#{TOML::Generator.new(output).body}+++\n")
        end
      end
    end
  }
end

threads.each(&:join)
