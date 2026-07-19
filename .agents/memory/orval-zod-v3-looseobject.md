---
name: Orval zod v3 looseObject incompatibility
description: Orval v8 generates zod.looseObject() for bare type:object schemas, which does not exist in zod v3. Fix: add additionalProperties:false to every schema in openapi.yaml.
---

## Rule
Always add `additionalProperties: false` to every object schema in openapi.yaml when using Orval v8 with zod v3.

**Why:** Orval v8 maps `type: object` (with implicit or explicit `additionalProperties: true`) to `zod.looseObject()`, which was introduced in zod v4. The workspace uses zod v3 (`"zod": "catalog:"`), so `looseObject` does not exist and the typecheck step fails with TS2339.

**How to apply:** Any time you write a schema in openapi.yaml — request body, response, or nested object — append `additionalProperties: false`. For truly open-ended JSON blobs, store them as `type: string` (serialized JSON) rather than `type: object`.
