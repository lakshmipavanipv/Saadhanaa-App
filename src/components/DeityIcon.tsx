import React from 'react';
import { Text } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

// ─── T3: Line-art deity icon mapping ───────────────────────────────
// Maps deity id -> clean iconographic glyph from MaterialCommunityIcons.
// Falls back to the emoji passed in via `icon` prop if no mapping exists.
// Uses thematic symbols rather than literal characters (e.g. trishul for Shiva,
// flute for Krishna, bow for Rama, om for general).

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

const DEITY_ICON_MAP: Record<string, IconName> = {
  // Trimurti
  brahma: 'book-open-page-variant-outline',     // Vedas
  vishnu: 'flower-outline',                      // Lotus
  shiva: 'om',                                   // Om — quintessential Shiva symbol

  // Most worshipped
  ganesha: 'elephant',
  krishna: 'music',                              // Flute / song
  rama: 'bow-arrow',
  hanuman: 'arm-flex-outline',                   // Strength
  kartikeya: 'feather',                          // Peacock feather
  ayyappa: 'image-filter-hdr',                   // Mountain (Sabarimala)

  // Dashavatara
  matsya: 'fish',
  kurma: 'tortoise',
  varaha: 'pig',
  narasimha: 'cat',                              // (closest to lion)
  vamana: 'umbrella-outline',
  parashurama: 'axe',
  'rama-av': 'bow-arrow',
  'krishna-av': 'music',
  'buddha-av': 'meditation',
  kalki: 'horse',

  // Devi
  parvati: 'flower-tulip-outline',
  durga: 'sword-cross',
  lakshmi: 'flower',                             // Lotus + abundance
  saraswati: 'book-open-outline',
  sita: 'leaf',
  radha: 'heart-outline',
  annapurna: 'silverware-fork-knife',
  gayatri: 'weather-sunny',                      // Solar

  // Dasha Mahavidya
  'mv-kali': 'skull-outline',
  'mv-tara': 'star-outline',
  'mv-shodashi': 'flower-poppy',
  'mv-bhuvaneshwari': 'earth',
  'mv-bhairavi': 'fire',
  'mv-chinnamasta': 'sword',
  'mv-dhumavati': 'candle',
  'mv-bagalamukhi': 'feather',
  'mv-matangi': 'bird',
  'mv-kamala': 'flower-outline',

  // Ashta Bhairava
  'br-asitanga': 'circle-outline',
  'br-ruru': 'paw',                              // Ruru = deer-like, paw closest
  'br-chanda': 'paw',
  'br-krodha': 'fire',
  'br-unmatta': 'sync',
  'br-kapala': 'skull-outline',
  'br-bhishana': 'eye-outline',
  'br-samhara': 'flash-outline',

  // Shiva forms
  'sh-nataraja': 'human-handsup',
  'sh-ardha': 'scale-balance',
  'sh-lingam': 'ellipse-outline' as IconName,
  'sh-rudra': 'weather-lightning',
  'sh-bhairava': 'sword',
  'sh-dakshinamurti': 'tree-outline',

  // Vishnu forms
  'vn-balaji': 'temple-hindu',
  'vn-jagannath': 'temple-buddhist-outline',
  'vn-laddugopal': 'baby-face-outline',
  'vn-narayana': 'waves',
  'vn-panduranga': 'human-male',

  // Lokapalas
  'lk-surya': 'white-balance-sunny',
  'lk-chandra': 'moon-waning-crescent',
  'lk-indra': 'weather-lightning',
  'lk-agni': 'fire',
  'lk-vayu': 'weather-windy',
  'lk-varuna': 'waves',
  'lk-yama': 'scale-balance',
  'lk-kubera': 'treasure-chest',

  // Vahanas / Misc
  'sv-nandi': 'cow',
  'sv-garuda': 'bird',
  'sv-hanuman-bal': 'fruit-cherries',
  'sv-vishwakarma': 'hammer-wrench',
  'sv-tulasi': 'leaf',
  'sv-ganga': 'water-outline',
};

interface DeityIconProps {
  deityId?: string;
  icon?: string; // fallback emoji
  size?: number;
  color?: string;
}

export const DeityIcon: React.FC<DeityIconProps> = ({
  deityId,
  icon,
  size = 28,
  color = '#d4a017', // gold default
}) => {
  const glyph = deityId ? DEITY_ICON_MAP[deityId] : undefined;
  if (glyph) {
    return <MaterialCommunityIcons name={glyph} size={size} color={color} />;
  }
  // Fallback — show emoji if no mapping (custom deities)
  return <Text style={{ fontSize: size * 0.95, lineHeight: size + 2 }}>{icon || '🙏'}</Text>;
};
