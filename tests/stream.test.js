import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { validateEvent } from "../src/validator.js";
import { validateEventStream } from "../src/stream.js";

const HASH = "b".repeat(64);

test("端到端联调场景逐条通过且全流无结构错误", async () => {
  const scenario = JSON.parse(await readFile(new URL("../data/scenario.json", import.meta.url), "utf8"));
  for (const event of scenario.events) {
    assert.deepEqual(validateEvent(event), []);
  }
  assert.deepEqual(validateEventStream(scenario.events), []);
});

function registeredEntity(id = "be-s") {
  return {
    event_id: `evt-${id}`,
    event_type: "PROVIDER_REGISTERED",
    aggregate_type: "business_entity",
    aggregate_id: id,
    occurred_at: "2026-10-01T09:00:00+08:00",
    version: 1,
    summary: "登记主体",
    actor: { actor_id: "plat", role: "PLATFORM" },
    payload: { entity_name: "主体", credit_code: "91330106MA2H8X7K4Q", registered_region_code: "330100" },
  };
}

test("同聚合版本必须从 1 开始且严格连续递增", () => {
  const events = [
    registeredEntity("be-v"),
    {
      event_id: "evt-v2",
      event_type: "PROVIDER_REGISTERED",
      aggregate_type: "business_entity",
      aggregate_id: "be-v",
      occurred_at: "2026-10-02T09:00:00+08:00",
      version: 3,
      summary: "跳号更新",
      actor: { actor_id: "plat", role: "PLATFORM" },
      payload: { entity_name: "主体更名", credit_code: "91330106MA2H8X7K4Q", registered_region_code: "330100" },
    },
  ];
  assert.ok(validateEventStream(events).some((m) => m.includes("版本不连续")));
});

test("引用未登记的经营主体会被拒绝", () => {
  const events = [
    {
      event_id: "evt-srv",
      event_type: "SERVICE_REGISTERED",
      aggregate_type: "service_offering",
      aggregate_id: "so-x",
      occurred_at: "2026-10-01T09:00:00+08:00",
      version: 1,
      summary: "服务先于主体登记",
      actor: { actor_id: "m", role: "MERCHANT" },
      payload: { business_entity_id: "be-ghost", service_name: "课", service_forms: ["AUDIO"] },
    },
  ];
  assert.ok(validateEventStream(events).some((m) => m.includes("尚未登记的 business_entity")));
});

test("案件生命周期事件不能引用不存在的案件", () => {
  const events = [
    {
      event_id: "evt-rr",
      event_type: "RISK_FLAGGED",
      aggregate_type: "risk_report",
      aggregate_id: "rr-x",
      occurred_at: "2026-10-01T09:00:00+08:00",
      version: 1,
      summary: "无案风险提示",
      actor: { actor_id: "engine", role: "SYSTEM" },
      payload: {
        case_id: "case-ghost",
        rule_set_version: "RS-1",
        negative_list_version: "NL-1",
        matched_rules: [{ rule_code: "R1", rule_name: "规则", risk_type: "CROSS_JURISDICTION" }],
        risk_level: "LOW",
        advisory_only: true,
      },
    },
  ];
  assert.ok(validateEventStream(events).some((m) => m.includes("引用了未登记的案件")));
});

test("处罚必须挂接已存在的人工判定", () => {
  const events = [
    registeredEntity("be-a"),
    {
      event_id: "evt-case",
      event_type: "COMPLAINT_FILED",
      aggregate_type: "complaint_case",
      aggregate_id: "case-a",
      occurred_at: "2026-10-01T10:00:00+08:00",
      version: 1,
      summary: "立案",
      actor: { actor_id: "c", role: "CONSUMER" },
      payload: { business_entity_id: "be-a", categories: ["FALSE_PROMOTION"], complainant_redacted: true },
    },
    {
      event_id: "evt-act",
      event_type: "ACTION_COMPLETED",
      aggregate_type: "enforcement_action",
      aggregate_id: "act-a",
      occurred_at: "2026-10-03T10:00:00+08:00",
      version: 1,
      summary: "无判定直接处罚",
      actor: { actor_id: "o1", role: "ENFORCEMENT_OFFICER", authorization_no: "证01" },
      payload: {
        case_id: "case-a",
        business_entity_id: "be-a",
        decision_type: "FINE",
        determination_ids: ["det-ghost"],
        decided_at: "2026-10-03T10:00:00+08:00",
      },
    },
  ];
  assert.ok(validateEventStream(events).some((m) => m.includes("处罚挂接的判定 det-ghost 不存在")));
});

