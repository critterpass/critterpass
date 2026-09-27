/** Kotlin emitter of gen-surfaces.ts: data classes with org.json (on every Android API level). */
import type { Field, SurfaceModels } from './surface-model';

function kotlinType(field: Field): string {
  switch (field.kind) {
    case 'string':
      return 'String';
    case 'int':
      return 'Int';
    case 'double':
      return 'Double';
    case 'bool':
      return 'Boolean';
    case 'json':
      return 'Any';
    case 'literal':
      return typeof field.value === 'number' ? 'Int' : 'String';
    case 'enum':
    case 'object':
      return field.name;
    case 'array':
      return `List<${kotlinType(field.of)}>`;
    case 'record':
      return `Map<String, ${kotlinType(field.of)}>`;
  }
}

/** Kotlin expression reading `source` (an `Any` from org.json) as `field`. */
function kotlinRead(field: Field, source: string): string {
  switch (field.kind) {
    case 'string':
      return `${source} as String`;
    case 'literal':
      return typeof field.value === 'number'
        ? `(${source} as Number).toInt()`
        : `${source} as String`;
    case 'int':
      return `(${source} as Number).toInt()`;
    case 'double':
      return `(${source} as Number).toDouble()`;
    case 'bool':
      return `${source} as Boolean`;
    case 'json':
      return source;
    case 'enum':
      return `${field.name}.fromWire(${source} as String)`;
    case 'object':
      return `${field.name}.fromJson(${source} as JSONObject)`;
    case 'array':
      return `(${source} as JSONArray).let { a -> List(a.length()) { i -> ${kotlinRead(field.of, 'a.get(i)')} } }`;
    case 'record':
      return `(${source} as JSONObject).let { o -> o.keys().asSequence().associateWith { k -> ${kotlinRead(field.of, 'o.get(k)')} } }`;
  }
}

/** Kotlin expression turning `value` (of `field`'s type) into an org.json value. */
function kotlinWrite(field: Field, value: string): string {
  switch (field.kind) {
    case 'enum':
      return `${value}.wire`;
    case 'object':
      return `${value}.toJson()`;
    case 'array':
      return `JSONArray().also { a -> ${value}.forEach { a.put(${kotlinWrite(field.of, 'it')}) } }`;
    case 'record':
      return `JSONObject().also { o -> ${value}.forEach { (key, item) -> o.put(key, ${kotlinWrite(field.of, 'item')}) } }`;
    case 'string':
    case 'int':
    case 'double':
    case 'bool':
    case 'json':
    case 'literal':
      return value;
  }
}

export function renderKotlin(header: string, { models, enums }: SurfaceModels): string {
  const out = [
    header,
    '',
    'package app.critterpass.appgroup',
    '',
    'import org.json.JSONArray',
    'import org.json.JSONObject',
    '',
  ];
  for (const [name, values] of enums) {
    out.push(`enum class ${name}(val wire: String) {`);
    out.push(values.map((value) => `  ${value.toUpperCase()}("${value}")`).join(',\n') + ';');
    out.push('', '  companion object {');
    out.push(`    fun fromWire(wire: String): ${name} = entries.first { it.wire == wire }`);
    out.push('  }', '}', '');
  }
  for (const model of models) {
    out.push(`data class ${model.name}(`);
    for (const prop of model.props) {
      out.push(`  val ${prop.name}: ${kotlinType(prop.field)}${prop.optional ? '? = null' : ''},`);
    }
    out.push(') {', '  fun toJson(): JSONObject = JSONObject().apply {');
    for (const prop of model.props) {
      const write = kotlinWrite(prop.field, prop.optional ? 'it' : prop.name);
      out.push(
        prop.optional
          ? `    ${prop.name}?.let { put("${prop.wire}", ${write}) }`
          : `    put("${prop.wire}", ${write})`,
      );
    }
    out.push('  }', '', '  companion object {');
    out.push(`    fun fromJson(json: JSONObject): ${model.name} = ${model.name}(`);
    for (const prop of model.props) {
      const read = kotlinRead(prop.field, `json.get("${prop.wire}")`);
      out.push(
        prop.optional
          ? `      ${prop.name} = if (json.isNull("${prop.wire}")) null else ${read},`
          : `      ${prop.name} = ${read},`,
      );
    }
    out.push('    )');
    for (const prop of model.props) {
      if (prop.field.kind === 'literal') {
        out.push(
          `    const val ${prop.name.toUpperCase()}_VALUE = ${JSON.stringify(prop.field.value)}`,
        );
      }
    }
    out.push('  }', '}', '');
  }
  return out.join('\n');
}
