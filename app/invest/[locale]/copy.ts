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
  marketTitle: string;
  marketIntro: string;
  marketPoints: string[];
  galleryTitle: string;
  formTitle: string;
  formSubtitle: string;
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
    metaTitle: 'AT Sevilla — Oportunidad de inversión en Nervión, Sevilla | Grupo YAKGU',
    metaDescription:
      'Aparthotel premium de 18 apartamentos turísticos en el corazón de Nervión, Sevilla. Licencia y permisos concedidos. Inversión lista para iniciar obra.',
    languageLabel: 'Idioma',
    languageNames: { es: 'Español', en: 'English', he: 'עברית' },
    eyebrow: 'Grupo YAKGU presenta',
    headline: 'AT Sevilla — Apartamentos Turísticos Sevilla',
    subheadline:
      'Un aparthotel premium de 18 apartamentos turísticos en Nervión, uno de los distritos con mayor crecimiento hotelero de Sevilla. Todos los permisos concedidos: la obra puede iniciarse de inmediato.',
    ctaPrimary: 'Quiero recibir información para inversores',
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
      'Déjenos sus datos y le enviaremos el dossier de inversión y las condiciones de participación en AT Sevilla.',
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
    metaTitle: 'AT Sevilla — Investment Opportunity in Nervión, Seville | Grupo YAKGU',
    metaDescription:
      'A premium 18-unit aparthotel in the heart of Nervión, Seville. Fully permitted — construction ready to begin immediately.',
    languageLabel: 'Language',
    languageNames: { es: 'Español', en: 'English', he: 'עברית' },
    eyebrow: 'Grupo YAKGU presents',
    headline: 'AT Sevilla — Apartamentos Turísticos Sevilla',
    subheadline:
      'A premium 18-unit tourist aparthotel in Nervión, one of Seville’s fastest-growing hospitality districts. Fully permitted — construction can begin immediately.',
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
    formSubtitle: 'Leave your details and we’ll send you the investment dossier and terms of participation in AT Sevilla.',
    nameLabel: 'Full name',
    namePlaceholder: 'Your name',
    emailLabel: 'Email address',
    emailPlaceholder: 'name@company.com',
    mobileLabel: 'Mobile number',
    mobilePlaceholder: '+1 555 000 0000',
    submit: 'Submit request',
    submitting: 'Submitting…',
    successTitle: 'Thank you',
    successBody: 'We’ve received your request. A member of our team will be in touch shortly.',
    errorGeneric: 'Something went wrong. Please try again.',
    errorRequired: 'Please fill in all fields.',
    errorEmail: 'Please enter a valid email address.',
    privacyNote: 'Your details are used only to contact you about this investment opportunity.',
    footerLine: 'Grupo YAKGU — Real estate developer focused on the hotel and hospitality ecosystem, Spain.',
  },
  he: {
    dir: 'rtl',
    htmlLang: 'he',
    metaTitle: 'AT Sevilla — הזדמנות השקעה בשכונת נרביון, סביליה | Grupo YAKGU',
    metaDescription:
      'אפרטהוטל יוקרתי בן 18 יחידות בלב שכונת נרביון בסביליה. כל ההיתרים אושרו — ניתן להתחיל בבנייה באופן מיידי.',
    languageLabel: 'שפה',
    languageNames: { es: 'Español', en: 'English', he: 'עברית' },
    eyebrow: 'Grupo YAKGU מציגה',
    headline: 'AT Sevilla — Apartamentos Turísticos Sevilla',
    subheadline:
      'אפרטהוטל יוקרתי בן 18 דירות נופש בשכונת נרביון, אחת השכונות הצומחות ביותר בתחום האירוח בסביליה. כל ההיתרים אושרו — ניתן להתחיל בבנייה באופן מיידי.',
    ctaPrimary: 'אני מעוניין/ת לקבל מידע למשקיעים',
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
    formSubtitle: 'השאירו פרטים ואנו נשלח לכם את חוברת ההשקעה ואת תנאי ההשתתפות בפרויקט AT Sevilla.',
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
