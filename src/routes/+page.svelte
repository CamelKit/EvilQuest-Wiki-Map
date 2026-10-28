<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { replaceState } from '$app/navigation';
	import type {
		MapMetadata,
		WorldNode,
		POI,
		NPCSpawn,
		NodeCategory,
		NodeSubcategory,
		NodesDataPayload,
		ViewportState,
		SearchResult
	} from '../lib/types';
	import { DEFAULT_META, worldToTile, tileToWorld, centerOnTile } from '../lib/coords';
	import MapCanvas from '../lib/components/MapCanvas.svelte';
	import TopNav from '../lib/components/TopNav.svelte';
	import Sidebar from '../lib/components/Sidebar.svelte';
	import ZoomControls from '../lib/components/ZoomControls.svelte';
	import NodeModal from '../lib/components/NodeModal.svelte';

	// Map data
	let meta = $state<MapMetadata>(DEFAULT_META);
	let categories = $state<NodeCategory[]>([]);
	let nodes = $state<WorldNode[]>([]);
	let pois = $state<POI[]>([]);
	let npcs = $state<NPCSpawn[]>([]);
	let isDataLoaded = $state(false);

	// Viewport & Map interaction
	let canvasComponent: MapCanvas | null = null;
	let view = $state<ViewportState>({ x: 0, y: 0, zoom: 2.0 });
	let cursorCoords = $state<{ x: number; z: number } | null>(null);
	let selectedItem = $state<WorldNode | POI | NPCSpawn | null>(null);

	// Layers & Filters
	let currentMap = $state<'surface' | 'underground'>('surface');
	let activeCategories = $state<Set<string>>(new Set());
	let activeSubcategories = $state<Set<string>>(new Set());
	let showPOIs = $state(true);
	let showNPCs = $state(false);
	let isSidebarOpen = $state(false);

	// Search
	let searchQuery = $state('');
	let isSearching = $state(false);

	// Embed mode (?embed=true)
	let isEmbedMode = $state(false);

	// Compute search results
	let searchResults = $derived.by(() => {
		const q = searchQuery.trim().toLowerCase();
		if (!q || q.length < 2) return [];

		const results: SearchResult[] = [];

		// Check coordinate pattern e.g. "192, 34" or "x=192 z=34" or "192 34"
		const coordMatch = q.match(/^(-?\d+)[,\s]+(-?\d+)$/);
		if (coordMatch) {
			const wx = parseInt(coordMatch[1], 10);
			const wz = parseInt(coordMatch[2], 10);
			const tile = worldToTile(wx, wz, meta);
			results.push({
				id: `coord-${wx}-${wz}`,
				title: `Go to coordinates (${wx}, ${wz})`,
				subtitle: `Tile ${Math.round(tile.x)}, ${Math.round(tile.z)}`,
				category: 'Coordinates',
				icon: '📍',
				x: tile.x,
				z: tile.z,
				isCoord: true
			});
		}

		// Search POIs
		for (const p of pois) {
			if (p.name.toLowerCase().includes(q)) {
				const w = tileToWorld(p.x, p.z, meta);
				const isUg = p.map === 'underground';
				results.push({
					id: `poi-${p.id}`,
					title: p.name,
					subtitle: `${isUg ? '[Underground] ' : ''}Place (${w.x}, ${w.z})`,
					category: 'Place',
					icon: '🏛️',
					x: p.x,
					z: p.z,
					poiId: p.id,
					map: p.map ?? 'surface'
				});
				if (results.length >= 10) break;
			}
		}

		// Search Resource Nodes
		for (const n of nodes) {
			const nameMatch = n.name.toLowerCase().includes(q);
			const dropMatch = n.harvest?.outputItem?.toLowerCase().includes(q);
			const subMatch = n.subCategory?.toLowerCase().includes(q);

			if (nameMatch || dropMatch || subMatch) {
				const w = tileToWorld(n.x, n.z, meta);
				const isUg = n.map === 'underground';
				const dropText = n.harvest?.outputItem ? `Drops ${n.harvest.outputItem} ` : '';
				results.push({
					id: `node-${n.id}`,
					title: n.name,
					subtitle: `${isUg ? '[Underground] ' : ''}${dropText}(${w.x}, ${w.z})`,
					category: n.category.toUpperCase(),
					icon: getCategoryIcon(n.category),
					x: n.x,
					z: n.z,
					nodeId: n.id,
					map: n.map ?? 'surface'
				});
				if (results.length >= 15) break;
			}
		}

		return results.slice(0, 12);
	});

	function getCategoryIcon(cat: string): string {
		switch (cat) {
			case 'tea': return '🍵';
			case 'mining': return '⛏️';
			case 'woodcutting': return '🪓';
			case 'fishing': return '🐟';
			case 'farming': return '🌾';
			case 'station': return '🔥';
			case 'bank': return '🏦';
			case 'water': return '💧';
			case 'chest': return '📦';
			case 'entrance': return '🚪';
			default: return '📍';
		}
	}

	onMount(async () => {
		try {
			const res = await fetch('/data/nodes.json');
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const data: NodesDataPayload = await res.json();

			meta = data.meta;
			categories = data.categories;
			nodes = data.nodes;
			pois = data.pois;
			npcs = data.npcs;

			// Enable all categories & subcategories by default
			const initialCats = new Set<string>();
			const initialSubs = new Set<string>();

			for (const cat of categories) {
				initialCats.add(cat.id);
				for (const sub of cat.subcategories) {
					initialSubs.add(sub.id);
				}
			}

			activeCategories = initialCats;
			activeSubcategories = initialSubs;
			isDataLoaded = true;

			// Handle query parameters
			handleInitialQueryParams();
		} catch (err) {
			console.error('Failed to load nodes data:', err);
		}
	});

	function handleInitialQueryParams() {
		const searchParams = page.url.searchParams;

		if (searchParams.get('embed') === 'true') {
			isEmbedMode = true;
		}

		const mapParam = searchParams.get('map');
		if (mapParam === 'underground' || mapParam === 'surface') {
			currentMap = mapParam;
		}

		// Node deep link: ?node=n15
		const nodeId = searchParams.get('node');
		if (nodeId) {
			const matched = nodes.find((n) => n.id === nodeId);
			if (matched) {
				if (matched.map) currentMap = matched.map;
				selectedItem = matched;
				activeCategories.add(matched.category);
				if (matched.subCategory) activeSubcategories.add(matched.subCategory);
				setTimeout(() => {
					canvasComponent?.flyTo(matched.x, matched.z, 6.0);
				}, 150);
				return;
			}
		}

		// Object deep link: ?object=Mithril%20Rock or ?name=Glasswort%20Bush
		const objectParam = searchParams.get('object') || searchParams.get('name');
		if (objectParam) {
			const q = objectParam.toLowerCase().replace(/_/g, ' ').trim();
			const matchingNodes = nodes.filter(
				(n) =>
					n.name?.toLowerCase() === q ||
					n.name?.toLowerCase().includes(q) ||
					n.subCategory?.toLowerCase() === q
			);
			if (matchingNodes.length > 0) {
				const first = matchingNodes[0];
				if (first.map) currentMap = first.map;
				activeCategories = new Set([first.category]);
				activeSubcategories = new Set(matchingNodes.map((n) => n.subCategory));
				selectedItem = first;
				setTimeout(() => {
					canvasComponent?.flyTo(first.x, first.z, 5.0);
				}, 150);
				return;
			}
		}

		// Item deep link: ?item=Iron%20Ore or ?item=671
		const itemParam = searchParams.get('item');
		if (itemParam) {
			const q = itemParam.toLowerCase();
			const matchingNodes = nodes.filter(
				(n) =>
					n.harvest?.outputItem?.toLowerCase().includes(q) ||
					n.harvest?.outputItemId?.toString() === q
			);
			if (matchingNodes.length > 0) {
				// Filter categories to only the matching node's category
				const first = matchingNodes[0];
				activeCategories = new Set([first.category]);
				activeSubcategories = new Set(matchingNodes.map((n) => n.subCategory));
				selectedItem = first;
				setTimeout(() => {
					canvasComponent?.flyTo(first.x, first.z, 5.0);
				}, 150);
				return;
			}
		}

		// Category filter: ?category=tea
		const categoryParam = searchParams.get('category');
		if (categoryParam) {
			const cat = categories.find((c) => c.id === categoryParam);
			if (cat) {
				activeCategories = new Set([cat.id]);
				activeSubcategories = new Set(cat.subcategories.map((s: NodeSubcategory) => s.id));
			}
		}

		// Explicit coordinates: ?x=192&z=34&zoom=2.5
		const qx = searchParams.get('x');
		const qz = searchParams.get('z');
		const qzoom = searchParams.get('zoom');
		if (qx && qz) {
			const wx = parseFloat(qx);
			const wz = parseFloat(qz);
			const zoom = qzoom ? parseFloat(qzoom) : 4.0;
			const tile = currentMap === 'underground' ? { x: wx, z: wz } : worldToTile(wx, wz, meta);
			setTimeout(() => {
				canvasComponent?.flyTo(tile.x, tile.z, zoom);
			}, 150);
		}
	}

	// Update URL bar seamlessly without reload as user navigates
	let urlUpdateTimeout: ReturnType<typeof setTimeout> | null = null;
	$effect(() => {
		const _v = view.x + view.y + view.zoom;
		if (!isDataLoaded || isEmbedMode) return;

		if (urlUpdateTimeout) clearTimeout(urlUpdateTimeout);
		urlUpdateTimeout = setTimeout(() => {
			if (typeof window === 'undefined') return;
			const w = window.innerWidth;
			const h = window.innerHeight;
			const centerTileX = (w / 2 - view.x) / view.zoom;
			const centerTileZ = (h / 2 - view.y) / view.zoom;
			const world = currentMap === 'underground'
				? { x: Math.round(centerTileX), z: Math.round(centerTileZ) }
				: tileToWorld(centerTileX, centerTileZ, meta);

			const newUrl = new URL(window.location.href);
			newUrl.searchParams.set('x', world.x.toString());
			newUrl.searchParams.set('z', world.z.toString());
			newUrl.searchParams.set('zoom', view.zoom.toFixed(2));

			if (selectedItem && 'id' in selectedItem) {
				newUrl.searchParams.set('node', (selectedItem as WorldNode).id);
			} else {
				newUrl.searchParams.delete('node');
			}

			if (currentMap === 'underground') {
				newUrl.searchParams.set('map', 'underground');
			} else {
				newUrl.searchParams.delete('map');
			}

			replaceState(newUrl, page.state);
		}, 300);
	});

	function handleSelectSearchResult(result: SearchResult) {
		if (result.map && result.map !== currentMap) {
			currentMap = result.map;
		}

		if (result.nodeId) {
			const n = nodes.find((it) => it.id === result.nodeId);
			if (n) {
				selectedItem = n;
				activeCategories.add(n.category);
				if (n.subCategory) activeSubcategories.add(n.subCategory);
			}
		} else if (result.poiId) {
			const p = pois.find((it) => it.id === result.poiId);
			if (p) {
				selectedItem = p;
				showPOIs = true;
			}
		}

		canvasComponent?.flyTo(result.x, result.z, 5.5);
	}

	function handleSwitchMap(newMap: 'surface' | 'underground') {
		if (currentMap === newMap) return;
		currentMap = newMap;
		selectedItem = null;
		setTimeout(() => {
			if (newMap === 'underground') {
				canvasComponent?.flyTo(120, 135, 4.0);
			} else {
				canvasComponent?.resetToFit();
			}
		}, 80);
	}

	function handleTransitionMap(targetMap: 'surface' | 'underground', tx: number, tz: number) {
		currentMap = targetMap;
		selectedItem = null;
		setTimeout(() => {
			canvasComponent?.flyTo(tx, tz, 5.5);
		}, 80);
	}

	function handleToggleCategory(catId: string) {
		const nextCats = new Set(activeCategories);
		const nextSubs = new Set(activeSubcategories);
		const cat = categories.find((c) => c.id === catId);

		if (nextCats.has(catId)) {
			nextCats.delete(catId);
			if (cat) {
				for (const sub of cat.subcategories) {
					nextSubs.delete(sub.id);
				}
			}
		} else {
			nextCats.add(catId);
			if (cat) {
				for (const sub of cat.subcategories) {
					nextSubs.add(sub.id);
				}
			}
		}

		activeCategories = nextCats;
		activeSubcategories = nextSubs;
	}

	function handleToggleSubcategory(subcatId: string, catId: string) {
		const nextSubs = new Set(activeSubcategories);
		if (nextSubs.has(subcatId)) {
			nextSubs.delete(subcatId);
		} else {
			nextSubs.add(subcatId);
			activeCategories.add(catId);
		}
		activeSubcategories = nextSubs;
	}

	function handleSelectPreset(preset: 'all' | 'none' | 'tea' | 'mining' | 'gathering' | 'stations') {
		const nextCats = new Set<string>();
		const nextSubs = new Set<string>();

		if (preset === 'all') {
			for (const c of categories) {
				nextCats.add(c.id);
				for (const s of c.subcategories) nextSubs.add(s.id);
			}
			showPOIs = true;
			showNPCs = true;
		} else if (preset === 'none') {
			showPOIs = false;
			showNPCs = false;
		} else if (preset === 'tea') {
			nextCats.add('tea');
			const c = categories.find((it) => it.id === 'tea');
			if (c) for (const s of c.subcategories) nextSubs.add(s.id);
		} else if (preset === 'mining') {
			nextCats.add('mining');
			const c = categories.find((it) => it.id === 'mining');
			if (c) for (const s of c.subcategories) nextSubs.add(s.id);
		} else if (preset === 'gathering') {
			for (const cid of ['tea', 'mining', 'woodcutting', 'fishing', 'farming']) {
				nextCats.add(cid);
				const c = categories.find((it) => it.id === cid);
				if (c) for (const s of c.subcategories) nextSubs.add(s.id);
			}
		} else if (preset === 'stations') {
			for (const cid of ['station', 'bank', 'water', 'entrance']) {
				nextCats.add(cid);
				const c = categories.find((it) => it.id === cid);
				if (c) for (const s of c.subcategories) nextSubs.add(s.id);
			}
		}

		activeCategories = nextCats;
		activeSubcategories = nextSubs;
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
			return;
		}

		switch (e.key) {
			case '+':
			case '=':
				view = { ...view, zoom: Math.min(16.0, view.zoom * 1.3) };
				break;
			case '-':
			case '_':
				view = { ...view, zoom: Math.max(0.5, view.zoom * 0.75) };
				break;
			case '0':
				canvasComponent?.resetToFit();
				break;
			case 'Escape':
				selectedItem = null;
				isSidebarOpen = false;
				break;
			case 'l':
			case 'L':
				isSidebarOpen = !isSidebarOpen;
				break;
			case 'f':
			case 'F':
				toggleFullscreen();
				break;
		}
	}

	function toggleFullscreen() {
		if (!document.fullscreenElement) {
			document.documentElement.requestFullscreen().catch(() => {});
		} else {
			document.exitFullscreen().catch(() => {});
		}
	}
