# https://stackoverflow.com/questions/2145590/what-is-the-purpose-of-phony-in-a-makefile
.PHONY: serve

serve:
	zola serve

debug:
	TERA_DEBUG=true zola serve

build:
	zola build
