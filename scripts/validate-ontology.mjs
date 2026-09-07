import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readJson(relativePath) {
  const absolutePath = path.join(root, relativePath);
  try {
    return JSON.parse(fs.readFileSync(absolutePath, "utf8"));
  } catch (error) {
    throw new Error(`Unable to read ${relativePath}: ${error.message}`);
  }
}

const ontology = readJson("ontology/openmaic.ontology.json");
const seed = readJson("ontology/openmaic.seed.json");
const ingestion = readJson("ontology/ingestion-map.json");
const errors = [];

function check(condition, message) {
  if (!condition) errors.push(message);
}

function duplicates(values) {
  const seen = new Set();
  const repeated = new Set();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated];
}

check(ontology.id === "openmaic", "ontology.id must be 'openmaic'");
check(typeof ontology.$schemaVersion === "string", "ontology.$schemaVersion must be a string");
check(Array.isArray(ontology.objectTypes) && ontology.objectTypes.length > 0, "objectTypes must be a non-empty array");
check(Array.isArray(ontology.linkTypes), "linkTypes must be an array");
check(Array.isArray(ontology.actionTypes), "actionTypes must be an array");

const objectTypes = Array.isArray(ontology.objectTypes) ? ontology.objectTypes : [];
const objectTypeIds = objectTypes.map((objectType) => objectType.id);
for (const id of duplicates(objectTypeIds)) {
  errors.push(`duplicate object type id: ${id}`);
}
const objectTypeById = new Map(objectTypes.map((objectType) => [objectType.id, objectType]));

for (const objectType of objectTypes) {
  check(typeof objectType.id === "string" && objectType.id.length > 0, "every object type must have an id");
  check(typeof objectType.primaryKey === "string", `${objectType.id}: primaryKey must be declared`);
  check(Array.isArray(objectType.properties) && objectType.properties.length > 0, `${objectType.id}: properties must be non-empty`);

  const properties = Array.isArray(objectType.properties) ? objectType.properties : [];
  const propertyIds = properties.map((property) => property.id);
  for (const id of duplicates(propertyIds)) {
    errors.push(`${objectType.id}: duplicate property id: ${id}`);
  }

  const primaryKeyProperty = properties.find((property) => property.id === objectType.primaryKey);
  check(Boolean(primaryKeyProperty), `${objectType.id}: primaryKey '${objectType.primaryKey}' is not a property`);
  check(primaryKeyProperty?.required === true, `${objectType.id}: primaryKey '${objectType.primaryKey}' must be required`);

  if (objectType.titleProperty) {
    check(
      properties.some((property) => property.id === objectType.titleProperty),
      `${objectType.id}: titleProperty '${objectType.titleProperty}' is not a property`,
    );
  }

  for (const property of properties) {
    check(typeof property.id === "string" && property.id.length > 0, `${objectType.id}: property without id`);
    check(typeof property.type === "string" && property.type.length > 0, `${objectType.id}.${property.id}: type is required`);
    check(typeof property.required === "boolean", `${objectType.id}.${property.id}: required must be boolean`);
  }
}

const linkTypes = Array.isArray(ontology.linkTypes) ? ontology.linkTypes : [];
for (const id of duplicates(linkTypes.map((link) => link.id))) {
  errors.push(`duplicate link type id: ${id}`);
}
for (const link of linkTypes) {
  check(objectTypeById.has(link.from), `${link.id}: unknown from object type '${link.from}'`);
  check(objectTypeById.has(link.to), `${link.id}: unknown to object type '${link.to}'`);
  check(typeof link.cardinality === "string" && link.cardinality.length > 0, `${link.id}: cardinality is required`);
}
const linkTypeById = new Map(linkTypes.map((link) => [link.id, link]));

const actionTypes = Array.isArray(ontology.actionTypes) ? ontology.actionTypes : [];
for (const id of duplicates(actionTypes.map((action) => action.id))) {
  errors.push(`duplicate action type id: ${id}`);
}
for (const action of actionTypes) {
  check(typeof action.permission === "string" && action.permission.length > 0, `${action.id}: permission is required`);
  check(action.audit === true, `${action.id}: governed actions must be auditable`);

  for (const field of [...(action.inputs ?? []), ...(action.outputs ?? [])]) {
    check(objectTypeById.has(field.objectType), `${action.id}.${field.name}: unknown object type '${field.objectType}'`);
  }
  for (const write of action.writes ?? []) {
    check(objectTypeById.has(write), `${action.id}: writes references unknown object type '${write}'`);
  }
}

check(seed.ontology === ontology.id, `seed ontology '${seed.ontology}' does not match '${ontology.id}'`);
check(seed.mode === "example", "seed file must remain explicitly marked mode='example'");
const entities = Array.isArray(seed.entities) ? seed.entities : [];
const entityById = new Map();
for (const entity of entities) {
  const objectType = objectTypeById.get(entity.objectType);
  check(Boolean(objectType), `seed entity '${entity.id}' references unknown object type '${entity.objectType}'`);
  check(typeof entity.id === "string" && entity.id.length > 0, "seed entity id is required");
  if (entityById.has(entity.id)) errors.push(`duplicate seed entity id: ${entity.id}`);
  entityById.set(entity.id, entity);

  if (objectType) {
    check(
      entity.properties?.[objectType.primaryKey] === entity.id,
      `seed entity '${entity.id}' must set ${objectType.primaryKey} equal to its entity id`,
    );
    for (const property of objectType.properties.filter((item) => item.required)) {
      check(
        entity.properties?.[property.id] !== undefined && entity.properties?.[property.id] !== null,
        `seed entity '${entity.id}' is missing required property '${property.id}'`,
      );
    }
  }
}

for (const seedLink of seed.links ?? []) {
  const linkType = linkTypeById.get(seedLink.linkType);
  const from = entityById.get(seedLink.from);
  const to = entityById.get(seedLink.to);
  check(Boolean(linkType), `seed link references unknown link type '${seedLink.linkType}'`);
  check(Boolean(from), `seed link '${seedLink.linkType}' has unknown from entity '${seedLink.from}'`);
  check(Boolean(to), `seed link '${seedLink.linkType}' has unknown to entity '${seedLink.to}'`);
  if (linkType && from) {
    check(from.objectType === linkType.from, `seed link '${seedLink.linkType}' expects from type '${linkType.from}'`);
  }
  if (linkType && to) {
    check(to.objectType === linkType.to, `seed link '${seedLink.linkType}' expects to type '${linkType.to}'`);
  }
}

check(ingestion.ontology === ontology.id, `ingestion ontology '${ingestion.ontology}' does not match '${ontology.id}'`);
for (const mapping of ingestion.mappings ?? []) {
  check(objectTypeById.has(mapping.objectType), `ingestion source '${mapping.source}' references unknown object type '${mapping.objectType}'`);
  check(typeof mapping.identity === "string" && mapping.identity.length > 0, `ingestion source '${mapping.source}' needs an identity rule`);
  check(typeof mapping.trigger === "string" && mapping.trigger.length > 0, `ingestion source '${mapping.source}' needs a trigger`);
}

if (errors.length > 0) {
  console.error("Ontology validation failed:");
  for (const error of errors) console.error(` - ${error}`);
  process.exitCode = 1;
} else {
  console.log(
    `Ontology valid: ${objectTypes.length} object types, ${linkTypes.length} link types, ${actionTypes.length} governed actions, ${entities.length} example entities, ${ingestion.mappings?.length ?? 0} ingestion mappings.`,
  );
}
