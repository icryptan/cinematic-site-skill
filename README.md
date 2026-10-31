# CinematicSite

An AI agent skill for creating distinctive, brand-specific websites—from a brief and visual references to an approved design direction, custom 3D or motion, and a verified preview.

Each website gets its own visual direction. The starting kit is deliberately neutral: layout, typography, sections, scenes, and motion are designed around the brand brief.

## What's included

- `CinematicSite/SKILL.md` — the skill entry point and task routing.
- `Intents/` — website creation, verification, and owner-approved deployment.
- `References/` — design directions, techniques, quality standards, sources, and technical pitfalls.
- `Tools/` — a project generator, optional Chrome diagnostics, and usage guides.
- `Kit/` — a neutral Astro starter with localization, design tokens, loading fallbacks, a preview server, and build checks.

The skill folders live inside `CinematicSite/`. Finished 3D scenes, photos, client projects, and hosting accounts are not included. Choose Three.js and other assets separately for each project.

## Installation

You need Bun and Git. Copy the entire `CinematicSite` folder into your agent's skills directory; the location depends on the agent. You can also run the tools directly without installing the skill into an agent.

Read the [setup guide](CinematicSite/Setup.md), then try a request such as: "Create a cinematic website for a ceramics studio. Show me the design directions before building."

## Try the project generator

From the repository root, choose a destination directory that does not already exist:

```bash
bun CinematicSite/Tools/NewSite.ts --name demo-site --brand "Demo Studio" --dir /tmp/demo-site --no-git
cd /tmp/demo-site
bun run build
bun run verify
bun run preview
```

The generator installs dependencies by default. Add `--no-install` to generate source files only. Existing directories are never overwritten. The `preview` command prints an available port; press Ctrl+C to stop it.

The generated site starts with neutral placeholders. The `bun run verify -- --release` check intentionally rejects it until the placeholders are replaced and all translations are complete.

## How the skill works

1. The brief defines the audience, the intended visitor action, and the available materials.
2. Visual references inform the principles; the agent presents two or three distinct design directions.
3. Once a direction is chosen, the agent builds the sections and visuals: a 3D world, video, DOM-based motion, or a hybrid.
4. The build, fallbacks, and rendered views are checked on desktop and mobile.
5. The owner receives a verified preview. Public deployment requires separate approval and a backup.

## Tool checks

```bash
bun test ./CinematicSite/Tools
bun CinematicSite/Tools/NewSite.ts --help
bun CinematicSite/Tools/Check.ts --help
```

Generator tests verify the tooling, not the quality of a finished design. The automated `Check.ts` provides additional diagnostics; visual review in a real browser is still required. See its [usage guide and limitations](CinematicSite/Tools/Check.help.md).

## Network access and secrets

The generator does not require API keys. `bun install` contacts the package registry. `Check.ts` loads the target website and its resources in Chrome. The preview server listens on all interfaces; noindex is not access control. The owner configures external hosting and access restrictions. The tools in this repository do not call AI models or send analytics themselves.

## References and license

Optional public sources are listed in the [reference guide](CinematicSite/References/References.md); their code and assets are not bundled. Astro and other dependencies retain their own licenses. Original materials in this repository are available under the [MIT License](LICENSE).
