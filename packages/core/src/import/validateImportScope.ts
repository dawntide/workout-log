// import 파일의 자식 행이 **같은 파일 안의 부모만** 가리키는지 검사한다.
//
// 왜 필요한가: `planModule`·`planOverride`·`programVersion`·`workoutSet`은 자체 user 컬럼이
// 없고 부모(plan·programTemplate·workoutLog)를 통해서만 소유자가 정해진다. 그런데 import는
// userId/ownerUserId만 요청자 것으로 덮어쓰고 **부모 id는 파일 값을 그대로** INSERT했다.
// 남의 planId·logId를 적은 파일을 올리면 FK 검사는 통과하므로(그 행이 실제로 존재하니까)
// 그 자식 행이 피해자의 플랜·로그 안으로 들어간다.
//
// 정상 export는 사용자의 부모와 그 자식만 함께 담으므로, 부모가 파일에 없는 자식은 정당한
// 경우가 없다 → 드롭이 아니라 거부한다(조용히 버리면 공격 시도가 로그에도 안 남는다).
//
// 반대로 아래는 **검사 대상이 아니다** — 공용/마켓 카탈로그를 가리키는 정당한 외부 참조다:
//   plan.rootProgramVersionId, planModule.programVersionId  (남의 소유 프로그램 버전 기반 플랜)
//   workoutSet.exerciseId                                    (공용 운동 카탈로그, 별도 처리)

type Rows = Record<string, unknown>[];

export type ImportScopeInput = {
  templates: Rows;
  templateVersions: Rows;
  plans: Rows;
  planModules: Rows;
  planOverrides: Rows;
  generatedSessions: Rows;
  workoutLogs: Rows;
  workoutSets: Rows;
};

/** 부모 후보의 id 집합. 문자열 id만 모은다(그 밖은 어차피 FK에서 걸린다). */
function idSet(rows: Rows): Set<string> {
  const out = new Set<string>();
  for (const row of rows) {
    if (typeof row.id === "string" && row.id) out.add(row.id);
  }
  return out;
}

type ScopeRule = {
  table: string;
  rows: Rows;
  column: string;
  parents: Set<string>;
  parentTable: string;
  /** null/미지정을 허용하는 컬럼(스키마상 nullable). */
  optional?: boolean;
};

export function validateImportParentScope(input: ImportScopeInput): {
  ok: boolean;
  errors: string[];
} {
  const templateIds = idSet(input.templates);
  const planIds = idSet(input.plans);
  const logIds = idSet(input.workoutLogs);
  const generatedSessionIds = idSet(input.generatedSessions);

  const rules: ScopeRule[] = [
    {
      table: "templateVersions",
      rows: input.templateVersions,
      column: "templateId",
      parents: templateIds,
      parentTable: "templates",
    },
    {
      table: "planModules",
      rows: input.planModules,
      column: "planId",
      parents: planIds,
      parentTable: "plans",
    },
    {
      table: "planOverrides",
      rows: input.planOverrides,
      column: "planId",
      parents: planIds,
      parentTable: "plans",
    },
    {
      table: "generatedSessions",
      rows: input.generatedSessions,
      column: "planId",
      parents: planIds,
      parentTable: "plans",
    },
    {
      table: "workoutLogs",
      rows: input.workoutLogs,
      column: "planId",
      parents: planIds,
      parentTable: "plans",
      optional: true,
    },
    {
      table: "workoutLogs",
      rows: input.workoutLogs,
      column: "generatedSessionId",
      parents: generatedSessionIds,
      parentTable: "generatedSessions",
      optional: true,
    },
    {
      table: "workoutSets",
      rows: input.workoutSets,
      column: "logId",
      parents: logIds,
      parentTable: "workoutLogs",
    },
  ];

  const errors: string[] = [];

  for (const rule of rules) {
    // 같은 규칙에서 같은 메시지가 행 수만큼 쏟아지지 않도록 값 단위로 모은다.
    const offending = new Set<string>();
    let missing = 0;

    for (const row of rule.rows) {
      const value = row[rule.column];
      if (value === null || value === undefined || value === "") {
        if (!rule.optional) missing += 1;
        continue;
      }
      if (typeof value !== "string" || !rule.parents.has(value)) {
        offending.add(String(value));
      }
    }

    if (missing > 0) {
      errors.push(`${rule.table}.${rule.column} is required (${missing} row(s) missing it)`);
    }
    if (offending.size > 0) {
      const sample = [...offending].slice(0, 3).join(", ");
      const more = offending.size > 3 ? ` (+${offending.size - 3} more)` : "";
      errors.push(
        `${rule.table}.${rule.column} references ${rule.parentTable} not present in this import: ${sample}${more}`,
      );
    }
  }

  return { ok: errors.length === 0, errors };
}
