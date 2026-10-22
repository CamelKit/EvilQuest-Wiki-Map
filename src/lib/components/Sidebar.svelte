<script lang="ts">
	import type { NodeCategory } from '../types';

	let {
		categories,
		activeCategories,
		activeSubcategories,
		showPOIs,
		showNPCs,
		isOpen,
		onToggleCategory,
		onToggleSubcategory,
		onTogglePOIs,
		onToggleNPCs,
		onSelectPreset,
		onClose
	}: {
		categories: NodeCategory[];
		activeCategories: Set<string>;
		activeSubcategories: Set<string>;
		showPOIs: boolean;
		showNPCs: boolean;
		isOpen: boolean;
		onToggleCategory: (catId: string) => void;
		onToggleSubcategory: (subcatId: string, catId: string) => void;
		onTogglePOIs: () => void;
		onToggleNPCs: () => void;
		onSelectPreset: (preset: 'all' | 'none' | 'tea' | 'mining' | 'gathering' | 'stations') => void;
		onClose: () => void;
	} = $props();

	let expandedCategories = $state<Set<string>>(new Set(['tea', 'mining']));
	let filterQuery = $state('');

	function toggleExpand(catId: string) {
		const next = new Set(expandedCategories);
		if (next.has(catId)) {
			next.delete(catId);
		} else {
			next.add(catId);
		}
		expandedCategories = next;
	}

	let filteredCategories = $derived.by(() => {
		const q = filterQuery.trim().toLowerCase();
		if (!q) return categories;

		return categories
			.map((cat) => {
				const catMatches = cat.name.toLowerCase().includes(q);
				const matchedSubs = cat.subcategories.filter((s) => s.label.toLowerCase().includes(q));
				if (catMatches || matchedSubs.length > 0) {
					return {
						...cat,
						subcategories: catMatches ? cat.subcategories : matchedSubs
					};
				}
				return null;
			})
			.filter(Boolean) as NodeCategory[];
	});
</script>

