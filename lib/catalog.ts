/**
 * Item names offered while typing an item ("fri" → Fridge / Refrigerator…).
 * Each entry: the name that is filled in, other words people type for it (short forms, Hindi, spellings),
 * and the usual volume in CFT (filled in on the survey list). Add or change items here.
 */
export interface CatalogItem { name: string; also?: string[]; cft?: number }

export const HOUSEHOLD_CATALOG: CatalogItem[] = [
  /* bedroom */
  { name: 'Single bed', also: ['cot', 'palang', 'पलंग', 'bed single'], cft: 40 },
  { name: 'Double bed', also: ['king bed', 'queen bed', 'palang', 'पलंग', 'bed double'], cft: 60 },
  { name: 'Double bed with storage', also: ['hydraulic bed', 'box bed', 'storage bed'], cft: 70 },
  { name: 'Bunk bed', also: ['kids bed', 'double decker'], cft: 60 },
  { name: 'Baby cot', also: ['crib', 'cradle', 'jhula', 'पालना'], cft: 20 },
  { name: 'Mattress single', also: ['gadda', 'गद्दा', 'bedding'], cft: 15 },
  { name: 'Mattress double', also: ['gadda', 'गद्दा', 'bedding'], cft: 25 },
  { name: 'Almirah / wardrobe', also: ['almari', 'अलमारी', 'cupboard', 'godrej', 'steel almirah', 'closet'], cft: 50 },
  { name: 'Wooden wardrobe (2 door)', also: ['almari', 'cupboard', 'wardrobe'], cft: 45 },
  { name: 'Wooden wardrobe (3 door)', also: ['almari', 'cupboard', 'wardrobe'], cft: 65 },
  { name: 'Dressing table', also: ['mirror table', 'shringar', 'vanity'], cft: 25 },
  { name: 'Side table', also: ['bedside table', 'night stand', 'stool'], cft: 6 },
  { name: 'Chest of drawers', also: ['drawer', 'drawers'], cft: 20 },
  { name: 'Pillows / bedding bag', also: ['takiya', 'तकिया', 'blanket', 'quilt', 'razai', 'रजाई', 'bedsheet'], cft: 8 },
  /* living room */
  { name: 'Sofa set (3+1+1)', also: ['sofa', 'सोफा', 'couch', 'sofa set'], cft: 70 },
  { name: 'Sofa 3 seater', also: ['sofa', 'सोफा', 'couch'], cft: 40 },
  { name: 'Sofa 2 seater', also: ['sofa', 'सोफा', 'couch'], cft: 28 },
  { name: 'Sofa cum bed', also: ['sofa bed', 'sofa', 'diwan'], cft: 45 },
  { name: 'L-shape sofa', also: ['corner sofa', 'sofa', 'सोफा'], cft: 80 },
  { name: 'Recliner chair', also: ['recliner', 'sofa chair'], cft: 25 },
  { name: 'Diwan / settee', also: ['divan', 'दीवान', 'settee'], cft: 35 },
  { name: 'Centre table', also: ['center table', 'coffee table', 'tea table', 'tea poy', 'teapoy'], cft: 12 },
  { name: 'TV unit', also: ['tv stand', 'tv cabinet', 'tv table', 'entertainment unit'], cft: 20 },
  { name: 'Showcase / display cabinet', also: ['showcase', 'crockery unit', 'shelf'], cft: 35 },
  { name: 'Bookshelf', also: ['book rack', 'book case', 'books shelf', 'kitab'], cft: 20 },
  { name: 'Shoe rack', also: ['shoe stand', 'joota', 'जूता', 'chappal stand'], cft: 10 },
  { name: 'Bean bag', also: ['beanbag'], cft: 10 },
  { name: 'Carpet / rug', also: ['carpet', 'kaleen', 'कालीन', 'dari', 'दरी', 'rug', 'mat'], cft: 5 },
  { name: 'Curtains', also: ['parda', 'पर्दा', 'curtain'], cft: 4 },
  { name: 'Painting / photo frame', also: ['frame', 'photo', 'wall art', 'painting', 'tasveer'], cft: 3 },
  { name: 'Mirror', also: ['aaina', 'आईना', 'shisha', 'शीशा', 'glass'], cft: 5 },
  { name: 'Wall clock', also: ['clock', 'ghadi', 'घड़ी'], cft: 2 },
  { name: 'Chandelier / jhoomar', also: ['jhoomar', 'झूमर', 'light'], cft: 8 },
  { name: 'Floor lamp', also: ['lamp', 'light'], cft: 4 },
  { name: 'Indoor plants / pots', also: ['plant', 'pot', 'gamla', 'गमला', 'flower pot', 'planter'], cft: 4 },
  /* dining & kitchen */
  { name: 'Dining table (4 seater)', also: ['dining', 'khane ki table', 'table'], cft: 30 },
  { name: 'Dining table (6 seater)', also: ['dining', 'table'], cft: 40 },
  { name: 'Dining chair', also: ['chair', 'kursi', 'कुर्सी'], cft: 6 },
  { name: 'Fridge / refrigerator (single door)', also: ['fridge', 'फ्रिज', 'frij', 'refrigerator', 'freeze'], cft: 25 },
  { name: 'Fridge / refrigerator (double door)', also: ['fridge', 'फ्रिज', 'frij', 'refrigerator', 'freeze'], cft: 35 },
  { name: 'Fridge / refrigerator (side-by-side)', also: ['fridge', 'फ्रिज', 'frij', 'refrigerator', 'big fridge'], cft: 50 },
  { name: 'Deep freezer', also: ['freezer', 'fridge', 'chest freezer'], cft: 35 },
  { name: 'Mini fridge', also: ['fridge', 'फ्रिज', 'small fridge', 'bar fridge'], cft: 12 },
  { name: 'Microwave', also: ['micro', 'oven', 'माइक्रोवेव'], cft: 8 },
  { name: 'OTG / oven', also: ['oven', 'otg', 'baking'], cft: 6 },
  { name: 'Dishwasher', also: ['dish washer', 'bartan'], cft: 15 },
  { name: 'Gas stove', also: ['chulha', 'चूल्हा', 'gas', 'stove', 'hob'], cft: 4 },
  { name: 'Gas cylinder (empty)', also: ['cylinder', 'सिलेंडर', 'lpg'], cft: 5 },
  { name: 'Chimney', also: ['kitchen chimney', 'exhaust'], cft: 8 },
  { name: 'Water purifier / RO', also: ['ro', 'aquaguard', 'purifier', 'filter', 'water filter'], cft: 5 },
  { name: 'Mixer grinder', also: ['mixer', 'mixie', 'grinder', 'juicer'], cft: 2 },
  { name: 'Induction cooktop', also: ['induction'], cft: 2 },
  { name: 'Kitchen utensils (carton)', also: ['bartan', 'बर्तन', 'utensils', 'kitchen items', 'vessels'], cft: 4 },
  { name: 'Crockery (carton)', also: ['crockery', 'plates', 'glass', 'cups', 'dinner set'], cft: 4 },
  { name: 'Kitchen trolley / rack', also: ['rack', 'kitchen rack', 'trolley'], cft: 10 },
  { name: 'Water drum / tank', also: ['drum', 'tank', 'tanki'], cft: 8 },
  /* appliances & electronics */
  { name: 'LED TV 32 inch', also: ['tv', 'television', 'टीवी', 'led', 'lcd', 'smart tv'], cft: 8 },
  { name: 'LED TV 43 inch', also: ['tv', 'television', 'टीवी', 'led', 'lcd', 'smart tv'], cft: 12 },
  { name: 'LED TV 55 inch', also: ['tv', 'television', 'टीवी', 'led', 'lcd', 'smart tv'], cft: 16 },
  { name: 'LED TV 65 inch', also: ['tv', 'television', 'टीवी', 'led', 'lcd', 'smart tv'], cft: 20 },
  { name: 'Washing machine (top load)', also: ['washing', 'वाशिंग मशीन', 'washer', 'machine'], cft: 20 },
  { name: 'Washing machine (front load)', also: ['washing', 'वाशिंग मशीन', 'washer', 'machine'], cft: 22 },
  { name: 'Dryer', also: ['cloth dryer', 'tumble dryer'], cft: 18 },
  { name: 'Split AC (indoor + outdoor)', also: ['ac', 'air conditioner', 'एसी', 'split'], cft: 25 },
  { name: 'Window AC', also: ['ac', 'air conditioner', 'एसी'], cft: 15 },
  { name: 'Air cooler', also: ['cooler', 'कूलर', 'desert cooler'], cft: 15 },
  { name: 'Ceiling fan', also: ['fan', 'pankha', 'पंखा'], cft: 3 },
  { name: 'Table / pedestal fan', also: ['fan', 'pankha', 'पंखा', 'stand fan'], cft: 4 },
  { name: 'Geyser / water heater', also: ['geyser', 'गीज़र', 'heater', 'water heater'], cft: 6 },
  { name: 'Room heater', also: ['heater', 'blower'], cft: 3 },
  { name: 'Inverter', also: ['ups', 'invertor'], cft: 3 },
  { name: 'Inverter battery', also: ['battery', 'बैटरी'], cft: 3 },
  { name: 'Vacuum cleaner', also: ['vacuum', 'cleaner'], cft: 3 },
  { name: 'Iron', also: ['press', 'istri', 'इस्त्री'], cft: 1 },
  { name: 'Home theatre / speakers', also: ['speaker', 'music system', 'sound', 'home theater', 'woofer'], cft: 6 },
  { name: 'Desktop computer', also: ['computer', 'pc', 'cpu', 'monitor'], cft: 6 },
  { name: 'Laptop', also: ['computer', 'notebook'], cft: 1 },
  { name: 'Printer', also: ['scanner', 'xerox'], cft: 3 },
  { name: 'Sewing machine', also: ['silai machine', 'सिलाई'], cft: 4 },
  /* study & office */
  { name: 'Study table', also: ['table', 'desk', 'padhai'], cft: 20 },
  { name: 'Computer table', also: ['table', 'desk', 'pc table'], cft: 15 },
  { name: 'Office table', also: ['table', 'desk', 'executive table'], cft: 30 },
  { name: 'Office chair', also: ['chair', 'kursi', 'कुर्सी', 'revolving chair'], cft: 8 },
  { name: 'Plastic chair', also: ['chair', 'kursi', 'कुर्सी'], cft: 4 },
  { name: 'Filing cabinet', also: ['file cabinet', 'files', 'drawer'], cft: 15 },
  { name: 'Steel cupboard (office)', also: ['almari', 'cupboard', 'godrej'], cft: 40 },
  { name: 'Books (carton)', also: ['kitab', 'किताब', 'books'], cft: 4 },
  { name: 'Documents / files (carton)', also: ['files', 'papers', 'documents'], cft: 4 },
  /* boxes & bags */
  { name: 'Carton box (small)', also: ['carton', 'box', 'डिब्बा', 'dabba', 'peti'], cft: 3 },
  { name: 'Carton box (medium)', also: ['carton', 'box', 'डिब्बा', 'dabba', 'peti'], cft: 4 },
  { name: 'Carton box (large)', also: ['carton', 'box', 'डिब्बा', 'dabba', 'peti'], cft: 6 },
  { name: 'Suitcase / trolley bag', also: ['bag', 'suitcase', 'अटैची', 'attachi', 'luggage', 'trolley'], cft: 4 },
  { name: 'Steel trunk', also: ['trunk', 'peti', 'पेटी', 'box'], cft: 8 },
  { name: 'Clothes (bag / carton)', also: ['kapde', 'कपड़े', 'clothes'], cft: 4 },
  { name: 'Toys (carton)', also: ['khilona', 'खिलौना', 'kids'], cft: 4 },
  /* vehicles & outdoor */
  { name: 'Car', also: ['gaadi', 'गाड़ी', 'four wheeler', 'four-wheeler', 'vehicle'], cft: 400 },
  { name: 'Motorcycle / bike', also: ['bike', 'बाइक', 'two wheeler', 'two-wheeler', 'motor cycle'], cft: 45 },
  { name: 'Scooter / scooty', also: ['scooty', 'activa', 'two wheeler', 'two-wheeler'], cft: 40 },
  { name: 'Bicycle', also: ['cycle', 'साइकिल'], cft: 15 },
  { name: 'Treadmill', also: ['gym', 'exercise'], cft: 30 },
  { name: 'Exercise cycle', also: ['gym', 'cycle', 'exercise'], cft: 15 },
  { name: 'Gym equipment / dumbbells', also: ['gym', 'weights', 'dumbbell'], cft: 6 },
  { name: 'Swing / jhula', also: ['jhula', 'झूला', 'swing'], cft: 20 },
  { name: 'Aquarium', also: ['fish tank', 'tank'], cft: 8 },
  { name: 'Piano / keyboard', also: ['piano', 'keyboard', 'music'], cft: 30 },
  { name: 'Guitar', also: ['music'], cft: 3 },
  { name: 'Mandir / pooja items', also: ['mandir', 'मंदिर', 'temple', 'pooja', 'pooja ghar', 'idol', 'murti'], cft: 8 },
  { name: 'Tool box', also: ['tools'], cft: 2 },
  { name: 'Ladder', also: ['seedhi', 'सीढ़ी'], cft: 8 },
];

