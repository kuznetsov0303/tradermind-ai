"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, BookOpen, ChevronDown, Compass, ExternalLink, Gauge, Search, ShieldCheck, Sparkles, Target, Zap } from "lucide-react";

type GuideLanguage = 'en' | 'ru' | 'ua' | 'zh' | 'de' | 'fr' | 'es' | 'ar' | 'it' | 'no' | 'ka' | 'pl' | 'tr' | 'el' | 'hi';
type DashboardGuideTabId = 'overview' | 'edge' | 'journal' | 'strategy' | 'charts' | 'market' | 'alerts' | 'coach' | 'learning' | 'reports' | 'billing';

type LocalText = Partial<Record<GuideLanguage, string>> & { en: string };

type DashboardGuideTab = {
  id: DashboardGuideTabId;
  route: string;
  emoji: string;
  color: string;
  title: LocalText;
  role: LocalText;
  value: LocalText;
  functions: string[];
  buttons: [string, string][];
  terms: string[];
  power: string;
};

const LANGUAGES = [
  {
    "id": "en",
    "name": "English",
    "short": "EN",
    "dir": "ltr"
  },
  {
    "id": "ru",
    "name": "Русский",
    "short": "RU",
    "dir": "ltr"
  },
  {
    "id": "ua",
    "name": "Українська",
    "short": "UA",
    "dir": "ltr"
  },
  {
    "id": "zh",
    "name": "中文",
    "short": "ZH",
    "dir": "ltr"
  },
  {
    "id": "de",
    "name": "Deutsch",
    "short": "DE",
    "dir": "ltr"
  },
  {
    "id": "fr",
    "name": "Français",
    "short": "FR",
    "dir": "ltr"
  },
  {
    "id": "es",
    "name": "Español",
    "short": "ES",
    "dir": "ltr"
  },
  {
    "id": "ar",
    "name": "العربية",
    "short": "AR",
    "dir": "rtl"
  },
  {
    "id": "it",
    "name": "Italiano",
    "short": "IT",
    "dir": "ltr"
  },
  {
    "id": "no",
    "name": "Norsk",
    "short": "NO",
    "dir": "ltr"
  },
  {
    "id": "ka",
    "name": "ქართული",
    "short": "KA",
    "dir": "ltr"
  },
  {
    "id": "pl",
    "name": "Polski",
    "short": "PL",
    "dir": "ltr"
  },
  {
    "id": "tr",
    "name": "Türkçe",
    "short": "TR",
    "dir": "ltr"
  },
  {
    "id": "el",
    "name": "Ελληνικά",
    "short": "EL",
    "dir": "ltr"
  },
  {
    "id": "hi",
    "name": "हिन्दी",
    "short": "HI",
    "dir": "ltr"
  }
] as const;
const GUIDE_UI = {
  "en": {
    "kicker": "Dashboard field manual",
    "title": "Guide to every SkillEdge dashboard tab",
    "subtitle": "The dashboard is already working as a Personal Trading Desk: Journal, Strategy OS, Signals, Market, Reports, Training and account control run in one execution loop.",
    "heroClaim": "You are already on the development track. SkillEdge has the plan, the workflow and the risk discipline to push your trading skill to the next level.",
    "openDashboard": "Open dashboard",
    "openPricing": "Plans",
    "openHome": "Home",
    "openFooterNote": "Footer-only route: add this guide to the public footer resources.",
    "wheelTitle": "11-tab command wheel",
    "wheelText": "Click any segment. The widget opens with the exact job of the tab, the trader value, buttons and terms.",
    "selected": "Selected desk",
    "what": "What this tab does",
    "value": "Why it matters",
    "functions": "Live functions",
    "buttons": "Button map",
    "terms": "Terms used",
    "openTab": "Open this tab",
    "collapse": "Collapse",
    "expand": "Expand",
    "planTitle": "Use the dashboard like a professional desk",
    "planIntro": "The growth path is simple: record facts, review execution, lock one setup, trade only the playbook, measure outcomes, upgrade rules.",
    "glossaryTitle": "Trading terms inside the dashboard",
    "glossaryText": "These are the words SkillEdge uses across Journal, Signals, Strategy OS and Reports. The terms stay direct because this is a trader workspace, not a soft SaaS toy.",
    "search": "Search term",
    "allTerms": "All desk terms",
    "footerTitle": "Ready to work the desk",
    "footerText": "Open the dashboard, run the daily plan, log the next trade and let the system expose the leaks.",
    "language": "Language"
  },
  "ru": {
    "kicker": "Полевой гайд по ЛК",
    "title": "Гайд по каждой вкладке SkillEdge Dashboard",
    "subtitle": "Личный кабинет уже работает как Personal Trading Desk: журнал, Strategy OS, сигналы, рынок, отчёты, обучение и аккаунт собраны в один execution loop.",
    "heroClaim": "Ты уже стал на тропу развития. SkillEdge держит план, рабочий процесс и риск-дисциплину, чтобы поднять твой трейдинг на следующий уровень.",
    "openDashboard": "Открыть ЛК",
    "openPricing": "Тарифы",
    "openHome": "Главная",
    "openFooterNote": "Маршрут для футера: добавь этот гайд в Resources / Footer.",
    "wheelTitle": "Командный круг из 11 вкладок",
    "wheelText": "Нажимай на сектор. Виджет открывает роль вкладки, пользу для трейдера, кнопки и термины.",
    "selected": "Выбранный desk",
    "what": "Что делает вкладка",
    "value": "Зачем это трейдеру",
    "functions": "Рабочий функционал",
    "buttons": "Карта кнопок",
    "terms": "Термины вкладки",
    "openTab": "Открыть вкладку",
    "collapse": "Скрыть",
    "expand": "Развернуть",
    "planTitle": "Как пользоваться ЛК как профи",
    "planIntro": "Путь роста прямой: фиксируй факты, разбирай execution, закрепляй один setup, торгуй только playbook, меряй outcome, усиливай правила.",
    "glossaryTitle": "Трейдерские термины в ЛК",
    "glossaryText": "Эти слова SkillEdge использует в Journal, Signals, Strategy OS и Reports. Термины звучат жёстко, потому что это рабочий desk трейдера, а не мягкая SaaS-игрушка.",
    "search": "Найти термин",
    "allTerms": "Все desk-термины",
    "footerTitle": "Desk готов к работе",
    "footerText": "Открывай ЛК, запускай план дня, фиксируй сделку и дай системе вскрыть leaks.",
    "language": "Язык"
  },
  "ua": {
    "kicker": "Польовий гайд по кабінету",
    "title": "Гайд по кожній вкладці SkillEdge Dashboard",
    "subtitle": "Кабінет уже працює як Personal Trading Desk: журнал, Strategy OS, сигнали, ринок, звіти, навчання та акаунт зібрані в один execution loop.",
    "heroClaim": "Ти вже став на шлях розвитку. SkillEdge тримає план, робочий процес і ризик-дисципліну, щоб підняти твій трейдинг на новий рівень.",
    "openDashboard": "Відкрити кабінет",
    "openPricing": "Тарифи",
    "openHome": "Головна",
    "openFooterNote": "Маршрут для футера: додай цей гайд у Resources / Footer.",
    "wheelTitle": "Командне коло з 11 вкладок",
    "wheelText": "Натискай сектор. Віджет відкриває роль вкладки, користь для трейдера, кнопки та терміни.",
    "selected": "Обраний desk",
    "what": "Що робить вкладка",
    "value": "Навіщо це трейдеру",
    "functions": "Робочий функціонал",
    "buttons": "Карта кнопок",
    "terms": "Терміни вкладки",
    "openTab": "Відкрити вкладку",
    "collapse": "Сховати",
    "expand": "Розгорнути",
    "planTitle": "Як працювати з кабінетом як профі",
    "planIntro": "Шлях росту прямий: фіксуй факти, розбирай execution, закріплюй один setup, торгуй тільки playbook, міряй outcome, посилюй правила.",
    "glossaryTitle": "Трейдерські терміни в кабінеті",
    "glossaryText": "Ці слова SkillEdge використовує в Journal, Signals, Strategy OS і Reports. Терміни звучать жорстко, бо це робочий desk трейдера, а не м’яка SaaS-іграшка.",
    "search": "Знайти термін",
    "allTerms": "Усі desk-терміни",
    "footerTitle": "Desk готовий до роботи",
    "footerText": "Відкривай кабінет, запускай план дня, фіксуй угоду і дай системі вскрити leaks.",
    "language": "Мова"
  },
  "zh": {
    "kicker": "仪表盘作战手册",
    "title": "SkillEdge 仪表盘标签指南",
    "subtitle": "仪表盘已经作为 Personal Trading Desk 运行：Journal、Strategy OS、Signals、Market、Reports、Training 与账户控制组成一个 execution loop。",
    "heroClaim": "你已经进入交易成长路径。SkillEdge 已经给出流程、纪律和风险框架，把你的交易推进到更专业的层级。",
    "openDashboard": "打开仪表盘",
    "openPricing": "套餐",
    "openHome": "首页",
    "openFooterNote": "页脚入口：把本指南加入 Footer / Resources。",
    "wheelTitle": "11 个标签的指挥轮",
    "wheelText": "点击任意扇区，查看该模块的职责、价值、按钮和术语。",
    "selected": "当前 desk",
    "what": "模块作用",
    "value": "交易价值",
    "functions": "实时功能",
    "buttons": "按钮地图",
    "terms": "术语",
    "openTab": "打开该标签",
    "collapse": "收起",
    "expand": "展开",
    "planTitle": "像专业交易台一样使用仪表盘",
    "planIntro": "成长路径：记录事实、复盘 execution、锁定一个 setup、只交易 playbook、统计 outcome、升级规则。",
    "glossaryTitle": "仪表盘交易术语",
    "glossaryText": "这些术语贯穿 Journal、Signals、Strategy OS 和 Reports。SkillEdge 使用直接的交易语言，因为这里是交易工作台。",
    "search": "搜索术语",
    "allTerms": "全部术语",
    "footerTitle": "Desk 已就绪",
    "footerText": "打开仪表盘，执行日计划，记录下一笔交易，让系统暴露 leaks。",
    "language": "语言"
  },
  "de": {
    "kicker": "Dashboard Field Manual",
    "title": "Guide zu allen SkillEdge Dashboard-Tabs",
    "subtitle": "Das Dashboard arbeitet bereits als Personal Trading Desk: Journal, Strategy OS, Signals, Market, Reports, Training und Account laufen in einem execution loop.",
    "heroClaim": "Du stehst bereits auf dem Entwicklungspfad. SkillEdge hat Plan, Workflow und Risikodisziplin, um dein Trading auf das nächste Level zu drücken.",
    "openDashboard": "Dashboard öffnen",
    "openPricing": "Pläne",
    "openHome": "Startseite",
    "openFooterNote": "Footer-Route: diesen Guide in Resources / Footer verlinken.",
    "wheelTitle": "Command Wheel mit 11 Tabs",
    "wheelText": "Klicke ein Segment. Das Widget zeigt Job, Nutzen, Buttons und Begriffe des Tabs.",
    "selected": "Ausgewählter Desk",
    "what": "Was der Tab macht",
    "value": "Warum es zählt",
    "functions": "Live-Funktionen",
    "buttons": "Button-Karte",
    "terms": "Begriffe",
    "openTab": "Tab öffnen",
    "collapse": "Schließen",
    "expand": "Öffnen",
    "planTitle": "Dashboard wie ein Profi-Desk nutzen",
    "planIntro": "Wachstum: Fakten loggen, execution reviewen, ein setup locken, nur playbook traden, outcome messen, Regeln upgraden.",
    "glossaryTitle": "Trading-Begriffe im Dashboard",
    "glossaryText": "Diese Begriffe laufen durch Journal, Signals, Strategy OS und Reports. SkillEdge spricht Desk-Sprache, keine weiche SaaS-Sprache.",
    "search": "Begriff suchen",
    "allTerms": "Alle Desk-Begriffe",
    "footerTitle": "Desk ist bereit",
    "footerText": "Dashboard öffnen, Tagesplan fahren, nächsten Trade loggen und leaks sichtbar machen.",
    "language": "Sprache"
  },
  "fr": {
    "kicker": "Manuel terrain du dashboard",
    "title": "Guide de chaque onglet SkillEdge Dashboard",
    "subtitle": "Le dashboard fonctionne déjà comme un Personal Trading Desk : Journal, Strategy OS, Signals, Market, Reports, Training et compte dans une seule execution loop.",
    "heroClaim": "Tu es déjà sur la voie de progression. SkillEdge tient le plan, le process et la discipline de risque pour monter ton trading d’un niveau.",
    "openDashboard": "Ouvrir le dashboard",
    "openPricing": "Plans",
    "openHome": "Accueil",
    "openFooterNote": "Route footer : ajoute ce guide dans Resources / Footer.",
    "wheelTitle": "Roue de commande à 11 onglets",
    "wheelText": "Clique un segment. Le widget affiche le rôle, la valeur, les boutons et les termes.",
    "selected": "Desk sélectionné",
    "what": "Rôle de l’onglet",
    "value": "Valeur trader",
    "functions": "Fonctions live",
    "buttons": "Carte des boutons",
    "terms": "Termes",
    "openTab": "Ouvrir l’onglet",
    "collapse": "Fermer",
    "expand": "Ouvrir",
    "planTitle": "Utiliser le dashboard comme un desk pro",
    "planIntro": "Le chemin : logger les faits, revoir l’execution, verrouiller un setup, trader le playbook, mesurer l’outcome, upgrader les règles.",
    "glossaryTitle": "Termes trading du dashboard",
    "glossaryText": "Ces termes traversent Journal, Signals, Strategy OS et Reports. SkillEdge parle trading desk, pas SaaS mou.",
    "search": "Chercher un terme",
    "allTerms": "Tous les termes desk",
    "footerTitle": "Desk prêt",
    "footerText": "Ouvre le dashboard, lance le plan du jour, log le prochain trade et laisse le système exposer les leaks.",
    "language": "Langue"
  },
  "es": {
    "kicker": "Manual operativo del dashboard",
    "title": "Guía de cada pestaña de SkillEdge Dashboard",
    "subtitle": "El dashboard ya trabaja como Personal Trading Desk: Journal, Strategy OS, Signals, Market, Reports, Training y cuenta en un solo execution loop.",
    "heroClaim": "Ya estás en la ruta de desarrollo. SkillEdge tiene el plan, el flujo y la disciplina de riesgo para llevar tu trading al siguiente nivel.",
    "openDashboard": "Abrir dashboard",
    "openPricing": "Planes",
    "openHome": "Inicio",
    "openFooterNote": "Ruta de footer: añade esta guía a Resources / Footer.",
    "wheelTitle": "Rueda de mando con 11 pestañas",
    "wheelText": "Haz clic en un segmento. El widget muestra trabajo, valor, botones y términos.",
    "selected": "Desk seleccionado",
    "what": "Qué hace la pestaña",
    "value": "Por qué importa",
    "functions": "Funciones live",
    "buttons": "Mapa de botones",
    "terms": "Términos",
    "openTab": "Abrir pestaña",
    "collapse": "Cerrar",
    "expand": "Abrir",
    "planTitle": "Usar el dashboard como un desk profesional",
    "planIntro": "Crecimiento: registrar hechos, revisar execution, bloquear un setup, operar solo playbook, medir outcome y subir reglas.",
    "glossaryTitle": "Términos trading del dashboard",
    "glossaryText": "Estos términos viven en Journal, Signals, Strategy OS y Reports. SkillEdge habla lenguaje de desk, no SaaS blando.",
    "search": "Buscar término",
    "allTerms": "Todos los términos desk",
    "footerTitle": "Desk listo",
    "footerText": "Abre el dashboard, ejecuta el plan diario, registra el trade y deja que el sistema exponga leaks.",
    "language": "Idioma"
  },
  "ar": {
    "kicker": "دليل لوحة التداول",
    "title": "دليل كل تبويب داخل SkillEdge Dashboard",
    "subtitle": "اللوحة تعمل الآن كـ Personal Trading Desk: Journal و Strategy OS و Signals و Market و Reports و Training والحساب داخل execution loop واحد.",
    "heroClaim": "أنت بالفعل على مسار التطور. SkillEdge يملك الخطة والانضباط وإدارة المخاطر لرفع مستواك في التداول.",
    "openDashboard": "فتح اللوحة",
    "openPricing": "الخطط",
    "openHome": "الرئيسية",
    "openFooterNote": "مسار الفوتر: أضف هذا الدليل داخل Resources / Footer.",
    "wheelTitle": "عجلة أوامر من 11 تبويب",
    "wheelText": "اضغط على أي قطاع. الودجت يعرض وظيفة التبويب والقيمة والأزرار والمصطلحات.",
    "selected": "الـ desk المحدد",
    "what": "وظيفة التبويب",
    "value": "قيمته للمتداول",
    "functions": "وظائف مباشرة",
    "buttons": "خريطة الأزرار",
    "terms": "المصطلحات",
    "openTab": "فتح التبويب",
    "collapse": "إخفاء",
    "expand": "عرض",
    "planTitle": "استخدم اللوحة كـ trading desk محترف",
    "planIntro": "المسار: سجل الحقائق، راجع execution، ثبت setup واحد، تداول playbook فقط، قس outcome، وطور القواعد.",
    "glossaryTitle": "مصطلحات التداول داخل اللوحة",
    "glossaryText": "هذه المصطلحات تعمل داخل Journal و Signals و Strategy OS و Reports. SkillEdge يتكلم لغة desk حقيقية.",
    "search": "بحث عن مصطلح",
    "allTerms": "كل مصطلحات desk",
    "footerTitle": "الـ Desk جاهز",
    "footerText": "افتح اللوحة، نفذ خطة اليوم، سجل الصفقة التالية ودع النظام يكشف leaks.",
    "language": "اللغة"
  },
  "it": {
    "kicker": "Manuale operativo dashboard",
    "title": "Guida a ogni tab di SkillEdge Dashboard",
    "subtitle": "Il dashboard lavora già come Personal Trading Desk: Journal, Strategy OS, Signals, Market, Reports, Training e account in un unico execution loop.",
    "heroClaim": "Sei già sul percorso di crescita. SkillEdge ha piano, workflow e disciplina di rischio per alzare il livello del tuo trading.",
    "openDashboard": "Apri dashboard",
    "openPricing": "Piani",
    "openHome": "Home",
    "openFooterNote": "Route footer: aggiungi questa guida in Resources / Footer.",
    "wheelTitle": "Command wheel con 11 tab",
    "wheelText": "Clicca un segmento. Il widget mostra ruolo, valore, pulsanti e termini.",
    "selected": "Desk selezionato",
    "what": "Cosa fa il tab",
    "value": "Perché conta",
    "functions": "Funzioni live",
    "buttons": "Mappa pulsanti",
    "terms": "Termini",
    "openTab": "Apri tab",
    "collapse": "Chiudi",
    "expand": "Apri",
    "planTitle": "Usare il dashboard come un desk pro",
    "planIntro": "Percorso: loggare fatti, rivedere execution, bloccare un setup, tradare solo playbook, misurare outcome, aggiornare regole.",
    "glossaryTitle": "Termini trading nel dashboard",
    "glossaryText": "Questi termini guidano Journal, Signals, Strategy OS e Reports. SkillEdge parla lingua da desk, non SaaS morbido.",
    "search": "Cerca termine",
    "allTerms": "Tutti i termini desk",
    "footerTitle": "Desk pronto",
    "footerText": "Apri il dashboard, esegui il piano del giorno, registra il trade e lascia emergere i leaks.",
    "language": "Lingua"
  },
  "no": {
    "kicker": "Dashboard feltmanual",
    "title": "Guide til alle SkillEdge dashboard-faner",
    "subtitle": "Dashboardet fungerer allerede som Personal Trading Desk: Journal, Strategy OS, Signals, Market, Reports, Training og konto i én execution loop.",
    "heroClaim": "Du er allerede på utviklingssporet. SkillEdge har plan, workflow og risikodisiplin som løfter tradingen din.",
    "openDashboard": "Åpne dashboard",
    "openPricing": "Planer",
    "openHome": "Hjem",
    "openFooterNote": "Footer-rute: legg denne guiden i Resources / Footer.",
    "wheelTitle": "Kommandoring med 11 faner",
    "wheelText": "Klikk et segment. Widgeten viser jobb, verdi, knapper og begreper.",
    "selected": "Valgt desk",
    "what": "Hva fanen gjør",
    "value": "Hvorfor det betyr noe",
    "functions": "Live-funksjoner",
    "buttons": "Knappekart",
    "terms": "Begreper",
    "openTab": "Åpne fane",
    "collapse": "Lukk",
    "expand": "Åpne",
    "planTitle": "Bruk dashboardet som et pro desk",
    "planIntro": "Vekst: logg fakta, review execution, lås ett setup, trade kun playbook, mål outcome, oppgrader regler.",
    "glossaryTitle": "Tradingbegreper i dashboardet",
    "glossaryText": "Begrepene går gjennom Journal, Signals, Strategy OS og Reports. SkillEdge bruker desk-språk, ikke myk SaaS-prat.",
    "search": "Søk begrep",
    "allTerms": "Alle desk-begreper",
    "footerTitle": "Desk klart",
    "footerText": "Åpne dashboardet, kjør dagens plan, logg neste trade og la systemet finne leaks.",
    "language": "Språk"
  },
  "ka": {
    "kicker": "Dashboard-ის სამუშაო გიდი",
    "title": "SkillEdge Dashboard-ის ყველა ჩანართის გიდი",
    "subtitle": "კაბინეტი უკვე მუშაობს როგორც Personal Trading Desk: Journal, Strategy OS, Signals, Market, Reports, Training და account ერთ execution loop-ში.",
    "heroClaim": "შენ უკვე დგახარ განვითარების გზაზე. SkillEdge-ს აქვს გეგმა, workflow და risk discipline, რომ trading skill ახალ დონეზე ავიდეს.",
    "openDashboard": "კაბინეტის გახსნა",
    "openPricing": "ტარიფები",
    "openHome": "მთავარი",
    "openFooterNote": "Footer route: დაამატე ეს გიდი Resources / Footer-ში.",
    "wheelTitle": "11 ჩანართის command wheel",
    "wheelText": "დააჭირე სეგმენტს. Widget აჩვენებს როლს, ღირებულებას, ღილაკებს და ტერმინებს.",
    "selected": "არჩეული desk",
    "what": "რას აკეთებს ჩანართი",
    "value": "რატომ არის საჭირო",
    "functions": "Live ფუნქციები",
    "buttons": "ღილაკების რუკა",
    "terms": "ტერმინები",
    "openTab": "ჩანართის გახსნა",
    "collapse": "დახურვა",
    "expand": "გახსნა",
    "planTitle": "გამოიყენე კაბინეტი როგორც პროფესიული desk",
    "planIntro": "ზრდა: დააფიქსირე ფაქტები, გაარჩიე execution, ჩაკეტე ერთი setup, ივაჭრე playbook-ით, გაზომე outcome, გააძლიერე წესები.",
    "glossaryTitle": "Trading ტერმინები კაბინეტში",
    "glossaryText": "ეს ტერმინები მუშაობს Journal, Signals, Strategy OS და Reports-ში. SkillEdge საუბრობს ნამდვილი desk-ის ენით.",
    "search": "ტერმინის ძებნა",
    "allTerms": "ყველა desk ტერმინი",
    "footerTitle": "Desk მზადაა",
    "footerText": "გახსენი კაბინეტი, გაუშვი დღის გეგმა, ჩაწერე trade და სისტემას გამოაჩენინე leaks.",
    "language": "ენა"
  },
  "pl": {
    "kicker": "Instrukcja dashboardu",
    "title": "Przewodnik po każdej zakładce SkillEdge Dashboard",
    "subtitle": "Dashboard działa już jak Personal Trading Desk: Journal, Strategy OS, Signals, Market, Reports, Training i konto w jednej execution loop.",
    "heroClaim": "Jesteś już na ścieżce rozwoju. SkillEdge ma plan, workflow i dyscyplinę ryzyka, żeby podnieść Twój trading poziom wyżej.",
    "openDashboard": "Otwórz dashboard",
    "openPricing": "Plany",
    "openHome": "Strona główna",
    "openFooterNote": "Link footer: dodaj ten guide do Resources / Footer.",
    "wheelTitle": "Koło komend z 11 zakładkami",
    "wheelText": "Kliknij segment. Widget pokazuje zadanie, wartość, przyciski i terminy.",
    "selected": "Wybrany desk",
    "what": "Co robi zakładka",
    "value": "Dlaczego to ważne",
    "functions": "Funkcje live",
    "buttons": "Mapa przycisków",
    "terms": "Terminy",
    "openTab": "Otwórz zakładkę",
    "collapse": "Zwiń",
    "expand": "Rozwiń",
    "planTitle": "Używaj dashboardu jak profesjonalny desk",
    "planIntro": "Rozwój: loguj fakty, review execution, zablokuj jeden setup, trade tylko playbook, mierz outcome, aktualizuj zasady.",
    "glossaryTitle": "Terminy tradingowe w dashboardzie",
    "glossaryText": "Te terminy działają w Journal, Signals, Strategy OS i Reports. SkillEdge mówi językiem desk, nie miękkim SaaS.",
    "search": "Szukaj terminu",
    "allTerms": "Wszystkie terminy desk",
    "footerTitle": "Desk gotowy",
    "footerText": "Otwórz dashboard, wykonaj plan dnia, zaloguj trade i pozwól systemowi wykryć leaks.",
    "language": "Język"
  },
  "tr": {
    "kicker": "Dashboard saha kılavuzu",
    "title": "SkillEdge Dashboard’daki her sekmenin rehberi",
    "subtitle": "Dashboard artık Personal Trading Desk gibi çalışıyor: Journal, Strategy OS, Signals, Market, Reports, Training ve Account tek execution loop içinde.",
    "heroClaim": "Gelişim yoluna zaten girdin. SkillEdge planı, workflow’u ve risk disiplinini kuruyor; trading seviyeni yukarı taşıyor.",
    "openDashboard": "Dashboard aç",
    "openPricing": "Planlar",
    "openHome": "Ana sayfa",
    "openFooterNote": "Footer route: bu guide’ı Resources / Footer’a ekle.",
    "wheelTitle": "11 sekmeli komut çarkı",
    "wheelText": "Bir segment seç. Widget sekmenin görevini, değerini, butonlarını ve terimlerini açar.",
    "selected": "Seçili desk",
    "what": "Sekme ne yapıyor",
    "value": "Trader için değeri",
    "functions": "Canlı fonksiyonlar",
    "buttons": "Buton haritası",
    "terms": "Terimler",
    "openTab": "Sekmeyi aç",
    "collapse": "Kapat",
    "expand": "Aç",
    "planTitle": "Dashboard’u profesyonel desk gibi kullan",
    "planIntro": "Büyüme: gerçekleri logla, execution incele, bir setup kilitle, sadece playbook trade et, outcome ölç, kuralları yükselt.",
    "glossaryTitle": "Dashboard içi trading terimleri",
    "glossaryText": "Bu terimler Journal, Signals, Strategy OS ve Reports içinde çalışır. SkillEdge gerçek desk dili konuşur.",
    "search": "Terim ara",
    "allTerms": "Tüm desk terimleri",
    "footerTitle": "Desk hazır",
    "footerText": "Dashboard’u aç, günlük planı çalıştır, sonraki trade’i logla ve sistem leaks’i ortaya çıkarsın.",
    "language": "Dil"
  },
  "el": {
    "kicker": "Εγχειρίδιο dashboard",
    "title": "Οδηγός για κάθε tab του SkillEdge Dashboard",
    "subtitle": "Το dashboard λειτουργεί ήδη ως Personal Trading Desk: Journal, Strategy OS, Signals, Market, Reports, Training και Account σε ένα execution loop.",
    "heroClaim": "Είσαι ήδη στη διαδρομή ανάπτυξης. Το SkillEdge κρατά το πλάνο, τη ροή και την πειθαρχία ρίσκου για να ανεβάσει το trading σου επίπεδο.",
    "openDashboard": "Άνοιγμα dashboard",
    "openPricing": "Πλάνα",
    "openHome": "Αρχική",
    "openFooterNote": "Footer route: πρόσθεσε αυτόν τον οδηγό στο Resources / Footer.",
    "wheelTitle": "Command wheel με 11 tabs",
    "wheelText": "Κάνε κλικ σε ένα segment. Το widget ανοίγει ρόλο, αξία, κουμπιά και όρους.",
    "selected": "Επιλεγμένο desk",
    "what": "Τι κάνει το tab",
    "value": "Γιατί μετράει",
    "functions": "Live λειτουργίες",
    "buttons": "Χάρτης κουμπιών",
    "terms": "Όροι",
    "openTab": "Άνοιγμα tab",
    "collapse": "Κλείσιμο",
    "expand": "Άνοιγμα",
    "planTitle": "Χρήση dashboard σαν επαγγελματικό desk",
    "planIntro": "Ανάπτυξη: log facts, review execution, lock ένα setup, trade μόνο playbook, μέτρα outcome, αναβάθμισε rules.",
    "glossaryTitle": "Trading όροι στο dashboard",
    "glossaryText": "Οι όροι δουλεύουν σε Journal, Signals, Strategy OS και Reports. Το SkillEdge μιλά γλώσσα desk.",
    "search": "Αναζήτηση όρου",
    "allTerms": "Όλοι οι desk όροι",
    "footerTitle": "Desk έτοιμο",
    "footerText": "Άνοιξε το dashboard, τρέξε το daily plan, log το επόμενο trade και άφησε το σύστημα να βρει leaks.",
    "language": "Γλώσσα"
  },
  "hi": {
    "kicker": "Dashboard field manual",
    "title": "SkillEdge Dashboard के हर tab का guide",
    "subtitle": "Dashboard पहले से Personal Trading Desk की तरह काम करता है: Journal, Strategy OS, Signals, Market, Reports, Training और Account एक execution loop में जुड़े हैं।",
    "heroClaim": "तुम development track पर आ चुके हो। SkillEdge के पास plan, workflow और risk discipline है जो तुम्हारी trading skill को अगले level पर ले जाता है।",
    "openDashboard": "Dashboard खोलो",
    "openPricing": "Plans",
    "openHome": "Home",
    "openFooterNote": "Footer route: इस guide को Resources / Footer में जोड़ो।",
    "wheelTitle": "11 tabs वाला command wheel",
    "wheelText": "किसी segment पर click करो। Widget tab की role, value, buttons और terms खोलता है।",
    "selected": "Selected desk",
    "what": "Tab क्या करता है",
    "value": "Trader के लिए value",
    "functions": "Live functions",
    "buttons": "Button map",
    "terms": "Terms",
    "openTab": "Tab खोलो",
    "collapse": "Hide",
    "expand": "Open",
    "planTitle": "Dashboard को professional desk की तरह use करो",
    "planIntro": "Growth path: facts log करो, execution review करो, एक setup lock करो, केवल playbook trade करो, outcome measure करो, rules upgrade करो।",
    "glossaryTitle": "Dashboard में trading terms",
    "glossaryText": "ये terms Journal, Signals, Strategy OS और Reports में चलते हैं। SkillEdge real desk language बोलता है।",
    "search": "Term खोजो",
    "allTerms": "All desk terms",
    "footerTitle": "Desk ready",
    "footerText": "Dashboard खोलो, daily plan चलाओ, अगला trade log करो और system leaks expose करे।",
    "language": "Language"
  }
} as const;
const DASHBOARD_TABS = [
  {
    "id": "overview",
    "route": "/dashboard?tab=overview",
    "emoji": "◎",
    "color": "#00C076",
    "terms": [
      "Command Home",
      "Daily Trading Plan",
      "Mistake Tracker",
      "Scorecard",
      "Next Best Action"
    ],
    "title": {
      "en": "Overview",
      "ru": "Главная",
      "ua": "Головна",
      "zh": "总览",
      "de": "Übersicht",
      "fr": "Vue d’ensemble",
      "es": "Resumen",
      "ar": "نظرة عامة",
      "it": "Panoramica",
      "no": "Oversikt",
      "ka": "მიმოხილვა",
      "pl": "Przegląd",
      "tr": "Genel Bakış",
      "el": "Επισκόπηση",
      "hi": "Overview"
    },
    "role": {
      "en": "Command Home shows the current state of the trader: performance, discipline, mistakes, plan of the day and the next best action.",
      "ru": "Главная показывает состояние трейдера здесь и сейчас: результат, дисциплину, ошибки, план дня и следующий лучший шаг.",
      "ua": "Головна показує стан трейдера тут і зараз: результат, дисципліну, помилки, план дня та наступний найкращий крок.",
      "zh": "Command Home shows the current state of the trader: performance, discipline, mistakes, plan of the day and the next best action.",
      "de": "Command Home shows the current state of the trader: performance, discipline, mistakes, plan of the day and the next best action.",
      "fr": "Command Home shows the current state of the trader: performance, discipline, mistakes, plan of the day and the next best action.",
      "es": "Command Home shows the current state of the trader: performance, discipline, mistakes, plan of the day and the next best action.",
      "ar": "Command Home shows the current state of the trader: performance, discipline, mistakes, plan of the day and the next best action.",
      "it": "Command Home shows the current state of the trader: performance, discipline, mistakes, plan of the day and the next best action.",
      "no": "Command Home shows the current state of the trader: performance, discipline, mistakes, plan of the day and the next best action.",
      "ka": "Command Home shows the current state of the trader: performance, discipline, mistakes, plan of the day and the next best action.",
      "pl": "Command Home shows the current state of the trader: performance, discipline, mistakes, plan of the day and the next best action.",
      "tr": "Command Home shows the current state of the trader: performance, discipline, mistakes, plan of the day and the next best action.",
      "el": "Command Home shows the current state of the trader: performance, discipline, mistakes, plan of the day and the next best action.",
      "hi": "Command Home shows the current state of the trader: performance, discipline, mistakes, plan of the day and the next best action."
    },
    "value": {
      "en": "The trader opens one screen and understands where to work, what to stop doing and what the desk demands today.",
      "ru": "Трейдер открывает один экран и сразу понимает, где работать, что резать и что desk требует сегодня.",
      "ua": "Трейдер відкриває один екран і одразу бачить, де працювати, що різати і що desk вимагає сьогодні.",
      "zh": "The trader opens one screen and understands where to work, what to stop doing and what the desk demands today.",
      "de": "The trader opens one screen and understands where to work, what to stop doing and what the desk demands today.",
      "fr": "The trader opens one screen and understands where to work, what to stop doing and what the desk demands today.",
      "es": "The trader opens one screen and understands where to work, what to stop doing and what the desk demands today.",
      "ar": "The trader opens one screen and understands where to work, what to stop doing and what the desk demands today.",
      "it": "The trader opens one screen and understands where to work, what to stop doing and what the desk demands today.",
      "no": "The trader opens one screen and understands where to work, what to stop doing and what the desk demands today.",
      "ka": "The trader opens one screen and understands where to work, what to stop doing and what the desk demands today.",
      "pl": "The trader opens one screen and understands where to work, what to stop doing and what the desk demands today.",
      "tr": "The trader opens one screen and understands where to work, what to stop doing and what the desk demands today.",
      "el": "The trader opens one screen and understands where to work, what to stop doing and what the desk demands today.",
      "hi": "The trader opens one screen and understands where to work, what to stop doing and what the desk demands today."
    },
    "functions": [
      "Reads 30D PnL, win rate, discipline and recent activity.",
      "Builds Daily Trading Plan, Pre-Trade Gate and End-of-Day Debrief.",
      "Shows Mistake Tracker, Personal Rules and Weekly Trader Scorecard."
    ],
    "buttons": [
      [
        "Open Journal",
        "Jumps to the trade ticket and starts fact capture."
      ],
      [
        "Strategy",
        "Opens Strategy OS and the next mission."
      ],
      [
        "Signals",
        "Opens live Signals Desk and outcome tracking."
      ],
      [
        "Reports",
        "Builds the desk report from the Journal sample."
      ],
      [
        "Pre-Trade Gate",
        "Runs the before-entry filter before a weak trade gets clicked."
      ],
      [
        "End-of-Day Debrief",
        "Moves the session into review mode."
      ]
    ],
    "power": "Start every session here. If Overview says risk, you cut size. If it says evidence, you collect screenshots. If it says review, you stop adding trades and fix execution."
  },
  {
    "id": "edge",
    "route": "/dashboard?tab=edge",
    "emoji": "◇",
    "color": "#C8A96B",
    "terms": [
      "Personal Edge",
      "Fingerprint",
      "Anti-Setup Guard",
      "Risk Guard",
      "Personal Playbook"
    ],
    "title": {
      "en": "Personal Edge",
      "ru": "Personal Edge",
      "ua": "Personal Edge",
      "zh": "个人优势",
      "de": "Personal Edge",
      "fr": "Personal Edge",
      "es": "Personal Edge",
      "ar": "Personal Edge",
      "it": "Personal Edge",
      "no": "Personal Edge",
      "ka": "Personal Edge",
      "pl": "Personal Edge",
      "tr": "Personal Edge",
      "el": "Personal Edge",
      "hi": "Personal Edge"
    },
    "role": {
      "en": "Personal Edge reads the trader’s best and worst behavior: winning fingerprints, weak setups, rules and risk warnings.",
      "ru": "Personal Edge читает сильные и слабые стороны трейдера: прибыльные fingerprints, слабые setups, правила и risk warnings.",
      "ua": "Personal Edge читає сильні й слабкі сторони трейдера: прибуткові fingerprints, слабкі setups, правила та risk warnings.",
      "zh": "Personal Edge reads the trader’s best and worst behavior: winning fingerprints, weak setups, rules and risk warnings.",
      "de": "Personal Edge reads the trader’s best and worst behavior: winning fingerprints, weak setups, rules and risk warnings.",
      "fr": "Personal Edge reads the trader’s best and worst behavior: winning fingerprints, weak setups, rules and risk warnings.",
      "es": "Personal Edge reads the trader’s best and worst behavior: winning fingerprints, weak setups, rules and risk warnings.",
      "ar": "Personal Edge reads the trader’s best and worst behavior: winning fingerprints, weak setups, rules and risk warnings.",
      "it": "Personal Edge reads the trader’s best and worst behavior: winning fingerprints, weak setups, rules and risk warnings.",
      "no": "Personal Edge reads the trader’s best and worst behavior: winning fingerprints, weak setups, rules and risk warnings.",
      "ka": "Personal Edge reads the trader’s best and worst behavior: winning fingerprints, weak setups, rules and risk warnings.",
      "pl": "Personal Edge reads the trader’s best and worst behavior: winning fingerprints, weak setups, rules and risk warnings.",
      "tr": "Personal Edge reads the trader’s best and worst behavior: winning fingerprints, weak setups, rules and risk warnings.",
      "el": "Personal Edge reads the trader’s best and worst behavior: winning fingerprints, weak setups, rules and risk warnings.",
      "hi": "Personal Edge reads the trader’s best and worst behavior: winning fingerprints, weak setups, rules and risk warnings."
    },
    "value": {
      "en": "This is where the dashboard stops being generic. It adapts around the trader’s own evidence.",
      "ru": "Здесь ЛК перестаёт быть общим софтом. Он подстраивается под реальный evidence конкретного трейдера.",
      "ua": "Тут кабінет перестає бути загальним софтом. Він підлаштовується під реальний evidence конкретного трейдера.",
      "zh": "This is where the dashboard stops being generic. It adapts around the trader’s own evidence.",
      "de": "This is where the dashboard stops being generic. It adapts around the trader’s own evidence.",
      "fr": "This is where the dashboard stops being generic. It adapts around the trader’s own evidence.",
      "es": "This is where the dashboard stops being generic. It adapts around the trader’s own evidence.",
      "ar": "This is where the dashboard stops being generic. It adapts around the trader’s own evidence.",
      "it": "This is where the dashboard stops being generic. It adapts around the trader’s own evidence.",
      "no": "This is where the dashboard stops being generic. It adapts around the trader’s own evidence.",
      "ka": "This is where the dashboard stops being generic. It adapts around the trader’s own evidence.",
      "pl": "This is where the dashboard stops being generic. It adapts around the trader’s own evidence.",
      "tr": "This is where the dashboard stops being generic. It adapts around the trader’s own evidence.",
      "el": "This is where the dashboard stops being generic. It adapts around the trader’s own evidence.",
      "hi": "This is where the dashboard stops being generic. It adapts around the trader’s own evidence."
    },
    "functions": [
      "Extracts setup fingerprints from journal trades and screenshots.",
      "Builds personal rules, anti-setups and risk notes.",
      "Prepares the profile used by future personal alerts."
    ],
    "buttons": [
      [
        "Refresh Personal Edge",
        "Rebuilds the profile from the newest journal and evidence."
      ],
      [
        "Playbook",
        "Opens the personal setups that already deserve attention."
      ],
      [
        "Rules",
        "Opens personal process rules and anti-setup guard."
      ],
      [
        "Journal",
        "Sends the trader back to the source of truth."
      ]
    ],
    "power": "Review this weekly. The goal is not more trades; the goal is a sharper personal edge and fewer repeated mistakes."
  },
  {
    "id": "journal",
    "route": "/dashboard?tab=journal",
    "emoji": "▦",
    "color": "#00D084",
    "terms": [
      "Journal",
      "Trade Ticket",
      "Screenshot Evidence",
      "Execution Review",
      "Trade Database"
    ],
    "title": {
      "en": "Journal",
      "ru": "Journal",
      "ua": "Journal",
      "zh": "交易日志",
      "de": "Journal",
      "fr": "Journal",
      "es": "Journal",
      "ar": "Journal",
      "it": "Journal",
      "no": "Journal",
      "ka": "Journal",
      "pl": "Journal",
      "tr": "Journal",
      "el": "Journal",
      "hi": "Journal"
    },
    "role": {
      "en": "Journal is the source of truth. Every trade, screenshot, mistake, setup, result and review starts here.",
      "ru": "Journal — источник правды. Каждая сделка, скрин, ошибка, setup, результат и review начинается здесь.",
      "ua": "Journal — джерело правди. Кожна угода, скрин, помилка, setup, результат і review починається тут.",
      "zh": "Journal is the source of truth. Every trade, screenshot, mistake, setup, result and review starts here.",
      "de": "Journal is the source of truth. Every trade, screenshot, mistake, setup, result and review starts here.",
      "fr": "Journal is the source of truth. Every trade, screenshot, mistake, setup, result and review starts here.",
      "es": "Journal is the source of truth. Every trade, screenshot, mistake, setup, result and review starts here.",
      "ar": "Journal is the source of truth. Every trade, screenshot, mistake, setup, result and review starts here.",
      "it": "Journal is the source of truth. Every trade, screenshot, mistake, setup, result and review starts here.",
      "no": "Journal is the source of truth. Every trade, screenshot, mistake, setup, result and review starts here.",
      "ka": "Journal is the source of truth. Every trade, screenshot, mistake, setup, result and review starts here.",
      "pl": "Journal is the source of truth. Every trade, screenshot, mistake, setup, result and review starts here.",
      "tr": "Journal is the source of truth. Every trade, screenshot, mistake, setup, result and review starts here.",
      "el": "Journal is the source of truth. Every trade, screenshot, mistake, setup, result and review starts here.",
      "hi": "Journal is the source of truth. Every trade, screenshot, mistake, setup, result and review starts here."
    },
    "value": {
      "en": "Without facts there is no edge. Journal turns emotions into data and gives the desk something real to improve.",
      "ru": "Без фактов нет edge. Journal превращает эмоции в данные и даёт desk реальный материал для улучшения.",
      "ua": "Без фактів немає edge. Journal перетворює емоції на дані й дає desk реальний матеріал для покращення.",
      "zh": "Without facts there is no edge. Journal turns emotions into data and gives the desk something real to improve.",
      "de": "Without facts there is no edge. Journal turns emotions into data and gives the desk something real to improve.",
      "fr": "Without facts there is no edge. Journal turns emotions into data and gives the desk something real to improve.",
      "es": "Without facts there is no edge. Journal turns emotions into data and gives the desk something real to improve.",
      "ar": "Without facts there is no edge. Journal turns emotions into data and gives the desk something real to improve.",
      "it": "Without facts there is no edge. Journal turns emotions into data and gives the desk something real to improve.",
      "no": "Without facts there is no edge. Journal turns emotions into data and gives the desk something real to improve.",
      "ka": "Without facts there is no edge. Journal turns emotions into data and gives the desk something real to improve.",
      "pl": "Without facts there is no edge. Journal turns emotions into data and gives the desk something real to improve.",
      "tr": "Without facts there is no edge. Journal turns emotions into data and gives the desk something real to improve.",
      "el": "Without facts there is no edge. Journal turns emotions into data and gives the desk something real to improve.",
      "hi": "Without facts there is no edge. Journal turns emotions into data and gives the desk something real to improve."
    },
    "functions": [
      "Logs trades with market, direction, entry, exit, PnL, setup and mistakes.",
      "Attaches screenshots as evidence for Strategy OS and Personal Edge.",
      "Runs execution review and keeps the complete trade database."
    ],
    "buttons": [
      [
        "Log execution",
        "Opens the trade ticket and records the decision."
      ],
      [
        "Attach evidence",
        "Adds screenshot/context to the trade record."
      ],
      [
        "Run desk review",
        "Reads the trade and returns execution feedback."
      ],
      [
        "Open database",
        "Shows the full trade history with filters."
      ],
      [
        "Open chart",
        "Sends the ticker to Charts for context review."
      ],
      [
        "Export",
        "Downloads CSV/XLSX when the trader needs the file."
      ]
    ],
    "power": "Log the trade right after execution. Late memory is weak data; fresh data builds professional review."
  },
  {
    "id": "strategy",
    "route": "/dashboard?tab=strategy",
    "emoji": "△",
    "color": "#C8A96B",
    "terms": [
      "Strategy OS",
      "Setup Library",
      "Evidence Locker",
      "Before-Trade Gate",
      "20-Trade Experiment"
    ],
    "title": {
      "en": "Strategy OS",
      "ru": "Strategy OS",
      "ua": "Strategy OS",
      "zh": "策略系统",
      "de": "Strategy OS",
      "fr": "Strategy OS",
      "es": "Strategy OS",
      "ar": "Strategy OS",
      "it": "Strategy OS",
      "no": "Strategy OS",
      "ka": "Strategy OS",
      "pl": "Strategy OS",
      "tr": "Strategy OS",
      "el": "Strategy OS",
      "hi": "Strategy OS"
    },
    "role": {
      "en": "Strategy OS turns random trading into a structured playbook: setup logic, evidence, rules, drills and version upgrades.",
      "ru": "Strategy OS превращает хаотичный трейдинг в структурный playbook: логика setup, evidence, правила, drills и версии стратегии.",
      "ua": "Strategy OS перетворює хаотичний трейдинг на структурний playbook: логіка setup, evidence, правила, drills і версії стратегії.",
      "zh": "Strategy OS turns random trading into a structured playbook: setup logic, evidence, rules, drills and version upgrades.",
      "de": "Strategy OS turns random trading into a structured playbook: setup logic, evidence, rules, drills and version upgrades.",
      "fr": "Strategy OS turns random trading into a structured playbook: setup logic, evidence, rules, drills and version upgrades.",
      "es": "Strategy OS turns random trading into a structured playbook: setup logic, evidence, rules, drills and version upgrades.",
      "ar": "Strategy OS turns random trading into a structured playbook: setup logic, evidence, rules, drills and version upgrades.",
      "it": "Strategy OS turns random trading into a structured playbook: setup logic, evidence, rules, drills and version upgrades.",
      "no": "Strategy OS turns random trading into a structured playbook: setup logic, evidence, rules, drills and version upgrades.",
      "ka": "Strategy OS turns random trading into a structured playbook: setup logic, evidence, rules, drills and version upgrades.",
      "pl": "Strategy OS turns random trading into a structured playbook: setup logic, evidence, rules, drills and version upgrades.",
      "tr": "Strategy OS turns random trading into a structured playbook: setup logic, evidence, rules, drills and version upgrades.",
      "el": "Strategy OS turns random trading into a structured playbook: setup logic, evidence, rules, drills and version upgrades.",
      "hi": "Strategy OS turns random trading into a structured playbook: setup logic, evidence, rules, drills and version upgrades."
    },
    "value": {
      "en": "The trader stops jumping between ideas and develops one repeatable edge with proof.",
      "ru": "Трейдер перестаёт прыгать между идеями и строит один повторяемый edge на доказательствах.",
      "ua": "Трейдер перестає стрибати між ідеями й будує один повторюваний edge на доказах.",
      "zh": "The trader stops jumping between ideas and develops one repeatable edge with proof.",
      "de": "The trader stops jumping between ideas and develops one repeatable edge with proof.",
      "fr": "The trader stops jumping between ideas and develops one repeatable edge with proof.",
      "es": "The trader stops jumping between ideas and develops one repeatable edge with proof.",
      "ar": "The trader stops jumping between ideas and develops one repeatable edge with proof.",
      "it": "The trader stops jumping between ideas and develops one repeatable edge with proof.",
      "no": "The trader stops jumping between ideas and develops one repeatable edge with proof.",
      "ka": "The trader stops jumping between ideas and develops one repeatable edge with proof.",
      "pl": "The trader stops jumping between ideas and develops one repeatable edge with proof.",
      "tr": "The trader stops jumping between ideas and develops one repeatable edge with proof.",
      "el": "The trader stops jumping between ideas and develops one repeatable edge with proof.",
      "hi": "The trader stops jumping between ideas and develops one repeatable edge with proof."
    },
    "functions": [
      "Runs setup academy, evidence locker and Strategy Cockpit.",
      "Builds Strategy v1, checklist, rulebook and version upgrades.",
      "Runs drill mode, before-trade gate and playbook graduation."
    ],
    "buttons": [
      [
        "Start strategy build",
        "Locks one setup and starts the roadmap."
      ],
      [
        "Continue mission",
        "Opens the next concrete action."
      ],
      [
        "Add evidence",
        "Saves chart examples for the setup."
      ],
      [
        "Run drill",
        "Trains decision quality without risking money."
      ],
      [
        "Build Strategy v1",
        "Creates the first operational rulebook."
      ],
      [
        "Graduate playbook",
        "Moves proven behavior into Personal Playbook."
      ]
    ],
    "power": "Do not build five weak systems. Build one clean setup until the desk sees enough evidence to trust it."
  },
  {
    "id": "charts",
    "route": "/dashboard?tab=charts",
    "emoji": "⌁",
    "color": "#38BDF8",
    "terms": [
      "Chart Desk",
      "Watchlist",
      "Movers",
      "Ticker",
      "Timeframe"
    ],
    "title": {
      "en": "Charts",
      "ru": "Charts",
      "ua": "Charts",
      "zh": "图表",
      "de": "Charts",
      "fr": "Charts",
      "es": "Charts",
      "ar": "Charts",
      "it": "Charts",
      "no": "Charts",
      "ka": "Charts",
      "pl": "Charts",
      "tr": "Charts",
      "el": "Charts",
      "hi": "Charts"
    },
    "role": {
      "en": "Charts is the visual execution terminal: ticker, TradingView chart, watchlist, movers and chart review.",
      "ru": "Charts — визуальный execution terminal: тикер, TradingView chart, watchlist, movers и chart review.",
      "ua": "Charts — візуальний execution terminal: тикер, TradingView chart, watchlist, movers і chart review.",
      "zh": "Charts is the visual execution terminal: ticker, TradingView chart, watchlist, movers and chart review.",
      "de": "Charts is the visual execution terminal: ticker, TradingView chart, watchlist, movers and chart review.",
      "fr": "Charts is the visual execution terminal: ticker, TradingView chart, watchlist, movers and chart review.",
      "es": "Charts is the visual execution terminal: ticker, TradingView chart, watchlist, movers and chart review.",
      "ar": "Charts is the visual execution terminal: ticker, TradingView chart, watchlist, movers and chart review.",
      "it": "Charts is the visual execution terminal: ticker, TradingView chart, watchlist, movers and chart review.",
      "no": "Charts is the visual execution terminal: ticker, TradingView chart, watchlist, movers and chart review.",
      "ka": "Charts is the visual execution terminal: ticker, TradingView chart, watchlist, movers and chart review.",
      "pl": "Charts is the visual execution terminal: ticker, TradingView chart, watchlist, movers and chart review.",
      "tr": "Charts is the visual execution terminal: ticker, TradingView chart, watchlist, movers and chart review.",
      "el": "Charts is the visual execution terminal: ticker, TradingView chart, watchlist, movers and chart review.",
      "hi": "Charts is the visual execution terminal: ticker, TradingView chart, watchlist, movers and chart review."
    },
    "value": {
      "en": "The trader reads structure before acting: levels, zones, volume, timeframe context and invalidation.",
      "ru": "Трейдер читает структуру до входа: уровни, зоны, объём, timeframe context и invalidation.",
      "ua": "Трейдер читає структуру до входу: рівні, зони, обсяг, timeframe context і invalidation.",
      "zh": "The trader reads structure before acting: levels, zones, volume, timeframe context and invalidation.",
      "de": "The trader reads structure before acting: levels, zones, volume, timeframe context and invalidation.",
      "fr": "The trader reads structure before acting: levels, zones, volume, timeframe context and invalidation.",
      "es": "The trader reads structure before acting: levels, zones, volume, timeframe context and invalidation.",
      "ar": "The trader reads structure before acting: levels, zones, volume, timeframe context and invalidation.",
      "it": "The trader reads structure before acting: levels, zones, volume, timeframe context and invalidation.",
      "no": "The trader reads structure before acting: levels, zones, volume, timeframe context and invalidation.",
      "ka": "The trader reads structure before acting: levels, zones, volume, timeframe context and invalidation.",
      "pl": "The trader reads structure before acting: levels, zones, volume, timeframe context and invalidation.",
      "tr": "The trader reads structure before acting: levels, zones, volume, timeframe context and invalidation.",
      "el": "The trader reads structure before acting: levels, zones, volume, timeframe context and invalidation.",
      "hi": "The trader reads structure before acting: levels, zones, volume, timeframe context and invalidation."
    },
    "functions": [
      "Opens symbols and timeframes inside the chart workspace.",
      "Keeps watchlist, movers and ticker context together.",
      "Runs chart review for structure, risk and invalidation."
    ],
    "buttons": [
      [
        "Open chart",
        "Loads ticker/timeframe into the chart terminal."
      ],
      [
        "Run chart review",
        "Reads structure and risk context."
      ],
      [
        "Add ticker",
        "Adds symbol to the watchlist."
      ],
      [
        "Remove ticker",
        "Cuts a symbol from the watchlist."
      ],
      [
        "Movers",
        "Shows active gainers/losers for stocks and crypto."
      ]
    ],
    "power": "Before a trade becomes a trade, it must survive the chart. No structure, no execution."
  },
  {
    "id": "market",
    "route": "/dashboard?tab=market",
    "emoji": "◌",
    "color": "#00C076",
    "terms": [
      "Market Scanner",
      "AI Market Brief",
      "Candidate",
      "Coverage",
      "Attention"
    ],
    "title": {
      "en": "Market",
      "ru": "Market",
      "ua": "Market",
      "zh": "市场",
      "de": "Market",
      "fr": "Market",
      "es": "Market",
      "ar": "Market",
      "it": "Market",
      "no": "Market",
      "ka": "Market",
      "pl": "Market",
      "tr": "Market",
      "el": "Market",
      "hi": "Market"
    },
    "role": {
      "en": "Market scans stocks and crypto, ranks candidates and builds an AI Market Brief from real market context.",
      "ru": "Market сканирует stocks и crypto, ранжирует candidates и строит AI Market Brief из реального market context.",
      "ua": "Market сканує stocks і crypto, ранжує candidates і будує AI Market Brief з реального market context.",
      "zh": "Market scans stocks and crypto, ranks candidates and builds an AI Market Brief from real market context.",
      "de": "Market scans stocks and crypto, ranks candidates and builds an AI Market Brief from real market context.",
      "fr": "Market scans stocks and crypto, ranks candidates and builds an AI Market Brief from real market context.",
      "es": "Market scans stocks and crypto, ranks candidates and builds an AI Market Brief from real market context.",
      "ar": "Market scans stocks and crypto, ranks candidates and builds an AI Market Brief from real market context.",
      "it": "Market scans stocks and crypto, ranks candidates and builds an AI Market Brief from real market context.",
      "no": "Market scans stocks and crypto, ranks candidates and builds an AI Market Brief from real market context.",
      "ka": "Market scans stocks and crypto, ranks candidates and builds an AI Market Brief from real market context.",
      "pl": "Market scans stocks and crypto, ranks candidates and builds an AI Market Brief from real market context.",
      "tr": "Market scans stocks and crypto, ranks candidates and builds an AI Market Brief from real market context.",
      "el": "Market scans stocks and crypto, ranks candidates and builds an AI Market Brief from real market context.",
      "hi": "Market scans stocks and crypto, ranks candidates and builds an AI Market Brief from real market context."
    },
    "value": {
      "en": "The trader sees where the market is active before wasting energy on dead tickers.",
      "ru": "Трейдер видит, где рынок живой, до того как тратить энергию на мёртвые тикеры.",
      "ua": "Трейдер бачить, де ринок живий, перш ніж витрачати енергію на мертві тікери.",
      "zh": "The trader sees where the market is active before wasting energy on dead tickers.",
      "de": "The trader sees where the market is active before wasting energy on dead tickers.",
      "fr": "The trader sees where the market is active before wasting energy on dead tickers.",
      "es": "The trader sees where the market is active before wasting energy on dead tickers.",
      "ar": "The trader sees where the market is active before wasting energy on dead tickers.",
      "it": "The trader sees where the market is active before wasting energy on dead tickers.",
      "no": "The trader sees where the market is active before wasting energy on dead tickers.",
      "ka": "The trader sees where the market is active before wasting energy on dead tickers.",
      "pl": "The trader sees where the market is active before wasting energy on dead tickers.",
      "tr": "The trader sees where the market is active before wasting energy on dead tickers.",
      "el": "The trader sees where the market is active before wasting energy on dead tickers.",
      "hi": "The trader sees where the market is active before wasting energy on dead tickers."
    },
    "functions": [
      "Refreshes stocks, crypto and combined in-play candidates.",
      "Builds AI Market Brief with reason, risk, scenario and invalidation.",
      "Shows data coverage so the trader knows what source drives each score."
    ],
    "buttons": [
      [
        "Refresh all",
        "Runs the scanner again."
      ],
      [
        "Scanner",
        "Opens the candidate table."
      ],
      [
        "AI Market Brief",
        "Builds the ranked desk brief."
      ],
      [
        "Data coverage",
        "Shows market/social/news source transparency."
      ],
      [
        "Analyze top",
        "Sends top candidates into the briefing layer."
      ]
    ],
    "power": "Use Market to choose the battlefield. Signals are for triggers; Market is for attention and context."
  },
  {
    "id": "alerts",
    "route": "/dashboard?tab=signals",
    "emoji": "⚡",
    "color": "#F59E0B",
    "terms": [
      "Signals Desk",
      "Entry Zone",
      "TP1 / TP2 / TP3",
      "Stop",
      "Outcome"
    ],
    "title": {
      "en": "Signals",
      "ru": "Signals",
      "ua": "Signals",
      "zh": "信号",
      "de": "Signals",
      "fr": "Signals",
      "es": "Signals",
      "ar": "Signals",
      "it": "Signals",
      "no": "Signals",
      "ka": "Signals",
      "pl": "Signals",
      "tr": "Signals",
      "el": "Signals",
      "hi": "Signals"
    },
    "role": {
      "en": "Signals Desk shows actionable setups only when the market gives a trigger, entry zone, stop, targets and risk note.",
      "ru": "Signals Desk показывает actionable setups только когда рынок даёт trigger, entry zone, stop, targets и risk note.",
      "ua": "Signals Desk показує actionable setups тільки коли ринок дає trigger, entry zone, stop, targets і risk note.",
      "zh": "Signals Desk shows actionable setups only when the market gives a trigger, entry zone, stop, targets and risk note.",
      "de": "Signals Desk shows actionable setups only when the market gives a trigger, entry zone, stop, targets and risk note.",
      "fr": "Signals Desk shows actionable setups only when the market gives a trigger, entry zone, stop, targets and risk note.",
      "es": "Signals Desk shows actionable setups only when the market gives a trigger, entry zone, stop, targets and risk note.",
      "ar": "Signals Desk shows actionable setups only when the market gives a trigger, entry zone, stop, targets and risk note.",
      "it": "Signals Desk shows actionable setups only when the market gives a trigger, entry zone, stop, targets and risk note.",
      "no": "Signals Desk shows actionable setups only when the market gives a trigger, entry zone, stop, targets and risk note.",
      "ka": "Signals Desk shows actionable setups only when the market gives a trigger, entry zone, stop, targets and risk note.",
      "pl": "Signals Desk shows actionable setups only when the market gives a trigger, entry zone, stop, targets and risk note.",
      "tr": "Signals Desk shows actionable setups only when the market gives a trigger, entry zone, stop, targets and risk note.",
      "el": "Signals Desk shows actionable setups only when the market gives a trigger, entry zone, stop, targets and risk note.",
      "hi": "Signals Desk shows actionable setups only when the market gives a trigger, entry zone, stop, targets and risk note."
    },
    "value": {
      "en": "The trader receives a plan, not noise: direction, reason, invalidation, targets and later the real outcome.",
      "ru": "Трейдер получает план, а не шум: direction, reason, invalidation, targets и позже реальный outcome.",
      "ua": "Трейдер отримує план, а не шум: direction, reason, invalidation, targets і пізніше реальний outcome.",
      "zh": "The trader receives a plan, not noise: direction, reason, invalidation, targets and later the real outcome.",
      "de": "The trader receives a plan, not noise: direction, reason, invalidation, targets and later the real outcome.",
      "fr": "The trader receives a plan, not noise: direction, reason, invalidation, targets and later the real outcome.",
      "es": "The trader receives a plan, not noise: direction, reason, invalidation, targets and later the real outcome.",
      "ar": "The trader receives a plan, not noise: direction, reason, invalidation, targets and later the real outcome.",
      "it": "The trader receives a plan, not noise: direction, reason, invalidation, targets and later the real outcome.",
      "no": "The trader receives a plan, not noise: direction, reason, invalidation, targets and later the real outcome.",
      "ka": "The trader receives a plan, not noise: direction, reason, invalidation, targets and later the real outcome.",
      "pl": "The trader receives a plan, not noise: direction, reason, invalidation, targets and later the real outcome.",
      "tr": "The trader receives a plan, not noise: direction, reason, invalidation, targets and later the real outcome.",
      "el": "The trader receives a plan, not noise: direction, reason, invalidation, targets and later the real outcome.",
      "hi": "The trader receives a plan, not noise: direction, reason, invalidation, targets and later the real outcome."
    },
    "functions": [
      "Shows live signal cards with ticker, setup, entry, stop, TP1/TP2/TP3 and R:R.",
      "Tracks outcome after the signal: entry touched, TP hit, stop hit, MFE, MAE.",
      "Builds setup performance table from market outcome, not from whether the trader clicked the trade."
    ],
    "buttons": [
      [
        "Open analysis",
        "Expands the full desk reasoning."
      ],
      [
        "Create trade from signal",
        "Creates a Journal trade from the alert plan."
      ],
      [
        "Save to playbook",
        "Saves the signal logic as evidence."
      ],
      [
        "Check outcomes",
        "Runs the backend outcome checker."
      ],
      [
        "Open setup table",
        "Shows which setups actually work over history."
      ]
    ],
    "power": "Signals are not calls to gamble. They are trade plans. If the setup is late or invalidated, the correct move is no trade."
  },
  {
    "id": "coach",
    "route": "/dashboard?tab=coach",
    "emoji": "✦",
    "color": "#A78BFA",
    "terms": [
      "Desk Mentor",
      "Risk-First Review",
      "Coach History",
      "Rule Check",
      "Execution Feedback"
    ],
    "title": {
      "en": "Desk Coach",
      "ru": "Desk Coach",
      "ua": "Desk Coach",
      "zh": "Desk Coach",
      "de": "Desk Coach",
      "fr": "Desk Coach",
      "es": "Desk Coach",
      "ar": "Desk Coach",
      "it": "Desk Coach",
      "no": "Desk Coach",
      "ka": "Desk Coach",
      "pl": "Desk Coach",
      "tr": "Desk Coach",
      "el": "Desk Coach",
      "hi": "Desk Coach"
    },
    "role": {
      "en": "Desk Coach answers trading questions, reviews process and keeps the trader inside risk-first thinking.",
      "ru": "Desk Coach отвечает на trading-вопросы, разбирает процесс и держит трейдера в risk-first мышлении.",
      "ua": "Desk Coach відповідає на trading-питання, розбирає процес і тримає трейдера в risk-first мисленні.",
      "zh": "Desk Coach answers trading questions, reviews process and keeps the trader inside risk-first thinking.",
      "de": "Desk Coach answers trading questions, reviews process and keeps the trader inside risk-first thinking.",
      "fr": "Desk Coach answers trading questions, reviews process and keeps the trader inside risk-first thinking.",
      "es": "Desk Coach answers trading questions, reviews process and keeps the trader inside risk-first thinking.",
      "ar": "Desk Coach answers trading questions, reviews process and keeps the trader inside risk-first thinking.",
      "it": "Desk Coach answers trading questions, reviews process and keeps the trader inside risk-first thinking.",
      "no": "Desk Coach answers trading questions, reviews process and keeps the trader inside risk-first thinking.",
      "ka": "Desk Coach answers trading questions, reviews process and keeps the trader inside risk-first thinking.",
      "pl": "Desk Coach answers trading questions, reviews process and keeps the trader inside risk-first thinking.",
      "tr": "Desk Coach answers trading questions, reviews process and keeps the trader inside risk-first thinking.",
      "el": "Desk Coach answers trading questions, reviews process and keeps the trader inside risk-first thinking.",
      "hi": "Desk Coach answers trading questions, reviews process and keeps the trader inside risk-first thinking."
    },
    "value": {
      "en": "The trader gets strict feedback before repeating the same mistake for the tenth time.",
      "ru": "Трейдер получает жёсткий feedback до того, как повторит одну и ту же ошибку в десятый раз.",
      "ua": "Трейдер отримує жорсткий feedback до того, як повторить одну й ту саму помилку десятий раз.",
      "zh": "The trader gets strict feedback before repeating the same mistake for the tenth time.",
      "de": "The trader gets strict feedback before repeating the same mistake for the tenth time.",
      "fr": "The trader gets strict feedback before repeating the same mistake for the tenth time.",
      "es": "The trader gets strict feedback before repeating the same mistake for the tenth time.",
      "ar": "The trader gets strict feedback before repeating the same mistake for the tenth time.",
      "it": "The trader gets strict feedback before repeating the same mistake for the tenth time.",
      "no": "The trader gets strict feedback before repeating the same mistake for the tenth time.",
      "ka": "The trader gets strict feedback before repeating the same mistake for the tenth time.",
      "pl": "The trader gets strict feedback before repeating the same mistake for the tenth time.",
      "tr": "The trader gets strict feedback before repeating the same mistake for the tenth time.",
      "el": "The trader gets strict feedback before repeating the same mistake for the tenth time.",
      "hi": "The trader gets strict feedback before repeating the same mistake for the tenth time."
    },
    "functions": [
      "Answers questions in trading desk language.",
      "Connects the answer to risk, strategy, journal and execution.",
      "Keeps review history for later process work."
    ],
    "buttons": [
      [
        "Ask Desk Mentor",
        "Focuses the question field."
      ],
      [
        "Risk-first",
        "Opens risk rules before the answer gets soft."
      ],
      [
        "History",
        "Shows previous desk reviews."
      ],
      [
        "Send",
        "Sends the question into the mentor flow."
      ]
    ],
    "power": "Use Coach to clarify decisions, not to justify impulse. The desk cuts excuses."
  },
  {
    "id": "learning",
    "route": "/dashboard?tab=learning",
    "emoji": "◫",
    "color": "#60A5FA",
    "terms": [
      "Training Desk",
      "Module",
      "Lesson",
      "Drill",
      "Progress"
    ],
    "title": {
      "en": "Learning",
      "ru": "Learning",
      "ua": "Learning",
      "zh": "学习",
      "de": "Learning",
      "fr": "Learning",
      "es": "Learning",
      "ar": "Learning",
      "it": "Learning",
      "no": "Learning",
      "ka": "Learning",
      "pl": "Learning",
      "tr": "Learning",
      "el": "Learning",
      "hi": "Learning"
    },
    "role": {
      "en": "Learning keeps the trader’s base sharp: market mechanics, levels, risk, momentum, psychology and setups.",
      "ru": "Learning держит базу трейдера острой: market mechanics, уровни, риск, momentum, психология и setups.",
      "ua": "Learning тримає базу трейдера гострою: market mechanics, рівні, ризик, momentum, психологія і setups.",
      "zh": "Learning keeps the trader’s base sharp: market mechanics, levels, risk, momentum, psychology and setups.",
      "de": "Learning keeps the trader’s base sharp: market mechanics, levels, risk, momentum, psychology and setups.",
      "fr": "Learning keeps the trader’s base sharp: market mechanics, levels, risk, momentum, psychology and setups.",
      "es": "Learning keeps the trader’s base sharp: market mechanics, levels, risk, momentum, psychology and setups.",
      "ar": "Learning keeps the trader’s base sharp: market mechanics, levels, risk, momentum, psychology and setups.",
      "it": "Learning keeps the trader’s base sharp: market mechanics, levels, risk, momentum, psychology and setups.",
      "no": "Learning keeps the trader’s base sharp: market mechanics, levels, risk, momentum, psychology and setups.",
      "ka": "Learning keeps the trader’s base sharp: market mechanics, levels, risk, momentum, psychology and setups.",
      "pl": "Learning keeps the trader’s base sharp: market mechanics, levels, risk, momentum, psychology and setups.",
      "tr": "Learning keeps the trader’s base sharp: market mechanics, levels, risk, momentum, psychology and setups.",
      "el": "Learning keeps the trader’s base sharp: market mechanics, levels, risk, momentum, psychology and setups.",
      "hi": "Learning keeps the trader’s base sharp: market mechanics, levels, risk, momentum, psychology and setups."
    },
    "value": {
      "en": "The trader stops consuming random content and studies only what improves decision quality inside the desk.",
      "ru": "Трейдер перестаёт потреблять случайный контент и учит только то, что усиливает decision quality внутри desk.",
      "ua": "Трейдер перестає споживати випадковий контент і вчить тільки те, що посилює decision quality всередині desk.",
      "zh": "The trader stops consuming random content and studies only what improves decision quality inside the desk.",
      "de": "The trader stops consuming random content and studies only what improves decision quality inside the desk.",
      "fr": "The trader stops consuming random content and studies only what improves decision quality inside the desk.",
      "es": "The trader stops consuming random content and studies only what improves decision quality inside the desk.",
      "ar": "The trader stops consuming random content and studies only what improves decision quality inside the desk.",
      "it": "The trader stops consuming random content and studies only what improves decision quality inside the desk.",
      "no": "The trader stops consuming random content and studies only what improves decision quality inside the desk.",
      "ka": "The trader stops consuming random content and studies only what improves decision quality inside the desk.",
      "pl": "The trader stops consuming random content and studies only what improves decision quality inside the desk.",
      "tr": "The trader stops consuming random content and studies only what improves decision quality inside the desk.",
      "el": "The trader stops consuming random content and studies only what improves decision quality inside the desk.",
      "hi": "The trader stops consuming random content and studies only what improves decision quality inside the desk."
    },
    "functions": [
      "Runs modules, lessons, drills and progress tracking.",
      "Connects theory to chart examples and journal behavior.",
      "Keeps next lesson and active module ready."
    ],
    "buttons": [
      [
        "Continue drill",
        "Opens the next active lesson."
      ],
      [
        "Open modules",
        "Shows the training library."
      ],
      [
        "Open route",
        "Shows the roadmap."
      ],
      [
        "Mark drill complete",
        "Locks progress and moves forward."
      ]
    ],
    "power": "Training is only useful when it returns to execution. Every lesson must become a rule, screenshot or better decision."
  },
  {
    "id": "reports",
    "route": "/dashboard?tab=reports",
    "emoji": "▧",
    "color": "#C8A96B",
    "terms": [
      "Reports Desk",
      "Sample",
      "Profit Factor",
      "Equity Curve",
      "Leak"
    ],
    "title": {
      "en": "Reports",
      "ru": "Reports",
      "ua": "Reports",
      "zh": "报告",
      "de": "Reports",
      "fr": "Reports",
      "es": "Reports",
      "ar": "Reports",
      "it": "Reports",
      "no": "Reports",
      "ka": "Reports",
      "pl": "Reports",
      "tr": "Reports",
      "el": "Reports",
      "hi": "Reports"
    },
    "role": {
      "en": "Reports converts journal data into performance, setup quality, leaks, strengths and next focus.",
      "ru": "Reports превращает журнал в performance, качество setup, leaks, сильные стороны и следующий focus.",
      "ua": "Reports перетворює журнал на performance, якість setup, leaks, сильні сторони та наступний focus.",
      "zh": "Reports converts journal data into performance, setup quality, leaks, strengths and next focus.",
      "de": "Reports converts journal data into performance, setup quality, leaks, strengths and next focus.",
      "fr": "Reports converts journal data into performance, setup quality, leaks, strengths and next focus.",
      "es": "Reports converts journal data into performance, setup quality, leaks, strengths and next focus.",
      "ar": "Reports converts journal data into performance, setup quality, leaks, strengths and next focus.",
      "it": "Reports converts journal data into performance, setup quality, leaks, strengths and next focus.",
      "no": "Reports converts journal data into performance, setup quality, leaks, strengths and next focus.",
      "ka": "Reports converts journal data into performance, setup quality, leaks, strengths and next focus.",
      "pl": "Reports converts journal data into performance, setup quality, leaks, strengths and next focus.",
      "tr": "Reports converts journal data into performance, setup quality, leaks, strengths and next focus.",
      "el": "Reports converts journal data into performance, setup quality, leaks, strengths and next focus.",
      "hi": "Reports converts journal data into performance, setup quality, leaks, strengths and next focus."
    },
    "value": {
      "en": "The trader stops guessing. The sample shows what pays, what leaks and what must be cut.",
      "ru": "Трейдер перестаёт гадать. Sample показывает, что платит, где leaks и что надо резать.",
      "ua": "Трейдер перестає гадати. Sample показує, що платить, де leaks і що треба різати.",
      "zh": "The trader stops guessing. The sample shows what pays, what leaks and what must be cut.",
      "de": "The trader stops guessing. The sample shows what pays, what leaks and what must be cut.",
      "fr": "The trader stops guessing. The sample shows what pays, what leaks and what must be cut.",
      "es": "The trader stops guessing. The sample shows what pays, what leaks and what must be cut.",
      "ar": "The trader stops guessing. The sample shows what pays, what leaks and what must be cut.",
      "it": "The trader stops guessing. The sample shows what pays, what leaks and what must be cut.",
      "no": "The trader stops guessing. The sample shows what pays, what leaks and what must be cut.",
      "ka": "The trader stops guessing. The sample shows what pays, what leaks and what must be cut.",
      "pl": "The trader stops guessing. The sample shows what pays, what leaks and what must be cut.",
      "tr": "The trader stops guessing. The sample shows what pays, what leaks and what must be cut.",
      "el": "The trader stops guessing. The sample shows what pays, what leaks and what must be cut.",
      "hi": "The trader stops guessing. The sample shows what pays, what leaks and what must be cut."
    },
    "functions": [
      "Builds PnL, win rate, profit factor, equity curve and breakdowns.",
      "Filters by period, market, direction and setup.",
      "Generates a desk report from the selected sample."
    ],
    "buttons": [
      [
        "Open filters",
        "Shows period/market/direction/setup filters."
      ],
      [
        "Reset filters",
        "Returns to the full sample."
      ],
      [
        "Build report",
        "Generates the desk report."
      ],
      [
        "Export",
        "Downloads report data when available."
      ]
    ],
    "power": "Use Reports after the session and at the end of the week. Numbers decide; mood does not."
  },
  {
    "id": "billing",
    "route": "/dashboard?tab=account",
    "emoji": "◍",
    "color": "#94A3B8",
    "terms": [
      "Access",
      "Plan",
      "AI Capacity",
      "Referral",
      "Payout"
    ],
    "title": {
      "en": "Account",
      "ru": "Account",
      "ua": "Account",
      "zh": "账户",
      "de": "Account",
      "fr": "Compte",
      "es": "Cuenta",
      "ar": "الحساب",
      "it": "Account",
      "no": "Konto",
      "ka": "Account",
      "pl": "Konto",
      "tr": "Hesap",
      "el": "Λογαριασμός",
      "hi": "Account"
    },
    "role": {
      "en": "Account controls access, plan level, AI capacity, referral balance and payout requests.",
      "ru": "Account контролирует доступ, тариф, AI capacity, referral balance и заявки на payout.",
      "ua": "Account контролює доступ, тариф, AI capacity, referral balance і заявки на payout.",
      "zh": "Account controls access, plan level, AI capacity, referral balance and payout requests.",
      "de": "Account controls access, plan level, AI capacity, referral balance and payout requests.",
      "fr": "Account controls access, plan level, AI capacity, referral balance and payout requests.",
      "es": "Account controls access, plan level, AI capacity, referral balance and payout requests.",
      "ar": "Account controls access, plan level, AI capacity, referral balance and payout requests.",
      "it": "Account controls access, plan level, AI capacity, referral balance and payout requests.",
      "no": "Account controls access, plan level, AI capacity, referral balance and payout requests.",
      "ka": "Account controls access, plan level, AI capacity, referral balance and payout requests.",
      "pl": "Account controls access, plan level, AI capacity, referral balance and payout requests.",
      "tr": "Account controls access, plan level, AI capacity, referral balance and payout requests.",
      "el": "Account controls access, plan level, AI capacity, referral balance and payout requests.",
      "hi": "Account controls access, plan level, AI capacity, referral balance and payout requests."
    },
    "value": {
      "en": "The trader sees exactly what is active, what is limited and where the account needs action.",
      "ru": "Трейдер видит, что активно, что ограничено и где аккаунту нужно действие.",
      "ua": "Трейдер бачить, що активне, що обмежене і де акаунту потрібна дія.",
      "zh": "The trader sees exactly what is active, what is limited and where the account needs action.",
      "de": "The trader sees exactly what is active, what is limited and where the account needs action.",
      "fr": "The trader sees exactly what is active, what is limited and where the account needs action.",
      "es": "The trader sees exactly what is active, what is limited and where the account needs action.",
      "ar": "The trader sees exactly what is active, what is limited and where the account needs action.",
      "it": "The trader sees exactly what is active, what is limited and where the account needs action.",
      "no": "The trader sees exactly what is active, what is limited and where the account needs action.",
      "ka": "The trader sees exactly what is active, what is limited and where the account needs action.",
      "pl": "The trader sees exactly what is active, what is limited and where the account needs action.",
      "tr": "The trader sees exactly what is active, what is limited and where the account needs action.",
      "el": "The trader sees exactly what is active, what is limited and where the account needs action.",
      "hi": "The trader sees exactly what is active, what is limited and where the account needs action."
    },
    "functions": [
      "Shows subscription access, plan status and usage capacity.",
      "Manages referral link, balance, invited users and withdrawal requests.",
      "Opens plans and upgrade path when the trader needs more desk power."
    ],
    "buttons": [
      [
        "Access",
        "Shows current account gate and subscription status."
      ],
      [
        "Referral",
        "Opens referral balance, invited users and payout flow."
      ],
      [
        "Plans",
        "Opens pricing/upgrade layer."
      ],
      [
        "Withdraw",
        "Creates a referral payout request when balance is eligible."
      ]
    ],
    "power": "Account is operational control. No hidden confusion: access, limits, payouts and upgrade path stay visible."
  }
] as const satisfies readonly DashboardGuideTab[];
const GROWTH_PLAN = {
  "en": [
    "Open Overview before the session and read the Daily Trading Plan.",
    "Scan Market for live candidates; do not chase dead tickers.",
    "Use Signals only when entry, stop, TP and invalidation are clear.",
    "Log every execution in Journal within minutes, not hours.",
    "Attach screenshots as evidence; no screenshot means weak review.",
    "Run Strategy OS around one setup until the playbook has proof.",
    "End the day with Reports and Debrief. Upgrade rules from facts."
  ],
  "ru": [
    "Перед сессией открывай Главную и читай Daily Trading Plan.",
    "Сканируй Market и выбирай живые candidates; мёртвые тикеры не трогай.",
    "Signals используй только когда есть entry, stop, TP и invalidation.",
    "Каждую сделку фиксируй в Journal через минуты, а не вечером по памяти.",
    "Прикрепляй скрины как evidence; без скрина review слабый.",
    "Strategy OS веди вокруг одного setup, пока playbook не получит доказательства.",
    "Закрывай день через Reports и Debrief. Правила усиливаются фактами."
  ],
  "ua": [
    "Перед сесією відкривай Головну і читай Daily Trading Plan.",
    "Скануй Market і вибирай живі candidates; мертві тикери не чіпай.",
    "Signals використовуй тільки коли є entry, stop, TP і invalidation.",
    "Кожну угоду фіксуй у Journal через хвилини, а не ввечері по пам’яті.",
    "Додавай скрини як evidence; без скрина review слабкий.",
    "Strategy OS веди навколо одного setup, доки playbook не отримає докази.",
    "Закривай день через Reports і Debrief. Правила посилюються фактами."
  ]
} as const;
const GLOSSARY = [
  {
    "term": "Desk",
    "en": "The command environment where planning, execution, review and risk control run together.",
    "ru": "Рабочая среда, где план, execution, review и risk control работают вместе.",
    "ua": "Робоче середовище, де план, execution, review і risk control працюють разом."
  },
  {
    "term": "Edge",
    "en": "A repeatable advantage proven by data, not by one lucky trade.",
    "ru": "Повторяемое преимущество, подтверждённое данными, а не одной случайной сделкой.",
    "ua": "Повторювана перевага, підтверджена даними, а не однією випадковою угодою."
  },
  {
    "term": "Setup",
    "en": "A structured market situation with context, trigger, entry, stop and invalidation.",
    "ru": "Структурная рыночная ситуация с context, trigger, entry, stop и invalidation.",
    "ua": "Структурна ринкова ситуація з context, trigger, entry, stop та invalidation."
  },
  {
    "term": "Playbook",
    "en": "The trader’s operating manual for approved setups and process rules.",
    "ru": "Операционный мануал трейдера по разрешённым setups и правилам процесса.",
    "ua": "Операційний мануал трейдера по дозволених setups і правилах процесу."
  },
  {
    "term": "Journal",
    "en": "The source of truth for trades, screenshots, mistakes and results.",
    "ru": "Источник правды по сделкам, скринам, ошибкам и результатам.",
    "ua": "Джерело правди по угодах, скринах, помилках і результатах."
  },
  {
    "term": "Evidence",
    "en": "Screenshots, examples and trade records proving that a setup or rule is real.",
    "ru": "Скрины, примеры и записи сделок, которые доказывают, что setup или правило реальны.",
    "ua": "Скрини, приклади та записи угод, які доводять, що setup або правило реальні."
  },
  {
    "term": "Execution",
    "en": "How the trader actually enters, manages and exits the trade.",
    "ru": "Как трейдер реально входит, ведёт и закрывает сделку.",
    "ua": "Як трейдер реально входить, веде і закриває угоду."
  },
  {
    "term": "Entry Zone",
    "en": "The price area where the trade is allowed; outside it, risk changes.",
    "ru": "Зона цены, где сделка разрешена; за её пределами меняется риск.",
    "ua": "Зона ціни, де угода дозволена; за її межами змінюється ризик."
  },
  {
    "term": "Trigger",
    "en": "The event that activates the trade idea: reclaim, rejection, break, sweep or confirmation.",
    "ru": "Событие, которое активирует идею: reclaim, rejection, break, sweep или confirmation.",
    "ua": "Подія, яка активує ідею: reclaim, rejection, break, sweep або confirmation."
  },
  {
    "term": "Invalidation",
    "en": "The condition that kills the trade idea. No debate after invalidation.",
    "ru": "Условие, которое отменяет торговую идею. После invalidation нет споров.",
    "ua": "Умова, яка скасовує торгову ідею. Після invalidation немає спорів."
  },
  {
    "term": "Stop",
    "en": "The price/risk boundary where the idea is wrong and capital gets protected.",
    "ru": "Граница риска, где идея неверна и капитал защищается.",
    "ua": "Межа ризику, де ідея неправильна і капітал захищається."
  },
  {
    "term": "TP1 / TP2 / TP3",
    "en": "Target zones where the signal plan expects partial or full profit taking.",
    "ru": "Целевые зоны, где план сигнала ждёт частичной или полной фиксации.",
    "ua": "Цільові зони, де план сигналу очікує часткову або повну фіксацію."
  },
  {
    "term": "R:R",
    "en": "Risk-to-reward ratio. It shows if the potential reward is worth the stop risk.",
    "ru": "Соотношение риска к прибыли. Показывает, стоит ли потенциал размера стопа.",
    "ua": "Співвідношення ризику до прибутку. Показує, чи вартий потенціал розміру стопа."
  },
  {
    "term": "MFE",
    "en": "Maximum Favorable Excursion: best unrealized move after entry/signal.",
    "ru": "Максимальное движение в плюс после входа/сигнала.",
    "ua": "Максимальний рух у плюс після входу/сигналу."
  },
  {
    "term": "MAE",
    "en": "Maximum Adverse Excursion: worst move against the trade before outcome.",
    "ru": "Максимальное движение против сделки до outcome.",
    "ua": "Максимальний рух проти угоди до outcome."
  },
  {
    "term": "Outcome",
    "en": "What the market did after the signal: entry touched, TP hit, stop hit, no entry or pending.",
    "ru": "Что рынок сделал после сигнала: entry touched, TP, stop, no entry или pending.",
    "ua": "Що ринок зробив після сигналу: entry touched, TP, stop, no entry або pending."
  },
  {
    "term": "Confluence Score",
    "en": "The quality score built from context, volume, structure, catalyst, risk and setup fit.",
    "ru": "Оценка качества из context, volume, structure, catalyst, risk и совпадения setup.",
    "ua": "Оцінка якості з context, volume, structure, catalyst, risk і збігу setup."
  },
  {
    "term": "Signal Tape",
    "en": "The live stream of actionable alerts and their outcome states.",
    "ru": "Живая лента actionable alerts и их outcome states.",
    "ua": "Жива стрічка actionable alerts та їх outcome states."
  },
  {
    "term": "Readiness",
    "en": "How ready the trader/system is for the next action based on data quality and process.",
    "ru": "Готовность трейдера/системы к следующему действию по качеству данных и процессу.",
    "ua": "Готовність трейдера/системи до наступної дії за якістю даних і процесом."
  },
  {
    "term": "Leak",
    "en": "A repeated mistake that drains PnL or ruins execution quality.",
    "ru": "Повторяющаяся ошибка, которая сливает PnL или ломает execution.",
    "ua": "Повторювана помилка, яка зливає PnL або ламає execution."
  },
  {
    "term": "Pre-Trade Gate",
    "en": "The checklist before entry: setup, risk, stop, target, timing and personal rule check.",
    "ru": "Фильтр перед входом: setup, risk, stop, target, timing и личные правила.",
    "ua": "Фільтр перед входом: setup, risk, stop, target, timing і особисті правила."
  },
  {
    "term": "Debrief",
    "en": "The after-session or after-trade review that converts experience into rules.",
    "ru": "Разбор после сделки/сессии, который превращает опыт в правила.",
    "ua": "Розбір після угоди/сесії, який перетворює досвід на правила."
  },
  {
    "term": "Strategy Trust",
    "en": "How much evidence supports a strategy before it graduates to playbook status.",
    "ru": "Сколько evidence поддерживает стратегию до перевода в playbook.",
    "ua": "Скільки evidence підтримує стратегію до переведення в playbook."
  },
  {
    "term": "Data Quality",
    "en": "How complete the journal/evidence base is for reliable analysis.",
    "ru": "Насколько полная база journal/evidence для надёжного анализа.",
    "ua": "Наскільки повна база journal/evidence для надійного аналізу."
  },
  {
    "term": "VWAP",
    "en": "Volume Weighted Average Price. Used as intraday fairness / reaction level.",
    "ru": "Средняя цена по объёму. Рабочий intraday уровень реакции.",
    "ua": "Середня ціна за обсягом. Робочий intraday рівень реакції."
  },
  {
    "term": "Reclaim",
    "en": "Price loses a level, then takes it back and holds; often a continuation trigger.",
    "ru": "Цена теряет уровень, возвращает его и удерживает; часто trigger продолжения.",
    "ua": "Ціна втрачає рівень, повертає його і тримає; часто trigger продовження."
  },
  {
    "term": "Rejection",
    "en": "Price tests a level and fails to accept above/below it.",
    "ru": "Цена тестирует уровень и не принимает его выше/ниже.",
    "ua": "Ціна тестує рівень і не приймається вище/нижче."
  },
  {
    "term": "Breakout",
    "en": "Price breaks a key level with volume and follow-through.",
    "ru": "Цена пробивает ключевой уровень с объёмом и follow-through.",
    "ua": "Ціна пробиває ключовий рівень з обсягом і follow-through."
  },
  {
    "term": "Failed Breakout / Stuff",
    "en": "Breakout attempt fails; buyers/sellers get trapped and reversal risk appears.",
    "ru": "Попытка breakout проваливается; участники trapped и появляется reversal risk.",
    "ua": "Спроба breakout провалюється; учасники trapped і з’являється reversal risk."
  },
  {
    "term": "Gap and Crap",
    "en": "Gap/pump fails to hold and starts fading after early excitement.",
    "ru": "Gap/pump не удерживается и начинает fade после раннего ажиотажа.",
    "ua": "Gap/pump не втримується і починає fade після раннього ажіотажу."
  },
  {
    "term": "Catalyst",
    "en": "News, earnings, offering or event that puts a ticker in play.",
    "ru": "Новость, earnings, offering или событие, которое делает тикер in play.",
    "ua": "Новина, earnings, offering або подія, що робить тикер in play."
  },
  {
    "term": "Liquidity Sweep",
    "en": "Price runs stops/liquidity beyond a level and then reclaims or rejects.",
    "ru": "Цена забирает stops/liquidity за уровнем и потом reclaim/reject.",
    "ua": "Ціна забирає stops/liquidity за рівнем і потім reclaim/reject."
  },
  {
    "term": "SMC",
    "en": "Smart Money Concepts: structure, liquidity, displacement and premium/discount logic.",
    "ru": "Smart Money Concepts: структура, ликвидность, displacement и premium/discount logic.",
    "ua": "Smart Money Concepts: структура, ліквідність, displacement і premium/discount logic."
  },
  {
    "term": "BOS / CHOCH",
    "en": "Break/Change of structure. Used to read trend continuation or reversal.",
    "ru": "Break/Change of structure. Помогает читать продолжение или разворот.",
    "ua": "Break/Change of structure. Допомагає читати продовження або розворот."
  },
  {
    "term": "FVG",
    "en": "Fair Value Gap: imbalance zone that may act as reaction area.",
    "ru": "Fair Value Gap: imbalance-зона, где может быть реакция.",
    "ua": "Fair Value Gap: imbalance-зона, де може бути реакція."
  },
  {
    "term": "Order Block",
    "en": "A prior institutional reaction zone watched for mitigation/reaction.",
    "ru": "Предыдущая институциональная зона реакции для mitigation/reaction.",
    "ua": "Попередня інституційна зона реакції для mitigation/reaction."
  },
  {
    "term": "HTF / LTF",
    "en": "Higher and lower timeframe context. Bias comes from HTF; trigger comes from LTF.",
    "ru": "Старший и младший timeframe. Bias берётся с HTF, trigger — с LTF.",
    "ua": "Старший і молодший timeframe. Bias береться з HTF, trigger — з LTF."
  },
  {
    "term": "Cooldown",
    "en": "A time filter that blocks duplicate or emotional repeated signals.",
    "ru": "Временной фильтр против дублей и эмоциональных повторных сигналов.",
    "ua": "Часовий фільтр проти дублів і емоційних повторних сигналів."
  },
  {
    "term": "Duplicate Guard",
    "en": "Protection that prevents repeated alerts for the same ticker/setup idea.",
    "ru": "Защита от повторных alerts по одному ticker/setup.",
    "ua": "Захист від повторних alerts по одному ticker/setup."
  },
  {
    "term": "Kill Switch",
    "en": "Risk rule that stops trading after predefined loss, tilt or rule violation.",
    "ru": "Риск-правило, которое останавливает торговлю после лимита убытка, tilt или нарушения.",
    "ua": "Ризик-правило, що зупиняє торгівлю після ліміту збитку, tilt або порушення."
  }
] as const;

