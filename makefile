# https://stackoverflow.com/questions/2145590/what-is-the-purpose-of-phony-in-a-makefile
.PHONY: serve

serve: clean generate-pages
	zola serve

generate-pages: clean
	bundle exec ruby scripts/generate-pages.rb

generate-maps:
	bundle exec ruby scripts/generate-maps.rb

debug: generate-pages
	TERA_DEBUG=true zola serve

clean:
	find content -name '*.md' ! -name '_index.md' -exec rm {} +

build: clean generate-pages
	TERA_PRODUCTION=true zola build

deploy: build
	MHFU_PRODUCTION=true netlify deploy --site mhfu-blacksmith --prod --message \
		"`git log --oneline --format=%s -n 1`" --dir public

release-json:
	mkdir -p mhfu_weapon_information
	find content/blacksmith -name '*-crafting.json' -exec cp {} mhfu_weapon_information \;
	zip mhfu_weapon_information.zip -m -9 -r mhfu_weapon_information