/** Priced services for the old-style charges list (proforma). */
export const SERVICE_CATALOG: CatalogItem[] = [
  { name: 'Packing & loading charges', also: ['packing', 'loading'] },
  { name: 'Transportation charges', also: ['transport', 'freight', 'bhada', 'भाड़ा'] },
  { name: 'Unloading & unpacking', also: ['unloading', 'unpacking'] },
  { name: 'Loading & unloading labour', also: ['labour', 'hamali', 'मजदूरी'] },
  { name: 'Packing material', also: ['material', 'carton', 'bubble'] },
  { name: 'Car / bike transport', also: ['car', 'bike', 'vehicle'] },
  { name: 'Storage charges', also: ['storage', 'warehouse', 'godown'] },
  { name: 'Insurance / FOV', also: ['insurance', 'fov'] },
  { name: 'Toll & parking', also: ['toll', 'parking'] },
  { name: 'Door-to-door service', also: ['door to door'] },
];

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/**
 * Best matches for what was typed: names starting with it first, then a word starting with it,
 * then other names / Hindi starting with it, then anywhere in the name.
 */
export function searchCatalog(list: CatalogItem[], typed: string, limit = 8): CatalogItem[] {
  const q = norm(typed);
  if (!q) return [];
  const scored: [number, CatalogItem][] = [];
  for (const it of list) {
    const name = norm(it.name);
    const also = (it.also ?? []).map(norm);
    let score = 0;
    if (name.startsWith(q)) score = 100;
    else if (name.split(' ').some((w) => w.startsWith(q))) score = 80;
    else if (also.some((a) => a.startsWith(q) || a.split(' ').some((w) => w.startsWith(q)))) score = 60;
    else if (name.includes(q)) score = 40;
    else if (also.some((a) => a.includes(q))) score = 20;
    if (score) scored.push([score - name.length / 100, it]);
  }
  return scored.sort((a, b) => b[0] - a[0]).slice(0, limit).map(([, it]) => it);
}

export const catalogFor = (kind?: 'services' | 'household') => (kind === 'services' ? SERVICE_CATALOG : HOUSEHOLD_CATALOG);
export const cftOf = (name: string) => HOUSEHOLD_CATALOG.find((i) => i.name.toLowerCase() === name.trim().toLowerCase())?.cft;
