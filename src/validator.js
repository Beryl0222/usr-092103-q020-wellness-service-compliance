// 疗愈服务合规巡查领域事件基础校验。
// 只做跨模块交换必须一致的结构性约束（信封、枚举、角色权限、脱敏、证据链形态），
// 不判断医疗属性、虚假宣传是否成立——那些属于有权人员的 DETERMINATION_MADE。

const required = [
  "event_id",
  "event_type",
  "aggregate_type",
  "aggregate_id",
  "occurred_at",
  "version",
  "summary",
  "actor",
  "payload",
];

export const EVENT_AGGREGATE = {
  PROVIDER_REGISTERED: "business_entity",
  ACTUAL_PROVIDER_ONBOARDED: "service_provider",
  SERVICE_REGISTERED: "service_offering",
  QUALIFICATION_DECLARED: "qualification_declaration",
  PROMOTION_VERSION_RECORDED: "promotion_version",
  PROMOTION_CAPTURED: "promotion_capture",
  PACKAGE_REGISTERED: "sales_package",
  CONSENT_RECORDED: "consent_record",
  COMPLAINT_FILED: "complaint_case",
  EVIDENCE_REQUESTED: "complaint_case",
  EVIDENCE_SUPPLEMENTED: "complaint_case",
  COMPLAINT_DELIVERED: "complaint_case",
  DEFENSE_SUBMITTED: "complaint_case",
  RISK_FLAGGED: "risk_report",
  DETERMINATION_MADE: "determination",
  JURISDICTION_TRANSFERRED: "jurisdiction_transfer",
  JURISDICTION_ACCEPTED: "jurisdiction_transfer",
  RECTIFICATION_ORDERED: "rectification_order",
  PATH_CLOSED: "rectification_order",
  ACTION_COMPLETED: "enforcement_action",
  RECURRENCE_LINKED: "complaint_case",
  CASE_CLOSED: "complaint_case",
};

const ROLES = new Set([
  "SYSTEM",
  "MARKET_REGULATOR",
  "HEALTH_AUTHORITY",
  "ENFORCEMENT_OFFICER",
  "MERCHANT",
  "CONSUMER",
  "PLATFORM",
]);

const OFFICIALS = ["MARKET_REGULATOR", "HEALTH_AUTHORITY", "ENFORCEMENT_OFFICER"];

// 各类事件允许的发起角色
const ACTOR_RULES = {
  PROVIDER_REGISTERED: ["MERCHANT", "PLATFORM"],
  ACTUAL_PROVIDER_ONBOARDED: ["MERCHANT", "PLATFORM"],
  SERVICE_REGISTERED: ["MERCHANT", "PLATFORM"],
  QUALIFICATION_DECLARED: ["MERCHANT", "PLATFORM"],
  PROMOTION_VERSION_RECORDED: ["MERCHANT", "PLATFORM"],
  PROMOTION_CAPTURED: ["SYSTEM", ...OFFICIALS, "CONSUMER", "PLATFORM"],
  PACKAGE_REGISTERED: ["MERCHANT", "PLATFORM"],
  CONSENT_RECORDED: ["CONSUMER", "MERCHANT", "PLATFORM"],
  COMPLAINT_FILED: ["CONSUMER", "MARKET_REGULATOR", "ENFORCEMENT_OFFICER", "PLATFORM"],
  EVIDENCE_REQUESTED: OFFICIALS,
  EVIDENCE_SUPPLEMENTED: ["CONSUMER", ...OFFICIALS, "PLATFORM", "MERCHANT"],
  COMPLAINT_DELIVERED: ["MARKET_REGULATOR", "ENFORCEMENT_OFFICER", "PLATFORM"],
  DEFENSE_SUBMITTED: ["MERCHANT"],
  RISK_FLAGGED: ["SYSTEM"],
  DETERMINATION_MADE: OFFICIALS,
  JURISDICTION_TRANSFERRED: ["MARKET_REGULATOR", "ENFORCEMENT_OFFICER"],
  JURISDICTION_ACCEPTED: OFFICIALS,
  RECTIFICATION_ORDERED: OFFICIALS,
  PATH_CLOSED: ["MERCHANT", ...OFFICIALS, "PLATFORM"],
  ACTION_COMPLETED: OFFICIALS,
  RECURRENCE_LINKED: OFFICIALS,
  CASE_CLOSED: OFFICIALS,
};

// 必须持授权编号才能操作的事件
const AUTHORIZATION_REQUIRED = new Set([
  "DETERMINATION_MADE",
  "RECTIFICATION_ORDERED",
  "ACTION_COMPLETED",
]);

