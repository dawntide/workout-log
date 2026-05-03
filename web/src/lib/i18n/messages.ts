import {
  DEFAULT_LOCALE_PREFERENCE,
  normalizeLocalePreference,
  type LocalePreference,
} from "@/lib/settings/workout-preferences";

export type AppLocale = LocalePreference;

export const LOCALE_COOKIE_NAME = "workout-log.locale";

export type AppCopy = {
  nav: {
    home: string;
    log: string;
    calendar: string;
    stats: string;
    settings: string;
    mainNavigation: string;
  };
  settings: {
    headerEyebrow: string;
    title: string;
    detailTitle: string;
    detailDescription: string;
    close: string;
    sections: {
      preferences: string;
      training: string;
      system: string;
    };
    profile: {
      title: string;
      active: string;
      subtitle: string;
    };
    rows: {
      language: { label: string; description: string };
      theme: { label: string; description: string };
      uxThresholds: { label: string; description: string };
      exerciseManagement: { label: string; description: string };
      minimumPlate: { label: string; description: string };
      bodyweight: { label: string; description: string };
      savePolicy: { label: string; description: string };
      selectionTemplate: { label: string; description: string };
      dataExport: { label: string; description: string };
      dataManagement: { label: string; description: string };
      systemStats: { label: string; description: string };
      about: { label: string; description: string };
    };
    modalTitles: {
      language: string;
      theme: string;
      minimumPlate: string;
      bodyweight: string;
      exerciseManagement: string;
      dataExport: string;
      data: string;
      about: string;
      savePolicy: string;
      selectionTemplate: string;
      uxThresholds: string;
    };
    modalDescriptions: {
      default: string;
      data: string;
      exerciseManagement: string;
      language: string;
    };
    languagePage: {
      title: string;
      description: string;
      noticeLabel: string;
      loadErrorTitle: string;
      saveSuccess: string;
      rollbackNotice: string;
      footer: string;
      options: {
        ko: {
          label: string;
          subtitle: string;
          description: string;
        };
        en: {
          label: string;
          subtitle: string;
          description: string;
        };
      };
    };
    savePolicyPage: {
      saveSuccessAutoSync: string;
      rollbackAutoSync: string;
      saveSuccessTimezone: string;
      rollbackTimezone: string;
      failureSimulation: {
        title: string;
        ariaLabel: string;
        nextSaveFailure: string;
        description: string;
        footnote: string;
      };
      optimistic: {
        title: string;
        ariaLabel: string;
        autoSync: string;
        autoSyncPending: string;
        autoSyncErrorSuffix: string;
        autoSyncDescription: string;
        timezone: string;
        timezoneSubtitle: string;
        timezonePending: string;
        timezoneErrorSuffix: string;
        timezoneDescription: string;
        policy: string;
        policyDescription: string;
        standardized: string;
        footnote: string;
      };
      notice: {
        title: string;
        success: string;
        error: string;
        footnote: string;
      };
    };
    dataExportPage: {
      exportFailed: (status: number) => string;
      shareTitle: string;
      shareText: string;
      noticeSuccess: string;
      noticeError: string;
      genericError: string;
      title: string;
      description: string;
      ariaLabel: string;
      json: {
        label: string;
        subtitle: string;
        description: string;
        exporting: string;
        shared: string;
        downloaded: string;
      };
      csv: {
        label: string;
        subtitle: string;
        description: string;
        exporting: string;
        shared: string;
        downloaded: string;
      };
      actionInProgress: string;
      actionShare: string;
      footnote: string;
    };
  };
  home: {
    loadError: string;
    retry: string;
    loadingLabel: string;
    loadingDescription: string;
    todayDate: Intl.DateTimeFormatOptions;
    welcome: {
      active: string;
      noPlan: string;
    };
    momentum: {
      eyebrow: string;
      streak: (days: number) => string;
      empty: string;
      nextTarget: string;
    };
    protocol: {
      title: string;
      noProgram: string;
      selectProgram: string;
      emptyDescription: string;
      browsePrograms: string;
      lastPerformed: string;
      weeklyActivity: string;
      recent7Days: string;
      workedOut: string;
      rest: string;
      continue: string;
      start: string;
      chooseProgram: string;
      doneToday: string;
      logMore: string;
    };
    lastSession: {
      title: string;
      totalWorkload: string;
      tons: string;
      duration: string;
      min: string;
      sets: string;
      exercises: string;
      goalHits: string;
      ariaLabel: (planName: string) => string;
    };
    logistics: {
      title: string;
      links: {
        programStore: { title: string; subtitle: string };
        plans: { title: string; subtitle: string };
        stats: { title: string; subtitle: string };
      };
    };
  };
  workoutLog: {
    validationLabel: string;
    validationAriaLabel: string;
    noPlans: string;
    selectedPlan: string;
    planLockedWhileEditing: string;
    editingLog: string;
    activeSession: string;
    exercisesCount: string;
    bodyweightShort: string;
    lastSession: string;
    sets: string;
    saveInProgress: string;
    saveEdited: string;
    saveCreate: string;
    saveSuccess: string;
    planSheetTitle: string;
    planSheetDescription: string;
    close: string;
    planSearchPlaceholder: string;
    planSearchResults: string;
    noMatchingPlans: string;
    addExerciseTitle: string;
    addExerciseDescription: string;
    addExerciseAction: string;
    addExerciseButton: string;
    exerciseSearchResults: string;
    noMatchingExercises: string;
    exerciseSearchLoading: string;
    change: string;
    badgePlanned: string;
    badgeCustom: string;
    badgeAdded: string;
    addSet: string;
    sessionMemoPlaceholder: string;
    activePlanLabel: string;
    restoreDraftTitle: string;
    restoreDraftMessage: string;
    restoreDraftConfirm: string;
    restoreDraftDiscard: string;
    dateNavPrev: string;
    dateNavNext: string;
    dateNavToday: string;
    dateChangeAriaLabel: string;
  };
  programStore: {
    eyebrow: string;
    title: string;
    description: string;
    loadError: string;
    notice: string;
    searchPlaceholder: string;
    searchAriaLabel: string;
    emptySearch: string;
    emptySearchDescription: string;
  };
  calendarOptions: {
    eyebrow: string;
    title: string;
    description: string;
    backToCalendar: string;
    sectionTitle: string;
    fields: {
      viewMode: { label: string; description: string };
      timezone: { label: string; description: string };
      autoOpen: { label: string; description: string; autoGenerate: string; openOnly: string };
      openTime: { label: string; description: string };
    };
  };
  plans: {
    headerEyebrow: string;
    title: string;
    manage: string;
    managementSection: string;
    setupSection: string;
    managementItems: {
      active: { label: string; subtitle: string; description: string };
      history: { label: string; subtitle: string; description: string };
    };
    setupItems: {
      store: { label: string; subtitle: string; description: string };
      custom: { label: string; subtitle: string; description: string };
      advanced: { label: string; subtitle: string; description: string };
    };
  };
  calendar: {
    title: string;
    planFilter: string;
    openYearMonth: string;
    planSheetTitle: string;
    planSheetDescription: string;
    close: string;
    planSearchPlaceholder: string;
    planSearchResults: string;
    noMatchingPlans: string;
    monthPickerTitle: string;
  };
  programExerciseEditor: {
    change: string;
    loadingExercises: string;
    searchExercises: string;
    clearQuery: string;
    searchResults: string;
    searching: string;
    noMatchingExercises: string;
  };
  plansManage: {
    headerEyebrow: string;
    title: string;
    searchPlaceholder: string;
    searchAriaLabel: string;
    loadError: string;
    noPlans: string;
    noPlansDescription: string;
    noResults: string;
    noResultsDescription: string;
    recentPerformedPrefix: string;
    noPerformedHistory: string;
    manage: string;
    history: string;
    detailTitle: string;
    detailDescription: string;
    close: string;
    baseProgram: string;
    createdAt: string;
    lastPerformedAt: string;
    noRecord: string;
    planName: string;
    planNamePlaceholder: string;
    strengthBaselines: string;
    oneRepMax: string;
    trainingMax: string;
    noStrengthBaselines: string;
    viewHistory: string;
    saveInProgress: string;
    saveChanges: string;
    deleteInProgress: string;
    deletePlan: string;
    notFound: string;
  };
  plansHistory: {
    headerEyebrow: string;
    title: string;
    description: string;
    plansLoadError: string;
    noPlans: string;
    noPlansDescription: string;
    selectPlan: string;
    selectedPlan: string;
    recentPerformed: string;
    summaryLabel: string;
    summaryWithCounts: (logs: number, sets: number) => string;
    summarySelectPlan: string;
    logsTitle: string;
    logsLoadError: string;
    noLogs: string;
    noLogsDescription: string;
    sets: string;
    time: string;
    volume: string;
    note: string;
    sessionDetail: string;
    deleteHistory: string;
    deleting: string;
    loadMore: string;
    loadingMore: string;
  };
  plansContext: {
    eyebrow: string;
    title: string;
    description: string;
    pickProgram: string;
    createCustom: string;
    sectionTitle: string;
    previewTitle: string;
    fields: {
      userId: { label: string; description: string };
      startDate: { label: string; description: string };
      timezone: { label: string; description: string };
      sessionKeyMode: { label: string; description: string };
      week: { label: string; description: string };
      day: { label: string; description: string };
    };
  };
  calendarMain: {
    noPlanSelected: string;
    completed: string;
    sets: string;
    volume: string;
    editLog: string;
    blockedTitle: string;
    blockedDescription: string;
    beforeStart: string;
    startLogging: string;
    noSession: string;
    canLogImmediately: string;
    plannedDescription: string;
    immediateDescription: string;
    moveDate: string;
    deleteLog: string;
    deleteLogConfirm: string;
    blockedHasLaterLogs: string;
    moveDateBlockedTitle: string;
    moveDateBlockedDescription: string;
    recentLogs: string;
  };
};

