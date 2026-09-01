/**
 * Craving search. Maps a typed word to product categories in both languages,
 * so "sweet", "édes" and "sütemény" all surface the pastries.
 */
const SYNONYMS = {
  // English
  sweet: ["sweet"], pastry: ["sweet"], pastries: ["sweet"], dessert: ["sweet"],
  cake: ["sweet"], brownie: ["sweet"],
  gift: ["merch"], merch: ["merch"], shirt: ["merch"], tee: ["merch"],
  hoodie: ["merch"], mug: ["merch"], beans: ["merch"], tote: ["merch"], bag: ["merch"],
  coffee: ["coffee"], espresso: ["coffee"], hot: ["coffee"], latte: ["coffee", "cold"],
  cold: ["cold"], iced: ["cold"], tonic: ["cold"], brew: ["cold"],
  food: ["food"], sandwich: ["food"], lunch: ["food"], waffle: ["food"], waffles: ["food"],
  // Magyar
  édes: ["sweet"], édesség: ["sweet"], sütemény: ["sweet"], pékáru: ["sweet"],
  csiga: ["sweet"], desszert: ["sweet"], süti: ["sweet"],
  ajándék: ["merch"], bögre: ["merch"], pulcsi: ["merch"], pulóver: ["merch"],
  póló: ["merch"], bab: ["merch"], kávébab: ["merch"], táska: ["merch"],
  kávé: ["coffee"], kave: ["coffee"], eszpresszó: ["coffee"], forró: ["coffee"],
  hideg: ["cold"], jeges: ["cold"], jég: ["cold"],
  étel: ["food"], szendvics: ["food"], ebéd: ["food"], gofri: ["food"], reggeli: ["food"],
};

/** Fields worth searching on a localized product. */
const HAYSTACK = (p) => [p.name, p.desc, p.tip, ...(p.ingredients ?? [])];

export function matchesQuery(localizedProduct, rawQuery) {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return true;
  if ((SYNONYMS[query] ?? []).includes(localizedProduct.cat)) return true;
  return HAYSTACK(localizedProduct).some(
    (field) => typeof field === "string" && field.toLowerCase().includes(query),
  );
}
