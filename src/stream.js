// 事件流级别校验：同聚合版本严格递增、关键引用必须存在、时间顺序与流程约束。
// 与 validator.js 的单事件结构校验配合使用。

import { validateEvent, EVENT_AGGREGATE } from "./validator.js";

// 各事件 payload 中需要指向“已存在聚合实例”的引用。
// 形如 { key, aggregateType, allowFuture?: true }，allowFuture 用于先立案后补取证的弱引用。
const REFERENCE_RULES = {
  ACTUAL_PROVIDER_ONBOARDED: [{ key: "business_entity_id", aggregateType: "business_entity" }],
  SERVICE_REGISTERED: [{ key: "business_entity_id", aggregateType: "business_entity" }],
  QUALIFICATION_DECLARED: [
    { key: "business_entity_id", aggregateType: "business_entity" },
    { key: "service_offering_id", aggregateType: "service_offering", optional: true },
  ],
  PROMOTION_VERSION_RECORDED: [
    { key: "business_entity_id", aggregateType: "business_entity" },
    { key: "service_offering_id", aggregateType: "service_offering" },
  ],
  PACKAGE_REGISTERED: [
    { key: "business_entity_id", aggregateType: "business_entity" },
    { key: "service_offering_id", aggregateType: "service_offering" },
    { key: "promotion_version_id", aggregateType: "promotion_version", optional: true },
  ],
  CONSENT_RECORDED: [
    { key: "business_entity_id", aggregateType: "business_entity" },
    { key: "sales_package_id", aggregateType: "sales_package", optional: true },
  ],
  COMPLAINT_FILED: [{ key: "business_entity_id", aggregateType: "business_entity" }],
  JURISDICTION_ACCEPTED: [{ key: "transfer_id", aggregateType: "jurisdiction_transfer" }],
  RECTIFICATION_ORDERED: [{ key: "business_entity_id", aggregateType: "business_entity" }],
  PATH_CLOSED: [{ key: "rectification_order_id", aggregateType: "rectification_order" }],
  ACTION_COMPLETED: [{ key: "business_entity_id", aggregateType: "business_entity" }],
};

// 流程顺序约束：后一事件出现时，对应 case 必须已经存在；在流内按顺序检查。
const CASE_LIFECYCLE = new Set([
  "EVIDENCE_REQUESTED",
  "EVIDENCE_SUPPLEMENTED",
  "COMPLAINT_DELIVERED",
  "DEFENSE_SUBMITTED",
  "RISK_FLAGGED",
  "DETERMINATION_MADE",
  "JURISDICTION_TRANSFERRED",
  "RECTIFICATION_ORDERED",
  "ACTION_COMPLETED",
  "RECURRENCE_LINKED",
  "CASE_CLOSED",
]);

