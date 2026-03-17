require 'json'
require_relative 'lib/slug'

entries = []

# Weapons
Dir.glob("content/blacksmith/**/*-crafting.json").each do |path|
  data = JSON.load(File.read(path))
  url_prefix = "/" + File.dirname(path).delete_prefix("content/") + "/"

  data["weapons"].each do |w|
    next if w.key?("donotrender") || w["name"].nil?

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
      type: w["type"] || File.basename(File.dirname(path)),
      rank: rank,
      rarity: w["rarity"].to_i,
      elements: (w["elements"] || []).map { |e| e["name"] }.join(" "),
      skills: ""
    }
  end
end

# Armor
Dir.glob("content/armorsmith/**/*-crafting.json").each do |path|
  data = JSON.load(File.read(path))
  url_prefix = "/" + File.dirname(path).delete_prefix("content/") + "/"

  rank = if path.include?("g-rank")
    "g-rank"
  elsif path.include?("high-rank")
    "high-rank"
  else
    "low-rank"
  end

  data["weapons"].each do |a|
    next if a.key?("donotrender") || a["name"].nil?

    slug = slugify(a["name"])
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
Dir.glob("content/decorations/*-crafting.json").each do |path|
  data = JSON.load(File.read(path))
  url_prefix = "/" + File.dirname(path).delete_prefix("content/") + "/"

  data["weapons"].each do |d|
    next if d.key?("donotrender") || d["name"].nil?

    slug = slugify(d["name"])
    skill_names = (d["skills"] || []).join(" ")

    entries << {
      name: d["name"],
      slug: slug,
      url: "#{url_prefix}#{slug}/",
      category: "decoration",
      type: "decoration",
      rank: nil,
      rarity: d["rarity"].to_i,
      elements: "",
      skills: skill_names
    }
  end
end

# Monsters
Dir.glob("content/monsters/**/*.json").each do |path|
  data = JSON.load(File.read(path))
  url_prefix = "/" + File.dirname(path).delete_prefix("content/") + "/"

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
