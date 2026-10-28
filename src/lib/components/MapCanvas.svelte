<script lang="ts">
	import { onMount } from "svelte";
	import type {
		MapMetadata,
		WorldNode,
		POI,
		NPCSpawn,
		ViewportState,
	} from "../types";
	import { SpatialGrid } from "../spatial";
	import {
		tileToWorld,
		worldToTile,
		screenToTile,
		zoomAtScreenPoint,
		clampViewport,
		DEFAULT_META,
	} from "../coords";

	let {
		meta = DEFAULT_META,
		nodes = [],
		pois = [],
		npcs = [],
		activeCategories,
		activeSubcategories,
		showPOIs = true,
		showNPCs = false,
		currentMap = "surface",
		selectedItem = null,
		view = $bindable({ x: 0, y: 0, zoom: 2.0 }),
		cursorCoords = $bindable(null),
		onSelectItem,
	}: {
		meta?: MapMetadata;
		nodes: WorldNode[];
		pois: POI[];
		npcs: NPCSpawn[];
		activeCategories: Set<string>;
		activeSubcategories: Set<string>;
		showPOIs: boolean;
		showNPCs: boolean;
		currentMap?: "surface" | "underground";
		selectedItem: WorldNode | POI | NPCSpawn | null;
		view: ViewportState;
		cursorCoords: { x: number; z: number } | null;
		onSelectItem: (item: WorldNode | POI | NPCSpawn | null) => void;
	} = $props();

	let canvasRef: HTMLCanvasElement | null = null;
	let containerRef: HTMLDivElement | null = null;

	let baseImage: HTMLImageElement | null = null;
	let isBaseImageLoaded = $state(false);
	let undergroundImage: HTMLImageElement | null = null;
	let isUndergroundImageLoaded = $state(false);

	let oreSprites: HTMLImageElement | null = null;
	let treeSprites: HTMLImageElement | null = null;
	const poiImages = new Map<string, HTMLImageElement>();
	let imagesLoadedCount = $state(0);

	// Spatial index
	const nodeGrid = new SpatialGrid<WorldNode>(16);
	const poiGrid = new SpatialGrid<POI>(32);
	const npcGrid = new SpatialGrid<NPCSpawn>(16);

	let hoveredItem = $state<WorldNode | POI | NPCSpawn | null>(null);
	let tooltipPos = $state<{ x: number; y: number } | null>(null);

	// Animation frame
	let animFrameId: number | null = null;
	let isDragging = $state(false);

	// Gesture tracking
	const pointers = new Map<number, { x: number; y: number }>();
	let dragStart = { x: 0, y: 0, viewX: 0, viewY: 0, moved: false };
	let lastVelocity = { vx: 0, vy: 0, time: 0 };
	let pinchStart = { dist: 0, midX: 0, midY: 0, zoom: 1 };

	const POI_ICON_FILENAMES = [
		"Agility_Icon_Small.png",
		"Anvil_Icon_Small.png",
		"Armour_Store_Icon_Small.png",
		"Bank_Icon_Small.png",
		"Cooking_Range_Icon_Small.png",
		"Dungeon_Icon.png",
		"Evil_Magic_Altar_Icon_v2.png",
		"Fish_Icon.png",
		"Furnace_Icon.png",
		"Good_Magic_Altar_Icon_Blue_v2.png",
		"Mining_Icon_Small.png",
		"Pub_Icon.png",
		"Water_Icon.png",
		"Weapon_Store_Icon_Small.png",
		"Woodcutting_Icon_Small-2.png",
		"quest icon.png",
	];

	// Region labels in official World Coordinates (matching hover cursor coordinates and in-game locations)
	const SURFACE_REGION_LABELS = [
		{ name: "WIBERGIS", x: 78, z: 27 },
		{ name: "CASTLE MUD", x: 260, z: 156 },
		{ name: "GRAVEYARD", x: 323, z: 127 },
		{ name: "SWAMP", x: 338, z: 17 },
		{ name: "WORMER", x: 448, z: -318 },
		{ name: "ICEBOUND WILDERNESS", x: 215, z: -322 },
		{ name: "ASHEN CALDERA", x: 409, z: -322 },
		{ name: "RIVEN VILLAGE VALLEY", x: 312, z: -322 },
		{ name: "DESERT", x: 204, z: 347 },
		{ name: "DEEP DESERT", x: 232, z: 397 },
	];

	const UNDERGROUND_REGION_LABELS = [
		{ name: "THE SULTAN'S MINE", x: 115, z: 82 },
		{ name: "DEEP MITHRIL VEIN", x: 140, z: 100 },
		{ name: "SULTAN'S VAULT", x: 147, z: 130 },
		{ name: "MINE ENTRANCE", x: 115, z: 162 },
	];

	// Reactive dimensions and coordinate space based on active map
	let activeMeta = $derived<MapMetadata>(
		currentMap === "underground"
			? {
					...meta,
					width: 256,
					height: 192,
					originX: 0,
					originZ: 0,
				}
			: meta,
	);

	// Update spatial index when data or active map changes
	$effect(() => {
		const filtered = nodes.filter(
			(n) => (n.map ?? "surface") === currentMap,
		);
		nodeGrid.load(filtered);
	});
	$effect(() => {
		const filtered = pois.filter(
			(p) => (p.map ?? "surface") === currentMap,
		);
		poiGrid.load(filtered);
	});
	$effect(() => {
		const filtered = npcs.filter(
			(n) => (n.map ?? "surface") === currentMap,
		);
		npcGrid.load(filtered);
	});

	// Trigger render on view, selection, filter, layer, or image changes
	$effect(() => {
		const _v = view.x + view.y + view.zoom;
		const _map = currentMap;
		const _sel = selectedItem?.x ?? 0;
		const _hov = hoveredItem?.x ?? 0;
		const _cats = activeCategories.size;
		const _subs = activeSubcategories.size;
		const _poi = showPOIs;
		const _npc = showNPCs;
		const _loaded = isBaseImageLoaded;
		const _ugLoaded = isUndergroundImageLoaded;
		const _imgCount = imagesLoadedCount;

		requestAnimationFrame(drawMap);
	});

	onMount(() => {
		// 1. Load base WebP image
		const img = new Image();
		img.src = "/images/world_map.webp";
		img.onload = () => {
			baseImage = img;
			isBaseImageLoaded = true;
			if (containerRef && view.x === 0 && view.y === 0) {
				resetToFit();
			}
			requestAnimationFrame(drawMap);
		};

		// 1b. Load underground WebP image
		const ugImg = new Image();
		ugImg.src = "/images/maps/the_sultans_mine.webp";
		ugImg.onload = () => {
			undergroundImage = ugImg;
			isUndergroundImageLoaded = true;
			requestAnimationFrame(drawMap);
		};

		// 2. Load ore and tree spritesheets
		const ores = new Image();
		ores.src = "/sprites/ore-sprites.png";
		ores.onload = () => {
			oreSprites = ores;
			imagesLoadedCount++;
			requestAnimationFrame(drawMap);
		};

		const trees = new Image();
		trees.src = "/sprites/tree-sprites.png";
		trees.onload = () => {
			treeSprites = trees;
			imagesLoadedCount++;
			requestAnimationFrame(drawMap);
		};

		// 3. Preload all official POI icons
		for (const filename of POI_ICON_FILENAMES) {
			const iconImg = new Image();
			iconImg.src = `/icons/${filename}`;
			iconImg.onload = () => {
				poiImages.set(filename, iconImg);
				imagesLoadedCount++;
				requestAnimationFrame(drawMap);
			};
		}

		// Resize observer
		const ro = new ResizeObserver(() => {
			handleResize();
		});
		if (containerRef) {
			ro.observe(containerRef);
		}

		return () => {
			ro.disconnect();
			if (animFrameId) cancelAnimationFrame(animFrameId);
		};
	});

	function handleResize() {
		if (!canvasRef || !containerRef) return;
		const rect = containerRef.getBoundingClientRect();
		const dpr = window.devicePixelRatio || 1;
		canvasRef.width = Math.round(rect.width * dpr);
		canvasRef.height = Math.round(rect.height * dpr);
		canvasRef.style.width = `${rect.width}px`;
		canvasRef.style.height = `${rect.height}px`;
		requestAnimationFrame(drawMap);
	}

	export function resetToFit() {
		if (!containerRef) return;
		const rect = containerRef.getBoundingClientRect();
		const scaleX = (rect.width * 0.95) / activeMeta.width;
		const scaleY = (rect.height * 0.95) / activeMeta.height;
		const fitZoom = Math.min(scaleX, scaleY);

		view = {
			zoom: fitZoom,
			x: (rect.width - activeMeta.width * fitZoom) / 2,
			y: (rect.height - activeMeta.height * fitZoom) / 2,
		};
	}

	export function flyTo(tileX: number, tileZ: number, targetZoom = 5.0) {
		if (!containerRef) return;
		const rect = containerRef.getBoundingClientRect();
		const startX = view.x;
		const startY = view.y;
		const startZoom = view.zoom;

		const endZoom = Math.max(targetZoom, view.zoom);
		const endX = rect.width / 2 - tileX * endZoom;
		const endY = rect.height / 2 - tileZ * endZoom;

		const startTime = performance.now();
		const duration = 400;

		function animate(now: number) {
			const elapsed = now - startTime;
			const t = Math.min(1, elapsed / duration);
			const ease = 1 - Math.pow(1 - t, 3);

			view = {
				zoom: startZoom + (endZoom - startZoom) * ease,
				x: startX + (endX - startX) * ease,
				y: startY + (endY - startY) * ease,
			};

			if (t < 1) {
				animFrameId = requestAnimationFrame(animate);
			}
		}

		if (animFrameId) cancelAnimationFrame(animFrameId);
		animFrameId = requestAnimationFrame(animate);
	}

	// Helper: Tree sprite index from official code $(e)
	function getTreeSpriteIndex(assetId: string): number {
		const a = assetId.toLowerCase();
		if (a.includes("dead") || a.includes("dying")) return 6;
		if (a.includes("palm")) return 7;
		if (a.includes("willow")) return 2;
		if (a.includes("autumn")) return 3;
		if (a.includes("maple")) return 4;
		if (a.includes("mystic")) return 8;
		if (a.includes("yew")) return 5;
		if (a.includes("oak")) return 1;
		return 0; // pine
	}

	// Helper: Ore sprite index from official code k(e)
	function getOreSpriteIndex(assetId: string, subCategory: string): number {
		const a = (assetId + " " + subCategory).toLowerCase();
		if (a.includes("clay")) return 0;
		if (a.includes("copper")) return 1;
		if (a.includes("tin")) return 2;
		if (a.includes("iron")) return 3;
		if (a.includes("coal")) return 4;
		if (a.includes("silver")) return 5;
		if (a.includes("gold")) return 6;
		if (a.includes("mithril")) return 7;
		return 8; // runite / malachite / crimsonite / adamant
	}

	// Helper: Color for specific tea variety
	function getTeaBushColor(subCategory: string): string {
		const sub = subCategory.toLowerCase();
		if (sub.includes("cinderleaf") || sub.includes("askaline"))
			return "#f97316";
		if (sub.includes("rimeheart") || sub.includes("isvaldine"))
			return "#38bdf8";
		if (sub.includes("snowbud") || sub.includes("solfrost"))
			return "#93c5fd";
		if (sub.includes("copperleaf") || sub.includes("gurba"))
			return "#d97706";
		if (sub.includes("mistleaf") || sub.includes("kawaki"))
			return "#34d399";
		if (sub.includes("starbloom") || sub.includes("zodoco"))
			return "#a855f7";
		if (sub.includes("dunethorn") || sub.includes("humpleaf"))
			return "#eab308";
		if (sub.includes("moonleaf") || sub.includes("lox")) return "#818cf8";
		if (sub.includes("lanternleaf") || sub.includes("quibo"))
			return "#facc15";
		return "#22c55e"; // kalo / default
	}

	// Helper: Map interactive node to official POI icon file if applicable
	function getNodeIconFile(node: WorldNode): string | null {
		if (node.category === "bank") return "Bank_Icon_Small.png";
		if (node.category === "fishing") return "Fish_Icon.png";
		if (node.category === "water") return "Water_Icon.png";
		if (node.category === "entrance") return "Dungeon_Icon.png";
		if (node.category === "station") {
			const sub = (node.subCategory || "").toLowerCase();
			if (sub.includes("anvil")) return "Anvil_Icon_Small.png";
			if (sub.includes("furnace") || sub.includes("forge"))
				return "Furnace_Icon.png";
			if (sub.includes("range") || sub.includes("cooking"))
				return "Cooking_Range_Icon_Small.png";
			if (sub.includes("altar"))
				return "Good_Magic_Altar_Icon_Blue_v2.png";
		}
		return null;
	}

	// Helper: Crop accent color
	function getCropColor(subCategory: string): string {
		const s = subCategory.toLowerCase();
		if (s.includes("wheat")) return "#facc15";
		if (s.includes("potato")) return "#fb923c";
		if (s.includes("rice")) return "#a3e635";
		if (s.includes("flax")) return "#38bdf8";
		if (s.includes("cauliflower")) return "#86efac";
		return "#84cc16";
	}

	// Draw 3x3 sprite (tree or ore)
	function drawSprite(
		ctx: CanvasRenderingContext2D,
		img: HTMLImageElement,
		index: number,
		x: number,
		z: number,
		size: number,
		anchorY: number,
	) {
		const o = img.naturalWidth / 3;
		const s = img.naturalHeight / 3;
		const col = index % 3;
		const row = Math.floor(index / 3);

		ctx.drawImage(
			img,
			col * o,
			row * s,
			o,
			s,
			x - size / 2,
			z - size * anchorY,
			size,
			size,
		);
	}

	function drawMap() {
		if (!canvasRef || !containerRef || !baseImage) return;
		const ctx = canvasRef.getContext("2d");
		if (!ctx) return;

		const dpr = window.devicePixelRatio || 1;
		const rect = containerRef.getBoundingClientRect();
		const w = rect.width;
		const h = rect.height;

		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.clearRect(0, 0, canvasRef.width, canvasRef.height);

		// Transform to tile coordinates
		ctx.setTransform(
			dpr * view.zoom,
			0,
			0,
			dpr * view.zoom,
			dpr * view.x,
			dpr * view.y,
		);

		// 1. Draw base terrain map
		ctx.imageSmoothingEnabled = true;
		ctx.imageSmoothingQuality = "high";
		const activeMap =
			currentMap === "underground"
				? undergroundImage || baseImage
				: baseImage;
		if (activeMap) {
			ctx.drawImage(activeMap, 0, 0, activeMeta.width, activeMeta.height);
		}

		const invZoom = 1 / view.zoom;

		// Visible bounding box in tile space (with padding for large tree sprites)
		const minX = Math.max(0, -view.x / view.zoom - 6);
		const maxX = Math.min(activeMeta.width, (w - view.x) / view.zoom + 6);
		const minZ = Math.max(0, -view.y / view.zoom - 6);
		const maxZ = Math.min(activeMeta.height, (h - view.y) / view.zoom + 6);

		// 2. Draw NPCs (Dots exactly matching official map style)
		if (showNPCs && view.zoom >= 2.0) {
			const visibleNPCs = npcGrid.query(minX, minZ, maxX, maxZ);
			const radius = 3.5 * invZoom;

			ctx.fillStyle = "#e5b94f";
			ctx.strokeStyle = "rgba(27, 16, 5, 0.9)";
			ctx.lineWidth = 1.2 * invZoom;

			for (const npc of visibleNPCs) {
				const isSelected = selectedItem === npc;
				const isHovered = hoveredItem === npc;

				if (isSelected || isHovered) {
					ctx.beginPath();
					ctx.arc(npc.x, npc.z, radius * 2.2, 0, Math.PI * 2);
					ctx.fillStyle = isSelected
						? "rgba(56, 189, 248, 0.4)"
						: "rgba(255, 255, 255, 0.25)";
					ctx.fill();
					ctx.fillStyle = "#e5b94f";
				}

				ctx.beginPath();
				ctx.arc(npc.x, npc.z, radius, 0, Math.PI * 2);
				ctx.fill();
				ctx.stroke();

				// NPC Name label at close zoom
				if (view.zoom >= 6.0) {
					ctx.save();
					ctx.font = `600 ${Math.max(10 * invZoom, 1.6)}px Inter, sans-serif`;
					ctx.textAlign = "center";
					ctx.textBaseline = "bottom";
					ctx.strokeStyle = "rgba(0, 0, 0, 0.9)";
					ctx.lineWidth = 2.4 * invZoom;
					ctx.strokeText(
						npc.name,
						npc.x,
						npc.z - radius - 1.5 * invZoom,
					);
					ctx.fillStyle = "#fef08a";
					ctx.fillText(
						npc.name,
						npc.x,
						npc.z - radius - 1.5 * invZoom,
					);
					ctx.restore();
				}
			}
		}

		// 3. Draw Resource Nodes
		const visibleNodes = nodeGrid.query(minX, minZ, maxX, maxZ);

		// Sort nodes so items with higher Z draw in front (proper isometric depth overlap)
		visibleNodes.sort((a, b) => a.z - b.z);

		for (const node of visibleNodes) {
			if (!activeCategories.has(node.category)) continue;
			if (node.subCategory && !activeSubcategories.has(node.subCategory))
				continue;

			const isSelected = selectedItem === node;
			const isHovered = hoveredItem === node;

			// A. TREES (Using official tree-sprites.png)
			if (node.category === "woodcutting") {
				const treeSize = 4.2; // tiles
				if (treeSprites && view.zoom >= 1.6) {
					if (isSelected || isHovered) {
						ctx.save();
						ctx.beginPath();
						ctx.ellipse(
							node.x,
							node.z,
							treeSize * 0.45,
							treeSize * 0.25,
							0,
							0,
							Math.PI * 2,
						);
						ctx.fillStyle = isSelected
							? "rgba(56, 189, 248, 0.45)"
							: "rgba(255, 255, 255, 0.3)";
						ctx.fill();
						ctx.strokeStyle = isSelected ? "#38bdf8" : "#ffffff";
						ctx.lineWidth = 1.5 * invZoom;
						ctx.stroke();
						ctx.restore();
					}

					const spriteIdx = getTreeSpriteIndex(node.assetId);
					drawSprite(
						ctx,
						treeSprites,
						spriteIdx,
						node.x,
						node.z,
						treeSize,
						0.88,
					);
				} else if (isSelected || isHovered) {
					ctx.beginPath();
					ctx.arc(node.x, node.z, 4 * invZoom, 0, Math.PI * 2);
					ctx.fillStyle = isSelected ? "#38bdf8" : "#ffffff";
					ctx.fill();
				}
				continue;
			}

			// B. MINING ROCKS (Using official ore-sprites.png)
			if (node.category === "mining") {
				const oreSize = 3.6; // tiles
				if (oreSprites && view.zoom >= 1.6) {
					if (isSelected || isHovered) {
						ctx.save();
						ctx.beginPath();
						ctx.ellipse(
							node.x,
							node.z,
							oreSize * 0.42,
							oreSize * 0.24,
							0,
							0,
							Math.PI * 2,
						);
						ctx.fillStyle = isSelected
							? "rgba(56, 189, 248, 0.45)"
							: "rgba(255, 255, 255, 0.3)";
						ctx.fill();
						ctx.strokeStyle = isSelected ? "#38bdf8" : "#ffffff";
						ctx.lineWidth = 1.5 * invZoom;
						ctx.stroke();
						ctx.restore();
					}

					const spriteIdx = getOreSpriteIndex(
						node.assetId,
						node.subCategory,
					);
					drawSprite(
						ctx,
						oreSprites,
						spriteIdx,
						node.x,
						node.z,
						oreSize,
						0.72,
					);
				} else if (isSelected || isHovered) {
					ctx.beginPath();
					ctx.arc(node.x, node.z, 4 * invZoom, 0, Math.PI * 2);
					ctx.fillStyle = isSelected ? "#38bdf8" : "#ffffff";
					ctx.fill();
				}
				continue;
			}

			// C. NODES WITH OFFICIAL POI ICONS (Stations, Banks, Fishing, Water, Dungeons)
			const iconFile = getNodeIconFile(node);
			if (iconFile && poiImages.has(iconFile)) {
				const img = poiImages.get(iconFile)!;
				const iconPx = isSelected || isHovered ? 26 : 22;
				const iconSize = iconPx * invZoom;

				// Circular backdrop & ring matching official .world-map-poi
				ctx.save();
				ctx.beginPath();
				ctx.arc(
					node.x,
					node.z,
					iconSize / 2 + 1.2 * invZoom,
					0,
					Math.PI * 2,
				);
				ctx.fillStyle = isSelected
					? "rgba(56, 189, 248, 0.65)"
					: isHovered
						? "rgba(15, 23, 42, 0.85)"
						: "rgba(10, 13, 16, 0.65)";
				ctx.fill();
				ctx.strokeStyle = isSelected
					? "#38bdf8"
					: isHovered
						? "#f59e0b"
						: "rgba(255, 255, 255, 0.25)";
				ctx.lineWidth = (isSelected || isHovered ? 2.0 : 1.2) * invZoom;
				ctx.stroke();

				ctx.drawImage(
					img,
					node.x - iconSize / 2,
					node.z - iconSize / 2,
					iconSize,
					iconSize,
				);
				ctx.restore();
				continue;
			}

			// D. TEA BUSHES (Custom sculpted tea leaf badge with variety colors)
			if (node.category === "tea") {
				if (
					view.zoom >= 1.8 ||
					isSelected ||
					isHovered ||
					activeCategories.size <= 2
				) {
					const teaColor = getTeaBushColor(node.subCategory);
					const radius =
						(isHovered || isSelected ? 6.5 : 5.0) * invZoom;

					if (isSelected || isHovered) {
						ctx.beginPath();
						ctx.arc(
							node.x,
							node.z,
							(isSelected ? 11 : 8.5) * invZoom,
							0,
							Math.PI * 2,
						);
						ctx.fillStyle = isSelected
							? "rgba(56, 189, 248, 0.4)"
							: "rgba(255, 255, 255, 0.25)";
						ctx.fill();
						ctx.strokeStyle = isSelected ? "#38bdf8" : "#ffffff";
						ctx.lineWidth = 1.6 * invZoom;
						ctx.stroke();
					}

					// Badge background
					ctx.beginPath();
					ctx.arc(node.x, node.z, radius, 0, Math.PI * 2);
					ctx.fillStyle = "#0f172a";
					ctx.fill();
					ctx.strokeStyle = teaColor;
					ctx.lineWidth = 1.8 * invZoom;
					ctx.stroke();

					// Sculpted leaf in center
					ctx.save();
					ctx.translate(node.x, node.z);
					ctx.fillStyle = teaColor;
					const s = radius * 0.55;
					ctx.beginPath();
					ctx.moveTo(0, -s);
					ctx.quadraticCurveTo(s * 1.2, 0, 0, s);
					ctx.quadraticCurveTo(-s * 1.2, 0, 0, -s);
					ctx.fill();
					ctx.restore();
				}
				continue;
			}

			// E. FARMING CROPS
			if (node.category === "farming") {
				if (
					view.zoom >= 2.2 ||
					isSelected ||
					isHovered ||
					activeCategories.size <= 2
				) {
					const cropColor = getCropColor(node.subCategory);
					const radius =
						(isHovered || isSelected ? 6 : 4.5) * invZoom;

					if (isSelected || isHovered) {
						ctx.beginPath();
						ctx.arc(
							node.x,
							node.z,
							(isSelected ? 10 : 8) * invZoom,
							0,
							Math.PI * 2,
						);
						ctx.fillStyle = isSelected
							? "rgba(56, 189, 248, 0.4)"
							: "rgba(255, 255, 255, 0.25)";
						ctx.fill();
					}

					ctx.beginPath();
					ctx.arc(node.x, node.z, radius, 0, Math.PI * 2);
					ctx.fillStyle = "#141c2b";
					ctx.fill();
					ctx.strokeStyle = cropColor;
					ctx.lineWidth = 1.5 * invZoom;
					ctx.stroke();

					ctx.beginPath();
					ctx.arc(node.x, node.z, radius * 0.4, 0, Math.PI * 2);
					ctx.fillStyle = cropColor;
					ctx.fill();
				}
				continue;
			}

			// F. CHESTS
			if (node.category === "chest") {
				if (
					view.zoom >= 2.0 ||
					isSelected ||
					isHovered ||
					activeCategories.size <= 2
				) {
					const chestColor = node.name.toLowerCase().includes("gold")
						? "#fbbf24"
						: node.name.toLowerCase().includes("bronze")
							? "#cd7f32"
							: "#94a3b8";
					const size = (isHovered || isSelected ? 12 : 9) * invZoom;

					if (isSelected || isHovered) {
						ctx.beginPath();
						ctx.arc(
							node.x,
							node.z,
							(isSelected ? 11 : 8.5) * invZoom,
							0,
							Math.PI * 2,
						);
						ctx.fillStyle = isSelected
							? "rgba(56, 189, 248, 0.4)"
							: "rgba(255, 255, 255, 0.25)";
						ctx.fill();
					}

					ctx.fillStyle = "#1c1917";
					ctx.strokeStyle = chestColor;
					ctx.lineWidth = 1.4 * invZoom;
					ctx.fillRect(
						node.x - size / 2,
						node.z - size / 2,
						size,
						size,
					);
					ctx.strokeRect(
						node.x - size / 2,
						node.z - size / 2,
						size,
						size,
					);

					ctx.fillStyle = chestColor;
					ctx.fillRect(
						node.x - size * 0.15,
						node.z - size * 0.15,
						size * 0.3,
						size * 0.3,
					);
				}
				continue;
			}

			// G. FALLBACK NODE (Other categories)
			if (view.zoom >= 2.5 || isSelected || isHovered) {
				const fallbackColor = "#94a3b8";
				const r = (isHovered || isSelected ? 5.5 : 4.0) * invZoom;
				ctx.beginPath();
				ctx.arc(node.x, node.z, r, 0, Math.PI * 2);
				ctx.fillStyle = fallbackColor;
				ctx.fill();
				ctx.strokeStyle = "rgba(15, 23, 42, 0.9)";
				ctx.lineWidth = 1.2 * invZoom;
				ctx.stroke();
			}
		}

		// 4. Draw POIs (Using official PNG icons with circular badge styling matching .world-map-poi)
		if (showPOIs) {
			const visiblePOIs = poiGrid.query(minX, minZ, maxX, maxZ);

			for (const p of visiblePOIs) {
				const isSelected = selectedItem === p;
				const isHovered = hoveredItem === p;

				const img = poiImages.get(p.icon);
				const iconPx = isSelected || isHovered ? 26 : 22;
				const iconSize = iconPx * invZoom;

				// Circular backdrop & ring matching official .world-map-poi
				ctx.save();
				ctx.beginPath();
				ctx.arc(p.x, p.z, iconSize / 2 + 1.5 * invZoom, 0, Math.PI * 2);
				ctx.fillStyle = isSelected
					? "rgba(56, 189, 248, 0.65)"
					: isHovered
						? "rgba(15, 23, 42, 0.9)"
						: "rgba(10, 13, 16, 0.65)";
				ctx.fill();
				ctx.strokeStyle = isSelected
					? "#38bdf8"
					: isHovered
						? "#f59e0b"
						: "rgba(255, 255, 255, 0.25)";
				ctx.lineWidth = (isSelected || isHovered ? 2.0 : 1.2) * invZoom;
				ctx.stroke();

				if (img && img.complete) {
					ctx.drawImage(
						img,
						p.x - iconSize / 2,
						p.z - iconSize / 2,
						iconSize,
						iconSize,
					);
				} else {
					ctx.beginPath();
					ctx.arc(p.x, p.z, iconSize / 2, 0, Math.PI * 2);
					ctx.fillStyle = "#38bdf8";
					ctx.fill();
				}
				ctx.restore();

				// On hover or selection only: show clean name pill
				if (isHovered || isSelected) {
					ctx.save();
					const fontSize = Math.max(12 * invZoom, 2.0);
					ctx.font = `600 ${fontSize}px Inter, system-ui, sans-serif`;
					ctx.textAlign = "center";
					ctx.textBaseline = "top";

					const labelY = p.z + iconSize / 2 + 3 * invZoom;
					const textWidth = ctx.measureText(p.name).width;
					const padX = 6 * invZoom;
					const padY = 3 * invZoom;

					ctx.fillStyle = "rgba(10, 13, 16, 0.92)";
					ctx.strokeStyle = isSelected
						? "#38bdf8"
						: "rgba(255, 255, 255, 0.2)";
					ctx.lineWidth = 1.0 * invZoom;
					ctx.beginPath();
					ctx.roundRect(
						p.x - textWidth / 2 - padX,
						labelY - padY,
						textWidth + padX * 2,
						fontSize + padY * 2,
						4 * invZoom,
					);
					ctx.fill();
					ctx.stroke();

					ctx.fillStyle = isSelected ? "#38bdf8" : "#f8fafc";
					ctx.fillText(p.name, p.x, labelY);
					ctx.restore();
				}
			}
		}

		// 5. Draw Region Labels (Official map uppercase display style)
		if (view.zoom >= 0.7 && view.zoom <= 8.0) {
			ctx.save();
			const fontSize =
				Math.min(22, Math.max(12, 10 + 2.5 * view.zoom)) * invZoom;
			ctx.font = `700 ${fontSize}px "Cinzel", "Times New Roman", Inter, serif`;
			ctx.textAlign = "center";
			ctx.textBaseline = "middle";

			const activeLabels =
				currentMap === "underground"
					? UNDERGROUND_REGION_LABELS
					: SURFACE_REGION_LABELS;
			for (const r of activeLabels) {
				const tile =
					currentMap === "underground"
						? { x: r.x, z: r.z }
						: worldToTile(r.x, r.z, activeMeta);

				if (tile.x < minX || tile.x > maxX || tile.z < minZ || tile.z > maxZ)
					continue;

				ctx.strokeStyle = "rgba(0, 0, 0, 0.85)";
				ctx.lineWidth = 3.6 * invZoom;
				ctx.strokeText(r.name, tile.x, tile.z);

				ctx.fillStyle =
					currentMap === "underground" ? "#fcd34d" : "#f4efe2";
				ctx.fillText(r.name, tile.x, tile.z);
			}
			ctx.restore();
		}
	}

	// Calculate object interaction center (for accurate tree canopy & rock hit detection)
	function getInteractionCenter(item: WorldNode | POI | NPCSpawn): {
		x: number;
		z: number;
	} {
		if ("category" in item) {
			const n = item as WorldNode;
			if (n.category === "woodcutting") {
				// Tree canopy center
				return { x: n.x, z: n.z - 0.38 * 4.2 };
			}
			if (n.category === "mining") {
				// Rock body center
				return { x: n.x, z: n.z - 0.22 * 3.6 };
			}
		}
		return { x: item.x, z: item.z };
	}

	function findItemNear(
		tileX: number,
		tileZ: number,
	): WorldNode | POI | NPCSpawn | null {
		const searchDist = 16 / view.zoom;

		// 1. POIs first
		if (showPOIs) {
			const nearestPoi = poiGrid.findNearest(tileX, tileZ, searchDist);
			if (nearestPoi) return nearestPoi.item;
		}

		// 2. Interactive Nodes
		const candidateNodes = nodeGrid.query(
			tileX - searchDist - 2,
			tileZ - searchDist - 3,
			tileX + searchDist + 2,
			tileZ + searchDist + 2,
		);

		let bestNode: WorldNode | null = null;
		let minDSq = searchDist * searchDist;

		for (const n of candidateNodes) {
			if (!activeCategories.has(n.category)) continue;
			if (n.subCategory && !activeSubcategories.has(n.subCategory))
				continue;

			const center = getInteractionCenter(n);
			const dx = center.x - tileX;
			const dz = center.z - tileZ;
			const dSq = dx * dx + dz * dz;

			if (dSq <= minDSq) {
				minDSq = dSq;
				bestNode = n;
			}
		}
		if (bestNode) return bestNode;

		// 3. NPCs
		if (showNPCs && view.zoom >= 2.0) {
			const nearestNpc = npcGrid.findNearest(tileX, tileZ, searchDist);
			if (nearestNpc) return nearestNpc.item;
		}

		return null;
	}

	// Pointer & interaction handlers
	function onPointerDown(e: PointerEvent) {
		if (!containerRef) return;
		(e.target as HTMLElement)?.setPointerCapture?.(e.pointerId);

		const rect = containerRef.getBoundingClientRect();
		const px = e.clientX - rect.left;
		const py = e.clientY - rect.top;

		pointers.set(e.pointerId, { x: px, y: py });

		if (pointers.size === 1) {
			isDragging = true;
			dragStart = {
				x: px,
				y: py,
				viewX: view.x,
				viewY: view.y,
				moved: false,
			};
			lastVelocity = { vx: 0, vy: 0, time: performance.now() };
		} else if (pointers.size === 2) {
			const [p1, p2] = Array.from(pointers.values());
			pinchStart = {
				dist: Math.hypot(p1.x - p2.x, p1.y - p2.y),
				midX: (p1.x + p2.x) / 2,
				midY: (p1.y + p2.y) / 2,
				zoom: view.zoom,
			};
		}
	}

	function onPointerMove(e: PointerEvent) {
		if (!containerRef) return;
		const rect = containerRef.getBoundingClientRect();
		const px = e.clientX - rect.left;
		const py = e.clientY - rect.top;

		if (pointers.has(e.pointerId)) {
			pointers.set(e.pointerId, { x: px, y: py });
		}

		// Two-finger pinch
		if (pointers.size === 2) {
			const [p1, p2] = Array.from(pointers.values());
			const currentDist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
			const currentMidX = (p1.x + p2.x) / 2;
			const currentMidY = (p1.y + p2.y) / 2;

			if (pinchStart.dist > 0) {
				const scaleFactor = currentDist / pinchStart.dist;
				const targetZoom = Math.min(
					16.0,
					Math.max(0.5, pinchStart.zoom * scaleFactor),
				);
				const zoomed = zoomAtScreenPoint(
					{ ...view, zoom: pinchStart.zoom },
					pinchStart.midX,
					pinchStart.midY,
					targetZoom,
				);
				view = clampViewport(
					{
						...zoomed,
						x: zoomed.x + (currentMidX - pinchStart.midX),
						y: zoomed.y + (currentMidY - pinchStart.midY),
					},
					activeMeta,
					rect.width,
					rect.height,
				);
			}
			return;
		}

		// Single pointer drag
		if (isDragging && pointers.size === 1) {
			const dx = px - dragStart.x;
			const dy = py - dragStart.y;

			if (!dragStart.moved && Math.hypot(dx, dy) > 4) {
				dragStart.moved = true;
			}

			if (dragStart.moved) {
				const now = performance.now();
				const dt = now - lastVelocity.time;
				if (dt > 10) {
					lastVelocity = {
						vx: (dx - (view.x - dragStart.viewX)) / dt,
						vy: (dy - (view.y - dragStart.viewY)) / dt,
						time: now,
					};
				}

				view = clampViewport(
					{
						...view,
						x: dragStart.viewX + dx,
						y: dragStart.viewY + dy,
					},
					activeMeta,
					rect.width,
					rect.height,
				);
			}
			return;
		}

		// Hover detection when not dragging
		const tile = screenToTile(px, py, view);
		cursorCoords = tileToWorld(tile.x, tile.z, activeMeta);

		const found = findItemNear(tile.x, tile.z);
		if (hoveredItem !== found) {
			hoveredItem = found;
			tooltipPos = found ? { x: px + 12, y: py + 12 } : null;
			requestAnimationFrame(drawMap);
		}
	}

	function onPointerUp(e: PointerEvent) {
		if (pointers.has(e.pointerId)) {
			pointers.delete(e.pointerId);
		}

		if (pointers.size === 0 && isDragging) {
			isDragging = false;
			if (!dragStart.moved) {
				handleClick(e);
			}
		}
	}

	function handleClick(e: MouseEvent | PointerEvent) {
		if (!containerRef) return;
		const rect = containerRef.getBoundingClientRect();
		const px = e.clientX - rect.left;
		const py = e.clientY - rect.top;

		const tile = screenToTile(px, py, view);
		const found = findItemNear(tile.x, tile.z);
		onSelectItem(found);
	}

	function onWheel(e: WheelEvent) {
		e.preventDefault();
		if (!containerRef) return;

		const rect = containerRef.getBoundingClientRect();
		const px = e.clientX - rect.left;
		const py = e.clientY - rect.top;

		const zoomFactor = e.deltaY < 0 ? 1.25 : 0.8;
		const newZoom = Math.min(16.0, Math.max(0.5, view.zoom * zoomFactor));

		const zoomed = zoomAtScreenPoint(view, px, py, newZoom);
		view = clampViewport(zoomed, activeMeta, rect.width, rect.height);
	}

	function onDoubleClick(e: MouseEvent) {
		if (!containerRef) return;
		const rect = containerRef.getBoundingClientRect();
		const px = e.clientX - rect.left;
		const py = e.clientY - rect.top;

		const factor = e.shiftKey ? 0.6 : 1.6;
		const newZoom = Math.min(16.0, Math.max(0.5, view.zoom * factor));
		const zoomed = zoomAtScreenPoint(view, px, py, newZoom);
		view = clampViewport(zoomed, activeMeta, rect.width, rect.height);
	}
