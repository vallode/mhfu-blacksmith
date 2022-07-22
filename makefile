# https://stackoverflow.com/questions/2145590/what-is-the-purpose-of-phony-in-a-makefile
.PHONY: serve

serve:
	zola serve

build:
	zola build
