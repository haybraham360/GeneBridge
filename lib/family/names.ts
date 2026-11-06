/**
 * Word lists for name masking (lib/family/mask.ts). Common given names in
 * the UAE and Gulf, in Latin and Arabic script, plus kinship and function
 * words that are never names. Lists are a first check; the contextual
 * check in mask.ts catches names that aren't listed ("my cousin Zubair").
 */

const latinNames = `
ahmed ahmad mohammed mohammad muhammad mohamed mohamad hamad hamed hamdan ali omar umar khalid khaled saeed said saad rashid rashed
sultan abdullah abdulla abdulrahman abdulaziz abdelrahman yousef yousif yusuf youssef ibrahim ismail hassan hasan hussain hussein husain
hamza faisal majid majed mansour mansoor nasser naser salem saleh salah saif saud tariq tarek zayed jassim jasim mubarak obaid ubaid
adel fahad fahd bilal karim kareem mahmoud mahmood mustafa mostafa ziad zayd waleed walid hadi imran rami sami tamer anas ayman bader
badr essa eisa juma jumaa marwan nabil rayan salman suhail sohail zubair humaid hamid hamid ghanem ghanim khalifa mohsen muhsin
nawaf thani thamer abdulkarim abdulwahab yaqoub yacoub haroun harun qasim kasim hashim hisham murad nizar osama usama raed riyad
mariam maryam miriam fatima fatma fatimah noura nora nura noor nour huda aisha ayesha aysha khadija khadeeja zainab zaynab amna amina
mona muna layla leila laila lyla sara sarah hessa hissa shamma shaikha sheikha mouza moza maitha alia aliya alya reem rim dana hind
latifa lubna asma asmaa hana hanan salma samira yasmin yasmeen jamila rania dalia rawan ghada nadia najla wafa afra mahra meera hala
safa marwa iman eman rana ruqaya ruqayya sumaya sumayya khawla noof nouf bushra shaima shaimaa hajar hagar nadine yara lina lulwa
fadia nawal suad souad abeer ameera amira jawaher maha manal mai may hamda wadha wadhha shaikhah ohood ohoud azza basma dima farah
john james david michael robert william thomas daniel matthew joseph peter paul george richard mark steven andrew kevin brian
mary maria anna emma olivia sophia susan linda elizabeth jennifer patricia jessica karen nancy lisa sandra emily rachel priya anjali
rahul raj ravi arjun amit sunil anil deepak suresh ramesh maria jose juan carlos luis ana rosa marie
`;

/** Latin names that are also everyday English words: only masked when capitalised. */
export const ambiguousLatin = new Set(['will', 'may', 'mark', 'hope', 'grace', 'faith', 'rose', 'june', 'dawn', 'bill', 'said', 'ana', 'rim', 'mai']);

const arabicNames = `
أحمد احمد محمد حمد حامد حمدان علي عمر خالد سعيد سعد راشد سلطان عبدالله عبدالرحمن عبدالعزيز يوسف إبراهيم ابراهيم إسماعيل اسماعيل
حسن حسين حمزة فيصل ماجد منصور ناصر سالم صالح صلاح سيف سعود طارق زايد جاسم مبارك عبيد عادل فهد بلال كريم محمود مصطفى زياد وليد
هادي عمران رامي سامي أنس انس أيمن ايمن بدر عيسى جمعة مروان نبيل ريان سلمان سهيل زبير حميد غانم خليفة محسن نواف ثاني ثامر يعقوب
هارون قاسم هاشم هشام مراد نزار أسامة اسامة رائد رياض
مريم فاطمة نورة نورا نور هدى عائشة عايشة خديجة زينب آمنة امنة منى ليلى سارة حصة شمة شيخة موزة ميثاء علياء ريم دانة هند لطيفة
لبنى أسماء اسماء هناء حنان سلمى سميرة ياسمين جميلة رانيا داليا روان غادة نادية نجلاء وفاء عفراء مهرة ميرة هالة صفاء مروة إيمان
ايمان رنا رقية سمية خولة نوف بشرى شيماء هاجر نادين يارا لينا لولوة فادية نوال سعاد عبير أميرة اميرة جواهر مها منال مي حمدة وضحى
عهود عزة بسمة ديما فرح
`;

export const nameList: ReadonlySet<string> = new Set(
  [...latinNames.split(/\s+/), ...arabicNames.split(/\s+/)].map((w) => w.trim()).filter(Boolean),
);

/** Kinship words in English: a capitalised word after one of these is probably a name. */
export const englishKinship = new Set([
  'father', 'dad', 'daddy', 'mother', 'mum', 'mom', 'mama', 'mummy', 'parent', 'parents', 'brother', 'sister', 'sibling', 'siblings',
  'son', 'daughter', 'child', 'children', 'kids', 'husband', 'wife', 'partner', 'spouse', 'fiance', 'fiancé', 'fiancee', 'fiancée',
  'uncle', 'aunt', 'auntie', 'aunty', 'cousin', 'cousins', 'nephew', 'niece', 'grandfather', 'grandmother', 'grandpa', 'grandma',
  'granny', 'grandparent', 'grandparents', 'grandson', 'granddaughter', 'grandchild', 'stepfather', 'stepmother', 'in-law',
  'father-in-law', 'mother-in-law', 'brother-in-law', 'sister-in-law',
]);

