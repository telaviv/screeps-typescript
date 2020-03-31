export default class SourceManager {
    readonly droppedEnergy: DroppedEnergy
    readonly id: Source<Id>
    static cache = new Map<number, SourceManager>()

    constructor(droppedEnergy: DroppedEnergy, id: Source<Id>) {
        this.droppedEnergy = droppedEnergy
        this.id = id
    }

    static create(memory: RoomSourceMemory) {
        const droppedEnergy = DroppedEnergy.get(memory.dropSpot)
        return new SourceManager(droppedEnergy, memory.id as Id<Source>)
    }

    static get(memory: RoomSourceMemory): SourceManager {
        const id = memory.id
        if (SourceManager.cache.has(id)) {
            return SourceManager.cache.get(id) as SourceManager
        }
        const sourceManager = SourceManager.create(memory)
        SourceManager.cache.set(id, sourceManager)
        return sourceManager
    }
}
