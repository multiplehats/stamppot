# React interactivity and RSC in the Stamppot Worker

Research date: 2026-08-27

## Research recommendation and implementation decision

The initial recommendation below favored client islands because bare RSC adds framework-layer
machinery. After reviewing that tradeoff, the project chose the bare Vite integration. The current
implementation keeps MCP and HTTP routing in the existing Worker, streams page HTML through an
embedded SSR child environment, embeds the initial Flight payload, and hydrates isolated
`"use client"` controls in the browser.

There is now an official way to run React Server Components in a standalone Cloudflare Worker
with Vite. Vite ships the low-level [`@vitejs/plugin-rsc`](https://vite.dev/plugins/#vitejs-plugin-rsc),
and Cloudflare's Vite plugin can embed the separate RSC and SSR module graphs in one Worker through
[`viteEnvironment.childEnvironments`](https://developers.cloudflare.com/changelog/post/2026-02-11-vite-plugin-child-environments/).
A full-stack framework is no longer technically required.

It is not, however, a small way to add a few dynamic controls. `'use client'` is an instruction to
an RSC-aware bundler, not a general React/Vite switch. Bare RSC means Stamppot would own a small
framework layer: three module graphs, Flight request routing and serialization, HTML rendering,
payload injection, hydration, and—if used—navigation and Server Function dispatch. The official
Vite starter demonstrates all of that rather than hiding it.
[Vite describes the plugin as low-level framework-building primitives](https://github.com/vitejs/vite-plugin-react/tree/main/packages/plugin-rsc#features),
and its [starter framework directory](https://github.com/vitejs/vite-plugin-react/tree/main/packages/plugin-rsc/examples/starter/src/framework)
contains separate RSC, SSR, browser, request, and error-boundary modules.

The initial recommendation was:

1. Add ordinary client-side React islands for isolated interaction such as copy controls, tool
   filtering, or examples. This keeps the existing Worker and static page boundary intact.
2. If interaction becomes page-wide, use conventional SSR plus `hydrateRoot`; this is still much
   less machinery than RSC and supports hooks and event handlers everywhere.
3. Adopt RSC only when its actual benefits—async Server Components, keeping component dependencies
   out of the browser, streamed Flight updates, or Server Functions—are needed. At that point,
   either use the bare Vite plugin deliberately or migrate the web routes to a framework that owns
   the protocol.

If the landing surface grows into a real Cloudflare-only application, RedwoodSDK is the most
natural framework candidate because it keeps a standards-based Worker entry and ordinary
`Response` routes while owning RSC. Waku is the smaller RSC-first alternative, but is still beta.

## Current Stamppot fit

Stamppot already has almost all platform prerequisites: React 19.2.8, Vite 8.2.2,
`@cloudflare/vite-plugin` 1.54.1, Wrangler 4.127.0, and a Worker with `nodejs_compat`.
[Workspace versions](../../pnpm-workspace.yaml), [edge package](../../apps/edge/package.json),
[Worker configuration](../../apps/edge/wrangler.jsonc)

The important architectural constraint is that the current Worker entry owns more than HTML. It
also dispatches MCP, plain HTTP tools, health, sitemap, Markdown, and tool-page routes.
[Worker source](../../apps/edge/src/worker.ts)

At the time of research, the page renderer called `renderToStaticMarkup`, which React explicitly
documents as output that cannot be hydrated. The implementation has now moved production HTML
rendering into the SSR environment; `renderToStaticMarkup` remains only as a single-graph Vitest
adapter for Worker route tests.
[Current RSC renderer](../../apps/edge/src/landing/render-page.tsx),
[`renderToStaticMarkup` documentation](https://react.dev/reference/react-dom/server/renderToStaticMarkup)

## What `'use client'` actually requires

React says directives provide instructions to bundlers compatible with React Server Components.
When a Server Component imports a module beginning with `'use client'`, that module and its
transitive dependencies form a client-side boundary. The directive has no special effect in an
ordinary all-client React graph. There is no directive for Server Components; `'use server'`
marks callable Server Functions instead.
[React directives](https://react.dev/reference/rsc/directives),
[`'use client'`](https://react.dev/reference/rsc/use-client),
[Server Components](https://react.dev/reference/rsc/server-components)

React 19's user-facing Server Component model is stable, but React warns that the APIs used by
bundlers and frameworks to implement it do not follow semver and can break between React 19.x
minor releases. React recommends pinning an exact version when implementing that layer.
[React 19 RSC stability note](https://react.dev/blog/2024/12/05/react-19#react-server-components)

That makes the maturity distinction important:

- React's component model is stable.
- Cloudflare's Vite plugin is GA and supports RSC child environments.
  [Cloudflare GA announcement](https://developers.cloudflare.com/changelog/post/2025-04-08-vite-plugin/)
- The Vite RSC integration is official but still a pre-1.0 package; npm's latest release on the
  research date is [`@vitejs/plugin-rsc` 0.5.34](https://www.npmjs.com/package/@vitejs/plugin-rsc/v/0.5.34).
- Framework integrations may independently label their RSC support experimental.

## Bare Vite RSC on one Worker

The official plugin implements the RSC-aware transforms, client/server references, CSS splitting,
HMR, and low-level `react-server-dom` APIs. Its normal architecture has three Vite environments:

| Environment | Responsibility |
| --- | --- |
| `rsc` | Load the `react-server` condition, render React values to a Flight stream, and decode/dispatch Server Functions |
| `ssr` | Decode the Flight stream back to React elements and render HTML with `react-dom/server.edge` |
| `client` | Decode Flight in the browser, hydrate the document, and contain `'use client'` modules |

The data flow and entry-point configuration are documented in the
[`@vitejs/plugin-rsc` basic concepts](https://github.com/vitejs/vite-plugin-react/tree/main/packages/plugin-rsc#basic-concepts).
Cloudflare can run the RSC graph as the Worker parent and embed SSR as a child graph:

```ts
cloudflare({
  viteEnvironment: {
    name: "rsc",
    childEnvironments: ["ssr"],
  },
})
```

Cloudflare states that `childEnvironments` exists specifically for RSC and frameworks built on
`@vitejs/plugin-rsc`. [Cloudflare Vite plugin API](https://developers.cloudflare.com/workers/vite-plugin/reference/api/#interface-pluginconfig)
The Vite repository also has a
[commit-pinned single-Worker Cloudflare example](https://github.com/vitejs/vite-plugin-react/tree/f066114c3e6bf18f5209ff3d3ef6bf1ab46d3866/packages/plugin-rsc/examples/starter-cf-single).

For Stamppot, a bare integration would require at least:

- adding `@vitejs/plugin-rsc` and `@vitejs/plugin-react`, with exact compatible React versions;
- making the existing Worker the `rsc` parent environment and adding SSR and browser entries;
- retaining the existing MCP/API dispatch in that Worker while delegating only `/` and `/tools/*`
  document/Flight requests to the landing RSC renderer;
- moving HTML rendering out of the current Worker-side `renderToStaticMarkup` module and into the
  SSR child graph;
- defining how the browser distinguishes document, Flight, and Server Function requests;
- injecting both the client entry and initial Flight payload into HTML before hydration;
- implementing error handling, status/headers, cancellation, navigation/revalidation, CSP nonce
  propagation, and Server Function authorization/CSRF policy to the extent those features are
  enabled.

The plugin helps with the cross-graph imports and compiled client/server references, but those
application protocol choices remain the owner's responsibility. The official starter's
[`entry.rsc.tsx`](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-rsc/examples/starter/src/framework/entry.rsc.tsx),
[`entry.ssr.tsx`](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-rsc/examples/starter/src/framework/entry.ssr.tsx), and
[`entry.browser.tsx`](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-rsc/examples/starter/src/framework/entry.browser.tsx)
show the resulting framework code.

### Local compatibility check

A throwaway copy of the current official Vite RSC starter was tested with Stamppot's exact React,
Vite, Cloudflare Vite plugin, and Wrangler versions. After adding the Cloudflare parent/child
environment configuration, it built and previewed successfully: the document returned streamed
HTML with status 200, and the Flight endpoint returned `text/x-component` with status 200.

The toy build emitted approximately 139 kB of Worker code, 220 kB of client code, and a 519 kB
embedded SSR child before gzip (approximately 30 kB, 70 kB, and 103 kB gzip respectively). These
figures prove compatibility, not forecast Stamppot's eventual bundle size; they include the
starter's generic navigation, Server Function, and error-handling machinery.

Conclusion: bare RSC works on this stack and can coexist with the MCP/API routes in the same
Worker. It is a viable experiment, but it is not a one-plugin/one-directive change.

## Options

| Option | Worker/API preservation | RSC status | What Stamppot would own | Fit now |
| --- | --- | --- | --- | --- |
| React islands with `createRoot` | Existing Worker stays unchanged; add browser assets | Not RSC | Island entry, small serializable props, mount points | Best for a few dynamic controls |
| Conventional SSR + `hydrateRoot` | Existing routes remain; landing output becomes hydratable | Stable React/Vite APIs | Browser entry and identical serializable server/client page props | Best if most of the page becomes interactive |
| Bare `@vitejs/plugin-rsc` | Existing fetch dispatch can remain in the RSC parent | Official low-level plugin, pre-1.0 integration | The Flight/SSR/browser protocol layer described above | Use only when RSC benefits justify ownership |
| React Router RSC Framework Mode | API routes can be composed, but web routing/build become React Router's | Explicitly experimental | Cloudflare composition and any custom Worker entry behavior | Too much migration for a landing page |
| TanStack Start RSC | Worker deployment is supported, but Start owns the web app | Start is RC; RSC is explicitly experimental | Start routes/loaders and its helper-based RSC model | Weak fit for incremental adoption here |
| Waku | Existing endpoints must move behind Waku's Worker/router adapter | RSC-first; latest release is beta | Mostly application routes; Waku owns Flight and hydration | Interesting minimal framework, not yet conservative |
| RedwoodSDK | Standards-based `Response` routes make endpoint migration relatively direct | Stable 1.x; RSC is a core feature | RedwoodSDK `defineApp`/router integration | Best framework option if the site becomes an app |

### React Router

React Router v8 has RSC Framework and Data modes, templates, default RSC/SSR/client entries, Server
Component routes, Server Functions, and HMR. Its documentation nevertheless says RSC support is
experimental and may break in minor or patch releases. RSC Framework Mode uses a separate
`unstable_reactRouterRSC` Vite plugin plus `@vitejs/plugin-rsc`; it is not the ordinary stable
Cloudflare React Router SSR setup.
[React Router RSC guide](https://reactrouter.com/how-to/react-server-components),
[Cloudflare React Router guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/react-router/)

The Cloudflare child-environment configuration can be composed with it, but no first-party
Cloudflare RSC Framework template was found. This would therefore exchange the bare protocol work
for an experimental routing/framework migration. It is not an easier incremental landing-page
change.

### TanStack Start

TanStack Start itself is in release-candidate stage, while its RSC feature is explicitly
experimental and is documented to remain so into early v1. It must be enabled in both the Start
plugin and `@vitejs/plugin-rsc`. Its high-level model usually renders a Server Component from a
`createServerFn` and returns the renderable through a route loader, rather than making every route
an RSC tree by default.
[Start status](https://tanstack.com/start/latest/docs/framework/react/overview),
[Start Server Components guide](https://tanstack.com/start/latest/docs/framework/react/guide/server-components)

Cloudflare officially supports ordinary TanStack Start SSR through its Vite plugin, but no
first-party recipe combining Start RSC with Cloudflare child environments was found.
[Cloudflare TanStack Start guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/tanstack-start/)

### Waku

Waku is a minimal React framework built around React 19 and RSC. It handles Server Components,
`'use client'`, Server Functions, routing, Flight, and hydration, and Cloudflare documents dynamic
Worker deployment. It is substantially less code to own than bare RSC.
[Waku repository](https://github.com/wakujs/waku),
[Cloudflare Waku guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/more-web-frameworks/waku/)

Its latest release on the research date is
[`v1.0.0-beta.9`](https://github.com/wakujs/waku/releases/tag/v1.0.0-beta.9), so adopting it would
trade custom framework code for a still-changing framework and require moving the existing Worker
entry/routes into Waku's build and adapter model.

### RedwoodSDK

RedwoodSDK is a Vite-first React framework specifically for Cloudflare/workerd. It provides SSR,
RSC, `'use client'`, Server Functions, streaming, and a standards-based router. Its Worker entry
uses `defineApp`, and routes may return ordinary `Response` objects, which makes Stamppot's non-HTML
routes conceptually easier to preserve than in a conventional page framework.
[Cloudflare RedwoodSDK guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/redwoodsdk/),
[RedwoodSDK repository](https://github.com/redwoodjs/sdk),
[RedwoodSDK RSC guide](https://docs.rwsdk.com/core/react-server-components/)

RedwoodSDK is on stable 1.x releases and its maintainers classify SSR, Server Components, Client
Components, Server Functions, middleware, route handlers, `Response` returns, and JSX returns as
stable. [Stability tracker](https://github.com/redwoodjs/sdk/issues/244),
[releases](https://github.com/redwoodjs/sdk/releases)

This is the strongest framework option if the product direction is "make the Worker a dynamic web
application." It is still a real framework adoption, not an additive plugin for the current
renderer.

### vinext

Cloudflare's vinext is another working Vite/RSC-on-Workers implementation, but it targets Next.js
App Router compatibility and is beta. It auto-registers `@vitejs/plugin-rsc` and uses the same RSC
parent/SSR child Cloudflare configuration.
[vinext repository and configuration](https://github.com/cloudflare/vinext#custom-vite-configuration)

It is relevant proof that the one-Worker architecture is viable, but importing Next's API surface
would add more convention and compatibility code than Stamppot needs.

## Recommended incremental design

The cleanest next step is a browser entry that mounts only explicitly interactive components with
[`createRoot`](https://react.dev/reference/react-dom/client/createRoot). Cloudflare's Vite plugin
automatically builds and deploys the client environment when a client build input is configured,
and places the output in Workers Static Assets.
[Cloudflare static-assets build behavior](https://developers.cloudflare.com/workers/vite-plugin/reference/static-assets/#configuration)

Keep the page layout, prose, MCP catalogue, metadata, and Markdown rendering server-only. Pass each
island a deliberately small JSON value rather than trying to serialize `OperationRegistry` or the
content catalogue. This limits the browser bundle and avoids coupling the server domain model to
hydration.

If interactive state later spans most of the landing/tool page tree, render a universal page tree
on the server and call [`hydrateRoot`](https://react.dev/reference/react-dom/client/hydrateRoot)
from a client entry. That requires deterministic server/client markup and serializable page props,
but not Flight, an RSC endpoint, a second server graph, or Server Function dispatch.

Re-evaluate bare RSC or RedwoodSDK when at least one concrete requirement cannot be served cleanly
by those two designs—for example, async component-level data fetching that must stay out of the
client bundle, streamed component refresh after mutation, or a growing set of server/client
boundaries across multiple application pages.
