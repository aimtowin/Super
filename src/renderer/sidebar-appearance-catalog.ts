// Emoji grouping adapted from dolag233/Serpent v0.2.9 (MIT), f58701a6.
// Uses existing Super icon artwork; does not execute or embed remote SVG.
import type { IconName } from "./Icons";
export interface SidebarAppearanceGroup<T extends string = string> { readonly id: string; readonly labelKey: string; readonly items: readonly T[]; }
export const SIDEBAR_EMOJI_GROUPS: readonly SidebarAppearanceGroup[] = [
  {
    id: 'faces',
    labelKey: 'sidebarEmoji.group.faces',
    items: [
      '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇',
      '🙂', '😉', '😍', '🥰', '😘', '😋', '😜', '🤓', '😎', '🥳',
      '🤔', '😐', '🙄', '😏', '😴', '😪', '🥺', '😢', '😭', '😤',
      '😡', '🤬', '🤯', '😈', '💀', '💩', '🤡', '👻', '👽', '😺',
    ],
  },
  {
    id: 'gestures',
    labelKey: 'sidebarEmoji.group.gestures',
    items: [
      '👋', '🤚', '✋', '👌', '✌️', '🤞', '🤟', '🤘', '🤙', '👍',
      '👎', '✊', '👊', '👏', '🙌', '🤝', '🙏', '💪', '🫶', '👀',
    ],
  },
  {
    id: 'mood',
    labelKey: 'sidebarEmoji.group.mood',
    items: [
      '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔',
      '💕', '💖', '💗', '💘', '💝', '❣️', '💞', '💓', '✨', '🌟',
      '💫', '💯', '💢', '💤',
    ],
  },
  {
    id: 'symbols',
    labelKey: 'sidebarEmoji.group.symbols',
    items: [
      '✅', '❌', '❓', '❗', '⭕', '🚫', '⚠️', '💬',
      '🔴', '🟠', '🟡', '🟢', '🔵', '🟣', '⚫', '⚪',
    ],
  },
  {
    id: 'media',
    labelKey: 'sidebarEmoji.group.media',
    items: [
      '🎨', '🖼️', '🎬', '🎥', '📷', '📹', '🎞️', '📺', '🎵', '🎶',
      '🎧', '🎤', '🎹', '🎸', '🥁', '📻', '📡', '🔦', '💡', '🕯️',
    ],
  },
  {
    id: 'design',
    labelKey: 'sidebarEmoji.group.design',
    items: [
      '✏️', '🖊️', '🖌️', '📐', '📏', '✂️', '📎', '📌', '📍', '🔑',
      '🔒', '💎',
    ],
  },
  {
    id: 'tech',
    labelKey: 'sidebarEmoji.group.tech',
    items: [
      '💻', '🖥️', '📱', '⌨️', '🎮', '🕹️', '🎲', '🧩', '🎯', '🏆',
      '⚔️', '🛡️', '🚀', '🤖', '👾', '💾',
    ],
  },
  {
    id: 'nature',
    labelKey: 'sidebarEmoji.group.nature',
    items: [
      '🌲', '🌸', '🌻', '🍀', '🍁', '🌙', '☀️', '⭐', '🌈', '🔥',
      '💧', '❄️', '🌊', '⛰️', '🏝️', '🌍',
    ],
  },
  {
    id: 'animals',
    labelKey: 'sidebarEmoji.group.animals',
    items: [
      '🐶', '🐱', '🦊', '🐻', '🐼', '🐯', '🦁', '🐸', '🐧', '🦋',
      '🐝', '🐙',
    ],
  },
  {
    id: 'places',
    labelKey: 'sidebarEmoji.group.places',
    items: [
      '🏠', '🏢', '🏭', '🏰', '🚗', '✈️', '🚢', '🚂', '⛺', '🎒',
      '💼', '🎁', '👑', '📦', '🛒', '🏷️',
    ],
  },
  {
    id: 'people',
    labelKey: 'sidebarEmoji.group.people',
    items: [
      '👤', '👥', '🧙', '🧚', '🦸', '🥷', '👷', '👶',
    ],
  },
];


export const SIDEBAR_ICON_GROUPS: readonly SidebarAppearanceGroup<IconName>[] = [
  { id: "organize", labelKey: "sidebarEmoji.group.organize", items: ["folder", "folders", "folder-tree", "collection", "archive", "box", "grid", "tag", "clipboard", "file"] },
  { id: "symbols", labelKey: "sidebarEmoji.group.symbols", items: ["heart", "star", "globe", "smart", "search", "settings", "eye", "activity", "clock", "info", "warning", "link", "download", "upload"] },
];
export const SIDEBAR_APPEARANCE_COLORS = {
  blue: "#487FE5", indigo: "#7775E7", purple: "#A56BDE", pink: "#E871AB",
  orange: "#DE963B", green: "#56AB70", teal: "#39AAB0", red: "#E76969",
} as const;
export type SidebarAppearanceColor = keyof typeof SIDEBAR_APPEARANCE_COLORS;
export const SIDEBAR_ICON_IDS: ReadonlySet<string> = new Set(SIDEBAR_ICON_GROUPS.flatMap(group => group.items));
