# https://stackoverflow.com/questions/2145590/what-is-the-purpose-of-phony-in-a-makefile
.PHONY: serve

serve: generate-pages
	zola serve

generate-pages:
	ruby generate-pages.rb

debug: generate-pages
	TERA_DEBUG=true zola serve

clean:
	find content/blacksmith/**/details/*.md ! -name '_index.md' -exec rm {} +

build: generate-pages
	zola build
