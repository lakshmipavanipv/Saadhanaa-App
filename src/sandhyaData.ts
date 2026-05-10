// Sandhya Vandanam — daily Vedic ritual at three junctures (sandhi kalas).
// Compiled from Yajur Veda Sandhya Vandanam tradition (Smarta sampradaya).

export interface ProcedureStep {
  index: number;
  name: string;
  description: string;
  mantra?: string;
  transliteration?: string;
  meaning?: string;
  count?: string;
}

export interface SandhyaPart {
  id: 'pratah' | 'madhyahnika' | 'sayam';
  name: string;
  shortName: string;
  icon: string;
  defaultTime: string;
  timeWindow: string;
  facing: string;
  bestPosture: string;
  significance: string;
  argyaDirection: string;
  argyaCount: number;
  prayascittaArgya: number;
}

export const SANDHYAS: SandhyaPart[] = [
  {
    id: 'pratah',
    name: 'Pratah Sandhya',
    shortName: 'Pratah',
    icon: '🌅',
    defaultTime: '05:30',
    timeWindow: 'Before sunrise (Brahma Muhurta to Sunrise)',
    facing: 'East — towards the rising Sun',
    bestPosture: 'Standing for argya, sitting on asana for japa',
    significance:
      'Worship at dawn — the most powerful sandhi. Atones for sins of the night and aligns the day with dharma. Lord Brahma presides.',
    argyaDirection: 'Lift the arghya (water) up to the level of forehead, facing east',
    argyaCount: 3,
    prayascittaArgya: 1,
  },
  {
    id: 'madhyahnika',
    name: 'Madhyahnika Sandhya',
    shortName: 'Madhyahna',
    icon: '☀️',
    defaultTime: '12:00',
    timeWindow: 'Solar noon (~11:30 to 12:30 local time)',
    facing: 'East or North',
    bestPosture: 'Standing facing the Sun overhead',
    significance:
      'Worship at noon when Surya is at zenith. Lord Vishnu presides. Removes bondage of karma accumulated since dawn.',
    argyaDirection: 'Pour the arghya overhead, looking up at the Sun',
    argyaCount: 1,
    prayascittaArgya: 0,
  },
  {
    id: 'sayam',
    name: 'Sayam Sandhya',
    shortName: 'Sayam',
    icon: '🌙',
    defaultTime: '18:30',
    timeWindow: 'Just after sunset (until stars appear)',
    facing: 'West, then North for japa',
    bestPosture: 'Sitting facing west',
    significance:
      'Worship at dusk — atones for sins of the day. Lord Rudra presides. Prepares the mind for night and rest.',
    argyaDirection: 'Pour the arghya at chest level, facing west',
    argyaCount: 3,
    prayascittaArgya: 1,
  },
];

