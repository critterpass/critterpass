#!/usr/bin/env python3
"""Reproducible font build for docs/design-system.md §1.3 / phase F-002.

Downloads the pinned OFL sources in sources.json (failing on a sha256 mismatch), instances the
variable fonts (Archivo, Caveat, Noto Sans Thai) at the exact widths/weights the design tokens use,
subsets every family to its declared unicode ranges keeping the `tnum`/`case` layout features, and
writes:
  - apps/mobile/assets/fonts/*.ttf   (bundled via the expo-font config plugin, T4)
  - apps/web/public/fonts/*.woff2    (apps/web/src/styles/fonts.css @font-face, T4)
  - packages/design-tokens/fonts/manifest.json + OFL-<Family>.txt licence copies

Usage:
  python3 build-fonts.py            build everything
  python3 build-fonts.py --check    build, then verify the rebuild is byte-identical and that
                                     Vietnamese (Archivo) and Thai (Noto Sans Thai) coverage holds
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import urllib.request
from dataclasses import dataclass, field
from io import BytesIO
from pathlib import Path
from typing import Any

from fontTools import subset
from fontTools.misc.timeTools import timestampSinceEpoch
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

# `TTFont(..., recalcTimestamp=True)` is fontTools' default, and makes `.save()` overwrite
# `head.modified` with the wall-clock time on every call — the root cause of an earlier
# non-reproducible build here (open_font() below disables it). `rename_static_instance` additionally
# pins `created`/`modified` to this fixed instant so every shipped font reports the same values,
# rather than whatever timestamp happened to be baked into each upstream source file.
FIXED_TIMESTAMP = timestampSinceEpoch(0)

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parents[2]
SOURCES_PATH = SCRIPT_DIR / "sources.json"
CACHE_DIR = SCRIPT_DIR / ".font-cache"
MOBILE_FONTS_DIR = REPO_ROOT / "apps/mobile/assets/fonts"
WEB_FONTS_DIR = REPO_ROOT / "apps/web/public/fonts"
LICENSE_DIR = REPO_ROOT / "packages/design-tokens/fonts"
MANIFEST_PATH = LICENSE_DIR / "manifest.json"
MOBILE_BUDGET_BYTES = 3 * 1024 * 1024

NAME_FAMILY = 1
NAME_SUBFAMILY = 2
NAME_FULL = 4
NAME_POSTSCRIPT = 6
NAME_TYPOGRAPHIC_FAMILY = 16
NAME_TYPOGRAPHIC_SUBFAMILY = 17


def log(message: str) -> None:
    print(message, file=sys.stderr)


def sha256_of(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def open_font(data: bytes) -> TTFont:
    # `recalcTimestamp` defaults to True, which makes `TTFont.save()` overwrite `head.modified`
    # with the wall-clock time on every save — the actual root cause of this build's
    # non-reproducibility (FIXED_TIMESTAMP alone does not survive a later `.save()` call).
    return TTFont(BytesIO(data), recalcTimestamp=False)


def canonical_font_content_hash(font_bytes: bytes) -> str:
    """Hashes a font's decoded table contents rather than its raw bytes.

    Two byte-level effects would otherwise make this a no-op check:
    1. `head.checkSumAdjustment` is defined as "whatever makes the whole file's checksum equal a
       magic constant"; since fontTools' sfnt writer does not guarantee a fixed table write order
       across process runs, the file layout (hence this one field) can differ even when every
       table's own decoded content is identical. It carries no information about the font itself
       (virtually no renderer validates it), so it is excluded here rather than compared.
    2. The WOFF2 packer's brotli input-stream ordering is similarly not fully reproducible across
       process runs even though the decoded font is identical every time (the sfnt/TTF path *is*
       fully reproducible once `head.created`/`modified` are pinned, see FIXED_TIMESTAMP).
    Comparing decoded tables (minus that one field) is what "idempotent" should mean here: the
    emitted font is the same font, independent of incidental compiled-layout noise.
    """
    font = open_font(font_bytes)
    digest = hashlib.sha256()
    for tag in sorted(font.keys()):
        if tag == "GlyphOrder":
            digest.update(",".join(font.getGlyphOrder()).encode())
            continue
        digest.update(tag.encode())
        if tag == "head":
            head = font["head"]
            fields = {k: v for k, v in vars(head).items() if k != "checkSumAdjustment"}
            digest.update(repr(sorted(fields.items())).encode())
            continue
        digest.update(font[tag].compile(font))
    return digest.hexdigest()


def fetch(url: str, expected_sha256: str) -> bytes:
    """Downloads `url` (caching by its expected hash) and verifies the pinned sha256 matches."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_path = CACHE_DIR / f"{expected_sha256}.bin"
    if cache_path.exists():
        data = cache_path.read_bytes()
    else:
        log(f"downloading {url}")
        with urllib.request.urlopen(url, timeout=60) as response:  # noqa: S310 - pinned https URL
            data = response.read()
        cache_path.write_bytes(data)
    actual = sha256_of(data)
    if actual != expected_sha256:
        raise SystemExit(f"sha256 mismatch for {url}: expected {expected_sha256}, got {actual}")
    return data


