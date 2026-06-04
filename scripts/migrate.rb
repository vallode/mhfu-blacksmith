require 'json'
require 'fileutils'

# Coerce a value to integer if it looks like an integer string, otherwise return as-is.
def coerce_int(value)
  return value unless value.is_a?(String)
  return value.to_i if value =~ /\A-?\d+\z/
  value
end

def fix_material(mat)
  mat.merge("amount" => coerce_int(mat["amount"]))
end

def fix_materials(mats)
  return mats unless mats.is_a?(Array)
  mats.map { |m| fix_material(m) }
end

# Fix all string-typed numbers in a weapon entry.
def fix_weapon(w)
  result = w.dup

  result["sharpness"] = w["sharpness"].map { |v| coerce_int(v) } if w["sharpness"].is_a?(Array)
  result["sharpness_plus"] = w["sharpness_plus"].map { |v| coerce_int(v) } if w["sharpness_plus"].is_a?(Array)
  result["max_attack"] = coerce_int(w["max_attack"]) if w.key?("max_attack")
  result["create_mats"] = fix_materials(w["create_mats"])
  result["improve_mats"] = fix_materials(w["improve_mats"])
  result["alternative_create_mats"] = fix_materials(w["alternative_create_mats"])

  result
end

# Fix all string-typed numbers in an armor entry and inject an explicit rank field.
def fix_armor(a, rank)
  result = a.dup

  # hr and elder use game-specific notation (e.g. "6!", "5!8") so they stay as strings.
  %w[defence fire_res thunder_res dragon_res water_res ice_res rarity create_cost].each do |field|
    result[field] = coerce_int(a[field]) if a.key?(field)
  end

  if a["skills"].is_a?(Array)
    result["skills"] = a["skills"].map do |skill|
      skill.is_a?(Hash) ? skill.merge("amount" => coerce_int(skill["amount"])) : skill
    end
  end

  result["create_mats"] = fix_materials(a["create_mats"])
  result["rank"] = rank

  result
end

# Fix material amounts in a decoration entry and inject its category.
def fix_decoration(d, category)
  result = d.dup
  result["create_mats"] = fix_materials(d["create_mats"])
  result["alternative_create_mats"] = fix_materials(d["alternative_create_mats"])
  result["category"] = category
  result
end

# ---------------------------------------------------------------------------
# Setup output directories
# ---------------------------------------------------------------------------
FileUtils.mkdir_p("data/weapons")
FileUtils.mkdir_p("data/armor")
FileUtils.mkdir_p("data/monsters")
FileUtils.mkdir_p("data/schemas")

WEAPON_TYPES = %w[
  great-sword long-sword sword-and-shield dual-blades hammer hunting-horn
  lance gunlance light-bowgun heavy-bowgun bow
]

ARMOR_SLOTS = %w[helmet plate gauntlets waist leggings]
ARMOR_RANKS = { "low-rank" => "low-rank", "high-rank" => "high-rank", "g-rank" => "g-rank" }

# ---------------------------------------------------------------------------
# Weapons — one file per type
# ---------------------------------------------------------------------------
WEAPON_TYPES.each do |type|
  path = "content/blacksmith/#{type}/#{type}-crafting.json"
  unless File.exist?(path)
    warn "WARNING: #{path} not found, skipping"
    next
  end

  data = JSON.parse(File.read(path))
  weapons = data["weapons"].map { |w| fix_weapon(w) }

  output = JSON.pretty_generate({ "weapons" => weapons })
  File.write("data/weapons/#{type}.json", output)
  puts "Migrated weapons/#{type}.json (#{weapons.length} entries)"
end

# ---------------------------------------------------------------------------
# Armor — merge 3 rank files per slot into one
# ---------------------------------------------------------------------------
ARMOR_SLOTS.each do |slot|
  merged = []

  ARMOR_RANKS.each do |rank_dir, rank_label|
    path = "content/armorsmith/#{slot}/#{rank_dir}/#{slot}-crafting.json"
    unless File.exist?(path)
      warn "WARNING: #{path} not found, skipping"
      next
    end

    data = JSON.parse(File.read(path))
    items = data["weapons"].map { |a| fix_armor(a, rank_label) }
    merged.concat(items)
    puts "  Read armor/#{slot} #{rank_label} (#{items.length} entries)"
  end

  output = JSON.pretty_generate({ "armor" => merged })
  File.write("data/armor/#{slot}.json", output)
  puts "Migrated armor/#{slot}.json (#{merged.length} total entries)"
end

# ---------------------------------------------------------------------------
# Decorations — strip donotrender headers, inject category field
# ---------------------------------------------------------------------------
path = "content/decorations/decorations-crafting.json"
data = JSON.parse(File.read(path))
items = data["weapons"]

# Build name → category map from the donotrender category headers.
category_map = {}
items.each do |item|
  next unless item["donotrender"]
  category_name = item["name"]
  (item["improve_to"] || []).each { |child_name| category_map[child_name] = category_name }
end

decorations = items
  .reject { |item| item["donotrender"] }
  .map { |d| fix_decoration(d, category_map[d["name"]]) }

output = JSON.pretty_generate({ "decorations" => decorations })
File.write("data/decorations.json", output)
puts "Migrated decorations.json (#{decorations.length} entries)"

# ---------------------------------------------------------------------------
# Monsters — copy with key rename (monsters key is already correct)
# ---------------------------------------------------------------------------
Dir.glob("content/monsters/**/*.json").each do |src|
  category = File.basename(File.dirname(src))
  data = JSON.parse(File.read(src))

  dest = "data/monsters/#{category}.json"
  File.write(dest, JSON.pretty_generate(data))
  count = (data["monsters"] || []).length
  puts "Migrated monsters/#{category}.json (#{count} entries)"
end

puts "\nMigration complete. Review data/ and then run: make validate"
