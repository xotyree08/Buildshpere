/**
 * STEP Physical File writing — the ISO-10303-21 text format IFC ships in.
 *
 * A tiny, honest subset: numbered entity instances, references between them,
 * and the four literal kinds the schema needs. Nothing here understands IFC;
 * it understands the file format IFC is written in, which is the separation
 * that keeps the mapping in one place and the escaping in another.
 */

/** A reference to another instance, written `#12`. */
export class Ref {
  constructor(public readonly id: number) {}
  toString(): string {
    return `#${this.id}`;
  }
}

/** An unquoted enumeration, written `.TRUE.` or `.ELEMENT.`. */
export class Enum {
  constructor(public readonly name: string) {}
  toString(): string {
    return `.${this.name}.`;
  }
}

export type Value = string | number | boolean | null | Ref | Enum | Value[];

/**
 * Quote a string the way ISO-10303-21 wants it.
 *
 * Single quotes double, backslashes double, and anything outside the base
 * character set goes out as an \X2\ escape — a house named "Café" must not
 * corrupt the rest of the file.
 */
function quote(text: string): string {
  let out = "";
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (ch === "'") out += "''";
    else if (ch === "\\") out += "\\\\";
    else if (code >= 32 && code < 127) out += ch;
    else {
      const units: string[] = [];
      for (let i = 0; i < ch.length; i++) units.push(ch.charCodeAt(i).toString(16).toUpperCase().padStart(4, "0"));
      out += `\\X2\\${units.join("")}\\X0\\`;
    }
  }
  return `'${out}'`;
}

/** Numbers must carry a decimal point or they read as integers. */
function num(n: number): string {
  if (!Number.isFinite(n)) throw new Error(`refusing to write a non-finite number to IFC: ${n}`);
  const rounded = Math.round(n * 1e6) / 1e6;
  return Number.isInteger(rounded) ? `${rounded}.` : String(rounded);
}

function literal(value: Value): string {
  if (value === null) return "$";
  if (value instanceof Ref || value instanceof Enum) return value.toString();
  if (Array.isArray(value)) return `(${value.map(literal).join(",")})`;
  if (typeof value === "string") return quote(value);
  if (typeof value === "number") return num(value);
  return value ? ".T." : ".F.";
}

/** Accumulates numbered instances and writes the file. */
export class SpfFile {
  private readonly lines: string[] = [];
  private next = 1;

  /** Add one instance and hand back its reference. */
  add(type: string, attributes: Value[]): Ref {
    const id = this.next++;
    this.lines.push(`#${id}=${type}(${attributes.map(literal).join(",")});`);
    return new Ref(id);
  }

  get count(): number {
    return this.next - 1;
  }

  /**
   * The finished file.
   *
   * FILE_DESCRIPTION carries no ViewDefinition. Naming a model view is a
   * conformance claim, and this exporter has not been certified against one —
   * writing "CoordinationView" here because other files have it would be
   * exactly the kind of borrowed credibility the handoff forbids.
   */
  toString(meta: { name: string; timestamp: string; application: string; version: string }): string {
    return [
      "ISO-10303-21;",
      "HEADER;",
      `FILE_DESCRIPTION((''),'2;1');`,
      `FILE_NAME(${quote(meta.name)},${quote(meta.timestamp)},(''),(''),${quote(
        `${meta.application} ${meta.version}`,
      )},${quote(meta.application)},'');`,
      "FILE_SCHEMA(('IFC4'));",
      "ENDSEC;",
      "DATA;",
      ...this.lines,
      "ENDSEC;",
      "END-ISO-10303-21;",
      "",
    ].join("\n");
  }
}