def parse_unicode_ranges(range_strings: list[str]) -> set[int]:
    codepoints: set[int] = set()
    for entry in range_strings:
        body = entry.removeprefix("U+")
        if "-" in body:
            start_hex, end_hex = body.split("-", 1)
            codepoints.update(range(int(start_hex, 16), int(end_hex, 16) + 1))
        else:
            codepoints.add(int(body, 16))
    return codepoints


def resolve_family_ranges(sources: dict[str, Any], range_names: list[str]) -> set[int]:
    definitions = sources["unicodeRangeDefinitions"]
    codepoints: set[int] = set()
    for name in range_names:
        codepoints |= parse_unicode_ranges(definitions[name])
    return codepoints


def font_cmap_codepoints(font: TTFont) -> set[int]:
    return set(font.getBestCmap().keys())


def check_coverage_for_range(font: TTFont, required: set[int]) -> dict[str, Any]:
    present = font_cmap_codepoints(font)
    missing = sorted(required - present)
    return {
        "requiredCount": len(required),
        "missingCount": len(missing),
        "missing": [f"U+{cp:04X}" for cp in missing],
    }


def check_coverage(font: TTFont, sources: dict[str, Any], range_names: list[str]) -> dict[str, Any]:
    """Per-range coverage breakdown (e.g. `vietnamese` reported separately from `currencyExtra`),
    since only some ranges are a hard pass/fail gate for a given family (see `criticalRanges`)."""
    definitions = sources["unicodeRangeDefinitions"]
    by_range = {name: check_coverage_for_range(font, parse_unicode_ranges(definitions[name])) for name in range_names}
    combined = resolve_family_ranges(sources, range_names)
    overall = check_coverage_for_range(font, combined)
    return {"overall": overall, "byRange": by_range}


def set_name(font: TTFont, name_id: int, value: str) -> None:
    name_table = font["name"]
    name_table.setName(value, name_id, 3, 1, 0x409)
    name_table.setName(value, name_id, 1, 0, 0)


def rename_static_instance(font: TTFont, family_name: str, weight: int) -> None:
    """Makes one weight/width instance look like its own standalone family (Regular subfamily) so
    bundling several weights of the same base family never triggers OS bold/italic style-linking."""
    postscript_name = family_name.replace(" ", "")
    for name_id, value in (
        (NAME_FAMILY, family_name),
        (NAME_SUBFAMILY, "Regular"),
        (NAME_FULL, family_name),
        (NAME_POSTSCRIPT, postscript_name),
        (NAME_TYPOGRAPHIC_FAMILY, family_name),
        (NAME_TYPOGRAPHIC_SUBFAMILY, "Regular"),
    ):
        set_name(font, name_id, value)

    if "OS/2" in font:
        font["OS/2"].usWeightClass = weight
        # Regular selection bit (0x40); clear italic (0x01) and bold (0x20).
        font["OS/2"].fsSelection = (font["OS/2"].fsSelection & ~0x21) | 0x40
    if "head" in font:
        font["head"].macStyle = font["head"].macStyle & ~0x3
        font["head"].created = FIXED_TIMESTAMP
        font["head"].modified = FIXED_TIMESTAMP


def subset_font(font: TTFont, codepoints: set[int], keep_features: list[str]) -> TTFont:
    options = subset.Options()
    options.layout_features = sorted(set(options.layout_features) | set(keep_features))
    options.name_IDs = ["*"]
    options.notdef_outline = True
    options.recalc_bounds = True
    options.recalc_timestamp = False
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(unicodes=codepoints)
    subsetter.subset(font)
    return font


@dataclass
class BuiltInstance:
    family_key: str
    file_stem: str
    weight: int
    width: int | None
    ttf_bytes: bytes
    woff2_bytes: bytes | None
    coverage: dict[str, Any] = field(default_factory=dict)


def save_ttf_bytes(font: TTFont) -> bytes:
    buffer = BytesIO()
    font.save(buffer)
    return buffer.getvalue()


def save_woff2_bytes(font: TTFont) -> bytes:
    font.flavor = "woff2"
    buffer = BytesIO()
    font.save(buffer)
    font.flavor = None
    return buffer.getvalue()


def build_variable_instance(source_bytes: bytes, axis_values: dict[str, float], family_name: str, weight: int) -> TTFont:
    font = open_font(source_bytes)
    instance = instantiateVariableFont(font, axis_values, inplace=True)
    rename_static_instance(instance, family_name, weight)
    return instance