/** Capitalised words that are never names (start of sentence, conditions, pronouns). */
export const englishNotNames = new Set([
  'i', 'my', 'me', 'he', 'she', 'they', 'his', 'her', 'their', 'our', 'we', 'you', 'the', 'a', 'an', 'and', 'but', 'or', 'also', 'who',
  'has', 'had', 'have', 'is', 'was', 'are', 'were', 'not', 'sure', 'maybe', 'yes', 'no', 'mr', 'mrs', 'ms', 'dr', 'side', 'family',
  'cf', 'sma', 'pku', 'g6pd', 'gjb2', 'hbs', 'thalassemia', 'thalassaemia', 'beta', 'alpha', 'sickle', 'cell', 'disease', 'cystic',
  'fibrosis', 'carrier', 'deaf', 'ignore', 'none', 'unknown', 'both', 'one', 'two', 'three', 'god', 'allah', 'arabic', 'english',
  ...englishKinship,
]);

/** Arabic kinship and function words: never names, even straight after a kinship word. */
export const arabicNotNames = new Set([
  'أب', 'اب', 'أبي', 'ابي', 'أبوي', 'ابوي', 'أبو', 'ابو', 'والدي', 'والدتي', 'أم', 'ام', 'أمي', 'امي', 'أخ', 'اخ', 'أخي', 'اخي', 'أخوي',
  'اخوي', 'أخت', 'اخت', 'أختي', 'اختي', 'ابن', 'إبن', 'ابني', 'بنت', 'بنتي', 'ابنتي', 'ولد', 'ولدي', 'عم', 'عمي', 'عمة', 'عمتي', 'خال',
  'خالي', 'خالة', 'خالتي', 'جد', 'جدي', 'جدة', 'جدتي', 'زوج', 'زوجي', 'زوجة', 'زوجتي', 'حفيد', 'حفيدي', 'حفيدة', 'أولاد', 'اولاد',
  'عنده', 'عندها', 'عندهم', 'كان', 'كانت', 'هو', 'هي', 'هم', 'اسمه', 'اسمها', 'من', 'في', 'على', 'عن', 'مع', 'و', 'أو', 'او', 'لكن',
  'يمكن', 'ربما', 'مش', 'مو', 'متأكد', 'متأكدة', 'حامل', 'مرض', 'مريض', 'مريضة', 'ثلاسيميا', 'الثلاسيميا', 'أنيميا', 'انيميا',
  'منجلي', 'المنجلي', 'مشاكل', 'مشكلة', 'السمع', 'أصم', 'اصم', 'حامل', 'لا', 'نعم', 'الله', 'الأب', 'الأم', 'ناقل', 'ناقلة',
  'جهة', 'طرف', 'أهل', 'اهل', 'عائلتي', 'عيلتي', 'أخوه', 'اخوه', 'أخته', 'اخته', 'ولده', 'بنته', 'ابنه', 'ابنها', 'بنتها', 'زوجها',
  'زوجته', 'أبوه', 'ابوه', 'أمه', 'امه', 'الكبير', 'الصغير', 'الكبيرة', 'الصغيرة', 'الله', 'يرحمه', 'يرحمها', 'رحمه', 'رحمها',
  // Words that often follow a kinship word but describe, not name: "عمتي حاملة …", "أخي مصاب …".
  'حاملة', 'حاملين', 'ناقلين', 'مصاب', 'مصابة', 'مصابين', 'يعاني', 'تعاني', 'عانى', 'عانت', 'توفي', 'توفيت', 'متوفى', 'متوفية',
  'عمره', 'عمرها', 'صغير', 'كبير', 'صغيرة', 'كبيرة', 'أيضا', 'ايضا', 'أيضًا', 'كذلك', 'برضو', 'بعد', 'قبل', 'الآن', 'الان',
  'ولد', 'بنت', 'عندي', 'لديه', 'لديها', 'فيه', 'فيها', 'سوى', 'غير', 'كل', 'هذا', 'هذه', 'ذلك', 'التي', 'الذي', 'اللي',
  'أصم', 'صماء', 'أعمى', 'عمياء', 'تزوج', 'تزوجت', 'متزوج', 'متزوجة', 'يسكن', 'تسكن', 'يعيش', 'تعيش',
]);

/** Arabic kinship words after which the next word is probably a name ("عمي سعيد"). */
export const arabicKinship = new Set([
  'أبي', 'ابي', 'أبوي', 'ابوي', 'والدي', 'أمي', 'امي', 'والدتي', 'أخي', 'اخي', 'أخوي', 'اخوي', 'أختي', 'اختي', 'ابني', 'بنتي', 'ابنتي',
  'ولدي', 'عمي', 'عمتي', 'خالي', 'خالتي', 'جدي', 'جدتي', 'زوجي', 'زوجتي', 'حفيدي', 'حفيدتي', 'اسمه', 'اسمها', 'عمه', 'خاله', 'أخوه',
  'اخوه', 'أخته', 'اخته', 'ولده', 'ابنه', 'بنته', 'ابنها', 'بنتها', 'زوجها', 'زوجته',
]);