// Procedure shared across all three sandhyas (small variations in argya direction)
export const PROCEDURE: ProcedureStep[] = [
  {
    index: 1,
    name: 'Achamana',
    description:
      'Take a small spoon of water in the right palm. Sip 3 times after each name. Then touch lips, head, eyes, ears, shoulders.',
    mantra:
      'ॐ केशवाय स्वाहा । ॐ नारायणाय स्वाहा । ॐ माधवाय स्वाहा । ॐ गोविन्दाय नमः । ॐ विष्णवे नमः ।',
    transliteration:
      'Om Keshavaya svaha · Om Narayanaya svaha · Om Madhavaya svaha · Om Govindaya namah · Om Vishnave namah',
    meaning:
      'Salutations to Lord Vishnu in his various forms — purifying body, speech and mind.',
  },
  {
    index: 2,
    name: 'Ganapati Dhyana',
    description: 'Salute Lord Ganesha for removal of obstacles before beginning.',
    mantra: 'ॐ श्री महागणपतये नमः ।',
    transliteration: 'Om Shri Maha-Ganapataye Namah',
    meaning: 'Salutations to the Great Lord of obstacles.',
  },
  {
    index: 3,
    name: 'Pranayama',
    description:
      'Sit erect. Inhale through left nostril (5×Om Bhuh), hold (5×), exhale through right (5×). Reverse next round.',
    mantra:
      'ॐ भूः । ॐ भुवः । ॐ सुवः । ॐ महः । ॐ जनः । ॐ तपः । ॐ सत्यम् । ॐ तत्सवितुर्वरेण्यं भर्गो देवस्य धीमहि धियो यो नः प्रचोदयात् । ॐ आपो ज्योति रसोऽमृतं ब्रह्म भूर्भुवः स्वरोम् ।',
    transliteration:
      'Om Bhuh · Om Bhuvah · Om Suvah · Om Mahah · Om Janah · Om Tapah · Om Satyam · Om Tat Savitur Varenyam Bhargo Devasya Dhimahi Dhiyo Yo Nah Pracodayat · Om Apo Jyoti Raso\'mritam Brahma Bhur Bhuvah Svar Om',
    meaning: 'Sapta-vyahriti and Gayatri with Apo-jyoti — purification of seven worlds.',
    count: '3 cycles',
  },
  {
    index: 4,
    name: 'Sankalpa',
    description:
      'Hold a small amount of water and akshat (rice) in right hand on left thigh. State the intention to perform sandhya.',
    mantra:
      '... अद्य ब्रह्मणः द्वितीय परार्धे श्वेत वराह कल्पे ... मम उपात्त समस्त दुरितक्षयद्वारा श्री परमेश्वर प्रीत्यर्थं प्रातः सन्ध्यां उपासिष्ये ।',
    transliteration:
      '... adya brahmaṇaḥ dvitīya parārdhe śveta varāha kalpe ... mama upātta samasta duritakṣayadvārā śrī parameśvara prītyarthaṃ prātaḥ sandhyāṃ upāsiṣye',
    meaning:
      'I now perform this Sandhya for the destruction of all sins and for the pleasure of the Supreme.',
  },
  {
    index: 5,
    name: 'Marjana',
    description:
      'Take a few drops of water in the right palm. Sprinkle on head, body, and around using kusha grass or fingers.',
    mantra:
      'ॐ आपोहिष्ठा मयोभुवस्तान ऊर्जे दधातन । महेरणाय चक्षसे । यो वः शिवतमो रसस्तस्य भाजयतेह नः । उशतीरिव मातरः । तस्मा अरङ्गमामवो यस्य क्षयाय जिन्वथ । आपो जनयथा च नः ।',
    transliteration:
      'Om Apo Hi-stha Mayo-bhuvah Tana Urje Dadhatana · Mahe-ranaya Cakshase · Yo Vah Sivatamo Rasah Tasya Bhajayateha Nah · Ushatiriva Matarah · Tasma Arangamamavo Yasya Kshayaya Jinvatha · Apo Janayatha Cha Nah',
    meaning:
      'O Waters, you are sources of bliss and strength. Grant us your most beneficent essence as mothers grant nourishment.',
  },
  {
    index: 6,
    name: 'Prashana (Aghamarshana)',
    description:
      'Take water in the right palm. Recite the mantra meditating on water as the destroyer of sins. Drink the water (or sprinkle in pratah/sayam).',
    mantra:
      'सूर्यश्च मा मन्युश्च मन्युपतयश्च मन्युकृतेभ्यः । पापेभ्यो रक्षन्ताम् । यद्रात्र्या पापमकार्षम् । मनसा वाचा हस्ताभ्याम् । पद्भ्यामुदरेण शिश्ना । रात्रिस्तदवलुम्पतु । यत्किञ्च दुरितं मयि । इदमहं माममृतयोनौ । सूर्ये ज्योतिषि जुहोमि स्वाहा ।',
    transliteration:
      'Suryaś-cha Mā Manyuś-cha Manyu-patayaś-cha Manyu-krtebhyaḥ · Pāpebhyo Rakṣantām · Yad Rātryā Pāpam-akārṣam · Manasā Vāchā Hastābhyām · Padbhyām-udareṇa Śiśnā · Rātris Tad Avalumpatu · Yat Kiñ-cha Duritam Mayi · Idam-aham Mām-amṛta-yonau · Sūrye Jyotiṣi Juhomi Svāhā',
    meaning:
      'May Surya, Manyu and the lords of anger protect me from sins. Whatever wrong I committed last night by mind, speech, hand, foot, belly — may the night carry it away. I offer all impurity to the immortal source — the radiant Sun.',
  },
  {
    index: 7,
    name: 'Punar Marjana',
    description: 'Sprinkle water again on body for second purification.',
    mantra:
      'ॐ दधि क्राव्णो अकारिषं । जिष्णोरश्वस्य वाजिनः । सुरभि नो मुखाकरत् । प्रण आयूंषि तारिषत् ।',
    transliteration:
      'Om Dadhi-Kravnno Akarisham · Jishnor-ashvasya Vajinah · Surabhi No Mukha-karat · Prana Ayumshi Tarisat',
    meaning:
      'I have praised the swift, victorious horse — may he make our mouths fragrant and prolong our lives.',
  },
  {
    index: 8,
    name: 'Argyapradana (Offering of Water)',
    description:
      'Stand. Take water with both palms joined (pranjali). Offer to the Sun while reciting Gayatri. Direction varies by sandhya.',
    mantra:
      'ॐ भूर्भुवः स्वः । तत्सवितुर्वरेण्यं भर्गो देवस्य धीमहि । धियो यो नः प्रचोदयात् ॥',
    transliteration:
      'Om Bhur Bhuvah Svah · Tat Savitur Varenyam Bhargo Devasya Dhimahi · Dhiyo Yo Nah Pracodayat',
    meaning: 'The Gayatri Mantra — invoking Savitr, the divine illuminator of intellect.',
    count: 'Pratah & Sayam: 3 times. Madhyahnika: 1 time.',
  },
  {
    index: 9,
    name: 'Prayaschitta Argya',
    description:
      'If sandhya was delayed, offer one extra arghya as atonement (only Pratah & Sayam).',
    mantra: 'ॐ भूर्भुवः स्वः । तत्सवितुर्वरेण्यं ... प्रचोदयात् ।',
    transliteration: 'Gayatri Mantra (1 time)',
  },
  {
    index: 10,
    name: 'Atma Pradakshina',
    description:
      'Turn around once clockwise (right) on yourself, saluting the Sun.',
    mantra: 'असावादित्यो ब्रह्म । ॐ तत्सत्ब्रह्मार्पणमस्तु ।',
    transliteration: 'Asav-Adityo Brahma · Om Tat Sat Brahma-arpanam Astu',
    meaning: 'That Sun is Brahman. May this offering reach the Supreme.',
  },
  {
    index: 11,
    name: 'Asanopa Veshana',
    description: 'Sit on a clean asana (cotton/kusha mat). Touch the asana with mantra.',
    mantra: 'ॐ पृथ्वि त्वया धृता लोका देवि त्वं विष्णुना धृता । त्वं च धारय मां नित्यं पवित्रं चासनं कुरु ॥',
    transliteration:
      'Om Prthvi Tvayā Dhṛtā Lokā Devi Tvaṃ Viṣṇunā Dhṛtā · Tvaṃ Cha Dhāraya Māṃ Nityaṃ Pavitraṃ Cha-asanaṃ Kuru',
    meaning:
      'O Earth Goddess, you support all worlds and are upheld by Vishnu. Support me here and make this seat sacred.',
  },
  {
    index: 12,
    name: 'Pranayama (second)',
    description: 'Repeat 3 cycles of pranayama with sapta-vyahriti and Gayatri.',
    mantra: 'ॐ भूः । ॐ भुवः । ॐ सुवः ... प्रचोदयात् । ॐ आपो ज्योति ...',
    transliteration: 'Same as step 3',
    count: '3 cycles',
  },
  {
    index: 13,
    name: 'Gayatri Avahanam',
    description:
      'Invoke Gayatri Devi. Show pranjali and dhyana mudras while saying the avahanam mantras.',
    mantra:
      'आयातु वरदा देवी अक्षरं ब्रह्म सम्मितम् । गायत्रीं छन्दसां मातेदं ब्रह्म जुषस्व नः ॥',
    transliteration:
      'Ayatu Varada Devi · Aksaraṃ Brahma Sammitam · Gāyatrīṃ Chandasāṃ Mātedaṃ Brahma Juṣasva Naḥ',
    meaning:
      'Come, O Goddess giver of boons, embodiment of imperishable Brahman. Mother of all metres, accept this Brahman.',
  },
  {
    index: 14,
    name: 'Gayatri Japa',
    description:
      'Sit facing east (pratah/madhyahnika) or north (sayam). Use right thumb on middle finger and rotate through joints to count, OR use a tulsi/rudraksha mala. Eyes half-closed, mind focused.',
    mantra:
      'ॐ भूर्भुवः स्वः । तत्सवितुर्वरेण्यं । भर्गो देवस्य धीमहि । धियो यो नः प्रचोदयात् ॥',
    transliteration:
      'Om Bhur Bhuvah Svah · Tat Savitur Varenyam · Bhargo Devasya Dhimahi · Dhiyo Yo Nah Pracodayat',
    meaning:
      "We meditate on the divine light of Savitr (Sun). May He inspire our intellect.",
    count: 'Minimum 10 · Recommended 28 or 108 · Best 1008',
  },
  {
    index: 15,
    name: 'Gayatri Visarjanam',
    description:
      'Send back Gayatri Devi after japa with pranjali.',
    mantra:
      'उत्तमे शिखरे देवी भूम्यां पर्वतमूर्धनि । ब्राह्मणेभ्योऽभ्यनुज्ञाता गच्छ देवि यथासुखम् ॥',
    transliteration:
      'Uttame Sikhare Devi · Bhumyāṃ Parvata-mūrdhani · Brāhmaṇebhyo\'bhyanujñātā · Gachha Devi Yathā-sukham',
    meaning:
      'O Goddess of the highest peak, dwelling on the mountain summits — depart now in peace, blessed by the wise.',
  },
  {
    index: 16,
    name: 'Surya / Devata Upasthanam',
    description:
      'Stand and face Surya. Offer prayers (different mantras for each sandhya).',
    mantra:
      'मित्रस्य चर्षणीधृतोऽवो देवस्य सानसि । द्युम्नं चित्रश्रवस्तमम् ॥ (Pratah)\nआ सत्येन रजसा वर्तमानो निवेशयन्नमृतं मर्त्यं च । हिरण्ययेन सविता रथेना देवो याति भुवनानि पश्यन् ॥ (Madhyahnika)\nइमं मे वरुण श्रुधी हवमद्या च मृडय । त्वामवस्युराचके ॥ (Sayam)',
    transliteration:
      'Pratah: Mitrasya Carshani-dhrto\'vo Devasya Sanasi · Dyumnam Citra-shravastamam\nMadhyahnika: A Satyena Rajasa Vartamano Niveshayann-amrtam Martyam Cha · Hiranyayena Savita Rathena Devo Yati Bhuvanani Pashyan\nSayam: Imam Me Varuna Shrudhi Havamadya Cha Mrdaya · Tvam-avasyur-acake',
  },
  {
    index: 17,
    name: 'Dik Devata Namaskara',
    description: 'Salute the deities of the 8 directions (E, SE, S, SW, W, NW, N, NE).',
    mantra: 'ॐ नमः प्राच्यै दिशे । ॐ नमो दक्षिणायै दिशे । ॐ नमः प्रतीच्यै दिशे । ॐ नमः उदीच्यै दिशे ।',
    transliteration:
      'Om Namah Prachyai Dishe (East) · Om Namo Dakshinayai Dishe (South) · Om Namah Pratichyai Dishe (West) · Om Namah Udichyai Dishe (North)',
  },
  {
    index: 18,
    name: 'Yama / Ancestor Tarpana',
    description:
      'Offer water to Yama and ancestors (Pitrs) — for blessings and forgiveness.',
    mantra: 'ॐ यमाय नमः । ॐ धर्मराजाय नमः । पितृभ्यो नमः ।',
    transliteration: 'Om Yamaya Namah · Om Dharmarajaya Namah · Pitrbhyo Namah',
  },
  {
    index: 19,
    name: 'Abhivadana',
    description:
      'State your gotra, sutra, shakha, and the rishis you descend from. End with namaskara to elders.',
    mantra:
      'अभिवादये ___ त्रयाऋषेय प्रवरान्वित ___ गोत्रः ___ सूत्रः ___ शाखाध्यायी श्री ___ शर्माहं भो अभिवादये ।',
    transliteration:
      'Abhivadaye ___ traya-rishaeya pravaranvita ___ gotrah ___ sutrah ___ shakha-adhyayi shri ___ sharma-aham bho abhivadaye',
    meaning: 'I salute, born in ___ gotra, of ___ sutra, of ___ shakha, named ___.',
  },
  {
    index: 20,
    name: 'Final Achamana',
    description: 'Sip water 3 times, touch limbs, conclude.',
    mantra: 'ॐ केशवाय स्वाहा । ॐ नारायणाय स्वाहा । ॐ माधवाय स्वाहा ।',
    transliteration:
      'Om Keshavaya svaha · Om Narayanaya svaha · Om Madhavaya svaha',
  },
];