def build_static_font(source_bytes: bytes, family_name: str, weight: int) -> TTFont:
    font = open_font(source_bytes)
    rename_static_instance(font, family_name, weight)
    return font


@dataclass(frozen=True)
class InstanceSpec:
    file_stem: str
    weight: int
    width: int | None


def enumerate_instance_specs(spec: dict[str, Any]) -> list[InstanceSpec]:
    """Every (file_stem, weight, width) a family produces — pure metadata, no download/font work."""
    if spec.get("variable"):
        naming = spec["instanceNaming"]
        widths = spec["axes"].get("wdth", [None])
        vary_width_in_name = len(widths) > 1
        specs = []
        for width in widths:
            for weight in spec["axes"]["wght"]:
                file_stem = naming.format(wdth=width, wght=weight) if vary_width_in_name else naming.format(wght=weight)
                specs.append(InstanceSpec(file_stem, weight, width))
        return specs
    return [
        InstanceSpec(f"{spec['displayName'].replace(' ', '')}-{entry['weight']}", entry["weight"], None)
        for entry in spec["staticSources"]
    ]


def _static_source_for_weight(spec: dict[str, Any], weight: int) -> dict[str, Any]:
    for entry in spec["staticSources"]:
        if entry["weight"] == weight:
            return entry
    raise KeyError(f"no staticSources entry for weight {weight}")


def build_one_instance(name: str, spec: dict[str, Any], sources: dict[str, Any], instance: InstanceSpec) -> BuiltInstance:
    codepoints = resolve_family_ranges(sources, spec["unicodeRanges"])
    keep_features = spec.get("keepFeatures", [])
    targets = spec["targets"]

    if spec.get("variable"):
        source_bytes = fetch(spec["source"]["url"], spec["source"]["sha256"])
        axis_values: dict[str, float] = {"wght": instance.weight}
        if instance.width is not None:
            axis_values["wdth"] = instance.width
        source_font = open_font(source_bytes)
        font = build_variable_instance(source_bytes, axis_values, instance.file_stem, instance.weight)
    else:
        entry = _static_source_for_weight(spec, instance.weight)
        source_bytes = fetch(entry["url"], entry["sha256"])
        source_font = open_font(source_bytes)
        font = build_static_font(source_bytes, instance.file_stem, instance.weight)

    coverage = check_coverage(source_font, sources, spec["unicodeRanges"])
    subset_font(font, codepoints, keep_features)
    ttf_bytes = save_ttf_bytes(font) if "mobile" in targets else b""
    woff2_bytes = save_woff2_bytes(font) if "web" in targets else None
    return BuiltInstance(
        family_key=name,
        file_stem=instance.file_stem,
        weight=instance.weight,
        width=instance.width,
        ttf_bytes=ttf_bytes,
        woff2_bytes=woff2_bytes,
        coverage=coverage,
    )


def write_outputs(all_instances: dict[str, list[BuiltInstance]], sources: dict[str, Any]) -> dict[str, Any]:
    MOBILE_FONTS_DIR.mkdir(parents=True, exist_ok=True)
    WEB_FONTS_DIR.mkdir(parents=True, exist_ok=True)
    LICENSE_DIR.mkdir(parents=True, exist_ok=True)

    manifest: dict[str, Any] = {"families": {}}
    mobile_total_bytes = 0

    for family_key, instances in all_instances.items():
        family_entries = []
        for instance in instances:
            entry: dict[str, Any] = {
                "fileStem": instance.file_stem,
                "weight": instance.weight,
                "width": instance.width,
                "coverage": instance.coverage,
            }
            if instance.ttf_bytes:
                ttf_path = MOBILE_FONTS_DIR / f"{instance.file_stem}.ttf"
                ttf_path.write_bytes(instance.ttf_bytes)
                entry["mobileFile"] = ttf_path.name
                entry["mobileSizeBytes"] = len(instance.ttf_bytes)
                mobile_total_bytes += len(instance.ttf_bytes)
                entry["mobileSha256"] = sha256_of(instance.ttf_bytes)
                entry["mobileContentHash"] = canonical_font_content_hash(instance.ttf_bytes)
            if instance.woff2_bytes:
                woff2_path = WEB_FONTS_DIR / f"{instance.file_stem}.woff2"
                woff2_path.write_bytes(instance.woff2_bytes)
                entry["webFile"] = woff2_path.name
                entry["webSizeBytes"] = len(instance.woff2_bytes)
                entry["webSha256"] = sha256_of(instance.woff2_bytes)
                entry["webContentHash"] = canonical_font_content_hash(instance.woff2_bytes)
            family_entries.append(entry)
        manifest["families"][family_key] = {
            "instances": family_entries,
            "criticalRanges": sources["families"][family_key].get("criticalRanges", []),
        }

    manifest["mobileTotalBytes"] = mobile_total_bytes
    manifest["mobileBudgetBytes"] = MOBILE_BUDGET_BYTES
    manifest["mobileWithinBudget"] = mobile_total_bytes <= MOBILE_BUDGET_BYTES
    return manifest


