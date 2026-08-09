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
    metaTitle: 'BDS36 — Una inversión hotelera boutique en Nervión, Sevilla | Grupo YAKGU',
    metaDescription:
      'Aparthotel boutique de 18 unidades con licencia concedida y listo para construir en Nervión, Sevilla. Co-inversión directa junto al promotor.',
    languageLabel: 'Idioma',
    languageNames: { es: 'Español', en: 'English', he: 'עברית' },
    eyebrow: 'Grupo YAKGU · Promotor inmobiliario hotelero · España',
    headline: 'BDS36 — Nervión, Sevilla',
    subheadline:
      'Aparthotel boutique en Nervión, Sevilla — permisos concedidos, co-inversión abierta a un grupo selecto de inversores.',
    ctaPrimary: 'Solicitar el dossier de inversión',
    highlightsTitle: 'La oportunidad',
    highlights: [
      {
        title: '18 apartamentos turísticos boutique',
        body: 'Activo hotelero con licencia concedida y listo para construir en uno de los mercados de alojamiento de corta estancia con mayor crecimiento en España.',
      },
      {
        title: 'Nervión: la próxima dirección de Sevilla',
        body: 'Un distrito en plena transformación, que atrae a grandes marcas hoteleras y genera altas tasas de ocupación para quienes se posicionan antes.',
      },
      {
        title: 'Sin riesgo de tramitación',
        body: 'Licencia de obra concedida. Sin esperas, sin incertidumbre. La construcción comienza cuando cerremos el grupo de inversores.',
      },
      {
        title: 'Co-inversión selecta',
        body: 'No es un fondo ni un crowdfunding. Es una participación directa en un activo único y tangible junto al promotor. Sencillo, transparente, acotado.',
      },
    ],
    aboutTitle: 'Quiénes somos',
    aboutBody: [
      'Somos un equipo pequeño y especializado de promotores inmobiliarios con muchos años desarrollando activos hoteleros y de alojamiento en España. No somos un fondo ni una plataforma. Desarrollamos, construimos, e invitamos a un número reducido de co-inversores a participar junto a nosotros en cada proyecto.',
      'En BDS36 ya hemos hecho el trabajo difícil: identificamos el activo, gestionamos el planeamiento y obtuvimos las licencias. Lo que buscamos ahora es el grupo adecuado de co-inversores para llevarlo a buen puerto. Mantenemos el círculo pequeño de forma deliberada: menos socios, mejor alineación, retornos más transparentes.',
    ],
    aboutStats: [
      { value: 'Muchos años', label: 'desarrollando activos hoteleros en España' },
      { value: '18', label: 'unidades boutique — diseñadas para el mercado de estancia corta' },
      { value: '100%', label: 'licencias concedidas — sin riesgo de tramitación' },
      { value: 'Nervión', label: 'el distrito hostelero emergente de Sevilla' },
    ],
    marketTitle: 'Por qué Nervión',
    marketIntro: 'Nervión no es una especulación — ya está en movimiento. Estos son los proyectos que lo confirman:',
    marketPoints: [
      'Grupo Insur inicia la construcción de un nuevo hotel de 4 estrellas en Nervión.',
      'El Corte Inglés transforma su emblemático edificio en un hotel de 10 plantas.',
      'Katégora ha iniciado la construcción de un nuevo aparthotel en la zona.',
      'Urbanitae completó con éxito el crowdfunding de un proyecto hostelero en Nervión.',
      'El distrito sumará más de 44 nuevas plazas de alojamiento turístico.',
    ],
    galleryTitle: 'El proyecto',
    formTitle: 'SOLICITA ACCESO',
    formSubtitle:
      'Déjanos tus datos y te enviamos el dossier completo: proyecto, estructura financiera y condiciones de participación.',
    investorTypeLabel: 'Perfil de inversor (opcional)',
    investorTypePlaceholder: 'Seleccione su perfil',
    investorTypeOptions: [
      { value: 'individual', label: 'Inversor particular' },
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
    submit: 'Enviarme el pack de inversión',
    submitting: 'Enviando…',
    successTitle: 'En camino.',
    successBody:
      'Revise su bandeja de entrada — el pack de inversión llegará en breve. Si prefiere hablar con alguien ahora, responda a ese correo.',
    errorGeneric: 'Ha ocurrido un error. Por favor, inténtelo de nuevo.',
    errorRequired: 'Por favor, complete todos los campos.',
    errorEmail: 'Introduzca un correo electrónico válido.',
    privacyNote: 'Sus datos se utilizan únicamente para contactarle sobre esta oportunidad de inversión.',
    footerLine: 'Grupo YAKGU — Desarrollador inmobiliario especializado en el ecosistema hotelero, España.',
  },
  en: {
    dir: 'ltr',
    htmlLang: 'en',
    metaTitle: 'BDS36 — A boutique hotel investment in Nervión, Seville | Grupo YAKGU',
    metaDescription:
      'A fully permitted, ready-to-build 18-unit boutique aparthotel in Nervión, Seville. A direct co-investment opportunity alongside the developer.',
    languageLabel: 'Language',
    languageNames: { es: 'Español', en: 'English', he: 'עברית' },
    eyebrow: 'Grupo YAKGU · Hospitality Real Estate Developer · Spain',
    headline: 'BDS36 — Nervión, Sevilla',
    subheadline:
      'Boutique aparthotel in Nervión, Seville — fully permitted, co-investment open to a select group of investors.',
    ctaPrimary: 'Get the investment dossier',
    highlightsTitle: 'The opportunity',
    highlights: [
      {
        title: '18 boutique tourist apartments',
        body: "A fully permitted, ready-to-build hospitality asset in one of Spain's fastest-rising short-stay markets.",
      },
      {
        title: "Nervión: Seville's next address",
        body: 'A district mid-transformation, attracting major hotel brands and delivering strong occupancy for early movers.',
      },
      {
        title: 'Zero permit risk',
        body: 'Building licence secured. No waiting, no uncertainty. Construction starts when we close.',
      },
      {
        title: 'A select co-investment',
        body: 'Not a fund, not a crowdfund. A direct stake in a single, tangible asset alongside the developer. Simple, transparent, finite.',
      },
    ],
    aboutTitle: 'Who we are',
    aboutBody: [
      'We are a small, focused team of real estate developers who have spent many years building hotels and hospitality assets in Spain. Not a fund. Not a platform. We develop, we build, and we invite a small number of co-investors to participate alongside us in each project.',
      'With BDS36 we have done the hard work already — sourced the site, navigated planning, secured the permits. What we are looking for now is the right group of co-investors to take this through to completion. We keep the circle small deliberately: fewer partners, better alignment, more transparent returns.',
    ],
    aboutStats: [
      { value: 'Many years', label: 'developing hospitality assets in Spain' },
      { value: '18', label: 'boutique units — designed for the short-stay market' },
      { value: '100%', label: 'permits secured — zero entitlement risk' },
      { value: 'Nervión', label: "Seville's emerging hospitality district" },
    ],
    marketTitle: 'Why Nervión',
    marketIntro: "Nervión isn't a speculation — it's already moving. These are the projects confirming it:",
    marketPoints: [
      'Grupo Insur is breaking ground on a new 4-star hotel in Nervión.',
      'El Corte Inglés is converting its landmark building into a 10-floor hotel.',
      'Katégora has started construction of a new aparthotel in the area.',
      'Urbanitae successfully crowdfunded a hospitality project in Nervión.',
      'The district will add 44+ new tourist accommodation units.',
    ],
    galleryTitle: 'The project',
    formTitle: 'REQUEST ACCESS',
    formSubtitle:
      "Leave your details and we'll send you the full dossier: project overview, financial structure, and terms of participation.",
    investorTypeLabel: 'Investor type (optional)',
    investorTypePlaceholder: 'Select your profile',
    investorTypeOptions: [
      { value: 'individual', label: 'Individual investor' },
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
    submit: 'Send me the investment pack',
    submitting: 'Sending…',
    successTitle: 'On its way.',
    successBody:
      "Check your inbox — the investment pack will arrive shortly. If you'd like to speak to someone now, reply to that email.",
    errorGeneric: 'Something went wrong. Please try again.',
    errorRequired: 'Please fill in all fields.',
    errorEmail: 'Please enter a valid email address.',
    privacyNote: 'Your details are used only to contact you about this investment opportunity.',
    footerLine: 'Grupo YAKGU — Real estate developer focused on the hotel and hospitality ecosystem, Spain.',
  },
  he: {
    dir: 'rtl',
    htmlLang: 'he',
    metaTitle: 'BDS36 — השקעת מלונאות בוטיק בנרביון, סביליה | Grupo YAKGU',
    metaDescription:
      'אפרטהוטל בוטיק בן 18 יחידות עם היתרים מאושרים ומוכן לבנייה בנרביון, סביליה. הזדמנות לשותפות ישירה לצד היזם.',
    languageLabel: 'שפה',
    languageNames: { es: 'Español', en: 'English', he: 'עברית' },
    eyebrow: 'Grupo YAKGU · יזם נדל"ן מלונאי · ספרד',
    headline: 'BDS36 — נרביון, סביליה',
    subheadline:
      'אפרטהוטל בוטיק בנרביון, סביליה — היתרים מאושרים, שותפות פתוחה לקבוצה נבחרת של משקיעים.',
    ctaPrimary: 'קבלו את חוברת ההשקעה',
    highlightsTitle: 'ההזדמנות',
    highlights: [
      {
        title: '18 דירות בוטיק להשכרה לתיירים',
        body: 'נכס אירוח עם היתרים מאושרים ומוכן לבנייה, באחד משווקי השהות הקצרה הצומחים ביותר בספרד.',
      },
      {
        title: 'נרביון: הכתובת הבאה של סביליה',
        body: 'שכונה בעיצומה של טרנספורמציה, שמשכה מותגי מלונאות גדולים ומציגה תפוסה גבוהה לאלו שנכנסים ראשונים.',
      },
      {
        title: 'אפס סיכון תכנוני',
        body: 'היתר הבנייה אושר. ללא המתנה, ללא אי-ודאות. הבנייה מתחילה ברגע שנסגור את הגרעין.',
      },
      {
        title: 'שותפות השקעה נבחרת',
        body: 'לא קרן, לא מימון המונים. השתתפות ישירה בנכס בודד ומוחשי לצד היזם. פשוט, שקוף, מוגבל.',
      },
    ],
    aboutTitle: 'מי אנחנו',
    aboutBody: [
      'אנחנו צוות קטן וממוקד של יזמי נדל"ן עם שנים רבות של ניסיון בפיתוח נכסי אירוח ומלונאות בספרד. לא קרן השקעות, לא פלטפורמה. אנחנו מפתחים, בונים, ומזמינים מספר מצומצם של שותפי השקעה להצטרף אלינו בכל פרויקט.',
      'ב-BDS36 כבר עשינו את העבודה הקשה — מצאנו את הנכס, ניהלנו את ההליכים התכנוניים, והשגנו את ההיתרים. מה שאנחנו מחפשים עכשיו הוא הקבוצה הנכונה של שותפים להוביל את הפרויקט לסיום. אנחנו שומרים על מעגל קטן במכוון: פחות שותפים, יישור קו טוב יותר, תשואה שקופה יותר.',
    ],
    aboutStats: [
      { value: 'שנים רבות', label: 'של פיתוח נכסי אירוח בספרד' },
      { value: '18', label: 'יחידות בוטיק — מיועדות לשוק השהות הקצרה' },
      { value: '100%', label: 'היתרים אושרו — אפס סיכון תכנוני' },
      { value: 'נרביון', label: 'מרכז האירוח המתפתח של סביליה' },
    ],
    marketTitle: 'למה נרביון',
    marketIntro: 'נרביון היא לא ספקולציה — היא כבר בתנועה. אלה הפרויקטים שמאשרים זאת:',
    marketPoints: [
      'קבוצת Grupo Insur פותחת בבניית מלון 4 כוכבים חדש בנרביון.',
      'רשת El Corte Inglés הופכת את הבניין האייקוני שלה למלון בן 10 קומות.',
      'חברת Katégora החלה בבניית אפרטהוטל חדש באזור.',
      'פלטפורמת Urbanitae השלימה בהצלחה מימון המונים לפרויקט אירוח בנרביון.',
      'השכונה תוסיף למעלה מ-44 יחידות אירוח נופש חדשות.',
    ],
    galleryTitle: 'הפרויקט',
    formTitle: 'בקשת גישה',
    formSubtitle:
      'השאירו פרטים ונשלח לכם את הדוסייה המלאה: סקירת הפרויקט, המבנה הפיננסי ותנאי ההשתתפות.',
    investorTypeLabel: 'סוג משקיע (אופציונלי)',
    investorTypePlaceholder: 'בחרו את הפרופיל שלכם',
    investorTypeOptions: [
      { value: 'individual', label: 'משקיע פרטי' },
      { value: 'family_office', label: 'משרד משפחה' },
      { value: 'hnwi', label: 'משקיע פרטי בעל הון גבוה (HNWI)' },
      { value: 'fund', label: 'קרן השקעות' },
      { value: 'other', label: 'אחר' },
    ],
    nameLabel: 'שם מלא',
    namePlaceholder: 'השם שלך',
    emailLabel: 'כתובת אימייל',
    emailPlaceholder: 'name@company.com',
    mobileLabel: 'מספר נייד',
    mobilePlaceholder: '+972 50 000 0000',
    submit: 'שלחו לי את חבילת ההשקעה',
    submitting: 'שולח…',
    successTitle: 'בדרך אליכם.',
    successBody:
      'בדקו את תיבת הדואר הנכנס — חבילת ההשקעה תגיע בקרוב. אם תרצו לדבר עם מישהו עכשיו, פשוט ענו על אותו המייל.',
    errorGeneric: 'משהו השתבש. נסו שוב.',
    errorRequired: 'נא למלא את כל השדות.',
    errorEmail: 'נא להזין כתובת אימייל תקינה.',
    privacyNote: 'הפרטים ישמשו אך ורק ליצירת קשר בנוגע להזדמנות השקעה זו.',
    footerLine: 'Grupo YAKGU — יזם נדל"ן המתמחה באקוסיסטם המלונאות והאירוח, ספרד.',
  },
};
