<script lang="ts">
	import type { SearchResult } from '../types';

	let {
		searchQuery = $bindable(''),
		searchResults,
		isSearching,
		isSidebarOpen,
		activeFilterCount,
		cursorCoords,
		currentZoom,
		currentMap = 'surface',
		onToggleSidebar,
		onSelectResult,
		onSwitchMap
	}: {
		searchQuery: string;
		searchResults: SearchResult[];
		isSearching: boolean;
		isSidebarOpen: boolean;
		activeFilterCount: number;
		cursorCoords: { x: number; z: number } | null;
		currentZoom: number;
		currentMap?: 'surface' | 'underground';
		onToggleSidebar: () => void;
		onSelectResult: (result: SearchResult) => void;
		onSwitchMap?: (map: 'surface' | 'underground') => void;
	} = $props();

	let selectedIndex = $state(-1);
	let inputRef: HTMLInputElement | null = null;
	let showDropdown = $state(false);

	function handleKeyDown(e: KeyboardEvent) {
		if (!showDropdown || searchResults.length === 0) return;

		if (e.key === 'ArrowDown') {
			e.preventDefault();
			selectedIndex = (selectedIndex + 1) % searchResults.length;
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			selectedIndex = (selectedIndex - 1 + searchResults.length) % searchResults.length;
		} else if (e.key === 'Enter') {
			e.preventDefault();
			if (selectedIndex >= 0 && selectedIndex < searchResults.length) {
				chooseResult(searchResults[selectedIndex]);
			} else if (searchResults.length > 0) {
				chooseResult(searchResults[0]);
			}
		} else if (e.key === 'Escape') {
			showDropdown = false;
			selectedIndex = -1;
		}
	}

	function chooseResult(res: SearchResult) {
		showDropdown = false;
		selectedIndex = -1;
		searchQuery = res.title;
		onSelectResult(res);
	}
</script>

