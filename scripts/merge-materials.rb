require 'json'
require 'find'
require 'erb'

FILE_TEMPLATE = %{{
  "materials": <%= JSON.pretty_generate(materials) %>
}}.gsub(/^  /, '')

materials = {}
output = ERB.new(FILE_TEMPLATE, trim_mode: "<>")
output_binding = binding

Dir.glob("content/{blacksmith,armorsmith}/**/*-crafting.json").each do |path|
  File.open(path) do |file|
    json_data = JSON.load(file)
    
    json_data["weapons"].each do |value|
      if value["create_mats"] != nil
        value["create_mats"].each do |material|
          if materials.key?(material["name"])
            if material["type"] == "bone" and material["color"] == "white"
              next
            end
          end

          materials[material["name"]] = material
        end
      end

      if value["improve_mats"] != nil
        value["improve_mats"].each do |material|
          if materials.key?(material["name"])
            if material["type"] == "bone" and material["color"] == "white"
              next
            end
          end

          materials[material["name"]] = material
        end
      end
    end
  end
end

File.write("test.json", output.result(output_binding))
  