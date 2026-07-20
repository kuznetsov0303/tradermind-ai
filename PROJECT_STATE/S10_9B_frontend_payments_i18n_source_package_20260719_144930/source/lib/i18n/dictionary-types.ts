export type CommonDictionary = {
  brand: {
    name: string;
    shortName: string;
    tagline: string;
  };

  actions: {
    getStarted: string;
    requestDemo: string;
    choosePlan: string;
    openDashboard: string;
    contactSupport: string;
    send: string;
    cancel: string;
    save: string;
    close: string;
    back: string;
    continue: string;
    loading: string;
    refresh: string;
    upgrade: string;
  };

  navigation: {
    product: string;
    pricing: string;
    dashboard: string;
    legal: string;
    support: string;
    login: string;
    logout: string;
  };

  dashboard: {
    tabs: {
      overview: string;
      journal: string;
      charts: string;
      market: string;
      alerts: string;
      aiCoach: string;
      learning: string;
      reports: string;
      billing: string;
    };

    access: {
      coreRequired: string;
      edgeRequired: string;
      eliteRequired: string;
      scannerEdgePlus: string;
      alertsEliteOnly: string;
    };
  };

  support: {
    title: string;
    floatingLabel: string;
    chooseTitle: string;
    chooseSubtitle: string;
    emailTitle: string;
    emailText: string;
    chatTitle: string;
    chatText: string;
    emailHeading: string;
    emailDescription: string;
    emailPlaceholder: string;
    questionPlaceholder: string;
    sendEmail: string;
    sendingEmail: string;
    emailSuccess: string;
    emailError: string;
    chatIntro: string;
    chatPlaceholder: string;
    sending: string;
    operatorSuccess: string;
    operatorError: string;
    disclaimer: string;
  };

  aiCoach: {
    systemLanguageRule: string;
  };
};

export type Dictionary = CommonDictionary;