test("移送接收的证据核对数量必须与移送链一致", () => {
  const chain = [
    { evidence_id: "ev-1", content_sha256: HASH, origin_capture_id: "pc-1", fixation: "TRUSTED_TIMESTAMP" },
    { evidence_id: "ev-2", content_sha256: "a".repeat(64), origin_capture_id: "pc-2", fixation: "NOTARIZATION" },
  ];
  const events = [
    registeredEntity("be-t"),
    {
      event_id: "evt-case",
      event_type: "COMPLAINT_FILED",
      aggregate_type: "complaint_case",
      aggregate_id: "case-t",
      occurred_at: "2026-10-01T10:00:00+08:00",
      version: 1,
      summary: "立案",
      actor: { actor_id: "c", role: "CONSUMER" },
      payload: { business_entity_id: "be-t", categories: ["CROSS_REGION_LIVE_EVIDENCE"], complainant_redacted: true },
    },
    {
      event_id: "evt-tf",
      event_type: "JURISDICTION_TRANSFERRED",
      aggregate_type: "jurisdiction_transfer",
      aggregate_id: "jt-t",
      occurred_at: "2026-10-02T10:00:00+08:00",
      version: 1,
      summary: "移送两项证据",
      actor: { actor_id: "o1", role: "MARKET_REGULATOR", authorization_no: "证01" },
      payload: {
        case_id: "case-t",
        from_jurisdiction: "330000",
        to_jurisdiction: "530000",
        reason: "LIVE_STREAM_ORIGIN",
        evidence_chain: chain,
        transferred_at: "2026-10-02T10:00:00+08:00",
      },
    },
    {
      event_id: "evt-acc",
      event_type: "JURISDICTION_ACCEPTED",
      aggregate_type: "jurisdiction_transfer",
      aggregate_id: "jt-t",
      occurred_at: "2026-10-03T10:00:00+08:00",
      version: 2,
      summary: "只核到一项即接收",
      actor: { actor_id: "o2", role: "ENFORCEMENT_OFFICER", authorization_no: "证02" },
      payload: {
        transfer_id: "jt-t",
        accepted: true,
        chain_verification: {
          items_checked: 1,
          items_expected: 2,
          all_hashes_match: true,
          original_fixation_preserved: true,
        },
        decided_at: "2026-10-03T10:00:00+08:00",
      },
    },
  ];
  assert.ok(validateEventStream(events).some((m) => m.includes("接收核对数量 1 与移送证据链数量 2 不一致")));
});

test("复发关联不能指向不存在的旧案，也不能关联自身", () => {
  const events = [
    registeredEntity("be-r"),
    {
      event_id: "evt-case",
      event_type: "COMPLAINT_FILED",
      aggregate_type: "complaint_case",
      aggregate_id: "case-r",
      occurred_at: "2026-10-01T10:00:00+08:00",
      version: 1,
      summary: "新案",
      actor: { actor_id: "c", role: "CONSUMER" },
      payload: { business_entity_id: "be-r", categories: ["FALSE_PROMOTION"], complainant_redacted: true },
    },
    {
      event_id: "evt-link",
      event_type: "RECURRENCE_LINKED",
      aggregate_type: "complaint_case",
      aggregate_id: "case-r",
      occurred_at: "2026-10-02T10:00:00+08:00",
      version: 2,
      summary: "错误关联自身",
      actor: { actor_id: "o1", role: "MARKET_REGULATOR", authorization_no: "证01" },
      payload: {
        case_id: "case-r",
        prior_case_ids: ["case-r"],
        same_promotion_fingerprint: true,
        new_capture_ids: ["pc-new"],
        reuse_old_conclusion: false,
        re_determination_required: true,
      },
    },
  ];
  assert.ok(validateEventStream(events).some((m) => m.includes("不能关联自身为旧案")));
});
