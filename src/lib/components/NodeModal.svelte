<script lang="ts">
	import type { WorldNode, POI, NPCSpawn, MapMetadata } from '../types';
	import { tileToWorld } from '../coords';

	let {
		item,
		meta,
		onClose,
		onFocus
	}: {
		item: WorldNode | POI | NPCSpawn | null;
		meta: MapMetadata;
		onClose: () => void;
		onFocus: (x: number, z: number) => void;
	} = $props();

	let copied = $state(false);

	// Determine type of item
	let isNode = $derived(item && 'category' in item);
	let isPOI = $derived(item && 'size' in item);
	let isNPC = $derived(item && 'npcId' in item);

	let node = $derived(isNode ? (item as WorldNode) : null);
	let poi = $derived(isPOI ? (item as POI) : null);
	let npc = $derived(isNPC ? (item as NPCSpawn) : null);

	let coords = $derived(item ? tileToWorld(item.x, item.z, meta) : { x: 0, z: 0 });

	let wikiUrl = $derived.by(() => {
		if (!item) return '';
		if (node?.harvest?.outputItem) {
			return `https://memoriesofmagic.wiki/w/${encodeURIComponent(node.harvest.outputItem)}`;
		}
		if (item.name) {
			return `https://memoriesofmagic.wiki/w/${encodeURIComponent(item.name)}`;
		}
		return 'https://memoriesofmagic.wiki/';
	});

	function handleCopyLink() {
		if (!item) return;
		const url = new URL(window.location.href);
		if (node?.id) {
			url.searchParams.set('node', node.id);
		} else {
			url.searchParams.set('x', coords.x.toString());
			url.searchParams.set('z', coords.z.toString());
			url.searchParams.set('zoom', '4.0');
		}

		navigator.clipboard.writeText(url.toString()).then(() => {
			copied = true;
			setTimeout(() => {
				copied = false;
			}, 2000);
		});
	}
</script>

