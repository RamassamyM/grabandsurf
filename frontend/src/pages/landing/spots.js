// Rental spots shown on the landing map. `station` links a spot to a live rack of the backend;
// the others are planned openings (status "soon"). Coordinates are approximate beach positions.
export const REGIONS = {
  basque: { fr: 'Pays basque', en: 'Basque Country', es: 'País Vasco francés' },
  landes: { fr: 'Landes', en: 'Landes', es: 'Landas' },
  gironde: { fr: 'Gironde', en: 'Gironde', es: 'Gironda' },
  atlantic: { fr: 'Vendée et Bretagne', en: 'Vendée and Brittany', es: 'Vendée y Bretaña' },
  normandy: { fr: 'Normandie', en: 'Normandy', es: 'Normandía' },
  euskadi: { fr: 'Euskadi', en: 'Euskadi', es: 'Euskadi' },
  cantabria: { fr: 'Cantabrie et Asturies', en: 'Cantabria and Asturias', es: 'Cantabria y Asturias' },
  galicia: { fr: 'Galice', en: 'Galicia', es: 'Galicia' },
  andalusia: { fr: 'Andalousie', en: 'Andalusia', es: 'Andalucía' },
}

export const SPOTS = [
  { id: 'biarritz-grande-plage', name: 'Grande Plage', town: 'Biarritz', region: 'basque', country: 'FR', lat: 43.4845, lng: -1.5586, station: 'A' },
  { id: 'biarritz-cote-des-basques', name: 'Côte des Basques', town: 'Biarritz', region: 'basque', country: 'FR', lat: 43.4777, lng: -1.5680, station: 'B' },
  { id: 'biarritz-milady', name: 'Milady', town: 'Biarritz', region: 'basque', country: 'FR', lat: 43.4666, lng: -1.5745, station: 'C' },
  { id: 'anglet-chambre-amour', name: "Chambre d'Amour", town: 'Anglet', region: 'basque', country: 'FR', lat: 43.5170, lng: -1.5310 },
  { id: 'anglet-cavaliers', name: 'Les Cavaliers', town: 'Anglet', region: 'basque', country: 'FR', lat: 43.5290, lng: -1.5220 },
  { id: 'guethary-parlementia', name: 'Parlementia', town: 'Guéthary', region: 'basque', country: 'FR', lat: 43.4260, lng: -1.6120 },
  { id: 'saint-jean-de-luz-lafitenia', name: 'Lafitenia', town: 'Saint-Jean-de-Luz', region: 'basque', country: 'FR', lat: 43.4100, lng: -1.6300 },
  { id: 'hendaye-grande-plage', name: 'Grande Plage', town: 'Hendaye', region: 'basque', country: 'FR', lat: 43.3740, lng: -1.7650 },
  { id: 'capbreton-la-piste', name: 'La Piste', town: 'Capbreton', region: 'landes', country: 'FR', lat: 43.6420, lng: -1.4490 },
  { id: 'hossegor-graviere', name: 'La Gravière', town: 'Hossegor', region: 'landes', country: 'FR', lat: 43.6695, lng: -1.4430 },
  { id: 'seignosse-estagnots', name: 'Les Estagnots', town: 'Seignosse', region: 'landes', country: 'FR', lat: 43.6960, lng: -1.4400 },
  { id: 'mimizan-plage', name: 'Plage du Courant', town: 'Mimizan', region: 'landes', country: 'FR', lat: 44.2130, lng: -1.2990 },
  { id: 'biscarrosse-plage', name: 'Plage centrale', town: 'Biscarrosse', region: 'landes', country: 'FR', lat: 44.4530, lng: -1.2530 },
  { id: 'lacanau-ocean', name: 'Plage centrale', town: 'Lacanau', region: 'gironde', country: 'FR', lat: 45.0000, lng: -1.2020 },
  { id: 'montalivet', name: 'Plage centrale', town: 'Montalivet', region: 'gironde', country: 'FR', lat: 45.3790, lng: -1.1590 },
  { id: 'sables-olonne', name: 'La Grande Plage', town: "Les Sables-d'Olonne", region: 'atlantic', country: 'FR', lat: 46.4950, lng: -1.7900 },
  { id: 'quiberon-port-blanc', name: 'Port Blanc', town: 'Quiberon', region: 'atlantic', country: 'FR', lat: 47.4870, lng: -3.1480 },
  { id: 'la-torche', name: 'La Torche', town: 'Plomeur', region: 'atlantic', country: 'FR', lat: 47.8380, lng: -4.3500 },
  { id: 'siouville', name: 'Plage de Siouville', town: 'Siouville-Hague', region: 'normandy', country: 'FR', lat: 49.5600, lng: -1.8450 },
  { id: 'donostia-zurriola', name: 'Zurriola', town: 'Donostia / San Sebastián', region: 'euskadi', country: 'ES', lat: 43.3260, lng: -1.9750 },
  { id: 'zarautz', name: 'Playa de Zarautz', town: 'Zarautz', region: 'euskadi', country: 'ES', lat: 43.2860, lng: -2.1700 },
  { id: 'mundaka', name: 'Mundaka', town: 'Mundaka', region: 'euskadi', country: 'ES', lat: 43.4070, lng: -2.6980 },
  { id: 'sopelana', name: 'Arrietara', town: 'Sopelana', region: 'euskadi', country: 'ES', lat: 43.3840, lng: -2.9950 },
  { id: 'somo', name: 'Playa de Somo', town: 'Somo', region: 'cantabria', country: 'ES', lat: 43.4530, lng: -3.7380 },
  { id: 'liencres', name: 'Valdearenas', town: 'Liencres', region: 'cantabria', country: 'ES', lat: 43.4540, lng: -3.9620 },
  { id: 'rodiles', name: 'Rodiles', town: 'Villaviciosa', region: 'cantabria', country: 'ES', lat: 43.5320, lng: -5.3780 },
  { id: 'salinas', name: 'Salinas', town: 'Castrillón', region: 'cantabria', country: 'ES', lat: 43.5780, lng: -5.9600 },
  { id: 'pantin', name: 'Pantín', town: 'Valdoviño', region: 'galicia', country: 'ES', lat: 43.6380, lng: -8.1100 },
  { id: 'razo', name: 'Razo', town: 'Carballo', region: 'galicia', country: 'ES', lat: 43.2930, lng: -8.7150 },
  { id: 'el-palmar', name: 'El Palmar', town: 'Vejer de la Frontera', region: 'andalusia', country: 'ES', lat: 36.2360, lng: -6.0800 },
  { id: 'tarifa-los-lances', name: 'Los Lances', town: 'Tarifa', region: 'andalusia', country: 'ES', lat: 36.0300, lng: -5.6300 },
]

// Accent- and case-insensitive search on name, town and region.
export function normalize(text) {
  return String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export function searchSpots(query, lang) {
  const q = normalize(query).trim()
  if (!q) return SPOTS
  return SPOTS.filter((s) => normalize(`${s.name} ${s.town} ${REGIONS[s.region][lang] || ''} ${s.country === 'ES' ? 'espagne spain espana' : 'france'}`).includes(q))
}
