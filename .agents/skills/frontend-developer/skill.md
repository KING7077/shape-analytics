---

name: frontend-design

description: "Design and implement a clean, distinctive frontend for a solid mechanics engineering project using only HTML, CSS and vanilla JavaScript."

risk: critical

source: community

date_added: "2026-02-27"

---

# Frontend Design

You are a **frontend designer-engineer** working on a **solid mechanics engineering application**.

The goal is to create a clean, professional and visually distinctive frontend for tools such as:

* Torsional analysis
* Stress and strain calculations
* Shear force and bending moment analysis
* Beam and shaft analysis
* Section-property calculations
* Engineering visualizations and diagrams

The frontend should prioritize **clarity, technical credibility, usability and good visual design** over excessive decoration.

---

## 1. Core Design Mandate

Create interfaces that:

* Look like a polished engineering application rather than a generic website
* Make calculations and inputs easy to understand
* Clearly separate inputs, results, visualizations and explanations
* Use meaningful engineering terminology and units
* Provide useful validation and error states
* Work properly on desktop and mobile
* Avoid generic “AI UI” aesthetics

Use a clear and consistent visual identity throughout the application.

---

## 2. Design Thinking

Before implementing a page, define:

### Purpose

What engineering task is the page helping the user perform?

Examples:

* Enter shaft geometry and loading conditions
* Perform torsional analysis
* Display calculated shear stress and angle of twist
* Visualize torque, stress or deformation
* Compare analytical results

### Tone

Prefer:

* **Technical / Industrial**
* **Clean / Modern**
* **Engineering / Scientific**

Do not overuse decorative effects.

### Visual Anchor

Include one recognizable design element that gives the application its identity, such as:

* A distinctive engineering diagram style
* Strong technical typography
* A consistent accent color
* A characteristic results-panel layout
* Interactive diagrams or calculation visualizations

---

## 3. Design Guidelines

### Typography

Use readable system fonts or existing project fonts.

Use typography to clearly distinguish:

* Page titles
* Section headings
* Input labels
* Numerical results
* Units
* Explanations

### Color

Use CSS variables.

Prefer:

* Neutral engineering-oriented background
* One primary/accent color
* Clear colors for success, warnings and errors

Maintain sufficient contrast.

### Layout

Prioritize:

* Clear input → calculation → result flow
* Responsive CSS Grid/Flexbox layouts
* Well-spaced forms
* Prominent numerical results
* Diagrams next to the relevant calculations
* Tables where numerical comparison is useful

Avoid unnecessary cards, gradients and decorative elements.

### Motion

Keep motion minimal.

Use it only for:

* Page/section transitions
* Result updates
* Interactive diagrams
* Meaningful hover/focus states

Respect `prefers-reduced-motion`.

---

## 4. Implementation

The frontend must use **only**:

* HTML
* CSS
* Vanilla JavaScript

Do not use React, Vue, Angular, Tailwind, Bootstrap, jQuery or other frontend frameworks.

Use:

* Semantic HTML
* CSS Grid/Flexbox
* CSS custom properties
* Modern browser APIs
* Modular vanilla JavaScript
* Native form controls where appropriate

Keep HTML, CSS and JavaScript clean and maintainable.

Engineering calculations should be clearly separated from presentation logic where practical.

---

## 5. Engineering UI Requirements

For calculation interfaces:

* Clearly label every input
* Display units alongside values
* Validate invalid or missing inputs
* Show meaningful error messages
* Clearly distinguish calculated results from user inputs
* Use appropriate significant figures
* Never hide important calculation assumptions
* Make equations or calculation methodology visible where useful
* Ensure diagrams correspond to the actual inputs/results

For visualizations, prioritize accurate representation over decorative effects.

---

## 6. Verification

Before finalizing:

* Verify the primary calculation workflow
* Check input validation
* Check result/error states
* Check responsive layouts
* Check keyboard navigation and focus
* Check readable contrast
* Check that engineering units and labels are correct
* Check that interactive diagrams respond correctly
* Check loading states where applicable

Report what was actually tested and identify remaining gaps.

---

## 7. Avoid

* Generic AI-dashboard aesthetics
* Excessive gradients or glassmorphism
* Unnecessary animations
* Decorative elements that interfere with engineering information
* Frameworks or UI libraries
* Unclear units or ambiguous inputs
* Overly dense layouts
* Treating a visual mockup as a functional implementation

## The final result should feel like a **purpose-built engineering tool**, not a generic frontend template.
