import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { validateEvent } from "../src/validator.js";

const HASH = "a".repeat(64);

function baseEvent(overrides = {}) {
  return {
    event_id: "evt-test",
    event_type: "PROVIDER_REGISTERED",
    aggregate_type: "business_entity",
    aggregate_id: "be-test",
    occurred_at: "2026-10-01T10:00:00+08:00",
    version: 1,
    summary: "测试事件",
    actor: { actor_id: "actor-1", role: "MERCHANT" },
    payload: {
      entity_name: "测试主体",
      credit_code: "91330106MA2H8X7K4Q",
      registered_region_code: "330100",
    },
    ...overrides,
  };
}

function riskEvent(overrides = {}) {
  return baseEvent({
    event_id: "evt-risk",
    event_type: "RISK_FLAGGED",
    aggregate_type: "risk_report",
    aggregate_id: "rr-test",
    actor: { actor_id: "rule-engine", role: "SYSTEM" },
    payload: {
      case_id: "case-test",
      rule_set_version: "RS-2026.08",
      negative_list_version: "NL-2026.07",
      matched_rules: [
        { rule_code: "NL-MED-01", rule_name: "非医疗服务宣称疾病治疗效果", risk_type: "MEDICAL_CLAIM_SUSPECTED" },
      ],
      risk_level: "HIGH",
      advisory_only: true,
    },
    ...overrides,
  });
}

function determinationEvent(overrides = {}) {
  return baseEvent({
    event_id: "evt-det",
    event_type: "DETERMINATION_MADE",
    aggregate_type: "determination",
    aggregate_id: "det-test",
    actor: { actor_id: "officer-1", role: "MARKET_REGULATOR", jurisdiction: "330100", authorization_no: "执法证001" },
    payload: {
      case_id: "case-test",
      subject: "FALSE_PROMOTION",
      conclusion: "CONFIRMED",
      reasoning: "三处宣传均含疾病治疗承诺，无任何依据。",
      legal_basis: [{ law: "广告法", provision: "第二十八条" }],
      basis_evidence_ids: ["ev-1"],
      re_determination: false,
    },
    ...overrides,
  });
}

test("样例符合领域约定", async () => {
  const sample = JSON.parse(await readFile(new URL("../data/sample.json", import.meta.url), "utf8"));
  assert.deepEqual(validateEvent(sample), []);
});

test("事件类型必须配对正确的聚合类型", () => {
  const event = baseEvent({ aggregate_type: "complaint_case" });
  assert.match(validateEvent(event)[0], /aggregate_type 必须是 business_entity/);
});

test("系统只能提示风险：advisory_only 不为 true 时拒绝", () => {
  const event = riskEvent({ payload: { ...riskEvent().payload, advisory_only: false } });
  assert.ok(validateEvent(event).some((m) => m.includes("advisory_only")));
});

test("系统风险提示不得携带违法结论或处罚字段", () => {
  for (const forbidden of ["conclusion", "penalty_decision", "violation_found"]) {
    const event = riskEvent({ payload: { ...riskEvent().payload, [forbidden]: "CONFIRMED" } });
    assert.ok(
      validateEvent(event).some((m) => m.includes("系统无权下结论")),
      `字段 ${forbidden} 应被拒绝`,
    );
  }
});

test("RISK_FLAGGED 只能由 SYSTEM 发起，判定只能由有权人员作出", () => {
  const byOfficer = riskEvent({ actor: { actor_id: "o1", role: "ENFORCEMENT_OFFICER" } });
  assert.ok(validateEvent(byOfficer).some((m) => m.includes("不允许由角色")));

  const bySystem = determinationEvent({ actor: { actor_id: "sys", role: "SYSTEM" } });
  assert.ok(validateEvent(bySystem).some((m) => m.includes("不允许由角色")));
});

test("人工判定必须填写执法授权编号", () => {
  const event = determinationEvent({
    actor: { actor_id: "o1", role: "MARKET_REGULATOR" },
  });
  assert.ok(validateEvent(event).some((m) => m.includes("authorization_no")));
});

