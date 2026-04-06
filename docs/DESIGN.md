# Design System Specification: Editorial Intelligence

## 1. Overview & Creative North Star
The "Creative North Star" for this design system is **The Digital Curator**. 

In an era of information overflow, this system is designed to feel like a high-end, quiet library rather than a noisy digital tool. It moves beyond the "standard SaaS" aesthetic by embracing **High-End Editorial** design principles. We achieve this through "Atmospheric Minimalist" layouts: utilizing intentional asymmetry, expansive white space, and a rejection of traditional containment (lines/borders) in favor of tonal depth and layered surfaces.

The goal is a **Focus-oriented** experience that feels **Intelligent** and **Premium**. By breaking the rigid grid with overlapping elements and shifting background tones, we create a digital environment that prioritizes cognitive ease and structural clarity.

---

## 2. Colors
Our palette is rooted in deep neutrals and sophisticated accents, designed to provide high contrast for legibility while maintaining a soft, ambient presence.

### Core Palette
*   **Primary (#000000):** Used for maximum authority in typography and high-impact CTAs.
*   **Surface / Background (#F7F9FB):** A clinical but warm off-white that acts as our "unprinted paper" canvas.
*   **Secondary (#565E74):** A muted slate for supporting UI elements and metadata.
*   **Tertiary/Accent (#F0E0CB):** A warm beige/sand used sparingly to highlight "intelligence" (e.g., AI insights, citations).

### The "No-Line" Rule
**Explicit Instruction:** 1px solid borders are prohibited for sectioning. 
Boundaries must be defined solely through background color shifts. To separate a sidebar from a main content area, use `surface-container-low` against `surface`. If a card needs to stand out, use `surface-container-lowest` to create a natural lift.

### Surface Hierarchy & Nesting
Treat the UI as physical layers of fine paper. 
*   **Level 0 (Base):** `surface` (#F7F9FB)
*   **Level 1 (Subtle Inset):** `surface-container-low` (#F2F4F6) for secondary sidebars.
*   **Level 2 (Elevated Content):** `surface-container-lowest` (#FFFFFF) for primary work surfaces and cards.

### The "Glass & Gradient" Rule
For floating menus or command palettes, use **Glassmorphism**:
*   **Fill:** `surface` at 70% opacity.
*   **Effect:** `backdrop-blur: 20px`.
*   **Stroke:** `outline-variant` at 10% opacity (The Ghost Border).

---

## 3. Typography
The typography system uses a dual-font approach to balance editorial character with functional precision.

*   **Display & Headlines (Manrope):** Chosen for its geometric but sophisticated "modern-classic" feel. Large scale (`display-lg` at 3.5rem) should be used with generous leading to create an editorial "magazine" feel.
*   **Body & Labels (Inter):** The workhorse for readability. Inter’s tall x-height ensures that even at `body-sm` (0.75rem), research notes and citations remain crisp.

**Hierarchy as Identity:** 
High-contrast scaling (e.g., a `display-md` headline next to a `body-md` caption) creates an "authoritative" layout that guides the eye toward primary actions without the need for heavy icons or buttons.

---

## 4. Elevation & Depth
We eschew traditional drop shadows in favor of **Tonal Layering**.

*   **Layering Principle:** Stacking `surface-container` tiers creates "Soft Lift." A white card (`surface-container-lowest`) on a light grey background (`surface-container-high`) provides a clear mental model of depth without visual clutter.
*   **Ambient Shadows:** If an element must float (e.g., a "New Note" modal), use:
    *   **Blur:** 40px - 60px.
    *   **Opacity:** 4% - 6%.
    *   **Color:** `on-surface` (#191C1E) tinted with a hint of navy.
*   **The Ghost Border Fallback:** Use `outline-variant` (#C6C6CD) at **10% opacity** only when accessibility contrast ratios require a boundary on white-on-white surfaces.

---

## 5. Components

### Buttons
*   **Primary:** Solid `primary` (#000000) with `on-primary` text. Radius: `md` (0.75rem). No shadow.
*   **Secondary:** `secondary-container` fill. Subtle and integrated.
*   **Tertiary (Ghost):** No background. Interaction is indicated by a subtle shift to `surface-container-high` on hover.

### Capsule Tags (Citations & Categories)
*   **Style:** Pill-shaped (`full` roundedness).
*   **Color:** `tertiary-fixed` (Beige) for AI-generated content; `secondary-fixed` (Blue-Grey) for user-defined tags.
*   **Typography:** `label-md`.

### Input Fields
*   **Style:** Minimalist. No bottom line or full box. Use a `surface-container-low` fill with `md` (12px) corners.
*   **Focus State:** Transition the background to `surface-container-lowest` and add a 1px "Ghost Border" at 20% opacity.

### Cards & Lists
*   **Rule:** **Forbid dividers.** 
*   **Spacing:** Separate list items using the spacing scale (e.g., 16px vertical gap). 
*   **Selection:** Indicated by a `primary` vertical "anchor" line (2px width) on the left side of the item, rather than a full background highlight.

---

## 6. Do’s and Don’ts

### Do:
*   **Embrace Asymmetry:** Align headings to the left while keeping action buttons floating or offset to create a custom, non-template look.
*   **Use Micro-Interactions:** Animate surface transitions (e.g., a card shifting from `surface-low` to `lowest`) over 300ms to mimic the feel of moving paper.
*   **Prioritize Breathing Room:** If you think there is enough margin, double it. Content needs "silence" to be intelligent.

### Don’t:
*   **Don't use 100% Black for everything:** While `primary` is black, use `on-surface-variant` for long-form body text to reduce eye strain.
*   **Don't use heavy shadows:** If the shadow is noticeable at first glance, it is too heavy. It should be felt, not seen.
*   **Don't use "System" blue:** Avoid default browser or standard SaaS blues. Stick to the `secondary` slate-blue (#565E74) for a premium feel.
*   **Don't use dividers in lists:** Use whitespace and typography weight to distinguish between items.