function getInitialLanguage(): GuideLanguage {
  if (typeof window === "undefined") return "en";
  const saved = window.localStorage.getItem("skillEdgeGuideLanguage") as GuideLanguage | null;
  if (saved && LANGUAGES.some((item) => item.id === saved)) return saved;
  const browser = window.navigator.language.toLowerCase();
  if (browser.startsWith("ru")) return "ru";
  if (browser.startsWith("uk") || browser.startsWith("ua")) return "ua";
  if (browser.startsWith("zh")) return "zh";
  if (browser.startsWith("de")) return "de";
  if (browser.startsWith("fr")) return "fr";
  if (browser.startsWith("es")) return "es";
  if (browser.startsWith("ar")) return "ar";
  if (browser.startsWith("it")) return "it";
  if (browser.startsWith("no") || browser.startsWith("nb") || browser.startsWith("nn")) return "no";
  if (browser.startsWith("ka")) return "ka";
  if (browser.startsWith("pl")) return "pl";
  if (browser.startsWith("tr")) return "tr";
  if (browser.startsWith("el")) return "el";
  if (browser.startsWith("hi")) return "hi";
  return "en";
}

function tr(text: LocalText, language: GuideLanguage) {
  return text[language] || text.en;
}

function ui(language: GuideLanguage) {
  return GUIDE_UI[language] || GUIDE_UI.en;
}