test("医疗属性判定属于卫生部门职权，市场监管不能越权判定", () => {
  const event = determinationEvent({
    payload: { ...determinationEvent().payload, subject: "MEDICAL_ATTRIBUTE" },
  });
  assert.ok(validateEvent(event).some((m) => m.includes("职权范围")));

  // 卫生部门判定医疗属性可以通过（结构层面）
  const health = determinationEvent({
    actor: { actor_id: "h1", role: "HEALTH_AUTHORITY", authorization_no: "卫生监督证001" },
    payload: { ...determinationEvent().payload, subject: "MEDICAL_ATTRIBUTE" },
  });
  assert.deepEqual(validateEvent(health), []);
});

test("复发重判必须 re_determination=true 并关联旧判定", () => {
  const reDet = determinationEvent({
    aggregate_id: "det-redet",
    payload: { ...determinationEvent().payload, re_determination: true },
  });
  assert.ok(validateEvent(reDet).some((m) => m.includes("prior_determination_id")));

  const ok = determinationEvent({
    aggregate_id: "det-redet2",
    payload: { ...determinationEvent().payload, re_determination: true, prior_determination_id: "det-old" },
  });
  assert.deepEqual(validateEvent(ok), []);
});

test("向商户送达必须脱敏并附具体争议内容与申辩窗口", () => {
  const delivered = (payloadOverride) =>
    baseEvent({
      event_id: "evt-deliver",
      event_type: "COMPLAINT_DELIVERED",
      aggregate_type: "complaint_case",
      aggregate_id: "case-test",
      version: 2,
      actor: { actor_id: "o1", role: "MARKET_REGULATOR", authorization_no: "执法证001" },
      payload: {
        case_id: "case-test",
        business_entity_id: "be-test",
        dispute_content: { disputed_claims: ["治愈抑郁，无效退款（官网原文）"], related_capture_ids: ["pc-1"] },
        pii_redacted: true,
        defense_window: { opens_at: "2026-10-01T09:00:00+08:00", closes_at: "2026-10-05T18:00:00+08:00" },
        ...payloadOverride,
      },
    });

  assert.deepEqual(validateEvent(delivered()), []);

  const notRedacted = delivered({ pii_redacted: false });
  assert.ok(validateEvent(notRedacted).some((m) => m.includes("脱敏")));

  const vague = delivered({ dispute_content: { disputed_claims: [] } });
  assert.ok(validateEvent(vague).some((m) => m.includes("具体争议宣传原文")));

  const badWindow = delivered({
    defense_window: { opens_at: "2026-10-05T18:00:00+08:00", closes_at: "2026-10-01T09:00:00+08:00" },
  });
  assert.ok(validateEvent(badWindow).some((m) => m.includes("closes_at 必须晚于")));
});

test("取证必须保存可验证时间、来源定位与哈希", () => {
  const captured = baseEvent({
    event_id: "evt-cap",
    event_type: "PROMOTION_CAPTURED",
    aggregate_type: "promotion_capture",
    aggregate_id: "pc-test",
    actor: { actor_id: "sys", role: "SYSTEM" },
    payload: {
      promotion_version_id: "pv-1",
      captured_by_role: "SYSTEM_CRAWL",
      evidence: [
        {
          evidence_id: "ev-1",
          kind: "WEBPAGE_SNAPSHOT",
          content_sha256: HASH,
          captured_at: "2026-10-01T03:00:00+08:00",
          source: { channel: "WEB_PAGE", locator: "https://example.cn/p" },
          fixation: "TRUSTED_TIMESTAMP",
        },
      ],
    },
  });
  assert.deepEqual(validateEvent(captured), []);

  const noLocator = structuredClone(captured);
  noLocator.payload.evidence[0].source.locator = "";
  assert.ok(validateEvent(noLocator).some((m) => m.includes("locator")));

  const badHash = structuredClone(captured);
  badHash.payload.evidence[0].content_sha256 = "not-a-hash";
  assert.ok(validateEvent(badHash).some((m) => m.includes("content_sha256")));
});