export const RULES = [
  {
    id: 'bath',
    title: 'Bath / wash before starting',
    text: 'A full shower (snanam) is best — purifies body and mind. If short on time, hand-foot-face wash is enough. The intent is to begin clean.',
  },
  {
    id: 'clothes',
    title: 'Clean clothes',
    text: 'Wear freshly washed clothes — cotton or any natural fabric. White or saffron is traditional but not mandatory. Just clean and comfortable.',
  },
  {
    id: 'seat',
    title: 'Use a good seat — not bare ground',
    text: 'Sit on a chair, cushion, yoga mat, or cotton cloth. Avoid the bare floor — the earth tends to draw energy downward, making it harder to hold concentration during japa.',
  },
  {
    id: 'forehead',
    title: 'Forehead — Agnya Chakra',
    text: 'If you have tilak, kumkum, vibhuti or sandalwood, apply it on the forehead between the eyebrows. If not, simply rest your attention there — it is the Agnya Chakra (third eye), the seat of focus.',
  },
  {
    id: 'direction',
    title: 'Direction (helpful, not strict)',
    text: 'Traditionally: face East at Pratah/Madhyahnika, West at Sayam, North for Sayam japa. Helpful when possible — but not a strict rule. Wherever you are facing is fine if your space does not allow it.',
  },
  {
    id: 'silence',
    title: 'Mental silence',
    text: 'Step away from your phone, conversations and screens. If interrupted mid-ritual, take a sip of water (achamana) and continue from where you stopped.',
  },
  {
    id: 'timing',
    title: 'Timing windows',
    text: 'Pratah: ideally before sunrise. Madhyahnika: around solar noon (±30 min). Sayam: just after sunset, before stars appear. Do what fits your day — partial is better than skipped.',
  },
  {
    id: 'mind',
    title: 'Mental focus over speed',
    text: 'Quality of attention matters more than the number of repetitions. A slow, attentive mantra is worth a hundred mechanical ones. Withdraw mind from work / worry during the ritual.',
  },
  {
    id: 'water',
    title: 'Clean water',
    text: 'Filtered or clean tap water is fine for achamana and sprinkling. Refill the small vessel as needed. Don\'t reuse water you\'ve already touched to lips.',
  },
  {
    id: 'mala',
    title: 'Use any mala you have',
    text: 'Use the Japa tab in this app to count Gayatri repetitions, OR use a tulsi / rudraksha / sandalwood mala if you have one. Beadless finger-counting (rotating thumb on finger joints) is also valid.',
  },
];

export const PREREQUISITES = [
  'A bath, or face-hands-feet wash if short on time',
  'Rinse mouth with water (3 times)',
  'Clean clothes — cotton preferred, but anything fresh and dry works',
  'Tilak / kumkum / vibhuti on forehead if you have it — otherwise simply focus on the Agnya Chakra (forehead center)',
  'A good seat — chair, cushion, yoga mat, or cotton cloth (avoid sitting directly on bare ground)',
  'A small vessel of clean water for achamana and sprinkling',
  'Use the Japa tab to count, or any mala you already own',
  'A quiet space — silence your phone, step away from screens',
];