</script>

<svelte:window onkeydown={handleKeyDown} />

<div class="map-app-shell {isEmbedMode ? 'is-embed' : ''}">
	<!-- Top Navigation Bar -->
	{#if !isEmbedMode}
		<TopNav
			bind:searchQuery
			{searchResults}
			{isSearching}
			{isSidebarOpen}
			activeFilterCount={activeCategories.size}
			{cursorCoords}
			currentZoom={view.zoom}
			{currentMap}
			onToggleSidebar={() => (isSidebarOpen = !isSidebarOpen)}
			onSelectResult={handleSelectSearchResult}
			onSwitchMap={handleSwitchMap}
		/>
	{/if}

	<!-- Left Drawer Layers Sidebar -->
	<Sidebar
		{categories}
		{activeCategories}
		{activeSubcategories}
		{showPOIs}
		{showNPCs}
		isOpen={isSidebarOpen}
		onToggleCategory={handleToggleCategory}
		onToggleSubcategory={handleToggleSubcategory}
		onTogglePOIs={() => (showPOIs = !showPOIs)}
		onToggleNPCs={() => (showNPCs = !showNPCs)}
		onSelectPreset={handleSelectPreset}
		onClose={() => (isSidebarOpen = false)}
	/>

	<!-- Interactive Map Canvas -->
	<main class="map-viewport-wrapper">
		<MapCanvas
			bind:this={canvasComponent}
			{meta}
			{nodes}
			{pois}
			{npcs}
			{activeCategories}
			{activeSubcategories}
			{showPOIs}
			{showNPCs}
			{currentMap}
			{selectedItem}
			bind:view
			bind:cursorCoords
			onSelectItem={(item: WorldNode | POI | NPCSpawn | null) => (selectedItem = item)}
		/>

		<!-- Zoom Controls -->
		<ZoomControls
			zoom={view.zoom}
			onZoomIn={() => (view = { ...view, zoom: Math.min(16.0, view.zoom * 1.35) })}
			onZoomOut={() => (view = { ...view, zoom: Math.max(0.5, view.zoom * 0.72) })}
			onResetView={() => canvasComponent?.resetToFit()}
			onToggleFullscreen={toggleFullscreen}
		/>

		<!-- Node / POI Detail Modal -->
		<NodeModal
			item={selectedItem}
			{meta}
			onClose={() => (selectedItem = null)}
			onFocus={(tx: number, tz: number) => canvasComponent?.flyTo(tx, tz, 6.0)}
			onTransitionMap={handleTransitionMap}
		/>

		{#if isEmbedMode}
			<a
				href={page.url.toString().replace('embed=true', 'embed=false')}
				target="_blank"
				rel="noopener noreferrer"
				class="embed-expand-btn"
				title="Open full interactive map in new tab"
			>
				<span>🗺️ Open Full Map ↗</span>
			</a>
		{/if}
	</main>
</div>

<style>
	:global(html, body) {
		margin: 0;
		padding: 0;
		width: 100%;
		height: 100%;
		overflow: hidden;
		background: #090c10;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
		color: #e2e8f0;
	}

	.map-app-shell {
		position: relative;
		width: 100vw;
		height: 100vh;
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}

	.map-viewport-wrapper {
		position: relative;
		flex: 1;
		width: 100%;
		height: 100%;
		overflow: hidden;
	}

	.map-app-shell.is-embed :global(.top-nav) {
		display: none;
	}

	.map-app-shell.is-embed :global(.map-sidebar) {
		top: 0;
	}

	.embed-expand-btn {
		position: absolute;
		top: 12px;
		right: 12px;
		z-index: 40;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		background: rgba(15, 23, 42, 0.88);
		backdrop-filter: blur(8px);
		border: 1px solid rgba(255, 255, 255, 0.16);
		color: #e2e8f0;
		padding: 7px 12px;
		border-radius: 8px;
		font-size: 12px;
		font-weight: 600;
		text-decoration: none;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.45);
		transition: all 0.15s ease;
	}

	.embed-expand-btn:hover {
		background: rgba(30, 41, 59, 0.96);
		border-color: rgba(56, 189, 248, 0.5);
		color: #38bdf8;
		transform: translateY(-1px);
	}
</style>
