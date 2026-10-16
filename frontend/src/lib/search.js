/**
 * Craving search. Maps a typed word to product categories in both languages,
 * so "sweet", "édes" and "sütemény" all surface the pastries.
 *
 * A word may point at several categories: sweet things are split across three
 * counters here (baked on site, bought-in cakes, bakery), and someone typing
 * "édes" wants all of them, not whichever one we picked.
 */
const SYNONYMS = {
  // English
  coffee: ["coffee"], espresso: ["coffee"], americano: ["coffee"], cappuccino: ["coffee"],
  latte: ["coffee", "specialty"], flat: ["coffee"], cortado: ["coffee"], filter: ["coffee"],
  brew: ["coffee"], v60: ["coffee"], hot: ["coffee", "tea", "specialty"],
  cold: ["coffee", "smoothie", "bottled"], iced: ["coffee", "specialty", "smoothie"],
  matcha: ["specialty"], chai: ["specialty"], tonic: ["specialty", "bottled"],
  chocolate: ["specialty", "dessert", "cake"], caramel: ["specialty"],
  pistachio: ["specialty", "pastry", "cake", "dessert"], special: ["specialty"],
  tea: ["tea"], green: ["tea"], herbal: ["tea"],
  smoothie: ["smoothie"], smoothies: ["smoothie"], fruit: ["smoothie", "tea"],
  mango: ["smoothie", "specialty"], berry: ["smoothie", "cake"],
  food: ["sandwich"], sandwich: ["sandwich"], sandwiches: ["sandwich"],
  lunch: ["sandwich"], breakfast: ["sandwich", "pastry"], eggs: ["sandwich"],
  cheese: ["sandwich", "pastry", "cake"], salmon: ["sandwich"],
  pastry: ["pastry"], pastries: ["pastry"], bakery: ["pastry"], croissant: ["pastry"],
  bread: ["pastry"], pretzel: ["pastry"], scone: ["pastry"],
  cake: ["cake"], cakes: ["cake"], cheesecake: ["cake"], pie: ["cake"],
  vegan: ["cake"], gluten: ["cake"], "gluten-free": ["cake"],
  sweet: ["dessert", "cake", "pastry"], dessert: ["dessert", "cake"],
  desserts: ["dessert", "cake"], brownie: ["dessert"], cookie: ["dessert"],
  cookies: ["dessert"], muffin: ["dessert"], waffle: ["dessert"], waffles: ["dessert"],
  drink: ["bottled"], drinks: ["bottled"], soda: ["bottled"], water: ["bottled"],
  cola: ["bottled"], bottle: ["bottled"], bottled: ["bottled"],
  gift: ["merch"], merch: ["merch"], shirt: ["merch"], tee: ["merch"],
  hoodie: ["merch"], mug: ["merch"], beans: ["beans", "merch"], tote: ["merch"], bag: ["merch"],
  // Magyar
  kávé: ["coffee"], kave: ["coffee"], kávék: ["coffee"], eszpresszó: ["coffee"],
  forró: ["coffee", "tea", "specialty"], filteres: ["coffee"],
  hideg: ["coffee", "smoothie", "bottled"], jeges: ["coffee", "specialty", "smoothie"],
  jég: ["coffee", "smoothie"],
  különlegesség: ["specialty"], különlegességek: ["specialty"], matcsa: ["specialty"],
  csoki: ["specialty", "dessert", "cake"], csokoládé: ["specialty", "dessert", "cake"],
  karamell: ["specialty"], pisztácia: ["specialty", "pastry", "cake", "dessert"],
  pisztáciás: ["specialty", "pastry", "cake", "dessert"],
  teák: ["tea"], zöld: ["tea"], gyümölcs: ["tea", "smoothie"],
  gyümölcsös: ["tea", "smoothie"], herba: ["tea"],
  turmix: ["smoothie"], mangó: ["smoothie", "specialty"], eper: ["smoothie", "cake"],
  epres: ["smoothie", "cake", "specialty"],
  étel: ["sandwich"], szendvics: ["sandwich"], szendvicsek: ["sandwich"],
  ebéd: ["sandwich"], reggeli: ["sandwich", "pastry"], tojás: ["sandwich"],
  sajt: ["sandwich", "pastry", "cake"], sajtos: ["sandwich", "pastry", "cake"],
  lazac: ["sandwich"], sós: ["sandwich", "pastry"],
  pékáru: ["pastry"], péksütemény: ["pastry"], kifli: ["pastry"],
  perec: ["pastry"], pogácsa: ["pastry"], kenyér: ["pastry"], csiga: ["pastry"],
  fahéjas: ["pastry"],
  sütemény: ["cake"], sütemények: ["cake"], torta: ["cake"], sajttorta: ["cake"],
  pite: ["cake"], vegán: ["cake"], gluténmentes: ["cake"], mentes: ["cake"],
  édes: ["dessert", "cake", "pastry"], édesség: ["dessert", "cake", "pastry"],
  desszert: ["dessert", "cake"], süti: ["dessert", "cake"],
  keksz: ["dessert"], gofri: ["dessert"],
  ital: ["bottled"], italok: ["bottled"], üdítő: ["bottled"], víz: ["bottled"],
  ásványvíz: ["bottled"], tonik: ["specialty", "bottled"], üveges: ["bottled"],
  ajándék: ["merch"], bögre: ["merch"], pulcsi: ["merch"], pulóver: ["merch"],
  póló: ["merch"], bab: ["beans"], kávébab: ["beans"], szemes: ["beans"], táska: ["merch"],
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
