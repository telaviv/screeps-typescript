import roleHarvester from "roles/harvester";
import SourceManager from "./source-manager";

export default class SourcesManager {
    private room: Room;
    private sourceManagers: SourceManager[];

    constructor(room: Room) {
        this.room = room;
        this.sourceManagers = [];

        // Initialize sourceManagers array with SourceManager instances
        const sources = this.room.find(FIND_SOURCES);
        for (const source of sources) {
            const sourceManager = SourceManager.createFromSource(source);
            this.sourceManagers.push(sourceManager);
        }
    }

    public hasEnoughHarvesters(): boolean {
        for (const sourceManager of this.sourceManagers) {
            if (!sourceManager.hasEnoughHarvesters()) {
                console.log(`Source ${sourceManager.id} does not have enough harvesters`);
                return false;
            }
        }
        console.log(`Sources have enough harvesters`);
        return true;
    }

    public hasEnoughAuxHarvesters(): boolean {
        for (const sourceManager of this.sourceManagers) {
            if (!sourceManager.hasEnoughAuxHarvesters()) {
                console.log(`Source ${sourceManager.id} does not have enough aux harvesters`);
                return false;
            }
        }
        console.log(`Sources have enough aux harvesters`);
        return true;
    }

    public hasAllContainerHarvesters() {
        return this.sourceManagers.every((sourceManager) => sourceManager.hasStaticHarvester());
    }

    public getNextHarvesterMiningTarget(): { source: Id<Source>, pos: RoomPosition } | null {
        let source: Id<Source> | null = null
        let pos: RoomPosition | null = null;
        for (const sourceManager of this.sourceManagers) {
            if (!sourceManager.hasStaticHarvester()) {
                pos = sourceManager.containerPosition;
                source = sourceManager.id;
            }
        }
        if (pos && source) {
            return { source, pos }
        }
        for (const sourceManager of this.sourceManagers) {
            const positions = sourceManager.getAvailableHarvesterPositions()
            for (const position of positions) {
                pos = position
                source = sourceManager.id
            }
        }
        if (pos && source) {
            return { source, pos }
        }
        return null
    }

    public getNextAuxHarvesterMiningTarget(): { source: Id<Source>, pos: RoomPosition } | null {
        let source: Id<Source> | null = null
        let pos: RoomPosition | null = null;
        for (const sourceManager of this.sourceManagers) {
            const positions = sourceManager.getAvailableAuxHarvesterPositions()
            for (const position of positions) {
                pos = position
                source = sourceManager.id
            }
        }
        if (pos && source) {
            return { source, pos }
        }
        return null
    }

    public createHarvester(spawn: StructureSpawn): number {
        const target = this.getNextHarvesterMiningTarget()
        if (!target) {
            throw new Error("No available positions for harvester")
        }
        const { pos, source } = target
        const sourceManager = SourceManager.getById(source)
        return roleHarvester.create(spawn, pos, sourceManager.id);
    }
}
