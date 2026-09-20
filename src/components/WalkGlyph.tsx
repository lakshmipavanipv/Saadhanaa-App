/**
 * WalkGlyph — the walking mark on the Exercise box.
 *
 * WHY IT IS DRAWN AND NOT AN EMOJI
 *
 * 🚶 renders as whatever the phone's font vendor decided — flat grey on one
 * device, a different figure on the next — and it cannot take the app's
 * colours. Beside the mala, which reads as a deliberate object, it looked like
 * a placeholder, because it was one.
 *
 * WHAT WAS WRONG WITH THE FIRST ATTEMPT
 *
 * Thin, even strokes on a 40-unit grid: legible, and lifeless. It had the
 * weight of a wireframe next to an icon with depth, and at 34px the hairlines
 * greyed out entirely. Three things fix that, and they are the three things
 * the mala is doing:
 *
 *   WEIGHT      strokes heavy enough to hold colour at small sizes, tapering
 *               from torso to limb so the figure has a centre of mass.
 *   DEPTH       a warm gradient down the body rather than one flat gold, so
 *               it catches light the way a bead does.
 *   MOVEMENT    the stride is wide and the trailing limbs sit back and fade,
 *               with speed lines behind. A walking icon that is not walking
 *               is just a person.
 */

import React from 'react';
import Svg, {
  Circle, Path, Defs, RadialGradient, LinearGradient, Stop,
} from 'react-native-svg';

interface Props {
  size?: number;
  /** Defaults to the app's gold. */
  color?: string;
}

/** Drawn on a 48-unit square so the curves have room, then scaled. */
const S = 48;

export const WalkGlyph: React.FC<Props> = ({ size = 34, color = '#D4A017' }) => (
  <Svg width={size} height={size} viewBox={`0 0 ${S} ${S}`}>
    <Defs>
      {/* The bloom that stops a line drawing reading as an outline. */}
      <RadialGradient id="wgHalo" cx="50%" cy="50%" r="50%">
        <Stop offset="0%" stopColor={color} stopOpacity={0.30} />
        <Stop offset="62%" stopColor={color} stopOpacity={0.09} />
        <Stop offset="100%" stopColor={color} stopOpacity={0} />
      </RadialGradient>
      {/* Light falling from the upper left, as on the beads. */}
      <LinearGradient id="wgBody" x1="0.2" y1="0" x2="0.9" y2="1">
        <Stop offset="0%" stopColor="#FFD97A" />
        <Stop offset="45%" stopColor={color} />
        <Stop offset="100%" stopColor="#A87B10" />
      </LinearGradient>
    </Defs>

    <Circle cx={S / 2} cy={S / 2} r={S / 2} fill="url(#wgHalo)" />
    <Circle
      cx={S / 2} cy={S / 2} r={S / 2 - 1.6}
      stroke={color} strokeOpacity={0.34} strokeWidth={1.3} fill="none"
    />

    {/* Speed lines, shortening and fading with distance. */}
    <Path d="M7.5 19.5 H14.5" stroke={color} strokeOpacity={0.34} strokeWidth={2} strokeLinecap="round" />
    <Path d="M5.2 25.5 H13.2" stroke={color} strokeOpacity={0.24} strokeWidth={2} strokeLinecap="round" />
    <Path d="M8.4 31.3 H13.6" stroke={color} strokeOpacity={0.16} strokeWidth={2} strokeLinecap="round" />

    {/* Head, set forward of the torso — the lean is what makes it a stride. */}
    <Circle cx={29.6} cy={12.6} r={4.3} fill="url(#wgBody)" />

    {/* Torso: the heaviest stroke, so the eye finds the middle first. */}
    <Path
      d="M28.9 17.6 L25.8 28.2"
      stroke="url(#wgBody)" strokeWidth={4.6} strokeLinecap="round" fill="none"
    />

    {/* Leading arm, swung forward and up. */}
    <Path
      d="M27.9 20.2 L34.6 23.6"
      stroke="url(#wgBody)" strokeWidth={3.5} strokeLinecap="round" fill="none"
    />
    {/* Trailing arm, behind and dimmer — depth, not decoration. */}
    <Path
      d="M27.6 20.6 L21.1 22.4"
      stroke={color} strokeOpacity={0.62} strokeWidth={3.3} strokeLinecap="round" fill="none"
    />

    {/* Leading leg: knee forward, shin down to a planted foot. */}
    <Path
      d="M26.0 27.6 L31.4 33.2 L29.8 40.8"
      stroke="url(#wgBody)" strokeWidth={4.4}
      strokeLinecap="round" strokeLinejoin="round" fill="none"
    />
    {/* Trailing leg, pushing off, set back and dimmer. */}
    <Path
      d="M25.9 28.0 L19.5 33.4 L16.2 39.8"
      stroke={color} strokeOpacity={0.7} strokeWidth={4.1}
      strokeLinecap="round" strokeLinejoin="round" fill="none"
    />
  </Svg>
);