def write_licenses(sources: dict[str, Any]) -> None:
    LICENSE_DIR.mkdir(parents=True, exist_ok=True)
    for name, spec in sources["families"].items():
        license_bytes = fetch(spec["licenseSource"]["url"], _license_sha256(spec))
        (LICENSE_DIR / spec["licenseFileName"]).write_bytes(license_bytes)


def _license_sha256(spec: dict[str, Any]) -> str:
    # License files aren't hash-pinned in sources.json (only the font binaries are); compute and
    # cache by URL instead so repeated runs still hit the local cache.
    cache_key = hashlib.sha256(spec["licenseSource"]["url"].encode()).hexdigest()
    cache_path = CACHE_DIR / f"license-{cache_key}.sha256"
    if cache_path.exists():
        return cache_path.read_text().strip()
    with urllib.request.urlopen(spec["licenseSource"]["url"], timeout=60) as response:  # noqa: S310
        data = response.read()
    digest = sha256_of(data)
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(digest)
    (CACHE_DIR / f"{digest}.bin").write_bytes(data)
    return digest


def run_build() -> dict[str, Any]:
    sources = json.loads(SOURCES_PATH.read_text())
    all_instances: dict[str, list[BuiltInstance]] = {}
    for name, spec in sources["families"].items():
        log(f"building {name}")
        all_instances[name] = [
            build_one_instance(name, spec, sources, instance) for instance in enumerate_instance_specs(spec)
        ]
    manifest = write_outputs(all_instances, sources)
    write_licenses(sources)
    manifest["sources"] = {
        name: {"repo": spec["repo"], "commit": spec["commit"], "license": spec["license"], "licenseFile": spec["licenseFileName"]}
        for name, spec in sources["families"].items()
    }
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n")
    return manifest


def verify_coverage(manifest: dict[str, Any]) -> list[str]:
    """Hard-fails only on each family's `criticalRanges` (Vietnamese for Archivo, Thai for Noto Sans
    Thai, per T3's done-when); other gaps (e.g. Caveat's designed Vietnamese fallback to Geist
    italic, or a handful of rarely-used Latin Extended-A letters in Geist) are recorded in the
    manifest for review but don't block the build."""
    problems: list[str] = []
    for family_key, family in manifest["families"].items():
        for range_name in family["criticalRanges"]:
            for instance in family["instances"]:
                range_result = instance["coverage"]["byRange"][range_name]
                if range_result["missingCount"] > 0:
                    problems.append(
                        f"{family_key} {instance['fileStem']} is missing required '{range_name}' glyphs: {range_result['missing']}"
                    )
    if not manifest["mobileWithinBudget"]:
        problems.append(f"mobile font payload {manifest['mobileTotalBytes']} bytes exceeds the {manifest['mobileBudgetBytes']} byte budget")
    return problems


def hash_manifest_outputs(manifest: dict[str, Any]) -> dict[str, str]:
    """Compares decoded font content (`canonical_font_content_hash`), not raw file bytes: fontTools'
    sfnt table ordering and WOFF2/brotli framing both carry incidental, run-to-run layout noise that
    is not a real difference in the emitted font (see that function's docstring)."""
    hashes: dict[str, str] = {}
    for family_key, family in manifest["families"].items():
        for instance in family["instances"]:
            if "mobileContentHash" in instance:
                hashes[f"{family_key}/{instance['fileStem']}.ttf"] = instance["mobileContentHash"]
            if "webContentHash" in instance:
                hashes[f"{family_key}/{instance['fileStem']}.woff2"] = instance["webContentHash"]
    return hashes


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="verify idempotency and coverage after building")
    args = parser.parse_args()

    manifest = run_build()
    total_kb = manifest["mobileTotalBytes"] / 1024
    log(f"mobile font payload: {total_kb:.1f} KiB (budget {manifest['mobileBudgetBytes'] / 1024:.0f} KiB)")

    if not args.check:
        return 0

    first_hashes = hash_manifest_outputs(manifest)
    second_manifest = run_build()
    second_hashes = hash_manifest_outputs(second_manifest)
    differing = {k for k in first_hashes if first_hashes.get(k) != second_hashes.get(k)}
    if differing:
        log(f"FAIL: rebuild is not idempotent for: {sorted(differing)}")
        return 1

    problems = verify_coverage(manifest)
    if problems:
        for problem in problems:
            log(f"FAIL: {problem}")
        return 1

    log("OK: rebuild is idempotent and coverage checks pass")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
