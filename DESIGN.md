# Unigate Design Reference

## Purpose and Source

Write and maintain this document exclusively in English. This documentation requirement does not change the frontend language support requirements below.

Read this document before changing frontend design. Preserve the visual identity of Unigate while making interfaces clear and usable for university transfer applicants and Korean language learners.

Reference: [Unigate homepage](https://www.unigate.kr/), reviewed on October 30, 2026. The observations below come from the rendered homepage, its DOM styles, and its original logo asset. Implementation recommendations are identified separately; they are not claims about a complete existing design system.

## Overall Direction

- Bright, calm, spacious, and education-focused. Communicate credibility and a clear learning progression.
- Use white and near-white surfaces, dark navy headings, muted gray supporting text, and restrained blue accents.
- Let typography, whitespace, and organized course information carry the page. Avoid dense decoration, loud gradients, heavy shadows, or unrelated stock illustrations.
- Use softly rounded cards, thin borders, subtle shadows, and small category badges.
- The hero is primarily typographic: a centered bold headline, a centered explanatory paragraph, and a main action. Faint curved lines and very low-opacity blue glows add depth without becoming the focal point.
- The reference uses Indonesian copy with Korean learning content. Allow for long translated headings and mixed Latin/Hangul text; do not hard-code line breaks solely for one language.

## Required Language Support

- All frontend designs must support Korean (`ko`), English (`en`), and Indonesian (`id`) as a baseline requirement.
- Use fonts and fallbacks that render both Hangul and Latin characters clearly, including mixed-language learning content.
- Accommodate different translation lengths in navigation, headings, buttons, cards, and forms. Allow natural wrapping and flexible sizing; avoid clipping text or forcing line breaks for a single language.
- Keep user-facing text localizable, including validation messages, placeholders, alternative text, and accessibility labels. Preserve the UNIGATE brand name across languages.
- Set the document language to match the active interface language and use locale-aware formatting for dates and numbers where applicable.
- Verify affected layouts in all three languages at narrow and wide viewport widths before completing frontend design changes.
- These are required capabilities for future implementation; this document does not imply that language switching or translations are already implemented.

## Observed Colors

| Role | Value | Evidence and use |
| --- | --- | --- |
| Primary blue | `#155FCC` | Main course action and original logo; use for primary actions and selected emphasis. |
| Logo navy | `#0B3084` | Original UNIGATE wordmark. |
| Logo light blue | `#A2B6DD` | Accent within the original logo. |
| Heading / strong text | `#121723` | Computed heading color. |
| Muted text | `#788293` | Computed footer text color; suitable as a reference for secondary text, subject to contrast checks. |
| Page background | `#FCFCFC` | Computed body background. |
| Surface | `#FFFFFF` | Hero, curriculum cards, pricing cards, and footer. |
| Neutral border | `#E5E7EB` | Observed neutral border color; cards also use low-opacity dark borders. |

Keep blue concentrated on meaningful actions, badges, and small highlights. The hero's blue decorative glows use approximately 4–6% opacity. These are observed values, not an instruction to reduce text contrast.

## Typography

The homepage declares this font stack:

```css
font-family: Pretendard, ui-sans-serif, system-ui, -apple-system,
  "Segoe UI", Roboto, "Noto Sans KR", "Apple SD Gothic Neo",
  "Malgun Gothic", sans-serif;
```

The declaration was verified; successful loading of a particular font file was not independently verified. The local frontend does not yet configure Pretendard.

- Use bold, compact headings and comfortable line spacing for explanatory text.
- At the inspected viewport, the hero heading was 30px/700, major section headings were 36px/700, card headings were 18px/700, and action labels were 16px/600.
- Form text and footer links were 14px. Do not treat these viewport-specific measurements as fixed sizes for every screen.
- Recommended: use responsive heading sizes, readable body text around 16–18px, and body line-height around 1.6–1.8. Keep supporting paragraphs at a comfortable reading width.

## Layout and Components

### Page Structure

The reference follows this order: navigation, hero, four-semester curriculum, teaching materials, course options, partner institutions, consultation form, and footer.

- Center major section introductions; left-align detailed card content and forms.
- Use generous section separation. Observed section classes specify 64px, 80px, and 112px vertical spacing at increasing breakpoints. Hero top spacing ranges from 120px to 210px in its responsive classes.
- Keep content within a centered container with consistent horizontal gutters.
- Use grids for related cards and stack content as available width decreases. The inspected narrow layout stacks curriculum and pricing cards and displays teaching materials in two columns. Desktop appearance was not separately captured.

### Navigation and Hero

- Place the authentic UNIGATE logo at the start of the header and maintain a clear navigation hierarchy.
- The reference exposes a mobile menu at the inspected width.
- Use a clear main action leading to learning or the next relevant step. Keep decorative hero elements behind text and non-interactive.

### Curriculum and Teaching Materials

- Curriculum cards contain a small uppercase semester label, a bold title, and a short explanation.
- Observed curriculum cards have 16px corner radii, 24px padding, fine borders, and light shadows.
- Teaching material cards use small pale-blue category badges, titles, and descriptive text. Their observed padding is 20px with 16px radii.
- Use real learning material previews when helpful. Preserve image proportions and provide descriptive alternative text.

### Course Options

- Pricing cards combine a tier label, course title, prominent price, qualification text, action, and feature list.
- Observed pricing cards have 16px radii and 32px horizontal / 40px vertical padding.
- Differentiate a recommended option with a subtle blue border and small badge.
- Primary actions use blue with white text; secondary actions use a neutral border and dark text. Observed pricing action radii are 12px.
- Treat prices, partnership status, and course claims as live business content, not permanent design requirements.

### Forms and Footer

- Place consultation fields in a spacious bordered panel with rounded corners and visible labels above each input.
- Observed inputs have 16px radii. Maintain consistent control heights and comfortable spacing.
- The footer uses a white surface, the UNIGATE wordmark, muted supporting copy, social links, grouped navigation/policy links, and a separated copyright area.
- For empty partner sections, the reference uses a lightly tinted, dashed-border panel. Do not invent partner logos or endorsements.

## Motion, Responsiveness, and Accessibility

- Observed curriculum hover classes specify a small upward movement and a stronger shadow with a 300ms transition. Other cards use similarly restrained hover feedback.
- Recommended: support reduced motion, provide visible keyboard focus, and do not rely on hover to reveal essential content.
- Recommended: preserve semantic headings, persistent form labels, accessible error messages, and sufficient text/control contrast. Check navigation, cards, forms, and translated content at narrow and wide widths.
- Some elements in the inspected live state had white text on light surfaces, including parts of the header, hero action, and material titles. These are reference-site rendering/contrast issues, not desired design rules. Set explicit readable foreground colors when implementing the design.

## Official Logo Asset

- Local file: [`frontend/public/brand/unigate-logo.svg`](frontend/public/brand/unigate-logo.svg).
- Frontend URL: `/brand/unigate-logo.svg`.
- Original source: [Unigate logo-2.svg](https://www.unigate.kr/images/logo/logo-2.svg).
- Downloaded on October 30, 2026 and retained without modification.
- The asset is the blue UNIGATE wordmark shown in the reference footer. Its SVG viewBox is `294.255 350.015 534.009 93.671`, approximately 5.70:1.
- Preserve the original colors and aspect ratio. Set one display dimension and let the other scale automatically; do not stretch, redraw, recolor, or crop the mark.
- Recommended: use the logo on a light, uncluttered surface with clear surrounding space and `alt="UNIGATE"` when it identifies the brand.
- The reference also loads `/images/logo/logo.svg`, which contains a generic template wordmark. That file is not the UNIGATE brand asset and is intentionally not included.

Example usage:

```jsx
<img src="/brand/unigate-logo.svg" alt="UNIGATE" style={{ width: 160, height: 'auto' }} />
```

## Applying This Reference

- Implement the visual language in the existing React/Vite frontend using its current styling approach. The reference site's framework or utility classes do not require adding those dependencies here.
- Prefer shared color, spacing, and radius tokens as the interface grows.
- Keep the original branding consistent across marketing pages and learning interfaces while adapting density to the user's task.
- Before completing a design change, check logo proportions, readable contrast, responsive layout, text overflow, and interaction states.
- Ask the user before proceeding when design requirements conflict or this reference leaves a material choice unclear, as required by `AGENTS.md`.
