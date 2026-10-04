# 疗愈服务合规巡查

本仓库保存疗愈服务合规巡查的领域词汇、交换事件与中文联调样例，供市场监管、卫生部门及平台在统一身份和版本语义下协作。仓库只规定跨模块交换的契约与基础校验，不包含存储、接口或业务系统实现。

## 业务边界

- 系统按**负面清单版本 + 规则版本**对网页、直播、私域材料做风险提示（`RISK_FLAGGED`），提示一律 `advisory_only=true`，禁止携带违法结论或处罚字段。
- 医疗属性、虚假宣传、违法行医、续费合规等只能由有权人员以 `DETERMINATION_MADE` 判定，并按事项分工（卫生口径 / 市场监管口径），作出处罚须持执法授权编号且挂接人工判定。
- 网页、直播、私域宣传均须保存**可验证时间**（可信时间戳 / 公证 / 区块链 / 平台存档）与**来源定位**（网址、直播间号、私域群号）及内容 SHA-256。
- 投诉人隐私对商户**最小披露**：送达前必须脱敏（`pii_redacted=true`），联系方式加密存储、密钥不对商户开放。
- 跨区域移送须随案移送证据链（哈希 + 原始固证），接收方逐项核对一致并确认保留原始固证后才能接收。
- 整改/关闭范围必须限定到**具体宣传版本、取证路径或销售路径**（具体 `target_ref`），禁止整店式通配关闭。
- 同一宣传以 `promotion_fingerprint` 跨账号、跨渠道、跨套餐、跨地区识别；复发案件关联旧案与旧处罚，但**禁止沿用旧结论**，必须基于新证据重新判定。

## 资料结构

- `contracts/domain.schema.json`：事件公共信封、稳定枚举与每类事件的 payload 契约（JSON Schema 2020-12）。
- `data/sample.json`：一条最小业务事件样例（登记经营主体）。
- `data/scenario.json`：31 条事件的端到端联调场景，串起主体/提供者/服务/资质登记、宣传版本、套餐续费、同意、多渠道取证、投诉与补证、风险提示、脱敏送达与申辩、人工双判定、跨省移送与接收、路径级整改、处罚结案、复发关联与重判。
- `src/validator.js`：单事件基础校验（信封、事件-聚合配对、角色权限、各 payload 规则）。
- `src/stream.js`：事件流校验（同聚合版本严格连续递增、引用完整性、案件生命周期、移送接收与证据链数量核对、复发关联）。
- `tests/`：契约与事件流测试，含关键负面用例。

## 聚合与事件

聚合（14 类）：business_entity、service_provider、service_offering、qualification_declaration、promotion_version、promotion_capture、sales_package、consent_record、complaint_case、risk_report、determination、jurisdiction_transfer、rectification_order、enforcement_action。

事件（22 类，按流程）：

1. 登记：`PROVIDER_REGISTERED`、`ACTUAL_PROVIDER_ONBOARDED`、`SERVICE_REGISTERED`、`QUALIFICATION_DECLARED`
2. 宣传与销售：`PROMOTION_VERSION_RECORDED`、`PROMOTION_CAPTURED`、`PACKAGE_REGISTERED`、`CONSENT_RECORDED`
3. 投诉与申辩：`COMPLAINT_FILED`、`EVIDENCE_REQUESTED`、`EVIDENCE_SUPPLEMENTED`、`COMPLAINT_DELIVERED`、`DEFENSE_SUBMITTED`
4. 提示与判定：`RISK_FLAGGED`、`DETERMINATION_MADE`
5. 管辖：`JURISDICTION_TRANSFERRED`、`JURISDICTION_ACCEPTED`
6. 整改与处置：`RECTIFICATION_ORDERED`、`PATH_CLOSED`、`ACTION_COMPLETED`
7. 复发与结案：`RECURRENCE_LINKED`、`CASE_CLOSED`

每个事件都带 `actor`（actor_id、role，执法事件需 authorization_no、jurisdiction）与 `payload`；同一 `aggregate_id` 的 `version` 从 1 开始、严格连续递增。

## 角色

SYSTEM（规则引擎/巡检，只能出提示与系统取证）、MARKET_REGULATOR、HEALTH_AUTHORITY、ENFORCEMENT_OFFICER（三类有权人员，按事项分工）、MERCHANT、CONSUMER、PLATFORM。

## 本地检查

```bash
npm test
```
