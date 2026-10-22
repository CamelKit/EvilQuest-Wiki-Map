export interface SpatialItem {
	x: number;
	z: number;
}

export class SpatialGrid<T extends SpatialItem> {
	private cellSize: number;
	private cells = new Map<number, T[]>();

	constructor(cellSize = 16) {
		this.cellSize = cellSize;
	}

	private key(cx: number, cz: number): number {
		return (cz + 4096) * 8192 + (cx + 4096);
	}

	public clear() {
		this.cells.clear();
	}

	public insert(item: T) {
		const cx = Math.floor(item.x / this.cellSize);
		const cz = Math.floor(item.z / this.cellSize);
		const k = this.key(cx, cz);
		let cell = this.cells.get(k);
		if (!cell) {
			cell = [];
			this.cells.set(k, cell);
		}
		cell.push(item);
	}

	public load(items: T[]) {
		this.clear();
		for (const it of items) {
			this.insert(it);
		}
	}

	public query(minX: number, minZ: number, maxX: number, maxZ: number): T[] {
		const startCx = Math.floor(minX / this.cellSize);
		const endCx = Math.floor(maxX / this.cellSize);
		const startCz = Math.floor(minZ / this.cellSize);
		const endCz = Math.floor(maxZ / this.cellSize);

		const result: T[] = [];
		for (let cz = startCz; cz <= endCz; cz++) {
			for (let cx = startCx; cx <= endCx; cx++) {
				const cell = this.cells.get(this.key(cx, cz));
				if (cell) {
					for (const item of cell) {
						if (item.x >= minX && item.x <= maxX && item.z >= minZ && item.z <= maxZ) {
							result.push(item);
						}
					}
				}
			}
		}
		return result;
	}

	public findNearest(x: number, z: number, maxDistance: number): { item: T; distSq: number } | null {
		const maxDistSq = maxDistance * maxDistance;
		const candidates = this.query(x - maxDistance, z - maxDistance, x + maxDistance, z + maxDistance);

		let best: { item: T; distSq: number } | null = null;
		let minD = maxDistSq;

		for (const item of candidates) {
			const dx = item.x - x;
			const dz = item.z - z;
			const dSq = dx * dx + dz * dz;
			if (dSq <= minD) {
				minD = dSq;
				best = { item, distSq: dSq };
			}
		}

		return best;
	}
}