function validateEventStream(events) {
  const errors = [];
  const fail = (index, message) => errors.push(`第 ${index + 1} 条事件：${message}`);

  // aggregate_id 的首次出现必须由“创建型事件”登记
  const creatorEvent = {};
  for (const [eventType, aggregateType] of Object.entries(EVENT_AGGREGATE)) {
    if (!creatorEvent[aggregateType]) creatorEvent[aggregateType] = eventType;
  }

  const registered = new Map(); // aggregateType -> Set(aggregate_id)
  const versions = new Map(); // aggregate_id -> 已见最大 version
  const caseIds = new Set();
  const eventIndex = new Map(); // event_id -> event

  events.forEach((event, index) => {
    const single = validateEvent(event);
    single.forEach((message) => fail(index, message));

    const aggregateKey = event.aggregate_type;
    if (!registered.has(aggregateKey)) registered.set(aggregateKey, new Set());

    // 首次出现的聚合 id 必须由该聚合的创建事件登记
    if (!registered.get(aggregateKey).has(event.aggregate_id)) {
      if (creatorEvent[aggregateKey] !== event.event_type) {
        fail(index, `聚合 ${event.aggregate_id}（${aggregateKey}）必须先由 ${creatorEvent[aggregateKey]} 登记，实际首事件为 ${event.event_type}`);
      }
      registered.get(aggregateKey).add(event.aggregate_id);
    }

    // 同聚合版本严格递增
    const prevVersion = versions.get(event.aggregate_id);
    if (prevVersion !== undefined) {
      if (event.version <= prevVersion) {
        fail(index, `聚合 ${event.aggregate_id} 版本必须严格递增：上一版本 ${prevVersion}，实际 ${event.version}`);
      }
      if (event.version !== prevVersion + 1) {
        fail(index, `聚合 ${event.aggregate_id} 版本不连续：期望 ${prevVersion + 1}，实际 ${event.version}`);
      }
    } else if (event.version !== 1) {
      fail(index, `聚合 ${event.aggregate_id} 首个事件 version 必须从 1 开始，实际为 ${event.version}`);
    }
    versions.set(event.aggregate_id, event.version);

    if (event.event_id) {
      if (eventIndex.has(event.event_id)) fail(index, `event_id 重复：${event.event_id}`);
      eventIndex.set(event.event_id, event);
    }

    const payload = event.payload ?? {};

    if (event.event_type === "COMPLAINT_FILED") caseIds.add(event.aggregate_id);

    // 案件生命周期事件必须能找到已登记案件
    if (CASE_LIFECYCLE.has(event.event_type) && payload.case_id && !caseIds.has(payload.case_id)) {
      fail(index, `${event.event_type} 引用了未登记的案件 case_id=${payload.case_id}`);
    }

    // 结构引用检查
    const rules = REFERENCE_RULES[event.event_type] ?? [];
    for (const rule of rules) {
      const ref = payload[rule.key];
      if (ref === undefined || ref === null || ref === "") {
        if (!rule.optional) fail(index, `payload.${rule.key} 缺失，无法建立关联`);
        continue;
      }
      const set = registered.get(rule.aggregateType);
      if (!set || !set.has(ref)) {
        fail(index, `payload.${rule.key}=${ref} 引用了尚未登记的 ${rule.aggregateType}`);
      }
    }
  });

  // 第二轮：只能在全流登记完成后检查的引用（判定→风险报告/证据、复发→旧案、处置→判定、移送→接收互查）
  const aggregateEvents = new Map(); // aggregate_id -> events[]
  events.forEach((event) => {
    if (!aggregateEvents.has(event.aggregate_id)) aggregateEvents.set(event.aggregate_id, []);
    aggregateEvents.get(event.aggregate_id).push(event);
  });

  events.forEach((event, index) => {
    const payload = event.payload ?? {};

    if (event.event_type === "RECURRENCE_LINKED") {
      for (const priorCaseId of payload.prior_case_ids ?? []) {
        if (!caseIds.has(priorCaseId)) fail(index, `复发关联的旧案 ${priorCaseId} 不存在`);
        if (priorCaseId === payload.case_id) fail(index, "复发案件不能关联自身为旧案");
      }
    }

    if (event.event_type === "JURISDICTION_ACCEPTED") {
      const transferStream = aggregateEvents.get(payload.transfer_id) ?? [];
      const transfer = transferStream.find((e) => e.event_type === "JURISDICTION_TRANSFERRED");
      if (!transfer) {
        fail(index, `接收事件找不到对应的移送记录 ${payload.transfer_id}`);
      } else if (payload.accepted === true) {
        const expected = transfer.payload.evidence_chain.length;
        const got = payload.chain_verification?.items_checked;
        if (got !== expected) {
          fail(index, `接收核对数量 ${got} 与移送证据链数量 ${expected} 不一致`);
        }
      }
    }

    if (event.event_type === "ACTION_COMPLETED") {
      for (const determinationId of payload.determination_ids ?? []) {
        const determination = aggregateEvents.get(determinationId)?.some((e) => e.event_type === "DETERMINATION_MADE");
        if (!determination) fail(index, `处罚挂接的判定 ${determinationId} 不存在`);
      }
      if (payload.linked_rectification_order_id && !aggregateEvents.has(payload.linked_rectification_order_id)) {
        fail(index, `处置引用的整改令 ${payload.linked_rectification_order_id} 不存在`);
      }
    }
  });

  return errors;
}

export { validateEventStream };
