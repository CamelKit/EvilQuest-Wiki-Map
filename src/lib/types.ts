export interface MapMetadata {
	id: string;
	name: string;
	width: number;
	height: number;
	originX: number;
	originZ: number;
	chunkSize: number;
	waterLevel: number;
	spawnPoint: {
		x: number;
		z: number;
	};
	generatedAt?: number;
	updatedAt?: number;
}

export interface HarvestInfo {
	skill?: string | null;
	action?: string;
	outputItem?: string | null;
	outputItemId?: number | null;
	tool?: string | null;
	reqItem?: string | null;
}

export interface WorldNode {
	id: string;
	name: string;
	category: string;
	subCategory: string;
	assetId: string;
	defId: number;
	x: number; // Tile X: 0..768
	z: number; // Tile Z: 0..960
	y: number;
	floor: number;
	map?: 'surface' | 'underground';
	targetMap?: 'surface' | 'underground';
	targetX?: number;
	targetZ?: number;
	targetLabel?: string;
	harvest?: HarvestInfo;
}

export interface POI {
	id: string;
	name: string;
	icon: string;
	x: number;
	z: number;
	size: number;
	map?: 'surface' | 'underground';
	targetMap?: 'surface' | 'underground';
	targetX?: number;
	targetZ?: number;
	targetLabel?: string;
}

export interface NPCSpawn {
	npcId: number;
	name: string;
	x: number;
	z: number;
	floor: number;
	wanderRange: number;
	map?: 'surface' | 'underground';
}

export interface NodeSubcategory {
	id: string;
	label: string;
	count: number;
	outputItem?: string | null;
	outputItemId?: number | null;
}

export interface NodeCategory {
	id: string;
	name: string;
	icon: string;
	color: string;
	skill?: string | null;
	count: number;
	subcategories: NodeSubcategory[];
}

export interface NodesDataPayload {
	meta: MapMetadata;
	categories: NodeCategory[];
	nodes: WorldNode[];
	pois: POI[];
	npcs: NPCSpawn[];
}

export interface ViewportState {
	x: number; // Screen X offset in px
	y: number; // Screen Y offset in px
	zoom: number; // Zoom scale factor (pixels per tile)
}

export interface SearchResult {
	id: string;
	title: string;
	subtitle: string;
	category: string;
	icon: string;
	x: number; // Tile X
	z: number; // Tile Z
	nodeId?: string;
	poiId?: string;
	isCoord?: boolean;
	map?: 'surface' | 'underground';
}
