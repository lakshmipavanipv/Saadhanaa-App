export interface CatalogDeity {
  id: string;
  name: string;
  icon: string;
  mantra: string;
  iconography?: string;
  malaMaterial?: string;
  malaColor?: string;
  malaHighlight?: string;
}

// Default mala styling by deity-group archetype
const M = {
  rudraksha: { malaMaterial: 'Rudraksha', malaColor: '#6b3410', malaHighlight: '#a85a1f' },
  tulsi: { malaMaterial: 'Tulsi', malaColor: '#5b4019', malaHighlight: '#8b6a2e' },
  kamalgatta: { malaMaterial: 'Kamal Gatta (Lotus seed)', malaColor: '#a08157', malaHighlight: '#d4b783' },
  sphatik: { malaMaterial: 'Sphatik (Crystal)', malaColor: '#e0e3eb', malaHighlight: '#ffffff' },
  whitesandal: { malaMaterial: 'White Sandalwood', malaColor: '#e8d8b5', malaHighlight: '#fff2d6' },
  redsandal: { malaMaterial: 'Red Sandalwood', malaColor: '#a04545', malaHighlight: '#d97070' },
  coral: { malaMaterial: 'Coral (Moonga)', malaColor: '#ff6b4a', malaHighlight: '#ffaa8a' },
  citrine: { malaMaterial: 'Yellow Citrine', malaColor: '#f0b830', malaHighlight: '#fff080' },
  turmeric: { malaMaterial: 'Turmeric (Haldi)', malaColor: '#e6a015', malaHighlight: '#ffd470' },
  pearl: { malaMaterial: 'Pearl (Moti)', malaColor: '#f3f0e5', malaHighlight: '#ffffff' },
  ruby: { malaMaterial: 'Ruby (Manik)', malaColor: '#c02040', malaHighlight: '#ff5a7a' },
  blackhakik: { malaMaterial: 'Black Hakik', malaColor: '#1f1f23', malaHighlight: '#555560' },
  iron: { malaMaterial: 'Iron (Loha)', malaColor: '#2c2c30', malaHighlight: '#666670' },
  blacktulsi: { malaMaterial: 'Black Tulsi (Shyama)', malaColor: '#2a1d10', malaHighlight: '#6b4a26' },
  emerald: { malaMaterial: 'Emerald / Green Hakik', malaColor: '#2f7d50', malaHighlight: '#5fc080' },
  pinkquartz: { malaMaterial: 'Rose Quartz', malaColor: '#d98090', malaHighlight: '#ffb8c8' },
  smokyquartz: { malaMaterial: 'Smoky Quartz', malaColor: '#5a5450', malaHighlight: '#8a8480' },
};

export interface DeityGroup {
  id: string;
  title: string;
  subtitle: string;
  deities: CatalogDeity[];
}

