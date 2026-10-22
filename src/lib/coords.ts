import type { MapMetadata, ViewportState } from './types';

export const DEFAULT_META: MapMetadata = {
	id: 'world-map',
	name: 'World Map',
	width: 768,
	height: 960,
	originX: -192,
	originZ: -448,
	chunkSize: 32,
	waterLevel: -2.5,
	spawnPoint: { x: 384.5, z: 576.5 }
};

/**
 * Converts tile coordinates (0..width, 0..height) to game world coordinates (x, z)
 */
export function tileToWorld(
	tileX: number,
	tileZ: number,
	meta: MapMetadata = DEFAULT_META
): { x: number; z: number } {
	return {
		x: Math.round(tileX + meta.originX),
		z: Math.round(tileZ + meta.originZ)
	};
}

/**
 * Converts game world coordinates (x, z) to map tile coordinates
 */
export function worldToTile(
	worldX: number,
	worldZ: number,
	meta: MapMetadata = DEFAULT_META
): { x: number; z: number } {
	return {
		x: worldX - meta.originX,
		z: worldZ - meta.originZ
	};
}

/**
 * Converts tile coordinates to screen pixel coordinates
 */
export function tileToScreen(
	tileX: number,
	tileZ: number,
	view: ViewportState
): { x: number; y: number } {
	return {
		x: tileX * view.zoom + view.x,
		y: tileZ * view.zoom + view.y
	};
}

/**
 * Converts screen pixel coordinates to map tile coordinates
 */
export function screenToTile(
	screenX: number,
	screenY: number,
	view: ViewportState
): { x: number; z: number } {
	return {
		x: (screenX - view.x) / view.zoom,
		z: (screenY - view.y) / view.zoom
	};
}

/**
 * Converts screen pixel coordinates directly to game world coordinates
 */
export function screenToWorld(
	screenX: number,
	screenY: number,
	view: ViewportState,
	meta: MapMetadata = DEFAULT_META
): { x: number; z: number } {
	const tile = screenToTile(screenX, screenY, view);
	return tileToWorld(tile.x, tile.z, meta);
}

/**
 * Calculates viewport state to center on a given tile position
 */
export function centerOnTile(
	tileX: number,
	tileZ: number,
	zoom: number,
	viewportWidth: number,
	viewportHeight: number
): ViewportState {
	return {
		zoom,
		x: viewportWidth / 2 - tileX * zoom,
		y: viewportHeight / 2 - tileZ * zoom
	};
}

/**
 * Calculates zoom adjustment anchored to a specific screen position
 */
export function zoomAtScreenPoint(
	view: ViewportState,
	screenX: number,
	screenY: number,
	newZoom: number
): ViewportState {
	const tileX = (screenX - view.x) / view.zoom;
	const tileZ = (screenY - view.y) / view.zoom;
	return {
		zoom: newZoom,
		x: screenX - tileX * newZoom,
		y: screenY - tileZ * newZoom
	};
}

/**
 * Clamps pan/zoom so map cannot be lost outside view
 */
export function clampViewport(
	view: ViewportState,
	meta: MapMetadata,
	viewportWidth: number,
	viewportHeight: number,
	minZoom = 0.5,
	maxZoom = 16.0
): ViewportState {
	const zoom = Math.min(maxZoom, Math.max(minZoom, view.zoom));
	const mapW = meta.width * zoom;
	const mapH = meta.height * zoom;

	// Keep at least 80px or 30% of map in view
	const marginX = Math.min(viewportWidth * 0.4, 200);
	const marginY = Math.min(viewportHeight * 0.4, 200);

	const minX = marginX - mapW;
	const maxX = viewportWidth - marginX;
	const minY = marginY - mapH;
	const maxY = viewportHeight - marginY;

	return {
		zoom,
		x: Math.min(maxX, Math.max(minX, view.x)),
		y: Math.min(maxY, Math.max(minY, view.y))
	};
}
