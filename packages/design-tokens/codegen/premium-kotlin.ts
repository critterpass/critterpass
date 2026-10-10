/** Emits `CpPremium`: the premium tokens as Compose values for the Android surfaces. */
import type { Premium, PremiumShadow, PremiumTypeStyle } from '../src/premium';
import { GENERATED_HEADER } from './generated-header';
import type { PremiumLeaf } from './premium-leaves';
import { premiumLeaves, premiumModeLeaves } from './premium-leaves';

const PACKAGE_NAME = 'app.critterpass.designtokens';

const PRELUDE = `package ${PACKAGE_NAME}

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** Parses a hex (#rrggbb) or rgb()/rgba() premium token literal. */
private fun premiumColor(value: String): Color {
    if (value.startsWith("#")) {
        val intValue = value.removePrefix("#").toLong(16)
        return Color(
            red = ((intValue shr 16) and 0xFF) / 255f,
            green = ((intValue shr 8) and 0xFF) / 255f,
            blue = (intValue and 0xFF) / 255f,
            alpha = 1f,
        )
    }
    val parts = value.removePrefix("rgba(").removePrefix("rgb(").removeSuffix(")")
        .split(",").map { it.trim().toFloatOrNull() ?: 0f }
    return Color(
        red = parts.getOrElse(0) { 0f } / 255f,
        green = parts.getOrElse(1) { 0f } / 255f,
        blue = parts.getOrElse(2) { 0f } / 255f,
        alpha = parts.getOrElse(3) { 1f },
    )
}

data class CpPremiumShadowLayer(val x: Dp, val y: Dp, val blur: Dp, val spread: Dp, val color: Color, val inset: Boolean)

enum class CpPremiumFamily { System, Guide, Mono }

/** [tracking] is in sp; [maxScale] caps the font scale for the style. */
data class CpPremiumType(val family: CpPremiumFamily, val size: TextUnit, val weight: FontWeight, val tracking: TextUnit, val maxScale: Float)

/** Compose \`spring(dampingRatio, stiffness)\` parameters (mass 1). */
data class CpPremiumSpring(val dampingRatio: Float, val stiffness: Float)
`;

const str = (value: string) => JSON.stringify(value);

function kotlinShadow(shadow: PremiumShadow): string {
  const layers = shadow.map(
    (l) =>
      `CpPremiumShadowLayer(${l.x}.dp, ${l.y}.dp, ${l.blur}.dp, ${l.spread}.dp, premiumColor(${str(l.color)}), ${l.inset === true})`,
  );
  return `listOf(${layers.join(', ')})`;
}

function kotlinValue(leaf: PremiumLeaf): string {
  switch (leaf.kind) {
    case 'color':
      return `premiumColor(${str(leaf.value)})`;
    case 'number':
      return `${leaf.value}.dp`;
    case 'shadow':
      return kotlinShadow(leaf.value);
  }
}

function kotlinFieldType(leaf: PremiumLeaf): string {
  switch (leaf.kind) {
    case 'color':
      return 'Color';
    case 'number':
      return 'Dp';
    case 'shadow':
      return 'List<CpPremiumShadowLayer>';
  }
}

function constants(leaves: readonly PremiumLeaf[]): string {
  return leaves
    .map((leaf) => `        val ${leaf.name}: ${kotlinFieldType(leaf)} = ${kotlinValue(leaf)}`)
    .join('\n');
}

const FAMILY = { system: 'System', guide: 'Guide', mono: 'Mono' } as const;

function typeStyle(name: string, t: PremiumTypeStyle): string {
  return `        val ${name} = CpPremiumType(CpPremiumFamily.${FAMILY[t.family]}, ${t.size}.sp, FontWeight(${t.weight}), ${t.tracking}.sp, ${t.maxScale}f)`;
}

export function emitPremiumKotlin(premium: Premium): string {
  const { light, dark } = premiumModeLeaves(premium);
  const fields = light.map((leaf) => `    val ${leaf.name}: ${kotlinFieldType(leaf)},`).join('\n');
  const instance = (leaves: readonly PremiumLeaf[]) =>
    `CpPremiumMode(\n${leaves.map((l) => `        ${l.name} = ${kotlinValue(l)},`).join('\n')}\n    )`;
  const springs = Object.entries(premium.spring)
    .map(
      ([name, s]) =>
        `        val ${name} = CpPremiumSpring(dampingRatio = ${s.dampingFraction}f, stiffness = ${s.stiffness}f)`,
    )
    .join('\n');

  return `${GENERATED_HEADER}
${PRELUDE}
/** One mode of the premium palette, elevation and materials. */
data class CpPremiumMode(
${fields}
)

object CpPremium {
    val Light = ${instance(light)}

    val Dark = ${instance(dark)}

    fun mode(dark: Boolean): CpPremiumMode = if (dark) Dark else Light

    object Accent {
${constants(premiumLeaves(premium.accent))}
    }

    object Stamp {
${constants(premiumLeaves(premium.stamp))}
    }

    object Signal {
${constants(premiumLeaves(premium.signal))}
    }

    object Typography {
${Object.entries(premium.type)
  .map(([name, t]) => typeStyle(name, t))
  .join('\n')}
    }

    object Radius {
${constants(premiumLeaves(premium.radius))}
    }

    object Space {
${constants(premiumLeaves(premium.space))}
    }

    object Size {
${constants(premiumLeaves(premium.size))}
    }

    object Spring {
${springs}
        const val REDUCE_MOTION_FADE_MS: Int = ${premium.motion.reduceMotionFadeMs}
    }
}
`;
}
