import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { isLanguage, type Language, type Me } from '@sv/shared';
import { put } from '../api/client';
import { keys, useMe } from '../api/hooks';
import { Button, Modal, Select } from '../components/ui';

const names: Record<Language, string> = { en: 'English', zh: '中文（简体）', hi: 'हिन्दी', es: 'Español', fr: 'Français' };
const messages = {
  en: {
    choose: 'Choose your language',
    language: 'Language',
    continue: 'Continue',
    hint: 'You can change this later in Settings.',
    incomplete: 'Translation is in progress. Many screens are still in English.',
    error: 'Could not save your language. Please try again.',
    Dashboard: 'Dashboard',
    Products: 'Products',
    Projects: 'Projects',
    'Teamwork Graph': 'Teamwork Graph',
    Materials: 'Materials',
    Suppliers: 'Suppliers',
    Achievements: 'Achievements',
    Settings: 'Settings',
    'Admin Console': 'Admin Console',
    'New product': 'New product',
    'Voice capture': 'Voice capture',
    'Request access': 'Request access',
    'Sign in': 'Sign in',
  },
  zh: {
    choose: '选择您的语言',
    language: '语言',
    continue: '继续',
    hint: '您可以稍后在设置中更改。',
    incomplete: '翻译正在进行中，许多页面仍为英文。',
    error: '无法保存语言，请重试。',
    Dashboard: '仪表板',
    Products: '产品',
    Projects: '项目',
    'Teamwork Graph': '协作关系图',
    Materials: '材料',
    Suppliers: '供应商',
    Achievements: '成就',
    Settings: '设置',
    'Admin Console': '管理控制台',
    'New product': '新建产品',
    'Voice capture': '语音输入',
    'Request access': '申请访问',
    'Sign in': '登录',
  },
  hi: {
    choose: 'अपनी भाषा चुनें',
    language: 'भाषा',
    continue: 'आगे बढ़ें',
    hint: 'इसे बाद में सेटिंग में बदल सकते हैं।',
    incomplete: 'अनुवाद जारी है। कई स्क्रीन अभी अंग्रेज़ी में हैं।',
    error: 'भाषा सहेजी नहीं जा सकी। फिर प्रयास करें।',
    Dashboard: 'डैशबोर्ड',
    Products: 'उत्पाद',
    Projects: 'प्रोजेक्ट',
    'Teamwork Graph': 'टीमवर्क ग्राफ़',
    Materials: 'सामग्री',
    Suppliers: 'आपूर्तिकर्ता',
    Achievements: 'उपलब्धियाँ',
    Settings: 'सेटिंग',
    'Admin Console': 'व्यवस्थापक कंसोल',
    'New product': 'नया उत्पाद',
    'Voice capture': 'आवाज़ से लिखें',
    'Request access': 'पहुँच का अनुरोध',
    'Sign in': 'साइन इन',
  },
  es: {
    choose: 'Elige tu idioma',
    language: 'Idioma',
    continue: 'Continuar',
    hint: 'Puedes cambiarlo más tarde en Configuración.',
    incomplete: 'La traducción está en curso. Muchas pantallas siguen en inglés.',
    error: 'No se pudo guardar el idioma. Inténtalo de nuevo.',
    Dashboard: 'Panel',
    Products: 'Productos',
    Projects: 'Proyectos',
    'Teamwork Graph': 'Grafo de colaboración',
    Materials: 'Materiales',
    Suppliers: 'Proveedores',
    Achievements: 'Logros',
    Settings: 'Configuración',
    'Admin Console': 'Consola de administración',
    'New product': 'Nuevo producto',
    'Voice capture': 'Entrada de voz',
    'Request access': 'Solicitar acceso',
    'Sign in': 'Iniciar sesión',
  },
  fr: {
    choose: 'Choisissez votre langue',
    language: 'Langue',
    continue: 'Continuer',
    hint: 'Vous pourrez la modifier plus tard dans les paramètres.',
    incomplete: 'La traduction est en cours. De nombreux écrans restent en anglais.',
    error: 'Impossible d’enregistrer la langue. Réessayez.',
    Dashboard: 'Tableau de bord',
    Products: 'Produits',
    Projects: 'Projets',
    'Teamwork Graph': 'Graphe de collaboration',
    Materials: 'Matériaux',
    Suppliers: 'Fournisseurs',
    Achievements: 'Réussites',
    Settings: 'Paramètres',
    'Admin Console': 'Console d’administration',
    'New product': 'Nouveau produit',
    'Voice capture': 'Saisie vocale',
    'Request access': 'Demander l’accès',
    'Sign in': 'Se connecter',
  },
} as const;
const requestTranslations: Record<Language, Record<string, string>> = {
  en: {},
  zh: {
    'Back to Solution Velocity': '返回 Solution Velocity',
    'Thanks for reaching out.': '感谢您联系我们。',
    'Return to home': '返回首页',
    'Request access': '申请访问',
    'Tell us a little about your team and what you’re building. These details help us understand how Solution Velocity could fit your product workflow.':
      '请介绍一下您的团队和正在开发的产品，帮助我们了解 Solution Velocity 如何融入您的产品工作流程。',
    'Full name': '姓名',
    'Email address': '电子邮件地址',
    'Company or team': '公司或团队',
    Role: '角色',
    Industry: '行业',
    'Team size': '团队规模',
    'Product stage': '产品阶段',
    'Current tools or processes': '当前工具或流程',
    'Optional — for example, spreadsheets or separate product tools.': '可选，例如电子表格或独立的产品工具。',
    'What would you like to improve?': '您希望改进什么？',
    'Tell us what is difficult today or what you hope to accomplish.': '请告诉我们目前的困难或您希望实现的目标。',
    'Your full name': '您的姓名',
    'Company or team name': '公司或团队名称',
    'Choose your role': '选择您的角色',
    'Choose an industry': '选择行业',
    'Choose team size': '选择团队规模',
    'Choose a product stage': '选择产品阶段',
    'Your current workflow': '您当前的工作流程',
    'What are you building, and where would a more connected workflow help?': '您正在开发什么？更互联的工作流程将在哪里提供帮助？',
    'We’ll use your answers only to review this request and respond to you.': '我们只会使用您的回答来审核此申请并回复您。',
    'Send access request': '发送访问申请',
    'Founder / business owner': '创始人 / 企业主',
    'Product manager': '产品经理',
    Designer: '设计师',
    Engineer: '工程师',
    'Operations / finance': '运营 / 财务',
    Other: '其他',
    'Aerospace & defense': '航空航天与国防',
    'Automotive & mobility': '汽车与出行',
    'Medical devices': '医疗器械',
    'Energy & infrastructure': '能源与基础设施',
    'Industrial & manufacturing': '工业与制造',
    'Software & technology': '软件与技术',
    'Consumer products': '消费品',
    'Just me': '仅我一人',
    Idea: '创意',
    Research: '研究',
    Planning: '规划',
    Design: '设计',
    Prototype: '原型',
    Testing: '测试',
    Launch: '发布',
    Improvement: '改进',
  },
  hi: {
    'Back to Solution Velocity': 'Solution Velocity पर वापस जाएँ',
    'Thanks for reaching out.': 'संपर्क करने के लिए धन्यवाद।',
    'Return to home': 'मुख्य पृष्ठ पर लौटें',
    'Request access': 'पहुँच का अनुरोध',
    'Tell us a little about your team and what you’re building. These details help us understand how Solution Velocity could fit your product workflow.':
      'अपनी टीम और आप क्या बना रहे हैं, उसके बारे में बताएँ। इससे हमें समझने में मदद मिलेगी कि Solution Velocity आपके उत्पाद के काम में कैसे फिट होगा।',
    'Full name': 'पूरा नाम',
    'Email address': 'ईमेल पता',
    'Company or team': 'कंपनी या टीम',
    Role: 'भूमिका',
    Industry: 'उद्योग',
    'Team size': 'टीम का आकार',
    'Product stage': 'उत्पाद चरण',
    'Current tools or processes': 'वर्तमान टूल या प्रक्रियाएँ',
    'Optional — for example, spreadsheets or separate product tools.': 'वैकल्पिक — जैसे स्प्रेडशीट या अलग उत्पाद टूल।',
    'What would you like to improve?': 'आप क्या सुधारना चाहेंगे?',
    'Tell us what is difficult today or what you hope to accomplish.': 'बताएँ कि आज क्या मुश्किल है या आप क्या हासिल करना चाहते हैं।',
    'Your full name': 'आपका पूरा नाम',
    'Company or team name': 'कंपनी या टीम का नाम',
    'Choose your role': 'अपनी भूमिका चुनें',
    'Choose an industry': 'उद्योग चुनें',
    'Choose team size': 'टीम का आकार चुनें',
    'Choose a product stage': 'उत्पाद चरण चुनें',
    'Your current workflow': 'आपका वर्तमान कार्यप्रवाह',
    'What are you building, and where would a more connected workflow help?':
      'आप क्या बना रहे हैं, और अधिक जुड़ा कार्यप्रवाह कहाँ मदद करेगा?',
    'We’ll use your answers only to review this request and respond to you.':
      'हम आपके जवाबों का उपयोग केवल इस अनुरोध की समीक्षा और आपको जवाब देने के लिए करेंगे।',
    'Send access request': 'पहुँच अनुरोध भेजें',
    'Founder / business owner': 'संस्थापक / व्यवसाय स्वामी',
    'Product manager': 'उत्पाद प्रबंधक',
    Designer: 'डिज़ाइनर',
    Engineer: 'इंजीनियर',
    'Operations / finance': 'संचालन / वित्त',
    Other: 'अन्य',
    'Aerospace & defense': 'एयरोस्पेस और रक्षा',
    'Automotive & mobility': 'ऑटोमोटिव और परिवहन',
    'Medical devices': 'चिकित्सा उपकरण',
    'Energy & infrastructure': 'ऊर्जा और बुनियादी ढाँचा',
    'Industrial & manufacturing': 'औद्योगिक और निर्माण',
    'Software & technology': 'सॉफ़्टवेयर और तकनीक',
    'Consumer products': 'उपभोक्ता उत्पाद',
    'Just me': 'केवल मैं',
    Idea: 'विचार',
    Research: 'अनुसंधान',
    Planning: 'योजना',
    Design: 'डिज़ाइन',
    Prototype: 'प्रोटोटाइप',
    Testing: 'परीक्षण',
    Launch: 'लॉन्च',
    Improvement: 'सुधार',
  },
  es: {
    'Back to Solution Velocity': 'Volver a Solution Velocity',
    'Thanks for reaching out.': 'Gracias por contactarnos.',
    'Return to home': 'Volver al inicio',
    'Request access': 'Solicitar acceso',
    'Tell us a little about your team and what you’re building. These details help us understand how Solution Velocity could fit your product workflow.':
      'Cuéntanos sobre tu equipo y lo que estás creando. Esto nos ayuda a entender cómo Solution Velocity puede encajar en tu flujo de trabajo.',
    'Full name': 'Nombre completo',
    'Email address': 'Correo electrónico',
    'Company or team': 'Empresa o equipo',
    Role: 'Cargo',
    Industry: 'Industria',
    'Team size': 'Tamaño del equipo',
    'Product stage': 'Etapa del producto',
    'Current tools or processes': 'Herramientas o procesos actuales',
    'Optional — for example, spreadsheets or separate product tools.':
      'Opcional: por ejemplo, hojas de cálculo o herramientas de producto separadas.',
    'What would you like to improve?': '¿Qué te gustaría mejorar?',
    'Tell us what is difficult today or what you hope to accomplish.': 'Cuéntanos qué es difícil hoy o qué esperas lograr.',
    'Your full name': 'Tu nombre completo',
    'Company or team name': 'Nombre de la empresa o equipo',
    'Choose your role': 'Elige tu cargo',
    'Choose an industry': 'Elige una industria',
    'Choose team size': 'Elige el tamaño del equipo',
    'Choose a product stage': 'Elige una etapa del producto',
    'Your current workflow': 'Tu flujo de trabajo actual',
    'What are you building, and where would a more connected workflow help?':
      '¿Qué estás creando y dónde ayudaría un flujo de trabajo más conectado?',
    'We’ll use your answers only to review this request and respond to you.':
      'Usaremos tus respuestas únicamente para revisar esta solicitud y responderte.',
    'Send access request': 'Enviar solicitud de acceso',
    'Founder / business owner': 'Fundador / propietario',
    'Product manager': 'Gerente de producto',
    Designer: 'Diseñador',
    Engineer: 'Ingeniero',
    'Operations / finance': 'Operaciones / finanzas',
    Other: 'Otro',
    'Aerospace & defense': 'Aeroespacial y defensa',
    'Automotive & mobility': 'Automoción y movilidad',
    'Medical devices': 'Dispositivos médicos',
    'Energy & infrastructure': 'Energía e infraestructura',
    'Industrial & manufacturing': 'Industria y fabricación',
    'Software & technology': 'Software y tecnología',
    'Consumer products': 'Productos de consumo',
    'Just me': 'Solo yo',
    Idea: 'Idea',
    Research: 'Investigación',
    Planning: 'Planificación',
    Design: 'Diseño',
    Prototype: 'Prototipo',
    Testing: 'Pruebas',
    Launch: 'Lanzamiento',
    Improvement: 'Mejora',
  },
  fr: {
    'Back to Solution Velocity': 'Retour à Solution Velocity',
    'Thanks for reaching out.': 'Merci de nous avoir contactés.',
    'Return to home': 'Retour à l’accueil',
    'Request access': 'Demander l’accès',
    'Tell us a little about your team and what you’re building. These details help us understand how Solution Velocity could fit your product workflow.':
      'Parlez-nous de votre équipe et de ce que vous créez. Cela nous aidera à comprendre comment Solution Velocity peut s’intégrer à votre processus produit.',
    'Full name': 'Nom complet',
    'Email address': 'Adresse e-mail',
    'Company or team': 'Entreprise ou équipe',
    Role: 'Rôle',
    Industry: 'Secteur',
    'Team size': 'Taille de l’équipe',
    'Product stage': 'Étape du produit',
    'Current tools or processes': 'Outils ou processus actuels',
    'Optional — for example, spreadsheets or separate product tools.':
      'Facultatif — par exemple, des feuilles de calcul ou des outils produit distincts.',
    'What would you like to improve?': 'Que souhaitez-vous améliorer ?',
    'Tell us what is difficult today or what you hope to accomplish.':
      'Indiquez-nous ce qui est difficile aujourd’hui ou ce que vous souhaitez accomplir.',
    'Your full name': 'Votre nom complet',
    'Company or team name': 'Nom de l’entreprise ou de l’équipe',
    'Choose your role': 'Choisissez votre rôle',
    'Choose an industry': 'Choisissez un secteur',
    'Choose team size': 'Choisissez la taille de l’équipe',
    'Choose a product stage': 'Choisissez une étape du produit',
    'Your current workflow': 'Votre processus actuel',
    'What are you building, and where would a more connected workflow help?':
      'Que créez-vous et où un processus mieux connecté pourrait-il vous aider ?',
    'We’ll use your answers only to review this request and respond to you.':
      'Nous utiliserons vos réponses uniquement pour examiner cette demande et vous répondre.',
    'Send access request': 'Envoyer la demande d’accès',
    'Founder / business owner': 'Fondateur / dirigeant',
    'Product manager': 'Responsable produit',
    Designer: 'Designer',
    Engineer: 'Ingénieur',
    'Operations / finance': 'Opérations / finances',
    Other: 'Autre',
    'Aerospace & defense': 'Aérospatiale et défense',
    'Automotive & mobility': 'Automobile et mobilité',
    'Medical devices': 'Dispositifs médicaux',
    'Energy & infrastructure': 'Énergie et infrastructures',
    'Industrial & manufacturing': 'Industrie et fabrication',
    'Software & technology': 'Logiciels et technologie',
    'Consumer products': 'Produits de consommation',
    'Just me': 'Moi seul',
    Idea: 'Idée',
    Research: 'Recherche',
    Planning: 'Planification',
    Design: 'Conception',
    Prototype: 'Prototype',
    Testing: 'Test',
    Launch: 'Lancement',
    Improvement: 'Amélioration',
  },
};
type Key = keyof typeof messages.en;
const storageKey = 'sv-language';
function stored(): Language | null {
  try {
    const value = localStorage.getItem(storageKey);
    return isLanguage(value) ? value : null;
  } catch {
    return null;
  }
}
function store(value: Language) {
  try {
    localStorage.setItem(storageKey, value);
  } catch {
    /* Storage may be disabled. */
  }
}
type Context = {
  language: Language;
  choose: (value: Language) => Promise<boolean>;
  t: (key: string) => string;
  busy: boolean;
  error: string;
};
const LanguageContext = createContext<Context | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const { data: me, isLoading } = useMe();
  const qc = useQueryClient();
  const [language, setLanguage] = useState<Language>(() => stored() ?? 'en');
  const [prompt, setPrompt] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const account = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    document.documentElement.lang = language === 'zh' ? 'zh-Hans' : language;
  }, [language]);
  useEffect(() => {
    if (isLoading) return;
    const id = me?.user.id ?? null;
    if (account.current === id) return;
    account.current = id;
    setBusy(false);
    setError('');
    if (me?.user.language) {
      setLanguage(me.user.language);
      store(me.user.language);
      setPrompt(false);
      return;
    }
    const preference = stored();
    if (!preference) {
      setPrompt(true);
      return;
    }
    setLanguage(preference);
    if (id) {
      setBusy(true);
      void put<{ language: Language }>('/auth/language', { language: preference })
        .then(() => {
          qc.setQueryData<Me | null>(keys.me, (current) =>
            current?.user.id === id ? { ...current, user: { ...current.user, language: preference } } : current,
          );
        })
        .catch(() => {
          if (account.current === id) setError(messages[preference].error);
        })
        .finally(() => {
          if (account.current === id) setBusy(false);
        });
    }
  }, [isLoading, me?.user.id, me?.user.language, qc]);
  const choose = async (next: Language) => {
    setError('');
    if (me) {
      setBusy(true);
      try {
        await put('/auth/language', { language: next });
        qc.setQueryData<Me | null>(keys.me, (current) =>
          current?.user.id === me.user.id ? { ...current, user: { ...current.user, language: next } } : current,
        );
      } catch {
        setError(messages[language].error);
        return false;
      } finally {
        setBusy(false);
      }
    }
    setLanguage(next);
    store(next);
    return true;
  };
  const t = (key: string): string => messages[language][key as Key] ?? requestTranslations[language][key] ?? key;
  return (
    <LanguageContext.Provider value={{ language, choose, t, busy, error }}>
      {children}
      {prompt && <LanguagePrompt onDone={() => setPrompt(false)} />}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('Missing LanguageProvider');
  return context;
}
export function LanguageSelect() {
  const { language, choose, t, busy, error } = useLanguage();
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium">
        <span>{t('language')}</span>
        <Select
          aria-label={t('language')}
          disabled={busy}
          value={language}
          onChange={(event) => {
            if (isLanguage(event.target.value)) void choose(event.target.value);
          }}
          className="mt-1 w-full"
        >
          {Object.entries(names).map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </Select>
      </label>
      <p className="text-xs text-zinc-500">{t('incomplete')}</p>
      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
function LanguagePrompt({ onDone }: { onDone: () => void }) {
  const { language, choose, t, busy, error } = useLanguage();
  const [draft, setDraft] = useState(language);
  const confirm = async () => {
    if (await choose(draft)) onDone();
  };
  return (
    <Modal
      title={messages[draft].choose}
      subtitle={messages[draft].hint}
      onClose={() => void confirm()}
      footer={
        <Button loading={busy} onClick={() => void confirm()}>
          {messages[draft].continue}
        </Button>
      }
      size="sm"
    >
      <label className="block text-sm font-medium">
        {messages[draft].language}
        <Select
          className="mt-2 w-full"
          value={draft}
          onChange={(event) => {
            if (isLanguage(event.target.value)) setDraft(event.target.value);
          }}
        >
          {Object.entries(names).map(([id, name]) => (
            <option value={id} key={id}>
              {name}
            </option>
          ))}
        </Select>
      </label>
      <p className="mt-3 text-xs text-zinc-500">{messages[draft].incomplete}</p>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {t('error')}
        </p>
      )}
    </Modal>
  );
}