const CHANNELS = ["WEB_PAGE", "SHORT_VIDEO", "LIVE_STREAM", "PRIVATE_DOMAIN", "PLATFORM_STORE", "OFFLINE", "OTHER"];
const SERVICE_FORMS = ["AUDIO", "CRYSTAL", "ZEN_RETREAT", "ONLINE_ENERGY_COURSE", "OTHER"];
const EVIDENCE_KINDS = [
  "WEBPAGE_SNAPSHOT",
  "LIVE_RECORDING",
  "PRIVATE_MESSAGE_SNAPSHOT",
  "TRANSACTION_RECORD",
  "CONTRACT_OR_TERMS",
  "CONSENT_LOG",
  "QUALIFICATION_DOCUMENT",
  "OTHER",
];
const FIXATIONS = ["TRUSTED_TIMESTAMP", "NOTARIZATION", "BLOCKCHAIN", "PLATFORM_ARCHIVE", "NONE"];
const CLAIM_TAGS = [
  "DISEASE_CURE",
  "MEDICAL_DIAGNOSIS",
  "ENERGY_HEALING",
  "GUARANTEED_EFFECT",
  "DETOX_OR_REBALANCE",
  "PRICE_DISCOUNT",
  "OTHER",
];
const COMPLAINT_CATEGORIES = [
  "EXAGGERATED_MEDICAL_CLAIM",
  "FALSE_PROMOTION",
  "AUTO_RENEWAL_DISPUTE",
  "CROSS_REGION_LIVE_EVIDENCE",
  "QUALIFICATION_DISPUTE",
  "PRICE_DISPUTE",
  "OTHER",
];
const RISK_TYPES = [
  "MEDICAL_CLAIM_SUSPECTED",
  "FALSE_PROMOTION_SUSPECTED",
  "AUTO_RENEWAL_CONSENT_WEAK",
  "CROSS_JURISDICTION",
  "QUALIFICATION_MISSING",
  "RECURRENCE_SUSPECTED",
];

const HASH_RE = /^[0-9a-f]{64}$/;
const CREDIT_CODE_RE = /^[0-9A-Z]{18}$/;
const CURRENCY_RE = /^[A-Z]{3}$/;
const WILDCARD_TARGETS = new Set(["*", "ALL", "ALL_PATHS", "全部路径"]);

