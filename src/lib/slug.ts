/** Port of scripts/lib/slug.rb */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/(?<!\s)(?!\w)'(?=\w)/g, "-")
    .replace(/\s&\s/g, " ")
    .replace(/['\"()]/g, "")
    .replace(/\.\s/g, "-")
    .replace(/[\s,.&]/g, "-")
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .replace(/á/g, "a")
    .replace(/\+/g, "-plus");
}