{#if item}
	<aside class="node-modal" aria-labelledby="node-modal-title">
		<header class="modal-header">
			<div class="title-group">
				{#if node}
					<span class="category-pill {node.category}">
						{node.category.toUpperCase()}
					</span>
				{:else if poi}
					<span class="category-pill poi">POINT OF INTEREST</span>
				{:else if npc}
					<span class="category-pill npc">NPC</span>
				{/if}
				<h2 id="node-modal-title" class="node-name">{item.name}</h2>
			</div>
			<button type="button" class="close-btn" onclick={onClose} aria-label="Close details">
				✕
			</button>
		</header>

		<div class="modal-body">
			<!-- Coordinates section -->
			<div class="info-row coords-row">
				<span class="info-label">Coordinates</span>
				<span class="info-val highlight">
					X: {coords.x}, Z: {coords.z}
					<small class="tile-coords">(Tile {Math.round(item.x)}, {Math.round(item.z)})</small>
				</span>
			</div>

			{#if node}
				<!-- Gathering / Harvest Details -->
				{#if node.harvest}
					{#if node.harvest.skill}
						<div class="info-row">
							<span class="info-label">Skill</span>
							<span class="info-val capitalize">
								{node.harvest.skill}
								{#if node.harvest.action}
									<span class="action-tag">({node.harvest.action})</span>
								{/if}
							</span>
						</div>
					{/if}

					{#if node.harvest.tool}
						<div class="info-row">
							<span class="info-label">Required Tool</span>
							<span class="info-val tool-val">{node.harvest.tool}</span>
						</div>
					{/if}

					{#if node.harvest.outputItem}
						<div class="info-row output-row">
							<span class="info-label">Harvested Item</span>
							<span class="info-val output-item">
								<span class="item-icon">✨</span>
								<a href={wikiUrl} target="_blank" rel="noopener noreferrer" class="wiki-link">
									{node.harvest.outputItem}
								</a>
							</span>
						</div>
					{/if}
				{/if}

				{#if node.subCategory && node.subCategory !== node.category}
					<div class="info-row">
						<span class="info-label">Variety / Type</span>
						<span class="info-val capitalize">{node.subCategory}</span>
					</div>
				{/if}
			{:else if npc}
				<div class="info-row">
					<span class="info-label">Wander Range</span>
					<span class="info-val">{npc.wanderRange} tiles</span>
				</div>
			{/if}
		</div>

		<footer class="modal-footer">
			<button
				type="button"
				class="action-btn primary"
				onclick={() => item && onFocus(item.x, item.z)}
			>
				<svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
					<path fill-rule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clip-rule="evenodd" />
				</svg>
				Center on Map
			</button>

			<a
				href={wikiUrl}
				target="_blank"
				rel="noopener noreferrer"
				class="action-btn wiki"
			>
				<svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
					<path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
					<path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
				</svg>
				Wiki Page
			</a>

			<button
				type="button"
				class="action-btn secondary"
				onclick={handleCopyLink}
			>
				{#if copied}
					<span class="copied-badge">✓ Link Copied!</span>
				{:else}
					<svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
						<path d="M15 8a3 3 0 10-2.977-2.63l-4.94 2.47a3 3 0 100 4.319l4.94 2.47a3 3 0 10.895-1.789l-4.94-2.47a3.027 3.027 0 000-.74l4.94-2.47C13.456 7.68 14.19 8 15 8z" />
					</svg>
					Share Link
				{/if}
			</button>
		</footer>
	</aside>
{/if}

<style>
	.node-modal {
		position: absolute;
		left: 20px;
		bottom: 34px;
		z-index: 35;
		width: 320px;
		max-width: calc(100vw - 40px);
		background: rgba(15, 20, 28, 0.95);
		backdrop-filter: blur(16px);
		-webkit-backdrop-filter: blur(16px);
		border: 1px solid rgba(255, 255, 255, 0.14);
		border-radius: 14px;
		box-shadow: 0 16px 40px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(0, 0, 0, 0.4);
		color: #e2e8f0;
		animation: slideUp 0.18s cubic-bezier(0.16, 1, 0.3, 1);
		overflow: hidden;
	}

	@keyframes slideUp {
		from {
			opacity: 0;
			transform: translateY(12px) scale(0.98);
		}
		to {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}

	.modal-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		padding: 14px 16px 10px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.08);
	}

	.title-group {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.category-pill {
		align-self: flex-start;
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.05em;
		padding: 2px 7px;
		border-radius: 9999px;
		background: rgba(255, 255, 255, 0.1);
		color: #94a3b8;
	}

	.category-pill.tea {
		background: rgba(74, 222, 128, 0.2);
		color: #4ade80;
	}

	.category-pill.mining {
		background: rgba(245, 158, 11, 0.2);
		color: #f59e0b;
	}

	.category-pill.woodcutting {
		background: rgba(202, 138, 4, 0.2);
		color: #eab308;
	}

	.category-pill.fishing {
		background: rgba(56, 189, 248, 0.2);
		color: #38bdf8;
	}

	.category-pill.farming {
		background: rgba(132, 204, 22, 0.2);
		color: #84cc16;
	}

	.category-pill.station {
		background: rgba(251, 146, 60, 0.2);
		color: #fb923c;
	}

	.category-pill.poi {
		background: rgba(168, 85, 247, 0.2);
		color: #c084fc;
	}

	.node-name {
		margin: 0;
		font-size: 16px;
		font-weight: 700;
		color: #f8fafc;
		line-height: 1.25;
	}

	.close-btn {
		background: transparent;
		border: none;
		color: #94a3b8;
		font-size: 16px;
		cursor: pointer;
		width: 24px;
		height: 24px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 6px;
		transition: all 0.15s;
	}

	.close-btn:hover {
		background: rgba(255, 255, 255, 0.1);
		color: #fff;
	}

	.modal-body {
		padding: 12px 16px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		font-size: 13px;
	}

	.info-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}

	.info-label {
		color: #94a3b8;
		font-size: 12px;
	}

	.info-val {
		color: #f1f5f9;
		font-weight: 500;
		text-align: right;
	}

	.info-val.highlight {
		color: #38bdf8;
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		font-weight: 600;
	}

	.tile-coords {
		display: block;
		font-size: 10px;
		color: #64748b;
	}

	.capitalize {
		text-transform: capitalize;
	}

	.action-tag {
		color: #94a3b8;
		font-size: 11px;
	}

	.tool-val {
		color: #fbbf24;
	}

	.output-item {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.wiki-link {
		color: #38bdf8;
		text-decoration: none;
		font-weight: 600;
	}

	.wiki-link:hover {
		text-decoration: underline;
	}

	.modal-footer {
		padding: 10px 16px 14px;
		border-top: 1px solid rgba(255, 255, 255, 0.08);
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
	}

	.action-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		padding: 7px 12px;
		border-radius: 8px;
		font-size: 12px;
		font-weight: 600;
		cursor: pointer;
		text-decoration: none;
		border: 1px solid transparent;
		transition: all 0.15s ease;
	}

	.action-btn.primary {
		grid-column: 1 / -1;
		background: #2563eb;
		color: #ffffff;
		border-color: #3b82f6;
	}

	.action-btn.primary:hover {
		background: #1d4ed8;
	}

	.action-btn.wiki {
		background: rgba(255, 255, 255, 0.08);
		color: #e2e8f0;
		border-color: rgba(255, 255, 255, 0.12);
	}

	.action-btn.wiki:hover {
		background: rgba(255, 255, 255, 0.14);
		color: #ffffff;
	}

	.action-btn.secondary {
		background: rgba(255, 255, 255, 0.05);
		color: #cbd5e1;
		border-color: rgba(255, 255, 255, 0.1);
	}

	.action-btn.secondary:hover {
		background: rgba(255, 255, 255, 0.1);
		color: #ffffff;
	}

	.copied-badge {
		color: #4ade80;
	}
</style>