export const DEITY_CATALOG: DeityGroup[] = [
  {
    id: 'trinity',
    title: 'Trimurti — The Trinity',
    subtitle: 'Creator, Preserver, Destroyer',
    deities: [
      {
        id: 'brahma',
        name: 'Lord Brahma',
        icon: '📜',
        mantra: 'Om Brahmane Namah',
        iconography: 'Four heads, four arms, holding Vedas, mala, kamandalu',
      },
      {
        id: 'vishnu',
        name: 'Lord Vishnu',
        icon: '🪷',
        mantra: 'Om Namo Narayanaya',
        iconography: 'Blue-skinned, four arms with conch, discus, mace, lotus',
      },
      {
        id: 'shiva',
        name: 'Lord Shiva',
        icon: '🔱',
        mantra: 'Om Namah Shivaya',
        iconography: 'Trident, drum, snake, crescent moon, blue throat',
      },
    ],
  },
  {
    id: 'main',
    title: 'Most Worshipped',
    subtitle: 'Daily devotion across India',
    deities: [
      {
        id: 'ganesha',
        name: 'Lord Ganesha',
        icon: '🐘',
        mantra: 'Om Gan Ganapataye Namah',
        iconography: 'Elephant head, broken tusk, modak, mouse vahana',
      },
      {
        id: 'krishna',
        name: 'Lord Krishna',
        icon: '🪈',
        mantra: 'Hare Krishna Hare Rama',
        iconography: 'Blue skin, flute, peacock feather, yellow dhoti',
      },
      {
        id: 'rama',
        name: 'Lord Rama',
        icon: '🏹',
        mantra: 'Om Sri Ramaya Namah',
        iconography: 'Bow & arrow, royal blue skin, with Sita & Lakshmana',
      },
      {
        id: 'hanuman',
        name: 'Lord Hanuman',
        icon: '🐒',
        mantra: 'Om Hanumate Namah',
        iconography: 'Monkey face, mace (gada), mountain in hand',
      },
      {
        id: 'kartikeya',
        name: 'Kartikeya / Murugan',
        icon: '🦚',
        mantra: 'Om Saravana Bhava',
        iconography: 'Six faces, vel (spear), peacock vahana',
      },
      {
        id: 'ayyappa',
        name: 'Lord Ayyappa',
        icon: '🏔️',
        mantra: 'Swamiye Saranam Ayyappa',
        iconography: 'Yogic seat, bell around neck, black dhoti',
      },
    ],
  },
  {
    id: 'dashavatara',
    title: 'Dashavatara',
    subtitle: '10 incarnations of Vishnu',
    deities: [
      { id: 'matsya', name: 'Matsya', icon: '🐟', mantra: 'Om Matsyaaya Namah', iconography: 'Half-fish, half-human; saved Manu from pralaya' },
      { id: 'kurma', name: 'Kurma', icon: '🐢', mantra: 'Om Kurmaaya Namah', iconography: 'Tortoise; supported Mount Mandara during samudra manthan' },
      { id: 'varaha', name: 'Varaha', icon: '🐗', mantra: 'Om Varahaaya Namah', iconography: 'Boar head; lifted Bhumi Devi from cosmic ocean' },
      { id: 'narasimha', name: 'Narasimha', icon: '🦁', mantra: 'Om Narasimhaaya Namah', iconography: 'Lion head, human body; killed Hiranyakashipu' },
      { id: 'vamana', name: 'Vamana', icon: '🧒', mantra: 'Om Vamanaaya Namah', iconography: 'Dwarf brahmin with umbrella; humbled Bali' },
      { id: 'parashurama', name: 'Parashurama', icon: '🪓', mantra: 'Om Parashuramaaya Namah', iconography: 'Axe-wielding warrior brahmin' },
      { id: 'rama-av', name: 'Rama', icon: '🏹', mantra: 'Sri Ram Jai Ram Jai Jai Ram', iconography: 'King of Ayodhya, ideal man (Maryada Purushottama)' },
      { id: 'krishna-av', name: 'Krishna', icon: '🪈', mantra: 'Hare Krishna Hare Rama', iconography: 'Cowherd, charioteer of Arjuna' },
      { id: 'buddha-av', name: 'Buddha', icon: '☸️', mantra: 'Buddham Sharanam Gacchami', iconography: 'Compassion, awakening, dharma chakra' },
      { id: 'kalki', name: 'Kalki', icon: '🐎', mantra: 'Om Kalkine Namah', iconography: 'Future avatar — rider on white horse, end of Kali Yuga' },
    ],
  },
  {
    id: 'devi',
    title: 'Devi — Goddesses',
    subtitle: 'Forms of Adi Shakti',
    deities: [
      { id: 'parvati', name: 'Maa Parvati', icon: '🌸', mantra: 'Om Parvatyei Namah', iconography: 'Consort of Shiva, mountain daughter' },
      { id: 'durga', name: 'Maa Durga', icon: '⚔️', mantra: 'Om Durgayei Namah', iconography: '8 (or 10) arms, lion mount, slayer of Mahishasura' },
      { id: 'lakshmi', name: 'Goddess Lakshmi', icon: '🌺', mantra: 'Om Shreem Mahalakshmiyei Namah', iconography: 'Lotus throne, gold coins, elephants showering water' },
      { id: 'saraswati', name: 'Goddess Saraswati', icon: '📚', mantra: 'Om Saraswatyei Namah', iconography: 'White saree, veena, swan, lotus, book' },
      { id: 'sita', name: 'Sita Devi', icon: '🌷', mantra: 'Om Sitaayei Namah', iconography: 'Consort of Rama, earth-born' },
      { id: 'radha', name: 'Radha Rani', icon: '💗', mantra: 'Radhe Radhe', iconography: 'Eternal consort of Krishna, embodiment of bhakti' },
      { id: 'annapurna', name: 'Annapurna', icon: '🍚', mantra: 'Om Annapurnaayei Namah', iconography: 'Bowl of food, ladle — goddess of nourishment' },
      { id: 'gayatri', name: 'Gayatri Devi', icon: '🌅', mantra: 'Om Bhur Bhuvah Svah Tat Savitur...', iconography: 'Five faces, ten arms, embodiment of the Gayatri Mantra' },
    ],
  },
  {
    id: 'mahavidya',
    title: 'Dasha Mahavidya',
    subtitle: '10 wisdom goddesses (Tantric)',
    deities: [
      { id: 'mv-kali', name: 'Kali', icon: '🗡️', mantra: 'Om Krim Kalikayei Namah', iconography: 'Black, garland of skulls, sword, severed head, time itself' },
      { id: 'mv-tara', name: 'Tara', icon: '🌟', mantra: 'Om Tare Tuttare Ture Svaha', iconography: 'Blue Tara, savior who crosses you across samsara' },
      { id: 'mv-shodashi', name: 'Tripura Sundari (Lalita)', icon: '🌹', mantra: 'Om Aim Hreem Shreem', iconography: 'Beautiful red goddess of 3 worlds, sugarcane bow' },
      { id: 'mv-bhuvaneshwari', name: 'Bhuvaneshwari', icon: '🌍', mantra: 'Om Hreem Bhuvaneshvaryei Namah', iconography: 'Ruler of the world, four arms, golden complexion' },
      { id: 'mv-bhairavi', name: 'Tripura Bhairavi', icon: '🔥', mantra: 'Om Hasaim Hasakari Hasaim', iconography: 'Fierce, red, embodies destruction & transformation' },
      { id: 'mv-chinnamasta', name: 'Chhinnamasta', icon: '⚔️', mantra: 'Om Shreem Hreem Kleem', iconography: 'Self-decapitated, drinks own blood, naked' },
      { id: 'mv-dhumavati', name: 'Dhumavati', icon: '🕯️', mantra: 'Om Dhum Dhum Dhumavatyei Svaha', iconography: 'Widow goddess in smoke, ugly, crow flag' },
      { id: 'mv-bagalamukhi', name: 'Bagalamukhi', icon: '🪶', mantra: 'Om Hleem Bagalamukhyei Namah', iconography: 'Yellow goddess, paralyzes enemies, club & tongue' },
      { id: 'mv-matangi', name: 'Matangi', icon: '🦜', mantra: 'Om Hreem Kleem Matangyei Namah', iconography: 'Dark green, outcaste tantric form of Saraswati' },
      { id: 'mv-kamala', name: 'Kamala', icon: '🪷', mantra: 'Om Shreem Kamalayei Namah', iconography: 'Tantric Lakshmi, lotus throne, elephants' },
    ],
  },
  {
    id: 'bhairava',
    title: 'Ashta Bhairava',
    subtitle: '8 fierce forms of Shiva',
    deities: [
      { id: 'br-asitanga', name: 'Asitanga Bhairava', icon: '⚫', mantra: 'Om Asitangaaya Bhairavaaya Namah', iconography: 'Dark, bestows creative & artistic talents' },
      { id: 'br-ruru', name: 'Ruru Bhairava', icon: '🦌', mantra: 'Om Ruru Bhairavaaya Namah', iconography: 'Knowledge & wisdom-giver' },
      { id: 'br-chanda', name: 'Chanda Bhairava', icon: '🐅', mantra: 'Om Chanda Bhairavaaya Namah', iconography: 'Fierce, gives valor & strength' },
      { id: 'br-krodha', name: 'Krodha Bhairava', icon: '🔥', mantra: 'Om Krodha Bhairavaaya Namah', iconography: 'Wrathful, removes negativity' },
      { id: 'br-unmatta', name: 'Unmatta Bhairava', icon: '🌀', mantra: 'Om Unmatta Bhairavaaya Namah', iconography: 'Intoxicated form, removes ego & arrogance' },
      { id: 'br-kapala', name: 'Kapala Bhairava', icon: '💀', mantra: 'Om Kapala Bhairavaaya Namah', iconography: 'Skull-bearer, frees from karmic debt' },
      { id: 'br-bhishana', name: 'Bhishana Bhairava', icon: '👁️', mantra: 'Om Bhishana Bhairavaaya Namah', iconography: 'Terrifying, destroys evil spirits' },
      { id: 'br-samhara', name: 'Samhara Bhairava', icon: '⚡', mantra: 'Om Samhara Bhairavaaya Namah', iconography: 'Destroyer of sins, the final form' },
    ],
  },
  {
    id: 'shiva-forms',
    title: 'Shiva — Other Forms',
    subtitle: 'Beyond the Trishul',
    deities: [
      { id: 'sh-nataraja', name: 'Nataraja', icon: '💃', mantra: 'Om Nataraajaaya Namah', iconography: 'Cosmic dancer in ring of fire (Ananda Tandava)' },
      { id: 'sh-ardha', name: 'Ardhanarishvara', icon: '⚖️', mantra: 'Om Ardhanarishvaraaya Namah', iconography: 'Half-Shiva half-Parvati — union of male & female' },
      { id: 'sh-lingam', name: 'Shiva Lingam', icon: '🪨', mantra: 'Om Namah Shivaya', iconography: 'Aniconic form of Shiva on yoni base' },
      { id: 'sh-rudra', name: 'Rudra', icon: '🌩️', mantra: 'Om Rudraaya Namah', iconography: 'Vedic storm form of Shiva, archer with bow' },
      { id: 'sh-bhairava', name: 'Bhairava (Kala Bhairava)', icon: '🗡️', mantra: 'Om Kaala Bhairavaaya Namah', iconography: 'Black-bodied, four arms, dog vahana' },
      { id: 'sh-dakshinamurti', name: 'Dakshinamurti', icon: '📿', mantra: 'Om Dakshinamurtaye Namah', iconography: 'Shiva as silent guru under the banyan tree' },
    ],
  },
  {
    id: 'vishnu-forms',
    title: 'Vishnu — Special Forms',
    subtitle: 'Beyond the Avatars',
    deities: [
      { id: 'vn-balaji', name: 'Venkateswara (Balaji)', icon: '🛕', mantra: 'Om Namo Venkateshaaya', iconography: 'Tirumala Hills, gold ornaments, namam on forehead' },
      { id: 'vn-jagannath', name: 'Jagannath', icon: '🛺', mantra: 'Om Jagadishaaya Namah', iconography: 'Round eyes, Puri temple, ratha yatra' },
      { id: 'vn-laddugopal', name: 'Ladoo Gopal (Bal Krishna)', icon: '🛏️', mantra: 'Om Sri Krishnaaya Namah', iconography: 'Infant Krishna with butter, cradle' },
      { id: 'vn-narayana', name: 'Vishnu-Narayana', icon: '🌊', mantra: 'Om Namo Bhagavate Vasudevaaya', iconography: 'Reclining on Shesha Naga in ksheera sagara' },
      { id: 'vn-panduranga', name: 'Vitthala / Panduranga', icon: '🪘', mantra: 'Vitthala Vitthala Pandurang', iconography: 'Hands on hips standing on brick at Pandharpur' },
    ],
  },
  {
    id: 'lokapalas',
    title: 'Devatas & Lokapalas',
    subtitle: 'Cosmic guardians',
    deities: [
      { id: 'lk-surya', name: 'Surya', icon: '☀️', mantra: 'Om Suryaaya Namah', iconography: '7-horse chariot, lotus in hands, golden radiance' },
      { id: 'lk-chandra', name: 'Chandra', icon: '🌙', mantra: 'Om Chandraaya Namah', iconography: 'Moon god in 10-horse chariot, white robes' },
      { id: 'lk-indra', name: 'Indra', icon: '⚡', mantra: 'Om Indraaya Namah', iconography: 'King of devas, vajra (thunderbolt), Airavata elephant' },
      { id: 'lk-agni', name: 'Agni', icon: '🔥', mantra: 'Om Agnaye Namah', iconography: 'Fire god, two faces, ram vahana' },
      { id: 'lk-vayu', name: 'Vayu', icon: '🌬️', mantra: 'Om Vayave Namah', iconography: 'Wind god, antelope vahana, father of Hanuman' },
      { id: 'lk-varuna', name: 'Varuna', icon: '🌊', mantra: 'Om Varunaaya Namah', iconography: 'Water god, makara vahana, noose (pasha)' },
      { id: 'lk-yama', name: 'Yama', icon: '⚖️', mantra: 'Om Yamaaya Namah', iconography: 'Lord of death, buffalo vahana, mace & noose' },
      { id: 'lk-kubera', name: 'Kubera', icon: '💰', mantra: 'Om Kuberaaya Namah', iconography: 'God of wealth, treasury, plump form' },
    ],
  },
  {
    id: 'sons-vehicles',
    title: 'Vahanas & Sacred Beings',
    subtitle: 'Mounts and associates',
    deities: [
      { id: 'sv-nandi', name: 'Nandi', icon: '🐂', mantra: 'Om Nandeeshvaraaya Namah', iconography: 'White bull, vahana of Shiva' },
      { id: 'sv-garuda', name: 'Garuda', icon: '🦅', mantra: 'Om Garudaaya Namah', iconography: 'Eagle, vahana of Vishnu' },
      { id: 'sv-hanuman-bal', name: 'Bal Hanuman', icon: '🍑', mantra: 'Om Hanumate Namah', iconography: 'Child Hanuman reaching for the sun (the mango)' },
      { id: 'sv-vishwakarma', name: 'Vishwakarma', icon: '🔨', mantra: 'Om Vishvakarmaaya Namah', iconography: 'Divine architect, holding measuring tools' },
      { id: 'sv-tulasi', name: 'Tulasi Devi', icon: '🌿', mantra: 'Om Tulasayei Namah', iconography: 'Sacred basil personified, consort of Vishnu' },
      { id: 'sv-ganga', name: 'Ganga Devi', icon: '💧', mantra: 'Om Gangaayei Namah', iconography: 'River goddess, makara vahana, white-skinned' },
    ],
  },
];