function saveLanguage(language: GuideLanguage) {
  if (typeof window !== "undefined") window.localStorage.setItem("skillEdgeGuideLanguage", language);
}

const wheelGradient = `conic-gradient(
  from -90deg,
  #00C076 0deg 32.72deg,
  #C8A96B 32.72deg 65.44deg,
  #00D084 65.44deg 98.16deg,
  #C8A96B 98.16deg 130.88deg,
  #38BDF8 130.88deg 163.6deg,
  #00C076 163.6deg 196.32deg,
  #F59E0B 196.32deg 229.04deg,
  #A78BFA 229.04deg 261.76deg,
  #60A5FA 261.76deg 294.48deg,
  #C8A96B 294.48deg 327.2deg,
  #94A3B8 327.2deg 360deg
)`;

export default function DashboardGuidePage() {
  const [language, setLanguage] = useState<GuideLanguage>(getInitialLanguage);
  const [activeTab, setActiveTab] = useState<DashboardGuideTabId>("overview");
  const [openIds, setOpenIds] = useState<DashboardGuideTabId[]>(["overview"]);
  const [termSearch, setTermSearch] = useState("");

  const copy = ui(language);
  const active = DASHBOARD_TABS.find((tab) => tab.id === activeTab) || DASHBOARD_TABS[0];
  const activeLanguageMeta = LANGUAGES.find((item) => item.id === language) || LANGUAGES[0];
  const isRtl = activeLanguageMeta.dir === "rtl";

  const filteredTerms = useMemo(() => {
    const query = termSearch.trim().toLowerCase();
    if (!query) return GLOSSARY;
    return GLOSSARY.filter((item) =>
      [item.term, item.en, item.ru, item.ua].join(" ").toLowerCase().includes(query),
    );
  }, [termSearch]);

  const planSteps = GROWTH_PLAN[language as keyof typeof GROWTH_PLAN] || GROWTH_PLAN.en;

  function handleLanguage(next: GuideLanguage) {
    setLanguage(next);
    saveLanguage(next);
  }

  function togglePanel(id: DashboardGuideTabId) {
    setOpenIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
    setActiveTab(id);
  }

  return (
    <main
      dir={isRtl ? "rtl" : "ltr"}
      className="min-h-screen overflow-hidden bg-[#07111F] text-[#E6EDF7] selection:bg-[#00C076]/30"
    >
      <div className="pointer-events-none fixed inset-0 opacity-70">
        <div className="absolute left-1/2 top-[-18rem] h-[42rem] w-[42rem] -translate-x-1/2 rounded-full bg-[#00C076]/15 blur-3xl" />
        <div className="absolute right-[-10rem] top-[18rem] h-[34rem] w-[34rem] rounded-full bg-[#C8A96B]/10 blur-3xl" />
        <div className="absolute bottom-[-12rem] left-[-10rem] h-[30rem] w-[30rem] rounded-full bg-[#38BDF8]/10 blur-3xl" />
      </div>

      <section className="relative mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
        <header className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-5 shadow-2xl shadow-black/30 backdrop-blur-xl sm:p-7 lg:p-9">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-4xl">
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45 }}
                className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#C8A96B]/25 bg-[#C8A96B]/10 px-4 py-2 text-xs font-black uppercase tracking-[0.24em] text-[#C8A96B]"
              >
                <Sparkles className="h-4 w-4" />
                {copy.kicker}
              </motion.div>
              <motion.h1
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.05 }}
                className="max-w-5xl text-4xl font-black tracking-[-0.06em] text-white sm:text-5xl lg:text-7xl"
              >
                {copy.title}
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
                className="mt-5 max-w-4xl text-base font-semibold leading-8 text-[#94A3B8] sm:text-lg"
              >
                {copy.subtitle}
              </motion.p>
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.15 }}
                className="mt-6 rounded-3xl border border-[#00C076]/20 bg-[#00C076]/10 p-5 text-sm font-bold leading-7 text-[#DDF8EE]"
              >
                {copy.heroClaim}
              </motion.div>
            </div>

            <div className="min-w-[18rem] rounded-3xl border border-white/10 bg-[#0F172A]/80 p-4">
              <div className="mb-3 text-xs font-black uppercase tracking-[0.22em] text-[#94A3B8]">{copy.language}</div>
              <div className="grid grid-cols-3 gap-2">
                {LANGUAGES.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleLanguage(item.id)}
                    className={`rounded-2xl border px-3 py-2 text-xs font-black transition ${
                      language === item.id
                        ? "border-[#00C076]/50 bg-[#00C076]/15 text-[#DDF8EE]"
                        : "border-white/10 bg-white/[0.03] text-[#94A3B8] hover:border-white/20 hover:text-white"
                    }`}
                  >
                    {item.short}
                  </button>
                ))}
              </div>
              <div className="mt-4 grid grid-cols-1 gap-2">
                <Link href="/dashboard" className="group inline-flex items-center justify-between rounded-2xl bg-[#00C076] px-4 py-3 text-sm font-black text-[#07111F] transition hover:bg-[#00D084]">
                  {copy.openDashboard} <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                </Link>
                <div className="grid grid-cols-2 gap-2">
                  <Link href="/" className="rounded-2xl border border-white/10 px-4 py-3 text-center text-sm font-black text-white hover:border-[#C8A96B]/40 hover:text-[#C8A96B]">{copy.openHome}</Link>
                  <Link href="/pricing" className="rounded-2xl border border-white/10 px-4 py-3 text-center text-sm font-black text-white hover:border-[#C8A96B]/40 hover:text-[#C8A96B]">{copy.openPricing}</Link>
                </div>
              </div>
            </div>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-[2rem] border border-white/10 bg-[#0F172A]/70 p-5 shadow-2xl shadow-black/30 lg:p-7">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.24em] text-[#C8A96B]">{copy.wheelTitle}</div>
                <p className="mt-2 text-sm font-semibold leading-7 text-[#94A3B8]">{copy.wheelText}</p>
              </div>
              <Compass className="h-7 w-7 text-[#00C076]" />
            </div>

            <div className="relative mx-auto my-8 aspect-square w-full max-w-[34rem]">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 90, repeat: Infinity, ease: "linear" }}
                className="absolute inset-6 rounded-full opacity-80 blur-[1px]"
                style={{ background: wheelGradient }}
              />
              <div className="absolute inset-10 rounded-full border border-white/10 bg-[#07111F] shadow-[inset_0_0_60px_rgba(0,0,0,0.5)]" />
              <div className="absolute inset-[34%] flex flex-col items-center justify-center rounded-full border border-[#C8A96B]/30 bg-[#0F172A] text-center shadow-2xl">
                <div className="text-3xl font-black text-white">11</div>
                <div className="mt-1 text-[10px] font-black uppercase tracking-[0.25em] text-[#C8A96B]">tabs</div>
              </div>

              {DASHBOARD_TABS.map((tab, index) => {
                const angle = (index / DASHBOARD_TABS.length) * Math.PI * 2 - Math.PI / 2;
                const x = 50 + Math.cos(angle) * 43;
                const y = 50 + Math.sin(angle) * 43;
                const isActive = activeTab === tab.id;
                return (
                  <motion.button
                    key={tab.id}
                    type="button"
                    onClick={() => { setActiveTab(tab.id); setOpenIds((current) => current.includes(tab.id) ? current : [...current, tab.id]); }}
                    whileHover={{ scale: 1.08 }}
                    whileTap={{ scale: 0.96 }}
                    className={`absolute flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-2xl border text-center shadow-xl transition sm:h-20 sm:w-20 ${
                      isActive
                        ? "border-[#00C076]/60 bg-[#00C076]/20 text-white shadow-[#00C076]/10"
                        : "border-white/10 bg-[#111C2D]/90 text-[#94A3B8] hover:border-[#C8A96B]/40 hover:text-white"
                    }`}
                    style={{ left: `${x}%`, top: `${y}%` }}
                  >
                    <span className="text-lg">{tab.emoji}</span>
                    <span className="mt-1 max-w-[4.8rem] truncate text-[10px] font-black uppercase tracking-[0.12em]">{tr(tab.title, language)}</span>
                  </motion.button>
                );
              })}
            </div>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={active.id}
              initial={{ opacity: 0, x: isRtl ? -18 : 18 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: isRtl ? 18 : -18 }}
              transition={{ duration: 0.28 }}
              className="rounded-[2rem] border border-[#00C076]/20 bg-[#0F172A]/80 p-5 shadow-2xl shadow-black/30 lg:p-7"
            >
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="text-xs font-black uppercase tracking-[0.24em] text-[#C8A96B]">{copy.selected}</div>
                  <h2 className="mt-2 text-3xl font-black tracking-[-0.04em] text-white sm:text-4xl">{tr(active.title, language)}</h2>
                </div>
                <div className="rounded-3xl border border-white/10 px-4 py-3 text-2xl" style={{ color: active.color }}>{active.emoji}</div>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
                  <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-[#94A3B8]"><Target className="h-4 w-4 text-[#00C076]" />{copy.what}</div>
                  <p className="text-sm font-bold leading-7 text-[#E6EDF7]">{tr(active.role, language)}</p>
                </div>
                <div className="rounded-3xl border border-[#C8A96B]/20 bg-[#C8A96B]/10 p-5">
                  <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-[#C8A96B]"><Gauge className="h-4 w-4" />{copy.value}</div>
                  <p className="text-sm font-bold leading-7 text-[#F5E8C9]">{tr(active.value, language)}</p>
                </div>
              </div>

              <div className="mt-4 rounded-3xl border border-[#00C076]/20 bg-[#00C076]/10 p-5 text-sm font-bold leading-7 text-[#DDF8EE]">
                {active.power}
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-3">
                <Link href={active.route} className="group rounded-3xl bg-[#00C076] px-5 py-4 text-sm font-black text-[#07111F] transition hover:bg-[#00D084]">
                  <span className="flex items-center justify-between">{copy.openTab} <ExternalLink className="h-4 w-4 transition group-hover:translate-x-1" /></span>
                </Link>
                <button type="button" onClick={() => togglePanel(active.id)} className="rounded-3xl border border-white/10 px-5 py-4 text-sm font-black text-white transition hover:border-[#C8A96B]/40 hover:text-[#C8A96B]">
                  {openIds.includes(active.id) ? copy.collapse : copy.expand}
                </button>
                <Link href="/dashboard" className="rounded-3xl border border-white/10 px-5 py-4 text-center text-sm font-black text-white transition hover:border-[#00C076]/40 hover:text-[#00D084]">
                  {copy.openDashboard}
                </Link>
              </div>
            </motion.div>
          </AnimatePresence>
        </section>

        <section className="grid gap-4">
          {DASHBOARD_TABS.map((tab) => {
            const isOpen = openIds.includes(tab.id);
            return (
              <motion.article
                key={tab.id}
                layout
                className="overflow-hidden rounded-[2rem] border border-white/10 bg-[#0F172A]/70 shadow-xl shadow-black/20"
              >
                <button type="button" onClick={() => togglePanel(tab.id)} className="flex w-full items-center justify-between gap-4 p-5 text-left transition hover:bg-white/[0.03] sm:p-6">
                  <div className="flex min-w-0 items-center gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-xl" style={{ color: tab.color }}>{tab.emoji}</div>
                    <div className="min-w-0">
                      <h3 className="truncate text-xl font-black tracking-[-0.03em] text-white">{tr(tab.title, language)}</h3>
                      <p className="mt-1 line-clamp-2 text-sm font-semibold leading-6 text-[#94A3B8]">{tr(tab.role, language)}</p>
                    </div>
                  </div>
                  <ChevronDown className={`h-5 w-5 shrink-0 text-[#94A3B8] transition ${isOpen ? "rotate-180" : ""}`} />
                </button>

                <AnimatePresence initial={false}>
                  {isOpen ? (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25 }}
                      className="border-t border-white/10"
                    >
                      <div className="grid gap-4 p-5 sm:p-6 lg:grid-cols-3">
                        <div className="rounded-3xl border border-white/10 bg-[#07111F]/60 p-5">
                          <div className="mb-3 text-xs font-black uppercase tracking-[0.2em] text-[#00D084]">{copy.functions}</div>
                          <ul className="space-y-3">
                            {tab.functions.map((item) => (
                              <li key={item} className="flex gap-3 text-sm font-semibold leading-6 text-[#D6DEE9]"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#00C076]" />{item}</li>
                            ))}
                          </ul>
                        </div>

                        <div className="rounded-3xl border border-white/10 bg-[#07111F]/60 p-5">
                          <div className="mb-3 text-xs font-black uppercase tracking-[0.2em] text-[#C8A96B]">{copy.buttons}</div>
                          <div className="space-y-3">
                            {tab.buttons.map(([label, action]) => (
                              <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.035] p-3">
                                <div className="text-sm font-black text-white">{label}</div>
                                <div className="mt-1 text-xs font-semibold leading-5 text-[#94A3B8]">{action}</div>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="rounded-3xl border border-white/10 bg-[#07111F]/60 p-5">
                          <div className="mb-3 text-xs font-black uppercase tracking-[0.2em] text-[#94A3B8]">{copy.terms}</div>
                          <div className="flex flex-wrap gap-2">
                            {tab.terms.map((term) => (
                              <span key={term} className="rounded-full border border-[#C8A96B]/20 bg-[#C8A96B]/10 px-3 py-2 text-xs font-black text-[#F5E8C9]">{term}</span>
                            ))}
                          </div>
                          <Link href={tab.route} className="mt-5 inline-flex w-full items-center justify-between rounded-2xl border border-[#00C076]/30 bg-[#00C076]/10 px-4 py-3 text-sm font-black text-[#DDF8EE] transition hover:bg-[#00C076]/20">
                            {copy.openTab} <ArrowRight className="h-4 w-4" />
                          </Link>
                        </div>
                      </div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </motion.article>
            );
          })}
        </section>

        <section className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="rounded-[2rem] border border-[#00C076]/20 bg-[#00C076]/10 p-6">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#00C076]/25 bg-[#00C076]/10 px-4 py-2 text-xs font-black uppercase tracking-[0.22em] text-[#A7F3D0]"><ShieldCheck className="h-4 w-4" />{copy.planTitle}</div>
            <p className="text-sm font-bold leading-7 text-[#DDF8EE]">{copy.planIntro}</p>
          </div>
          <div className="grid gap-3">
            {planSteps.map((step, index) => (
              <motion.div
                key={step}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.25, delay: index * 0.03 }}
                className="flex gap-4 rounded-3xl border border-white/10 bg-white/[0.04] p-4"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-[#C8A96B]/15 text-sm font-black text-[#C8A96B]">{index + 1}</div>
                <p className="text-sm font-bold leading-6 text-[#E6EDF7]">{step}</p>
              </motion.div>
            ))}
          </div>
        </section>

        <section className="rounded-[2rem] border border-white/10 bg-[#0F172A]/75 p-5 shadow-2xl shadow-black/25 sm:p-7">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#C8A96B]/20 bg-[#C8A96B]/10 px-4 py-2 text-xs font-black uppercase tracking-[0.22em] text-[#C8A96B]"><BookOpen className="h-4 w-4" />{copy.allTerms}</div>
              <h2 className="text-3xl font-black tracking-[-0.04em] text-white sm:text-4xl">{copy.glossaryTitle}</h2>
              <p className="mt-3 text-sm font-semibold leading-7 text-[#94A3B8]">{copy.glossaryText}</p>
            </div>
            <label className="relative block w-full max-w-md">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
              <input
                value={termSearch}
                onChange={(event) => setTermSearch(event.target.value)}
                placeholder={copy.search}
                className="w-full rounded-2xl border border-white/10 bg-[#07111F] py-4 pl-11 pr-4 text-sm font-bold text-white outline-none transition placeholder:text-[#64748B] focus:border-[#00C076]/50"
              />
            </label>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filteredTerms.map((item) => (
              <motion.div
                key={item.term}
                layout
                className="rounded-3xl border border-white/10 bg-white/[0.035] p-4"
              >
                <div className="text-sm font-black text-white">{item.term}</div>
                <p className="mt-2 text-xs font-semibold leading-5 text-[#94A3B8]">{language === "ru" ? item.ru : language === "ua" ? item.ua : item.en}</p>
              </motion.div>
            ))}
          </div>
        </section>

        <footer className="rounded-[2rem] border border-[#C8A96B]/20 bg-[#C8A96B]/10 p-6 sm:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.24em] text-[#C8A96B]">{copy.footerTitle}</div>
              <p className="mt-2 max-w-3xl text-sm font-bold leading-7 text-[#F5E8C9]">{copy.footerText}</p>
              <p className="mt-3 text-xs font-bold leading-6 text-[#94A3B8]">{copy.openFooterNote}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/dashboard" className="rounded-2xl bg-[#00C076] px-5 py-3 text-sm font-black text-[#07111F] hover:bg-[#00D084]">{copy.openDashboard}</Link>
              <Link href="/" className="rounded-2xl border border-white/10 px-5 py-3 text-sm font-black text-white hover:border-[#C8A96B]/40 hover:text-[#C8A96B]">{copy.openHome}</Link>
              <Link href="/pricing" className="rounded-2xl border border-white/10 px-5 py-3 text-sm font-black text-white hover:border-[#C8A96B]/40 hover:text-[#C8A96B]">{copy.openPricing}</Link>
            </div>
          </div>
        </footer>
      </section>
    </main>
  );
}
