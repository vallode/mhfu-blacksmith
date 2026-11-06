# Data tooling only. The site is built with `pnpm build` and deployed by
# Netlify; see README.md.
.PHONY: generate-maps release-json

# Regenerate the crafting-tree maps (content/**/map.json) from data/.
generate-maps:
	ruby scripts/generate-maps.rb

release-json:
	mkdir -p mhfu_weapon_information
	find data/weapons -name '*.json' -exec cp {} mhfu_weapon_information \;
	zip mhfu_weapon_information.zip -m -9 -r mhfu_weapon_information