<aside class="map-sidebar {isOpen ? 'is-open' : ''}" aria-label="Map layers and filters">
	<header class="sidebar-header">
		<div class="header-title">
			<svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18" class="header-icon">
				<path d="M7 3a1 1 0 000 2h6a1 1 0 100-2H7zM4 7a1 1 0 011-1h10a1 1 0 110 2H5a1 1 0 01-1-1zM2 11a2 2 0 012-2h12a2 2 0 012 2v4a2 2 0 01-2 2H4a2 2 0 01-2-2v-4z" />
			</svg>
			<h2>Layers & Markers</h2>
		</div>
		<button type="button" class="close-btn" onclick={onClose} aria-label="Close sidebar">
			✕
		</button>
	</header>

	<!-- Quick Preset Filter Buttons -->
	<div class="presets-section">
		<div class="preset-buttons">
			<button type="button" class="preset-btn" onclick={() => onSelectPreset('all')}>All</button>
			<button type="button" class="preset-btn" onclick={() => onSelectPreset('none')}>None</button>
			<button type="button" class="preset-btn highlight-tea" onclick={() => onSelectPreset('tea')}>🍵 Tea</button>
			<button type="button" class="preset-btn highlight-mining" onclick={() => onSelectPreset('mining')}>⛏️ Mining</button>
			<button type="button" class="preset-btn" onclick={() => onSelectPreset('gathering')}>🌿 Gathering</button>
			<button type="button" class="preset-btn" onclick={() => onSelectPreset('stations')}>🔥 Stations</button>
		</div>

		<div class="search-wrap">
			<input
				type="search"
				placeholder="Filter categories & resources..."
				bind:value={filterQuery}
				class="filter-input"
			/>
		</div>
	</div>

	<!-- General Overlays (POIs & NPCs) -->
	<section class="section-group">
		<h3 class="section-title">Places & NPCs</h3>
		<div class="category-item">
			<label class="category-label">
				<input
					type="checkbox"
					checked={showPOIs}
					onchange={onTogglePOIs}
					class="checkbox"
				/>
				<span class="cat-icon">🏛️</span>
				<span class="cat-name">Points of Interest</span>
			</label>
			<span class="count-badge">68</span>
		</div>

		<div class="category-item">
			<label class="category-label">
				<input
					type="checkbox"
					checked={showNPCs}
					onchange={onToggleNPCs}
					class="checkbox"
				/>
				<span class="cat-icon">👤</span>
				<span class="cat-name">NPC Spawns</span>
			</label>
			<span class="count-badge">362</span>
		</div>
	</section>

	<!-- Gathering & World Nodes -->
	<section class="section-group">
		<h3 class="section-title">Resource Nodes</h3>
		<div class="category-list">
			{#each filteredCategories as cat (cat.id)}
				{@const isCatActive = activeCategories.has(cat.id)}
				{@const isExpanded = expandedCategories.has(cat.id)}
				<div class="category-block">
					<div class="category-item">
						<label class="category-label">
							<input
								type="checkbox"
								checked={isCatActive}
								onchange={() => onToggleCategory(cat.id)}
								class="checkbox"
							/>
							<span class="cat-icon" style="color: {cat.color}">{cat.icon}</span>
							<span class="cat-name">{cat.name}</span>
						</label>

						<div class="cat-actions">
							<span class="count-badge">{cat.count}</span>
							{#if cat.subcategories.length > 0}
								<button
									type="button"
									class="expand-btn {isExpanded ? 'is-expanded' : ''}"
									onclick={() => toggleExpand(cat.id)}
									aria-label="Toggle subcategories"
								>
									▾
								</button>
							{/if}
						</div>
					</div>

					<!-- Subcategories list -->
					{#if isExpanded && cat.subcategories.length > 0}
						<div class="subcat-list">
							{#each cat.subcategories as sub (sub.id)}
								{@const isSubActive = isCatActive && activeSubcategories.has(sub.id)}
								<div class="subcat-item">
									<label class="subcat-label">
										<input
											type="checkbox"
											checked={isSubActive}
											onchange={() => onToggleSubcategory(sub.id, cat.id)}
											class="checkbox sub-checkbox"
										/>
										<span class="sub-name">{sub.label}</span>
									</label>
									<span class="sub-count">{sub.count}</span>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{/each}
		</div>
	</section>
</aside>

<style>
	.map-sidebar {
		position: absolute;
		top: 56px;
		left: 0;
		bottom: 0;
		width: 310px;
		max-width: calc(100vw - 20px);
		background: rgba(14, 18, 26, 0.94);
		backdrop-filter: blur(16px);
		-webkit-backdrop-filter: blur(16px);
		border-right: 1px solid rgba(255, 255, 255, 0.12);
		z-index: 40;
		display: flex;
		flex-direction: column;
		transform: translateX(-100%);
		transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1);
		box-shadow: 12px 0 32px rgba(0, 0, 0, 0.5);
		color: #e2e8f0;
		overflow: hidden;
	}

	.map-sidebar.is-open {
		transform: translateX(0);
	}

	.sidebar-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 14px 16px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.08);
	}

	.header-title {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.header-icon {
		color: #38bdf8;
	}

	.header-title h2 {
		margin: 0;
		font-size: 15px;
		font-weight: 700;
		color: #f8fafc;
	}

	.close-btn {
		background: transparent;
		border: none;
		color: #94a3b8;
		font-size: 16px;
		cursor: pointer;
		width: 28px;
		height: 28px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 6px;
		transition: all 0.15s;
	}

	.close-btn:hover {
		background: rgba(255, 255, 255, 0.1);
		color: #ffffff;
	}

	.presets-section {
		padding: 12px 14px 10px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.06);
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.preset-buttons {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 6px;
	}

	.preset-btn {
		background: rgba(255, 255, 255, 0.06);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 6px;
		color: #cbd5e1;
		font-size: 11px;
		font-weight: 600;
		padding: 5px 6px;
		cursor: pointer;
		text-align: center;
		transition: all 0.15s;
	}

	.preset-btn:hover {
		background: rgba(255, 255, 255, 0.14);
		color: #ffffff;
	}

	.preset-btn.highlight-tea {
		color: #4ade80;
		border-color: rgba(74, 222, 128, 0.25);
	}

	.preset-btn.highlight-mining {
		color: #f59e0b;
		border-color: rgba(245, 158, 11, 0.25);
	}

	.search-wrap {
		width: 100%;
	}

	.filter-input {
		width: 100%;
		background: rgba(0, 0, 0, 0.35);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 6px;
		color: #f1f5f9;
		font-size: 12px;
		padding: 6px 10px;
		outline: none;
		transition: border-color 0.15s;
		box-sizing: border-box;
	}

	.filter-input:focus {
		border-color: #38bdf8;
	}

	.section-group {
		padding: 10px 14px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.06);
		overflow-y: auto;
	}

	.section-group:last-child {
		flex: 1;
		border-bottom: none;
	}

	.section-title {
		margin: 4px 0 8px 0;
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: #64748b;
		font-weight: 700;
	}

	.category-list {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.category-block {
		display: flex;
		flex-direction: column;
	}

	.category-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 6px 6px;
		border-radius: 6px;
		transition: background 0.12s;
	}

	.category-item:hover {
		background: rgba(255, 255, 255, 0.05);
	}

	.category-label {
		display: flex;
		align-items: center;
		gap: 8px;
		cursor: pointer;
		user-select: none;
		font-size: 13px;
		font-weight: 500;
		flex: 1;
	}

	.cat-icon {
		font-size: 15px;
		width: 20px;
		text-align: center;
	}

	.cat-name {
		color: #f1f5f9;
	}

	.cat-actions {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.count-badge {
		font-size: 11px;
		font-weight: 600;
		color: #94a3b8;
		background: rgba(255, 255, 255, 0.08);
		padding: 1px 6px;
		border-radius: 9999px;
	}

	.expand-btn {
		background: transparent;
		border: none;
		color: #94a3b8;
		cursor: pointer;
		width: 20px;
		height: 20px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 4px;
		font-size: 14px;
		transition: transform 0.15s, color 0.15s;
	}

	.expand-btn.is-expanded {
		transform: rotate(180deg);
		color: #38bdf8;
	}

	.subcat-list {
		display: flex;
		flex-direction: column;
		margin-left: 28px;
		padding: 2px 0 6px 4px;
		border-left: 1px solid rgba(255, 255, 255, 0.1);
		gap: 2px;
	}

	.subcat-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 4px 6px;
		border-radius: 4px;
	}

	.subcat-item:hover {
		background: rgba(255, 255, 255, 0.04);
	}

	.subcat-label {
		display: flex;
		align-items: center;
		gap: 6px;
		cursor: pointer;
		user-select: none;
		font-size: 12px;
		color: #cbd5e1;
		flex: 1;
	}

	.sub-count {
		font-size: 10px;
		color: #64748b;
	}

	.checkbox {
		appearance: none;
		-webkit-appearance: none;
		width: 15px;
		height: 15px;
		border: 1px solid rgba(255, 255, 255, 0.25);
		border-radius: 4px;
		background: rgba(0, 0, 0, 0.3);
		cursor: pointer;
		display: inline-grid;
		place-content: center;
		transition: all 0.12s;
	}

	.checkbox:checked {
		background: #2563eb;
		border-color: #3b82f6;
	}

	.checkbox:checked::before {
		content: '';
		width: 7px;
		height: 7px;
		background: #fff;
		border-radius: 1px;
	}

	.checkbox.sub-checkbox {
		width: 13px;
		height: 13px;
	}

	.checkbox.sub-checkbox:checked::before {
		width: 5px;
		height: 5px;
	}
</style>
