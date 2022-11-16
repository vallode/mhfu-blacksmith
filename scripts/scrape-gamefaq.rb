require 'json'
require 'find'
require 'erb'

BASE_URL = "https://gamefaqs.gamespot.com/psp/943356-monster-hunter-freedom-unite/faqs/78652/"

monster_list = JSON.load(File.open("sources/monster-list.json"))["monsters"]

def slugify(value)
  value = value.downcase.strip
  value = value.gsub(/(?<!\s)(?!\w)'(?=\w)/, "_")
  value = value.gsub(/\s\&\s/, " ")
  value = value.gsub(/[\'\"\(\)]/, "")
  value = value.gsub(/\.\s/, "_")
  value = value.gsub(/[\s\,\.\&]{1}/, '_')
  value = value.gsub("ä", "a").gsub("ö", "o").gsub("ü", "u").gsub("á", "a")
  value = value.gsub("+", "-plus")
end

monster_list.each do |category, list|
  list.each do |monster|
    monster_data = {name: monster, drops: {}}

    p monster

    Dir.glob("sources/{monsters,small_monsters}/**/#{slugify(monster)}.txt").each do |path|
      File.open(path) do |file|

        current_rank = ""
        current_reward = ""

        file.each_line do |line|
          if line[0] == "☆"
            line.scan(/^.*MHFU\s(.*)$/) {|match|
              current_rank = match[0].strip.to_s
              monster_data[:drops][current_rank] = {}
            }
          end

          if line[0].to_i.is_a? Numeric
            line.scan(/^\d.(.*)$/) {|match|
              p match[0]
              current_reward = match[0].strip.to_s  
              monster_data[:drops][current_rank][current_reward] = []
            }
          end

          if line[0] == "-"
            p line
            line.scan(/^-(.*)\((.*)\).*$/) {|match|
              p match
              monster_data[:drops][current_rank][current_reward].push({
                name: match[0].strip,
                chance: match[1].strip
              })
            }
          end
        end

        # file_data = file.read

        # file_data.split("☆").each do |rank|
        #   next if rank.length == 0

        #   rank.scan(/^.*MHFU\s(.*)$/) {|rank_match|
        #     monster_data[:drops][rank_match[0].strip.to_s] = {}

        #     rank.scan(/^\d.\s(.*)(?:\s:)?(?:[\(.*\)])?$/) {|rewards|
        #       monster_data[:drops][rank_match[0].strip.to_s][rewards[0].strip.to_s] = {}
        #     }
        #   }
        # end

        # file_data.scan(/☆.*((Low|High|G)\sRank)([\S\s]*)(☆$)?/) {|match|
        #   p match[0]

        #   match[2].scan(/(\d.\ )(\w+(?:\s\w+)?)/) {|match2|
        #     monster_data[:drops][match[0].to_s][match2[1].to_s] = []
        #   }
        # } 
      end
    end

    File.write("content/monsters/#{slugify(category)}/#{slugify(monster)}.json", JSON.pretty_generate(monster_data))
  end
end

# Dir.glob("content/blacksmith/**/*-crafting.json").each do |path|
#   File.open(path) do |file|
#     json_data = JSON.load(file)

#     puts path

#     if not File.exist?("#{File.dirname(path)}/sharpness.json")
#       next
#     end

#     File.open("#{File.dirname(path)}/sharpness.json") do |sharpness_file|
#       sharpness_data = JSON.load(sharpness_file)

#       json_data["weapons"].each_with_index do |weapon, index|
#         puts weapon["name"]
#         sharpness = sharpness_data.select {|element| element["name"].sub("*", "") == weapon["name"]}[0]

#         if not sharpness 
#           raise "Could not find weapon in sharpness values"
#         end

#         puts sharpness
  
#         if weapon.key?("sharpness")
#           puts weapon["sharpness"]
#           weapon["sharpness"] = sharpness["sharpness"]
#         end
#       end
  
#       File.write(path, JSON.dump(json_data))
#     end
#   end
# end
  