# https://stackoverflow.com/questions/2145590/what-is-the-purpose-of-phony-in-a-makefile
.PHONY: serve

serve: clean generate-pages
	zola serve

generate-pages: clean
	ruby scripts/generate-pages.rb

generate-maps:
	ruby scripts/generate-maps.rb

debug: generate-pages
	TERA_DEBUG=true zola serve

clean:
	find content/blacksmith/**/*.md ! -name '_index.md' -exec rm {} +

build: clean generate-pages
	TERA_PRODUCTION=true zola build

deploy: build
	MHFU_PRODUCTION=true netlify deploy --site mhfu-blacksmith --prod --message \
		"`git log --oneline --format=%s -n 1`" --dir public