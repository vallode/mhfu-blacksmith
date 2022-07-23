# https://stackoverflow.com/questions/2145590/what-is-the-purpose-of-phony-in-a-makefile
.PHONY: serve

serve: generate-pages
	zola serve

generate-pages:
	ruby generate-pages.rb

debug: generate-pages
	TERA_DEBUG=true zola serve

clean:
	rm -r content/blacksmith/**/details/*.md

build: generate-pages
	zola build
