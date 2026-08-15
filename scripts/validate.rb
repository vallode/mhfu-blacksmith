require 'json'
require 'json_schemer'

errors_found = false

def load_schema(name)
  JSONSchemer.schema(JSON.parse(File.read("data/schemas/#{name}.schema.json")))
end

def validate_file(path, schemer, label)
  data = JSON.parse(File.read(path))
  errors = schemer.validate(data).to_a

  if errors.empty?
    puts "  OK  #{path}"
  else
    puts "  FAIL #{path} (#{errors.length} error(s))"
    errors.each do |e|
      location = e["data_pointer"].empty? ? "(root)" : e["data_pointer"]
      puts "       #{location}: #{e["error"]}"
    end
    true
  end
end

weapon_schema     = load_schema("weapon")
armor_schema      = load_schema("armor")
decoration_schema = load_schema("decoration")
monster_schema    = load_schema("monster")

puts "Validating weapons..."
Dir.glob("data/weapons/*.json").sort.each do |path|
  errors_found |= validate_file(path, weapon_schema, "weapon")
end

puts "Validating armor..."
Dir.glob("data/armor/*.json").sort.each do |path|
  errors_found |= validate_file(path, armor_schema, "armor")
end

puts "Validating decorations..."
errors_found |= validate_file("data/decorations.json", decoration_schema, "decoration")

puts "Validating monsters..."
Dir.glob("data/monsters/*.json").sort.each do |path|
  errors_found |= validate_file(path, monster_schema, "monster")
end

if errors_found
  puts "\nValidation failed. Fix the errors above before building."
  exit 1
else
  puts "\nAll files valid."
end