// ── Mala material mapping per deity ──
// Traditional bead-material associations (Yoga / Tantra tradition)
const MALA_MAP: Record<string, typeof M[keyof typeof M]> = {
  // Trimurti
  brahma: M.whitesandal,
  vishnu: M.tulsi,
  shiva: M.rudraksha,

  // Most worshipped
  ganesha: M.redsandal,
  krishna: M.tulsi,
  rama: M.tulsi,
  hanuman: M.coral,
  kartikeya: M.coral,
  ayyappa: M.rudraksha,

  // Dashavatara
  matsya: M.tulsi,
  kurma: M.tulsi,
  varaha: M.tulsi,
  narasimha: M.coral,       // fierce — red
  vamana: M.tulsi,
  parashurama: M.rudraksha,
  'rama-av': M.tulsi,
  'krishna-av': M.tulsi,
  'buddha-av': M.sphatik,
  kalki: M.tulsi,

  // Devi
  parvati: M.kamalgatta,
  durga: M.redsandal,
  lakshmi: M.kamalgatta,
  saraswati: M.sphatik,
  sita: M.kamalgatta,
  radha: M.tulsi,
  annapurna: M.kamalgatta,
  gayatri: M.sphatik,

  // Dasha Mahavidya
  'mv-kali': M.blacktulsi,
  'mv-tara': M.citrine,
  'mv-shodashi': M.pinkquartz,
  'mv-bhuvaneshwari': M.kamalgatta,
  'mv-bhairavi': M.coral,
  'mv-chinnamasta': M.coral,
  'mv-dhumavati': M.smokyquartz,
  'mv-bagalamukhi': M.turmeric,
  'mv-matangi': M.emerald,
  'mv-kamala': M.kamalgatta,

  // Ashta Bhairava
  'br-asitanga': M.blackhakik,
  'br-ruru': M.rudraksha,
  'br-chanda': M.coral,
  'br-krodha': M.coral,
  'br-unmatta': M.smokyquartz,
  'br-kapala': M.blackhakik,
  'br-bhishana': M.blackhakik,
  'br-samhara': M.iron,

  // Shiva forms
  'sh-nataraja': M.rudraksha,
  'sh-ardha': M.rudraksha,
  'sh-lingam': M.rudraksha,
  'sh-rudra': M.rudraksha,
  'sh-bhairava': M.blackhakik,
  'sh-dakshinamurti': M.rudraksha,

  // Vishnu forms
  'vn-balaji': M.tulsi,
  'vn-jagannath': M.tulsi,
  'vn-laddugopal': M.tulsi,
  'vn-narayana': M.tulsi,
  'vn-panduranga': M.tulsi,

  // Lokapalas
  'lk-surya': M.ruby,
  'lk-chandra': M.pearl,
  'lk-indra': M.sphatik,
  'lk-agni': M.coral,
  'lk-vayu': M.sphatik,
  'lk-varuna': M.pearl,
  'lk-yama': M.iron,
  'lk-kubera': M.citrine,

  // Vahanas / Misc
  'sv-nandi': M.rudraksha,
  'sv-garuda': M.tulsi,
  'sv-hanuman-bal': M.coral,
  'sv-vishwakarma': M.coral,
  'sv-tulasi': M.tulsi,
  'sv-ganga': M.pearl,
};

// Apply materials in-place
DEITY_CATALOG.forEach(group => {
  group.deities = group.deities.map(d => ({
    ...d,
    ...(MALA_MAP[d.id] || M.rudraksha), // default to rudraksha
  }));
});

// Flatten for quick lookup
export const ALL_CATALOG_DEITIES: CatalogDeity[] = DEITY_CATALOG.flatMap(g => g.deities);