export const appCopyByLocale: Record<AppLocale, AppCopy> = {
  ko: {
    nav: {
      home: "홈",
      log: "기록",
      calendar: "캘린더",
      stats: "통계",
      settings: "설정",
      mainNavigation: "메인 내비게이션",
    },
    settings: {
      headerEyebrow: "App Settings",
      title: "설정",
      detailTitle: "설정 상세",
      detailDescription: "설정 변경사항은 저장 즉시 반영됩니다.",
      close: "닫기",
      sections: {
        preferences: "앱 환경",
        training: "훈련 데이터",
        system: "시스템",
      },
      profile: {
        title: "Athlete",
        active: "활성",
        subtitle: "운동 기록 앱",
      },
      rows: {
        language: { label: "언어", description: "영어 / 한국어" },
        theme: { label: "테마", description: "다크 모드 / 솔라라이즈드 라이트" },
        uxThresholds: { label: "UX 기준치", description: "애니메이션 및 상호작용 임계값" },
        exerciseManagement: { label: "운동종목 관리", description: "운동종목 조회, 추가, 편집, 삭제" },
        minimumPlate: { label: "최소 원판 무게", description: "운동 유형별 최소 원판 단위" },
        bodyweight: { label: "몸무게", description: "맨몸 운동 부하 계산에 사용" },
        savePolicy: { label: "저장 정책", description: "자동 저장 및 확인 동작" },
        selectionTemplate: { label: "선택 템플릿", description: "기본 세트 선택 패턴" },
        dataExport: { label: "데이터 내보내기", description: "전체 훈련 데이터 내보내기" },
        dataManagement: { label: "데이터 관리", description: "내보내기 · 앱 데이터 초기화" },
        systemStats: { label: "시스템 통계", description: "마이그레이션 및 UX 분석 (관리자)" },
        about: { label: "앱 정보", description: "버전 정보" },
      },
      modalTitles: {
        language: "언어 설정",
        theme: "테마 설정",
        minimumPlate: "최소 원판 무게",
        bodyweight: "몸무게 입력",
        exerciseManagement: "운동종목 관리",
        dataExport: "데이터 내보내기",
        data: "데이터 관리",
        about: "앱 정보",
        savePolicy: "저장 정책",
        selectionTemplate: "선택 템플릿",
        uxThresholds: "UX 기준치",
      },
      modalDescriptions: {
        default: "설정 변경사항은 저장 즉시 반영됩니다.",
        data: "데이터 내보내기와 앱 전체 초기화 작업을 관리합니다.",
        exerciseManagement: "운동종목 카탈로그를 관리하고 운동 추가 화면에 즉시 반영합니다.",
        language: "앱 전역 언어를 즉시 전환합니다.",
      },
      languagePage: {
        title: "앱 언어",
        description: "영어와 한국어 중 앱 표시 언어를 선택합니다.",
        noticeLabel: "언어 안내",
        loadErrorTitle: "언어 설정 조회 실패",
        saveSuccess: "언어 설정을 저장했습니다.",
        rollbackNotice: "언어 저장 실패로 이전 값으로 되돌렸습니다.",
        footer: "변경 즉시 하단 탭, 설정, 홈 주요 문구에 반영됩니다.",
        options: {
          ko: {
            label: "한국어",
            subtitle: "Korean",
            description: "앱 전반의 UI 문구를 한국어로 표시합니다.",
          },
          en: {
            label: "영어",
            subtitle: "English",
            description: "Show the app interface in English.",
          },
        },
      },
      savePolicyPage: {
        saveSuccessAutoSync: "자동 동기화 설정을 저장했습니다.",
        rollbackAutoSync: "자동 동기화 저장에 실패해 이전 값으로 복구했습니다.",
        saveSuccessTimezone: "시간대 설정을 저장했습니다.",
        rollbackTimezone: "시간대 저장에 실패해 이전 값으로 복구했습니다.",
        failureSimulation: {
          title: "실패 시뮬레이션",
          ariaLabel: "저장 실패 시뮬레이션",
          nextSaveFailure: "다음 저장 실패",
          description: "테스트용: 다음 저장 1회를 실패 처리.",
          footnote: "한 번만 실패 처리한 뒤 같은 Row에서 다시 시도하세요.",
        },
        optimistic: {
          title: "즉시 반영 설정",
          ariaLabel: "즉시 반영 설정 행",
          autoSync: "자동 동기화",
          autoSyncPending: "저장 중...",
          autoSyncErrorSuffix: "이전 값으로 복구됨.",
          autoSyncDescription: "변경 즉시 반영 후 서버에 저장합니다.",
          timezone: "시간대",
          timezoneSubtitle: "탭해서 순환",
          timezonePending: "저장 중...",
          timezoneErrorSuffix: "이전 값으로 복구됨.",
          timezoneDescription: "탭하면 다음 시간대로 저장합니다.",
          policy: "정책",
          policyDescription: "즉시 반영, 행 잠금, 롤백 규칙을 적용합니다.",
          standardized: "표준화됨",
          footnote: "전체 로딩 오버레이 없이, 저장 중인 Row만 잠급니다.",
        },
        notice: {
          title: "인라인 안내",
          success: "저장 완료",
          error: "저장 실패",
          footnote: "실패 시 안내 문구를 확인한 뒤 같은 Row에서 다시 시도하세요.",
        },
      },
      dataExportPage: {
        exportFailed: (status) => `데이터 내보내기 실패 (${status})`,
        shareTitle: "Workout Log Export",
        shareText: "운동 데이터 백업 파일",
        noticeSuccess: "내보내기 완료",
        noticeError: "내보내기 실패",
        genericError: "데이터 내보내기에 실패했습니다.",
        title: "데이터 내보내기",
        description: "내보내기는 iOS 표준 ShareSheet를 우선 사용합니다.",
        ariaLabel: "데이터 내보내기 작업",
        json: {
          label: "JSON 내보내기",
          subtitle: "전체 백업",
          description: "운동/플랜/세션 데이터를 구조형 JSON으로 내보냅니다.",
          exporting: "JSON 내보내기 중...",
          shared: "JSON 파일을 ShareSheet로 공유했습니다.",
          downloaded: "JSON 파일 다운로드를 시작했습니다.",
        },
        csv: {
          label: "CSV 내보내기",
          subtitle: "workout_set",
          description: "분석용 테이블 CSV를 내보냅니다.",
          exporting: "CSV 내보내기 중...",
          shared: "CSV 파일을 ShareSheet로 공유했습니다.",
          downloaded: "CSV 파일 다운로드를 시작했습니다.",
        },
        actionInProgress: "진행 중",
        actionShare: "공유",
        footnote: "ShareSheet를 지원하지 않는 브라우저에서는 자동으로 파일 다운로드로 대체됩니다.",
      },
    },
    home: {
      loadError: "홈 데이터를 불러오지 못했습니다.",
      retry: "다시 불러오기",
      loadingLabel: "홈 데이터 불러오는 중",
      loadingDescription: "오늘 요약과 최근 운동 요약을 조회하고 있습니다.",
      todayDate: { month: "long", day: "numeric", weekday: "short" },
      welcome: {
        active: "상태: 진행 중",
        noPlan: "상태: 플랜 없음",
      },
      momentum: {
        eyebrow: "현재 모멘텀",
        streak: (days) => `${days}일 연속 진행 중.`,
        empty: "운동을 시작하세요.",
        nextTarget: "다음 목표",
      },
      protocol: {
        title: "오늘의 프로토콜",
        noProgram: "활성 프로그램 없음",
        selectProgram: "프로그램을 선택하세요",
        emptyDescription: "프로그램 스토어에서 루틴을 선택하면 오늘 운동이 자동으로 구성됩니다.",
        browsePrograms: "프로그램 둘러보기",
        lastPerformed: "마지막",
        weeklyActivity: "이번 주 활동",
        recent7Days: "최근 7일 운동 활동",
        workedOut: "운동함",
        rest: "휴식",
        continue: "이어서 하기",
        start: "운동 시작",
        chooseProgram: "프로그램 선택",
        doneToday: "오늘 완료",
        logMore: "추가 기록",
      },
      lastSession: {
        title: "지난 세션",
        totalWorkload: "총 훈련량",
        tons: "톤",
        duration: "소요 시간",
        min: "분",
        sets: "세트",
        exercises: "운동",
        goalHits: "목표 달성",
        ariaLabel: (planName) => `지난 세션: ${planName}`,
      },
      logistics: {
        title: "바로가기",
        links: {
          programStore: { title: "프로그램 스토어", subtitle: "프로토콜 둘러보기" },
          plans: { title: "내 플랜", subtitle: "관리 및 일정" },
          stats: { title: "통계", subtitle: "진행 추적" },
        },
      },
    },
    workoutLog: {
      validationLabel: "입력 확인 필요",
      validationAriaLabel: "저장 검증 오류",
      noPlans: "선택 가능한 플랜이 없습니다",
      selectedPlan: "선택 플랜",
      planLockedWhileEditing: "기존 기록 수정 중에는 플랜을 변경할 수 없습니다.",
      editingLog: "기록 수정",
      activeSession: "진행 중 세션",
      exercisesCount: "운동",
      bodyweightShort: "체중",
      lastSession: "지난 세션",
      sets: "세트",
      saveInProgress: "저장 중...",
      saveEdited: "운동기록 수정 완료",
      saveCreate: "운동기록 완료 및 저장",
      saveSuccess: "운동기록이 저장되었습니다",
      planSheetTitle: "플랜 선택",
      planSheetDescription: "보유 플랜을 검색해 오늘 기록에 사용할 플랜으로 전환합니다.",
      close: "닫기",
      planSearchPlaceholder: "플랜 검색",
      planSearchResults: "플랜 검색 결과",
      noMatchingPlans: "검색 조건에 맞는 플랜이 없습니다.",
      addExerciseTitle: "운동 추가",
      addExerciseDescription: "기존 DB 종목 선택 또는 검색 후 기록 영역에 추가합니다.",
      addExerciseAction: "기록 영역에 추가",
      addExerciseButton: "운동 추가",
      exerciseSearchResults: "운동종목 검색 결과",
      noMatchingExercises: "검색 조건에 맞는 운동종목이 없습니다.",
      exerciseSearchLoading: "검색 중...",
      change: "변경",
      badgePlanned: "계획",
      badgeCustom: "사용자",
      badgeAdded: "추가",
      addSet: "세트 추가",
      sessionMemoPlaceholder: "오늘 세션 전체 메모",
      activePlanLabel: "진행 중인 플랜",
      restoreDraftTitle: "기록 복구",
      restoreDraftMessage: "이전에 입력 중이던 기록을 불러왔습니다.",
      restoreDraftConfirm: "복구",
      restoreDraftDiscard: "삭제",
      dateNavPrev: "이전 날",
      dateNavNext: "다음 날",
      dateNavToday: "오늘",
      dateChangeAriaLabel: "날짜 변경",
    },
    programStore: {
      eyebrow: "Program Store",
      title: "프로그램 스토어",
      description: "공식 및 커스텀 프로그램을 탐색하고 시작하세요.",
      loadError: "프로그램 화면을 불러오지 못했습니다",
      notice: "프로그램 안내",
      searchPlaceholder: "프로그램명, 설명, 태그 검색",
      searchAriaLabel: "스토어 검색",
      emptySearch: "검색 결과가 없습니다",
      emptySearchDescription: "프로그램명, 태그, 설명으로 다시 검색해 보세요.",
    },
    calendarOptions: {
      eyebrow: "Calendar Settings",
      title: "캘린더 옵션",
      description: "날짜를 눌렀을 때 열기만 할지, 세션 생성까지 이어질지 정하는 화면입니다.",
      backToCalendar: "캘린더로 돌아가기",
      sectionTitle: "옵션 항목",
      fields: {
        viewMode: { label: "보기 방식", description: "기본 그리드 보기를 설정합니다." },
        timezone: { label: "시간대", description: "날짜 경계 계산 시간대를 설정합니다." },
        autoOpen: { label: "열기 동작", description: "날짜 열기 시 동작을 선택합니다.", autoGenerate: "자동 생성", openOnly: "열기만" },
        openTime: { label: "기본 열기 시간", description: "날짜 열기 기본 시간을 설정합니다." },
      },
    },
    plans: {
      headerEyebrow: "Training Plans",
      title: "플랜 관리",
      manage: "관리",
      managementSection: "핵심 메뉴",
      setupSection: "빠른 이동",
      managementItems: {
        active: { label: "플랜 관리", subtitle: "Manage", description: "진행 중인 플랜 이름/기준값 편집, 삭제, 상태 확인" },
        history: { label: "수행 히스토리", subtitle: "History", description: "플랜별 운동 로그, 볼륨, 최근 수행 흐름 확인" },
      },
      setupItems: {
        store: { label: "프로그램 스토어", subtitle: "Start", description: "새 플랜 시작과 커스텀 프로그램 생성은 스토어에서 진행" },
        custom: { label: "", subtitle: "", description: "" },
        advanced: { label: "", subtitle: "", description: "" },
      },
    },
    calendar: {
      title: "캘린더",
      planFilter: "플랜 필터",
      openYearMonth: "연도와 월 선택 열기",
      planSheetTitle: "플랜 선택",
      planSheetDescription: "캘린더에 표시할 플랜을 검색해 전환합니다.",
      close: "닫기",
      planSearchPlaceholder: "플랜 검색",
      planSearchResults: "플랜 검색 결과",
      noMatchingPlans: "검색 조건에 맞는 플랜이 없습니다.",
      monthPickerTitle: "연도와 월 선택",
    },
    programExerciseEditor: {
      change: "변경",
      loadingExercises: "운동종목 로딩 중...",
      searchExercises: "운동종목 검색",
      clearQuery: "검색어 지우기",
      searchResults: "운동종목 검색 결과",
      searching: "검색 중...",
      noMatchingExercises: "검색 조건에 맞는 운동종목이 없습니다.",
    },
    plansManage: {
      headerEyebrow: "Plan Management",
      title: "플랜 목록",
      searchPlaceholder: "플랜명 또는 기반 프로그램 검색",
      searchAriaLabel: "플랜 검색",
      loadError: "플랜 목록 조회 실패",
      noPlans: "플랜이 없습니다",
      noPlansDescription: "프로그램 스토어에서 먼저 플랜을 생성하세요.",
      noResults: "검색 결과가 없습니다",
      noResultsDescription: "플랜명 또는 기반 프로그램명으로 다시 검색하세요.",
      recentPerformedPrefix: "최근 수행",
      noPerformedHistory: "수행 기록 없음",
      manage: "관리",
      history: "수행 히스토리",
      detailTitle: "플랜 상세정보",
      detailDescription: "상세 조회 / 이름 수정 / 삭제",
      close: "닫기",
      baseProgram: "기반 프로그램",
      createdAt: "생성일",
      lastPerformedAt: "마지막 수행일",
      noRecord: "기록 없음",
      planName: "플랜 이름",
      planNamePlaceholder: "플랜 이름",
      strengthBaselines: "시작 기준 1RM/TM",
      oneRepMax: "예상 1RM",
      trainingMax: "TM",
      noStrengthBaselines: "저장된 시작 기준 1RM/TM이 없습니다.",
      viewHistory: "수행 히스토리 보기",
      saveInProgress: "저장 중...",
      saveChanges: "변경사항 저장",
      deleteInProgress: "삭제 중...",
      deletePlan: "플랜 삭제",
      notFound: "관리할 플랜을 찾을 수 없습니다.",
    },
    plansHistory: {
      headerEyebrow: "Plan History",
      title: "수행 히스토리",
      description: "플랜별 수행 로그를 모아보고, 필요한 항목만 빠르게 확인합니다.",
      plansLoadError: "플랜 목록 조회 실패",
      noPlans: "플랜이 없습니다",
      noPlansDescription: "프로그램 스토어에서 먼저 플랜을 생성하세요.",
      selectPlan: "플랜 선택",
      selectedPlan: "선택 플랜",
      recentPerformed: "최근 수행",
      summaryLabel: "히스토리 요약",
      summaryWithCounts: (logs, sets) => `현재 ${logs}개 로그 / ${sets}세트를 표시합니다.`,
      summarySelectPlan: "표시할 플랜을 선택하세요.",
      logsTitle: "수행 로그",
      logsLoadError: "수행 로그 조회 실패",
      noLogs: "수행 로그가 없습니다",
      noLogsDescription: "해당 플랜으로 운동을 기록하면 이 화면에 쌓입니다.",
      sets: "세트",
      time: "시간",
      volume: "볼륨",
      note: "노트",
      sessionDetail: "세션 상세",
      deleteHistory: "히스토리 삭제",
      deleting: "삭제 중...",
      loadMore: "로그 더 보기",
      loadingMore: "더 불러오는 중...",
    },
    plansContext: {
      eyebrow: "Advanced",
      title: "생성 기준 확인",
      description: "날짜, 시간대, 세션 키 기준을 점검하는 화면입니다.",
      pickProgram: "프로그램 고르기",
      createCustom: "커스텀 만들기",
      sectionTitle: "기준 항목",
      previewTitle: "현재 컨텍스트",
      fields: {
        userId: { label: "사용자 ID", description: "생성 대상 사용자 범위를 선택합니다." },
        startDate: { label: "시작 날짜", description: "생성 기준 날짜를 설정합니다." },
        timezone: { label: "시간대", description: "날짜 경계 계산 시간대를 설정합니다." },
        sessionKeyMode: { label: "세션 키 방식", description: "세션 키 포맷을 선택합니다." },
        week: { label: "주차", description: "주차 인덱스를 설정합니다." },
        day: { label: "일차", description: "일차 인덱스를 설정합니다." },
      },
    },
    calendarMain: {
      noPlanSelected: "플랜을 선택하면 날짜별 세션을 확인할 수 있습니다.",
      completed: "기록 완료",
      sets: "세트",
      volume: "볼륨",
      editLog: "기록수정",
      blockedTitle: "기록 불가",
      blockedDescription: "자동 진행 플랜은 오늘 이전 날짜에 새 기록을 추가할 수 없습니다.",
      beforeStart: "시작 전",
      startLogging: "기록하기",
      noSession: "세션 없음",
      canLogImmediately: "즉시 기록 가능",
      plannedDescription: "기록하기를 누르면 이 날짜 세션을 준비하고 바로 기록을 시작합니다.",
      immediateDescription: "기록하기를 누르면 이 날짜 기록 화면으로 바로 이동합니다.",
      moveDate: "날짜 이동",
      deleteLog: "기록 삭제",
      deleteLogConfirm: "이 운동 기록을 삭제하시겠습니까?",
      blockedHasLaterLogs: "이 날짜 이후에 기록된 운동이 있습니다. 해당 기록을 먼저 삭제한 후 이 날짜에 기록할 수 있습니다.",
      moveDateBlockedTitle: "날짜 이동 불가",
      moveDateBlockedDescription: "이동할 날짜 사이에 다른 기록이 있습니다. 해당 기록을 먼저 삭제해야 합니다.",
      recentLogs: "최근 기록",
    },
  },
  en: {
    nav: {
      home: "Home",
      log: "Log",
      calendar: "Calendar",
      stats: "Stats",
      settings: "Settings",
      mainNavigation: "Main navigation",
    },
    settings: {
      headerEyebrow: "App Settings",
      title: "Settings",
      detailTitle: "Settings Detail",
      detailDescription: "Changes apply immediately after saving.",
      close: "Close",
      sections: {
        preferences: "App Preferences",
        training: "Training Data",
        system: "System",
      },
      profile: {
        title: "Athlete",
        active: "Active",
        subtitle: "Workout Tracker",
      },
      rows: {
        language: { label: "Language", description: "English / Korean" },
        theme: { label: "Appearance", description: "Dark Mode / Solarized Light" },
        uxThresholds: { label: "UX Thresholds", description: "Animation and interaction thresholds" },
        exerciseManagement: { label: "Exercise Management", description: "Browse, add, edit, and delete exercises" },
        minimumPlate: { label: "Minimum Plate", description: "Minimum plate unit per exercise type" },
        bodyweight: { label: "Bodyweight", description: "Used for bodyweight exercise load calculation" },
        savePolicy: { label: "Save Policy", description: "Auto-save and confirmation behavior" },
        selectionTemplate: { label: "Selection Template", description: "Default set selection pattern" },
        dataExport: { label: "Data Export", description: "Export all training data" },
        dataManagement: { label: "Data Management", description: "Export and reset app data" },
        systemStats: { label: "System Stats", description: "Migration and UX analytics (admin)" },
        about: { label: "About", description: "Version info" },
      },
      modalTitles: {
        language: "Language",
        theme: "Appearance",
        minimumPlate: "Minimum Plate",
        bodyweight: "Bodyweight",
        exerciseManagement: "Exercise Management",
        dataExport: "Data Export",
        data: "Data Management",
        about: "About",
        savePolicy: "Save Policy",
        selectionTemplate: "Selection Template",
        uxThresholds: "UX Thresholds",
      },
      modalDescriptions: {
        default: "Changes apply immediately after saving.",
        data: "Manage exports and full app reset actions.",
        exerciseManagement: "Manage the exercise catalog and reflect changes in add-exercise flows immediately.",
        language: "Switch the app language across the interface immediately.",
      },
      languagePage: {
        title: "App Language",
        description: "Choose the language used across the app interface.",
        noticeLabel: "Language Notice",
        loadErrorTitle: "Could not load language settings",
        saveSuccess: "Language preference saved.",
        rollbackNotice: "Language save failed, so the previous value was restored.",
        footer: "Changes apply immediately to navigation, settings, and key home copy.",
        options: {
          ko: {
            label: "Korean",
            subtitle: "한국어",
            description: "Show the app interface in Korean.",
          },
          en: {
            label: "English",
            subtitle: "English",
            description: "Show the app interface in English.",
          },
        },
      },
      savePolicyPage: {
        saveSuccessAutoSync: "Auto-sync preference saved.",
        rollbackAutoSync: "Auto-sync save failed, so the previous value was restored.",
        saveSuccessTimezone: "Time zone preference saved.",
        rollbackTimezone: "Time zone save failed, so the previous value was restored.",
        failureSimulation: {
          title: "Failure Simulation",
          ariaLabel: "Save failure simulation",
          nextSaveFailure: "Fail Next Save",
          description: "Testing only: force the next save attempt to fail once.",
          footnote: "After one forced failure, retry on the same row.",
        },
        optimistic: {
          title: "Optimistic Settings",
          ariaLabel: "Optimistic settings rows",
          autoSync: "Auto Sync",
          autoSyncPending: "Saving...",
          autoSyncErrorSuffix: "Restored the previous value.",
          autoSyncDescription: "Apply immediately, then persist to the server.",
          timezone: "Time Zone",
          timezoneSubtitle: "Tap to cycle",
          timezonePending: "Saving...",
          timezoneErrorSuffix: "Restored the previous value.",
          timezoneDescription: "Tap to save the next time zone option.",
          policy: "Policy",
          policyDescription: "Applies optimistic updates, row locking, and rollback rules.",
          standardized: "Standardized",
          footnote: "Only the row being saved is locked, without a full-screen loading overlay.",
        },
        notice: {
          title: "Inline Notice",
          success: "Saved",
          error: "Save Failed",
          footnote: "After a failure notice appears, retry on the same row.",
        },
      },
      dataExportPage: {
        exportFailed: (status) => `Export failed (${status})`,
        shareTitle: "Workout Log Export",
        shareText: "Workout data backup file",
        noticeSuccess: "Export Complete",
        noticeError: "Export Failed",
        genericError: "Failed to export data.",
        title: "Data Export",
        description: "Exports use the native iOS Share Sheet first when available.",
        ariaLabel: "Data export actions",
        json: {
          label: "JSON Export",
          subtitle: "Full Backup",
          description: "Export workout, plan, and session data as structured JSON.",
          exporting: "Exporting JSON...",
          shared: "Shared the JSON file via the Share Sheet.",
          downloaded: "Started downloading the JSON file.",
        },
        csv: {
          label: "CSV Export",
          subtitle: "workout_set",
          description: "Export analysis-friendly workout-set CSV data.",
          exporting: "Exporting CSV...",
          shared: "Shared the CSV file via the Share Sheet.",
          downloaded: "Started downloading the CSV file.",
        },
        actionInProgress: "In Progress",
        actionShare: "Share",
        footnote: "Browsers without Share Sheet support automatically fall back to file download.",
      },
    },
    home: {
      loadError: "Could not load home data.",
      retry: "Retry",
      loadingLabel: "Loading home data",
      loadingDescription: "Fetching today's summary and recent workout activity.",
      todayDate: { month: "long", day: "numeric", weekday: "short" },
      welcome: {
        active: "Status: Active",
        noPlan: "Status: No Plan",
      },
      momentum: {
        eyebrow: "Current Momentum",
        streak: (days) => `${days}-day streak in progress.`,
        empty: "Start your workout.",
        nextTarget: "Next target",
      },
      protocol: {
        title: "Today's Protocol",
        noProgram: "No Active Program",
        selectProgram: "Choose a program",
        emptyDescription: "Pick a routine from the program store and today's workout will be built automatically.",
        browsePrograms: "Browse Programs",
        lastPerformed: "Last",
        weeklyActivity: "This Week",
        recent7Days: "Last 7 days of workout activity",
        workedOut: "worked out",
        rest: "rest",
        continue: "Continue",
        start: "Start Workout",
        chooseProgram: "Choose Program",
        doneToday: "Done Today",
        logMore: "Log More",
      },
      lastSession: {
        title: "Last Session",
        totalWorkload: "Total Workload",
        tons: "tons",
        duration: "Duration",
        min: "min",
        sets: "sets",
        exercises: "exercises",
        goalHits: "Goal Hits",
        ariaLabel: (planName) => `Last session: ${planName}`,
      },
      logistics: {
        title: "Quick Links",
        links: {
          programStore: { title: "Program Store", subtitle: "Browse Protocols" },
          plans: { title: "My Plans", subtitle: "Manage and Schedule" },
          stats: { title: "Stats", subtitle: "Progress Tracking" },
        },
      },
    },
    workoutLog: {
      validationLabel: "Check Input",
      validationAriaLabel: "Save validation error",
      noPlans: "No plans available to select",
      selectedPlan: "Selected Plan",
      planLockedWhileEditing: "You cannot change the plan while editing an existing log.",
      editingLog: "Editing Log",
      activeSession: "Active Session",
      exercisesCount: "exercises",
      bodyweightShort: "BW",
      lastSession: "Last Session",
      sets: "sets",
      saveInProgress: "Saving...",
      saveEdited: "Save Edited Workout",
      saveCreate: "Finish and Save Workout",
      saveSuccess: "Workout log saved",
      planSheetTitle: "Select Plan",
      planSheetDescription: "Search your plans and switch the one used for today's log.",
      close: "Close",
      planSearchPlaceholder: "Search plans",
      planSearchResults: "Plan search results",
      noMatchingPlans: "No plans match your search.",
      addExerciseTitle: "Add Exercise",
      addExerciseDescription: "Select or search an existing database exercise and add it to this log.",
      addExerciseAction: "Add to Log",
      addExerciseButton: "Add Exercise",
      exerciseSearchResults: "Exercise search results",
      noMatchingExercises: "No exercises match your search.",
      exerciseSearchLoading: "Searching...",
      change: "Change",
      badgePlanned: "Planned",
      badgeCustom: "Custom",
      badgeAdded: "Added",
      addSet: "Add Set",
      sessionMemoPlaceholder: "Notes for the full session",
      activePlanLabel: "Active Plan",
      restoreDraftTitle: "Restore Workout Draft",
      restoreDraftMessage: "A previous in-progress workout draft was found.",
      restoreDraftConfirm: "Restore",
      restoreDraftDiscard: "Discard",
      dateNavPrev: "Previous Day",
      dateNavNext: "Next Day",
      dateNavToday: "Today",
      dateChangeAriaLabel: "Change date",
    },
    programStore: {
      eyebrow: "Program Store",
      title: "Program Store",
      description: "Explore official and custom programs and start one quickly.",
      loadError: "Could not load the program store.",
      notice: "Program Notice",
      searchPlaceholder: "Search programs, descriptions, or tags",
      searchAriaLabel: "Search store",
      emptySearch: "No results found",
      emptySearchDescription: "Try searching again by program name, tag, or description.",
    },
    calendarOptions: {
      eyebrow: "Calendar Settings",
      title: "Calendar Options",
      description: "Choose whether tapping a date only opens it or continues into session generation.",
      backToCalendar: "Back to Calendar",
      sectionTitle: "Options",
      fields: {
        viewMode: { label: "View Mode", description: "Set the default calendar grid view." },
        timezone: { label: "Time Zone", description: "Set the time zone used for date boundary calculations." },
        autoOpen: { label: "Open Behavior", description: "Choose what happens when a date is opened.", autoGenerate: "Auto Generate", openOnly: "Open Only" },
        openTime: { label: "Default Open Time", description: "Set the default time used when opening a date." },
      },
    },
    plans: {
      headerEyebrow: "Training Plans",
      title: "Plans",
      manage: "Manage",
      managementSection: "Core Views",
      setupSection: "Quick Access",
      managementItems: {
        active: { label: "Plan Management", subtitle: "Manage", description: "Edit plan names/baselines, remove plans, and review status" },
        history: { label: "Workout History", subtitle: "History", description: "Review logs, volume, and progression timeline per plan" },
      },
      setupItems: {
        store: { label: "Program Store", subtitle: "Start", description: "Start new plans and create custom programs in the Program Store" },
        custom: { label: "", subtitle: "", description: "" },
        advanced: { label: "", subtitle: "", description: "" },
      },
    },
    calendar: {
      title: "Calendar",
      planFilter: "Plan Filter",
      openYearMonth: "Open year and month picker",
      planSheetTitle: "Select Plan",
      planSheetDescription: "Search and switch the plan shown on the calendar.",
      close: "Close",
      planSearchPlaceholder: "Search plans",
      planSearchResults: "Plan search results",
      noMatchingPlans: "No plans match your search.",
      monthPickerTitle: "Select Year and Month",
    },
    programExerciseEditor: {
      change: "Change",
      loadingExercises: "Loading exercises...",
      searchExercises: "Search exercises",
      clearQuery: "Clear search",
      searchResults: "Exercise search results",
      searching: "Searching...",
      noMatchingExercises: "No exercises match your search.",
    },
    plansManage: {
      headerEyebrow: "Plan Management",
      title: "Plans",
      searchPlaceholder: "Search plan name or base program",
      searchAriaLabel: "Search plans",
      loadError: "Could not load plans",
      noPlans: "No plans",
      noPlansDescription: "Create a plan from the program store first.",
      noResults: "No results found",
      noResultsDescription: "Try searching again by plan or base program name.",
      recentPerformedPrefix: "Recent",
      noPerformedHistory: "No workout history",
      manage: "Manage",
      history: "History",
      detailTitle: "Plan Details",
      detailDescription: "Inspect details, rename, or delete this plan.",
      close: "Close",
      baseProgram: "Base Program",
      createdAt: "Created",
      lastPerformedAt: "Last Performed",
      noRecord: "No record",
      planName: "Plan Name",
      planNamePlaceholder: "Plan name",
      strengthBaselines: "Starting 1RM/TM",
      oneRepMax: "Estimated 1RM",
      trainingMax: "TM",
      noStrengthBaselines: "No starting 1RM/TM values are saved.",
      viewHistory: "View History",
      saveInProgress: "Saving...",
      saveChanges: "Save Changes",
      deleteInProgress: "Deleting...",
      deletePlan: "Delete Plan",
      notFound: "Could not find the plan to manage.",
    },
    plansHistory: {
      headerEyebrow: "Plan History",
      title: "Workout History",
      description: "Review workout logs by plan and scan only what matters.",
      plansLoadError: "Could not load plans",
      noPlans: "No plans",
      noPlansDescription: "Create a plan from the program store first.",
      selectPlan: "Select Plan",
      selectedPlan: "Selected Plan",
      recentPerformed: "Recent",
      summaryLabel: "History Summary",
      summaryWithCounts: (logs, sets) => `Showing ${logs} logs / ${sets} sets.`,
      summarySelectPlan: "Select a plan to display.",
      logsTitle: "Workout Logs",
      logsLoadError: "Could not load workout logs",
      noLogs: "No workout logs",
      noLogsDescription: "Logs for this plan will appear here once you record workouts.",
      sets: "Sets",
      time: "Time",
      volume: "Volume",
      note: "Note",
      sessionDetail: "Session Detail",
      deleteHistory: "Delete History",
      deleting: "Deleting...",
      loadMore: "Load More Logs",
      loadingMore: "Loading more...",
    },
    plansContext: {
      eyebrow: "Advanced",
      title: "Review Generation Context",
      description: "Inspect the date, time zone, and session key context used for generation.",
      pickProgram: "Pick Program",
      createCustom: "Create Custom",
      sectionTitle: "Context Fields",
      previewTitle: "Current Context",
      fields: {
        userId: { label: "User ID", description: "Select the target user scope for generation." },
        startDate: { label: "Start Date", description: "Set the base date used for generation." },
        timezone: { label: "Time Zone", description: "Set the time zone used for date boundaries." },
        sessionKeyMode: { label: "Session Key Mode", description: "Choose the session key format." },
        week: { label: "Week", description: "Set the week index." },
        day: { label: "Day", description: "Set the day index." },
      },
    },
    calendarMain: {
      noPlanSelected: "Select a plan to view sessions by date.",
      completed: "Completed",
      sets: "Sets",
      volume: "Volume",
      editLog: "Edit Log",
      blockedTitle: "Logging Unavailable",
      blockedDescription: "Auto-progression plans cannot add a new log before today.",
      beforeStart: "Before Start",
      startLogging: "Start Logging",
      noSession: "No Session",
      canLogImmediately: "Can Log Immediately",
      plannedDescription: "Tap Start Logging to prepare this date's session and begin recording right away.",
      immediateDescription: "Tap Start Logging to jump straight into the log screen for this date.",
      moveDate: "Move Date",
      deleteLog: "Delete Log",
      deleteLogConfirm: "Delete this workout log?",
      blockedHasLaterLogs: "There are logs recorded after this date. Please delete those logs first before logging on this date.",
      moveDateBlockedTitle: "Cannot Move Date",
      moveDateBlockedDescription: "There are other logs between the dates. Please delete those logs first.",
      recentLogs: "Recent Logs",
    },
  },
};

export function getAppCopy(locale: AppLocale): AppCopy {
  return appCopyByLocale[locale];
}

export function getLocaleLabel(locale: AppLocale) {
  return locale === "ko" ? "한국어" : "English";
}

export function coerceAppLocale(value: unknown): AppLocale {
  return normalizeLocalePreference(value);
}

export function parseAcceptLanguage(header: string | null | undefined): AppLocale {
  if (!header) return DEFAULT_LOCALE_PREFERENCE;
  const first = header.split(",")[0]?.trim();
  return coerceAppLocale(first);
}

// PERF: cache()로 래핑 → 동일 요청 내 여러 RSC/API Route에서 호출해도 쿠키+헤더를 한 번만 읽음.
// React.cache()는 요청 단위 메모이제이션 (전역 캐시 아님, SSR 요청 간 공유되지 않음).
import { cache } from "react";
export const resolveRequestLocale = cache(async (): Promise<AppLocale> => {
  const { cookies, headers } = await import("next/headers");
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(LOCALE_COOKIE_NAME)?.value;
  if (cookieLocale) {
    return coerceAppLocale(cookieLocale);
  }

  const requestHeaders = await headers();
  return parseAcceptLanguage(requestHeaders.get("accept-language"));
});
