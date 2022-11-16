require 'json'
require 'toml'

# TODO: Raw damage can be embedded directly into the dataset, no need for this?
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

# TODO: Take inspiration from `parameterize` in rails and clean this up.
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

threads = []

# Iterate over crafting JSON data in all content directories to generate
# individual markdown files.
Dir.glob("content/{blacksmith,armorsmith}/**/*-crafting.json").each do |path|
  threads << Thread.new {
    File.open(path) do |file|
      json_data = JSON.load(file)

      json_data["weapons"].each do |value|
        # Easiest way of handling "category" items in mapping right now.
        next if value.key?("donotrender")

        if WEAPON_CLASS_MULTIPLIER.key?(value["type"].to_sym)
          value["raw_attack"] = (value["attack"].to_i / WEAPON_CLASS_MULTIPLIER[value["type"].to_sym]).floor
        end

        if value["hr"].to_i <= 5
          value["rank"] = "low-rank"
        elsif value["hr"].to_i > 5 and value["hr"].to_i <= 8
          value["rank"] = "high-rank"
        elsif value["hr"] and value["elder"]
          value["rank"] = "g-rank"
        end

        output = {
          title: value["name"],
          slug: slugify(value["name"]),
          extra: value.select {|key, value| ["title", "slug"].none?(key)},
        }

        File.write("#{File.dirname(path)}/#{output[:slug]}.md", "+++\n#{TOML::Generator.new(output).body}+++\n")
      end
    end
  }
end

Dir.glob("content/monsters/**/*.json").each do |path|
  threads << Thread.new {
    File.open(path) do |file|
      json_data = JSON.load(file)

      json_data["monsters"].each do |monster|
        output = {
          title: monster["name"],
          slug: slugify(monster["name"]),
          extra: {}
        }
  
        File.write("#{File.dirname(path)}/#{output[:slug]}.md", "+++\n#{TOML::Generator.new(output).body}+++\n")
      end
    end
  }
end

threads.each(&:join)
