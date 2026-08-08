export type Locale = 'es' | 'en' | 'he';
export const LOCALES: Locale[] = ['es', 'en', 'he'];
export const DEFAULT_LOCALE: Locale = 'es';

export interface InvestCopy {
  dir: 'ltr' | 'rtl';
  htmlLang: string;
  metaTitle: string;
  metaDescription: string;
  languageLabel: string;
  languageNames: Record<Locale, string>;
  eyebrow: string;
  headline: string;
  subheadline: string;
  ctaPrimary: string;
  highlightsTitle: string;
  highlights: { title: string; body: string }[];
  aboutTitle: string;
  aboutBody: string[];
  aboutStats: { value: string; label: string }[];
  marketTitle: string;
  marketIntro: string;
  marketPoints: string[];
  galleryTitle: string;
  formTitle: string;
  formSubtitle: string;
  investorTypeLabel: string;
  investorTypePlaceholder: string;
  investorTypeOptions: { value: string; label: string }[];
  nameLabel: string;
  namePlaceholder: string;
  emailLabel: string;
  emailPlaceholder: string;
  mobileLabel: string;
  mobilePlaceholder: string;
  submit: string;
  submitting: string;
  successTitle: string;
  successBody: string;
  errorGeneric: string;
  errorRequired: string;
  errorEmail: string;
  privacyNote: string;
  footerLine: string;
}