<header class="top-nav" aria-label="Map navigation">
	<!-- Left: Brand / Logo -->
	<div class="brand-group">
		<button
			type="button"
			class="sidebar-toggle-btn {isSidebarOpen ? 'active' : ''}"
			onclick={onToggleSidebar}
			title="Toggle layers menu"
			aria-label="Toggle layers menu"
		>
			<svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18">
				<path fill-rule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clip-rule="evenodd" />
			</svg>
			{#if activeFilterCount > 0}
				<span class="active-badge">{activeFilterCount}</span>
			{/if}
		</button>

		<a href="/" class="brand-link">
			<span class="brand-icon">🗺️</span>
			<span class="brand-title">
				<strong>Memories of Magic</strong>
				<span class="sub-title">Wiki Map</span>
			</span>
		</a>
	</div>

	<!-- Layer Switcher: Surface vs Underground -->
	<div class="layer-switcher-pill" role="tablist" aria-label="Map Elevation Layer">
		<button
			type="button"
			role="tab"
			aria-selected={currentMap === 'surface'}
			class="layer-toggle-btn {currentMap === 'surface' ? 'active surface' : ''}"
			onclick={() => onSwitchMap?.('surface')}
			title="Surface World Map"
		>
			<span class="layer-icon">🌍</span>
			<span class="layer-text">Surface</span>
		</button>
		<button
			type="button"
			role="tab"
			aria-selected={currentMap === 'underground'}
			class="layer-toggle-btn {currentMap === 'underground' ? 'active underground' : ''}"
			onclick={() => onSwitchMap?.('underground')}
			title="The Sultan's Mine (Underground)"
		>
			<span class="layer-icon">⛏️</span>
			<span class="layer-text">Sultan's Mine</span>
		</button>
	</div>

	<!-- Center: Autocomplete Search -->
	<div class="search-container">
		<div class="search-bar">
			<svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16" class="search-icon">
				<path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd" />
			</svg>

			<input
				bind:this={inputRef}
				type="search"
				class="search-input"
				placeholder="Search resources, ores, tea bushes, POIs, NPCs, or coords (e.g. 192, 34)..."
				bind:value={searchQuery}
				onfocus={() => {
					showDropdown = true;
				}}
				onblur={() => {
					setTimeout(() => {
						showDropdown = false;
					}, 200);
				}}
				onkeydown={handleKeyDown}
			/>

			{#if searchQuery}
				<button
					type="button"
					class="clear-search-btn"
					onclick={() => {
						searchQuery = '';
						showDropdown = false;
					}}
					aria-label="Clear search"
				>
					✕
				</button>
			{/if}
		</div>

		<!-- Autocomplete Dropdown -->
		{#if showDropdown && searchResults.length > 0}
			<ul class="search-dropdown" role="listbox">
				{#each searchResults as res, i (res.id)}
					<li role="presentation">
						<button
							type="button"
							class="dropdown-item {selectedIndex === i ? 'selected' : ''}"
							onmousedown={(e) => {
								e.preventDefault();
								chooseResult(res);
							}}
						>
							<span class="item-icon">{res.icon}</span>
							<div class="item-details">
								<span class="item-title">{res.title}</span>
								<span class="item-sub">{res.subtitle}</span>
							</div>
							<span class="item-cat-badge">{res.category}</span>
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</div>

	<!-- Right: Live Coordinates & Wiki Link -->
	<div class="status-group">
		<div class="coord-pill" title="Current Cursor Coordinates & Zoom">
			{#if cursorCoords}
				<span class="coord-text">
					<span class="coord-tag">X</span> {cursorCoords.x}
					<span class="coord-tag">Z</span> {cursorCoords.z}
				</span>
			{:else}
				<span class="coord-hint">Hover map</span>
			{/if}
			<span class="zoom-text">{currentZoom.toFixed(1)}×</span>
		</div>

		<a
			href="https://memoriesofmagic.wiki"
			target="_blank"
			rel="noopener noreferrer"
			class="wiki-btn"
			title="Open Memories of Magic Wiki"
		>
			<span class="wiki-label">Wiki</span>
			<svg viewBox="0 0 20 20" fill="currentColor" width="13" height="13">
				<path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
				<path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
			</svg>
		</a>
	</div>
</header>

<style>
	.top-nav {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 56px;
		background: rgba(13, 17, 23, 0.92);
		backdrop-filter: blur(14px);
		-webkit-backdrop-filter: blur(14px);
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
		z-index: 50;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 16px;
		gap: 16px;
	}

	.brand-group {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.sidebar-toggle-btn {
		position: relative;
		width: 36px;
		height: 36px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(255, 255, 255, 0.08);
		border: 1px solid rgba(255, 255, 255, 0.12);
		color: #e2e8f0;
		border-radius: 8px;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.sidebar-toggle-btn:hover {
		background: rgba(255, 255, 255, 0.15);
		color: #ffffff;
	}

	.sidebar-toggle-btn.active {
		background: #2563eb;
		border-color: #3b82f6;
		color: #ffffff;
	}

	.active-badge {
		position: absolute;
		top: -4px;
		right: -4px;
		background: #ef4444;
		color: #ffffff;
		font-size: 9px;
		font-weight: 700;
		padding: 1px 4px;
		border-radius: 9999px;
		box-shadow: 0 0 0 2px #0d1117;
	}

	.brand-link {
		display: flex;
		align-items: center;
		gap: 9px;
		text-decoration: none;
		color: inherit;
	}

	.brand-icon {
		font-size: 22px;
	}

	.brand-title {
		display: flex;
		flex-direction: column;
		line-height: 1.15;
	}

	.brand-title strong {
		font-size: 14px;
		color: #f8fafc;
		letter-spacing: -0.01em;
	}

	.sub-title {
		font-size: 11px;
		color: #38bdf8;
		font-weight: 600;
	}

	.layer-switcher-pill {
		display: flex;
		align-items: center;
		background: rgba(18, 24, 38, 0.85);
		padding: 3px;
		border-radius: 9999px;
		border: 1px solid rgba(255, 255, 255, 0.12);
		box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.4);
		gap: 2px;
	}

	.layer-toggle-btn {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 4px 12px;
		font-size: 12px;
		font-weight: 600;
		color: #94a3b8;
		border-radius: 9999px;
		border: none;
		background: transparent;
		cursor: pointer;
		transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
		user-select: none;
	}

	.layer-toggle-btn:hover {
		color: #f1f5f9;
		background: rgba(255, 255, 255, 0.08);
	}

	.layer-toggle-btn.active.surface {
		background: #2563eb;
		color: #ffffff;
		box-shadow: 0 1px 6px rgba(37, 99, 235, 0.45);
	}

	.layer-toggle-btn.active.underground {
		background: linear-gradient(135deg, #b45309, #d97706);
		color: #ffffff;
		box-shadow: 0 1px 6px rgba(217, 119, 6, 0.45);
	}

	.layer-icon {
		font-size: 13px;
		line-height: 1;
	}

	.layer-text {
		letter-spacing: 0.01em;
	}

	@media (max-width: 720px) {
		.layer-text {
			display: none;
		}
		.layer-toggle-btn {
			padding: 4px 8px;
		}
	}

	.search-container {
		flex: 1;
		max-width: 580px;
		position: relative;
	}

	.search-bar {
		display: flex;
		align-items: center;
		position: relative;
		background: rgba(0, 0, 0, 0.45);
		border: 1px solid rgba(255, 255, 255, 0.14);
		border-radius: 10px;
		padding: 0 10px;
		transition: border-color 0.15s, box-shadow 0.15s;
	}

	.search-bar:focus-within {
		border-color: #38bdf8;
		box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.25);
	}

	.search-icon {
		color: #94a3b8;
		margin-right: 8px;
		flex-shrink: 0;
	}

	.search-input {
		flex: 1;
		background: transparent;
		border: none;
		color: #f8fafc;
		font-size: 13px;
		padding: 8px 0;
		outline: none;
	}

	.search-input::placeholder {
		color: #64748b;
	}

	.clear-search-btn {
		background: transparent;
		border: none;
		color: #94a3b8;
		cursor: pointer;
		font-size: 13px;
		padding: 4px;
		border-radius: 4px;
	}

	.clear-search-btn:hover {
		color: #ffffff;
	}

	.search-dropdown {
		position: absolute;
		top: calc(100% + 6px);
		left: 0;
		right: 0;
		background: rgba(15, 20, 28, 0.98);
		backdrop-filter: blur(16px);
		-webkit-backdrop-filter: blur(16px);
		border: 1px solid rgba(255, 255, 255, 0.14);
		border-radius: 10px;
		box-shadow: 0 16px 36px rgba(0, 0, 0, 0.7);
		margin: 0;
		padding: 6px;
		list-style: none;
		max-height: 380px;
		overflow-y: auto;
		z-index: 60;
	}

	.dropdown-item {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 10px;
		background: transparent;
		border: none;
		border-radius: 6px;
		text-align: left;
		cursor: pointer;
		color: #e2e8f0;
		transition: background 0.12s;
	}

	.dropdown-item:hover,
	.dropdown-item.selected {
		background: rgba(56, 189, 248, 0.15);
	}

	.item-icon {
		font-size: 16px;
		flex-shrink: 0;
	}

	.item-details {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 2px;
		overflow: hidden;
	}

	.item-title {
		font-size: 13px;
		font-weight: 600;
		color: #f8fafc;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.item-sub {
		font-size: 11px;
		color: #94a3b8;
	}

	.item-cat-badge {
		font-size: 10px;
		text-transform: uppercase;
		font-weight: 700;
		padding: 2px 6px;
		border-radius: 4px;
		background: rgba(255, 255, 255, 0.08);
		color: #cbd5e1;
		flex-shrink: 0;
	}

	.status-group {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.coord-pill {
		display: flex;
		align-items: center;
		gap: 8px;
		background: rgba(0, 0, 0, 0.35);
		border: 1px solid rgba(255, 255, 255, 0.08);
		padding: 5px 10px;
		border-radius: 8px;
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		font-size: 11px;
		color: #cbd5e1;
	}

	.coord-tag {
		color: #64748b;
		font-size: 10px;
		font-weight: 700;
	}

	.coord-text {
		color: #38bdf8;
		font-weight: 600;
	}

	.coord-hint {
		color: #64748b;
	}

	.zoom-text {
		padding-left: 6px;
		border-left: 1px solid rgba(255, 255, 255, 0.1);
		color: #f59e0b;
		font-weight: 600;
	}

	.wiki-btn {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		background: rgba(255, 255, 255, 0.08);
		border: 1px solid rgba(255, 255, 255, 0.12);
		color: #e2e8f0;
		padding: 6px 12px;
		border-radius: 8px;
		font-size: 12px;
		font-weight: 600;
		text-decoration: none;
		transition: all 0.15s ease;
	}

	.wiki-btn:hover {
		background: rgba(255, 255, 255, 0.15);
		color: #ffffff;
	}

	@media (max-width: 768px) {
		.brand-title,
		.wiki-btn,
		.coord-pill {
			display: none;
		}
	}
</style>
