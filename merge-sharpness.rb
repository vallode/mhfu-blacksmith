require 'json'
require 'find'
require 'erb'

Dir.glob("content/blacksmith/**/*-crafting.json").each do |path|
  File.open(path) do |file|
    json_data = JSON.load(file)

    puts path

    if not File.exist?("#{File.dirname(path)}/sharpness.json")
      next
    end

    File.open("#{File.dirname(path)}/sharpness.json") do |sharpness_file|
      sharpness_data = JSON.load(sharpness_file)

      json_data["weapons"].each_with_index do |weapon, index|
        puts weapon["name"]
        sharpness = sharpness_data.select {|element| element["name"].sub("*", "") == weapon["name"]}[0]

        if not sharpness 
          raise "Could not find weapon in sharpness values"
        end

        puts sharpness
  
        if weapon.key?("sharpness")
          puts weapon["sharpness"]
          weapon["sharpness"] = sharpness["sharpness"]
        end
      end
  
      File.write(path, JSON.dump(json_data))
    end
  end
end
  