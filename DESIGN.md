# Designing the Planner in Figma

You design in Figma, and Claude turns the design into code by reading your
Figma file directly (through Figma's connector for Claude). You never need to
touch the code.

## Your Figma file

**[Planner design](https://www.figma.com/design/52orOIzQZKKVSt9EeObl2X)**, in the MyTeam team.

- **Screens page:** Phone · Week, PC · Week (with the task panel) and
  Phone · Event editor, rebuilt from the real app as editable layers at 30px an
  hour, plus a "Start here" note.
- **Components page:** every building block with its states: icons, Button,
  Icon button, Badge, View switcher, Day header, Switch, Weekday button, Color
  swatch, Text field, Select, Label pill, New buttons, Create menu, Event
  block (Normal / Short / Tentative × 9 colors), Event bar (Block / Arrows /
  Line × 9 colors), Deadline line, Deadline chip, Calendar task, Month task,
  All-day chip (out-of-hours), Month event, Task row, Task group header, Now
  line.
- **Variables** (right panel → Local variables):
  - *Color*: Light and Dark modes. Each variable is named after the app
    setting it controls, and its code name is in the variable details
    (`surface/bg` = `--bg`, `event/blue` = `--c-blue`, …). `event-ink/*` is
    the text color on each event color.
  - *Size*: PC and Phone modes (`layout/hour-height` = how tall an hour is,
    `layout/hour-column-width`, `radius/event`, …).
- **Text styles** use Arimo, a free font with exactly Arial's letter widths
  (Figma's connector can't use Arial itself). The app uses Arial, with Apple SD
  Gothic Neo (iPhone) or Malgun Gothic (Windows) for Korean.

Not drawn in Figma yet: the agenda panel (right / bottom, and the phone's
lower half), the 2-week timelines, the month view and Settings. Colors are
up to date (the Gelato Days pastels). Ask
Claude to add any screen you want to redesign.

## The loop

1. **Start from the real app.** The Figma file above already holds the main
   screens. The design preview shows the live app with sample data, never
   your real schedule: `https://mido-kim.github.io/planner/?demo`.
2. **Change anything in Figma.** Size, shape, position, color, font, spacing,
   and every state of every button.
3. **Mark what's ready.** Move finished frames to a page called
   `Ready to build`, and write behavior in Figma comments ("slides up from the
   bottom", "tap opens the editor").
4. **Ask Claude to build it.** Paste a link to the page or frame
   (right-click → Copy link to selection). Claude reads the exact numbers,
   updates the app, and you check it on your phone.

## Figma skills you need (about an hour to learn)

| Skill | What it controls in the app |
|---|---|
| **Frames** | One frame per screen: iPhone 16 (393 × 852) and Desktop (1440 × 900). |
| **Design panel** (right side) | Exact numbers: position, width, height, corner radius, fill, stroke, shadow. Claude matches whatever you type here. |
| **Text** | Font, size, weight, line height, letter spacing, color. |
| **Auto layout** (Shift+A) | Padding and gaps between things. Use it so spacing is stated, not guessed from pixel positions. |
| **Components + variants** | One design per element with its states, e.g. a button: Default / Pressed / Disabled. |
| **Variables** | Named colors and sizes (e.g. `hour-height`). Variable *modes* can hold your themes (Light, Dark, Pastel…). |

Figma's free "Figma Design for beginners" course covers all of these.

## Rules the design has to follow

- **Some things come from the data, not the drawing.** Events sit at their
  start time and are as tall as they last. You design *one* event block
  (and its variants); you choose the *hour height*, and the app places the
  blocks. The same goes for how many days are in a row and how many events a
  day has.
- **Text varies.** Titles can be long or Korean; show what happens when they
  don't fit (cut off with "…", or wrap to more lines).
- **Two sizes:** phone (about 375–430 wide) and PC. Design both, or say how
  the PC version differs.
- **Light and dark:** design both, or let Claude derive dark from light.
- **States to design:** default, pressed, selected/current (e.g. today),
  disabled, focused (keyboard), error, empty (no tasks), and hover on PC.
- **Not designable:** the iPhone date/time picker wheels and dropdown menus
  are drawn by iOS. The fields that open them can be styled, and custom
  pickers can be built if you want full control (extra work).
- **Fonts:** the app uses Arial, which every iPhone and PC has. Korean
  letters come from Apple SD Gothic Neo (iPhone) or Malgun Gothic (Windows).
- **Hour height** comes from the app's Settings (30 px by default), not from
  where a block sits in a frame: the Figma screens are drawn at 30 px an hour
  to match.

## Name your layers

Keep the names from the captured file, or use these, so Claude knows what
each layer is:

| Part | Name in Figma |
|---|---|
| Top bar and its buttons | `Top bar`, `Today button`, `Prev`, `Next`, `Range title`, `View switcher`, `Tasks button`, `Settings button`, `New buttons` (Event / Deadline / Task) |
| Timeline | `Day header` (variant: Today / Past / Other), `All-day row`, `Hour label`, `Hour line`, `Half-hour line`, `Day column` (variant: Weekend / Today), `Now line` |
| Events | `Event block` (variants: Normal / Short / Tentative / Continues), `Event bar` (Block / Arrows / Line), `Outside-hours chip` |
| Deadlines and tasks | `Deadline line`, `Deadline chip`, `Calendar task` (Open / Done), `Month task` |
| Month and 2 weeks | `Month cell` (variants: Today / Other month / Weekend), `Month event` (Timed / Tentative), `More link` |
| Agenda | `Agenda panel` (Right / Bottom), `Splitter`, `Task add field`, `Agenda day header` (Today / Overdue / Other), `Agenda card` (Event / Deadline / Task / Tentative / Done) |
| Labels | `Label pill` (Off / On / Retired), `Label row` (Active / Retired) |
| Dialogs | `Event editor`, `Repeat options`, `Scope dialog`, `Task editor`, `Labels`, `Create menu`, `Settings`, `Switch`, `Weekday button`, `Color swatch` |

## Current measurements

What the app uses today, for reference while editing (PC, then phone where
different). Colors are listed in `css/app.css` under `:root` (light) and the
dark-mode block.

| Element | Size and style |
|---|---|
| Top bar | 10px / 14px padding; buttons 34px tall, 8px corners; title 19px semibold (18px phone) |
| View switcher | 30px segments, 7px corners inside a 9px-corner track |
| Day header | 52px tall (48 phone); weekday 11px uppercase; date 17px semibold in a 28px circle (today filled) |
| Hour column | 56px wide (42 phone); labels 10.5px |
| Hour height | 30px (40, 52 and 68 in Settings) |
| Grid lines | hour: 1px line color; half-hour: 1px softer line |
| Event block | 6px corners, solid pastel fill with its dark ink for text (dark mode: 30% of the pastel, pastel text), no edge bar; title 12px bold, up to 4 lines; time 11px; shortest 20px; under 36px tall shows one line, title first |
| Tentative event | 30% of the pastel, 1.5px dashed outline |
| 2-week view | Two week rows; 30px day header, all-day strip (16px bars), then a timeline squeezed to fit; labels every 3 hours; blocks show the title only |
| Event bar (all-day row) | 20px tall (18 in month, 16 phone), 5px corners, 11.5px text; Block = solid color, Arrows/Line = 2px line with the title in the middle, 8 × 10px arrowheads |
| Deadline | 2px line across the day; title tag 16px tall, 10.5px bold white text on the color, 4px corners (square where it meets the line) |
| Calendar task | 18px tall, 5px corners, 1px color outline, 12px tick box, 11px text |
| Now line | 2px red, 10px dot |
| Month cell | date 12.5px in a 24px circle; events 18px tall, 11.5px text; "+N more" |
| Agenda panel | PC: 320px wide at the right (240–60% of the window, drag to resize) or 40% high at the bottom; phone: the lower 50% (20–80%), a sheet over the month view. Cards: 12px corners, 60% of the item's pastel, title 14px bold, time 12.5px in its ink, label and repeat 12px, notes 13px |
| Dialogs | 480px wide, 14px corners (phone: full-width sheet, 16px top corners); title field 19px semibold; rows 34px; switch 40 × 24 |
| Color swatches | 22px circles, ring when selected |

## Design preview links

Add these to `https://mido-kim.github.io/planner/?demo` (or
`http://localhost:5173/?demo` when running locally):

- `&view=day`, `&view=week`, `&view=2week`, `&view=month`
- `&show=tasks` (agenda sheet over the month view on a phone), `&show=event` (editor with repeat
  options), `&show=deadline`, `&show=new-event`, `&show=create` (the
  event / deadline / task menu), `&show=delete` (this/following/all),
  `&show=task`, `&show=labels`, `&show=settings`
