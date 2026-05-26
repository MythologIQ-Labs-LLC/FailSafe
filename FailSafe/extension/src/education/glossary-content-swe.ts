// FailSafe Educational Component — Phase 2A: SWE-domain glossary (A/3).
//
// RD-6 / RD-1: leaf data module — no runtime imports, no DOM. Carries the
// first slice of general software-development vocabulary so each content
// file stays under the Section-4 razor. See `glossary-content.ts` for the
// authoring conventions; `lessons.ts` concatenates all SWE_GLOSSARY_LESSONS_*.

import type { Lesson } from "./lessons";

/** SWE-domain glossary, part A of 3 — core programming primitives. */
export const SWE_GLOSSARY_LESSONS_A: Lesson[] = [
  {
    id: "glossary-variable",
    anchor: "glossary.swe.variable",
    kind: "glossary",
    domain: "swe",
    term: "Variable",
    levels: ["beginner", "intermediate", "advanced"],
    body: {
      beginner: "A variable is a named box that holds a value. You put something in it (a number, a word, a list), give the box a name, and refer to the name later instead of repeating the value. Change the contents and every later reference sees the new value.",
      intermediate: "A variable binds a name to a value within a scope. The trade-off is mutability vs. predictability — reassignable bindings simplify writing, but immutable ones simplify reasoning about state.",
      advanced: "Variable = named binding of identifier to value within a scope. Mutability orthogonal to binding.",
    },
  },
  {
    id: "glossary-function",
    anchor: "glossary.swe.function",
    kind: "glossary",
    domain: "swe",
    term: "Function",
    levels: ["beginner", "intermediate", "advanced"],
    body: {
      beginner: "A function is a reusable recipe. You give it inputs, it runs a few steps, and it hands back a result. Naming the recipe lets you call it from many places without rewriting the steps each time.",
      intermediate: "A function is a named unit of behaviour with a typed input/output contract. Small, single-purpose functions trade a little call overhead for big gains in testability and reuse.",
      advanced: "Function = parameterised callable with input/output contract. Composition primitive.",
    },
  },
  {
    id: "glossary-type",
    anchor: "glossary.swe.type",
    kind: "glossary",
    domain: "swe",
    term: "Type",
    levels: ["beginner", "intermediate", "advanced"],
    body: {
      beginner: "A type says what kind of value something is — a number, a piece of text, a yes/no, a list. Types let the language (or your editor) warn you when you try to use a value in a way that does not make sense, like adding a word to a number.",
      intermediate: "Types constrain the set of values a name can hold and the operations valid on it. Static typing catches whole classes of bug at compile time at the cost of upfront annotation.",
      advanced: "Type = constraint over value set + permitted operations. Static = pre-runtime check.",
    },
  },
  {
    id: "glossary-conditional",
    anchor: "glossary.swe.conditional",
    kind: "glossary",
    domain: "swe",
    term: "Conditional",
    levels: ["beginner", "intermediate", "advanced"],
    body: {
      beginner: "A conditional is an \"if this, then that\" decision in code. The program checks something — is the user logged in? is the number above zero? — and runs one branch or another based on the answer.",
      intermediate: "Conditionals branch control flow on a boolean test. Watch for deep nesting or scattered repeated checks — they usually signal a missing abstraction or a polymorphism opportunity.",
      advanced: "Conditional = boolean-gated control-flow branch. Excess nesting smells like missing abstraction.",
    },
  },
  {
    id: "glossary-loop",
    anchor: "glossary.swe.loop",
    kind: "glossary",
    domain: "swe",
    term: "Loop",
    levels: ["beginner", "intermediate", "advanced"],
    body: {
      beginner: "A loop tells the program to do the same thing many times — once for each item in a list, or until some condition stops being true. Without loops you would have to copy-paste the same instructions for every item by hand.",
      intermediate: "Loops iterate a body over a sequence or until a predicate flips. The trade-off is termination — every loop needs a clear stopping rule, or it spins forever.",
      advanced: "Loop = repeated execution of a body bounded by predicate or sequence. Termination obligation.",
    },
  },
  {
    id: "glossary-array",
    anchor: "glossary.swe.array",
    kind: "glossary",
    domain: "swe",
    term: "Array",
    levels: ["beginner", "intermediate", "advanced"],
    body: {
      beginner: "An array is an ordered list of values, like a numbered shelf. The first slot is item zero (most languages count from 0, not 1), the next is item one, and so on. You read or change a slot by its number.",
      intermediate: "An array is a contiguous, index-addressable sequence. Fast random access and iteration; insert/remove in the middle costs a shift. Choose vs. linked structures on those access patterns.",
      advanced: "Array = index-addressable ordered sequence. O(1) access, O(n) mid-insert.",
    },
  },
  {
    id: "glossary-object",
    anchor: "glossary.swe.object",
    kind: "glossary",
    domain: "swe",
    term: "Object",
    levels: ["beginner", "intermediate", "advanced"],
    body: {
      beginner: "An object groups related values under one name, each with its own label. A user object might hold a name, an email, and an age together. You reach into it by label (user.name) instead of by position.",
      intermediate: "An object bundles named fields (and often behaviour) into a single value. The trade-off vs. a plain record is whether you want encapsulated methods or just structured data.",
      advanced: "Object = named-field aggregate, optionally with methods. Identity + state + behaviour.",
    },
  },
  {
    id: "glossary-module",
    anchor: "glossary.swe.module",
    kind: "glossary",
    domain: "swe",
    term: "Module",
    levels: ["beginner", "intermediate", "advanced"],
    body: {
      beginner: "A module is a single file (or folder) of code that groups related work and decides what to share with the rest of the program. Other files import only what the module chose to expose; the rest stays private inside it.",
      intermediate: "A module is a unit of encapsulation with an explicit public surface. Good module boundaries minimise coupling — what is exported is contract, what is not is free to change.",
      advanced: "Module = encapsulation unit with explicit export surface. Boundary = contract.",
    },
  },
  {
    id: "glossary-package",
    anchor: "glossary.swe.package",
    kind: "glossary",
    domain: "swe",
    term: "Package",
    levels: ["beginner", "intermediate", "advanced"],
    body: {
      beginner: "A package is a bundle of code published so other projects can use it. It comes with a name, a version, and a list of what it needs to run. You install packages from a registry (like npm or PyPI) instead of copying source code by hand.",
      intermediate: "A package is a versioned, distributable unit with declared dependencies and a public API. Versioning discipline (semver) is the contract that lets consumers upgrade safely.",
      advanced: "Package = versioned distributable with declared deps + public API. Semver = upgrade contract.",
    },
  },
  {
    id: "glossary-dependency",
    anchor: "glossary.swe.dependency",
    kind: "glossary",
    domain: "swe",
    term: "Dependency",
    levels: ["beginner", "intermediate", "advanced"],
    body: {
      beginner: "A dependency is code your project needs from someone else to work. If your app uses a charts library, that library is a dependency. You list it once; the package manager fetches it (and anything it needs in turn) for you.",
      intermediate: "A dependency is external code your build pulls in transitively. Every dependency is surface area — supply-chain risk, version drift, and binary size all scale with the graph.",
      advanced: "Dependency = externally-sourced code edge. Transitive graph = true surface area.",
    },
  },
  {
    id: "glossary-import",
    anchor: "glossary.swe.import",
    kind: "glossary",
    domain: "swe",
    term: "Import",
    levels: ["beginner", "intermediate", "advanced"],
    body: {
      beginner: "An import is the line at the top of a file that says \"bring this thing in from over there\". It pulls a function, type, or value from another file or package so you can use it by name in the current file.",
      intermediate: "An import binds a name in the current module to an exported symbol from another. The shape of the import graph determines build order, tree-shaking opportunity, and circular-dependency risk.",
      advanced: "Import = binding to another module's export. Import graph = build + cycle topology.",
    },
  },
  {
    id: "glossary-scope",
    anchor: "glossary.swe.scope",
    kind: "glossary",
    domain: "swe",
    term: "Scope",
    levels: ["beginner", "intermediate", "advanced"],
    body: {
      beginner: "Scope is where in the code a name is visible. A variable made inside a function usually only exists inside that function — outside, the name means nothing. Scopes keep names from colliding and keep helpers private.",
      intermediate: "Scope is the region of code where a binding is resolvable. Narrower scopes reduce accidental capture and make refactoring safer; closures extend a scope's lifetime past its syntactic end.",
      advanced: "Scope = lexical region of name resolution. Closure = scope outliving its syntactic frame.",
    },
  },
  {
    id: "glossary-side-effect",
    anchor: "glossary.swe.side-effect",
    kind: "glossary",
    domain: "swe",
    term: "Side effect",
    levels: ["beginner", "intermediate", "advanced"],
    body: {
      beginner: "A side effect is anything a piece of code does besides return a value — writing to a file, sending a request, printing to the screen, changing a shared variable. Side effects are why the same function can behave differently from one call to the next.",
      intermediate: "A side effect is any observable change outside a function's return value. Concentrating effects at the edges keeps the core pure and testable; scattering them makes reasoning local impossible.",
      advanced: "Side effect = observable state change beyond return value. Push to edges.",
    },
  },
  {
    id: "glossary-null-undefined",
    anchor: "glossary.swe.null-undefined",
    kind: "glossary",
    domain: "swe",
    term: "Null / undefined",
    levels: ["beginner", "intermediate", "advanced"],
    body: {
      beginner: "Null and undefined are the two ways code says \"there is no value here\". Undefined usually means a value was never set; null usually means it was deliberately set to nothing. Reading a property off either one is a classic crash.",
      intermediate: "Null and undefined both denote absence, distinguished mostly by intent. Most modern type systems force you to handle the absent case explicitly — option/maybe types beat sentinel values.",
      advanced: "Null/undefined = absence sentinels. Prefer option types over in-band absence.",
    },
  },
  {
    id: "glossary-error",
    anchor: "glossary.swe.error",
    kind: "glossary",
    domain: "swe",
    term: "Error",
    levels: ["beginner", "intermediate", "advanced"],
    body: {
      beginner: "An error is the program saying something went wrong — a file is missing, the network failed, a number was expected and a word arrived. Errors usually carry a message and a stack trace showing where they happened.",
      intermediate: "An error is a signalled failure carrying diagnostic context. The design choice is return-as-value vs. throw — values force handling at the call site; throws unwind until something catches.",
      advanced: "Error = signalled failure + context. Value-return vs. throw = handling-locality choice.",
    },
  },
];
