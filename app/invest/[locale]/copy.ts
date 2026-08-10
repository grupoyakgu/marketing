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
  nameLabel: string;
  namePlaceholder: string;
  emailLabel: string;
  emailPlaceholder: string;
  mobileLabel: string;
  mobilePlaceholder: string;
  consentTerms: string;
  consentMarketing: string;
  submit: string;
  submitting: string;
  successTitle: string;
  successBody: string;
  errorGeneric: string;
  errorRequired: string;
  errorEmail: string;
  errorConsent: string;
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
      'Co-inversión directa junto al promotor. Abrimos una ventana selecta para inversores serios.\n\nAparthotel boutique en Nervión, Sevilla — permisos concedidos, listo para construir.',
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
      'Grupo YAKGU es uno de los promotores inmobiliarios más activos en el centro de Sevilla. En los últimos años hemos entregado más proyectos en este mercado que cualquier otro promotor de la región — en residencial, uso mixto y ahora en el sector hotelero. No gestionamos fondos ni operamos plataformas. Identificamos activos excepcionales, obtenemos los permisos, desarrollamos el proyecto e invitamos a un grupo selecto de co-inversores a participar con nosotros en cada operación.',
      'Nuestro proyecto más reciente: <a href="https://www.grupoyakgu.es/proyectos/peral-23" target="_blank" rel="noopener noreferrer" class="text-amber-400 underline underline-offset-2 hover:text-amber-300 transition-colors">Peral 23</a> — un desarrollo de referencia en el corazón de Sevilla.',
      'Con BDS36 ya hemos hecho el trabajo duro — hemos encontrado el solar, navegado el proceso de planificación y obtenido los permisos. Lo que buscamos ahora es el grupo adecuado de co-inversores para llevarlo hasta la finalización. Mantenemos el círculo pequeño deliberadamente: menos socios, mejor alineación, retornos más transparentes.',
    ],
    aboutStats: [
      { value: '18', label: 'unidades boutique — diseñadas para el mercado de estancia corta' },
      { value: '100%', label: 'licencias concedidas — sin riesgo de tramitación' },
      { value: 'Nervión', label: 'el distrito hostelero emergente de Sevilla' },
      { value: 'Experiencia', label: 'especializados en desarrollo inmobiliario turístico de alta gama' },
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
    nameLabel: 'Nombre completo',
    namePlaceholder: 'Su nombre',
    emailLabel: 'Correo electrónico',
    emailPlaceholder: 'nombre@empresa.com',
    mobileLabel: 'Teléfono móvil',
    mobilePlaceholder: '+34 600 000 000',
    consentTerms: 'Acepto los términos y condiciones',
    consentMarketing: 'Acepto recibir información comercial.',
    submit: 'Enviarme el pack de inversión',
    submitting: 'Enviando…',
    successTitle: 'En camino.',
    successBody:
      'Revise su bandeja de entrada — el pack de inversión llegará en breve. Si prefiere hablar con alguien ahora, responda a ese correo.',
    errorGeneric: 'Ha ocurrido un error. Por favor, inténtelo de nuevo.',
    errorRequired: 'Por favor, complete todos los campos.',
    errorEmail: 'Introduzca un correo electrónico válido.',
    errorConsent: 'Debe aceptar los términos y condiciones para continuar.',
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
      'A direct co-investment opportunity alongside the developer. We are opening a select window for serious investors.\n\nA fully permitted, construction-ready boutique aparthotel in Nervión — Seville\'s fastest-growing hospitality district. 18 units. One asset.',
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
      'Grupo YAKGU is one of the most active real estate developers in Seville\'s city centre. Over the past several years we have delivered more projects in this market than any other developer in the region — across residential, mixed-use, and now hospitality. We don\'t manage funds or run platforms. We identify exceptional sites, secure the permits, develop the asset, and invite a select group of co-investors to participate alongside us in each project.',
      'Our most recent completed project: <a href="https://www.grupoyakgu.es/proyectos/peral-23" target="_blank" rel="noopener noreferrer" class="text-amber-400 underline underline-offset-2 hover:text-amber-300 transition-colors">Peral 23</a> — a benchmark development in the heart of Seville.',
      'With BDS36 we have done the hard work already — sourced the site, navigated planning, secured the permits. What we are looking for now is the right group of co-investors to take this through to completion. We keep the circle small deliberately: fewer partners, better alignment, more transparent returns.',
    ],
    aboutStats: [
      { value: '18', label: 'boutique units — designed for the short-stay market' },
      { value: '100%', label: 'permits secured — zero entitlement risk' },
      { value: 'Nervión', label: "Seville's emerging hospitality district" },
      { value: 'Experience', label: 'specialized in high-end tourism real estate development' },
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
    nameLabel: 'Full name',
    namePlaceholder: 'Your name',
    emailLabel: 'Email address',
    emailPlaceholder: 'name@company.com',
    mobileLabel: 'Mobile number',
    mobilePlaceholder: '+1 555 000 0000',
    consentTerms: 'I accept the terms and conditions',
    consentMarketing: 'I agree to receive commercial information.',
    submit: 'Send me the investment pack',
    submitting: 'Sending…',
    successTitle: 'On its way.',
    successBody:
      "Check your inbox — the investment pack will arrive shortly. If you'd like to speak to someone now, reply to that email.",
    errorGeneric: 'Something went wrong. Please try again.',
    errorRequired: 'Please fill in all fields.',
    errorEmail: 'Please enter a valid email address.',
    errorConsent: 'You must accept the terms and conditions to continue.',
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
      'הזדמנות לשותפות השקעה ישירה לצד היזם. אנחנו פותחים חלון נבחר למשקיעים רציניים.\n\nאפרטהוטל בוטיק בנרביון, סביליה — היתרים מאושרים, מוכן לבנייה. 18 יחידות. נכס אחד.',
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
      'Grupo YAKGU הוא אחד מיזמי הנדל"ן הפעילים ביותר במרכז העיר סביליה. בשנים האחרונות סיימנו יותר פרויקטים בשוק זה מכל יזם אחר באזור — בתחום המגורים, השימוש המעורב, וכעת גם המלונאות. איננו מנהלי קרנות ואיננו פלטפורמה. אנחנו מזהים נכסים יוצאי דופן, מקבלים את האישורים, מפתחים את הפרויקט ומזמינים קבוצה נבחרת של שותפים להשקיע לצדנו בכל עסקה.',
      'הפרויקט האחרון שלנו: <a href="https://www.grupoyakgu.es/proyectos/peral-23" target="_blank" rel="noopener noreferrer" class="text-amber-400 underline underline-offset-2 hover:text-amber-300 transition-colors">Peral 23</a> — פרויקט ייחוס בלב סביליה.',
      'עם BDS36 כבר עשינו את העבודה הקשה — מצאנו את הקרקע, ניווטנו את תהליך התכנון והשגנו את ההיתרים. מה שאנחנו מחפשים עכשיו הוא הקבוצה הנכונה של שותפי-השקעה שתלווה אותנו עד להשלמה. אנחנו שומרים על מעגל קטן בכוונה: פחות שותפים, יישור קו טוב יותר, תשואות שקופות יותר.',
    ],
    aboutStats: [
      { value: '18', label: 'יחידות בוטיק — מיועדות לשוק השהות הקצרה' },
      { value: '100%', label: 'היתרים אושרו — אפס סיכון תכנוני' },
      { value: 'נרביון', label: 'מרכז האירוח המתפתח של סביליה' },
      { value: 'ניסיון', label: 'התמחות בפיתוח נדל"ן תיירותי יוקרתי' },
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
    nameLabel: 'שם מלא',
    namePlaceholder: 'השם שלך',
    emailLabel: 'כתובת אימייל',
    emailPlaceholder: 'name@company.com',
    mobileLabel: 'מספר נייד',
    mobilePlaceholder: '+972 50 000 0000',
    consentTerms: 'אני מסכים/ה לתנאים ולהגבלות',
    consentMarketing: 'אני מסכים/ה לקבל מידע מסחרי.',
    submit: 'שלחו לי את חבילת ההשקעה',
    submitting: 'שולח…',
    successTitle: 'בדרך אליכם.',
    successBody:
      'בדקו את תיבת הדואר הנכנס — חבילת ההשקעה תגיע בקרוב. אם תרצו לדבר עם מישהו עכשיו, פשוט ענו על אותו המייל.',
    errorGeneric: 'משהו השתבש. נסו שוב.',
    errorRequired: 'נא למלא את כל השדות.',
    errorEmail: 'נא להזין כתובת אימייל תקינה.',
    errorConsent: 'יש לאשר את התנאים וההגבלות כדי להמשיך.',
    privacyNote: 'הפרטים ישמשו אך ורק ליצירת קשר בנוגע להזדמנות השקעה זו.',
    footerLine: 'Grupo YAKGU — יזם נדל"ן המתמחה באקוסיסטם המלונאות והאירוח, ספרד.',
  },
};
