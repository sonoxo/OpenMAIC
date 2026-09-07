# OpenMAIC Palantir-Style Ontology

OpenMAIC now carries an **ontology-as-code contract** that models the platform as governed objects, relationships, and actions instead of a collection of disconnected services and UI state.

> This repository contract is inspired by Palantir Ontology semantics. It is intentionally vendor-neutral and is **not** an official Palantir Foundry deployment descriptor. A target Foundry workspace, ontology API binding, and deployment credentials can be added through an environment-specific adapter without changing the domain model.

## Why this exists

OpenMAIC already has the ingredients of an operational graph: courses, generated learning assets, durable agent sessions, skills, tools, model providers, materials, rendering, evaluation, and policy decisions. The ontology makes those concepts machine-readable and gives them stable identities, explicit relationships, governed actions, and validation.

## Object types

| Object type | Operational meaning |
| --- | --- |
| `Course` | Durable course/workspace identity and lifecycle |
| `LearningAsset` | Versioned lesson, slide, document, or other generated/authored course artifact |
| `Agent` | Reusable agent definition, role, and model policy |
| `AgentRun` | Durable execution/session of an agent in a course context |
| `Skill` | Versioned reusable capability available to agents |
| `Tool` | Internal service or adapter that may back a skill |
| `Provider` | Logical model/provider routing definition without credentials |
| `SessionMaterial` | Uploaded or linked source material with provenance |
| `RenderJob` | Auditable export/render lifecycle for an asset |
| `Evaluation` | Quality, behavior, or result assessment tied to a run |
| `PolicyDecision` | Auditable authorization or constraint decision governing a run |

The canonical schema is [`ontology/openmaic.ontology.json`](../ontology/openmaic.ontology.json).

## Core graph

```text
Course ──contains────────────▶ LearningAsset ──rendered by──▶ RenderJob
  │
  ├──has material────────────▶ SessionMaterial
  │                              ▲
  │                              │ consumes
  ▼                              │
AgentRun ──uses───────────────▶ Agent ──uses───────────────▶ Skill ──uses──▶ Tool
  │
  ├──uses provider────────────▶ Provider
  ├──evaluated by─────────────▶ Evaluation
  └──governed by──────────────▶ PolicyDecision
```

The important runtime distinction is **Agent != AgentRun**. An `Agent` is a reusable definition; an `AgentRun` is one durable execution with status, checkpoints, failures, completion state, provider selection, policy decisions, and evaluations.

## Governed actions

The ontology defines action contracts for:

- `CreateCoursePlan`
- `GenerateLearningAsset`
- `ReviseLearningAsset`
- `AttachMaterial`
- `InvokeSkill`
- `ExportCourse`
- `CancelRun`
- `ResumeRun`

Each action declares its object inputs/outputs, the object types it may write, a permission string, and an audit requirement. These definitions are contracts for authorization and lineage; application handlers remain the execution layer.

## Ingestion and materialization

[`ontology/ingestion-map.json`](../ontology/ingestion-map.json) maps OpenMAIC runtime domains to ontology object types. Its `sourceHints` are discovery guidance, not brittle file-path dependencies.

Implementation rules:

1. **Use durable application IDs as ontology primary keys.** Do not generate a second identity for the same course, run, asset, or material.
2. **Materialize at state-transition boundaries.** Emit updates where domain state actually changes, not by scraping React/UI state.
3. **Preserve history.** Version learning assets and retain run, render, evaluation, and policy records rather than overwriting evidence.
4. **Keep secrets out of the ontology.** Provider credentials and service secrets remain in the existing secret/configuration layer; ontology properties carry logical references only.
5. **Centralize governed actions.** Permission checks and audit records should occur at action execution boundaries so UI, API, and agent callers share the same policy.
6. **Make writes idempotent.** A replayed event with the same durable identity must update/materialize the same object rather than create duplicates.

## Example entities

[`ontology/openmaic.seed.json`](../ontology/openmaic.seed.json) contains deliberately non-production example objects and links. It is marked `mode: "example"` and exists to exercise identity, required-property, and relationship validation.

## Validation

Run:

```bash
node scripts/validate-ontology.mjs
```

The validator checks:

- unique object, property, link, and action identifiers;
- valid primary keys and title properties;
- link endpoints against known object types;
- governed action input/output/write references;
- mandatory permissions and auditing on actions;
- example entity primary-key integrity and required properties;
- example link endpoint types; and
- ingestion mappings against declared object types.

`.github/workflows/ontology-validate.yml` executes the same validator for ontology-related pull requests and pushes to `main`.

## Foundry integration boundary

A future Foundry adapter should translate this stable repo contract into the target environment rather than leaking Foundry-specific identifiers throughout OpenMAIC.

Recommended adapter responsibilities:

```text
OpenMAIC domain state/events
          │
          ▼
Ontology materializer
          │
          ├── local contract validation
          ├── identity/upsert rules
          ├── link materialization
          └── governed action audit envelope
          │
          ▼
Environment adapter
          │
          ├── Foundry object type mapping
          ├── link type mapping
          ├── Action/Function binding
          └── target workspace authentication
          │
          ▼
Palantir Foundry / Ontology API
```

Environment-specific object type RIDs, credentials, endpoints, and deployment settings should stay outside the portable ontology definition.

## BPO delivery phases

### Phase 1 — Ontology contract

This repository change establishes object types, links, governed action definitions, example data, ingestion rules, and CI validation.

### Phase 2 — Runtime materializers

Wire OpenMAIC course, agent runtime, storage, render, provider, evaluation, and governance state transitions into idempotent ontology upserts/events.

### Phase 3 — Foundry adapter

Bind the repo-local schema to a specific Foundry ontology and deploy environment mappings using target workspace configuration.

### Phase 4 — Operational views and AIP

Build graph-backed operational views, lineage, agent/run observability, governed action execution, and AIP workflows on top of the materialized ontology.

The repository contract is designed so Phases 2–4 can evolve without changing the core identity model every time an implementation detail moves.