function isIsoDateTime(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isBool(value) {
  return typeof value === "boolean";
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

// 校验单个事件；返回中文错误信息数组，空数组表示通过。
export function validateEvent(record) {
  const errors = [];
  const fail = (message) => errors.push(message);

  for (const name of required) {
    if (!(name in record)) fail(`缺少字段：${name}`);
  }
  if (errors.length > 0 && record.event_id === undefined) return errors;

  const tag = `事件 ${record.event_id ?? "?"}`;

  if (!nonEmptyString(record.event_id)) fail(`${tag}：event_id 不能为空`);
  if (!EVENT_AGGREGATE[record.event_type]) {
    fail(`${tag}：未知事件类型 ${record.event_type}`);
  }
  if (record.event_type && EVENT_AGGREGATE[record.event_type] && record.aggregate_type !== EVENT_AGGREGATE[record.event_type]) {
    fail(`${tag}：事件 ${record.event_type} 的 aggregate_type 必须是 ${EVENT_AGGREGATE[record.event_type]}，实际为 ${record.aggregate_type}`);
  }
  if (!nonEmptyString(record.aggregate_id)) fail(`${tag}：aggregate_id 不能为空`);
  if (!isIsoDateTime(record.occurred_at)) fail(`${tag}：occurred_at 必须是可解析的时间`);
  if (!Number.isInteger(record.version) || record.version < 1) fail(`${tag}：version 必须是正整数`);
  if (!nonEmptyString(record.summary)) fail(`${tag}：summary 不能为空`);

  validateActor(record, tag, fail);

  if (record.payload === undefined || record.payload === null || typeof record.payload !== "object") {
    fail(`${tag}：payload 必须是对象`);
    return errors;
  }

  const payloadValidator = PAYLOAD_VALIDATORS[record.event_type];
  if (payloadValidator) payloadValidator(record.payload, { tag, fail, actor: record.actor });

  return errors;
}

function validateActor(record, tag, fail) {
  const actor = record.actor;
  if (actor === undefined || actor === null || typeof actor !== "object") {
    fail(`${tag}：actor 必须是对象`);
    return;
  }
  if (!nonEmptyString(actor.actor_id)) fail(`${tag}：actor.actor_id 不能为空`);
  if (!ROLES.has(actor.role)) fail(`${tag}：未知角色 ${actor.role}`);

  const allowed = ACTOR_RULES[record.event_type];
  if (allowed && actor.role && !allowed.includes(actor.role)) {
    fail(`${tag}：${record.event_type} 不允许由角色 ${actor.role} 发起，允许角色：${allowed.join("/")}`);
  }
  if (AUTHORIZATION_REQUIRED.has(record.event_type) && !nonEmptyString(actor.authorization_no)) {
    fail(`${tag}：${record.event_type} 必须填写执法授权编号 authorization_no`);
  }
}

function requireKeys(payload, keys, tag, fail) {
  for (const key of keys) {
    if (payload[key] === undefined || payload[key] === null) fail(`${tag}：payload 缺少字段 ${key}`);
  }
}

function validateEvidenceList(list, prefix, fail, { minItems = 0, fixationRequired = false } = {}) {
  if (!Array.isArray(list)) {
    fail(`${prefix}：证据必须是数组`);
    return;
  }
  if (list.length < minItems) fail(`${prefix}：至少需要 ${minItems} 项证据`);
  list.forEach((item, index) => {
    const p = `${prefix}[${index}]`;
    if (!item || typeof item !== "object") {
      fail(`${p}：证据必须是对象`);
      return;
    }
    if (!nonEmptyString(item.evidence_id)) fail(`${p}：evidence_id 不能为空`);
    if (!EVIDENCE_KINDS.includes(item.kind)) fail(`${p}：未知证据类型 ${item.kind}`);
    if (!HASH_RE.test(item.content_sha256 ?? "")) fail(`${p}：content_sha256 必须是 64 位小写十六进制`);
    if (!isIsoDateTime(item.captured_at)) fail(`${p}：captured_at 必须是可解析的时间`);
    if (!item.source || typeof item.source !== "object") {
      fail(`${p}：source 必须是对象`);
    } else {
      if (!CHANNELS.includes(item.source.channel)) fail(`${p}：未知取证渠道 ${item.source.channel}`);
      if (!nonEmptyString(item.source.locator)) fail(`${p}：source.locator 必须保存可验证来源定位`);
    }
    if (item.fixation !== undefined && !FIXATIONS.includes(item.fixation)) fail(`${p}：未知固证方式 ${item.fixation}`);
    if (fixationRequired && (!item.fixation || item.fixation === "NONE")) {
      fail(`${p}：跨区域移送的证据必须已固证（可信时间戳/公证/区块链/平台存档）`);
    }
  });
}

function validatePrice(price, tag, fail) {
  if (!price || typeof price !== "object") {
    fail(`${tag}：price 必须是对象`);
    return;
  }
  if (!Number.isInteger(price.amount_fen) || price.amount_fen < 0) fail(`${tag}：price.amount_fen 必须是非负整数（分）`);
  if (!CURRENCY_RE.test(price.currency ?? "")) fail(`${tag}：price.currency 必须是三位 ISO 货币代码`);
}

// 判定事项与主管部门角色的对应：卫生口径 vs 市场监管口径，联合执法人员两类均可。
const SUBJECT_ROLES = {
  MEDICAL_ATTRIBUTE: ["HEALTH_AUTHORITY", "ENFORCEMENT_OFFICER"],
  ILLEGAL_MEDICAL_PRACTICE: ["HEALTH_AUTHORITY", "ENFORCEMENT_OFFICER"],
  QUALIFICATION_STATUS: ["HEALTH_AUTHORITY", "ENFORCEMENT_OFFICER"],
  FALSE_PROMOTION: ["MARKET_REGULATOR", "ENFORCEMENT_OFFICER"],
  AUTO_RENEWAL_COMPLIANCE: ["MARKET_REGULATOR", "ENFORCEMENT_OFFICER"],
};

const PAYLOAD_VALIDATORS = {
  PROVIDER_REGISTERED(payload, { tag, fail }) {
    requireKeys(payload, ["entity_name", "credit_code", "registered_region_code"], tag, fail);
    if (payload.entity_name !== undefined && !nonEmptyString(payload.entity_name)) fail(`${tag}：entity_name 不能为空`);
    if (!CREDIT_CODE_RE.test(payload.credit_code ?? "")) fail(`${tag}：credit_code 必须是 18 位统一社会信用代码`);
    if (payload.registered_region_code !== undefined && !nonEmptyString(payload.registered_region_code)) {
      fail(`${tag}：registered_region_code 不能为空`);
    }
  },

  ACTUAL_PROVIDER_ONBOARDED(payload, { tag, fail }) {
    requireKeys(payload, ["business_entity_id", "provider_name", "role_in_service"], tag, fail);
    const roles = ["INSTRUCTOR", "STREAMER", "THERAPIST_CLAIMED", "SALES", "OTHER"];
    if (payload.role_in_service && !roles.includes(payload.role_in_service)) fail(`${tag}：未知实际提供者角色 ${payload.role_in_service}`);
  },

  SERVICE_REGISTERED(payload, { tag, fail }) {
    requireKeys(payload, ["business_entity_id", "service_name", "service_forms"], tag, fail);
    if (!Array.isArray(payload.service_forms) || payload.service_forms.length === 0) {
      fail(`${tag}：service_forms 至少包含一种服务形态`);
    } else {
      payload.service_forms.forEach((form) => {
        if (!SERVICE_FORMS.includes(form)) fail(`${tag}：未知服务形态 ${form}`);
      });
    }
  },

  QUALIFICATION_DECLARED(payload, { tag, fail }) {
    requireKeys(payload, ["business_entity_id", "declaration_type", "medical_claim_made"], tag, fail);
    const types = ["MEDICAL_INSTITUTION_LICENSE", "MEDICAL_PRACTITIONER_QUALIFICATION", "NON_MEDICAL_TRAINING", "NONE", "OTHER"];
    if (payload.declaration_type && !types.includes(payload.declaration_type)) fail(`${tag}：未知资质声明类型 ${payload.declaration_type}`);
    if (!isBool(payload.medical_claim_made)) fail(`${tag}：medical_claim_made 必须是布尔值（仅记录是否声称医疗功效，不代表认定）`);
    if (payload.evidence) validateEvidenceList(payload.evidence, `${tag}：资质证据`, fail);
  },

  PROMOTION_VERSION_RECORDED(payload, { tag, fail }) {
    requireKeys(
      payload,
      ["business_entity_id", "service_offering_id", "promotion_fingerprint", "content_excerpt", "first_seen_channel"],
      tag,
      fail,
    );
    if (payload.promotion_fingerprint !== undefined && String(payload.promotion_fingerprint).length < 8) {
      fail(`${tag}：promotion_fingerprint 至少 8 位，用于跨账号跨渠道识别同一宣传版本`);
    }
    if (payload.content_excerpt !== undefined && !nonEmptyString(payload.content_excerpt)) fail(`${tag}：content_excerpt 不能为空`);
    if (payload.first_seen_channel && !CHANNELS.includes(payload.first_seen_channel)) {
      fail(`${tag}：未知渠道 ${payload.first_seen_channel}`);
    }
    if (payload.claim_tags) {
      payload.claim_tags.forEach((claim) => {
        if (!CLAIM_TAGS.includes(claim)) fail(`${tag}：未知宣传主张标签 ${claim}`);
      });
    }
  },

  PROMOTION_CAPTURED(payload, { tag, fail, actor }) {
    requireKeys(payload, ["promotion_version_id", "evidence", "captured_by_role"], tag, fail);
    const captureRoles = ["REGULATOR", "CONSUMER_SUBMITTED", "PLATFORM", "SYSTEM_CRAWL"];
    if (payload.captured_by_role && !captureRoles.includes(payload.captured_by_role)) {
      fail(`${tag}：未知取证来源角色 ${payload.captured_by_role}`);
    }
    const expectedActor = {
      SYSTEM_CRAWL: "SYSTEM",
      REGULATOR: OFFICIALS,
      CONSUMER_SUBMITTED: ["CONSUMER"],
      PLATFORM: ["PLATFORM"],
    };
    if (payload.captured_by_role && actor?.role) {
      const expected = expectedActor[payload.captured_by_role];
      const ok = Array.isArray(expected) ? expected.includes(actor.role) : expected === actor.role;
      if (!ok) fail(`${tag}：captured_by_role=${payload.captured_by_role} 与发起角色 ${actor.role} 不一致`);
    }
    validateEvidenceList(payload.evidence, `${tag}：取证`, fail, { minItems: 1 });
  },

  PACKAGE_REGISTERED(payload, { tag, fail }) {
    requireKeys(payload, ["business_entity_id", "service_offering_id", "package_name", "price", "auto_renew"], tag, fail);
    if (payload.price) validatePrice(payload.price, tag, fail);
    if (payload.billing_cycle && !["ONE_TIME", "MONTHLY", "QUARTERLY", "YEARLY", "PER_SESSION", "OTHER"].includes(payload.billing_cycle)) {
      fail(`${tag}：未知计费周期 ${payload.billing_cycle}`);
    }
    const ar = payload.auto_renew;
    if (ar && typeof ar === "object") {
      if (!isBool(ar.enabled)) fail(`${tag}：auto_renew.enabled 必须是布尔值`);
      for (const key of ["terms_disclosed", "separate_consent_required"]) {
        if (!isBool(ar[key])) fail(`${tag}：auto_renew.${key} 必须是布尔值`);
      }
      // 是否依法取得单独同意不由系统认定；但字段缺失会影响风险规则匹配，故只保证形态。
    }
    if (payload.sales_paths) {
      payload.sales_paths.forEach((path, index) => {
        const p = `${tag}：sales_paths[${index}]`;
        if (!nonEmptyString(path?.path_id)) fail(`${p}：path_id 不能为空（整改按路径精确关闭）`);
        if (path?.channel && !CHANNELS.includes(path.channel)) fail(`${p}：未知渠道 ${path.channel}`);
      });
    }
  },

  CONSENT_RECORDED(payload, { tag, fail }) {
    requireKeys(payload, ["business_entity_id", "consent_scope", "consent_text_hash", "granted_at"], tag, fail);
    const scopes = ["PURCHASE_TERMS", "AUTO_RENEWAL", "MARKETING_CONTACT", "DATA_SHARING", "OTHER"];
    if (!Array.isArray(payload.consent_scope) || payload.consent_scope.length === 0) {
      fail(`${tag}：consent_scope 至少一项`);
    } else {
      payload.consent_scope.forEach((scope) => {
        if (!scopes.includes(scope)) fail(`${tag}：未知同意范围 ${scope}`);
      });
    }
    if (!HASH_RE.test(payload.consent_text_hash ?? "")) fail(`${tag}：consent_text_hash 必须是 64 位小写十六进制`);
    if (!isIsoDateTime(payload.granted_at)) fail(`${tag}：granted_at 必须是可解析的时间`);
    if (payload.withdrawn_at && !isIsoDateTime(payload.withdrawn_at)) fail(`${tag}：withdrawn_at 必须是可解析的时间`);
    if (payload.evidence) validateEvidenceList(payload.evidence, `${tag}：同意存证`, fail);
  },

  COMPLAINT_FILED(payload, { tag, fail }) {
    requireKeys(payload, ["business_entity_id", "categories", "complainant_redacted"], tag, fail);
    if (!Array.isArray(payload.categories) || payload.categories.length === 0) {
      fail(`${tag}：categories 至少一项`);
    } else {
      payload.categories.forEach((category) => {
        if (!COMPLAINT_CATEGORIES.includes(category)) fail(`${tag}：未知投诉类别 ${category}`);
      });
    }
    if (!isBool(payload.complainant_redacted)) fail(`${tag}：complainant_redacted 必须是布尔值`);
    if (payload.evidence) validateEvidenceList(payload.evidence, `${tag}：投诉证据`, fail);
  },

  EVIDENCE_REQUESTED(payload, { tag, fail }) {
    requireKeys(payload, ["case_id", "requested_items", "due_at"], tag, fail);
    if (!Array.isArray(payload.requested_items) || payload.requested_items.length === 0) {
      fail(`${tag}：requested_items 至少一项，需向消费者说明补什么`);
    } else {
      payload.requested_items.forEach((item, index) => {
        if (!nonEmptyString(item?.item) || !nonEmptyString(item?.purpose)) {
          fail(`${tag}：requested_items[${index}] 必须包含 item 与 purpose`);
        }
      });
    }
    if (payload.due_at && !isIsoDateTime(payload.due_at)) fail(`${tag}：due_at 必须是可解析的时间`);
  },

  EVIDENCE_SUPPLEMENTED(payload, { tag, fail, actor }) {
    requireKeys(payload, ["case_id", "submitted_by_role", "evidence"], tag, fail);
    const submitterRoles = ["CONSUMER", "REGULATOR", "PLATFORM", "MERCHANT"];
    if (payload.submitted_by_role && !submitterRoles.includes(payload.submitted_by_role)) {
      fail(`${tag}：未知补充证据角色 ${payload.submitted_by_role}`);
    }
    const group = {
      CONSUMER: ["CONSUMER"],
      REGULATOR: OFFICIALS,
      PLATFORM: ["PLATFORM"],
      MERCHANT: ["MERCHANT"],
    };
    if (payload.submitted_by_role && actor?.role && !group[payload.submitted_by_role].includes(actor.role)) {
      fail(`${tag}：submitted_by_role=${payload.submitted_by_role} 与发起角色 ${actor.role} 不一致`);
    }
    validateEvidenceList(payload.evidence, `${tag}：补充证据`, fail, { minItems: 1 });
  },

  COMPLAINT_DELIVERED(payload, { tag, fail }) {
    requireKeys(payload, ["case_id", "business_entity_id", "dispute_content", "pii_redacted", "defense_window"], tag, fail);
    if (payload.pii_redacted !== true) {
      fail(`${tag}：向商户送达前必须完成投诉人隐私脱敏（pii_redacted=true），实行最小披露`);
    }
    const content = payload.dispute_content;
    if (!content || typeof content !== "object" || !Array.isArray(content.disputed_claims) || content.disputed_claims.length === 0) {
      fail(`${tag}：dispute_content.disputed_claims 必须列出具体争议宣传原文，不能只给笼统案由`);
    }
    const window = payload.defense_window;
    if (window && (!isIsoDateTime(window.opens_at) || !isIsoDateTime(window.closes_at))) {
      fail(`${tag}：defense_window 的 opens_at/closes_at 必须是可解析的时间`);
    } else if (window && Date.parse(window.closes_at) <= Date.parse(window.opens_at)) {
      fail(`${tag}：申辩窗口 closes_at 必须晚于 opens_at`);
    }
  },

  DEFENSE_SUBMITTED(payload, { tag, fail }) {
    requireKeys(payload, ["case_id", "submitted_by_entity_id", "statement", "submitted_at"], tag, fail);
    if (payload.statement !== undefined && !nonEmptyString(payload.statement)) fail(`${tag}：statement 不能为空`);
    if (payload.submitted_at && !isIsoDateTime(payload.submitted_at)) fail(`${tag}：submitted_at 必须是可解析的时间`);
    if (payload.evidence) validateEvidenceList(payload.evidence, `${tag}：申辩证据`, fail);
  },

  RISK_FLAGGED(payload, { tag, fail }) {
    requireKeys(payload, ["case_id", "rule_set_version", "negative_list_version", "matched_rules", "risk_level", "advisory_only"], tag, fail);
    if (payload.advisory_only !== true) {
      fail(`${tag}：系统风险提示必须 advisory_only=true；医疗属性、虚假宣传只能由有权人员判定`);
    }
    if (!nonEmptyString(payload.rule_set_version)) fail(`${tag}：rule_set_version 不能为空，风险提示须可按版本复算`);
    if (!nonEmptyString(payload.negative_list_version)) fail(`${tag}：negative_list_version 不能为空`);
    if (!["LOW", "MEDIUM", "HIGH"].includes(payload.risk_level)) fail(`${tag}：risk_level 取 LOW/MEDIUM/HIGH`);
    if (!Array.isArray(payload.matched_rules) || payload.matched_rules.length === 0) {
      fail(`${tag}：matched_rules 至少一条`);
    } else {
      payload.matched_rules.forEach((rule, index) => {
        const p = `${tag}：matched_rules[${index}]`;
        if (!nonEmptyString(rule?.rule_code) || !nonEmptyString(rule?.rule_name)) fail(`${p}：rule_code/rule_name 不能为空`);
        if (!RISK_TYPES.includes(rule?.risk_type)) fail(`${p}：未知风险类型 ${rule?.risk_type}`);
      });
    }
    for (const forbidden of ["conclusion", "penalty_decision", "violation_found"]) {
      if (forbidden in payload) fail(`${tag}：风险提示不得携带 ${forbidden}，系统无权下结论`);
    }
  },

  DETERMINATION_MADE(payload, { tag, fail, actor }) {
    requireKeys(payload, ["case_id", "subject", "conclusion", "reasoning", "legal_basis", "basis_evidence_ids", "re_determination"], tag, fail);
    const subjects = Object.keys(SUBJECT_ROLES);
    if (payload.subject && !subjects.includes(payload.subject)) fail(`${tag}：未知判定事项 ${payload.subject}`);
    if (payload.subject && actor?.role && !SUBJECT_ROLES[payload.subject].includes(actor.role)) {
      fail(`${tag}：${payload.subject} 不属于角色 ${actor.role} 的职权范围（市场监管与卫生部门按事项分工）`);
    }
    if (payload.conclusion && !["CONFIRMED", "NOT_CONFIRMED", "PARTIALLY_CONFIRMED"].includes(payload.conclusion)) {
      fail(`${tag}：未知判定结论 ${payload.conclusion}`);
    }
    if (payload.reasoning !== undefined && !nonEmptyString(payload.reasoning)) fail(`${tag}：reasoning 不能为空`);
    if (!Array.isArray(payload.legal_basis) || payload.legal_basis.length === 0) {
      fail(`${tag}：legal_basis 至少一条`);
    } else {
      payload.legal_basis.forEach((basis, index) => {
        if (!nonEmptyString(basis?.law) || !nonEmptyString(basis?.provision)) {
          fail(`${tag}：legal_basis[${index}] 必须包含 law 与 provision`);
        }
      });
    }
    if (!Array.isArray(payload.basis_evidence_ids) || payload.basis_evidence_ids.length === 0) {
      fail(`${tag}：basis_evidence_ids 至少一项，判定必须落到具体证据`);
    }
    if (!isBool(payload.re_determination)) fail(`${tag}：re_determination 必须是布尔值`);
    if (payload.re_determination === true && !nonEmptyString(payload.prior_determination_id)) {
      fail(`${tag}：复发重判必须填写 prior_determination_id 以关联旧判定`);
    }
  },

  JURISDICTION_TRANSFERRED(payload, { tag, fail }) {
    requireKeys(payload, ["case_id", "from_jurisdiction", "to_jurisdiction", "reason", "evidence_chain", "transferred_at"], tag, fail);
    if (payload.from_jurisdiction === payload.to_jurisdiction && payload.from_jurisdiction !== undefined) {
      fail(`${tag}：移送前后辖区不能相同`);
    }
    const reasons = ["LIVE_STREAM_ORIGIN", "BUSINESS_REGISTRATION", "PAYMENT_ACCOUNT_LOCATION", "CONSUMER_LOCATION", "DESIGNATED_JURISDICTION", "OTHER"];
    if (payload.reason && !reasons.includes(payload.reason)) fail(`${tag}：未知移送理由 ${payload.reason}`);
    if (!Array.isArray(payload.evidence_chain) || payload.evidence_chain.length === 0) {
      fail(`${tag}：evidence_chain 至少一项，原证据链必须随案移送`);
    } else {
      payload.evidence_chain.forEach((item, index) => {
        const p = `${tag}：evidence_chain[${index}]`;
        if (!nonEmptyString(item?.evidence_id)) fail(`${p}：evidence_id 不能为空`);
        if (!HASH_RE.test(item?.content_sha256 ?? "")) fail(`${p}：content_sha256 必须是 64 位小写十六进制`);
        if (!nonEmptyString(item?.origin_capture_id)) fail(`${p}：origin_capture_id 不能为空`);
        if (!item.fixation || item.fixation === "NONE") fail(`${p}：移送证据必须保留原始固证（可信时间戳/公证/区块链/平台存档）`);
        if (item.fixation && !FIXATIONS.includes(item.fixation)) fail(`${p}：未知固证方式 ${item.fixation}`);
      });
    }
    if (payload.transferred_at && !isIsoDateTime(payload.transferred_at)) fail(`${tag}：transferred_at 必须是可解析的时间`);
  },

  JURISDICTION_ACCEPTED(payload, { tag, fail }) {
    requireKeys(payload, ["transfer_id", "accepted", "chain_verification", "decided_at"], tag, fail);
    if (!isBool(payload.accepted)) fail(`${tag}：accepted 必须是布尔值`);
    const cv = payload.chain_verification;
    if (cv && typeof cv === "object") {
      if (!Number.isInteger(cv.items_checked) || cv.items_checked < 0) fail(`${tag}：items_checked 必须是非负整数`);
      if (!Number.isInteger(cv.items_expected) || cv.items_expected < 1) fail(`${tag}：items_expected 必须是正整数`);
      if (!isBool(cv.all_hashes_match)) fail(`${tag}：all_hashes_match 必须是布尔值`);
      if (!isBool(cv.original_fixation_preserved)) fail(`${tag}：original_fixation_preserved 必须是布尔值`);
    }
    if (payload.accepted === true && cv) {
      if (cv.items_checked !== cv.items_expected) fail(`${tag}：接收移送必须逐项核对全部证据（items_checked 应等于 items_expected）`);
      if (cv.all_hashes_match !== true) fail(`${tag}：哈希核对不一致时不得接收`);
      if (cv.original_fixation_preserved !== true) fail(`${tag}：原始固证未保留时不得接收`);
    }
    if (payload.accepted === false && !nonEmptyString(payload.rejection_reason)) {
      fail(`${tag}：拒绝接收必须填写 rejection_reason`);
    }
    if (payload.decided_at && !isIsoDateTime(payload.decided_at)) fail(`${tag}：decided_at 必须是可解析的时间`);
  },

  RECTIFICATION_ORDERED(payload, { tag, fail }) {
    requireKeys(payload, ["case_id", "business_entity_id", "scopes", "deadline"], tag, fail);
    if (payload.deadline && !isIsoDateTime(payload.deadline)) fail(`${tag}：deadline 必须是可解析的时间`);
    validateScopes(payload.scopes, tag, fail);
  },

  PATH_CLOSED(payload, { tag, fail }) {
    requireKeys(payload, ["rectification_order_id", "closed_scopes", "closed_at", "verified_evidence"], tag, fail);
    validateScopes(payload.closed_scopes, tag, fail, { actionRequired: false });
    if (payload.closed_at && !isIsoDateTime(payload.closed_at)) fail(`${tag}：closed_at 必须是可解析的时间`);
    validateEvidenceList(payload.verified_evidence, `${tag}：关闭复核取证`, fail, { minItems: 1 });
  },

  ACTION_COMPLETED(payload, { tag, fail }) {
    requireKeys(payload, ["case_id", "business_entity_id", "decision_type", "determination_ids", "decided_at"], tag, fail);
    const decisions = [
      "WARNING",
      "ORDER_CORRECTION",
      "FINE",
      "CONFISCATION",
      "REFUND_ORDER",
      "CASE_TRANSFERRED_FOR_PROSECUTION",
      "NO_PENALTY",
      "OTHER",
    ];
    if (payload.decision_type && !decisions.includes(payload.decision_type)) fail(`${tag}：未知处置类型 ${payload.decision_type}`);
    if (!Array.isArray(payload.determination_ids) || payload.determination_ids.length === 0) {
      fail(`${tag}：determination_ids 至少一项，处罚必须挂接到人工判定`);
    }
    if (payload.amount_fen !== undefined && (!Number.isInteger(payload.amount_fen) || payload.amount_fen < 0)) {
      fail(`${tag}：amount_fen 必须是非负整数`);
    }
    if (payload.decided_at && !isIsoDateTime(payload.decided_at)) fail(`${tag}：decided_at 必须是可解析的时间`);
  },

  RECURRENCE_LINKED(payload, { tag, fail }) {
    requireKeys(
      payload,
      ["case_id", "prior_case_ids", "same_promotion_fingerprint", "new_capture_ids", "reuse_old_conclusion", "re_determination_required"],
      tag,
      fail,
    );
    if (!Array.isArray(payload.prior_case_ids) || payload.prior_case_ids.length === 0) fail(`${tag}：prior_case_ids 至少一项`);
    if (!Array.isArray(payload.new_capture_ids) || payload.new_capture_ids.length === 0) fail(`${tag}：new_capture_ids 至少一项`);
    if (!isBool(payload.same_promotion_fingerprint)) fail(`${tag}：same_promotion_fingerprint 必须是布尔值`);
    if (payload.reuse_old_conclusion !== false) fail(`${tag}：复发案件禁止直接沿用旧结论（reuse_old_conclusion 必须为 false）`);
    if (payload.re_determination_required !== true) fail(`${tag}：复发案件必须基于新证据重新判定（re_determination_required 必须为 true）`);
  },

  CASE_CLOSED(payload, { tag, fail }) {
    requireKeys(payload, ["case_id", "closed_at", "resolution"], tag, fail);
    const resolutions = [
      "PENALTY_ISSUED",
      "RECTIFIED_NO_PENALTY",
      "TRANSFERRED",
      "WITHDRAWN",
      "INSUFFICIENT_EVIDENCE",
      "OTHER",
    ];
    if (payload.resolution && !resolutions.includes(payload.resolution)) fail(`${tag}：未知结案方式 ${payload.resolution}`);
    if (payload.closed_at && !isIsoDateTime(payload.closed_at)) fail(`${tag}：closed_at 必须是可解析的时间`);
  },
};

function validateScopes(scopes, tag, fail, { actionRequired = true } = {}) {
  if (!Array.isArray(scopes) || scopes.length === 0) {
    fail(`${tag}：整改/关闭范围至少一项，且必须限定到具体宣传或销售路径`);
    return;
  }
  scopes.forEach((scope, index) => {
    const p = `${tag}：scopes[${index}]`;
    const types = ["PROMOTION_CHANNEL", "SALES_PATH", "RENEWAL_TERM", "QUALIFICATION_DISPLAY"];
    if (!types.includes(scope?.scope_type)) fail(`${p}：scope_type 必须是 ${types.join("/")}`);
    if (!nonEmptyString(scope?.target_ref) || WILDCARD_TARGETS.has(scope.target_ref.trim().toUpperCase())) {
      fail(`${p}：target_ref 必须指向具体取证/销售路径编号，禁止整店式通配关闭`);
    }
    if (scope?.channel && !CHANNELS.includes(scope.channel)) fail(`${p}：未知渠道 ${scope.channel}`);
    if (actionRequired) {
      const actions = ["TAKE_DOWN_PROMOTION", "STOP_LIVE_SESSION", "DELETE_PRIVATE_SCRIPT", "CANCEL_AUTO_RENEW", "REFUND", "CORRECT_QUALIFICATION_CLAIM", "OTHER"];
      if (!actions.includes(scope.required_action)) fail(`${p}：required_action 必须是 ${actions.join("/")}`);
    }
  });
}