</script>

<div
	bind:this={containerRef}
	class="map-canvas-container"
	onpointerdown={onPointerDown}
	onpointermove={onPointerMove}
	onpointerup={onPointerUp}
	onpointercancel={onPointerUp}
	onpointerleave={() => {
		hoveredItem = null;
		cursorCoords = null;
		tooltipPos = null;
	}}
	onwheel={onWheel}
	ondblclick={onDoubleClick}
	role="region"
	aria-label="Interactive world map canvas"
>
	<canvas bind:this={canvasRef} class="map-canvas"></canvas>

	<!-- Hover tooltip -->
	{#if hoveredItem && tooltipPos}
		<div
			class="map-tooltip"
			style="left: {tooltipPos.x}px; top: {tooltipPos.y}px;"
		>
			<strong class="tooltip-title">{hoveredItem.name}</strong>
			{#if "category" in hoveredItem}
				<span class="tooltip-category"
					>{hoveredItem.category.toUpperCase()}</span
				>
			{/if}
			{#if "harvest" in hoveredItem && hoveredItem.harvest?.outputItem}
				<span class="tooltip-drop"
					>Drops: {hoveredItem.harvest.outputItem}</span
				>
			{/if}
		</div>
	{/if}
</div>

<style>
	.map-canvas-container {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		overflow: hidden;
		background: #090c10;
		touch-action: none;
		user-select: none;
		cursor: grab;
	}

	.map-canvas-container:active {
		cursor: grabbing;
	}

	.map-canvas {
		display: block;
		width: 100%;
		height: 100%;
	}

	.map-tooltip {
		position: absolute;
		z-index: 60;
		pointer-events: none;
		background: rgba(15, 23, 42, 0.95);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		border: 1px solid rgba(255, 255, 255, 0.16);
		border-radius: 8px;
		padding: 6px 10px;
		display: flex;
		flex-direction: column;
		gap: 2px;
		color: #f8fafc;
		font-size: 12px;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
		transform: translate(4px, 4px);
		white-space: nowrap;
	}

	.tooltip-title {
		font-weight: 700;
		color: #ffffff;
	}

	.tooltip-category {
		font-size: 10px;
		font-weight: 700;
		color: #38bdf8;
		letter-spacing: 0.05em;
	}

	.tooltip-drop {
		font-size: 11px;
		color: #4ade80;
	}
</style>
