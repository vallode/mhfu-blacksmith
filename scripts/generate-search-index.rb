require 'json'
require_relative 'lib/slug'

entries = []

# Weapons
Dir.glob("data/weapons/*.json").each do |path|
  data = JSON.load(File.read(path))
  type = File.basename(path, ".json")
  url_prefix = "/blacksmith/#{type}/"

  data["weapons"].each do |w|
    next if w["name"].nil?

    slug = slugify(w["name"])
    rank = if w["hr"]
      if w["hr"].to_i <= 5
        "low-rank"
      elsif w["hr"].to_i <= 8
        "high-rank"
      elsif w["elder"]
        "g-rank"
      end
    else
      case w["rarity"].to_i
      when 1..4 then "low-rank"
      when 5..7 then "high-rank"
      else "g-rank"
      end
    end

    entries << {
      name: w["name"],
      slug: slug,
      url: "#{url_prefix}#{slug}/",
      category: "weapon",
      type: w["type"] || type,
      rank: rank,
      rarity: w["rarity"].to_i,
      elements: (w["elements"] || []).map { |e| e["name"] }.join(" "),
      skills: ""
    }
  end
end

# Armor
Dir.glob("data/armor/*.json").each do |path|
  data = JSON.load(File.read(path))
  slot = File.basename(path, ".json")

  data["armor"].each do |a|
    next if a["name"].nil?

    slug = slugify(a["name"])
    rank = a["rank"]
    url_prefix = "/armorsmith/#{slot}/#{rank}/"
    skill_names = (a["skills"] || []).map { |s| s.is_a?(Hash) ? s["name"] : s }.join(" ")

    entries << {
      name: a["name"],
      slug: slug,
      url: "#{url_prefix}#{slug}/",
      category: "armor",
      type: a["type"],
      rank: rank,
      rarity: a["rarity"].to_i,
      elements: "",
      skills: skill_names
    }
  end
end

# Decorations
data = JSON.load(File.read("data/decorations.json"))
data["decorations"].each do |d|
  next if d["name"].nil?

  slug = slugify(d["name"])
  skill_names = (d["skills"] || []).join(" ")

  entries << {
    name: d["name"],
    slug: slug,
    url: "/decorations/#{slug}/",
    category: "decoration",
    type: "decoration",
    rank: nil,
    rarity: d["rarity"].to_i,
    elements: "",
    skills: skill_names
  }
end

# Monsters
Dir.glob("data/monsters/*.json").each do |path|
  data = JSON.load(File.read(path))
  category = File.basename(path, ".json")
  url_prefix = "/monsters/#{category}/"

  (data["monsters"] || []).each do |m|
    next unless m["name"]

    slug = slugify(m["name"])

    entries << {
      name: m["name"],
      slug: slug,
      url: "#{url_prefix}#{slug}/",
      category: "monster",
      type: m["type"] || "",
      rank: nil,
      rarity: 0,
      elements: "",
      skills: ""
    }
  end
end

File.write("static/search-data.json", JSON.generate(entries))
puts "Generated #{entries.length} search entries"