export const COPY: Record<Locale, InvestCopy> = {
  es: {
    dir: 'ltr',
    htmlLang: 'es',
    metaTitle: 'BDS36 — Oportunidad de inversión en Nervión, Sevilla | Grupo YAKGU',
    metaDescription:
      'Aparthotel premium de 18 apartamentos turísticos en el corazón de Nervión, Sevilla. Licencia y permisos concedidos. Inversión lista para iniciar obra.',
    languageLabel: 'Idioma',
    languageNames: { es: 'Español', en: 'English', he: 'עברית' },
    eyebrow: 'Grupo YAKGU · Proyecto BDS36',
    headline: 'BDS36 — Nervión, Sevilla',
    subheadline:
      'Llevamos más de una década desarrollando activos hoteleros en España. BDS36 es nuestra próxima oportunidad: un aparthotel premium de 18 unidades en Nervión, el distrito de Sevilla que está redefiniendo el turismo urbano de alta gama. Licencia concedida. Construcción lista para iniciar.',
    ctaPrimary: 'Solicitar información para inversores',
    highlightsTitle: 'La oportunidad',
    highlights: [
      {
        title: '18 apartamentos turísticos premium',
        body: 'Activo hotelero llave en mano, diseñado para el segmento de viajero exigente.',
      },
      {
        title: 'Ubicación estratégica en Nervión',
        body: 'Distrito de Sevilla en plena transformación hacia un destino hostelero de referencia.',
      },
      {
        title: 'Listo para construir',
        body: 'Licencia de obra y permisos ya concedidos. Sin riesgo de tramitación: la construcción puede comenzar de inmediato.',
      },
      {
        title: 'Oportunidad limitada',
        body: 'Proyecto dirigido a inversores profesionales — family offices, HNWIs y firmas de inversión hotelera.',
      },
    ],
    aboutTitle: 'Quiénes somos',
    aboutBody: [
      'Grupo YAKGU es una promotora inmobiliaria especializada en el desarrollo de activos hoteleros y de uso mixto en España. Fundada con el propósito de identificar oportunidades en mercados infraservidos, combinamos la visión inversora con la ejecución técnica en cada proyecto.',
      'Nuestro equipo ha gestionado el ciclo completo del desarrollo inmobiliario: desde la identificación del activo y la obtención de licencias hasta la dirección de obra y la puesta en valor del activo. Operamos con capital propio y de co-inversores seleccionados, con quienes construimos relaciones a largo plazo basadas en la transparencia y el rendimiento.',
    ],
    aboutStats: [
      { value: '+10', label: 'Años de experiencia' },
      { value: '18', label: 'Unidades en BDS36' },
      { value: '100%', label: 'Licencias concedidas' },
      { value: 'Nervión', label: 'Ubicación prime en Sevilla' },
    ],
    marketTitle: 'Por qué Nervión',
    marketIntro:
      'Nervión está dejando de ser un distrito puramente comercial para convertirse en un destino hostelero de uso mixto:',
    marketPoints: [
      'Grupo Insur inicia la construcción de un nuevo hotel de 4 estrellas en Nervión.',
      'El Corte Inglés transforma su emblemático edificio en un hotel de 10 plantas.',
      'Katégora ha iniciado la construcción de un nuevo aparthotel en la zona.',
      'Urbanitae completó con éxito el crowdfunding de un proyecto hostelero en Nervión.',
      'El distrito sumará más de 44 nuevas plazas de alojamiento turístico.',
    ],
    galleryTitle: 'El proyecto',
    formTitle: 'Hable con nosotros',
    formSubtitle:
      'Déjenos sus datos y le enviaremos el dossier de inversión y las condiciones de participación en BDS36.',
    investorTypeLabel: 'Perfil de inversor (opcional)',
    investorTypePlaceholder: 'Seleccione su perfil',
    investorTypeOptions: [
      { value: 'family_office', label: 'Family office' },
      { value: 'hnwi', label: 'Inversor privado (HNWI)' },
      { value: 'fund', label: 'Fondo de inversión' },
      { value: 'other', label: 'Otro' },
    ],
    nameLabel: 'Nombre completo',
    namePlaceholder: 'Su nombre',
    emailLabel: 'Correo electrónico',
    emailPlaceholder: 'nombre@empresa.com',
    mobileLabel: 'Teléfono móvil',
    mobilePlaceholder: '+34 600 000 000',
    submit: 'Enviar solicitud',
    submitting: 'Enviando…',
    successTitle: 'Gracias',
    successBody: 'Hemos recibido su solicitud. Un miembro de nuestro equipo se pondrá en contacto con usted en breve.',
    errorGeneric: 'Ha ocurrido un error. Por favor, inténtelo de nuevo.',
    errorRequired: 'Por favor, complete todos los campos.',
    errorEmail: 'Introduzca un correo electrónico válido.',
    privacyNote: 'Sus datos se utilizan únicamente para contactarle sobre esta oportunidad de inversión.',
    footerLine: 'Grupo YAKGU — Desarrollador inmobiliario especializado en el ecosistema hotelero, España.',
  },
  en: {
    dir: 'ltr',
    htmlLang: 'en',
    metaTitle: 'BDS36 — Investment Opportunity in Nervión, Seville | Grupo YAKGU',
    metaDescription:
      'A premium 18-unit aparthotel in the heart of Nervión, Seville. Fully permitted — construction ready to begin immediately.',
    languageLabel: 'Language',
    languageNames: { es: 'Español', en: 'English', he: 'עברית' },
    eyebrow: 'Grupo YAKGU · BDS36 Project',
    headline: 'BDS36 — Nervión, Sevilla',
    subheadline:
      'We have spent over a decade developing hospitality assets across Spain. BDS36 is our next opportunity: a premium 18-unit aparthotel in Nervión, the Seville district redefining upscale urban tourism. Fully permitted. Ready to build.',
    ctaPrimary: 'Request investor information',
    highlightsTitle: 'The opportunity',
    highlights: [
      {
        title: '18 premium tourist apartments',
        body: 'A turnkey hospitality asset designed for the discerning traveler segment.',
      },
      {
        title: 'Strategic Nervión location',
        body: 'A Seville district in active transformation into a leading hospitality destination.',
      },
      {
        title: 'Construction-ready',
        body: 'Building permit and development license already in place — no entitlement risk, construction can begin immediately.',
      },
      {
        title: 'Limited opportunity',
        body: 'Aimed at professional investors — family offices, HNWIs, and hospitality-focused investment firms.',
      },
    ],
    aboutTitle: 'Who we are',
    aboutBody: [
      'Grupo YAKGU is a real estate developer specialising in hospitality and mixed-use assets across Spain. Founded to identify opportunities in underserved markets, we combine investment vision with hands-on technical execution on every project.',
      'Our team has managed the full development cycle — from asset identification and permitting through construction management and value realisation. We operate with our own capital alongside a select group of co-investors, with whom we build long-term relationships grounded in transparency and performance.',
    ],
    aboutStats: [
      { value: '10+', label: 'Years of experience' },
      { value: '18', label: 'Units in BDS36' },
      { value: '100%', label: 'Permits secured' },
      { value: 'Nervión', label: 'Prime Seville location' },
    ],
    marketTitle: 'Why Nervión',
    marketIntro: 'Nervión is transitioning from a purely commercial district into a mixed-use hospitality destination:',
    marketPoints: [
      'Grupo Insur is breaking ground on a new 4-star hotel in Nervión.',
      'El Corte Inglés is converting its landmark building into a 10-floor hotel.',
      'Katégora has started construction of a new aparthotel in the area.',
      'Urbanitae successfully crowdfunded a hospitality project in Nervión.',
      'The district will add 44+ new tourist accommodation units.',
    ],
    galleryTitle: 'The project',
    formTitle: 'Talk to us',
    formSubtitle: 'Leave your details and we'll send you the investment dossier and terms of participation in BDS36.',
    investorTypeLabel: 'Investor type (optional)',
    investorTypePlaceholder: 'Select your profile',
    investorTypeOptions: [
      { value: 'family_office', label: 'Family office' },
      { value: 'hnwi', label: 'Private investor (HNWI)' },
      { value: 'fund', label: 'Investment fund' },
      { value: 'other', label: 'Other' },
    ],
    nameLabel: 'Full name',
    namePlaceholder: 'Your name',
    emailLabel: 'Email address',
    emailPlaceholder: 'name@company.com',
    mobileLabel: 'Mobile number',
    mobilePlaceholder: '+1 555 000 0000',
    submit: 'Submit request',
    submitting: 'Submitting…',
    successTitle: 'Thank you',
    successBody: 'We've received your request. A member of our team will be in touch shortly.',
    errorGeneric: 'Something went wrong. Please try again.',
    errorRequired: 'Please fill in all fields.',
    errorEmail: 'Please enter a valid email address.',
    privacyNote: 'Your details are used only to contact you about this investment opportunity.',
    footerLine: 'Grupo YAKGU — Real estate developer focused on the hotel and hospitality ecosystem, Spain.',
  },
  he: {
    dir: 'rtl',
    htmlLang: 'he',
    metaTitle: 'BDS36 — הזדמנות השקעה בשכונת נרביון, סביליה | Grupo YAKGU',
    metaDescription:
      'אפרטהוטל יוקרתי בן 18 יחידות בלב שכונת נרביון בסביליה. כל ההיתרים אושרו — ניתן להתחיל בבנייה באופן מיידי.',
    languageLabel: 'שפה',
    languageNames: { es: 'Español', en: 'English', he: 'עברית' },
    eyebrow: 'Grupo YAKGU · פרויקט BDS36',
    headline: 'BDS36 — נרביון, סביליה',
    subheadline:
      'במשך למעלה מעשור אנו מפתחים נכסי אירוח בספרד. BDS36 הוא ההזדמנות הבאה שלנו: אפרטהוטל יוקרתי בן 18 יחידות בנרביון, השכונה בסביליה שמגדירה מחדש את התיירות העירונית היוקרתית. כל ההיתרים אושרו. מוכן לבנייה.',
    ctaPrimary: 'בקשת מידע למשקיעים',
    highlightsTitle: 'ההזדמנות',
    highlights: [
      {
        title: '18 דירות נופש יוקרתיות',
        body: 'נכס אירוח מוכן להפעלה, המיועד לנוסע התובעני.',
      },
      {
        title: 'מיקום אסטרטגי בנרביון',
        body: 'שכונה בסביליה העוברת שינוי לכיוון יעד אירוח מוביל.',
      },
      {
        title: 'מוכן לבנייה',
        body: 'היתר הבנייה וכל האישורים כבר אושרו — ללא סיכון רגולטורי, ניתן להתחיל בבנייה באופן מיידי.',
      },
      {
        title: 'הזדמנות מוגבלת',
        body: 'הפרויקט מיועד למשקיעים מקצועיים — משרדי משפחה, משקיעים פרטיים בעלי הון גבוה וגופי השקעה בתחום האירוח.',
      },
    ],
    aboutTitle: 'מי אנחנו',
    aboutBody: [
      'Grupo YAKGU היא חברת פיתוח נדל"ן המתמחה בנכסי אירוח ושימוש מעורב בספרד. הוקמה במטרה לזהות הזדמנויות בשווקים עם היצע חסר, ואנו משלבים חזון השקעתי עם ביצוע טכני מעשי בכל פרויקט.',
      'הצוות שלנו ניהל את מחזור הפיתוח המלא — מזיהוי הנכס והשגת ההיתרים ועד ניהול הבנייה ומימוש הערך. אנו פועלים עם הון עצמי לצד קבוצה נבחרת של שותפי השקעה, עמם אנו בונים קשרים ארוכי טווח המבוססים על שקיפות וביצועים.',
    ],
    aboutStats: [
      { value: '+10', label: 'שנות ניסיון' },
      { value: '18', label: 'יחידות ב-BDS36' },
      { value: '100%', label: 'היתרים אושרו' },
      { value: 'נרביון', label: 'מיקום פריים בסביליה' },
    ],
    marketTitle: 'למה נרביון',
    marketIntro: 'שכונת נרביון עוברת שינוי ממרכז מסחרי טהור לכיוון יעד אירוח מעורב שימושים:',
    marketPoints: [
      'קבוצת Grupo Insur פותחת בבניית מלון 4 כוכבים חדש בנרביון.',
      'רשת El Corte Inglés הופכת את הבניין האייקוני שלה למלון בן 10 קומות.',
      'חברת Katégora החלה בבניית אפרטהוטל חדש באזור.',
      'פלטפורמת Urbanitae השלימה בהצלחה מימון המונים לפרויקט אירוח בנרביון.',
      'השכונה תוסיף למעלה מ-44 יחידות אירוח נופש חדשות.',
    ],
    galleryTitle: 'הפרויקט',
    formTitle: 'דברו איתנו',
    formSubtitle: 'השאירו פרטים ואנו נשלח לכם את חוברת ההשקעה ואת תנאי ההשתתפות בפרויקט BDS36.',
    investorTypeLabel: 'סוג משקיע (אופציונלי)',
    investorTypePlaceholder: 'בחרו את הפרופיל שלכם',
    investorTypeOptions: [
      { value: 'family_office', label: 'משרד משפחה' },
      { value: 'hnwi', label: 'משקיע פרטי (HNWI)' },
      { value: 'fund', label: 'קרן השקעות' },
      { value: 'other', label: 'אחר' },
    ],
    nameLabel: 'שם מלא',
    namePlaceholder: 'השם שלך',
    emailLabel: 'כתובת אימייל',
    emailPlaceholder: 'name@company.com',
    mobileLabel: 'מספר נייד',
    mobilePlaceholder: '+972 50 000 0000',
    submit: 'שליחת בקשה',
    submitting: 'שולח…',
    successTitle: 'תודה',
    successBody: 'קיבלנו את בקשתכם. נציג מטעמנו ייצור איתכם קשר בהקדם.',
    errorGeneric: 'משהו השתבש. נסו שוב.',
    errorRequired: 'נא למלא את כל השדות.',
    errorEmail: 'נא להזין כתובת אימייל תקינה.',
    privacyNote: 'הפרטים ישמשו אך ורק ליצירת קשר בנוגע להזדמנות השקעה זו.',
    footerLine: 'Grupo YAKGU — יזם נדל"ן המתמחה באקוסיסטם המלונאות והאירוח, ספרד.',
  },
};