test("整改范围必须限定到具体路径，禁止通配整店关闭", () => {
  const ordered = (targetRef) =>
    baseEvent({
      event_id: "evt-ro",
      event_type: "RECTIFICATION_ORDERED",
      aggregate_type: "rectification_order",
      aggregate_id: "ro-test",
      actor: { actor_id: "o1", role: "ENFORCEMENT_OFFICER", authorization_no: "执法证001" },
      payload: {
        case_id: "case-test",
        business_entity_id: "be-test",
        scopes: [
          { scope_type: "PROMOTION_CHANNEL", target_ref: targetRef, channel: "LIVE_STREAM", required_action: "STOP_LIVE_SESSION" },
        ],
        deadline: "2026-10-05T18:00:00+08:00",
      },
    });

  assert.deepEqual(validateEvent(ordered("pc-live-0001")), []);
  for (const wildcard of ["*", "ALL", "全部路径"]) {
    assert.ok(
      validateEvent(ordered(wildcard)).some((m) => m.includes("禁止整店式通配关闭")),
      `${wildcard} 应被拒绝`,
    );
  }
});

test("移送证据必须固证；接收方哈希不一致不得接收", () => {
  const transfer = baseEvent({
    event_id: "evt-tf",
    event_type: "JURISDICTION_TRANSFERRED",
    aggregate_type: "jurisdiction_transfer",
    aggregate_id: "jt-test",
    actor: { actor_id: "o1", role: "MARKET_REGULATOR", authorization_no: "执法证001" },
    payload: {
      case_id: "case-test",
      from_jurisdiction: "330000",
      to_jurisdiction: "530000",
      reason: "LIVE_STREAM_ORIGIN",
      evidence_chain: [
        { evidence_id: "ev-1", content_sha256: HASH, origin_capture_id: "pc-1", fixation: "NONE" },
      ],
      transferred_at: "2026-10-01T10:00:00+08:00",
    },
  });
  assert.ok(validateEvent(transfer).some((m) => m.includes("必须保留原始固证")));

  const accepted = (verification) =>
    baseEvent({
      event_id: "evt-acc",
      event_type: "JURISDICTION_ACCEPTED",
      aggregate_type: "jurisdiction_transfer",
      aggregate_id: "jt-test",
      version: 2,
      actor: { actor_id: "o2", role: "ENFORCEMENT_OFFICER", jurisdiction: "532900", authorization_no: "执法证002" },
      payload: {
        transfer_id: "jt-test",
        accepted: true,
        chain_verification: verification,
        decided_at: "2026-10-03T10:00:00+08:00",
      },
    });

  const mismatch = accepted({
    items_checked: 1,
    items_expected: 1,
    all_hashes_match: false,
    original_fixation_preserved: true,
  });
  assert.ok(validateEvent(mismatch).some((m) => m.includes("哈希核对不一致")));

  const partial = accepted({
    items_checked: 0,
    items_expected: 1,
    all_hashes_match: true,
    original_fixation_preserved: true,
  });
  assert.ok(validateEvent(partial).some((m) => m.includes("逐项核对全部证据")));
});

test("复发关联必须显式禁止沿用旧结论、要求重新判定", () => {
  const linked = (override) =>
    baseEvent({
      event_id: "evt-recur",
      event_type: "RECURRENCE_LINKED",
      aggregate_type: "complaint_case",
      aggregate_id: "case-new",
      version: 2,
      actor: { actor_id: "o1", role: "MARKET_REGULATOR", authorization_no: "执法证001" },
      payload: {
        case_id: "case-new",
        prior_case_ids: ["case-old"],
        same_promotion_fingerprint: true,
        new_capture_ids: ["pc-new"],
        reuse_old_conclusion: false,
        re_determination_required: true,
        ...override,
      },
    });

  assert.deepEqual(validateEvent(linked()), []);
  assert.ok(
    validateEvent(linked({ reuse_old_conclusion: true })).some((m) => m.includes("禁止直接沿用旧结论")),
  );
  assert.ok(
    validateEvent(linked({ re_determination_required: false })).some((m) => m.includes("必须基于新证据重新判定")),
  );
});
