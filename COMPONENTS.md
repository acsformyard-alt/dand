# Component Glossary

This glossary summarises the major UI building blocks that power the TableTorch demo app. Use these shared names when coordinating future updates or documentation. Each entry calls out the component, its purpose, and where it lives.

## Application Shell & Landing
- **App Shell** – Handles authentication state, campaign/map/session loading, and switches between DM, player, creation, and admin views. `apps/pages/src/App.tsx`
- **Landing Experience** – Marketing hero, feature grid, and authentication prompt that greet unauthenticated visitors. `apps/pages/src/components/LandingPage.tsx`
  - **Hero Header** – Top banner with logo lockup and theme toggle button. `LandingPage.tsx`
  - **Feature Highlight Grid** – Two-column card grid that lists key product selling points. `LandingPage.tsx`
  - **Authentication Showcase** – The glassmorphism frame that embeds the authentication panel on the landing page. `LandingPage.tsx`
- **Authentication Panel** – Reusable login/sign-up form with mode toggle, error messaging, and CTA. `apps/pages/src/components/AuthPanel.tsx`

## DM Session Console
- **DM Session Viewer** – Primary control surface for running a live session, including map rendering, reveal controls, and player preview. `apps/pages/src/components/DMSessionViewer.tsx`
  - **Reveal Confirmation Modal** – Full-screen overlay with torch animation that appears before revealing rooms or markers. `DMSessionViewer.tsx`
  - **Session Control Header** – Sticky toolbar with session metadata, view toggle, snapshot, end session, and leave actions. `DMSessionViewer.tsx`
  - **Battle Map Canvas** – DM-only SVG rendering that layers the map, masked regions, and styled marker badges. `DMSessionViewer.tsx`
  - **Rooms Control Panel** – Sidebar tab showing collapsible room cards with status badges, metadata, and reveal/hide actions. `DMSessionViewer.tsx`
    - **Room Detail Card** – The expanded portion of each room card containing descriptions, tags, stats, and DM notes. `DMSessionViewer.tsx`
  - **Markers Control Panel** – Sidebar tab listing markers with icon badges, visibility state, linked room info, and reveal buttons. `DMSessionViewer.tsx`
    - **Marker Detail Card** – Expanded marker summary including description, tags, DM notes, and coordinate readout. `DMSessionViewer.tsx`
  - **Session Insights Tab** – “Other” sidebar tab with session overview, map summary KPIs, and quick-reference guidance. `DMSessionViewer.tsx`
- **Reveal Confirmation Animation** – PixiJS/GSAP-powered torch animation that reacts to the modal buttons. `apps/pages/src/components/RevealConfirmationAnimation.tsx`
- **Map Mask Canvas** – Canvas overlay that handles fog-of-war reveals, DM hover previews, and marker badges on static maps. `apps/pages/src/components/MapMaskCanvas.tsx`
- **Marker Management Panel** – Compact list for editing/removing markers in map editing contexts. `apps/pages/src/components/MarkerPanel.tsx`
- **Region Management Panel** – Compact list for toggling room visibility and opening room details. `apps/pages/src/components/RegionList.tsx`

## Player Experience
- **Player Session View** – Player-facing chrome with campaign/map labels, leave button, and embedded player map. `apps/pages/src/components/PlayerSessionView.tsx`
  - **Player Session Header** – Compact bar surfacing campaign, map, and session names plus leave action. `PlayerSessionView.tsx`
  - **Player Map Frame** – Container that wraps the fog-of-war canvas in the player session. `PlayerSessionView.tsx`
- **Player Fog-of-War Canvas** – SVG-based renderer that applies mask filters, noise texture, and visible marker sprites. `apps/pages/src/components/PlayerView.tsx`

## Map Management & Creation
- **Map Folder List** – Campaign atlas view that groups maps, exposes accordion controls, and surfaces delete/create actions. `apps/pages/src/components/MapFolderList.tsx`
  - **Folder Header Card** – Accordion trigger row showing folder title, map count, expand toggle, and delete action. `MapFolderList.tsx`
  - **Map Summary Tile** – Individual map card with preview metrics, tags, notes, and inline delete button. `MapFolderList.tsx`
- **Map Creation Wizard** – Four-step modal flow for uploading maps, entering metadata, defining rooms, and staging markers. `apps/pages/src/components/MapCreationWizard.tsx`
  - **Wizard Header & Step Pills** – Title block with current step description and progress chips. `MapCreationWizard.tsx`
  - **Upload Dropzone** – Step 1 drag-and-drop surface with preview panel and file picker. `MapCreationWizard.tsx`
  - **Details Form Step** – Metadata form with map name, grouping, notes, tags, preview, and helper tips. `MapCreationWizard.tsx`
  - **Embedded DefineRoom Editor** – Full-screen room outlining and marker authoring workspace supplied by the DefineRoom runtime. `MapCreationWizard.tsx`
  - **Wizard Footer Controls** – Navigation buttons with validation, error messaging, and final submission logic. `MapCreationWizard.tsx`
- **DefineRoom Room Editor** – Custom embeddable editor that powers polygon tracing, toolbars, room lists, marker palettes, and confirmation flows. `apps/pages/src/define-rooms/DefineRoom.tsx`

## Shared Utilities & Iconography
- **Toolbar Controls** – Selection tool toggle and advanced settings slider bank for mask authoring workflows. `apps/pages/src/components/Toolbar.tsx`
- **Map Marker Icons Library** – Central registry of marker icon definitions, default colours, and helpers. `apps/pages/src/components/mapMarkerIcons.tsx`

Refer back to this glossary when naming UI work so future contributors share the same vocabulary.
