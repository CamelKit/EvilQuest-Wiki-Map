<script lang="ts">
	let {
		zoom = 2.0,
		minZoom = 0.5,
		maxZoom = 16.0,
		onZoomIn,
		onZoomOut,
		onResetView,
		onToggleFullscreen
	}: {
		zoom: number;
		minZoom?: number;
		maxZoom?: number;
		onZoomIn: () => void;
		onZoomOut: () => void;
		onResetView: () => void;
		onToggleFullscreen?: () => void;
	} = $props();

	let percentage = $derived(
		Math.round(
			((Math.log(zoom) - Math.log(minZoom)) / (Math.log(maxZoom) - Math.log(minZoom))) * 100
		)
	);
</script>

<div class="zoom-controls" role="group" aria-label="Map zoom controls">
	<button
		type="button"
		class="ctrl-btn"
		title="Zoom in (+)"
		aria-label="Zoom in"
		onclick={onZoomIn}
		disabled={zoom >= maxZoom - 0.05}
	>
		<svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
			<path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" />
		</svg>
	</button>

	<div class="zoom-slider-track" title="Zoom: {zoom.toFixed(1)}x">
		<div class="zoom-slider-fill" style="height: {Math.max(5, Math.min(100, percentage))}%"></div>
	</div>

	<button
		type="button"
		class="ctrl-btn"
		title="Zoom out (-)"
		aria-label="Zoom out"
		onclick={onZoomOut}
		disabled={zoom <= minZoom + 0.05}
	>
		<svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
			<path fill-rule="evenodd" d="M3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clip-rule="evenodd" />
		</svg>
	</button>

	<div class="divider"></div>

	<button
		type="button"
		class="ctrl-btn"
		title="Fit whole map (0)"
		aria-label="Fit whole map"
		onclick={onResetView}
	>
		<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15">
			<path stroke-linecap="round" stroke-linejoin="round" d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4" />
		</svg>
	</button>

	{#if onToggleFullscreen}
		<button
			type="button"
			class="ctrl-btn"
			title="Toggle fullscreen (F)"
			aria-label="Toggle fullscreen"
			onclick={onToggleFullscreen}
		>
			<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15">
				<path stroke-linecap="round" stroke-linejoin="round" d="M4 4h4v2H6v2H4V4zm12 0h-4v2h2v2h2V4zM4 16h4v-2H6v-2H4v4zm12 0h-4v-2h2v-2h2v4z" />
			</svg>
		</button>
	{/if}
</div>

<style>
	.zoom-controls {
		position: absolute;
		right: 18px;
		bottom: 38px;
		z-index: 30;
		display: flex;
		flex-direction: column;
		align-items: center;
		background: rgba(18, 22, 30, 0.88);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 10px;
		padding: 4px;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.45);
		user-select: none;
	}

	.ctrl-btn {
		width: 34px;
		height: 34px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		border: none;
		color: #e2e8f0;
		border-radius: 6px;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.ctrl-btn:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.12);
		color: #38bdf8;
	}

	.ctrl-btn:active:not(:disabled) {
		background: rgba(56, 189, 248, 0.2);
		transform: scale(0.95);
	}

	.ctrl-btn:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}

	.zoom-slider-track {
		width: 4px;
		height: 48px;
		background: rgba(255, 255, 255, 0.12);
		border-radius: 2px;
		margin: 4px 0;
		position: relative;
		overflow: hidden;
		display: flex;
		flex-direction: column-reverse;
	}

	.zoom-slider-fill {
		width: 100%;
		background: #38bdf8;
		border-radius: 2px;
		transition: height 0.1s ease-out;
	}

	.divider {
		width: 22px;
		height: 1px;
		background: rgba(255, 255, 255, 0.1);
		margin: 3px 0;
	}
</style>
